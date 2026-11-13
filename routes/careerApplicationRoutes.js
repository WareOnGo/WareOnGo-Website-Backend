import express from 'express';
import rateLimit from 'express-rate-limit';
import { createCareerApplication } from '../controllers/careerApplicationController.js';

const router = express.Router();
router.post('/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' } }), createCareerApplication);
// Reading applications requires the authenticated CMS; there is no public GET.
export default router;
