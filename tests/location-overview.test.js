import assert from 'node:assert/strict';
import { test } from 'node:test';
import locations from '../services/locationService.js';
import { parentStatesFor } from '../services/micromarketService.js';
import { getLocations, getLocation } from '../controllers/locationDataController.js';
import { getLocationPages, getLocationPage } from '../controllers/locationPageController.js';
import prisma from '../models/prismaClient.js';
import redis from '../services/redisService.js';

const row = (id, city, state, rate = '20') => ({ id, city, state, ratePerSqft: rate,
  totalSpaceSqft: [10000], clearHeightFt: '30', numberOfDocks: '4',
  warehouseType: 'PEB', compliances: '', flooringType: null, warehouseData: null });
function mockPrisma(t, table, method, fn) {
  const original = table[method];
  const mock = t.mock.fn(fn);
  table[method] = mock;
  t.after(() => { table[method] = original; });
  return mock;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('cities aggregate aliases, use micromarket geography, and only compare cities within their state', async t => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row(i + 1, i % 2 ? 'Bangalore' : 'Bengaluru', i === 0 ? 'Tamil Nadu' : 'Karnataka', `${10 + i * 2}`)),
    ...Array.from({ length: 5 }, (_, i) => row(20 + i, 'Mysuru', 'Karnataka', '30')),
    ...Array.from({ length: 5 }, (_, i) => row(40 + i, 'Chennai', 'Tamil Nadu', '40')),
    row(80, 'Unknown State City', 'N/A'), row(81, 'Small Town', 'Karnataka'),
  ];
  const query = mockPrisma(t, prisma.warehouse, 'findMany', async () => rows);
  t.mock.method(redis, 'get', async () => null);
  const cache = t.mock.method(redis, 'setEx', async () => {});
  const result = await locations.getLocations();
  assert.deepEqual(query.mock.calls[0].arguments[0].where, { visibility: true });
  const city = result.data.cities.find(c => c.slug === 'bengaluru');
  assert.equal(city.listings, 6);
  assert.deepEqual(city.listingIds, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(city.rent, { min: 10, median: 15, max: 20 });
  assert.equal(city.parentState, parentStatesFor(rows).get('Bengaluru'));
  assert.equal(city.stateSlug, 'karnataka');
  assert.deepEqual(city.peers.map(p => p.slug).sort(), ['bengaluru', 'mysuru']);
  assert.equal(city.peers.find(p => p.slug === 'mysuru').path, '/listings/city/mysuru');
  assert.equal(result.data.states.find(s => s.slug === 'karnataka').listings, 11);
  assert.equal(result.data.cities.find(c => c.slug === 'small-town').hasPage, false);
  assert.equal(result.data.cities.find(c => c.slug === 'unknown-state-city').stateSlug, null);
  assert.ok(!result.data.states.some(s => s.slug === 'na'));
  assert.equal(cache.mock.calls[0].arguments[0], 'locations:v2');
});

test('same slug in the city and state namespaces resolves to distinct inventories', async t => {
  mockPrisma(t, prisma.warehouse, 'findMany', async () => [row(1, 'Delhi', 'Delhi'), row(2, 'New Delhi', 'Delhi')]);
  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'setEx', async () => {});
  assert.equal((await locations.getLocation('city', 'delhi')).listings, 1);
  assert.equal((await locations.getLocation('state', 'delhi')).listings, 2);
  assert.equal(await locations.getLocation('unknown', 'delhi'), null);
});

test('derived endpoints distinguish malformed kind and missing location', async t => {
  t.mock.method(locations, 'getLocations', async () => ({ data: { cities: [], states: [] }, gates: { locationPageMinListings: 5 } }));
  t.mock.method(locations, 'getLocation', async () => null);
  const list = response(); await getLocations({}, list); assert.equal(list.code, 200);
  const bad = response(); await getLocation({ params: { kind: 'country', slug: 'india' } }, bad); assert.equal(bad.code, 400);
  const absent = response(); await getLocation({ params: { kind: 'city', slug: 'missing' } }, absent); assert.equal(absent.code, 404);
});

test('content endpoints only expose published rows and omit staging/admin fields', async t => {
  const page = { kind: 'CITY', slug: 'bengaluru', name: 'CMS label', status: 'PUBLISHED',
    seoTitle: 'City overview', h1: 'City overview', heroProse: 'Editorial content',
    metaDescription: 'Description', heroImage: null, faqs: [], relatedBlogs: [],
    deployedContent: { private: 'snapshot' }, statOverrides: { rent: { median: 25 } } };
  const all = mockPrisma(t, prisma.locationPage, 'findMany', async () => [page]);
  const one = mockPrisma(t, prisma.locationPage, 'findFirst', async () => page);
  const list = response(); await getLocationPages({}, list);
  assert.deepEqual(all.mock.calls[0].arguments[0].where, { status: 'PUBLISHED' });
  assert.equal(list.body.data[0].kind, 'CITY');
  assert.equal(list.body.data[0].heroImage, undefined);
  assert.equal(list.body.data[0].deployedContent, undefined);
  assert.equal(list.body.data[0].name, undefined);
  const detail = response(); await getLocationPage({ params: { kind: 'city', slug: 'bengaluru' } }, detail);
  assert.deepEqual(one.mock.calls[0].arguments[0].where, { kind: 'CITY', slug: 'bengaluru', status: 'PUBLISHED' });
});
