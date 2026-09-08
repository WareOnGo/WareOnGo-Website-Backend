import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { photoSlots, photoTarget, compressionConfig, createPhotoStore, compressWarehousePhotos, warehousePhotoRepository } from '../../services/webpCompression.js';

const base = 'https://pub-fixture.r2.dev';
const jpg = name => `${base}/${name}.jpg`;
const webp = name => `${base}/webp/${name}.webp`;
const signal = () => new AbortController().signal;
function harness(initial, keys = []) {
  const rows = structuredClone(initial);
  const calls = { uploads: [], saves: [], checkpoints: [], clears: 0 };
  const existing = new Set(keys);
  const repository = {
    page: async ({ after, through, warehouseId }) => rows.filter(row => warehouseId ? row.id === warehouseId : row.id > after && (through == null || row.id <= through)).slice(0, 50).map(row => structuredClone(row)),
    save: async (snapshot, value) => {
      const row = rows.find(row => row.id === snapshot.id);
      if (row.photos !== snapshot.photos || row.photosWebp !== snapshot.photosWebp) return 0;
      row.photosWebp = value; calls.saves.push(row.id); return 1;
    },
  };
  const store = { publicBase: base, existingKeys: async () => new Set(existing),
    upload: async (url, target) => { calls.uploads.push(url); existing.add(target.key); return 10; } };
  const run = options => compressWarehousePhotos({ repository, store, onProgress: async p => { calls.checkpoints.push(p); },
    clearCache: async () => { calls.clears++; }, ...options });
  return { rows, calls, repository, store, run, existing };
}

test('legacy CSV inside arrays preserves null slots and skips videos, documents and foreign origins', async () => {
  const raw = JSON.stringify([`${base}/clip.mp4, ${jpg('a')}, ${jpg('b')}`, null, `${base}/brochure.pdf`, 'http://127.0.0.1/admin', 'https://other.example/a.jpg']);
  assert.equal(photoSlots(raw).length, 7);
  const h = harness([{ id: 1, photos: raw, photosWebp: null }]);
  const result = await h.run();
  assert.deepEqual(JSON.parse(h.rows[0].photosWebp), [null, webp('a'), webp('b'), null, null, null, null]);
  assert.deepEqual(h.calls.uploads.sort(), [jpg('a'), jpg('b')]);
  assert.equal(result.skipped, 5);
});

test('URL validation rejects bucket lookalikes, credentials and unsupported paths', () => {
  for (const url of [`${base}.attacker.example/a.jpg`, 'http://pub-fixture.r2.dev/a.jpg', `${base}/x.MOV?x=.jpg`, `${base}/x.pdf`, 'https://user:pass@pub-fixture.r2.dev/a.jpg', `${base}/`]) assert.equal(photoTarget(url, base), null);
  assert.deepEqual(photoTarget(`${base}/folder/photo%20one.JPG?cache=1`, base), { key: 'webp/folder/photo one.webp', url: `${base}/webp/folder/photo%20one.webp` });
  assert.deepEqual(photoSlots('https://res.cloudinary.com/demo/w_800,q_auto/a.jpg'), ['https://res.cloudinary.com/demo/w_800,q_auto/a.jpg']);
});

test('reordering and replacing photos repairs positional mappings and reuses R2 objects', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('new'), jpg('b'), jpg('a')]), photosWebp: JSON.stringify([webp('a'), webp('removed'), webp('b')]) }], ['webp/a.webp', 'webp/b.webp']);
  const first = await h.run();
  assert.deepEqual(h.calls.uploads, [jpg('new')]);
  assert.deepEqual(JSON.parse(h.rows[0].photosWebp), [webp('new'), webp('b'), webp('a')]);
  assert.equal(first.updated, 1);
  const second = await h.run();
  assert.equal(second.uploaded, 0);
  assert.equal(second.updated, 0);
  assert.equal(h.calls.clears, 1);
});

