import prisma from '../models/prismaClient.js';
import redis from './redisService.js';
import warehouses from './warehouseService.js';
import { compressionConfig, createPhotoStore, compressWarehousePhotos, warehousePhotoRepository } from './webpCompression.js';
import { createWebpJob } from './webpJob.js';

export const webpConfigured = () => {
  try { compressionConfig(); return true; } catch { return false; }
};

export const warehouseWebpJob = createWebpJob({
  getRedis: () => redis.connect(),
  run: options => compressWarehousePhotos({
    ...options,
    repository: warehousePhotoRepository(prisma),
    store: createPhotoStore(compressionConfig()),
    clearCache: () => warehouses.clearWarehouseCache(),
  }),
});
