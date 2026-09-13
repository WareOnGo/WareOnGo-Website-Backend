import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../models/prismaClient.js';
import { getServicePages, getServicePage, SERVICE_SLUGS } from '../controllers/servicePageController.js';

const page = slug => ({ slug, title: 'Approved service', seoTitle: 'SEO', description: 'Description', summary: 'Introduction', keywords: [], blocks: [{ kind: 'p', text: 'Approved writing' }], faqs: [] });
const response = () => ({ code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, method, fn) {
  const original = prisma.servicePage[method];
  prisma.servicePage[method] = t.mock.fn(fn);
  t.after(() => { prisma.servicePage[method] = original; });
  return prisma.servicePage[method];
}
test('public API exposes written approved revisions, with no drafts or blog metadata', async t => {
  const query = mock(t, 'findMany', async () => SERVICE_SLUGS.map(slug => ({ slug,
    publishedContent: { ...page(slug), author: 'Author', privateField: 'secret' }, draftContent: { title: 'Private draft' },
  })));
  const res = response(); await getServicePages({}, res);
  assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(query.mock.calls[0].arguments[0].select, { slug: true, publishedContent: true });
  assert.deepEqual(res.body.data, SERVICE_SLUGS.map(page));
});
test('missing, unpublished, blank and heading-only pages produce an empty collection', async t => {
  mock(t, 'findMany', async () => [
    { slug: SERVICE_SLUGS[0], publishedContent: null, draftContent: page(SERVICE_SLUGS[0]) },
    { slug: SERVICE_SLUGS[1], publishedContent: { ...page(SERVICE_SLUGS[1]), blocks: [] } },
    { slug: SERVICE_SLUGS[2], publishedContent: { ...page(SERVICE_SLUGS[2]), blocks: [{ kind: 'p', text: ' ' }] } },
    { slug: SERVICE_SLUGS[3], publishedContent: { ...page(SERVICE_SLUGS[3]), blocks: [{ kind: 'h2', text: 'Heading' }] } },
  ]);
  const res = response(); await getServicePages({}, res); assert.deepEqual(res.body, { data: [] });
});
test('direct service URLs return 404 until written and published', async t => {
  mock(t, 'findUnique', async () => ({ slug: SERVICE_SLUGS[0], publishedContent: null, draftContent: page(SERVICE_SLUGS[0]) }));
  for (const slug of [SERVICE_SLUGS[0], 'manpower-services', 'unknown']) {
    const res = response(); await getServicePage({ params: { slug } }, res); assert.equal(res.code, 404);
  }
});
test('API outages fail visibly instead of returning an empty successful collection', async t => {
  mock(t, 'findMany', async () => { throw new Error('private detail'); });
  t.mock.method(console, 'error', () => {});
  const res = response(); await getServicePages({}, res);
  assert.equal(res.code, 500); assert.equal(res.body.data, undefined); assert.doesNotMatch(JSON.stringify(res.body), /private detail/);
});
