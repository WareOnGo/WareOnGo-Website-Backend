import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import prisma from '../models/prismaClient.js';
import { getMicromarketAdPages } from '../controllers/adPageController.js';
import { parseMicromarketAdPages } from '../services/micromarketAdContent.js';
const page = JSON.parse(fs.readFileSync(new URL('../data/micromarket-ad-pages/peenya.json', import.meta.url), 'utf8'));
const response = () => ({ code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, rows) {
  const original = prisma.micromarketAdPage.findMany;
  prisma.micromarketAdPage.findMany = t.mock.fn(async () => { if (rows instanceof Error) throw rows; return rows; });
  t.after(() => { prisma.micromarketAdPage.findMany = original; });
  t.mock.method(console, 'error', () => {});
}
test('public micromarket ad reads select only approved content and exclude both kinds of null', async t => {
  mock(t, [{ citySlug: 'bengaluru', slug: 'peenya', name: 'Peenya', publishedContent: page, draftContent: { private: true } }]);
  const res = response(); await getMicromarketAdPages({}, res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, { data: [page] });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(prisma.micromarketAdPage.findMany.mock.calls[0].arguments[0].select, { citySlug: true, slug: true, name: true, publishedContent: true });
  assert.equal(prisma.micromarketAdPage.findMany.mock.calls[0].arguments[0].where.publishedContent.not, Prisma.AnyNull);
});
for (const [name, rows] of [
  ['wrong identity', [{ citySlug: 'bengaluru', slug: 'other', name: 'Peenya', publishedContent: page }]],
  ['shared override', [{ citySlug: 'bengaluru', slug: 'peenya', name: 'Peenya', publishedContent: { ...page, images: {} } }]],
  ['database outage', new Error('private credentials')],
]) test(`${name} fails closed without exposing private content`, async t => {
  mock(t, rows); const res = response(); await getMicromarketAdPages({}, res);
  assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.body), /private|credentials/);
});
test('duplicate URLs, unsupported cities and incomplete approved copy are rejected', () => {
  assert.throws(() => parseMicromarketAdPages([page, page]), /Duplicate/);
  assert.throws(() => parseMicromarketAdPages([{ ...page, citySlug: 'mumbai' }]), /unsupported/);
  assert.throws(() => parseMicromarketAdPages([{ ...page, area: { ...page.area, whereItIs: '' } }]), /add text/);
});
test('Hosur and the combined area expose approved local copy through the same API', async t => {
  const areas = ['hosur', 'electronic-city-jigani-bommasandra'].map(slug => JSON.parse(fs.readFileSync(new URL('../data/micromarket-ad-pages/' + slug + '.json', import.meta.url), 'utf8')));
  mock(t, areas.map(content => ({ citySlug: content.citySlug, slug: content.slug, name: content.name, publishedContent: content, draftContent: { private: true } })));
  const res = response(); await getMicromarketAdPages({}, res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, { data: areas });
  assert.doesNotMatch(JSON.stringify(res.body), /private/);
  assert.throws(() => parseMicromarketAdPages([{ ...areas[0], slug: 'attibele' }]), /identity/);
});
