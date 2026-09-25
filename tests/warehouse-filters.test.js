import assert from 'node:assert/strict';
import { before, after, test, mock } from 'node:test';

// This suite creates fixtures only in its dedicated local test database. It
// deliberately cannot fall back to the application's DATABASE_URL/.env.
const value = process.env.WAREHOUSE_FILTER_TEST_DATABASE_URL;
if (!value) throw new Error('Set WAREHOUSE_FILTER_TEST_DATABASE_URL to the local wog_listing_filters database');
const url = new URL(value);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'test database must be local');
assert.equal(url.pathname, '/wog_listing_filters');
process.env.DATABASE_URL = value;
const [{ Prisma }, { default: prisma }, { default: warehouses }, { default: markets, canonicalCity },
  { default: locations }, { default: redis }, { getWarehouses }] = await Promise.all([
  import('@prisma/client'), import('../models/prismaClient.js'), import('../services/warehouseService.js'),
  import('../services/micromarketService.js'), import('../services/locationService.js'),
  import('../services/redisService.js'), import('../controllers/warehouseController.js'),
]);

const make = (id, extra = {}) => ({
  id, city: id % 2 ? 'Bangalore' : 'Bengaluru', state: 'Karnataka', visibility: true,
  warehouseType: id % 3 ? 'PEB' : 'RCC', address: `Plot ${id}, Industrial Estate`,
  zone: id % 2 ? 'North' : 'South', compliances: 'ISO 9001', ratePerSqft: '25', clearHeightFt: '30',
  totalSpaceSqft: id <= 600 ? [5000, 50000 + id] : [5000],
  micromarket: [id % 2 ? 'Hoskote' : 'HOSKOTE', ['North/Belt', 'North Belt', 'North--Belt'][id % 3]],
  photos: '["photo.jpg"]', photosWebp: 'photo.webp',
  warehouseData: id % 11 ? { fireNocAvailable: id % 3 === 0,
    latitude: 12.98765, longitude: id % 7 ? 77.12345 : null, fireSafetyMeasures: 'Sprinklers' } : null,
  ...extra,
});
const fixtures = Array.from({ length: 720 }, (_, i) => make(i + 1, { visibility: (i + 1) % 17 !== 0 }));
fixtures.push(
  make(721, { city: 'Delhi', state: 'Delhi', totalSpaceSqft: [60000] }),
  make(722, { city: 'Bengaluru Rural', totalSpaceSqft: [60000] }),
  make(723, { city: ' Bengaluru ', totalSpaceSqft: [60000], micromarket: ['Tiny Place', 'Hoskote'] }),
  make(724, { city: 'Bengaluru', state: 'New Karnataka', totalSpaceSqft: [60000] }),
  make(725, { city: ' Bengaluru\t', totalSpaceSqft: [60000], micromarket: ['Hoskote', 'hoskote'] }),
);
for (const [offset, sizes] of [[], [5000, 100000], [5000, 15000], [10000], [25000], [0], null].entries()) {
  fixtures.push(make(800 + offset, { city: 'Range City', state: 'Range State', totalSpaceSqft: sizes,
    micromarket: ['Range Belt'], warehouseType: 'Shed' }));
}
for (const [offset, [city, alias]] of [['Mumbai', 'Bombay'], ['Kolkata', 'Calcutta'], ['Chennai', 'Madras'], ['Gurugram', 'Gurgaon']].entries()) {
  fixtures.push(make(900 + offset * 2, { city, state: 'Alias State' }), make(901 + offset * 2, { city: alias, state: 'Alias State' }));
}
fixtures.push(make(950, { city: 'Bengaluru', visibility: null }),
  make(951, { city: 'Bengaluru', micromarket: [' \txy\t ', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef', 'Alipur/Budhpur', 'Alipur Budhpur'] }),
  make(952, { city: 'Bengaluru\u00a0', micromarket: ['\u00a0xy\u00a0', 'Special\u00a0Belt', 'Depot 2.0'] }),
  make(953, { city: 'Bengaluru', micromarket: null }));
for (const [offset, warehouseType] of ['PEB + RCC', 'RCC', 'PEB', 'Shed', ''].entries()) {
  fixtures.push(make(1100 + offset, { city: 'Type City', warehouseType }));
}
const choiceRows = [
  ['PEB', [10000]], ['RCC', [25000]], ['BTS', [50000]], ['Shed', [120000]],
  ['PEB + RCC', [10001]], ['BTS + Shed', [25001]], ['PEB', [9999, 50001]],
  ['Land', [75000]], ['RCC', []], ['Shed', [0]], ['RCC', [15000, 75000]],
  ['PEB', [25000, 50000]], ['PEB', [49999]], ['BTS', [24999]], ['Shed', null],
].map(([warehouseType, totalSpaceSqft], i) => make(1200 + i, {
  city: 'Choice City', state: 'Choice State', micromarket: ['Choice Belt'], warehouseType, totalSpaceSqft,
}));
fixtures.push(...choiceRows,
  { ...choiceRows[0], id: 1250, visibility: false },
  { ...choiceRows[0], id: 1251, state: 'Other State' },
  { ...choiceRows[0], id: 1252, micromarket: ['Other Belt'] });
const visible = fixtures.filter(row => row.visibility === true);
const descending = rows => rows.map(row => row.id).sort((a, b) => b - a);
const ids = result => result.data.map(row => row.id);
const read = (filters = {}, page = 1, pageSize = 21) => warehouses.getWarehouses(filters, page, pageSize, { bypassCache: true });
const array = (values, type) => values === null ? Prisma.sql`NULL`
  : values.length ? Prisma.sql`ARRAY[${Prisma.join(values)}]::${type}` : Prisma.sql`ARRAY[]::${type}`;

before(async () => {
  mock.method(redis, 'get', async () => null);
  mock.method(redis, 'setEx', async () => {});
  mock.method(console, 'log', () => {});
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Warehouse" (
    id integer PRIMARY KEY, city text, state text, visibility boolean,
    "warehouseType" text, address text, zone text, compliances text,
    "ratePerSqft" text, "clearHeightFt" text, "totalSpaceSqft" integer[], micromarket text[],
    photos text, "photosWebp" text, "otherSpecifications" text,
    "numberOfDocks" text DEFAULT '4', "flooringType" text DEFAULT 'VDF',
    status_updated_at timestamptz DEFAULT '2026-09-20T00:00:00Z',
    "contactPerson" text DEFAULT 'PRIVATE OWNER', "contactNumber" text DEFAULT 'PRIVATE PHONE',
    "googleLocation" text DEFAULT 'PRIVATE PIN'
  )`;
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WarehouseData" (
    id serial PRIMARY KEY, "warehouseId" integer UNIQUE REFERENCES "Warehouse"(id),
    "fireNocAvailable" boolean, "fireSafetyMeasures" text, latitude float8, longitude float8
  )`;
  await prisma.$executeRaw`ALTER TABLE "Warehouse"
    ADD COLUMN IF NOT EXISTS media jsonb,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS availability text`;
  await prisma.$executeRaw`TRUNCATE "WarehouseData", "Warehouse" RESTART IDENTITY`;
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "Warehouse" (
    id, city, state, visibility, "warehouseType", address, zone, compliances,
    "ratePerSqft", "clearHeightFt", "totalSpaceSqft", micromarket, photos, "photosWebp"
  ) VALUES ${Prisma.join(fixtures.map(row => Prisma.sql`(
    ${row.id}, ${row.city}, ${row.state}, ${row.visibility}, ${row.warehouseType}, ${row.address},
    ${row.zone}, ${row.compliances}, ${row.ratePerSqft}, ${row.clearHeightFt},
    ${array(row.totalSpaceSqft, Prisma.sql`integer[]`)}, ${array(row.micromarket, Prisma.sql`text[]`)}, ${row.photos}, ${row.photosWebp}
  )`))}`);
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "WarehouseData" (
    "warehouseId", "fireNocAvailable", "fireSafetyMeasures", latitude, longitude
  ) VALUES ${Prisma.join(fixtures.filter(row => row.warehouseData).map(({ id, warehouseData: data }) => Prisma.sql`(
    ${id}, ${data.fireNocAvailable}, ${data.fireSafetyMeasures}, ${data.latitude}, ${data.longitude}
  )`))}`);
});
after(async () => { mock.restoreAll(); await prisma.$disconnect(); });

test('unfiltered pages retain the existing inventory, descending order and public response', async () => {
  const result = await read({}, 1, 500);
  assert.deepEqual(ids(result), descending(visible).slice(0, 500));
  assert.equal(result.pagination.totalItems, visible.length);
  const rest = await read({}, 2, 500);
  assert.deepEqual([...ids(result), ...ids(rest)], descending(visible));
  // Compare fields used by overview builds with Prisma's original read path.
  const legacy = await prisma.warehouse.findMany({ where: { visibility: true }, orderBy: { id: 'desc' },
    select: { id: true, city: true, state: true, totalSpaceSqft: true, warehouseType: true,
      clearHeightFt: true, ratePerSqft: true, compliances: true, numberOfDocks: true, flooringType: true } });
  const rows = [...result.data, ...rest.data];
  for (const [index, expected] of legacy.entries()) {
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key => [key, rows[index][key]])), expected, `warehouse ${expected.id}`);
  }
  const sample = result.data.find(row => row.id === 952);
  assert.deepEqual(sample.photos, ['photo.jpg']);
  assert.deepEqual(sample.photosWebp, ['photo.webp']);
  assert.equal(sample.latitude, 12.99);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!('warehouseData' in sample));
  assert.equal(new Date(sample.updatedAt).toISOString(), '2026-09-20T00:00:00.000Z');
});

