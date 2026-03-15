import prisma from '../models/prismaClient.js';
import redisService from './redisService.js';

class HealthService {
  async checkHealth() {
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
      await redisService.ping();
      healthCheck.services.redis = 'OK';
    } catch (redisError) {
      healthCheck.services.redis = 'ERROR';
      healthCheck.status = 'DEGRADED';
      console.error('Redis health check failed:', redisError);
    }

    return healthCheck;
  }
}

export default new HealthService();