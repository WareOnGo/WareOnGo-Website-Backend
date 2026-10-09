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

test('locality visibility follows the distinct tagged count through 24, 25 and back below the gate', () => {
  const rows = Array.from({ length: 50 }, (_, i) => row(i, 50000, { micromarket: [] }));
  const empty = cityOverviewFor(rows, 'vijayawada');
  assert.equal(empty.localityTable.eligible, false);
  assert.equal(empty.localityTable.taggedListings, 0);
  assert.deepEqual(empty.corridors, []);
  for (let i = 0; i < 24; i++) rows[i].micromarket = ['North Belt', 'South Belt'];
  const below = cityOverviewFor([...rows, rows[0]], 'vijayawada');
  assert.equal(below.localityTable.taggedListings, 24);
  assert.equal(below.localityTable.eligible, false);
  assert.deepEqual(below.corridors, []);
  rows[24].micromarket = ['North Belt'];
  for (const city of ['vijayawada', 'chennai', 'bhiwandi', 'navi-mumbai', 'patna', 'new-city']) {
    const atGate = cityOverviewFor(rows, city);
    assert.deepEqual(atGate.localityTable, { eligible: true, taggedListings: 25, baseListings: 25,
      minTaggedListings: 25, grouping: 'micromarkets' });
    assert.equal(atGate.corridorMode, 'localities');
    assert.deepEqual(atGate.corridors.map(c => [c.slug, c.listings]), [['north-belt', 25], ['south-belt', 24]]);
    assert.deepEqual(atGate.segments, empty.segments, 'the table gate does not change size cards');
  }
  rows[24].micromarket = [];
  assert.deepEqual(cityOverviewFor(rows, 'vijayawada').corridors, []);
  assert.equal(cityOverviewFor(rows, 'vijayawada').summary.listings, 50);
});

test('Gurugram shares use 50 tagged listings out of 137, counting intentional overlap once per row', () => {
  const rows = Array.from({ length: 137 }, (_, i) => row(i, i < 50 ? 50000 : 900000, {
    micromarket: i < 20 ? ['North Belt', 'NORTH BELT'] : i < 40 ? ['South Belt']
      : i < 50 ? ['North Belt', 'South Belt'] : [],
    ratePerSqft: i < 50 ? '25' : '99',
  }));
  const result = cityOverviewFor([...rows, rows[40]], 'gurugram');
  assert.equal(result.summary.listings, 137);
  assert.equal(result.localityTable.baseListings, 50);
  assert.deepEqual(result.corridors.map(c => [c.slug, c.listings, c.share]), [
    ['north-belt', 30, 60], ['south-belt', 30, 60],
  ]);
  for (const locality of result.corridors) {
    assert.deepEqual(locality.rent, { min: 25, median: 25, max: 25 });
    assert.deepEqual(locality.size, { min: 50000, median: 50000, max: 50000 });
  }
  assert.deepEqual(cityOverviewFor([...rows].reverse(), 'gurugram').corridors, result.corridors);
});

test('the exact junk tag cannot qualify a city or become a locality, even when mixed with real tags', () => {
  const junk = 'reioU1d2lJTeDHDymHsQm86X4n6Ue54o';
  const rows = Array.from({ length: 28 }, (_, i) => row(i, 50000, { micromarket: i < 24 ? ['North Belt'] : [junk] }));
  const below = cityOverviewFor(rows, 'delhi');
  assert.equal(below.localityTable.taggedListings, 24);
  assert.deepEqual(below.corridors, []);
  rows[24].micromarket.push('North Belt', 'NORTH BELT');
  const eligible = cityOverviewFor(rows, 'delhi');
  assert.equal(eligible.localityTable.taggedListings, 25);
  assert.equal(eligible.localityTable.baseListings, 25);
  assert.deepEqual(eligible.corridors.map(c => [c.slug, c.listings]), [['north-belt', 25]]);
  assert.deepEqual(eligible.micromarkets.map(c => c.slug), ['north-belt']);
  assert.equal(cityOverviewFor([row(100, 50000, { micromarket: Array.from({ length: 30 }, (_, i) => `Area ${i}`) })], 'delhi').localityTable.eligible, false);
});

