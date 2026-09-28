import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { photoSlots, photoTarget, compressionConfig, createPhotoStore } from '../../services/webpCompression.js';

const base = 'https://pub-fixture.r2.dev';
const jpg = name => base + '/' + name + '.jpg';
const signal = () => new AbortController().signal;

test('legacy photo slots retain alignment while unsupported sources have no WebP target', () => {
  const raw = JSON.stringify([base + '/clip.mp4, ' + jpg('a') + ', ' + jpg('b'), null,
    base + '/brochure.pdf', 'http://127.0.0.1/admin', 'https://other.example/a.jpg']);
  const slots = photoSlots(raw);
  assert.equal(slots.length, 7);
  assert.deepEqual(slots.map(source => photoTarget(source, base)?.url ?? null),
    [null, base + '/webp/a.webp', base + '/webp/b.webp', null, null, null, null]);
});

test('URL validation rejects bucket lookalikes, credentials and unsupported paths', () => {
  for (const url of [`${base}.attacker.example/a.jpg`, 'http://pub-fixture.r2.dev/a.jpg', `${base}/x.MOV?x=.jpg`, `${base}/x.pdf`, 'https://user:pass@pub-fixture.r2.dev/a.jpg', `${base}/`]) assert.equal(photoTarget(url, base), null);
  assert.deepEqual(photoTarget(`${base}/folder/photo%20one.JPG?cache=1`, base), { key: 'webp/folder/photo one.webp', url: `${base}/webp/folder/photo%20one.webp` });
  assert.deepEqual(photoSlots('https://res.cloudinary.com/demo/w_800,q_auto/a.jpg'), ['https://res.cloudinary.com/demo/w_800,q_auto/a.jpg']);
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
