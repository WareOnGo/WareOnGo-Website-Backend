import express from 'express';
import prisma from './models/prismaClient.js';
import cors from 'cors';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for Render, Heroku, and other platforms behind reverse proxies
// This allows Express to correctly identify client IPs from X-Forwarded-For header
app.set('trust proxy', 1);

// Initialize Redis client
const redis = createClient({
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379
    }
});

redis.on('error', err => console.log('Redis Client Error', err));
redis.on('connect', () => console.log('Connected to Redis'));

// Connect to Redis
redis.connect().catch(console.error);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
    'https://wareongo.com',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173'
  ],
  credentials: true
})); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Enable JSON body parsing

// Mount MVC routers
import enquiryRoutes from './routes/enquiryRoutes.js';
import customerRequestRoutes from './routes/customerRequestRoutes.js';
import authRoutes from './routes/auth.js';

app.use('/enquiries', enquiryRoutes);
app.use('/customer-requests', customerRequestRoutes);
app.use('/api/auth', authRoutes);

/**
 * @route   GET /health
 * @desc    Health check endpoint to verify server, database, and Redis connectivity
 * @access  Public
 */
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      server: 'OK',
      database: 'CHECKING',
      redis: 'CHECKING'
    }
  };

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.services.database = 'OK';
  } catch (dbError) {
    healthCheck.services.database = 'ERROR';
    healthCheck.status = 'DEGRADED';
    console.error('Database health check failed:', dbError);
  }

  try {
    // Test Redis connection
    await redis.ping();
    healthCheck.services.redis = 'OK';
  } catch (redisError) {
    healthCheck.services.redis = 'ERROR';
    healthCheck.status = 'DEGRADED';
    console.error('Redis health check failed:', redisError);
  }

  // Set appropriate HTTP status code
  const statusCode = healthCheck.status === 'OK' ? 200 : 503;
  
  res.status(statusCode).json(healthCheck);
});


// POST endpoints are implemented in the MVC routers mounted above.

/**
 * @route   GET /warehouses
 * @desc    Get a paginated list of warehouses with selected fields (with Redis caching)
 * @access  Public
 * @query   page (number): The page number to retrieve. Defaults to 1.
 * @query   pageSize (number): The number of items per page. Defaults to 10.
 */
