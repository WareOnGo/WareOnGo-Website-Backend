import express from 'express';
import { getWarehouseById } from '../controllers/warehouseController.js';

const router = express.Router();

router.get('/:id', getWarehouseById);

export default router;