test('Bengaluru uses only the ten supplied tag groups, deduplicates within groups and keeps cross-group overlap', () => {
  const expected = [
    ['Nelamangala, Dobbaspet, Makali', ['nelamangala', 'dobbaspet', 'makali'], 5],
    ['Hoskote, Budigere, Soukya Road', ['hoskote', 'budigere', 'soukya-road'], 4],
    ['Peenya', ['peenya'], 1],
    ['Hosur Road: Bommasandra, Jigani, Attibele', ['hosur-road', 'bommasandra', 'jigani', 'attibele'], 4],
    ['Bidadi, Harohalli', ['bidadi', 'harohalli'], 2],
    ['Kumbalgodu', ['kumbalgodu'], 1],
    ['Devanahalli', ['devanahalli'], 1],
    ['Whitefield', ['whitefield'], 1],
    ['Marathahalli, Sarjapur', ['marathalli', 'sarjapura'], 2],
    ['HSR Layout', ['hsr'], 1],
  ];
  const rows = expected.flatMap(([, tags]) => tags).map((tag, i) => row(i, 50000, { micromarket: [tag] }));
  rows.push(row(100, 50000, { micromarket: ['nelamangala', 'NELAMANGALA', 'makali'] }),
    row(101, 50000, { micromarket: ['nelamangala', 'hoskote'] }));
  for (const [i, tag] of ['Yelahanka', 'Jakkur', 'Dasanapura', 'Tumkur Road', 'Airport Road', 'Marathahalli', 'Sarjapur', 'HSR Layout'].entries()) {
    rows.push(row(200 + i, 50000, { micromarket: [tag] }));
  }
  rows.push(row(300, 50000, { micromarket: [], address: 'Nelamangala Hoskote Peenya Hosur Road' }),
    row(301, 50000, { micromarket: ['reioU1d2lJTeDHDymHsQm86X4n6Ue54o'] }));
  const result = cityOverviewFor([...rows, rows[19]], 'bengaluru');
  assert.equal(result.localityTable.eligible, true);
  assert.equal(result.localityTable.taggedListings, 29);
  assert.equal(result.localityTable.baseListings, 21, 'uncovered tagged listings qualify the city but are outside its table base');
  assert.equal(result.localityTable.grouping, 'areas');
  assert.equal(result.corridorMode, 'localities');
  assert.deepEqual(result.corridors.map(c => [c.name, c.listings]), expected.map(([name, , count]) => [name, count]));
  assert.equal(result.corridors[0].share, 5 * 100 / 21);
  assert.equal(result.corridors.reduce((n, c) => n + c.listings, 0), 22);
  assert.deepEqual(cityOverviewFor([...rows].reverse(), 'bengaluru').corridors, result.corridors);
  const uncovered = cityOverviewFor(Array.from({ length: 25 }, (_, i) => row(i, 50000, { micromarket: ['Yelahanka'] })), 'bengaluru');
  assert.equal(uncovered.localityTable.eligible, true);
  assert.equal(uncovered.localityTable.baseListings, 0);
  assert.deepEqual(uncovered.corridors, []);
});

