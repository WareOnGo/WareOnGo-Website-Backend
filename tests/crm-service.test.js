import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import crmService, { buildCrmOpportunity } from '../utils/crmService.js';

const enquiry = { id: 7, name: 'Asha Rao', phoneNumber: '+91 98765 43210', source: 'homepage' };
const request = { id: 9007199254740993n, full_name: 'Asha Rao', phone_number: '9876543210',
  company_name: 'Example Logistics', preferred_location: 'Bangalore' };
const crmId = 'cb30761a-8257-4fcd-9476-7671d5b99156';

test('contact/callback/landing sources all create unassigned leads without optional fields', () => {
  for (const source of ['homepage', 'Website Contact Form', 'warehouse-card-42-callback',
    'warehouse-detail-42-callback', 'warehouse-card-42-enquiry', 'bangalore-landing',
    'bangalore-service-distribution', 'bangalore-available-requirements',
    'bangalore-landing-hoskote', 'bangalore-landing-warehouse-42']) {
    const payload = buildCrmOpportunity('enquiry', { ...enquiry, source });
    assert.equal(payload.stage, 'NEW_LEAD', source);
    assert.equal(payload.leadSource, 'WEBSITE_SEO');
    assert.deepEqual(payload.assignedTo, []);
    assert.equal(payload.ownerId, undefined);
    assert.deepEqual(payload.createdBy, { source: 'API' });
    assert.deepEqual(payload.pocName, { firstName: 'Asha', lastName: 'Rao' });
    assert.equal(payload.pocPhoneNumber.primaryPhoneNumber, '9876543210');
    assert.equal(payload.companyEmail, undefined);
    assert.equal(payload.companyName, undefined);
    assert.match(payload.description, /^Website reference: website:enquiry:7\n/);
    if (source.includes('-42')) assert.match(payload.description, /https:\/\/wareongo.com\/warehouse\/42/);
  }
});

test('minimal records and unexpected optional types do not impose another form schema', () => {
  for (const type of ['enquiry', 'customer_request']) {
    for (const value of [undefined, null, '', 12, {}, []]) {
      const payload = buildCrmOpportunity(type, { id: 1, name: 'Asha', companyName: value,
        email: value, phoneNumber: value, preferred_location: value, additional_requirements: value },
      { gclid: value, pagePath: value, email: value });
      assert.equal(payload.stage, 'NEW_LEAD');
      for (const key of ['companyName', 'companyEmail', 'pocPhoneNumber', 'city', 'gclidGoogleAds', 'budget', 'duration', 'amount']) {
        assert.equal(payload[key], undefined, `${type}/${key}/${String(value)}`);
      }
      assert.doesNotThrow(() => JSON.stringify(payload));
    }
  }
});

test('both plain-text and JSON warehouse requests preserve their available fields', () => {
  const plain = buildCrmOpportunity('customer_request', { ...request, additional_requirements: 'Cold storage, 24-hour access' });
  assert.equal(plain.city, 'Bangalore');
  assert.equal(plain.companyName, 'Example Logistics');
  assert.match(plain.description, /Cold storage, 24-hour access/);
  assert.match(plain.description, /^Website reference: website:customer_request:9007199254740993\n/);
  assert.equal(plain.companyEmail, undefined);
  const requirements = JSON.stringify({ location: 'Hosur', additionalComments: null,
    contact: { fullName: 'Asha Rao', phone: '9876543210', company: 'Example Logistics', email: 'asha@example.com' } });
  const packed = buildCrmOpportunity('customer_request', { id: 2n, additional_requirements: requirements });
  assert.equal(packed.city, 'Hosur');
  assert.equal(packed.companyName, 'Example Logistics');
  assert.deepEqual(packed.companyEmail, { primaryEmail: 'asha@example.com' });
  assert.equal(packed.pocName.firstName, 'Asha');
  assert.ok(packed.description.endsWith(requirements), 'retain the original requirements without dropping extra fields');
  const withEmail = buildCrmOpportunity('customer_request', request, { email: ' other@example.com ' });
  assert.equal(withEmail.companyEmail.primaryEmail, 'other@example.com');
});

