import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createWebpJob, JOB_KEYS, ACQUIRE, CHECKPOINT, FINISH } from '../../services/webpJob.js';

// In-memory model of the three atomic Redis operations. No external Redis or
// credentials are used; competing workers share this store just as in production.
export function memoryRedis() {
  const values = new Map();
  return { values, get: async key => values.get(key) ?? null,
    eval: async (script, { keys, arguments: args }) => {
      const [lock, status, cursor] = keys;
      if (script === ACQUIRE) {
        if (values.has(lock)) return 0;
        values.set(lock, args[0]); values.set(status, args[2]); return 1;
      }
      if (values.get(lock) !== args[0]) return 0;
      if (script === CHECKPOINT) {
        if (args[2]) values.set(status, args[2]);
        if (args[4]) values.set(cursor, args[4]);
      } else if (script === FINISH) {
        values.set(status, args[1]); values.delete(lock);
      } else throw new Error('Unexpected Redis script');
      return 1;
    },
  };
}

function harness(run, options = {}, redis = memoryRedis()) {
  const scheduled = [];
  const logs = [];
  const job = createWebpJob({ getRedis: async () => redis, run,
    schedule: fn => scheduled.push(fn), log: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) }, ...options });
  return { job, redis, logs, scheduled };
}
const finished = { cursor: 0, scanned: 2, complete: true, failed: 0, stale: 0 };

test('two instances accept only one active sweep, and acknowledgement precedes any work', async () => {
  let runs = 0;
  const h = harness(async ({ onProgress }) => { runs++; await onProgress(finished); return finished; });
  const other = harness(async () => { throw new Error('must not run'); }, {}, h.redis);
  const [a, b] = await Promise.all([h.job.start(), other.job.start()]);
  assert.equal(a.status, 'accepted');
  assert.deepEqual(b, { status: 'already_running', jobId: a.jobId });
  assert.equal(runs, 0);
  assert.equal((await h.job.status()).status, 'queued');
  await h.scheduled.shift()();
  assert.equal(runs, 1);
  assert.equal((await h.job.status()).status, 'succeeded');
  assert.equal(h.redis.values.has(JOB_KEYS[0]), false);
  assert.equal(h.redis.values.get(JOB_KEYS[2]), '0');
  assert.equal((await other.job.start()).status, 'accepted');
});

test('a crashed worker is reported as interrupted; its replacement resumes the persistent cursor', async () => {
  const h = harness(async ({ startId, onProgress }) => {
    assert.equal(startId, 42); await onProgress(finished); return finished;
  });
  h.redis.values.set(JOB_KEYS[1], JSON.stringify({ jobId: 'old', status: 'running' }));
  h.redis.values.set(JOB_KEYS[2], '42');
  assert.equal((await h.job.status()).status, 'interrupted');
  await h.job.start(); await h.scheduled.shift()();
  assert.equal((await h.job.status()).status, 'succeeded');
});

test('a failed run preserves its checkpoint and allows the following daily trigger to retry', async () => {
  const h = harness(async ({ onProgress }) => { await onProgress({ cursor: 19, updated: 3 }); throw new Error('private upstream detail'); });
  await h.job.start(); await h.scheduled.shift()();
  const status = await h.job.status();
  assert.equal(status.status, 'failed');
  assert.equal(status.progress.cursor, 19);
  assert.equal(h.redis.values.get(JOB_KEYS[2]), '19');
  assert.equal(JSON.stringify([status, h.logs]).includes('private upstream detail'), false);
  assert.equal((await h.job.start()).status, 'accepted');
});

test('time budget aborts work and records a resumable partial result', async () => {
  const h = harness(async ({ signal, onProgress }) => {
    await onProgress({ cursor: 12, updated: 1 });
    await delay(100, undefined, { signal });
    throw new Error('deadline did not abort');
  }, { maxRunMs: 10 });
  await h.job.start(); await h.scheduled.shift()();
  const status = await h.job.status();
  assert.equal(status.status, 'partial');
  assert.equal(status.progress.cursor, 12);
});

test('lease loss aborts an old worker without replacing a new worker status, cursor or lock', async () => {
  const h = harness(async ({ signal, onProgress }) => {
    await onProgress({ cursor: 10 });
    h.redis.values.set(JOB_KEYS[0], 'new');
    h.redis.values.set(JOB_KEYS[1], JSON.stringify({ jobId: 'new', status: 'running' }));
    h.redis.values.set(JOB_KEYS[2], '20');
    await delay(100, undefined, { signal });
    throw new Error('lease loss did not abort');
  }, { heartbeatMs: 5 });
  await h.job.start(); await h.scheduled.shift()();
  assert.deepEqual(await h.job.status(), { jobId: 'new', status: 'running' });
  assert.equal(h.redis.values.get(JOB_KEYS[0]), 'new');
  assert.equal(h.redis.values.get(JOB_KEYS[2]), '20');
});

test('losing the lease exactly at completion cannot claim success or delete the replacement lock', async () => {
  const h = harness(async () => {
    h.redis.values.set(JOB_KEYS[0], 'new');
    h.redis.values.set(JOB_KEYS[1], JSON.stringify({ jobId: 'new', status: 'queued' }));
    return finished;
  });
  await h.job.start(); await h.scheduled.shift()();
  assert.equal((await h.job.status()).jobId, 'new');
  assert.equal(h.redis.values.get(JOB_KEYS[0]), 'new');
  assert.equal(h.logs.some(entry => entry[1] === 'succeeded'), false);
});

test('partial photo failures and concurrent edits are not reported as full success', async () => {
  for (const progress of [{ ...finished, failed: 1 }, { ...finished, stale: 1 }, { ...finished, complete: false }]) {
    const h = harness(async () => progress);
    await h.job.start(); await h.scheduled.shift()();
    assert.equal((await h.job.status()).status, 'partial');
  }
});

test('Redis unavailable at acceptance fails closed without starting an untracked sweep', async () => {
  const h = harness(async () => finished, { getRedis: async () => { throw new Error('offline'); } });
  await assert.rejects(h.job.start(), /offline/);
  assert.equal(h.scheduled.length, 0);
});

test('heartbeats renew the lease during a long warehouse conversion', async () => {
  const redis = memoryRedis();
  const original = redis.eval;
  let renewals = 0;
  redis.eval = async (script, options) => {
    if (script === CHECKPOINT && options.arguments[2] === '') renewals++;
    return original(script, options);
  };
  const h = harness(async () => { await delay(35); return finished; }, { heartbeatMs: 5 }, redis);
  await h.job.start(); await h.scheduled.shift()();
  assert.ok(renewals >= 1);
  assert.equal((await h.job.status()).status, 'succeeded');
});
