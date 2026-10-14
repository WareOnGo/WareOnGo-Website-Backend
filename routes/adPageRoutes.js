import { Router } from 'express';
import { getAdPages, getMicromarketAdPages } from '../controllers/adPageController.js';

const router = Router();
router.get('/micromarkets', getMicromarketAdPages);
router.get('/', getAdPages);
export default router;
