import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

// The application and serializers are real. Only database/cache operations and
// outbound transports are replaced; this suite must never use live credentials.
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://dry_run:dry_run@127.0.0.1:1/dry_run',
  CORS_ORIGINS: 'https://wareongo.com', WEBSITE_CRM_ENABLED: 'true',
  TWENTY_CRM_BASE_URL: 'https://crm.invalid', TWENTY_CRM_API_KEY: 'dry-run',
  SHEETS_WEBHOOK_URL: 'https://sheets.invalid', SHEETS_WEBHOOK_TOKEN: 'dry-run',
  EMAILJS_SERVICE_ID: 'dry-run', EMAILJS_TEMPLATE_ID: 'dry-run',
  EMAILJS_PUBLIC_KEY: 'dry-run', EMAILJS_PRIVATE_KEY: 'dry-run',
});

const nativeFetch = globalThis.fetch;
const deliveries = { crm: [], email: [], sheets: [] };
const rows = [];
let failing = new Set();
let held;
let failSave = false;
let nextId = 1n;
let server;
let baseUrl;

async function transport(kind, payload) {
  deliveries[kind].push(payload);
  if (held?.kind === kind) await held.promise;
  if (failing.has(kind)) throw new Error(`Simulated ${kind} outage`);
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  const payload = JSON.parse(options.body);
  if (url === 'https://crm.invalid/rest/opportunities') {
    assert.equal(options.headers.Authorization, 'Bearer dry-run');
    assert.ok(options.signal instanceof AbortSignal);
    await transport('crm', payload);
    return Response.json({ data: { createOpportunity: { id: '11111111-1111-4111-8111-111111111111' } } });
  }
  if (url === 'https://sheets.invalid') {
    assert.equal(payload.token, 'dry-run');
    await transport('sheets', payload);
    return Response.json({ success: true });
  }
  throw new Error('Unexpected outbound request blocked by the dry-run harness');
};

const { default: emailjs } = await import('@emailjs/nodejs');
const originalSend = emailjs.send;
emailjs.send = async (service, template, payload) => {
  assert.equal(service, 'dry-run');
  assert.equal(template, 'dry-run');
  await transport('email', payload);
  return { status: 200, text: 'OK' };
};

const { default: prisma } = await import('../models/prismaClient.js');
const { Prisma } = await import('@prisma/client');
const originals = { customer: prisma.customer_request.create, enquiry: prisma.enquiry.create };
for (const modelName of ['customer_request', 'enquiry']) {
  const model = Prisma.dmmf.datamodel.models.find(model => model.name.toLowerCase() === modelName);
  prisma[modelName].create = async ({ data }) => {
    if (failSave) throw new Error('Simulated database outage');
    // Check the actual generated model's required/nullability contract.
    for (const field of model.fields.filter(field => field.kind === 'scalar')) {
      const value = data[field.name];
      if (value == null) assert.ok(!field.isRequired || (value === undefined && field.hasDefaultValue), field.name);
      else if (field.type === 'String') assert.equal(typeof value, 'string', field.name);
    }
    const id = nextId++;
    const row = { ...data, id: modelName === 'enquiry' ? Number(id) : id,
      [modelName === 'enquiry' ? 'createdat' : 'created_at']: new Date() };
    rows.push({ model: modelName, row });
    return row;
  };
}

const { default: redisService } = await import('../services/redisService.js');
const originalConnect = redisService.connect;
redisService.connect = async () => null;
const { default: notificationService } = await import('../utils/notificationService.js');
const { default: app } = await import('../server.js');
const flush = async () => {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
};

