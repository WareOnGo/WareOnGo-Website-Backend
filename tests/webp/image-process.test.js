import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { convertImageFile, imageMemoryUsage } from '../../services/webpImageProcess.js';
import { createPhotoStore } from '../../services/webpCompression.js';

const MIB = 1048576;
const config = { width: 1280, quality: 75, publicBase: 'https://fixture.example', bucket: 'fixture' };
const roomy = async () => ({ used: 80 * MIB, limit: 512 * MIB, childRss: 0 });
const signal = () => new AbortController().signal;
async function files(t, script) {
  const dir = await mkdtemp(join(tmpdir(), 'webp-process-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'source.jpg');
  const output = join(dir, 'output.webp');
  await sharp({ create: { width: 900, height: 1800, channels: 3, background: '#789abc' } }).jpeg().toFile(input);
  const workerPath = join(dir, 'worker.mjs');
  if (script) await writeFile(workerPath, script);
  return { dir, input, output, workerPath };
}

test('isolated conversion preserves a valid WebP and bounds both output dimensions', async t => {
  const f = await files(t);
  const result = await convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy });
  const metadata = await sharp(f.output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 640); assert.equal(metadata.height, 1280);
  assert.equal(result.bytes, (await readFile(f.output)).length);
  assert.ok(result.peakRssMiB > 0);
});

test('an abruptly killed native worker is a failed photo; the process gate remains usable', async t => {
  const f = await files(t, "process.kill(process.pid, 'SIGKILL');");
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy, workerPath: f.workerPath }), /source_worker_exit_sigkill/);
  assert.ok((await convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy })).ok);
});

test('a stuck decoder is killed on deadline and another image can proceed', async t => {
  const f = await files(t, 'setInterval(() => {}, 1000);');
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), {
    sampleMemory: roomy, workerPath: f.workerPath, timeoutMs: 30,
  }), /source_worker_timeout/);
  assert.ok((await convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy })).ok);
});

test('cancellation kills a live worker before returning and frees the next conversion', async t => {
  const f = await files(t, 'setInterval(() => {}, 1000);');
  const controller = new AbortController();
  let workerPid;
  await assert.rejects(convertImageFile(f.input, f.output, config, controller.signal, {
    workerPath: f.workerPath, monitorMs: 5, sampleMemory: async pid => {
      if (pid) { workerPid = pid; controller.abort(new Error('cancelled_fixture')); }
      return roomy();
    },
  }), /cancelled_fixture/);
  assert.ok(workerPid);
  assert.throws(() => process.kill(workerPid, 0), { code: 'ESRCH' });
  assert.ok((await convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy })).ok);
});

test('insufficient 512 MiB container headroom refuses to launch a decoder', async t => {
  const f = await files(t);
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), {
    sampleMemory: async () => ({ used: 300 * MIB, limit: 512 * MIB, childRss: 0 }),
  }), { code: 'WEBP_MEMORY_PRESSURE' });
  await assert.rejects(readFile(f.output), { code: 'ENOENT' });
});

test('container memory pressure during conversion kills the child and asks the sweep to pause', async t => {
  const f = await files(t, 'setInterval(() => {}, 1000);');
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), {
    workerPath: f.workerPath, monitorMs: 5,
    sampleMemory: async pid => ({ used: (pid ? 400 : 80) * MIB, limit: 512 * MIB, childRss: pid ? 100 * MIB : 0 }),
  }), { code: 'WEBP_MEMORY_PRESSURE' });
});

test('an image exceeding its own worker budget is skipped without exhausting the container', async t => {
  const f = await files(t, 'setInterval(() => {}, 1000);');
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), {
    workerPath: f.workerPath, monitorMs: 5,
    sampleMemory: async pid => ({ used: 250 * MIB, limit: 512 * MIB, childRss: pid ? 170 * MIB : 0 }),
  }), /source_worker_memory_limit/);
});