test('missing objects are regenerated even when photosWebp claims they exist', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a')]), photosWebp: JSON.stringify([webp('a')]) }]);
  const result = await h.run();
  assert.equal(result.uploaded, 1);
  assert.equal(result.updated, 0);
});

test('concurrent photo edits keep their data; the following run repairs the new mapping', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a')]), photosWebp: null }]);
  const upload = h.store.upload;
  h.store.upload = async (...args) => { h.rows[0].photos = JSON.stringify([jpg('b')]); return upload(...args); };
  const first = await h.run();
  assert.equal(first.stale, 1);
  assert.equal(h.rows[0].photosWebp, null);
  h.store.upload = upload;
  await h.run();
  assert.deepEqual(JSON.parse(h.rows[0].photosWebp), [webp('b')]);
});

test('duplicate failed photos are bounded within a run and retried on the next run', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('bad'), jpg('bad'), jpg('good')]), photosWebp: null }]);
  const upload = h.store.upload;
  let failures = 0;
  h.store.upload = async (...args) => { if (args[0] === jpg('bad')) { failures++; throw new Error('source_http_404'); } return upload(...args); };
  const first = await h.run();
  assert.equal(failures, 1);
  assert.equal(first.failed, 1);
  assert.deepEqual(JSON.parse(h.rows[0].photosWebp), [null, null, webp('good')]);
  await h.run();
  assert.equal(failures, 2);
});

test('a saved cursor resumes then wraps once, while a limited run saves its last row', async () => {
  const rows = [1, 2, 3].map(id => ({ id, photos: JSON.stringify([jpg(String(id))]), photosWebp: null }));
  const h = harness(rows);
  const partial = await h.run({ limit: 2 });
  assert.equal(partial.cursor, 2);
  assert.equal(partial.complete, false);
  h.calls.checkpoints.length = 0;
  const full = await h.run({ startId: partial.cursor });
  assert.deepEqual(h.calls.checkpoints.map(x => x.cursor), [3, 1, 2, 0]);
  assert.equal(full.complete, true);
  assert.equal(full.uploaded, 1);
});

test('dry-run does not upload, write rows or invalidate cache', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a')]), photosWebp: null }]);
  const result = await h.run({ dryRun: true });
  assert.equal(result.wouldUpload, 1);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.saves.length, 0);
  assert.equal(h.calls.clears, 0);
});

test('failed bucket inventory aborts before any database mapping is cleared', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a')]), photosWebp: JSON.stringify([webp('a')]) }]);
  h.store.existingKeys = async () => { throw new Error('R2 unavailable'); };
  await assert.rejects(h.run());
  assert.equal(h.calls.saves.length, 0);
});

test('abort stops work without saving a partially built photo array', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a'), jpg('b')]), photosWebp: null }]);
  const controller = new AbortController();
  h.store.upload = async () => { controller.abort(new Error('cancelled')); return 10; };
  await assert.rejects(h.run({ signal: controller.signal, concurrency: 1 }));
  assert.equal(h.rows[0].photosWebp, null);
});

test('concurrency is capped and bad options cannot clear photo mappings', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a'), jpg('b'), jpg('c'), jpg('d')]), photosWebp: null }]);
  let active = 0; let peak = 0;
  h.store.upload = async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return 10; };
  await h.run();
  assert.equal(peak, 2);
  await assert.rejects(h.run({ concurrency: 0 }), /invalid_run_options/);
  await assert.rejects(h.run({ concurrency: 10 }), /invalid_run_options/);
});

test('cache failure reports a warning after preserving successful writes', async () => {
  const h = harness([{ id: 1, photos: JSON.stringify([jpg('a')]), photosWebp: null }]);
  const result = await h.run({ clearCache: async () => { throw new Error('offline'); } });
  assert.equal(result.updated, 1);
  assert.match(result.warning, /expire/);
});

