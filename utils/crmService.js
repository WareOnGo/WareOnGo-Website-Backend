const text = value => typeof value === 'string' ? value.trim() : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function parseRequirements(value) {
  try { return object(JSON.parse(value)); } catch { return {}; }
}

function phoneFields(value) {
  const phone = text(value).replace(/[\s()-]/g, '');
  if (!/^\+?\d{7,15}$/.test(phone)) return undefined;
  const indian = /^(?:(?:\+?91|0091))?([6-9]\d{9})$/.exec(phone);
  return indian ? {
    primaryPhoneNumber: indian[1], primaryPhoneCallingCode: '+91', primaryPhoneCountryCode: 'IN',
  } : { primaryPhoneNumber: phone };
}

// Forms have different fields. Only the saved record is authoritative; optional
// submission context supplies attribution and the request form's separate email.
// Missing or malformed optional values must not reject an otherwise valid lead.
export function buildCrmOpportunity(type, record = {}, context = {}) {
  if (!['enquiry', 'customer_request'].includes(type)) return null;
  const source = text(record.source) || (type === 'enquiry' ? 'website' : 'warehouse-request');
  const pagePath = text(context.pagePath);
  if (/^(?:edge(?:[-_]|$)|cms-preview(?:[-_]|$))/i.test(source) || /^\/preview(?:\/|$)/.test(pagePath)) return null;

  const requirements = text(record.additional_requirements);
  const parsed = parseRequirements(requirements);
  const contact = object(parsed.contact);
  const name = text(record.name) || text(record.full_name) || text(contact.fullName);
  const company = text(record.companyName) || text(record.company_name) || text(contact.company);
  const phone = text(record.phoneNumber) || text(record.phone_number) || text(contact.phone);
  const email = text(record.email) || text(contact.email) || text(context.email);
  const location = text(record.preferred_location) || text(parsed.location);
  const gclid = /^[A-Za-z0-9_-]{1,512}$/.test(text(context.gclid)) ? text(context.gclid) : '';
  const reference = `website:${type}:${String(record.id ?? 'unknown')}`;
  const warehouseId = /^(?:warehouse-(?:card|detail)-|bangalore-landing-warehouse-)(\d+)(?:-|$)/.exec(source)?.[1];
  const date = record.createdat ?? record.created_at;
  const submittedAt = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : '';
  const details = [
    ['Website reference', reference], ['Source', source], ['Submitted at', submittedAt],
    ['Name', name], ['Company', company], ['Phone', phone], ['Email', email], ['Preferred location', location],
    ['Warehouse', warehouseId ? `https://wareongo.com/warehouse/${warehouseId}` : ''],
    ['Page', /^\/(?!\/)[^?#\\\x00-\x20\x7f]{0,500}$/.test(pagePath) ? `https://wareongo.com${pagePath}` : ''],
    ['Requirements', requirements],
  ];
  const payload = {
    name: `${company || name || 'Website lead'} - ${type === 'enquiry' ? 'Website enquiry' : 'Warehouse request'}`,
    stage: 'NEW_LEAD',
    leadSource: gclid ? 'WEBSITE_GOOGLE_ADS' : 'WEBSITE_SEO',
    assignedTo: [],
    createdBy: { source: 'API' },
    description: details.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n'),
  };
  if (name) {
    const [firstName, ...rest] = name.split(/\s+/);
    payload.pocName = { firstName, lastName: rest.join(' ') };
  }
  if (company) payload.companyName = company;
  const normalizedPhone = phoneFields(phone);
  if (normalizedPhone) payload.pocPhoneNumber = normalizedPhone;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) payload.companyEmail = { primaryEmail: email };
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
      console.log(`[crm] ${type} ${record.id} delivered (${crmId})`);
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