test('parallel callers still run only one native decoder at a time', async t => {
  const f = await files(t, `import fs from 'node:fs';
    fs.appendFileSync(process.argv[3], 'start\\n');
    setTimeout(() => { fs.appendFileSync(process.argv[3], 'finish\\n'); console.log(JSON.stringify({ ok: true, bytes: 1 })); }, 30);`);
  await Promise.all([1, 2].map(() => convertImageFile(f.input, f.output, config, signal(), { workerPath: f.workerPath, sampleMemory: roomy })));
  assert.deepEqual((await readFile(f.output, 'utf8')).trim().split('\n'), ['start', 'finish', 'start', 'finish']);
});

test('image pixel cap rejects oversized input inside the child', async t => {
  const f = await files(t);
  await sharp({ create: { width: 5000, height: 4000, channels: 3, background: '#789abc' } }).jpeg().toFile(f.input);
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy }), /source_too_many_pixels/);
});

test('untrusted decoder errors do not echo source data or private paths', async t => {
  const f = await files(t);
  await writeFile(f.input, 'not-an-image-with-private-details');
  await assert.rejects(convertImageFile(f.input, f.output, config, signal(), { sampleMemory: roomy }), { message: 'source_conversion_failed' });
});

test('streamed downloads preserve chunks and clean temporary files on success and failure', async t => {
  const f = await files(t);
  let uploads = 0;
  const makeStore = convertFile => createPhotoStore(config, { temporaryRoot: f.dir,
    client: { send: async command => { assert.deepEqual(command.input.Body, Buffer.from('webp-fixture')); uploads++; } },
    fetchPhoto: async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.from('first')); controller.enqueue(Buffer.from('second')); controller.close();
    } })), convertFile,
  });
  const store = makeStore(async (input, output) => {
    assert.equal(await readFile(input, 'utf8'), 'firstsecond');
    await writeFile(output, 'webp-fixture'); return { peakRssMiB: 100 };
  });
  assert.equal(await store.upload('https://fixture.example/photo.jpg', { key: 'webp/a.webp' }, signal()), 12);
  assert.equal(uploads, 1);
  const broken = makeStore(async () => { throw new Error('source_worker_exit_sigkill'); });
  await assert.rejects(broken.upload('https://fixture.example/photo.jpg', { key: 'webp/a.webp' }, signal()), /sigkill/);
  assert.equal(uploads, 1);
  assert.equal((await readdir(f.dir)).some(name => name.startsWith('warehouse-webp-')), false);
});

test('cgroup v2 accounts for the whole container and excludes reclaimable file cache', async () => {
  const paths = {
    '/proc/123/status': 'VmRSS:\t102400 kB\n',
    '/sys/fs/cgroup/memory.current': String(450 * MIB),
    '/sys/fs/cgroup/memory.max': String(512 * MIB),
    '/sys/fs/cgroup/memory.stat': `anon 200\ninactive_file ${50 * MIB}\n`,
  };
  assert.deepEqual(await imageMemoryUsage(123, async path => paths[path] ?? null), {
    used: 400 * MIB, limit: 512 * MIB, childRss: 100 * MIB, scope: 'container',
  });
});

test('cgroup v1 uses total inactive file cache and the actual service limit', async () => {
  const paths = {
    '/sys/fs/cgroup/memory/memory.usage_in_bytes': String(350 * MIB),
    '/sys/fs/cgroup/memory/memory.limit_in_bytes': String(512 * MIB),
    '/sys/fs/cgroup/memory/memory.stat': `inactive_file 1\ntotal_inactive_file ${64 * MIB}\n`,
  };
  assert.deepEqual(await imageMemoryUsage(undefined, async path => paths[path] ?? null), {
    used: 286 * MIB, limit: 512 * MIB, childRss: 0, scope: 'container',
  });
});

test('hosts without finite container metrics fall back to process RSS and a 512 MiB budget', async () => {
  const usage = await imageMemoryUsage(123, async path => path === '/proc/123/status' ? 'VmRSS: 102400 kB\n' : null);
  assert.equal(usage.scope, 'processes');
  assert.equal(usage.childRss, 100 * MIB);
  assert.equal(usage.limit, 512 * MIB);
  assert.ok(usage.used > usage.childRss);
});
