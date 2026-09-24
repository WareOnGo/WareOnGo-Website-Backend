import { compressWebpPipeline, webpPipelineRepository } from './webpPipeline.js';
import prisma from '../models/prismaClient.js';
import redis from './redisService.js';
import warehouses from './warehouseService.js';
import { compressionConfig, createPhotoStore } from './webpCompression.js';
import { createWebpJob } from './webpJob.js';

export const webpConfigured = () => {
  try { compressionConfig(); return true; } catch { return false; }
};

export const warehouseWebpJob = createWebpJob({
  getRedis: () => redis.connect(),
  run: options => compressWebpPipeline({
    ...options, repository: webpPipelineRepository(prisma), store: createPhotoStore(compressionConfig()),
    clearCache: () => warehouses.clearWarehouseCache(),
  }),
});