test('area filtering traverses more than 500 matches with stable totals, no gaps or duplicates', async () => {
  const filters = { city: 'Bengaluru', locationMatch: 'exact', minSpace: 50000 };
  const expected = descending(visible.filter(row => canonicalCity(row.city) === 'Bengaluru'
    && row.totalSpaceSqft?.some(space => space >= 50000)));
  assert.ok(expected.length > 500);
  const found = [];
  const totalPages = Math.ceil(expected.length / 21);
  for (let page = 1; page <= totalPages; page++) {
    const result = await read(filters, page);
    assert.deepEqual(result.pagination, { currentPage: page, pageSize: 21, totalItems: expected.length, totalPages });
    assert.deepEqual(ids(result), expected.slice((page - 1) * 21, page * 21));
    found.push(...ids(result));
  }
  assert.deepEqual(found, expected);
  const beyond = await read(filters, totalPages + 1);
  assert.deepEqual(ids(beyond), []);
  assert.equal(beyond.pagination.totalItems, expected.length);
});

test('both inclusive area bounds apply to the same unit, including zero, open ranges and empty arrays', async () => {
  for (const [range, expected] of [
    [{ minSpace: 10000, maxSpace: 25000 }, [804, 803, 802]],
    [{ minSpace: 100000 }, [801]], [{ maxSpace: 0 }, [805]],
    [{ minSpace: 0, maxSpace: 0 }, [805]], [{ minSpace: 0 }, [805, 804, 803, 802, 801]],
    [{ minSpace: 25001, maxSpace: 99999 }, []],
  ]) {
    const result = await read({ city: 'Range City', locationMatch: 'exact', ...range });
    assert.deepEqual(ids(result), expected);
    assert.equal(result.pagination.totalItems, expected.length);
  }
});

