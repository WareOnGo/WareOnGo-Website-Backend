import prisma from '../models/prismaClient.js';
import { sanitizeForJSON } from '../utils/serialize.js';
import warehouseService from '../services/warehouseService.js';

// Blur coordinates to 2 decimal places (~1.1 km) — enough to place a listing
// in its micro-market without revealing the exact plot.
const roundCoord = (value) =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : null;

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
      fireNocAvailable: req.query.fireNocAvailable,
      hasCoordinates: req.query.hasCoordinates
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

export async function getWarehouseSpecifications(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid warehouse ID format' });
    }

    const warehouseId = parseInt(id);

    // Explicit select whitelist — sensitive columns (owner/contact details,
    // latitude/longitude, googleLocation, embedding, internal commercials like
    // negotiated_rent) are never selected, so they can't leak via this endpoint.
    const warehouse = await prisma.warehouse.findUnique({
      where: {
        id: warehouseId,
        visibility: true,
      },
      select: {
        id: true,
        // Site
        land_parcel_size: true,
        builtup_area: true,
        carpet_area: true,
        setbackArea: true,
        distance_from_highway: true,
        nearest_transport: true,
        ccRoads: true,
        wallAndSecurityRoom: true,
        // Structure
        plinthHeightFt: true,
        centreHeight: true,
        flooringType: true,
        floorStrengthPerSqm: true,
        // Docking
        gateSizeFt: true,
        dockApronLengthFt: true,
        dockDimension: true,
        dockPlatformType: true,
        canopyType: true,
        otherDockingSpecs: true,
        // Utilities & interiors
        ventilationType: true,
        ventilationAirChangesPerDay: true,
        insulationPresent: true,
        insulationType: true,
        lightingDetails: true,
        washroom_count: true,
        // Fire & compliance
        fire_exits: true,
        fire_compliance_cert_type: true,
        // Verification badge
        wogVerified: true,
        // Related spec table (1:1) — same whitelist principle; latitude,
        // longitude and embedding are deliberately not selected.
        warehouseData: {
          select: {
            fireNocAvailable: true,
            fireSafetyMeasures: true,
            landType: true,
            approachRoadWidth: true,
            dimensions: true,
            parkingDockingSpace: true,
            pollutionZone: true,
            powerKva: true,
            vaastuCompliance: true,
          },
        },
      },
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    const { warehouseData, ...warehouseSpecs } = warehouse;

    // Flatten the 1:1 relation into one specifications object.
    const response = {
      ...warehouseSpecs,
      ...(warehouseData ?? {}),
    };

    res.status(200).json(sanitizeForJSON(response));
  } catch (error) {
    console.error('Error fetching warehouse specifications:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouse specifications' });
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

    // Query database for warehouse with related WarehouseData (only visible
    // warehouses). Strict select whitelist — owner/contact columns and other
    // sensitive fields are never fetched from the DB, not just omitted from
    // the response.
    const warehouse = await prisma.warehouse.findUnique({
      where: {
        id: warehouseId,
        visibility: true
      },
      select: {
        id: true,
        address: true,
        numberOfDocks: true,
        totalSpaceSqft: true,
        clearHeightFt: true,
        city: true,
        state: true,
        postalCode: true,
        photos: true,
        photosWebp: true,
        warehouseType: true,
        zone: true,
        compliances: true,
        otherSpecifications: true,
        ratePerSqft: true,
        statusUpdatedAt: true,
        warehouseData: {
          select: {
            fireNocAvailable: true,
            fireSafetyMeasures: true,
            latitude: true,
            longitude: true,
          }
        }
      }
    });

    // Handle warehouse not found or not visible
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Parse photos / photosWebp JSON field to array format
    const parsePhotoField = (raw) => {
      if (!raw) return [];
      const trimmed = typeof raw === 'string' ? raw.trim() : raw;
      if (typeof trimmed === 'string' && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [trimmed];
        }
      }
      return [trimmed];
    };
    const parsedPhotos = parsePhotoField(warehouse.photos);
    const parsedPhotosWebp = parsePhotoField(warehouse.photosWebp);

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
      photosWebp: parsedPhotosWebp,
      warehouseType: warehouse.warehouseType,
      zone: warehouse.zone,
      compliances: warehouse.compliances,
      otherSpecifications: warehouse.otherSpecifications,
      ratePerSqft: warehouse.ratePerSqft,
      // Prisma @updatedAt (status_updated_at) — exposed as updatedAt so the
      // frontend can emit honest sitemap <lastmod> and schema dateModified.
      updatedAt: warehouse.statusUpdatedAt,
      // googleLocation deliberately omitted — exact-pin URL is sensitive and
      // unused by the frontend (the map geocodes from the address instead).
      // Coordinates are rounded to 2 decimals (~1.1 km) so the micro-market is
      // conveyed without exposing the exact plot.
      latitude: roundCoord(warehouse.warehouseData?.latitude),
      longitude: roundCoord(warehouse.warehouseData?.longitude),
      fireNocAvailable: warehouse.warehouseData?.fireNocAvailable || null,
      fireSafetyMeasures: warehouse.warehouseData?.fireSafetyMeasures || null
    };

    res.status(200).json(sanitizeForJSON(response));
  } catch (error) {
    console.error('Error fetching warehouse details:', error);
    res.status(500).json({ error: 'An error occurred while fetching warehouse details' });
  }
}