test('only valid available gclid is mapped; CRM control fields cannot come from the browser', () => {
  const gclid = 'AbCd_-'.repeat(40);
  const payload = buildCrmOpportunity('enquiry', enquiry, { gclid, pagePath: '/request-warehouse',
    stage: 'DEAL_CLOSED', assignedTo: ['RANITA'], amount: 100, name: 'Override', apiKey: 'secret' });
  assert.equal(payload.gclidGoogleAds, gclid);
  assert.equal(payload.leadSource, 'WEBSITE_GOOGLE_ADS');
  assert.equal(payload.stage, 'NEW_LEAD');
  assert.deepEqual(payload.assignedTo, []);
  assert.match(payload.description, /Page: https:\/\/wareongo.com\/request-warehouse/);
  assert.doesNotMatch(JSON.stringify(payload), /Override|secret|RANITA/);
  for (const invalid of ['bad\nvalue', 'x'.repeat(513), 'https://example.com/click']) {
    assert.equal(buildCrmOpportunity('enquiry', enquiry, { gclid: invalid }).gclidGoogleAds, undefined);
  }
});

test('Edge and previews retain their existing destinations but are excluded from CRM', () => {
  for (const source of ['edge-beta', 'cms-preview']) {
    assert.equal(buildCrmOpportunity('enquiry', { ...enquiry, source }), null);
  }
  for (const type of ['enquiry', 'customer_request']) {
    assert.equal(buildCrmOpportunity(type, enquiry, { pagePath: '/preview/ad-pages/bangalore' }), null);
  }
});

test('untrusted page paths cannot produce external links or forward query strings and control characters', () => {
  for (const pagePath of ['//external.example/path', '/\\external.example/path', '/\\@external.example',
    '/\texternal.example', '/path\u0000', '/path\nother', '/path?email=private@example.com',
    '/path#private', 'https://external.example/path', '/' + 'x'.repeat(501)]) {
    const payload = buildCrmOpportunity('enquiry', enquiry, { pagePath });
    assert.doesNotMatch(payload.description, /^Page:/m, JSON.stringify(pagePath));
  }
  for (const pagePath of ['/', '/warehouse/42', '/bangalore', '/locations/White%20Field']) {
    const payload = buildCrmOpportunity('enquiry', enquiry, { pagePath });
    const page = new URL(payload.description.match(/^Page: (.+)$/m)[1]);
    assert.equal(page.origin, 'https://wareongo.com');
    assert.equal(page.search, '');
    assert.equal(page.hash, '');
  }
});

test('optional context email cannot hide or replace the email already saved in warehouse requirements', () => {
  const record = { ...request, additional_requirements: JSON.stringify({
    contact: { email: 'saved@example.com' }, additionalComments: 'Loading docks',
  }) };
  for (const email of [undefined, null, '', {}, 'invalid-email', 'conflicting@example.com']) {
    assert.equal(buildCrmOpportunity('customer_request', record, { email }).companyEmail.primaryEmail, 'saved@example.com');
  }
  assert.equal(buildCrmOpportunity('customer_request', { ...record, email: 'top-level@example.com' },
    { email: 'context@example.com' }).companyEmail.primaryEmail, 'top-level@example.com');
});

test('malformed JSON requirements remain visible without imposing a nested contact schema', () => {
  for (const requirements of ['{broken', 'null', '[]', '42', '{"contact":null}', '{"contact":[]}',
    '{"contact":{"email":{},"fullName":[],"phone":false},"extra":"keep me"}']) {
    const payload = buildCrmOpportunity('customer_request', { ...request, additional_requirements: requirements });
    assert.equal(payload.stage, 'NEW_LEAD');
    assert.equal(payload.companyEmail, undefined);
    assert.ok(payload.description.endsWith(requirements));
    assert.equal(payload.pocName.firstName, 'Asha');
  }
});