before(async () => {
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(t => {
  rows.length = 0;
  for (const calls of Object.values(deliveries)) calls.length = 0;
  failing = new Set();
  held = undefined;
  failSave = false;
  for (const limit of Object.values(notificationService.emailCounts)) limit.count = 0;
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  prisma.customer_request.create = originals.customer;
  prisma.enquiry.create = originals.enquiry;
  redisService.connect = originalConnect;
  emailjs.send = originalSend;
  globalThis.fetch = nativeFetch;
  await prisma.$disconnect();
});

async function post(body, path = '/customer-requests') {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://wareongo.com' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
  });
  const result = { status: response.status, body: await response.json(), headers: response.headers };
  await flush();
  return result;
}

const shortlist = { source: 'listing-shortlist', full_name: ' Dry Run Buyer ', phone_number: '9876543210',
  required_space_sqft: 25000, preferred_location: ' hoskote, Bengaluru ',
  listing_filters: { city: 'Bengaluru', micromarket: 'hoskote', warehouseTypes: ['PEB'], minSqft: 10000, fireCompliance: 'yes' },
  gclid: 'dry-run-click', pagePath: '/listings/city/bengaluru/hoskote' };
const callback = { source: 'listing-advisor-callback', phone_number: '+91 9876543210' };
const legacy = { full_name: 'Dry Run Buyer', phone_number: '9876543210', company_name: 'Example Logistics',
  preferred_location: 'Bengaluru', additional_requirements: 'Loading docks' };

test('HTTP shortlist saves before delivery and preserves size, search, attribution and JSON types', async () => {
  const result = await post(shortlist);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://wareongo.com');
  assert.equal(typeof result.body.id, 'string');
  assert.equal(typeof result.body.created_at, 'string');
  assert.equal(result.body.full_name, 'Dry Run Buyer');
  assert.equal(result.body.company_name, null);
  const requirements = JSON.parse(result.body.additional_requirements);
  assert.equal(requirements.requiredSpaceSqft, 25000);
  assert.deepEqual(requirements.filters, shortlist.listing_filters);
  assert.equal(rows.length, 1);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 1);
  const crm = deliveries.crm[0];
  assert.equal(crm.pocPhoneNumber.primaryPhoneNumber, '9876543210');
  assert.equal(crm.gclidGoogleAds, 'dry-run-click');
  assert.match(crm.description, /listing-shortlist/);
  assert.match(crm.description, /25000|25,000/);
  assert.match(deliveries.email[0].message, /25000|25,000/);
  const sheet = deliveries.sheets[0];
  assert.equal(sheet.type, 'customer_request');
  assert.equal(sheet.data.fullName, 'Dry Run Buyer');
  assert.equal(sheet.data.companyName, '');
  assert.match(sheet.data.comments, /25,000 sqft/);
  assert.match(sheet.data.comments, /PEB/);
});

test('HTTP phone-only callbacks accept absent name/company/location and reach every serializer', async () => {
  for (const phone_number of ['9876543210', '+91 9876543210', '+1 (202) 555-0123']) {
    const result = await post({ ...callback, phone_number });
    assert.equal(result.status, 201);
    assert.equal(result.body.full_name, '');
    assert.equal(result.body.company_name, null);
    assert.equal(result.body.preferred_location, null);
    assert.equal(result.body.phone_number, phone_number);
    assert.equal(deliveries.crm.at(-1).pocName, undefined);
    assert.ok(deliveries.crm.at(-1).pocPhoneNumber);
    assert.match(deliveries.email.at(-1).message, /Advisor callback requested/);
    assert.equal(deliveries.sheets.at(-1).data.fullName, '');
  }
  assert.equal(rows.length, 3);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 3);
});

test('HTTP legacy request and enquiry forms retain their fields and required-company validation', async () => {
  for (const additional_requirements of ['Loading docks', JSON.stringify({ location: 'Bengaluru', additionalComments: 'Loading docks', contact: { email: 'dry-run@example.com' } })]) {
    assert.equal((await post({ ...legacy, additional_requirements })).status, 201);
    assert.equal(rows.at(-1).row.company_name, 'Example Logistics');
  }
  const enquiry = await post({ name: 'Dry Run Buyer', phoneNumber: '9876543210', companyName: 'Example Logistics', source: 'warehouse-card-42-callback' }, '/enquiries');
  assert.equal(enquiry.status, 201);
  assert.equal(rows.at(-1).model, 'enquiry');
  assert.equal(deliveries.sheets.at(-1).type, 'enquiry');
  const invalid = await post({ ...legacy, company_name: '' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.fields.includes('company_name'));
  assert.equal(rows.length, 3);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 3);
});

