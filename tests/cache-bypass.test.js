import assert from 'node:assert/strict';
import { test } from 'node:test';
import warehouses from '../services/warehouseService.js';
import locations from '../services/locationService.js';
import micromarkets from '../services/micromarketService.js';
import prisma from '../models/prismaClient.js';
import redis from '../services/redisService.js';
import { getWarehouses } from '../controllers/warehouseController.js';
import { getLocations, getLocation } from '../controllers/locationDataController.js';
import { getMicromarkets, getMicromarket } from '../controllers/micromarketDataController.js';

const live = { id: 1000, city: 'Bengaluru', state: 'Karnataka', micromarket: ['North Belt'],
  totalSpaceSqft: [10000], warehouseType: 'PEB', ratePerSqft: '20', photos: null, photosWebp: null };
function database(t) {
  const unsafe = prisma.$queryRawUnsafe;
  prisma.$queryRawUnsafe = async () => [];
  t.after(() => { prisma.$queryRawUnsafe = unsafe; });
  const original = prisma.warehouse.findMany;
  const query = t.mock.fn(async options => {
    assert.deepEqual(options.where, { visibility: true });
    return [live];
  });
  prisma.warehouse.findMany = query;
  const count = prisma.warehouse.count;
  prisma.warehouse.count = t.mock.fn(async () => 1);
  const transaction = prisma.$transaction;
  const raw = prisma.$queryRaw;
  prisma.$queryRaw = async statement => {
    if (statement.text.includes('count(*)')) return [{ total: 1 }];
    return query({ where: { visibility: true } });
  };
  prisma.$transaction = async promises => Promise.all(promises);
  t.after(() => { prisma.warehouse.findMany = original; prisma.warehouse.count = count; prisma.$transaction = transaction; prisma.$queryRaw = raw; });
  return query;
}

for (const [label, read, ids] of [
  ['warehouses', options => warehouses.getWarehouses({}, 1, 50, options), result => result.data.map(w => w.id)],
  ['locations', options => locations.getLocations(options), result => result.data.cities.flatMap(c => c.listingIds)],
  ['micromarkets', options => micromarkets.getMicromarkets(options), result => result.data.flatMap(m => m.listingIds)],
]) {
  test(`${label}: visitors retain cache hits; fresh builds exclude cached hidden warehouse 2027 without changing Redis`, async t => {
    const query = database(t);
    const stale = { data: [{ id: 2027 }], stale: true };
    const get = t.mock.method(redis, 'get', async () => JSON.stringify(stale));
    const set = t.mock.method(redis, 'setEx', async () => { throw new Error('must not write'); });
    const del = t.mock.method(redis, 'del', async () => { throw new Error('must not evict'); });
    const expectedStale = label === 'warehouses' ? { ...stale, data: [{ id: 2027, images: [], photos: [], photosWebp: [] }] } : stale;
    assert.deepEqual(await read(), expectedStale);
    assert.equal(query.mock.callCount(), 0);
    const result = await read({ bypassCache: true });
    assert.ok(!ids(result).includes(2027));
    assert.equal(query.mock.callCount(), 1);
    assert.equal(get.mock.callCount(), 1, 'fresh requests never consult Redis');
    assert.equal(set.mock.callCount(), 0);
    assert.equal(del.mock.callCount(), 0);
    assert.deepEqual(await read(), expectedStale, 'a build must not replace visitor cache contents');
  });
}

test('fresh database errors propagate instead of serving a stale successful response', async t => {
  database(t);
  const get = t.mock.method(redis, 'get', async () => JSON.stringify({ data: [{ id: 2027 }] }));
  prisma.$transaction = async () => { throw new Error('database unavailable'); };
  await assert.rejects(warehouses.getWarehouses({}, 1, 50, { bypassCache: true }), /database unavailable/);
  assert.equal(get.mock.callCount(), 0);
});

const response = () => ({ headers: {}, code: 200,
  set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test('all inventory controllers acknowledge fresh reads and pass the bypass to their service', async t => {
  const list = t.mock.method(warehouses, 'getWarehouses', async (...args) => {
    assert.equal(args[3].bypassCache, true); return { data: [] };
  });
  t.mock.method(locations, 'getLocations', async options => {
    assert.equal(options.bypassCache, true);
    return { gates: {}, data: { cities: [{ slug: 'bengaluru' }], states: [] } };
  });
  t.mock.method(micromarkets, 'getMicromarkets', async options => {
    assert.equal(options.bypassCache, true);
    return { gates: {}, data: [{ citySlug: 'bengaluru', slug: 'north-belt' }] };
  });
  for (const [controller, params] of [
    [getWarehouses, {}], [getLocations, {}], [getLocation, { kind: 'city', slug: 'bengaluru' }],
    [getMicromarkets, {}], [getMicromarket, { citySlug: 'bengaluru', slug: 'north-belt' }],
  ]) {
    const res = response();
    await controller({ headers: { 'cache-control': 'NO-CACHE, no-store' }, query: {}, params }, res);
    assert.equal(res.code, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Wareongo-Cache'], 'bypass');
  }
  assert.equal(list.mock.callCount(), 1);
});

test('ordinary requests keep application caching but revalidate image-bearing HTTP responses', async t => {
  t.mock.method(warehouses, 'getWarehouses', async (...args) => {
    assert.equal(args[3].bypassCache, false); return { data: [] };
  });
  for (const header of [undefined, 'max-age=0', 'x-no-cache', 'private']) {
    const res = response();
    await getWarehouses({ headers: { 'cache-control': header }, query: {} }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.headers, { 'X-Wareongo-Listing-Filters': '2', 'X-Wareongo-Image-Policy': 'approved-4-8-v1', 'Cache-Control': 'no-cache' });
  }
});
