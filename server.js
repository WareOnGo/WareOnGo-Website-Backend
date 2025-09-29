import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

// Initialize Express app and Prisma Client
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'https://wareongo.com',
    'http://localhost:8080', // For local development
    'http://localhost:3000', // For local development
    'http://localhost:5173', // For Vite dev server
    'http://localhost:4173'  // For Vite preview
  ],
  credentials: true
})); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Enable JSON body parsing

/**
 * @route   GET /warehouses
 * @desc    Get a paginated list of warehouses with selected fields
 * @access  Public
 * @query   page (number): The page number to retrieve. Defaults to 1.
 * @query   pageSize (number): The number of items per page. Defaults to 10.
 */
app.get('/warehouses', async (req, res) => {
  try {
    // Get page and pageSize from query params, providing default values
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

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

    // Send the paginated data along with pagination metadata
    res.status(200).json({
      data: formattedWarehouses,
      pagination: {
        totalItems: totalWarehouses,
        totalPages,
        currentPage: page,
        pageSize,
      },
    });
  } catch (error) {
    // Log any errors and send a 500 server error response
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouses.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