test('multiple area bands preserve gaps, open ends and unique paged results for multi-unit warehouses', async () => {
  for (const [spaceRanges, expected] of [
    ['0-10000,50000-', [805, 803, 802, 801]],
    ['10000-25000,50000-', [804, 803, 802, 801]],
    ['10000-25000,25000-50000', [804, 803, 802]],
    ['15001-24999,25001-99999', []], // Bounds cannot match separate units.
    ['50000-,0000-10000,0-10000', [805, 803, 802, 801]],
  ]) {
    const found = [];
    for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / 2)); page++) {
      const result = await read({ city: 'Range City', locationMatch: 'exact', spaceRanges }, page, 2);
      assert.equal(result.pagination.totalItems, expected.length, spaceRanges);
      found.push(...ids(result));
    }
    assert.deepEqual(found, expected, spaceRanges);
    assert.equal(new Set(found).size, found.length);
  }
  const combined = await read({ city: 'Range City', locationMatch: 'exact', spaceRanges: '0-10000,50000-', warehouseType: 'PEB,RCC' });
  assert.equal(combined.pagination.totalItems, 0, 'area and type groups intersect');
});

test('adding a second type retains hybrid stock and returns a unique union before paging', async () => {
  for (const [warehouseType, expected] of [
    ['PEB', [1102, 1100]], ['RCC', [1101, 1100]],
    ['PEB,RCC', [1102, 1101, 1100]], ['peb,Shed', [1103, 1102, 1100]],
    [['PEB', 'RCC', 'PEB'], [1102, 1101, 1100]],
  ]) {
    const first = await read({ city: 'Type City', warehouseType }, 1, 2);
    const second = await read({ city: 'Type City', warehouseType }, 2, 2);
    assert.equal(first.pagination.totalItems, expected.length);
    assert.deepEqual([...ids(first), ...ids(second)], expected);
  }
});

