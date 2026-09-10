import express from 'express';
import { getLocationPages, getLocationPage } from '../controllers/locationPageController.js';

const router = express.Router();

router.get('/', getLocationPages);
router.get('/:kind/:slug', getLocationPage);

export default router;
