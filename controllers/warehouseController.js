import prisma from '../models/prismaClient.js';
import { sanitizeForJSON } from '../utils/serialize.js';
import warehouseService from '../services/warehouseService.js';

export async function getWarehouses(req, res) {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // Extract filters from query parameters
    const filters = {
      city: req.query.city,
      state: req.query.state,
      warehouseType: req.query.warehouseType,
      zone: req.query.zone,
      contactPerson: req.query.contactPerson,
      compliances: req.query.compliances,
      address: req.query.address,
      minBudget: req.query.minBudget,
      maxBudget: req.query.maxBudget,
      minClearHeight: req.query.minClearHeight,
      maxClearHeight: req.query.maxClearHeight,
      minSpace: req.query.minSpace,
      maxSpace: req.query.maxSpace,
      fireNocAvailable: req.query.fireNocAvailable
    };

    const result = await warehouseService.getWarehouses(filters, page, pageSize);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouses.' });
  }
}

export async function clearWarehouseCache(req, res) {
  try {
    const result = await warehouseService.clearWarehouseCache();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
}

export async function getWarehouseById(req, res) {
  try {
    const { id } = req.params;

    // Validate warehouse ID parameter
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid warehouse ID format' });
    }

    const warehouseId = parseInt(id);

    // Check if Prisma warehouse model is available
    if (!prisma.warehouse) {
      console.error('Prisma client does not have `warehouse` model. Did you run `prisma generate`?');
      return res.status(500).json({ error: 'Server misconfiguration: warehouse model not available' });
    }

    // Query database for warehouse with related WarehouseData (only visible warehouses)
    const warehouse = await prisma.warehouse.findUnique({
      where: {
        id: warehouseId,
        visibility: true
      },
      include: {
        warehouseData: {
          select: {
            fireNocAvailable: true,
            fireSafetyMeasures: true,
          }
        }
      }
    });

    // Handle warehouse not found or not visible
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Parse photos JSON field to array format
    let parsedPhotos = [];
    if (warehouse.photos) {
      // Check if it's already a valid JSON string
      if (warehouse.photos.startsWith('[') || warehouse.photos.startsWith('{')) {
        try {
          parsedPhotos = JSON.parse(warehouse.photos);
          // Ensure it's always an array
          if (!Array.isArray(parsedPhotos)) {
            parsedPhotos = [parsedPhotos];
          }
        } catch (error) {
          // If JSON parsing fails, treat as single photo string
          parsedPhotos = [warehouse.photos];
        }
      } else {
        // If it doesn't look like JSON, treat as single photo string
        parsedPhotos = [warehouse.photos];
      }
    }

    // Format response with parsed photos and related data (excluding contact info for privacy)
    const response = {
      id: warehouse.id,
      address: warehouse.address,
      numberOfDocks: warehouse.numberOfDocks,
      totalSpaceSqft: warehouse.totalSpaceSqft,
      clearHeightFt: warehouse.clearHeightFt,
      city: warehouse.city,
      state: warehouse.state,
      postalCode: warehouse.postalCode,
      photos: parsedPhotos,
      warehouseType: warehouse.warehouseType,
      zone: warehouse.zone,
      compliances: warehouse.compliances,
      otherSpecifications: warehouse.otherSpecifications,
      ratePerSqft: warehouse.ratePerSqft,
      googleLocation: warehouse.googleLocation,
      // Include WarehouseData fields if available
      fireNocAvailable: warehouse.warehouseData?.fireNocAvailable || null,
      fireSafetyMeasures: warehouse.warehouseData?.fireSafetyMeasures || null
    };

    res.status(200).json(sanitizeForJSON(response));
  } catch (error) {
    console.error('Error fetching warehouse details:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouse details' });
  }
}