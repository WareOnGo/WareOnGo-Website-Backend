import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../models/prismaClient.js';
import { getBlogs, getBlogBySlug } from '../controllers/blogController.js';

const thumbnail = { url: 'https://images.example/warehouse.webp', alt: 'Warehouse', width: 1200, height: 800 };
const row = { slug: 'warehouse-guide', title: 'Warehouse guide', dateModified: new Date('2026-10-06'), thumbnail };
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mockQuery(t, method, value) {
  const original = prisma.blog[method];
  const query = t.mock.fn(async () => value);
  prisma.blog[method] = query;
  t.after(() => { prisma.blog[method] = original; });
  return query;
}

test('published blog list and detail return the uploaded thumbnail', async (t) => {
  const listQuery = mockQuery(t, 'findMany', [row]);
  const detailQuery = mockQuery(t, 'findFirst', row);
  const list = response();
  const detail = response();
  await getBlogs({}, list);
  await getBlogBySlug({ params: { slug: row.slug } }, detail);
  assert.equal(list.code, 200);
  assert.deepEqual(list.body.data[0].thumbnail, thumbnail);
  assert.deepEqual(detail.body.data.thumbnail, thumbnail);
  assert.equal(listQuery.mock.calls[0].arguments[0].where.status, 'PUBLISHED');
  assert.equal(detailQuery.mock.calls[0].arguments[0].where.status, 'PUBLISHED');
});

test('legacy posts omit unset thumbnails from the public JSON', async (t) => {
  mockQuery(t, 'findMany', [{ ...row, thumbnail: null }]);
  const res = response();
  await getBlogs({}, res);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(res.body.data[0])), 'thumbnail'), false);
});
