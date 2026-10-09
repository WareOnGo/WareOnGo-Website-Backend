import assert from 'node:assert/strict';
import { test } from 'node:test';
import locations from '../services/locationService.js';
import { parentStatesFor } from '../services/micromarketService.js';
import { getLocations, getLocation } from '../controllers/locationDataController.js';
import { getLocationPages, getLocationPage } from '../controllers/locationPageController.js';
import { STATE_BORDERS, neighbouringStates } from '../services/stateNeighbours.js';
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
  assert.equal(cache.mock.calls[0].arguments[0], 'locations:v4');
});

test('border config states each edge once and reads both ways', () => {
  const seen = new Set();
  for (const [a, list] of Object.entries(STATE_BORDERS)) for (const b of list) {
    const edge = [a, b].sort().join('|');
    assert.notEqual(a, b);
    assert.ok(!seen.has(edge), `${edge} defined twice`);
    seen.add(edge);
    assert.ok(neighbouringStates(a).includes(b) && neighbouringStates(b).includes(a), edge);
  }
  assert.deepEqual(neighbouringStates('karnataka').sort(), ['andhra-pradesh', 'goa', 'kerala', 'maharashtra', 'tamil-nadu', 'telangana']);
  assert.ok(neighbouringStates('puducherry').includes('andhra-pradesh'));
  assert.deepEqual(neighbouringStates('atlantis'), []);
});

test('fresh location reads apply the locality gate both ways across city aliases and visible inventory', async t => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ ...row(i, i % 2 ? 'Bangalore' : 'Bengaluru', 'Karnataka'),
    visibility: true, micromarket: i < 24 ? ['Nelamangala'] : [] }));
  rows[24].micromarket = ['Makali'];
  rows[24].visibility = false;
  mockPrisma(t, prisma.warehouse, 'findMany', async options => {
    assert.deepEqual(options.where, { visibility: true });
    return rows.filter(r => r.visibility);
  });
  t.mock.method(redis, 'get', () => { throw new Error('fresh reads must bypass stale eligibility'); });
  t.mock.method(redis, 'setEx', () => { throw new Error('fresh reads must not replace visitor cache'); });
  const read = async () => (await locations.getLocations({ bypassCache: true })).data.cities.find(c => c.slug === 'bengaluru');
  const below = await read();
  assert.equal(below.cityOverview.localityTable.taggedListings, 24);
  assert.deepEqual(below.cityOverview.corridors, []);
  assert.equal(below.listingIds.length, 49);
  rows[24].visibility = true;
  const eligible = await read();
  assert.equal(eligible.cityOverview.localityTable.eligible, true);
  assert.equal(eligible.cityOverview.localityTable.baseListings, 25);
  assert.equal(eligible.cityOverview.corridors[0].listings, 25);
  assert.equal(eligible.listingIds.length, 50, 'untagged inventory remains in the listing grid');
  rows[24].micromarket = [];
  const dropped = await read();
  assert.equal(dropped.cityOverview.localityTable.eligible, false);
  assert.deepEqual(dropped.cityOverview.corridors, []);
  assert.equal(dropped.listingIds.length, 50, 'removing a tag must not remove a listing');
});

test('states list bordering states that carry inventory, busiest first; cities do not', async t => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row(i + 1, 'Bengaluru', 'Karnataka')),
    ...Array.from({ length: 4 }, (_, i) => row(10 + i, 'Pune', 'Maharashtra')),
    ...Array.from({ length: 3 }, (_, i) => row(20 + i, 'Hyderabad', 'Telangana')),
    ...Array.from({ length: 3 }, (_, i) => row(25 + i, 'Chennai', 'Tamil Nadu')),
    row(30, 'Kochi', 'Kerala'), row(31, 'Kochi', 'Kerala'), row(32, 'Panaji', 'Goa'), row(33, 'Margao', 'Goa'),
    row(40, 'Gurugram', 'Haryana'),
  ];
  mockPrisma(t, prisma.warehouse, 'findMany', async () => rows);
  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'setEx', async () => {});
  const { data } = await locations.getLocations();
  const state = slug => data.states.find(s => s.slug === slug);
  // Andhra Pradesh borders Karnataka but has no listings; Haryana has listings but no border. Ties go by name.
  assert.deepEqual(state('karnataka').nearbyStates, [{ name: 'Maharashtra', slug: 'maharashtra' },
    { name: 'Tamil Nadu', slug: 'tamil-nadu' }, { name: 'Telangana', slug: 'telangana' },
    { name: 'Goa', slug: 'goa' }, { name: 'Kerala', slug: 'kerala' }]);
  assert.deepEqual(state('haryana').nearbyStates, []);
  for (const a of data.states) for (const b of data.states) {
    assert.equal(a.nearbyStates.some(n => n.slug === b.slug), b.nearbyStates.some(n => n.slug === a.slug), `${a.slug}/${b.slug}`);
  }
  assert.ok(data.cities.every(c => !('nearbyStates' in c)));
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