test('HTTP invalid compact inputs cannot persist or trigger delivery', async () => {
  const invalid = [
    {}, [], { ...callback, source: 'unknown' }, { ...callback, source: ['listing-advisor-callback'] },
    ...['', ' ', null, {}].map(full_name => ({ ...shortlist, full_name })),
    ...[undefined, null, '25000', 0, -1, 0.5, 100000001, Number.MAX_SAFE_INTEGER + 1].map(required_space_sqft => ({ ...shortlist, required_space_sqft })),
    ...[undefined, '', '-------', '123', 1234567890, {}, '12++3456789', '1234567890123456', '9876543210' + ' '.repeat(15) + '123'].map(phone_number => ({ ...callback, phone_number })),
  ];
  for (const body of invalid) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  assert.equal(rows.length, 0);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 0);
});

test('Express rejects malformed, non-JSON and oversized bodies before persistence', async () => {
  for (const [body, contentType, status] of [
    ['{', 'application/json', 400], ['null', 'application/json', 400],
    ['phone_number=9876543210', 'application/x-www-form-urlencoded', 400],
    [JSON.stringify({ ...shortlist, full_name: 'x'.repeat(110000) }), 'application/json', 413],
  ]) {
    const result = await nativeFetch(`${baseUrl}/customer-requests`, {
      method: 'POST', headers: { 'Content-Type': contentType }, body,
    });
    assert.equal(result.status, status);
    await result.text();
  }
  assert.equal(rows.length, 0);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 0);
});

test('database failure returns 500 without attempting CRM, email or Sheets', async () => {
  failSave = true;
  for (const body of [shortlist, callback, legacy]) {
    const result = await post(body);
    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'Failed to create customer request');
  }
  assert.equal(rows.length, 0);
  for (const calls of Object.values(deliveries)) assert.equal(calls.length, 0);
});

for (const kind of ['crm', 'email', 'sheets']) {
  test(`${kind} outage does not lose the saved lead or stop the other destinations`, async () => {
    failing.add(kind);
    assert.equal((await post(callback)).status, 201);
    assert.equal(rows.length, 1);
    for (const calls of Object.values(deliveries)) assert.equal(calls.length, 1);
  });

  test(`slow ${kind} delivery does not hold the HTTP response open`, async () => {
    let release;
    held = { kind, promise: new Promise(resolve => { release = resolve; }) };
    try {
      assert.equal((await post(callback)).status, 201);
      assert.equal(rows.length, 1);
      assert.equal(deliveries[kind].length, 1);
    } finally {
      release();
      await flush();
    }
    for (const calls of Object.values(deliveries)) assert.equal(calls.length, 1);
  });
}

test('existing email rate limiting still saves the lead and delivers CRM and Sheets', async () => {
  notificationService.emailCounts.hourly.count = 5;
  assert.equal((await post(callback)).status, 201);
  assert.equal(rows.length, 1);
  assert.equal(deliveries.email.length, 0);
  assert.equal(deliveries.crm.length, 1);
  assert.equal(deliveries.sheets.length, 1);
});

test('CORS preflight allows the production origin and JSON submissions', async () => {
  const result = await nativeFetch(`${baseUrl}/customer-requests`, {
    method: 'OPTIONS', headers: { Origin: 'https://wareongo.com',
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(result.status, 204);
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://wareongo.com');
  assert.match(result.headers.get('access-control-allow-methods'), /POST/);
  assert.match(result.headers.get('access-control-allow-headers'), /content-type/);
  assert.equal(rows.length, 0);
});