test('repository writes only the derived column, with parameterized compare-and-swap guards', async () => {
  let query;
  const repository = warehousePhotoRepository({ $executeRaw: (...args) => { query = args; return 1; } });
  const row = { id: 42, photos: 'original', photosWebp: null };
  await repository.save(row, 'converted');
  assert.deepEqual(query.slice(1), ['converted', 42, 'original', null]);
  assert.match(query[0].join('?'), /photos IS NOT DISTINCT FROM/);
  assert.match(query[0].join('?'), /"photosWebp" IS NOT DISTINCT FROM/);
  assert.doesNotMatch(query[0].join('?'), /status_updated_at/);
});

const config = { account: 'test', accessKey: 'test', secret: 'test', bucket: 'photos', publicBase: base, width: 1280, quality: 75 };
test('real Sharp conversion produces a resized WebP and immutable R2 metadata', async () => {
  const input = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#aabbcc' } }).jpeg().toBuffer();
  let uploaded;
  const store = createPhotoStore(config, {
    client: { send: async command => { uploaded = command.input; return {}; } },
    fetchPhoto: async (_url, options) => { assert.equal(options.redirect, 'error'); return new Response(input, { headers: { 'Content-Type': 'image/jpeg' } }); },
  });
  const bytes = await store.upload(jpg('a'), photoTarget(jpg('a'), base), signal());
  const metadata = await sharp(uploaded.Body).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 853);
  assert.equal(bytes, uploaded.Body.length);
  assert.equal(uploaded.Key, 'webp/a.webp');
  assert.equal(uploaded.ContentType, 'image/webp');
  assert.equal(uploaded.CacheControl, 'public, max-age=31536000, immutable');
});

test('R2 inventory follows continuation tokens and ignores zero-byte objects', async () => {
  let pages = 0;
  const store = createPhotoStore(config, { client: { send: async command => {
    pages++;
    assert.equal(command.input.Prefix, 'webp/');
    if (pages === 1) return { Contents: [{ Key: 'webp/a.webp', Size: 100 }, { Key: 'webp/empty.webp', Size: 0 }], IsTruncated: true, NextContinuationToken: 'next' };
    assert.equal(command.input.ContinuationToken, 'next');
    return { Contents: [{ Key: 'webp/b.webp', Size: 100 }] };
  } } });
  assert.deepEqual([...await store.existingKeys(signal())], ['webp/a.webp', 'webp/b.webp']);
});

test('oversized images and non-images are rejected before conversion or upload', async () => {
  for (const headers of [{ 'Content-Length': String(21 * 1024 * 1024) }, { 'Content-Type': 'video/mp4' }]) {
    const store = createPhotoStore(config, { client: { send: () => { throw new Error('must not upload'); } }, fetchPhoto: async () => new Response('bad', { headers }) });
    await assert.rejects(store.upload(jpg('a'), photoTarget(jpg('a'), base), signal()), /source_(too_large|not_image)/);
  }
});

test('download timeout also covers a response body that stalls after its headers', async () => {
  const keepAlive = setInterval(() => {}, 100);
  const store = createPhotoStore(config, { requestTimeoutMs: 10, client: { send: () => { throw new Error('must not upload'); } },
    fetchPhoto: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    } })) });
  try { await assert.rejects(store.upload(jpg('a'), photoTarget(jpg('a'), base), signal()), { name: 'TimeoutError' }); }
  finally { clearInterval(keepAlive); }
});

test('configuration fails closed before a sweep can start', () => {
  assert.throws(() => compressionConfig({}), /configuration_missing/);
  const env = { R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test', R2_PUBLIC_URL: base };
  assert.equal(compressionConfig(env).width, 1280);
  assert.throws(() => compressionConfig({ ...env, WEBP_MAX_WIDTH: '0' }), /invalid/);
  assert.throws(() => compressionConfig({ ...env, R2_PUBLIC_URL: 'http://internal/' }), /invalid/);
});
