import express from 'express';
import { getMicromarkets, getMicromarket } from '../controllers/micromarketDataController.js';

const router = express.Router();

router.get('/', getMicromarkets);
// Two segments, matching the page URL: a micromarket slug is only unique inside
// its parent city.
router.get('/:citySlug/:slug', getMicromarket);

export default router;
