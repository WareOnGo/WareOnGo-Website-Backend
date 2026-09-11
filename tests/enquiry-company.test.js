import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../models/prismaClient.js';
import { createEnquiry } from '../controllers/enquiryController.js';
import notificationService from '../utils/notificationService.js';
import sheetsService from '../utils/sheetsService.js';

const response = () => ({ code: 200, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; } });
const contact = { name: ' Enquiry Test ', phoneNumber: '9876543210', email: null };

function mockServices(t) {
  const originalCreate = prisma.enquiry.create;
  const create = t.mock.fn(async ({ data }) => ({ id: 1, ...data }));
  prisma.enquiry.create = create;
  t.after(() => { prisma.enquiry.create = originalCreate; });
  const notify = t.mock.method(notificationService, 'sendEnquiryNotification', async () => ({ success: true }));
  const sheet = t.mock.method(sheetsService, 'appendEnquiry', async () => ({ success: true }));
  return { create, notify, sheet };
}

for (const source of ['warehouse-card-123-callback', 'warehouse-detail-456-callback', 'warehouse-card-123-enquiry']) {
  test(`${source} rejects missing, blank and non-string company names before saving`, async t => {
    const mocks = mockServices(t);
    for (const companyName of [undefined, null, '', '  \t ', 42, {}, []]) {
      const res = response();
      await createEnquiry({ body: { ...contact, source, companyName } }, res);
      assert.equal(res.code, 400);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mocks.create.mock.callCount(), 0);
    assert.equal(mocks.notify.mock.callCount(), 0);
    assert.equal(mocks.sheet.mock.callCount(), 0);
  });

  test(`${source} saves the trimmed company and forwards it to both notifications`, async t => {
    const mocks = mockServices(t);
    const res = response();
    await createEnquiry({ body: { ...contact, source: ` ${source} `, companyName: '  Example Logistics  ' } }, res);
    assert.equal(res.code, 201);
    assert.deepEqual(mocks.create.mock.calls[0].arguments[0].data, {
      name: 'Enquiry Test', phoneNumber: contact.phoneNumber, email: null, source, companyName: 'Example Logistics',
    });
    assert.equal(res.body.companyName, 'Example Logistics');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(mocks.notify.mock.calls[0].arguments[0], res.body);
    assert.deepEqual(mocks.sheet.mock.calls[0].arguments[0], res.body);
  });
}

test('navbar and other general contact enquiries still accept no company name', async t => {
  mockServices(t);
  for (const source of ['homepage', 'Website Contact Form']) {
    const res = response();
    await createEnquiry({ body: { ...contact, source } }, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.companyName, null);
  }
  await new Promise(resolve => setImmediate(resolve));
});

test('general contact enquiries reject invalid company types', async t => {
  const mocks = mockServices(t);
  const res = response();
  await createEnquiry({ body: { ...contact, source: 'homepage', companyName: {} } }, res);
  assert.equal(res.code, 400);
  assert.equal(mocks.create.mock.callCount(), 0);
});

test('email and spreadsheet formatting retain company name and callback source', async t => {
  const enquiry = { id: 1, ...contact, companyName: 'Example Logistics', source: 'warehouse-card-123-callback' };
  const message = notificationService.formatEnquiryEmail(enquiry).message;
  assert.match(message, /Company:\s+Example Logistics/);
  assert.match(message, /warehouse-card-123-callback/);
  const append = t.mock.method(sheetsService, 'appendRow', async () => ({ success: true }));
  await sheetsService.appendEnquiry(enquiry);
  assert.equal(append.mock.calls[0].arguments[0], 'enquiry');
  assert.equal(append.mock.calls[0].arguments[1].companyName, 'Example Logistics');
  assert.equal(append.mock.calls[0].arguments[1].source, enquiry.source);
});