test('all 256 type/area selections match an independent oracle, with and without Fire NOC', async () => {
  const types = ['PEB', 'RCC', 'BTS', 'Shed'];
  const bands = [[0, 10000], [10000, 25000], [25000, 50000], [50000, Infinity]];
  const subset = (values, mask) => values.filter((_, index) => mask & (1 << index));
  for (let typeMask = 0; typeMask < 16; typeMask++) {
    for (let areaMask = 0; areaMask < 16; areaMask++) {
      for (const fire of [false, true]) {
        const selectedTypes = subset(types, typeMask);
        const selectedBands = subset(bands, areaMask);
        const expected = descending(choiceRows.filter(row =>
          (!selectedTypes.length || selectedTypes.some(type => row.warehouseType.includes(type))) &&
          (!selectedBands.length || row.totalSpaceSqft?.some(size => selectedBands.some(([min, max]) => size >= min && size <= max))) &&
          (!fire || row.warehouseData?.fireNocAvailable === true)));
        const filters = { city: 'Choice City', state: 'Choice State', micromarket: 'choice-belt',
          ...(selectedTypes.length ? { warehouseType: selectedTypes.join(',') } : {}),
          ...(selectedBands.length ? { spaceRanges: selectedBands.map(([min, max]) => `${min}-${Number.isFinite(max) ? max : ''}`).join(',') } : {}),
          ...(fire ? { fireNocAvailable: true } : {}) };
        const label = JSON.stringify(filters);
        const found = [];
        for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / 3)); page++) {
          const result = await read(filters, page, 3);
          assert.equal(result.pagination.totalItems, expected.length, label);
          assert.equal(result.pagination.totalPages, Math.ceil(expected.length / 3), label);
          assert.deepEqual(ids(result), expected.slice((page - 1) * 3, page * 3), label);
          found.push(...ids(result));
        }
        assert.deepEqual(found, expected, label);
        assert.equal(new Set(found).size, found.length, label);
      }
    }
  }
});

test('micromarket SQL matches the existing overview catalogue membership across tag spellings', async () => {
  const catalogue = await markets.getMicromarkets({ bypassCache: true });
  for (const slug of ['hoskote', 'north-belt', 'tiny-place', 'alipur-budhpur', 'special-belt', 'depot-20']) {
    const market = catalogue.data.find(entry => entry.slug === slug);
    assert.ok(market, slug);
    const members = new Set(market.listingIds);
    const expected = descending(visible.filter(row => members.has(row.id) && canonicalCity(row.city) === 'Bengaluru'));
    const first = await read({ city: 'Bangalore', micromarket: slug }, 1, 500);
    const second = await read({ city: 'Bangalore', micromarket: slug }, 2, 500);
    assert.deepEqual([...ids(first), ...ids(second)], expected, slug);
    assert.equal(first.pagination.totalItems, expected.length, slug);
  }
  assert.equal(catalogue.data.find(entry => entry.slug === 'tiny-place').hasPage, false);
  for (const slug of ['unknown-place', 'xy', 'abcdefghijklmnopqrstuvwxyzabcdef']) {
    const result = await read({ city: 'Bengaluru', micromarket: slug });
    assert.deepEqual(ids(result), [], slug);
    assert.equal(result.pagination.totalItems, 0);
  }
});