test('phone normalization preserves international numbers and omits malformed optional contacts', () => {
  for (const phoneNumber of ['9876543210', '+91 (98765) 43210', '919876543210', '00919876543210']) {
    const payload = buildCrmOpportunity('enquiry', { ...enquiry, phoneNumber });
    assert.deepEqual(payload.pocPhoneNumber, {
      primaryPhoneNumber: '9876543210', primaryPhoneCallingCode: '+91', primaryPhoneCountryCode: 'IN',
    });
  }
  const international = buildCrmOpportunity('enquiry', { ...enquiry, phoneNumber: '+44 20 7946 0123' });
  assert.deepEqual(international.pocPhoneNumber, {
    primaryPhoneNumber: '2079460123', primaryPhoneCallingCode: '+44', primaryPhoneCountryCode: 'GB',
  });
  const malformed = buildCrmOpportunity('enquiry', { ...enquiry, phoneNumber: 'call later', email: 'not-an-email' });
  assert.equal(malformed.pocPhoneNumber, undefined);
  assert.equal(malformed.companyEmail, undefined);
  assert.match(malformed.description, /Phone: call later/);
});

test('Indian landlines include country metadata required by the CRM phone parser', () => {
  // Twenty parses a national number with the supplied calling/country codes.
  // Sending bare digits without either code caused the production HTTP 400.
  assert.throws(() => parsePhoneNumberWithError('912234567890'), /INVALID_COUNTRY/);
  for (const phoneNumber of ['2234567890', '02234567890', '912234567890', '+91 22 3456 7890', '00912234567890']) {
    const payload = buildCrmOpportunity('enquiry', { ...enquiry, phoneNumber });
    assert.deepEqual(payload.pocPhoneNumber, {
      primaryPhoneNumber: '2234567890', primaryPhoneCallingCode: '+91', primaryPhoneCountryCode: 'IN',
    }, phoneNumber);
  }
});

test('unsupported optional phone values cannot block either kind of lead and remain in the description', () => {
  for (const type of ['enquiry', 'customer_request']) {
    for (const phone of ['123456789012', '1234567', '+999123456789', '000000000000',
      '1'.repeat(20), '+91 98765 43210 ext 123', 'not a phone']) {
      const record = type === 'enquiry' ? { ...enquiry, phoneNumber: phone } : { ...request, phone_number: phone };
      const payload = buildCrmOpportunity(type, record);
      assert.equal(payload.pocPhoneNumber, undefined, `${type}/${phone}`);
      assert.ok(payload.description.includes(`Phone: ${phone}`));
      assert.equal(payload.stage, 'NEW_LEAD');
      assert.deepEqual(payload.assignedTo, []);
    }
  }
});

test('international prefixes and non-geographic numbers survive the actual CRM parsing contract', () => {
  const examples = [
    ['0044 20 7946 0123', '+442079460123', 'GB'],
    ['+1 (202) 555-0123', '+12025550123', 'US'],
    ['+800 1234 5678', '+80012345678', undefined],
    ['9876543210', '+919876543210', 'IN'],
    ['912234567890', '+912234567890', 'IN'],
  ];
  for (const [phoneNumber, expectedNumber, expectedCountry] of examples) {
    const payload = buildCrmOpportunity('enquiry', { ...enquiry, phoneNumber });
    const fields = payload.pocPhoneNumber;
    const parsed = parsePhoneNumberWithError(fields.primaryPhoneNumber, {
      defaultCallingCode: fields.primaryPhoneCallingCode?.replace(/\+/g, ''),
      defaultCountry: fields.primaryPhoneCountryCode,
    });
    assert.equal(parsed.number, expectedNumber);
    assert.equal(fields.primaryPhoneCountryCode, expectedCountry);
    assert.ok(payload.description.includes(`Phone: ${phoneNumber}`));
  }
});

