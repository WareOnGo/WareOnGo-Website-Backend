import assert from 'node:assert/strict';
import { test } from 'node:test';
import micromarkets, { parentStatesFor } from '../services/micromarketService.js';
import prisma from '../models/prismaClient.js';
import redis from '../services/redisService.js';

test('city aliases share one state and ties resolve independently of row order', () => {
  const rows = [
    { city: 'Bangalore', state: ' KARNATAKA ' },
    { city: 'Bengaluru', state: 'Karnataka' },
    { city: 'Bengaluru', state: 'Tamil Nadu' },
    { city: 'Example City', state: 'Haryana' },
    { city: 'Example City', state: 'Delhi' },
    { city: 'Missing', state: null },
    { city: 'Invalid', state: 'N/A' },
    { city: 'Invalid', state: 'unknown' },
  ];
  assert.equal(parentStatesFor(rows).get('Bengaluru'), 'Karnataka');
  assert.equal(parentStatesFor(rows).get('Example City'), 'Delhi');
  assert.deepEqual([...parentStatesFor(rows)].sort(), [...parentStatesFor([...rows].reverse())].sort());
  assert.equal(parentStatesFor(rows).has('Missing'), false);
  assert.equal(parentStatesFor(rows).has('Invalid'), false);
});

test('API includes state geography without changing existing listing eligibility or IDs', async () => {
  const original = { findMany: prisma.warehouse.findMany, get: redis.get, setEx: redis.setEx };
  let query;
  let cacheKey;
  prisma.warehouse.findMany = async options => {
    query = options;
    return Array.from({ length: 12 }, (_, i) => ({ id: i + 1, city: i % 2 ? 'Bangalore' : 'Bengaluru',
      state: i === 0 ? 'Tamil Nadu' : 'Karnataka', micromarket: [i < 6 ? 'North Belt' : 'South Belt'],
      warehouseType: 'PEB', totalSpaceSqft: [10000], ratePerSqft: '20', clearHeightFt: '30',
      numberOfDocks: '4', compliances: '', flooringType: null, warehouseData: null }));
  };
  redis.get = async () => null;
  redis.setEx = async key => { cacheKey = key; };
  try {
    const { data } = await micromarkets.getMicromarkets();
    assert.equal(query.select.state, true);
    assert.equal(cacheKey, 'micromarkets:v5');
    assert.equal(data.length, 2);
    for (const market of data) {
      assert.equal(market.hasPage, true);
      assert.equal(market.citySlug, 'bengaluru');
      assert.equal(market.stateSlug, 'karnataka');
      assert.equal(market.parentState, 'Karnataka');
      assert.equal(market.listingIds.length, 6);
    }
  } finally {
    prisma.warehouse.findMany = original.findMany; redis.get = original.get; redis.setEx = original.setEx;
    await prisma.$disconnect();
  }
});
