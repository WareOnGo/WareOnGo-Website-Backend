import express from 'express';
import { getWarehouseById, getWarehouses, clearWarehouseCache } from '../controllers/warehouseController.js';

const router = express.Router();

router.get('/', getWarehouses);
router.get('/:id', getWarehouseById);

export default router;