import express from 'express';
import { getLegalPages } from '../controllers/legalPageController.js';

const router = express.Router();
router.get('/', getLegalPages);
export default router;
