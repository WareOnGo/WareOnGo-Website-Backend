import prisma from '../models/prismaClient.js';
import { isValidPhoneNumber } from '../utils/phone.js';
import { sanitizeForJSON } from '../utils/serialize.js';

export async function createEnquiry(req, res) {
  try {
    const body = req.body || {};
    const { name, phoneNumber, email, source } = body;

    if (!req.body) {
      return res.status(400).json({ error: 'Missing request body (expected JSON)' });
    }

    if (!prisma.enquiry) {
      console.error('Prisma client does not have `enquiry` model. Did you run `prisma generate`?');
      return res.status(500).json({ error: 'Server misconfiguration: Enquiry model not available' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid or missing `name`' });
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid or missing `phoneNumber`' });
    }
    if (email && typeof email !== 'string') {
      return res.status(400).json({ error: 'Invalid `email`' });
    }
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid or missing `source`' });
    }

    const created = await prisma.enquiry.create({
      data: {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email ? email.trim() : null,
        source: source.trim(),
      },
    });

    res.status(201).json(sanitizeForJSON(created));
  } catch (error) {
    console.error('Error creating enquiry:', error);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
}
