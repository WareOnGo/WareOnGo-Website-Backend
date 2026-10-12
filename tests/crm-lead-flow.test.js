import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../models/prismaClient.js';
import { createEnquiry } from '../controllers/enquiryController.js';
import { createCustomerRequest } from '../controllers/customerRequestController.js';
import notificationService from '../utils/notificationService.js';
import sheetsService from '../utils/sheetsService.js';
import crmService from '../utils/crmService.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const cases = [
  { type: 'enquiry', controller: createEnquiry, model: prisma.enquiry,
    mail: 'sendEnquiryNotification', sheet: 'appendEnquiry',
    body: { name: 'Example', phoneNumber: '9876543210', source: 'homepage' }, id: 123 },
  { type: 'customer_request', controller: createCustomerRequest, model: prisma.customer_request,
    mail: 'sendCustomerRequestNotification', sheet: 'appendCustomerRequest',
    body: { full_name: 'Example', phone_number: '9876543210', company_name: 'Example Logistics',
      preferred_location: 'Bangalore', additional_requirements: 'Loading docks' }, id: 123n },
];

function mockCrmTransport(t, mocks) {
  mocks.crm.mock.restore();
  for (const [key, value] of Object.entries({ WEBSITE_CRM_ENABLED: 'true',
    TWENTY_CRM_BASE_URL: 'https://crm.example.test', TWENTY_CRM_API_KEY: 'unit-test-key' })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
  t.mock.method(console, 'log', () => {});
  return t.mock.method(globalThis, 'fetch', async () => Response.json({
    data: { createOpportunity: { id: 'cb30761a-8257-4fcd-9476-7671d5b99156' } },
  }, { status: 201 }));
}

for (const c of cases) {
  function mock(t) {
    const originalCreate = c.model.create;
    const create = t.mock.fn(async ({ data }) => ({ id: c.id, ...data }));
    c.model.create = create;
    t.after(() => { c.model.create = originalCreate; });
    const mail = t.mock.method(notificationService, c.mail, async () => ({ success: true }));
    const sheet = t.mock.method(sheetsService, c.sheet, async () => ({ success: true }));
    const crm = t.mock.method(crmService, 'sendLead', async () => ({ success: true }));
    t.mock.method(console, 'error', () => {});
    return { create, mail, sheet, crm };
  }

  test(`${c.type}: save first; CRM gets optional context without changing DB, mail or Sheets payloads`, async t => {
    const mocks = mock(t);
    const res = response();
    await c.controller({ body: { ...c.body, gclid: 'google-click', pagePath: '/request-warehouse', email: 'lead@example.com' } }, res);
    assert.equal(res.code, 201);
    const saved = { id: c.id, ...mocks.create.mock.calls[0].arguments[0].data };
    assert.equal(saved.gclid, undefined);
    assert.equal(saved.pagePath, undefined);
    assert.equal(mocks.crm.mock.callCount(), 0, 'response does not wait for the CRM network call');
    await flush();
    assert.deepEqual(mocks.mail.mock.calls[0].arguments, [saved]);
    assert.deepEqual(mocks.sheet.mock.calls[0].arguments, [saved]);
    const [type, record, context] = mocks.crm.mock.calls[0].arguments;
    assert.equal(type, c.type);
    assert.deepEqual(record, saved);
    assert.equal(context.gclid, 'google-click');
    assert.equal(context.pagePath, '/request-warehouse');
    if (c.type === 'customer_request') assert.equal(context.email, 'lead@example.com');
  });

  test(`${c.type}: failed CRM delivery cannot fail the form or interrupt mail/Sheets`, async t => {
    const mocks = mock(t);
    mocks.crm.mock.mockImplementation(async () => { throw new Error('CRM offline'); });
    const res = response();
    await c.controller({ body: c.body }, res);
    await flush();
    assert.equal(res.code, 201);
    assert.equal(mocks.create.mock.callCount(), 1);
    assert.equal(mocks.mail.mock.callCount(), 1);
    assert.equal(mocks.sheet.mock.callCount(), 1);
    assert.equal(mocks.crm.mock.callCount(), 1);
  });

  test(`${c.type}: a slow email does not delay CRM and failed email still allows Sheets`, async t => {
    const mocks = mock(t);
    let rejectEmail;
    mocks.mail.mock.mockImplementation(() => new Promise((_, reject) => { rejectEmail = reject; }));
    const res = response();
    await c.controller({ body: c.body }, res);
    await flush();
    assert.equal(res.code, 201);
    assert.equal(mocks.crm.mock.callCount(), 1);
    rejectEmail(new Error('Mail offline'));
    await flush();
    assert.equal(mocks.sheet.mock.callCount(), 1);
  });

  test(`${c.type}: an actual CRM HTTP 400 response does not interrupt email or Sheets`, async t => {
    const mocks = mock(t);
    const fetch = mockCrmTransport(t, mocks);
    fetch.mock.mockImplementation(async () => Response.json({
      error: 'Error', code: 'INVALID_PHONE_NUMBER', statusCode: 400,
    }, { status: 400 }));
    const res = response();
    await c.controller({ body: c.body }, res);
    await flush();
    assert.equal(res.code, 201);
    for (const operation of [mocks.create, mocks.mail, mocks.sheet, fetch]) {
      assert.equal(operation.mock.callCount(), 1);
    }
    assert.equal(console.log.mock.callCount(), 0);
    assert.match(console.error.mock.calls[0].arguments[0], /delivery failed \(http_400\)/);
  });

  test(`${c.type}: a stalled CRM call does not delay the response, email or Sheets`, async t => {
    const mocks = mock(t);
    let finishCrm;
    mocks.crm.mock.mockImplementation(() => new Promise(resolve => { finishCrm = resolve; }));
    const res = response();
    await c.controller({ body: c.body }, res);
    await flush();
    try {
      assert.equal(res.code, 201);
      assert.equal(mocks.mail.mock.callCount(), 1);
      assert.equal(mocks.sheet.mock.callCount(), 1);
      assert.equal(mocks.crm.mock.callCount(), 1);
    } finally {
      finishCrm({ success: false, error: 'timeout' });
      await flush();
    }
  });

  test(`${c.type}: simultaneous destination failures leave the saved lead and 201 response intact`, async t => {
    const mocks = mock(t);
    for (const service of [mocks.mail, mocks.sheet, mocks.crm]) {
      service.mock.mockImplementation(async () => { throw new Error('Destination offline'); });
    }
    const res = response();
    await c.controller({ body: c.body }, res);
    await flush();
    assert.equal(res.code, 201);
    assert.equal(String(res.body.id), String(c.id));
    for (const operation of [mocks.create, mocks.mail, mocks.sheet, mocks.crm]) {
      assert.equal(operation.mock.callCount(), 1);
    }
  });

  test(`${c.type}: malformed optional context cannot fail the real CRM delivery`, async t => {
    const mocks = mock(t);
    const fetch = mockCrmTransport(t, mocks);
    const values = [undefined, null, {}, [], 42, 'invalid\ncontext'];
    for (const value of values) {
      const res = response();
      await c.controller({ body: { ...c.body, gclid: value, pagePath: value,
        ...(c.type === 'customer_request' ? { email: value } : {}),
        assignedTo: ['RANITA'], ownerId: 'forged-owner', stage: 'DEAL_CLOSED' } }, res);
      assert.equal(res.code, 201);
      await flush();
    }
    assert.equal(fetch.mock.callCount(), values.length);
    for (const { arguments: [url, options] } of fetch.mock.calls) {
      assert.equal(url, 'https://crm.example.test/rest/opportunities');
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.assignedTo, []);
      assert.equal(payload.ownerId, undefined);
      assert.equal(payload.stage, 'NEW_LEAD');
      assert.equal(payload.gclidGoogleAds, undefined);
      assert.equal(payload.companyEmail, undefined);
      assert.equal(payload.leadSource, 'WEBSITE_SEO');
      assert.doesNotMatch(payload.description, /^Page:/m);
      assert.doesNotMatch(options.body, /RANITA|forged-owner/);
    }
    assert.equal(mocks.mail.mock.callCount(), values.length);
    assert.equal(mocks.sheet.mock.callCount(), values.length);
  });

  test(`${c.type}: excluded forms still reach the website DB, email and Sheets without a CRM request`, async t => {
    const mocks = mock(t);
    const fetch = mockCrmTransport(t, mocks);
    const exclusions = [{ pagePath: '/preview/ad-pages/bangalore' }];
    if (c.type === 'enquiry') exclusions.push({ source: 'edge-beta' }, { source: 'cms-preview' });
    for (const excluded of exclusions) {
      const res = response();
      await c.controller({ body: { ...c.body, gclid: 'preview-click', ...excluded } }, res);
      assert.equal(res.code, 201);
      await flush();
    }
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(mocks.create.mock.callCount(), exclusions.length);
    assert.equal(mocks.mail.mock.callCount(), exclusions.length);
    assert.equal(mocks.sheet.mock.callCount(), exclusions.length);
  });

  test(`${c.type}: unsupported phone still delivers the lead while preserving existing destination payloads`, async t => {
    const mocks = mock(t);
    const fetch = mockCrmTransport(t, mocks);
    const phone = '123456789012';
    const phoneField = c.type === 'enquiry' ? 'phoneNumber' : 'phone_number';
    const res = response();
    await c.controller({ body: { ...c.body, [phoneField]: phone } }, res);
    assert.equal(res.code, 201);
    await flush();
    assert.equal(fetch.mock.callCount(), 1);
    const payload = JSON.parse(fetch.mock.calls[0].arguments[1].body);
    assert.equal(payload.pocPhoneNumber, undefined);
    assert.ok(payload.description.includes(`Phone: ${phone}`));
    assert.equal(console.error.mock.callCount(), 0);
    assert.equal(console.log.mock.callCount(), 1, 'CRM confirms the new opportunity');
    for (const service of [mocks.mail, mocks.sheet]) {
      assert.equal(service.mock.callCount(), 1);
      assert.equal(service.mock.calls[0].arguments[0][phoneField], phone);
    }
  });

  test(`${c.type}: real mapping and delivery cover the available form variants`, async t => {
    const mocks = mock(t);
    const fetch = mockCrmTransport(t, mocks);
    const variants = c.type === 'enquiry' ? [
      'homepage', 'Website Contact Form', 'warehouse-card-42-callback', 'warehouse-detail-42-callback',
      'warehouse-card-42-enquiry', 'bangalore-landing', 'bangalore-service-distribution',
      'bangalore-landing-retail-distribution', 'bangalore-landing-hoskote',
      'bangalore-available-requirements', 'bangalore-landing-warehouse-42',
    ].map(source => ({ source, ...(/^warehouse-/.test(source) ? { companyName: 'Example Logistics' } : {}) })) : [
      { additional_requirements: 'Loading docks' },
      { additional_requirements: JSON.stringify({ location: 'Bangalore', additionalComments: null,
        contact: { fullName: 'Example', phone: '9876543210', email: 'saved@example.com', company: 'Example Logistics' } }) },
    ];
    for (const variant of variants) {
      const res = response();
      await c.controller({ body: { ...c.body, ...variant, gclid: 'available-click' } }, res);
      assert.equal(res.code, 201);
      await flush();
      const payload = JSON.parse(fetch.mock.calls.at(-1).arguments[1].body);
      assert.equal(payload.gclidGoogleAds, 'available-click');
      assert.equal(payload.leadSource, 'WEBSITE_GOOGLE_ADS');
      assert.equal(payload.stage, 'NEW_LEAD');
      assert.deepEqual(payload.assignedTo, []);
      assert.equal(payload.ownerId, undefined);
      if (variant.source) assert.ok(payload.description.includes(`Source: ${variant.source}`));
      if (variant.additional_requirements?.startsWith('{')) assert.equal(payload.companyEmail.primaryEmail, 'saved@example.com');
    }
    for (const operation of [mocks.create, mocks.mail, mocks.sheet, fetch]) {
      assert.equal(operation.mock.callCount(), variants.length);
    }
  });

  test(`${c.type}: no CRM, mail or Sheet call when validation or saving fails`, async t => {
    const mocks = mock(t);
    const invalid = response();
    await c.controller({ body: {} }, invalid);
    assert.equal(invalid.code, 400);
    mocks.create.mock.mockImplementation(async () => { throw new Error('Database offline'); });
    const failed = response();
    await c.controller({ body: c.body }, failed);
    assert.equal(failed.code, 500);
    await flush();
    for (const service of [mocks.mail, mocks.sheet, mocks.crm]) assert.equal(service.mock.callCount(), 0);
  });
}
