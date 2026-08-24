import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import redisService from './services/redisService.js';
import prisma from './models/prismaClient.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for reverse proxies
app.set('trust proxy', 1);

// Initialize services
await redisService.connect();

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
}));
app.use(express.json());

// Mount routes
import enquiryRoutes from './routes/enquiryRoutes.js';
import customerRequestRoutes from './routes/customerRequestRoutes.js';
import authRoutes from './routes/auth.js';
import warehouseRoutes from './routes/warehouseRoutes.js';
import cacheRoutes from './routes/cacheRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import blogRoutes from './routes/blogRoutes.js';

app.use('/health', healthRoutes);
app.use('/blogs', blogRoutes);
// Legacy alias. The website build and any cached client still ask for /guides;
// keeping both mounted means the rename can't half-land and break a deploy.
// Safe to delete once nothing requests it — check the access logs first.
app.use('/guides', blogRoutes);
app.use('/enquiries', enquiryRoutes);
app.use('/customer-requests', customerRequestRoutes);
app.use('/api/auth', authRoutes);
app.use('/warehouses', warehouseRoutes);
app.use('/cache', cacheRoutes);

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
      await redisService.quit();
      await prisma.$disconnect();
      console.log('Connections closed.');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

