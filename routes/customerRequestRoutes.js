import express from 'express';
import { createCustomerRequest } from '../controllers/customerRequestController.js';

const router = express.Router();

router.post('/', createCustomerRequest);

export default router;