app.get('/warehouses', async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // Helper function to parse multiple values (comma-separated or multiple params)
    const parseMultiValue = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value;
      return value.includes(',') ? value.split(',').map(v => v.trim()) : [value];
    };

    // String filters supporting multiple values (OR logic within same field)
    const filterFields = [
      'city', 'state', 'warehouseType', 'zone', 'contactPerson', 'compliances'
    ];
    const filters = {};
    
    for (const field of filterFields) {
      if (req.query[field]) {
        const values = parseMultiValue(req.query[field]);
        if (values && values.length > 1) {
          // Multiple values: use OR logic with 'in' operator
          filters[field] = { in: values, mode: 'insensitive' };
        } else if (values && values.length === 1) {
          // Single value: use partial match
          filters[field] = { contains: values[0], mode: 'insensitive' };
        }
      }
    }

    // Special handling for address (always partial match, single value only)
    if (req.query.address) {
      filters.address = { contains: req.query.address, mode: 'insensitive' };
    }

    // Numeric range filters
    // Budget (ratePerSqft)
    if (req.query.minBudget || req.query.maxBudget) {
      filters.ratePerSqft = {};
      if (req.query.minBudget) filters.ratePerSqft.gte = req.query.minBudget;
      if (req.query.maxBudget) filters.ratePerSqft.lte = req.query.maxBudget;
    }
    
    // Clear height
    if (req.query.minClearHeight || req.query.maxClearHeight) {
      filters.clearHeightFt = {};
      if (req.query.minClearHeight) filters.clearHeightFt.gte = req.query.minClearHeight;
      if (req.query.maxClearHeight) filters.clearHeightFt.lte = req.query.maxClearHeight;
    }

    // Store space filters for post-filtering (after DB query)
    // We'll filter in-memory because Prisma doesn't support range queries on array elements well
    const minSpace = req.query.minSpace ? parseInt(req.query.minSpace) : null;
    const maxSpace = req.query.maxSpace ? parseInt(req.query.maxSpace) : null;

    // Fire NOC availability filter (boolean)
    if (req.query.fireNocAvailable !== undefined) {
      const fireNocValue = req.query.fireNocAvailable === 'true' || req.query.fireNocAvailable === true;
      filters.warehouseData = {
        ...filters.warehouseData,
        fireNocAvailable: fireNocValue
      };
    }

    // Build cache key including filters AND space filters
    const filterKey = JSON.stringify({ ...filters, minSpace, maxSpace });
    const cacheKey = `warehouses:page:${page}:size:${pageSize}:filters:${filterKey}`;

    // Try to get data from Redis cache first
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`Cache HIT for key: ${cacheKey}`);
        return res.status(200).json(JSON.parse(cachedData));
      }
    } catch (cacheError) {
      console.log('Cache read error:', cacheError);
      // Continue with database query if cache fails
    }

    console.log(`Cache MISS for key: ${cacheKey}`);

    // For space filters, we need to fetch more records and filter in-memory
    // Calculate how many extra records we might need
    const needsSpaceFilter = minSpace !== null || maxSpace !== null;
    const fetchSize = needsSpaceFilter ? pageSize * 3 : pageSize; // Fetch 3x for buffer
    const fetchSkip = needsSpaceFilter ? Math.max(0, (page - 1) * pageSize * 2) : skip;

    // Fetch a paginated, filtered subset of warehouses and the total count in a single transaction
    const [warehouses, totalWarehouses] = await prisma.$transaction([
      prisma.warehouse.findMany({
        skip: fetchSkip,
        take: fetchSize,
        where: Object.keys(filters).length > 0 ? filters : undefined,
        orderBy: {
          id: 'desc',
        },
        select: {
          id: true,
          address: true,
          city: true,
          state: true,
          totalSpaceSqft: true,
          clearHeightFt: true,
          compliances: true,
          otherSpecifications: true,
          ratePerSqft: true,
          photos: true,
          warehouseType: true,
          zone: true,
          contactPerson: true,
          warehouseData: {
            select: {
              fireNocAvailable: true,
              fireSafetyMeasures: true,
            },
          },
        },
      }),
      prisma.warehouse.count({ where: Object.keys(filters).length > 0 ? filters : undefined }),
    ]);

    // Format the warehouse data to be flat
    let formattedWarehouses = warehouses.map(w => {
      let parsedPhotos = [];
      if (w.photos) {
        try {
          parsedPhotos = JSON.parse(w.photos);
          if (!Array.isArray(parsedPhotos)) {
            parsedPhotos = [parsedPhotos];
          }
        } catch (error) {
          parsedPhotos = [w.photos];
        }
      }
      return {
        id: w.id,
        address: w.address,
        city: w.city,
        state: w.state,
        totalSpaceSqft: w.totalSpaceSqft,
        clearHeightFt: w.clearHeightFt,
        compliances: w.compliances,
        otherSpecifications: w.otherSpecifications,
        ratePerSqft: w.ratePerSqft,
        photos: parsedPhotos,
        warehouseType: w.warehouseType,
        zone: w.zone,
        contactPerson: w.contactPerson,
        fireNocAvailable: w.warehouseData?.fireNocAvailable,
        fireSafetyMeasures: w.warehouseData?.fireSafetyMeasures,
      };
    });

    // Post-filter by totalSpaceSqft array if space filters are provided
    if (minSpace !== null || maxSpace !== null) {
      formattedWarehouses = formattedWarehouses.filter(warehouse => {
        const spaces = warehouse.totalSpaceSqft || [];
        // Check if ANY space value in the array meets the criteria
        return spaces.some(space => {
          if (minSpace !== null && maxSpace !== null) {
            return space >= minSpace && space <= maxSpace;
          } else if (minSpace !== null) {
            return space >= minSpace;
          } else if (maxSpace !== null) {
            return space <= maxSpace;
          }
          return true;
        });
      });
    }

    // Apply pagination to filtered results
    const startIndex = needsSpaceFilter ? (page - 1) * pageSize : 0;
    const paginatedWarehouses = needsSpaceFilter 
      ? formattedWarehouses.slice(startIndex, startIndex + pageSize)
      : formattedWarehouses;

    // Recalculate total count if space filter was applied
    const finalTotalCount = needsSpaceFilter ? formattedWarehouses.length : totalWarehouses;
    const totalPages = Math.ceil(finalTotalCount / pageSize);
    const responseData = {
      data: paginatedWarehouses,
      pagination: {
        totalItems: finalTotalCount,
        totalPages,
        currentPage: page,
        pageSize,
      },
    };

    // Cache the result in Redis with TTL-based expiration
    try {
      const cacheTTL = parseInt(process.env.CACHE_TTL) || 300;
      await redis.setEx(cacheKey, cacheTTL, JSON.stringify(responseData));
      console.log(`Cached data with key: ${cacheKey} for ${cacheTTL} seconds`);
    } catch (cacheError) {
      console.log('Cache write error:', cacheError);
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouses.' });
  }
});

/**
 * @route   DELETE /cache/warehouses
 * @desc    Clear warehouse cache using SCAN (production-safe, non-blocking)
 * @access  Public (you might want to add authentication in production)
 */
app.delete('/cache/warehouses', async (req, res) => {
  try {
    const stream = redis.scanIterator({
      TYPE: 'string',        // Scans for string keys
      MATCH: 'warehouses:*', // The pattern to match
      COUNT: 100             // How many keys to fetch per iteration
    });
    
    // Collect all keys from the iterator
    const keys = [];
    for await (const key of stream) {
      keys.push(key);
    }

    if (keys.length > 0) {
      await redis.del(keys);
      console.log(`Cleared ${keys.length} cache entries using SCAN`);
      res.status(200).json({ 
        message: 'Cache cleared successfully', 
        clearedKeys: keys.length 
      });
    } else {
      res.status(200).json({ 
        message: 'No cache entries found to clear' 
      });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Export the app for tests
export default app;

// Start the server when run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    try {
      await redis.quit();
      await prisma.$disconnect();
      console.log('Connections closed.');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