test('city, state, micromarket, type, Fire NOC and area combine before pagination', async () => {
  const expected = descending(visible.filter(row => canonicalCity(row.city) === 'Bengaluru'
    && row.state === 'Karnataka' && row.warehouseType === 'RCC'
    && row.warehouseData?.fireNocAvailable === true && row.warehouseData?.longitude !== null
    && row.micromarket?.some(tag => tag.toLowerCase() === 'hoskote')
    && row.totalSpaceSqft?.some(size => size >= 50100 && size <= 50400)));
  const filters = { city: 'Bangalore,Bengaluru', state: 'Karnataka', micromarket: 'hoskote',
    warehouseType: 'RCC', fireNocAvailable: true, hasCoordinates: true, minSpace: 50100, maxSpace: 50400 };
  const result = await read(filters, 2);
  assert.deepEqual(ids(result), expected.slice(21, 42));
  assert.equal(result.pagination.totalItems, expected.length);
});

test('exact geography supports all city aliases and excludes partial-name collisions', async () => {
  for (const city of ['Bengaluru', 'Bangalore', 'Mumbai', 'Bombay', 'Kolkata', 'Calcutta', 'Chennai', 'Madras', 'Gurugram', 'Gurgaon']) {
    const expected = descending(visible.filter(row => canonicalCity(row.city) === canonicalCity(city)));
    const result = await read({ city, locationMatch: 'exact' }, 1, 1000);
    assert.deepEqual(ids(result), expected, city);
  }
  const state = await read({ state: 'karnataka', locationMatch: 'exact' }, 1, 1000);
  assert.ok(!ids(state).includes(724));
  const partial = await read({ city: 'Bengaluru' }, 1, 1000);
  assert.ok(ids(partial).includes(722));
  const multiple = await read({ city: ['Bangalore', 'Bengaluru'] }, 1, 1000);
  assert.deepEqual(ids(multiple), descending(visible.filter(row => ['bangalore', 'bengaluru'].includes(row.city.toLowerCase()))));
});

test('legacy text, multi-value, boolean and coordinate filters retain their behavior', async () => {
  const filters = { warehouseType: ['PEB', 'RCC'], zone: 'North', compliances: 'ISO', contactPerson: 'OWNER',
    address: 'industrial', minBudget: '20', maxBudget: '30', minClearHeight: '25', maxClearHeight: '35', fireNocAvailable: false };
  const expected = descending(visible.filter(row => ['PEB', 'RCC'].some(type => row.warehouseType?.includes(type))
    && row.zone === 'North' && row.warehouseData?.fireNocAvailable === false));
  assert.deepEqual(ids(await read(filters, 1, 1000)), expected);
  assert.deepEqual(ids(await read({ hasCoordinates: false }, 1, 1000)), descending(visible));
});

test('bound SQL values cannot broaden exact searches or execute injected statements', async () => {
  for (const filters of [{ city: "Bengaluru' OR true --", locationMatch: 'exact' },
    { warehouseType: "PEB'); DROP TABLE \"Warehouse\"; --" }, { address: "' OR true --" },
    { city: '%', locationMatch: 'exact' }]) {
    const result = await read(filters);
    assert.deepEqual(ids(result), []);
    assert.equal(result.pagination.totalItems, 0);
  }
  assert.equal(await prisma.warehouse.count(), fixtures.length);
});

