import prisma from '../models/prismaClient.js';
import { isValidPhoneNumber } from '../utils/phone.js';
import { sanitizeForJSON } from '../utils/serialize.js';

export async function createCustomerRequest(req, res) {
  try {
    const body = req.body || {};
    const { full_name, phone_number, company_name, preferred_location, additional_requirements } = body;

    if (!req.body) {
      return res.status(400).json({ error: 'Missing request body (expected JSON)' });
    }

    if (!prisma.customer_request) {
      console.error('Prisma client does not have `customer_request` model. Did you run `prisma generate`?');
      return res.status(500).json({ error: 'Server misconfiguration: customer_request model not available' });
    }

    const missing = [];
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) missing.push('full_name');
    if (!phone_number || !isValidPhoneNumber(phone_number)) missing.push('phone_number');
    if (!company_name || typeof company_name !== 'string' || company_name.trim().length === 0) missing.push('company_name');
    if (!preferred_location || typeof preferred_location !== 'string' || preferred_location.trim().length === 0) missing.push('preferred_location');
    if (!additional_requirements || typeof additional_requirements !== 'string' || additional_requirements.trim().length === 0) missing.push('additional_requirements');

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing or invalid fields', fields: missing });
    }

    const created = await prisma.customer_request.create({
      data: {
        full_name: full_name.trim(),
        phone_number: phone_number.trim(),
        company_name: company_name.trim(),
        preferred_location: preferred_location.trim(),
        additional_requirements: additional_requirements.trim(),
      },
    });

    res.status(201).json(sanitizeForJSON(created));
  } catch (error) {
    console.error('Error creating customer_request:', error);
    res.status(500).json({ error: 'Failed to create customer request' });
  }
}
