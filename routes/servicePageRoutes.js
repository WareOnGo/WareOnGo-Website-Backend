import express from 'express';
import { getServicePages, getServicePage } from '../controllers/servicePageController.js';

const router = express.Router();
router.get('/', getServicePages);
router.get('/:slug', getServicePage);
export default router;