function configure(t) {
  for (const [key, value] of Object.entries({ WEBSITE_CRM_ENABLED: 'true', TWENTY_CRM_BASE_URL: 'https://crm.example.test/', TWENTY_CRM_API_KEY: 'test-secret' })) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
  t.mock.method(console, 'log', () => {});
  return t.mock.method(console, 'error', () => {});
}

test('one authenticated bounded POST confirms the created CRM ID', async t => {
  configure(t);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://crm.example.test/rest/opportunities');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).gclidGoogleAds, 'available-click');
    return Response.json({ data: { createOpportunity: { id: crmId } } }, { status: 201 });
  });
  assert.deepEqual(await crmService.sendLead('enquiry', enquiry, { gclid: 'available-click' }), { success: true, crmId });
  assert.equal(fetch.mock.callCount(), 1);
});

test('CRM HTTP/network/timeout/malformed-response failures are contained and never retried', async t => {
  const log = configure(t);
  const cases = [
    [() => Response.json({ error: 'private contact and secret' }, { status: 401 }), 'http_401'],
    [() => Response.json({}, { status: 429 }), 'http_429'],
    [() => Response.json({}, { status: 500 }), 'http_500'],
    [() => Response.json({}), 'invalid_response'],
    [() => new Response('invalid-json'), 'invalid_response'],
    [() => { throw new Error('private contact and secret'); }, 'network'],
    [() => { throw new DOMException('private contact', 'TimeoutError'); }, 'timeout'],
  ];
  for (const [reply, error] of cases) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => reply());
    assert.deepEqual(await crmService.sendLead('enquiry', enquiry), { success: false, error });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
  assert.doesNotMatch(JSON.stringify(log.mock.calls), /private contact|test-secret|Asha|98765/);
});

test('disabled/excluded delivery never calls CRM and missing credentials fail visibly', async t => {
  configure(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  process.env.WEBSITE_CRM_ENABLED = 'false';
  assert.equal((await crmService.sendLead('enquiry', enquiry)).reason, 'disabled');
  process.env.WEBSITE_CRM_ENABLED = 'true';
  assert.equal((await crmService.sendLead('enquiry', { ...enquiry, source: 'edge-beta' })).reason, 'excluded');
  delete process.env.TWENTY_CRM_API_KEY;
  assert.equal((await crmService.sendLead('enquiry', enquiry)).error, 'configuration');
  assert.equal(fetch.mock.callCount(), 0);
});

test('a successful HTTP status requires a valid CRM ID and cannot inject upstream text into logs', async t => {
  const errorLog = configure(t);
  const infoLog = console.log;
  const invalidIds = [undefined, null, 42, {}, '', ' ', 'private-contact@example.com\nforged log', `${crmId}\n`, `${crmId}\r\n`];
  const bodies = [null, [], ...invalidIds.map(id => ({ data: { createOpportunity: { id } } })),
    { data: { createOpportunity: { id: crmId } }, errors: [{ message: 'private upstream error' }] }];
  for (const body of bodies) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    assert.deepEqual(await crmService.sendLead('enquiry', enquiry), { success: false, error: 'invalid_response' });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
  assert.equal(infoLog.mock.callCount(), 0);
  assert.doesNotMatch(JSON.stringify(errorLog.mock.calls), /private|forged|test-secret|Asha|98765/);
});

test('the 10-second deadline cancels both a pending request and a stalled response body without retrying', async t => {
  configure(t);
  for (const stalledAt of ['request', 'body']) {
    const controller = new AbortController();
    const deadline = t.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, 10_000);
      return controller.signal;
    });
    const fetch = t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
      const waiting = () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      if (stalledAt === 'request') return waiting();
      return { ok: true, status: 201, json: waiting };
    });
    const delivery = crmService.sendLead('enquiry', enquiry);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort(new DOMException('private timeout detail', 'TimeoutError'));
    assert.deepEqual(await delivery, { success: false, error: 'timeout' });
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(deadline.mock.callCount(), 1);
    fetch.mock.restore();
    deadline.mock.restore();
  }
});
