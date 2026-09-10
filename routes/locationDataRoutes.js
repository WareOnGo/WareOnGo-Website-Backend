import express from 'express';
import { getLocations, getLocation } from '../controllers/locationDataController.js';

const router = express.Router();

router.get('/', getLocations);
// :kind is 'city' or 'state' — a slug is only unique inside one of the two
// namespaces ("goa" is both a city and a state in this catalogue).
router.get('/:kind/:slug', getLocation);

export default router;