test('one- and two-listing rows have counts only; three-listing rows retain rent, size and main build', () => {
  for (const count of [1, 2, 3]) {
    const rows = Array.from({ length: 25 }, (_, i) => row(i, 50000, { micromarket: ['Main Market'] }));
    for (let i = 0; i < count; i++) rows.push(row(100 + i, [1000, 2000, 9000][i], {
      micromarket: ['Small Market'], ratePerSqft: ['10', '20', '40'][i],
    }));
    const small = cityOverviewFor(rows, 'ahmedabad').corridors.find(c => c.slug === 'small-market');
    assert.equal(small.listings, count);
    if (count < 3) {
      assert.equal(small.rent, null);
      assert.equal(small.size, null);
      assert.deepEqual(small.construction, []);
    } else {
      assert.deepEqual(small.rent, { min: 10, median: 20, max: 40 });
      assert.deepEqual(small.size, { min: 1000, median: 2000, max: 9000 });
      assert.equal(small.construction[0].label, 'PEB');
    }
  }
});

test('gate and base count visible tagged inventory while row statistics keep the existing stock exclusions', () => {
  const rows = [row(1, 1000, { ratePerSqft: '20' }), row(2, 2000, { ratePerSqft: '21' }), row(3, 3000, { ratePerSqft: '24' }),
    row(4, 900000, { warehouseType: 'BTS', ratePerSqft: '99' }),
    row(5, 900000, { warehouseType: 'Land', ratePerSqft: '99' }),
    row(6, 900000, { status: 'Under construction', ratePerSqft: '99' }),
    ...Array.from({ length: 19 }, (_, i) => row(100 + i, 50000, { micromarket: ['Other Named Market'] }))];
  const result = cityOverviewFor(rows, 'pune');
  assert.equal(result.localityTable.eligible, true);
  assert.equal(result.localityTable.taggedListings, 25);
  assert.equal(result.localityTable.baseListings, 25);
  const locality = result.corridors.find(c => c.slug === 'nelamangala');
  assert.equal(locality.listings, 3);
  assert.equal(locality.share, 12);
  assert.deepEqual(locality.rent, { min: 20, median: 21, max: 24 });
  assert.deepEqual(locality.size, { min: 1000, median: 2000, max: 3000 });
});

test('micromarket directory uses a three-listing display gate without inventing page links', () => {
  const rows = Array.from({ length: 6 }, (_, i) => row(i, 10000, { micromarket: ['Hoskote', 'HOSKOTE', ...(i < 3 ? ['Small Belt'] : []), ...(i < 2 ? ['Tiny Belt'] : []), 'a'.repeat(32)] }));
  const result = cityOverviewFor(rows, 'bengaluru');
  assert.deepEqual(result.micromarkets.map(m => [m.slug, m.listings, m.path]), [
    ['hoskote', 6, '/listings/city/bengaluru/hoskote'], ['small-belt', 3, null],
  ]);
});

test('reordering duplicate tags cannot change locality labels or statistics', () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(i, 50000, { micromarket: ['North Belt', 'NORTH BELT', ' north belt '] }));
  const before = cityOverviewFor(rows, 'delhi');
  const after = cityOverviewFor(rows.map(r => ({ ...r, micromarket: [...r.micromarket].reverse() })), 'delhi');
  assert.deepEqual(after.corridors, before.corridors);
  assert.deepEqual(after.localityTable, before.localityTable);
});

test('only explicit city configuration can supply area groups', () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(i, 50000, { micromarket: ['North Belt'] }));
  for (const slug of ['constructor', '__proto__', 'toString', 'unconfigured-city']) {
    const result = cityOverviewFor(rows, slug);
    assert.equal(result.localityTable.grouping, 'micromarkets');
    assert.deepEqual(result.corridors.map(c => [c.slug, c.listings]), [['north-belt', 25]]);
  }
});

