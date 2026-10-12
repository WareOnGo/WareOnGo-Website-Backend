import { parsePhoneNumberWithError } from 'libphonenumber-js/max';
import isEmail from 'validator/lib/isEmail.js';

const text = value => typeof value === 'string' && !/[\u0000\uD800-\uDFFF]/u.test(value) ? value.trim() : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const firstValue = (...values) => values.find(value => value != null && (typeof value !== 'string' || value.trim()));

// Retain submitted lead values even when their types cannot fit CRM fields.
// Escape characters PostgreSQL cannot store, rather than losing the enquiry.
function descriptionValue(value) {
  if (value == null) return '';
  let rendered;
  try {
    rendered = typeof value === 'object' && !(value instanceof Date)
      ? JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item)
      : String(value).trim();
  } catch { rendered = '[Unserializable value]'; }
  return (rendered || '').replace(/[\u0000\uD800-\uDFFF]/gu,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function formattedDate(value) {
  if (!(value instanceof Date) && !['string', 'number'].includes(typeof value)) return '';
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  } catch { return ''; }
}

function parseRequirements(value) {
  if (typeof value !== 'string') return object(value);
  try { return object(JSON.parse(value)); } catch { return {}; }
}

function phoneFields(value) {
  const phone = text(value).replace(/[\s()-]/g, '').replace(/^00/, '+');
  if (!/^\+?\d{7,15}$/.test(phone)) return undefined;
  try {
    // Twenty uses this parser and rejects national numbers without country
    // metadata. Local numbers default to India; explicit international codes win.
    const parsed = parsePhoneNumberWithError(phone, { defaultCountry: 'IN', extract: false });
    if (!parsed.isValid()) return undefined;
    return {
      primaryPhoneNumber: parsed.nationalNumber,
      primaryPhoneCallingCode: `+${parsed.countryCallingCode}`,
      ...(parsed.country ? { primaryPhoneCountryCode: parsed.country } : {}),
    };
  } catch {
    // Preserve the original in the description without blocking the whole lead.
    return undefined;
  }
}

// Forms have different fields. Only the saved record is authoritative; optional
// submission context supplies attribution and the request form's separate email.
// Missing or malformed optional values must not reject an otherwise valid lead.
export function buildCrmOpportunity(type, record = {}, context = {}) {
  if (!['enquiry', 'customer_request'].includes(type)) return null;
  record = object(record);
  context = object(context);
  const source = text(record.source) || (type === 'enquiry' ? 'website' : 'warehouse-request');
  const pagePath = text(context.pagePath);
  if (/^(?:edge(?:[-_]|$)|cms-preview(?:[-_]|$))/i.test(source) || /^\/preview(?:\/|$)/.test(pagePath)) return null;

  const requirements = record.additional_requirements;
  const parsed = parseRequirements(requirements);
  const contact = object(parsed.contact);
  const rawName = firstValue(record.name, record.full_name, contact.fullName);
  const rawCompany = firstValue(record.companyName, record.company_name, contact.company);
  const rawPhone = firstValue(record.phoneNumber, record.phone_number, contact.phone);
  const rawEmail = firstValue(record.email, contact.email, context.email);
  const rawLocation = firstValue(record.preferred_location, parsed.location);
  const name = text(rawName);
  const company = text(rawCompany);
  const email = text(rawEmail);
  const location = text(rawLocation);
  const gclid = /^[A-Za-z0-9_-]{1,512}$/.test(text(context.gclid)) ? text(context.gclid) : '';
  const id = ['number', 'bigint'].includes(typeof record.id) ? String(record.id) : text(record.id) || 'unknown';
  const reference = `website:${type}:${id}`;
  const warehouseId = /^(?:warehouse-(?:card|detail)-|bangalore-landing-warehouse-)(\d+)(?:-|$)/.exec(source)?.[1];
  const date = record.createdat ?? record.created_at;
  const details = [
    ['Website reference', reference], ['Source', firstValue(record.source, source)], ['Submitted at', formattedDate(date) || date],
    ['Name', rawName], ['Company', rawCompany], ['Phone', rawPhone], ['Email', rawEmail], ['Preferred location', rawLocation],
    ['Warehouse', warehouseId ? `https://wareongo.com/warehouse/${warehouseId}` : ''],
    ['Page', /^\/(?!\/)[^?#\\\x00-\x20\x7f]{0,500}$/.test(pagePath) ? `https://wareongo.com${pagePath}` : ''],
    ['Google click ID', context.gclid], ['Requirements', requirements],
  ];
  const payload = {
    name: `${company || name || 'Website lead'} - ${type === 'enquiry' ? 'Website enquiry' : 'Warehouse request'}`,
    stage: 'NEW_LEAD',
    leadSource: gclid ? 'WEBSITE_GOOGLE_ADS' : 'WEBSITE_SEO',
    assignedTo: [],
    createdBy: { source: 'API' },
    description: details.map(([label, value]) => [label, descriptionValue(value)])
      .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n'),
  };
  if (name) {
    const [firstName, ...rest] = name.split(/\s+/);
    payload.pocName = { firstName, lastName: rest.join(' ') };
  }
  if (company) payload.companyName = company;
  const normalizedPhone = phoneFields(rawPhone);
  if (normalizedPhone) payload.pocPhoneNumber = normalizedPhone;
  if (email && isEmail(email)) payload.companyEmail = { primaryEmail: email };
  const city = location || (/^bangalore-/.test(source) ? 'Bangalore' : '');
  if (city) payload.city = city;
  if (gclid) payload.gclidGoogleAds = gclid;
  return payload;
}

class CrmService {
  async sendLead(type, record, context = {}) {
    let failure = 'network';
    try {
      const payload = buildCrmOpportunity(type, record, context);
      if (!payload) return { success: false, skipped: true, reason: 'excluded' };
      if (process.env.WEBSITE_CRM_ENABLED !== 'true') return { success: false, skipped: true, reason: 'disabled' };
      const baseUrl = text(process.env.TWENTY_CRM_BASE_URL).replace(/\/+$/, '');
      const apiKey = text(process.env.TWENTY_CRM_API_KEY);
      if (!baseUrl || !apiKey) {
        failure = 'configuration';
        throw new Error('CRM configuration is incomplete');
      }
      // One bounded attempt. Do not retry an ambiguous POST: Twenty may already
      // have created the opportunity. Sheets/email are scheduled independently.
      const response = await fetch(`${baseUrl}/rest/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      failure = `http_${response.status}`;
      if (!response.ok) throw new Error('CRM rejected the request');
      failure = 'invalid_response';
      const body = await response.json();
      const crmId = body?.data?.createOpportunity?.id;
      if (body?.errors?.length || typeof crmId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(crmId)) {
        throw new Error('CRM did not confirm creation');
      }
      console.log(`[crm] ${type} ${record?.id ?? 'unknown'} delivered (${crmId})`);
      return { success: true, crmId };
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') failure = 'timeout';
      // Never log headers, raw request/response bodies or contact details.
      console.error(`[crm] ${type} ${record?.id ?? 'unknown'} delivery failed (${failure})`);
      return { success: false, error: failure };
    }
  }
}

export default new CrmService();
