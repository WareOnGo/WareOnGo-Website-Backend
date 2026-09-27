import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import prisma from '../models/prismaClient.js';
import { getAdPages } from '../controllers/adPageController.js';
import { parseAdPage, parseAdPages } from '../services/adPageContent.js';

const page = JSON.parse(fs.readFileSync(new URL('../data/ad-pages/bangalore.json', import.meta.url), 'utf8'));
const response = () => ({ code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, value) {
  const original = prisma.adPage.findMany;
  prisma.adPage.findMany = t.mock.fn(async () => { if (value instanceof Error) throw value; return value; });
  t.after(() => { prisma.adPage.findMany = original; });
  t.mock.method(console, 'error', () => {});
}
test('public ad content exposes only the approved version', async t => {
  mock(t, [{ slug: 'bangalore', publishedContent: { ...page, privateNote: 'private' }, draftContent: { copy: 'Private draft' }, deployedContent: { copy: 'Old copy' } }]);
  const res = response(); await getAdPages({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body, { data: [page] });
  assert.deepEqual(prisma.adPage.findMany.mock.calls[0].arguments[0].select, { slug: true, publishedContent: true });
});
for (const [name, rows] of [['missing seed', []], ['missing approved version', [{ slug: 'bangalore', publishedContent: null }]], ['wrong URL', [{ slug: 'other', publishedContent: page }]], ['outage', new Error('private database details')]]) {
  test(`${name} fails visibly instead of silently replacing or removing the campaign page`, async t => {
    mock(t, rows); const res = response(); await getAdPages({}, res);
    assert.equal(res.code, 500); assert.equal(res.body.data, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /private database/);
  });
}
test('content validation permits imported placeholders and complete typed content', () => {
  assert.deepEqual(parseAdPage(page), page);
  assert.equal(parseAdPage(page).heroPoints[1].value, '[X]');
  assert.throws(() => parseAdPages([page, page]), /missing/);
  for (const url of ['javascript:alert(1)', '//unsafe.example/image.webp', 'http://unsafe.example/image.webp', 'https://user:password@example.test/a.webp']) {
    const bad = structuredClone(page); bad.images.services.url = url;
    assert.throws(() => parseAdPage(bad), /HTTPS/);
  }
});
