import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'node:crypto';
import { createImageCacheRouter } from '../../routes/imageCacheRoutes.js';
test('image cache invalidation requires its scoped token and makes one cache call', async () => {
 const secret = 'fixture-secret'; let cleared = 0;
 const app = express(); app.use('/cache', createImageCacheRouter({ secret: () => secret, clearCache: async () => { cleared++; } }));
 const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
 const endpoint = `http://127.0.0.1:${server.address().port}/cache`;
 try {
  const post = token => fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal((await post(secret)).status,401);
  assert.equal((await post(createHmac('sha256',secret).update('wareongo:warehouse-webp-trigger:v1').digest('hex'))).status,401);
  assert.equal(cleared,0);
  assert.equal((await post(createHmac('sha256',secret).update('wareongo:image-cache-invalidate:v1').digest('hex'))).status,200);
  assert.equal(cleared,1);
 } finally { await new Promise(resolve => server.close(resolve)); }
});
