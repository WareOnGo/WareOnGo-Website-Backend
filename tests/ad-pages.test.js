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
  assert.equal(parseAdPage(page).version, 3);
  assert.equal(parseAdPage(page).areaGroups.length, 2);
  assert.throws(() => parseAdPages([page, page]), /missing/);
  for (const url of ['javascript:alert(1)', '//unsafe.example/image.webp', 'http://unsafe.example/image.webp', 'https://user:password@example.test/a.webp']) {
    const bad = structuredClone(page); bad.images.services.url = url;
    assert.throws(() => parseAdPage(bad), /HTTPS/);
  }
});

test('public reads upgrade older approved content without changing saved revisions', async t => {
  const older = JSON.parse(fs.readFileSync(new URL('./fixtures/bangalore-v1.json', import.meta.url), 'utf8'));
  older.copy.heroHeading = 'An existing approved heading';
  older.heroSteps = [];
  older.areaRows = [];
  const before = structuredClone(older);
  mock(t, [{ slug: 'bangalore', publishedContent: older }]);
  const res = response(); await getAdPages({}, res);
  assert.equal(res.code, 200);
  const upgraded = res.body.data[0];
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.copy.heroHeading, older.copy.heroHeading);
  assert.deepEqual(upgraded.areaGroups, page.areaGroups);
  assert.deepEqual(upgraded.rentGuide, page.rentGuide);
  assert.deepEqual(upgraded.faqs, page.faqs);
  assert.equal('heroSteps' in upgraded, false);
  assert.deepEqual(older, before);
  assert.deepEqual(parseAdPage(upgraded), upgraded);
});

for (const version of [1, 2]) test(`version ${version} upgrades mobile copy and independent map photos without mutating history`, () => {
  const saved = JSON.parse(fs.readFileSync(new URL(`./fixtures/bangalore-v${version}.json`, import.meta.url), 'utf8'));
  saved.images['warehouse-2255'].url = 'https://example.test/approved-doddaballapur.webp';
  const before = structuredClone(saved);
  const upgraded = parseAdPage(saved);
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.benefits[0].mobileBody, '');
  assert.equal(upgraded.audiences[0].mobileTitle, '');
  assert.equal(upgraded.audiences[0].mobileBody, '');
  assert.equal(upgraded.images['micromarket-doddaballapur'].url, saved.images['warehouse-2255'].url);
  for (const area of ['bidadi', 'sarjapur', 'north-bangalore', 'indiranagar', 'marathalli', 'jp-nagar', 'hsr']) {
    assert.ok(upgraded.images[`micromarket-${area}`].url.endsWith(`micromarket-${area}.webp`));
  }
  upgraded.benefits[0].mobileBody = 'Approved mobile benefit';
  upgraded.audiences[0].mobileTitle = 'Approved mobile audience';
  upgraded.audiences[0].mobileBody = 'Approved audience description';
  upgraded.images['micromarket-doddaballapur'].url = 'https://example.test/independent-photo.webp';
  assert.equal(saved.images['warehouse-2255'].url, before.images['warehouse-2255'].url);
  assert.deepEqual(parseAdPage(upgraded), upgraded);
  assert.deepEqual(saved, before);
});
