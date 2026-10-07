import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWarehouseQuery, warehouseQueries } from '../services/warehouseListingQuery.js';

test('maxId is an optional inclusive positive PostgreSQL integer', () => {
  assert.equal(readWarehouseQuery().filters.maxId, undefined);
  for (const value of [1, '2893', '002893', 2147483647]) {
    assert.equal(readWarehouseQuery({ maxId: value }).filters.maxId, Number(value));
  }
  for (const maxId of [0, -1, '2893x', '1.5', '1e3', ' ', '2147483648', ['2893'], {}, true, '1 OR true']) {
    assert.throws(() => readWarehouseQuery({ maxId }), /maxId/, JSON.stringify(maxId));
  }
});

test('the cutoff is bound in both the row and count queries, before pagination', () => {
  const { rows, count } = warehouseQueries(readWarehouseQuery({ maxId: '2893', city: 'Bengaluru', minSpace: '10000' }, 2, 21));
  for (const query of [rows, count]) {
    assert.match(query.text, /w\.id <= \$\d+/);
    assert.ok(query.values.includes(2893));
    assert.match(query.text, /w\.visibility = true/);
    assert.ok(query.values.includes('%Bengaluru%'));
    assert.ok(query.values.includes(10000));
  }
  assert.ok(rows.text.indexOf('w.id <=') < rows.text.indexOf('LIMIT'));
  const uncapped = warehouseQueries(readWarehouseQuery()).rows;
  assert.doesNotMatch(uncapped.text, /w\.id <=/);
});