const response = () => ({ headers: {}, code: 200,
  set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; },
});
test('controller validates malformed requests and forwards valid micromarket queries', async () => {
  for (const query of [{ page: '-1' }, { page: '2abc' }, { pageSize: '0' }, { page: ['1', '2'] },
    { minSpace: '-1' }, { minSpace: '5000.5' }, { maxSpace: '50000x' }, { minSpace: '20000', maxSpace: '10000' },
    { minSpace: ['1000', '2000'] }, { micromarket: 'hoskote' }, { city: {}, micromarket: 'hoskote' },
    { city: 'Bengaluru', micromarket: 'bad/slug' }, { locationMatch: 'fuzzy' }, { fireNocAvailable: 'maybe' },
    { page: '2147483647', pageSize: '21' },
    ...['-', '0-10,', '100-10', '-1-100', '0-2147483648', '0-100.5', '0-10 OR true', '0-1,1-2,2-3,3-4,4-5']
      .map(spaceRanges => ({ spaceRanges })),
    { spaceRanges: ['0-10000', '50000-'] }, { spaceRanges: {} }, { spaceRanges: '0-10000', minSpace: '0' },
    { spaceRanges: '0-10000', maxSpace: '50000' }]) {
    const res = response();
    await getWarehouses({ query, headers: {} }, res);
    assert.equal(res.code, 400, JSON.stringify(query));
    assert.equal(typeof res.body.error, 'string');
  }
  const res = response();
  await getWarehouses({ query: { city: 'Bengaluru', micromarket: 'tiny-place', pageSize: '21' },
    headers: { 'cache-control': 'no-cache' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(ids(res.body), [723]);
  assert.equal(res.headers['X-Wareongo-Cache'], 'bypass');
  assert.equal(res.headers['X-Wareongo-Listing-Filters'], '2');
  const multi = response();
  await getWarehouses({ query: { city: 'Range City', warehouseType: 'PEB,Shed', spaceRanges: '0-10000,50000-' }, headers: {} }, multi);
  assert.equal(multi.code, 200);
  assert.deepEqual(ids(multi.body), [805, 803, 802, 801]);
});

test('cache includes every filter and fresh reads bypass it without consulting a catalogue cache', async t => {
  const cache = new Map();
  const get = t.mock.method(redis, 'get', async key => cache.get(key));
  const set = t.mock.method(redis, 'setEx', async (key, ttl, data) => { cache.set(key, data); });
  const options = [{ city: 'Bengaluru', micromarket: 'tiny-place' },
    { city: 'Bengaluru', micromarket: 'hoskote' }, { city: 'Bengaluru', minSpace: 50000 },
    { city: 'Bengaluru', locationMatch: 'exact' }, { city: 'Bengaluru' },
    { city: 'Range City', spaceRanges: '0-10000,50000-' }, { city: 'Range City', spaceRanges: '10000-25000,50000-' },
    { city: 'Type City', warehouseType: 'PEB,RCC' }, { city: 'Type City', warehouseType: 'PEB' }];
  const originals = [];
  for (const filter of options) originals.push(await warehouses.getWarehouses(filter, 1, 21));
  assert.equal(cache.size, options.length);
  assert.ok([...cache.keys()].every(key => key.startsWith('warehouses:v8-images:')));
  for (let i = 0; i < options.length; i++) {
    assert.deepEqual(JSON.parse(JSON.stringify(await warehouses.getWarehouses(options[i], 1, 21))), JSON.parse(JSON.stringify(originals[i])));
  }
  assert.equal(set.mock.callCount(), options.length);
  const readsBefore = get.mock.callCount();
  await read(options[0]);
  assert.equal(get.mock.callCount(), readsBefore);
  assert.equal(set.mock.callCount(), options.length);
});

test('filter queries leave city/state and micromarket overview data unchanged', async () => {
  const before = await Promise.all([locations.getLocations({ bypassCache: true }), markets.getMicromarkets({ bypassCache: true })]);
  await read({ city: 'Bengaluru', micromarket: 'hoskote', minSpace: 50000 });
  await read({ state: 'Karnataka', locationMatch: 'exact' });
  await read({ city: 'Bengaluru', warehouseType: 'PEB,RCC', spaceRanges: '0-10000,50000-' });
  const after = await Promise.all([locations.getLocations({ bypassCache: true }), markets.getMicromarkets({ bypassCache: true })]);
  assert.deepEqual(after, before);
});
