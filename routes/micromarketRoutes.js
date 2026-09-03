import express from 'express';
import { getMicromarketPages, getMicromarketPage } from '../controllers/micromarketController.js';

const router = express.Router();

router.get('/', getMicromarketPages);
// Two segments, matching the page URL they describe: a micromarket slug is only
// unique inside its parent city.
router.get('/:citySlug/:slug', getMicromarketPage);

export default router;
