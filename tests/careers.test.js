import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../models/prismaClient.js';
import { getCareers } from '../controllers/careersController.js';

const response = () => ({ code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const role = { id: 'designer', title: 'Designer', summary: 'Design useful things.', department: 'Design', location: 'India', employmentType: 'Full-time', applyUrl: 'https://jobs.example.com/designer', isOpen: true };
function mockRead(t, callback) {
  const original = prisma.careersPage.findUnique;
  prisma.careersPage.findUnique = t.mock.fn(callback);
  t.after(() => { prisma.careersPage.findUnique = original; });
  return prisma.careersPage.findUnique;
}

test('the public endpoint selects approved content, strips private fields and omits closed roles', async t => {
  const read = mockRead(t, async () => ({
    draftContent: { title: 'Private draft' },
    publishedContent: { title: 'Approved title', applicationEmail: 'hiring@example.com', internalNote: 'Internal note', roles: [{ ...role, duration: '3 months', compensation: '₹25,000 / month', internalNote: 'Internal role note' }, { ...role, id: 'closed', isOpen: false }] },
  }));
  const res = response(); await getCareers({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(read.mock.calls[0].arguments[0].select, { publishedContent: true });
  assert.equal(res.body.data.title, 'Approved title');
  assert.equal(res.body.data.roles.length, 1);
  assert.equal(res.body.data.roles[0].duration, '3 months');
  assert.equal(res.body.data.roles[0].compensation, '₹25,000 / month');
  assert.doesNotMatch(JSON.stringify(res.body), /Private draft|Internal note|Internal role note|closed|draftContent/);
});

test('older roles without optional chip fields still return valid public data', async t => {
  mockRead(t, async () => ({ publishedContent: { roles: [role] } }));
  const res = response(); await getCareers({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.roles[0].duration, '');
  assert.equal(res.body.data.roles[0].compensation, '');
});

test('approved widget copy is public, without exposing private applications', async t => {
  const widget = { interestTitle: 'Say hello', interestDescription: 'Tell us about yourself.', interestSubmitLabel: 'Introduce yourself', interestSuccessMessage: 'Thanks for introducing yourself.' };
  mockRead(t, async () => ({ publishedContent: { ...widget, roles: [role], applications: [{ email: 'private@example.com' }] } }));
  const res = response(); await getCareers({}, res);
  assert.equal(res.code, 200);
  for (const [key, value] of Object.entries(widget)) assert.equal(res.body.data[key], value);
  assert.doesNotMatch(JSON.stringify(res.body), /private@example|applications/);
});

test('no approved revision is an intentional empty page, never a draft fallback', async t => {
  mockRead(t, async () => ({ draftContent: { roles: [role] }, publishedContent: null }));
  const res = response(); await getCareers({}, res);
  assert.equal(res.code, 200); assert.equal(res.body.data, null);
});

test('database failures are errors rather than valid empty content', async t => {
  mockRead(t, async () => { throw new Error('private DB connection'); });
  t.mock.method(console, 'error', () => {});
  const res = response(); await getCareers({}, res);
  assert.equal(res.code, 500); assert.equal(res.body.data, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /private DB connection/);
});
