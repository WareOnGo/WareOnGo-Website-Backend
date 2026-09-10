import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseUrlWithPoolDefaults } from '../utils/databaseUrl.js';

test('session connections default to five and queue for at most twenty seconds', () => {
  const result = new URL(databaseUrlWithPoolDefaults('postgresql://app:secret@pooler.example:5432/postgres'));
  assert.equal(result.searchParams.get('connection_limit'), '5');
  assert.equal(result.searchParams.get('pool_timeout'), '20');
  assert.equal(result.port, '5432');
});

test('explicit budgets and transaction-pool options survive unchanged', () => {
  const input = 'postgresql://app:p%40ss%26word@pooler.example:6543/postgres?pgbouncer=true&connection_limit=2&pool_timeout=15&sslmode=require';
  assert.equal(databaseUrlWithPoolDefaults(input), input);
});

test('a partial configuration gets only the missing default and preserves credentials', () => {
  const input = new URL('postgresql://app:p%40ss%26word@pooler.example:5432/postgres?schema=public&connection_limit=3');
  const result = new URL(databaseUrlWithPoolDefaults(input.toString()));
  assert.equal(result.password, input.password);
  assert.equal(result.username, input.username);
  assert.equal(result.searchParams.get('schema'), 'public');
  assert.equal(result.searchParams.get('connection_limit'), '3');
  assert.equal(result.searchParams.get('pool_timeout'), '20');
});

test('missing configuration retains Prisma validation; malformed URLs do not disclose credentials', () => {
  assert.equal(databaseUrlWithPoolDefaults(undefined), undefined);
  assert.throws(() => databaseUrlWithPoolDefaults('bad-password-value'), { message: 'DATABASE_URL must be a valid PostgreSQL connection URL' });
});
