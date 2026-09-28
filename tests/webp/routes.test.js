import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import express from 'express';
import { createWebpRouter, compressionToken } from '../../routes/webpRoutes.js';
import { createEnricherWebpJob } from '../../services/enricherWebpJob.js';

const secret = 'fake-r2-secret-for-tests-only';
const authorization = `Bearer ${createHmac('sha256', secret).update('wareongo:warehouse-webp-trigger:v1').digest('hex')}`;

async function server(t, options = {}) {
  const calls = { start: 0, status: 0 };
  const app = express();
  app.use('/maintenance/webp', createWebpRouter({ secret: () => secret,
    job: { start: async () => { calls.start++; return { status: 'accepted', jobId: 'fixture-job' }; },
      status: async () => { calls.status++; return { status: 'idle' }; } }, ...options }));
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    listener.close(error => error ? reject(error) : resolve());
    listener.closeAllConnections();
  }));
  const request = (method = 'POST', token = authorization) => fetch(`http://127.0.0.1:${listener.address().port}/maintenance/webp`, {
    method, headers: token == null ? {} : { Authorization: token }, signal: AbortSignal.timeout(2_000),
  });
  return { request, calls };
}

test('HTTP: missing, incorrect and raw storage credentials cannot trigger or inspect jobs', async t => {
  const h = await server(t);
  for (const method of ['POST', 'GET']) for (const token of [null, 'Bearer wrong', `Bearer ${secret}`, `Bearer ${'a'.repeat(64)}`]) {
    const response = await h.request(method, token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
  assert.deepEqual(h.calls, { start: 0, status: 0 });
  assert.equal(compressionToken(` ${secret} `), authorization.slice(7));
});

test('HTTP: authenticated POST acknowledges and GET reads status without launching work', async t => {
  const h = await server(t);
  const response = await h.request();
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: 'accepted', jobId: 'fixture-job' });
  assert.deepEqual(await (await h.request('GET')).json(), { status: 'idle' });
  assert.deepEqual(h.calls, { start: 1, status: 1 });
});

test('HTTP: incomplete configuration refuses to launch compression', async t => {
  for (const options of [{ secret: () => '' }, { configured: () => false }]) {
    const h = await server(t, options);
    const response = await h.request();
    assert.equal(response.status, 503);
    assert.equal(h.calls.start, 0);
    assert.equal(JSON.stringify(await response.json()).includes(secret), false);
  }
});

test('HTTP: job-store errors produce bounded public errors without leaking upstream details', async t => {
  const fail = async () => { throw new Error(`redis://private:${secret}@host`); };
  const h = await server(t, { job: { start: fail, status: fail } });
  for (const method of ['POST', 'GET']) {
    const response = await h.request(method);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(await response.json()).includes(secret), false);
  }
});

test('HTTP integration forwards acknowledgement, duplicate and status to the EC2 worker', async t => {
  const responses = [
    { status: 'accepted', jobId: '42' },
    { status: 'already_running', jobId: '42' },
    { status: 'SUCCESS', jobId: '42', progress: { executor: 'warehouse-enricher', ready: 1 } },
  ];
  const calls = [];
  const job = createEnricherWebpJob({ secret: () => secret, request: async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(options.headers.authorization, authorization);
    return Response.json(responses.shift(), { status: options.method === 'POST' ? 202 : 200 });
  } });
  const h = await server(t, { job });
  assert.deepEqual(await (await h.request()).json(), { status: 'accepted', jobId: '42' });
  assert.deepEqual(await (await h.request()).json(), { status: 'already_running', jobId: '42' });
  assert.deepEqual(await (await h.request('GET')).json(),
    { status: 'SUCCESS', jobId: '42', progress: { executor: 'warehouse-enricher', ready: 1 } });
  assert.deepEqual(calls.map(call => call.method), ['POST', 'POST', 'GET']);
  assert.ok(calls.every(call => call.url === 'https://wareongo-cronjobs.duckdns.org/maintenance/webp'));
});
