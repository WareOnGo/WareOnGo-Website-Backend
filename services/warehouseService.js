import pipeline from './imagePipelineRepository.cjs';
import prisma from '../models/prismaClient.js';
import redisService from './redisService.js';
import { readWarehouseQuery, warehouseQueries } from './warehouseListingQuery.js';

// Blur coordinates to 2 decimal places (~1.1 km) — enough to place a listing
// in its micro-market without revealing the exact plot.
const roundCoord = (value) =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : null;

class WarehouseService {
  async getWarehouses(input = {}, requestedPage = 1, requestedSize = 10, { bypassCache = false } = {}) {
    const query = readWarehouseQuery(input, requestedPage, requestedSize);
    const { filters, page, pageSize } = query;
    // Separate image-aware responses from cached payloads from older releases.
    const cacheKey = `warehouses:v8-images:page:${page}:size:${pageSize}:filters:${JSON.stringify(filters)}`;

    // Try to get data from Redis cache first
    if (!bypassCache) {
      try {
        const cachedData = await redisService.get(cacheKey);
        if (cachedData) {
          console.log(`Cache HIT for key: ${cacheKey}`);
          return JSON.parse(cachedData);
        }
      } catch (cacheError) {
        console.log('Cache read error:', cacheError);
        // Continue with database query if cache fails
      }
    }

    console.log(`Cache ${bypassCache ? 'BYPASS' : 'MISS'} for key: ${cacheKey}`);

    const { rows, count } = warehouseQueries(query);
    // Count and page observe one snapshot, including if a listing is updated
    // between these reads. Both filter before LIMIT/OFFSET in PostgreSQL.
    const [warehouses, [{ total: totalWarehouses }]] = await prisma.$transaction([
      prisma.$queryRaw(rows), prisma.$queryRaw(count),
    ], { isolationLevel: 'RepeatableRead' });

    const imageMap = await new pipeline.ImagePipelineRepository(prisma).readImages(warehouses);

    // Format the warehouse data
    const parsePhotoField = (raw) => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [raw];
      }
    };

    const formattedWarehouses = warehouses.map(w => {
      const parsedPhotos = parsePhotoField(w.photos);
      const parsedPhotosWebp = parsePhotoField(w.photosWebp);
      return {
        id: w.id,
        address: w.address,
        city: w.city,
        state: w.state,
        // Match Prisma's scalar-list decoding for older null array columns.
        totalSpaceSqft: w.totalSpaceSqft ?? [],
        clearHeightFt: w.clearHeightFt,
        compliances: w.compliances,
        otherSpecifications: w.otherSpecifications,
        ratePerSqft: w.ratePerSqft,
        photos: parsedPhotos,
        photosWebp: parsedPhotosWebp,
        images: imageMap.get(w.id),
        warehouseType: w.warehouseType,
        zone: w.zone,
        numberOfDocks: w.numberOfDocks,
        flooringType: w.flooringType,
        // Locality tags (String[]). Emitted raw — the frontend decides which
        // values are page-worthy (see src/loaders/locationLoader.ts).
        micromarket: Array.isArray(w.micromarket) ? w.micromarket : [],
        // Prisma @updatedAt (status_updated_at) — exposed as updatedAt so the
        // sitemap can emit honest <lastmod> values.
        updatedAt: w.statusUpdatedAt,
        // Coordinates blurred to 2 decimals (~1.1 km) — micro-market without
        // the exact plot.
        latitude: roundCoord(w.warehouseData?.latitude),
        longitude: roundCoord(w.warehouseData?.longitude),
        fireNocAvailable: w.warehouseData?.fireNocAvailable,
        fireSafetyMeasures: w.warehouseData?.fireSafetyMeasures,
      };
    });

    const totalPages = Math.ceil(totalWarehouses / pageSize);

    const responseData = {
      data: formattedWarehouses,
      pagination: {
        totalItems: totalWarehouses,
        totalPages,
        currentPage: page,
        pageSize,
      },
    };

    // Cache the result
    if (!bypassCache) {
      try {
        const cacheTTL = parseInt(process.env.CACHE_TTL) || 300;
        await redisService.setEx(cacheKey, cacheTTL, JSON.stringify(responseData));
        console.log(`Cached data with key: ${cacheKey} for ${cacheTTL} seconds`);
      } catch (cacheError) {
        console.log('Cache write error:', cacheError);
      }
    }

    return responseData;
  }

  async clearWarehouseCache() {
    const stream = await redisService.scanIterator({
      TYPE: 'string',
      MATCH: 'warehouses:*',
      COUNT: 100
    });

    const keys = [];
    // node-redis v5 scanIterator yields batches (arrays of keys) per iteration;
    // v4 yielded single keys. Handle both shapes.
    for await (const batch of stream) {
      keys.push(...(Array.isArray(batch) ? batch : [batch]));
    }

    if (keys.length > 0) {
      await redisService.del(keys);
      console.log(`Cleared ${keys.length} cache entries using SCAN`);
      return {
        message: 'Cache cleared successfully',
        clearedKeys: keys.length
      };
    } else {
      return {
        message: 'No cache entries found to clear'
      };
    }
  }
}

export default new WarehouseService();
