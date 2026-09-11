import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../models/prismaClient.js';
import { getLegalPages, LEGAL_SLUGS } from '../controllers/legalPageController.js';

const response = () => ({ code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, fn) {
  const original = prisma.legalPage.findMany;
  prisma.legalPage.findMany = t.mock.fn(fn);
  t.after(() => { prisma.legalPage.findMany = original; });
  return prisma.legalPage.findMany;
}

test('public legal endpoint exposes approved content only and bypasses caches', async t => {
  const query = mock(t, async () => LEGAL_SLUGS.map(slug => ({ slug,
    publishedContent: { title: 'Approved', seoTitle: 'SEO', description: 'Description', effectiveDate: '2025-11-01', updated: '2025-11-22', blocks: [{ kind: 'p', text: 'Approved text' }], notice: '', privateField: 'secret' },
    draftContent: { title: 'Private draft' }, deployedContent: { title: 'Old version' },
  })));
  const res = response(); await getLegalPages({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(query.mock.calls[0].arguments[0].select, { slug: true, publishedContent: true });
  assert.deepEqual(res.body.data.map(p => p.slug), LEGAL_SLUGS);
  assert.equal(res.body.data[0].title, 'Approved');
  assert.doesNotMatch(JSON.stringify(res.body), /Private draft|Old version|secret|draftContent|deployedContent/);
});

test('uninitialized legal content cannot masquerade as a valid empty collection', async t => {
  mock(t, async () => []);
  const res = response(); await getLegalPages({}, res);
  assert.equal(res.code, 503); assert.equal(res.body.data, undefined);
});

test('database failure returns a generic error and never falls back to draft content', async t => {
  mock(t, async () => { throw new Error('private database detail'); });
  t.mock.method(console, 'error', () => {});
  const res = response(); await getLegalPages({}, res);
  assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.body), /private database detail/);
});
