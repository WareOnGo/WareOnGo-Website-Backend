import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../models/prismaClient.js';
import { createCustomerRequest } from '../controllers/customerRequestController.js';
import { listingEnquiryData } from '../utils/listingEnquiry.js';
import notificationService from '../utils/notificationService.js';
import sheetsService from '../utils/sheetsService.js';
import crmService, { buildCrmOpportunity } from '../utils/crmService.js';

const shortlist = { source: 'listing-shortlist', full_name: ' Test Buyer ', phone_number: '9876543210',
  required_space_sqft: 25000, preferred_location: ' Bengaluru ', listing_filters: { city: 'Bengaluru', warehouseTypes: ['PEB'], fireCompliance: 'yes' } };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('shortlist preserves area and filters in the saved record and every downstream format', async t => {
  const { data } = listingEnquiryData(shortlist);
  assert.equal(data.full_name, 'Test Buyer');
  assert.equal(data.company_name, null);
  const requirements = JSON.parse(data.additional_requirements);
  assert.equal(requirements.requiredSpaceSqft, 25000);
  assert.equal(requirements.source, 'listing-shortlist');
  assert.deepEqual(requirements.filters, shortlist.listing_filters);
  assert.match(notificationService.formatCustomerRequestEmail(data).message, /25000|25,000/);
  assert.match(buildCrmOpportunity('customer_request', data).description, /25000|25,000/);
  const append = t.mock.method(sheetsService, 'appendRow', async () => ({ success: true }));
  await sheetsService.appendCustomerRequest(data);
  assert.match(append.mock.calls[0].arguments[1].comments, /25,000 sqft/);
  assert.match(append.mock.calls[0].arguments[1].comments, /PEB/);
});

test('phone-only callback stores an absent name without inventing a person or company', () => {
  const { data } = listingEnquiryData({ source: 'listing-advisor-callback', phone_number: '+91 9876543210' });
  assert.equal(data.full_name, '');
  assert.equal(data.company_name, null);
  assert.equal(data.preferred_location, null);
  assert.match(data.additional_requirements, /Advisor callback requested/);
  assert.equal(buildCrmOpportunity('customer_request', data).pocName, undefined);
});

test('compact requests reject malformed names, area and phone values before persistence', () => {
  for (const full_name of ['', '  ', {}, null]) assert.ok(listingEnquiryData({ ...shortlist, full_name }).fields.includes('full_name'));
  for (const required_space_sqft of [undefined, '25000', 0, -1, 0.5, Infinity, 100000001]) {
    assert.ok(listingEnquiryData({ ...shortlist, required_space_sqft }).fields.includes('required_space_sqft'));
  }
  for (const phone_number of ['-------', '123', 1234567890, null, '1234567890123456', '12++3456789']) {
    assert.ok(listingEnquiryData({ ...shortlist, phone_number }).fields.includes('phone_number'));
  }
  assert.equal(listingEnquiryData({ source: 'unknown' }), null);
});

test('overlong phone input is rejected, never truncated into a different valid number', () => {
  const result = listingEnquiryData({ ...shortlist, phone_number: '9876543210' + ' '.repeat(15) + '123' });
  assert.ok(result.fields?.includes('phone_number'));
});

test('both compact forms save first, then use the existing CRM, email and Sheets chain', async t => {
  const original = prisma.customer_request.create;
  const saved = [];
  prisma.customer_request.create = async ({ data }) => { const row = { id: BigInt(saved.length + 1), ...data }; saved.push(row); return row; };
  t.after(() => { prisma.customer_request.create = original; });
  const crm = t.mock.method(crmService, 'sendLead', async () => ({ success: true }));
  const email = t.mock.method(notificationService, 'sendCustomerRequestNotification', async () => ({ success: true }));
  const sheet = t.mock.method(sheetsService, 'appendCustomerRequest', async () => ({ success: true }));
  for (const body of [shortlist, { source: 'listing-advisor-callback', phone_number: '9876543210' }]) {
    const res = response();
    await createCustomerRequest({ body: { ...body, gclid: 'test-click', pagePath: '/listings' } }, res);
    assert.equal(res.code, 201);
    assert.equal(typeof res.body.id, 'string');
    await new Promise(resolve => setImmediate(resolve));
  }
  for (const operation of [crm, email, sheet]) assert.equal(operation.mock.callCount(), 2);
  assert.deepEqual(crm.mock.calls[0].arguments[1], saved[0]);
  assert.equal(crm.mock.calls[0].arguments[2].gclid, 'test-click');
  assert.deepEqual(email.mock.calls[1].arguments[0], saved[1]);
  assert.deepEqual(sheet.mock.calls[1].arguments[0], saved[1]);
  const invalid = response();
  await createCustomerRequest({ body: { ...shortlist, required_space_sqft: 0 } }, invalid);
  assert.equal(invalid.code, 400);
  const oldForm = response();
  await createCustomerRequest({ body: { full_name: 'Test Buyer', phone_number: '9876543210', preferred_location: 'Bengaluru', additional_requirements: 'Loading docks' } }, oldForm);
  assert.equal(oldForm.code, 400);
  assert.ok(oldForm.body.fields.includes('company_name'));
  assert.equal(saved.length, 2);
});