test('400 adversarial inventories agree with independent membership sets, medians and denominators', () => {
  let seed = 0x2510489;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const vocabulary = [
    ['Nelamangala', 'nelamangala', 'nelamangala-dobbaspet-makali'],
    ['Makali', 'makali', 'nelamangala-dobbaspet-makali'],
    ['Hoskote', 'hoskote', 'hoskote-budigere-soukya-road'],
    ['Budigere', 'budigere', 'hoskote-budigere-soukya-road'],
    ['Peenya', 'peenya', 'peenya'], ['Whitefield', 'whitefield', 'whitefield'],
    ['Marathalli', 'marathalli', 'marathahalli-sarjapur'],
    ['Sarjapura', 'sarjapura', 'marathahalli-sarjapur'], ['HSR', 'hsr', 'hsr'],
    ['Yelahanka', 'yelahanka', null], ['Unknown Market', 'unknown-market', null],
  ];
  const median = values => {
    if (!values.length) return null;
    const ordered = [...values].sort((a, b) => a - b);
    return (ordered[Math.floor(ordered.length / 2)] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2;
  };
  for (let trial = 0; trial < 400; trial++) {
    const grouped = trial % 2 === 0;
    const rows = [], taggedIds = new Set(), coveredIds = new Set(), membership = new Map();
    for (let id = 0, length = random(81); id < length; id++) {
      const selected = Array.from({ length: random(5) }, () => vocabulary[random(vocabulary.length)]);
      const matches = new Set(selected.map(([, tag, group]) => grouped ? group : tag).filter(Boolean));
      const excluded = random(5) === 0;
      const price = random(4) === 0 ? null : 10 + random(60);
      const size = random(4) === 0 ? null : 1000 + 100 * random(60);
      const tags = selected.flatMap(([name]) => [name, ` ${name.toUpperCase()} `]);
      tags.push('', '   ', '---', 'reioU1d2lJTeDHDymHsQm86X4n6Ue54o');
      const listing = row(id, size, { micromarket: tags, ratePerSqft: price === null ? '' : String(price),
        ...(excluded ? { warehouseType: ['BTS', 'Land', 'Plot'][random(3)] } : {}) });
      rows.push(listing);
      if (selected.length) taggedIds.add(id);
      if (matches.size) coveredIds.add(id);
      if (!excluded) for (const match of matches) {
        if (!membership.has(match)) membership.set(match, new Map());
        membership.get(match).set(id, { price, size });
      }
    }
    const withDuplicates = [...rows, ...rows.filter((_, i) => i % 3 === 0)];
    const serialized = JSON.stringify(withDuplicates);
    const slug = grouped ? 'bengaluru' : 'delhi';
    const result = cityOverviewFor(withDuplicates, slug);
    assert.equal(JSON.stringify(withDuplicates), serialized, `trial ${trial}: source inventory was mutated`);
    assert.equal(result.localityTable.taggedListings, taggedIds.size);
    assert.equal(result.localityTable.baseListings, coveredIds.size);
    assert.equal(result.localityTable.eligible, taggedIds.size >= 25);
    assert.equal(result.summary.listings, rows.length);
    const expectedGroups = taggedIds.size >= 25 ? [...membership.keys()].sort() : [];
    assert.deepEqual(result.corridors.map(c => c.slug).sort(), expectedGroups, `trial ${trial}: row membership`);
    for (const actual of result.corridors) {
      const members = [...membership.get(actual.slug).values()];
      assert.equal(actual.listings, members.length);
      assert.equal(actual.share, members.length * 100 / coveredIds.size);
      assert.ok(Number.isFinite(actual.share));
      const rents = members.map(m => m.price).filter(v => v !== null);
      const sizes = members.map(m => m.size).filter(v => v !== null);
      assert.equal(actual.rent?.median ?? null, members.length >= 3 ? median(rents) : null);
      assert.equal(actual.size?.median ?? null, members.length >= 3 ? median(sizes) : null);
      if (members.length < 3) assert.deepEqual(actual.construction, []);
    }
    const permuted = cityOverviewFor([...withDuplicates].reverse().map(r => ({ ...r, micromarket: [...r.micromarket].reverse() })), slug);
    assert.deepEqual(permuted.corridors, result.corridors, `trial ${trial}: reordering changed the table`);
    assert.deepEqual(permuted.localityTable, result.localityTable);
  }
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
