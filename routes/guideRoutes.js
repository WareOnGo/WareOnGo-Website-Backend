import express from 'express';
import { getGuides, getGuideBySlug } from '../controllers/guideController.js';

const router = express.Router();

router.get('/', getGuides);
router.get('/:slug', getGuideBySlug);

export default router;
