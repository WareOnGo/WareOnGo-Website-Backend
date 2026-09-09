import express from 'express';
import { getMicromarkets, getMicromarket } from '../controllers/micromarketDataController.js';

const router = express.Router();

router.get('/', getMicromarkets);
// Stable city/micromarket lookup; the payload also supplies the parent state
// for /overview/{state}/{city}/{micromarket}.
router.get('/:citySlug/:slug', getMicromarket);

export default router;
