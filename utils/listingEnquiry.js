import { isValidPhoneNumber } from './phone.js';

const SOURCES = ['listing-shortlist', 'listing-advisor-callback'];
const text = (value, limit = 160) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

/** Compact listing forms reuse the request record and all three lead destinations.
 * An empty callback name means it was not collected; never invent a contact.
 * Other request forms retain their existing required fields.
 */
export function listingEnquiryData(body) {
  if (!SOURCES.includes(body.source)) return null;
  const callback = body.source === 'listing-advisor-callback';
  const name = callback ? '' : text(body.full_name, 120);
  // Reject an invalid contact value intact; truncating can create another number.
  const phone = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
  const size = body.required_space_sqft;
  const fields = [];
  if (!callback && !name) fields.push('full_name');
  if (!isValidPhoneNumber(phone) || !/^\+?\d{7,15}$/.test(phone.replace(/[()\-\s]/g, ''))) fields.push('phone_number');
  if (!callback && (!Number.isSafeInteger(size) || size < 1 || size > 100000000)) fields.push('required_space_sqft');
  if (fields.length) return { error: 'Missing or invalid fields', fields };

  const raw = body.listing_filters && typeof body.listing_filters === 'object' ? body.listing_filters : {};
  const filters = {};
  for (const key of ['city', 'state', 'micromarket', 'fireCompliance']) {
    const value = text(raw[key]);
    if (value) filters[key] = value;
  }
  for (const key of ['warehouseTypes', 'areaRanges']) {
    if (Array.isArray(raw[key])) filters[key] = raw[key].slice(0, 8).map(value => text(value, 40)).filter(Boolean);
  }
  for (const key of ['minSqft', 'maxSqft']) {
    if (Number.isSafeInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 100000000) filters[key] = raw[key];
  }
  const location = text(body.preferred_location, 500);
  // Sheets reads additionalComments; CRM and email retain the full requirements.
  const comments = [callback ? 'Advisor callback requested from listings.' : `Warehouse shortlist requested. Required area: ${size.toLocaleString('en-IN')} sqft.`,
    Object.keys(filters).length ? `Search filters: ${JSON.stringify(filters)}` : ''].filter(Boolean).join('\n');
  return { data: {
    full_name: name,
    phone_number: phone,
    company_name: null,
    preferred_location: location || null,
    additional_requirements: JSON.stringify({ source: body.source, location, additionalComments: comments,
      ...(!callback ? { requiredSpaceSqft: size } : {}), filters }),
  } };
}
