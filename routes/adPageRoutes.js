import { Router } from 'express';
import { getAdPages } from '../controllers/adPageController.js';

const router = Router();
router.get('/', getAdPages);
export default router;
