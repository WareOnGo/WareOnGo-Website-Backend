import validator from 'validator';
import prisma from '../models/prismaClient.js';

export async function createCareerApplication(req, res) {
  res.set('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Expected application details.' });
  const fieldErrors = {};
  const read = (key, max, required = false) => {
    if (body[key] == null && !required) return '';
    if (typeof body[key] !== 'string' || body[key].trim().length > max || (required && !body[key].trim())) {
      fieldErrors[key] = `Enter ${key === 'name' ? 'your name' : key === 'email' ? 'your email address' : 'a valid value'} (up to ${max} characters).`;
      return '';
    }
    return body[key].trim();
  };
  const name = read('name', 100, true);
  const email = read('email', 254, true);
  const phoneNumber = read('phoneNumber', 30);
  const note = read('note', 2000);
  if (email && !validator.isEmail(email)) fieldErrors.email = 'Enter a valid email address.';
  if (phoneNumber && (!/^\+?[\d ()-]+$/.test(phoneNumber) || phoneNumber.replace(/\D/g, '').length < 7 || phoneNumber.replace(/\D/g, '').length > 15)) fieldErrors.phoneNumber = 'Enter a valid phone number, or leave it blank.';
  if (Object.keys(fieldErrors).length) return res.status(400).json({ error: 'Check your details.', fieldErrors });
  try {
    // Explicit fields only. No sales enquiries, CRM, ad-click attribution,
    // analytics events or sales email/Sheets notifications are involved.
    await prisma.careerApplication.create({ data: { name, email, phoneNumber: phoneNumber || null, note: note || null } });
    return res.status(201).json({ success: true });
  } catch {
    console.error('[careers] application save failed');
    return res.status(500).json({ error: 'Could not save your application. Please try again.' });
  }
}
