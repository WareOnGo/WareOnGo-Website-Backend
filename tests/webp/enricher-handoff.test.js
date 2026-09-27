import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createEnricherWebpJob } from '../../services/enricherWebpJob.js';

test('nightly WebP triggers retain their acknowledgement and scoped credential through the handoff', async () => {
  const calls = [], key = 'test-storage-key';
  const job = createEnricherWebpJob({ secret: () => key, request: async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(options.method === 'POST' ? { status: 'accepted', jobId: '42' } : { status: 'SUCCESS', jobId: '42' },
      { status: options.method === 'POST' ? 202 : 200 });
  } });
  assert.deepEqual(await job.start(), { status: 'accepted', jobId: '42' });
  assert.equal((await job.status()).status, 'SUCCESS');
  assert.deepEqual(calls.map(row => row.method), ['POST', 'GET']);
  const token = createHmac('sha256', key).update('wareongo:warehouse-webp-trigger:v1').digest('hex');
  assert.ok(calls.every(row => row.headers.authorization === `Bearer ${token}` && row.redirect === 'error'));
  assert.ok(calls.every(row => row.url === 'https://wareongo-cronjobs.duckdns.org/maintenance/webp'));
  assert.ok(!JSON.stringify(calls).includes(key));
});

test('failed/invalid handoffs do not retry or start a second local compressor', async () => {
  for (const response of [new Response('private details', { status: 500 }),
    Response.json({ status: 'accepted' }, { status: 202 }), Response.json({ status: 'running', jobId: '42' }, { status: 202 })]) {
    let calls = 0;
    const job = createEnricherWebpJob({ secret: () => 'test-key', request: async () => { calls++; return response; } });
    await assert.rejects(job.start(), error => !error.message.includes('private details'));
    assert.equal(calls, 1);
  }
});

test('an existing run is acknowledged without creating another run', async () => {
  const job = createEnricherWebpJob({ secret: () => 'test-key', request: async () =>
    Response.json({ status: 'already_running', jobId: '42' }, { status: 202 }) });
  assert.deepEqual(await job.start(), { status: 'already_running', jobId: '42' });
});
