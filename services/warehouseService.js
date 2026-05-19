import prisma from '../models/prismaClient.js';
import redisService from './redisService.js';

class WarehouseService {
  async getWarehouses(filters = {}, page = 1, pageSize = 10) {
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
    const dbFilters = {};

    for (const field of filterFields) {
      if (filters[field]) {
        const values = parseMultiValue(filters[field]);
        if (values && values.length > 1) {
          // Multiple values: use OR logic with 'in' operator
          dbFilters[field] = { in: values, mode: 'insensitive' };
        } else if (values && values.length === 1) {
          // Single value: use partial match
          dbFilters[field] = { contains: values[0], mode: 'insensitive' };
        }
      }
    }

    // Special handling for address (always partial match, single value only)
    if (filters.address) {
      dbFilters.address = { contains: filters.address, mode: 'insensitive' };
    }

    // Numeric range filters
    // Budget (ratePerSqft)
    if (filters.minBudget || filters.maxBudget) {
      dbFilters.ratePerSqft = {};
      if (filters.minBudget) dbFilters.ratePerSqft.gte = filters.minBudget;
      if (filters.maxBudget) dbFilters.ratePerSqft.lte = filters.maxBudget;
    }

    // Clear height
    if (filters.minClearHeight || filters.maxClearHeight) {
      dbFilters.clearHeightFt = {};
      if (filters.minClearHeight) dbFilters.clearHeightFt.gte = filters.minClearHeight;
      if (filters.maxClearHeight) dbFilters.clearHeightFt.lte = filters.maxClearHeight;
    }

    // Store space filters for post-filtering (after DB query)
    const minSpace = filters.minSpace ? parseInt(filters.minSpace) : null;
    const maxSpace = filters.maxSpace ? parseInt(filters.maxSpace) : null;

    // Fire NOC availability filter (boolean)
    if (filters.fireNocAvailable !== undefined) {
      const fireNocValue = filters.fireNocAvailable === 'true' || filters.fireNocAvailable === true;
      dbFilters.warehouseData = {
        ...dbFilters.warehouseData,
        fireNocAvailable: fireNocValue
      };
    }

    // Has coordinates filter (boolean) - filter at database level for performance
    if (filters.hasCoordinates === 'true' || filters.hasCoordinates === true) {
      dbFilters.warehouseData = {
        ...dbFilters.warehouseData,
        latitude: { not: null },
        longitude: { not: null }
      };
    }

    // Has coordinates filter (boolean)
    if (filters.hasCoordinates !== undefined) {
      const hasCoordinatesValue = filters.hasCoordinates === 'true' || filters.hasCoordinates === true;
      if (hasCoordinatesValue) {
        dbFilters.warehouseData = {
          ...dbFilters.warehouseData,
          AND: [
            { latitude: { not: null } },
            { longitude: { not: null } }
          ]
        };
      }
    }

    // Always filter out warehouses with visibility set to false
    dbFilters.visibility = true;

    // Build cache key including filters AND space filters
    const filterKey = JSON.stringify({ ...dbFilters, minSpace, maxSpace });
    const cacheKey = `warehouses:v2:page:${page}:size:${pageSize}:filters:${filterKey}`;

    // Try to get data from Redis cache first
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

    console.log(`Cache MISS for key: ${cacheKey}`);

    // For space filters, we need to fetch more records and filter in-memory
    const needsSpaceFilter = minSpace !== null || maxSpace !== null;
    const fetchSize = needsSpaceFilter ? pageSize * 3 : pageSize;
    const fetchSkip = needsSpaceFilter ? Math.max(0, (page - 1) * pageSize * 2) : skip;

    // Fetch warehouses and total count
    const [warehouses, totalWarehouses] = await prisma.$transaction([
      prisma.warehouse.findMany({
        skip: fetchSkip,
        take: fetchSize,
        where: dbFilters,
        orderBy: { id: 'desc' },
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
          photosWebp: true,
          warehouseType: true,
          zone: true,
          contactPerson: true,
          googleLocation: true,
          warehouseData: {
            select: {
              fireNocAvailable: true,
              fireSafetyMeasures: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      }),
      prisma.warehouse.count({ where: dbFilters }),
    ]);

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

    let formattedWarehouses = warehouses.map(w => {
      const parsedPhotos = parsePhotoField(w.photos);
      const parsedPhotosWebp = parsePhotoField(w.photosWebp);
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
        photosWebp: parsedPhotosWebp,
        warehouseType: w.warehouseType,
        zone: w.zone,
        contactPerson: w.contactPerson,
        googleLocation: w.googleLocation,
        latitude: w.warehouseData?.latitude,
        longitude: w.warehouseData?.longitude,
        fireNocAvailable: w.warehouseData?.fireNocAvailable,
        fireSafetyMeasures: w.warehouseData?.fireSafetyMeasures,
      };
    });

    // Post-filter by totalSpaceSqft array if space filters are provided
    if (minSpace !== null || maxSpace !== null) {
      formattedWarehouses = formattedWarehouses.filter(warehouse => {
        const spaces = warehouse.totalSpaceSqft || [];
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

    // Cache the result
    try {
      const cacheTTL = parseInt(process.env.CACHE_TTL) || 300;
      await redisService.setEx(cacheKey, cacheTTL, JSON.stringify(responseData));
      console.log(`Cached data with key: ${cacheKey} for ${cacheTTL} seconds`);
    } catch (cacheError) {
      console.log('Cache write error:', cacheError);
    }

    return responseData;
  }

  async clearWarehouseCache() {
    const stream = redisService.scanIterator({
      TYPE: 'string',
      MATCH: 'warehouses:*',
      COUNT: 100
    });

    const keys = [];
    for await (const key of stream) {
      keys.push(key);
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