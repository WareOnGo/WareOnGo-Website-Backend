import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityOverviewFor, attachCityOverviews } from '../services/cityOverviewStats.js';
import { statsFor } from '../services/micromarketService.js';

const row = (id, size, extra = {}) => ({ id, city: 'Bengaluru', state: 'Karnataka', warehouseType: 'PEB', totalSpaceSqft: [size],
  ratePerSqft: '25', clearHeightFt: '30', numberOfDocks: '0', flooringType: 'VDF', micromarket: ['Nelamangala'], ...extra });

test('city cohorts exclude unbuilt and construction, preserve decimals and recorded zero docks', () => {
  const rows = [row(1, 100, { ratePerSqft: '21', clearHeightFt: '39' }), row(2, 50000, { ratePerSqft: '22', clearHeightFt: '40', numberOfDocks: '2' }),
    row(3, 900000, { warehouseType: 'Land', ratePerSqft: '99' }), row(4, 800000, { warehouseType: 'BTS', ratePerSqft: '99' }),
    row(5, 700000, { status: 'Under construction', ratePerSqft: '99' }), row(6, 600000, { availability: 'Under-construction', ratePerSqft: '99' })];
  const result = cityOverviewFor(rows, 'bengaluru');
  assert.equal(result.summary.listings, 6);
  assert.equal(result.summary.measured, 2);
  assert.deepEqual(result.excluded, { unbuilt: 2, underConstruction: 2 });
  assert.deepEqual(result.summary.rent, { min: 21, median: 21.5, max: 22 });
  assert.deepEqual(result.summary.clearHeight, { min: 39, median: 39.5, max: 40 });
  assert.deepEqual(result.summary.docks, { min: 0, median: 1, max: 2 });
  assert.equal(result.summary.size.min, 100);
  // Legacy states and micromarkets retain their existing rules.
  assert.equal(statsFor(rows.slice(0, 2)).rent.median, 22);
  assert.equal(statsFor(rows.slice(0, 2)).docksMedian, 2);
});

test('every size boundary belongs to exactly one band; invalid sizes and rates stay missing', () => {
  const rows = [row(1, 4999), row(2, 5000), row(3, 20000), row(4, 50000), row(5, 100000),
    row(6, null, { ratePerSqft: '1,10,000 per month' }), row(7, -10, { ratePerSqft: 'not recorded' }),
    row(8, 1, { ratePerSqft: '' }), row(9, 99, { ratePerSqft: '' })];
  const result = cityOverviewFor(rows, 'bengaluru');
  assert.deepEqual(result.rentBySize.map(b => b.listings), [1, 1, 1, 1, 1]);
  assert.equal(result.summary.samples.rent, 5);
  assert.equal(result.summary.samples.size, 5);
  assert.equal(result.summary.size.min, 4999);
  assert.equal(result.segments.small.listings, 2);
  assert.equal(result.specsBySize.large.listings, 2);
  assert.equal(result.specsBySize.small.listings, 2);
});

test('corridor memberships reconcile even with repeated tags, duplicate rows and ambiguous locations', () => {
  const rows = [row(1, 50000, { micromarket: ['Nelamangala', 'NELAMANGALA', 'Makali'] }),
    row(2, 50000, { micromarket: ['Nelamangala', 'Hoskote'] }), row(3, 50000, { micromarket: [] }),
    row(4, 50000, { micromarket: ['Hoskote'] })];
  const result = cityOverviewFor([...rows, rows[0]], 'bengaluru');
  assert.equal(result.summary.listings, 4);
  assert.equal(result.corridors.find(c => c.slug === 'tumkur-road').listings, 1);
  assert.equal(result.corridors.find(c => c.slug === 'other-unassigned').listings, 2);
  assert.equal(result.corridors.reduce((n, c) => n + c.listings, 0), result.summary.measured);
  assert.deepEqual(cityOverviewFor([...rows].reverse(), 'bengaluru').corridors, result.corridors);
});

test('micromarket directory uses a three-listing display gate without inventing page links', () => {
  const rows = Array.from({ length: 6 }, (_, i) => row(i, 10000, { micromarket: ['Hoskote', 'HOSKOTE', ...(i < 3 ? ['Small Belt'] : []), ...(i < 2 ? ['Tiny Belt'] : []), 'a'.repeat(32)] }));
  const result = cityOverviewFor(rows, 'bengaluru');
  assert.deepEqual(result.micromarkets.map(m => [m.slug, m.listings, m.path]), [
    ['hoskote', 6, '/listings/city/bengaluru/hoskote'], ['small-belt', 3, null],
  ]);
});

test('missing data is not zero, and construction/flooring percentages use recorded recognised values', () => {
  const result = cityOverviewFor([row(1, null, { ratePerSqft: '', clearHeightFt: '', numberOfDocks: '', flooringType: '' }),
    row(2, 10000, { flooringType: 'FM2', warehouseType: 'RCC' })], 'bengaluru');
  assert.equal(result.summary.engineeredFloorShare, 100);
  assert.equal(result.summary.samples.flooring, 1);
  assert.equal(result.rentBySize[3].rent, null);
  assert.equal(result.specsBySize.large.clearHeight, null);
  assert.equal(result.specsBySize.large.engineeredFloorShare, null);
  assert.deepEqual(cityOverviewFor([], 'bengaluru').corridors, []);
});

test('cross-state comparison uses each city’s new summary while neighbours and legacy peers remain separate', () => {
  const cities = [
    { name: 'Bengaluru', slug: 'bengaluru', parentState: 'Karnataka', stateSlug: 'karnataka' },
    { name: 'Chennai', slug: 'chennai', parentState: 'Tamil Nadu', stateSlug: 'tamil-nadu' },
    { name: 'Mysuru', slug: 'mysuru', parentState: 'Karnataka', stateSlug: 'karnataka' },
  ].map(c => ({ ...c, path: `/listings/city/${c.slug}`, hasPage: true, listings: 6, peers: ['unchanged'] }));
  const rows = cities.flatMap((c, index) => Array.from({ length: 6 }, (_, i) => row(index * 10 + i, 50000, { city: c.name, ratePerSqft: String(20 + index + i) })));
  attachCityOverviews(cities, rows);
  const bengaluru = cities[0].cityOverview;
  assert.ok(bengaluru.comparisonCities.some(p => p.slug === 'chennai'));
  assert.deepEqual(bengaluru.nearbyCities.map(c => c.slug), ['mysuru']);
  for (const peer of bengaluru.comparisonCities) assert.equal(peer.medianRent, cities.find(c => c.slug === peer.slug).cityOverview.summary.rent.median);
  assert.deepEqual(cities[0].peers, ['unchanged']);
});
