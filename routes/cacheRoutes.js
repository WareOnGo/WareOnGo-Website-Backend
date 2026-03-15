import express from 'express';
import { clearWarehouseCache } from '../controllers/warehouseController.js';

const router = express.Router();

router.delete('/warehouses', clearWarehouseCache);

export default router;