test('content fields follow the page kind: corridor for cities, cities heading for states, compliance for both', async t => {
  const base = { status: 'PUBLISHED', seoTitle: 'Title', metaDescription: 'Description', h1: 'Overview',
    heroProse: 'Editorial content', heroImage: null, faqs: [], relatedBlogs: [], statOverrides: null,
    corridorHeading: 'Corridors', corridorProse: 'Corridor prose', complianceHeading: 'Compliance',
    complianceProse: 'Compliance prose', citiesHeading: 'Cities' };
  const pages = [{ ...base, kind: 'CITY', slug: 'bengaluru' }, { ...base, kind: 'STATE', slug: 'karnataka' },
    { ...base, kind: 'STATE', slug: 'goa', complianceHeading: null, complianceProse: '', citiesHeading: '' }];
  mockPrisma(t, prisma.locationPage, 'findMany', async () => pages);
  const list = response(); await getLocationPages({}, list);
  // What the wire carries: unset optional slots are omitted, never null.
  const [city, state, blank] = JSON.parse(JSON.stringify(list.body.data));
  assert.equal(city.corridorHeading, 'Corridors');
  assert.equal(city.corridorProse, 'Corridor prose');
  assert.equal(city.complianceProse, 'Compliance prose');
  assert.ok(!('citiesHeading' in city));
  assert.equal(state.citiesHeading, 'Cities');
  assert.equal(state.complianceHeading, 'Compliance');
  assert.equal(state.complianceProse, 'Compliance prose');
  assert.ok(!('corridorHeading' in state) && !('corridorProse' in state));
  for (const key of ['citiesHeading', 'complianceHeading', 'complianceProse', 'corridorHeading', 'statOverrides']) assert.ok(!(key in blank), key);
});

test('state city lists are sent verbatim for states only; null, empty and pre-column rows mean the default', async t => {
  const list = [
    { name: 'Bengaluru', slug: 'bengaluru', image: null },
    { name: 'Mysuru', slug: null, image: { url: 'https://cdn.example/mysuru.webp', alt: 'Mysuru industrial area', width: 1600, height: 900 } },
  ];
  const base = { status: 'PUBLISHED', seoTitle: 'Title', metaDescription: 'Description', h1: 'Overview',
    heroProse: 'Editorial content', heroImage: null, faqs: [], relatedBlogs: [], statOverrides: null };
  // A row read before the column existed has no key at all.
  const legacy = { ...base, kind: 'STATE', slug: 'goa' };
  const pages = [{ ...base, kind: 'STATE', slug: 'karnataka', stateCities: list },
    { ...base, kind: 'CITY', slug: 'bengaluru', stateCities: list },
    { ...base, kind: 'STATE', slug: 'kerala', stateCities: null },
    { ...base, kind: 'STATE', slug: 'tamil-nadu', stateCities: [] }, legacy];
  mockPrisma(t, prisma.locationPage, 'findMany', async () => pages);
  const res = response(); await getLocationPages({}, res);
  const [state, city, ...defaults] = JSON.parse(JSON.stringify(res.body.data));
  assert.deepEqual(state.stateCities, list);
  assert.ok(!('stateCities' in city));
  for (const page of defaults) assert.ok(!('stateCities' in page), page.slug);
});
