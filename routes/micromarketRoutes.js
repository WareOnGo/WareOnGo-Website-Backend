import express from 'express';
import { getMicromarketPages, getMicromarketPage } from '../controllers/micromarketController.js';

const router = express.Router();

router.get('/', getMicromarketPages);
// Stable content lookup key. Public overview URLs also carry the state derived
// by /micromarkets; changing that location does not require moving CMS records.
router.get('/:citySlug/:slug', getMicromarketPage);

export default router;
