import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import prisma from '../models/prismaClient.js';
import { createCareerApplication } from '../controllers/careerApplicationController.js';
import router from '../routes/careerApplicationRoutes.js';

const response = () => ({ code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const valid = { name: ' Asha ', email: ' asha@example.com ', phoneNumber: ' +91 98765 43210 ', note: ' Brand marketing. ' };
function mockCreate(t, callback) {
  const original = prisma.careerApplication.create;
  prisma.careerApplication.create = t.mock.fn(callback);
  t.after(() => { prisma.careerApplication.create = original; });
  return prisma.careerApplication.create;
}

test('career introductions store only explicit careers fields and acknowledge after persistence', async t => {
  const create = mockCreate(t, async () => ({ id: 'private-id' }));
  const res = response();
  await createCareerApplication({ body: { ...valid, gclid: 'sales-click', source: 'homepage', id: 'injected', createdAt: '2000-01-01' } }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { success: true });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(create.mock.calls[0].arguments, [{ data: { name: 'Asha', email: 'asha@example.com', phoneNumber: '+91 98765 43210', note: 'Brand marketing.' } }]);
});

test('optional contact details can be omitted', async t => {
  const create = mockCreate(t, async () => ({}));
  const res = response(); await createCareerApplication({ body: { name: 'Asha', email: 'asha@example.com' } }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(create.mock.calls[0].arguments[0].data, { name: 'Asha', email: 'asha@example.com', phoneNumber: null, note: null });
});

test('malformed, missing, oversized and invalid fields never write', async t => {
  const create = mockCreate(t, async () => ({}));
  for (const body of [null, [], 'text', {}, { ...valid, name: ' ' }, { ...valid, name: 'x'.repeat(101) },
    { ...valid, email: 'invalid' }, { ...valid, email: 'a'.repeat(255) + '@example.com' }, { ...valid, email: {} },
    { ...valid, phoneNumber: 'abc9876543210' }, { ...valid, phoneNumber: '123' }, { ...valid, phoneNumber: '9'.repeat(16) },
    { ...valid, note: [] }, { ...valid, note: 'x'.repeat(2001) }]) {
    const res = response(); await createCareerApplication({ body }, res);
    assert.equal(res.code, 400, JSON.stringify(body)); assert.equal(res.body.success, undefined);
  }
  assert.equal(create.mock.callCount(), 0);
});

test('a failed save never claims success or leaks applicant or database details', async t => {
  mockCreate(t, async () => { throw new Error('private database connection'); });
  const log = t.mock.method(console, 'error', () => {});
  const res = response(); await createCareerApplication({ body: valid }, res);
  assert.equal(res.code, 500); assert.equal(res.body.success, undefined);
  assert.doesNotMatch(JSON.stringify([res.body, log.mock.calls]), /private database|asha@example|98765/);
});

test('public route accepts writes only and rate limits repeated attempts', async t => {
  const create = mockCreate(t, async () => ({}));
  const app = express(); app.use(express.json()); app.use('/career-applications', router);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/career-applications`;
  assert.equal((await fetch(url)).status, 404);
  for (let index = 0; index < 10; index++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
  }
  const limited = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal(limited.status, 429); assert.match((await limited.json()).error, /Too many attempts/);
  assert.equal(create.mock.callCount(), 0);
});
