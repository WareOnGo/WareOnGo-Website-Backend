import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app and Prisma Client
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

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

/**
 * @route   GET /warehouses
 * @desc    Get a paginated list of warehouses with selected fields (with Redis caching)
 * @access  Public
 * @query   page (number): The page number to retrieve. Defaults to 1.
 * @query   pageSize (number): The number of items per page. Defaults to 10.
 */
app.get('/warehouses', async (req, res) => {
  try {
    // Get page and pageSize from query params, providing default values
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // Create cache key based on query parameters
    const cacheKey = `warehouses:page:${page}:size:${pageSize}`;
    
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

    // Calculate the number of records to skip
    const skip = (page - 1) * pageSize;

    // Fetch a paginated subset of warehouses and the total count in a single transaction
    const [warehouses, totalWarehouses] = await prisma.$transaction([
      prisma.warehouse.findMany({
        skip: skip,
        take: pageSize,
        orderBy: {
          id: 'desc', // Order the results by warehouse ID in descending order
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
          warehouseData: {
            select: {
              fireNocAvailable: true,
              fireSafetyMeasures: true,
            },
          },
        },
      }),
      prisma.warehouse.count(), // Get the total number of warehouses
    ]);

    // Format the warehouse data to be flat
    const formattedWarehouses = warehouses.map(w => {
      // Parse photos from JSON string to array, handle cases where it might be null or invalid JSON
      let parsedPhotos = [];
      if (w.photos) {
        try {
          parsedPhotos = JSON.parse(w.photos);
          // Ensure it's an array, if not make it an array
          if (!Array.isArray(parsedPhotos)) {
            parsedPhotos = [parsedPhotos];
          }
        } catch (error) {
          // If JSON parsing fails, treat as a single photo URL string
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
        fireNocAvailable: w.warehouseData?.fireNocAvailable,
        fireSafetyMeasures: w.warehouseData?.fireSafetyMeasures,
      };
    });

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalWarehouses / pageSize);

    // Prepare response data
    const responseData = {
      data: formattedWarehouses,
      pagination: {
        totalItems: totalWarehouses,
        totalPages,
        currentPage: page,
        pageSize,
      },
    };

    // Cache the result in Redis with TTL-based expiration
    try {
      const cacheTTL = parseInt(process.env.CACHE_TTL) || 300; // Default 5 minutes
      await redis.setEx(cacheKey, cacheTTL, JSON.stringify(responseData));
      console.log(`Cached data with key: ${cacheKey} for ${cacheTTL} seconds`);
    } catch (cacheError) {
      console.log('Cache write error:', cacheError);
      // Continue without caching if Redis fails
    }

    // Send the paginated data along with pagination metadata
    res.status(200).json(responseData);
  } catch (error) {
    // Log any errors and send a 500 server error response
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouses.' });
  }
});

/**
 * @route   DELETE /cache/warehouses
 * @desc    Clear warehouse cache (useful when data is updated)
 * @access  Public (you might want to add authentication in production)
 */
app.delete('/cache/warehouses', async (req, res) => {
  try {
    // Get all keys matching the warehouse cache pattern
    const keys = await redis.keys('warehouses:*');
    
    if (keys.length > 0) {
      await redis.del(keys);
      console.log(`Cleared ${keys.length} cache entries`);
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

// Start the server
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

