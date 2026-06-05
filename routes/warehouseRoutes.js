import express from 'express';
import { getWarehouseById, getWarehouses, getWarehouseSpecifications, clearWarehouseCache } from '../controllers/warehouseController.js';

const router = express.Router();

router.get('/', getWarehouses);
// Declared before /:id so the more specific path is matched first.
router.get('/:id/specifications', getWarehouseSpecifications);
router.get('/:id', getWarehouseById);

export default router;