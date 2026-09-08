import sharp from 'sharp';
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif|gif|tiff?|bmp)$/i;
const MAX_BYTES = 20 * 1024 * 1024;

export function photoSlots(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* URL or legacy CSV. */ }
  }
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).flatMap(entry => typeof entry === 'string'
    ? entry.split(/,\s*(?=https?:\/\/)/i).map(url => url.trim() || null)
    : [null]);
}

// Compression only reads this service's public bucket. Database photo values
// must never make the maintenance worker fetch arbitrary/internal hosts.
export function photoTarget(source, publicBase) {
  if (typeof source !== 'string') return null;
  try {
    const url = new URL(source);
    const base = new URL(publicBase);
    if (url.origin !== base.origin || url.protocol !== 'https:' || url.username || url.password) return null;
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!path || path.endsWith('/') || (/\.[^/.]+$/.test(path) && !IMAGE_EXTENSIONS.test(path))) return null;
    const key = `webp/${path.replace(IMAGE_EXTENSIONS, '')}.webp`;
    return { key, url: `${base.origin}/${key.split('/').map(encodeURIComponent).join('/')}` };
  } catch { return null; }
}

export function compressionConfig(env = process.env) {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
  if (names.some(name => !env[name]?.trim())) throw new Error('webp_configuration_missing');
  const base = new URL(env.R2_PUBLIC_URL.trim());
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('webp_public_url_invalid');
  }
  const width = Number(env.WEBP_MAX_WIDTH || 1280);
  const quality = Number(env.WEBP_QUALITY || 75);
  if (!Number.isInteger(width) || width < 320 || width > 2560 || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error('webp_configuration_invalid');
  }
  return { account: env.R2_ACCOUNT_ID.trim(), accessKey: env.R2_ACCESS_KEY_ID.trim(), secret: env.R2_SECRET_ACCESS_KEY.trim(),
    bucket: env.R2_BUCKET_NAME.trim(), publicBase: base.origin, width, quality };
}

export function createPhotoStore(config, { client, fetchPhoto = fetch, requestTimeoutMs = 30_000 } = {}) {
  const s3 = client ?? new S3Client({ region: 'auto', endpoint: `https://${config.account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secret }, maxAttempts: 2 });
  return {
    publicBase: config.publicBase,
    async existingKeys(signal) {
      // One paginated listing replaces thousands of daily HEAD requests, and
      // repairs DB URLs whose objects were removed from the bucket.
      const keys = new Set();
      let continuation;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: 'webp/',
          MaxKeys: 1000, ContinuationToken: continuation }), { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
        for (const object of page.Contents ?? []) if (object.Key && object.Size > 0) keys.add(object.Key);
        const next = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && (!next || next === continuation)) throw new Error('webp_listing_incomplete');
        continuation = next;
      } while (continuation);
      return keys;
    },
    async upload(source, target, signal) {
      // The timeout covers the body as well as the response headers.
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
      const response = await fetchPhoto(source, { signal: requestSignal, redirect: 'error' });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`source_http_${response.status}`); }
      if (/^(video\/|application\/pdf)/i.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel(); throw new Error('source_not_image');
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel(); throw new Error('source_too_large');
      }
      if (!response.body) throw new Error('source_empty');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          requestSignal.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new Error('source_too_large');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      signal.throwIfAborted();
      const bytes = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
        .timeout({ seconds: 15 }).rotate().resize({ width: config.width, withoutEnlargement: true })
        .webp({ quality: config.quality }).toBuffer();
      signal.throwIfAborted();
      await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: target.key, Body: bytes,
        ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }),
      { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      return bytes.length;
    },
  };
}

export function warehousePhotoRepository(prisma) {
  return {
    page: ({ after, through, visibleOnly, warehouseId }) => prisma.warehouse.findMany({
      where: { photos: { not: null }, ...(visibleOnly ? { visibility: true } : {}),
        id: warehouseId ? warehouseId : { gt: after, ...(through == null ? {} : { lte: through }) } },
      orderBy: { id: 'asc' }, take: warehouseId ? 1 : 50,
      select: { id: true, photos: true, photosWebp: true },
    }),
    // Compare-and-swap avoids saving obsolete mappings over a concurrent photo
    // edit. Raw SQL updates only this derived column, leaving Prisma's unrelated
    // status_updated_at @updatedAt field alone. Parameters are never interpolated.
    save: (row, value) => prisma.$executeRaw`
      UPDATE "Warehouse" SET "photosWebp" = ${value}
      WHERE id = ${row.id} AND photos IS NOT DISTINCT FROM ${row.photos}
        AND "photosWebp" IS NOT DISTINCT FROM ${row.photosWebp}`,
  };
}

async function parallelMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await fn(items[index]); }
  }));
  return results;
}

/** Resumable, idempotent sweep; both the nightly endpoint and CLI use this. */
export async function compressWarehousePhotos({ repository, store, signal = new AbortController().signal,
  startId = 0, visibleOnly = true, warehouseId, limit, concurrency = 2, force = false, dryRun = false,
  onProgress = async () => {}, clearCache = async () => {} }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isSafeInteger(startId) || startId < 0) {
    throw new Error('webp_invalid_run_options');
  }
  const summary = { cursor: startId, scanned: 0, updated: 0, uploaded: 0, reused: 0, skipped: 0,
    failed: 0, stale: 0, bytes: 0, wouldUpload: 0, complete: false, errors: [] };
  const existing = await store.existingKeys(signal);
  const inFlight = new Map();
  // Remember failures too: duplicated source URLs get at most one attempt per
  // run, and will be retried on the next daily invocation.
  const attempted = new Map();
  const convert = async (source) => {
    signal.throwIfAborted();
    const target = photoTarget(source, store.publicBase);
    if (!target) { summary.skipped++; return null; }
    if ((!force && existing.has(target.key)) || attempted.get(target.key) === true) {
      summary.reused++; return target.url;
    }
    if (attempted.get(target.key) === false) return null;
    if (inFlight.has(target.key)) return inFlight.get(target.key);
    const task = (async () => {
      try {
        if (dryRun) summary.wouldUpload++;
        else { summary.bytes += await store.upload(source, target, signal); summary.uploaded++; existing.add(target.key); }
        attempted.set(target.key, true);
        return target.url;
      } catch (error) {
        signal.throwIfAborted();
        attempted.set(target.key, false);
        summary.failed++;
        const reason = /^source_[a-z_0-9]+$/.test(error?.message ?? '') ? error.message
          : error?.name === 'TimeoutError' ? 'source_timeout' : 'conversion_or_upload_failed';
        if (summary.errors.length < 5) summary.errors.push({ reason });
        return null;
      }
    })();
    inFlight.set(target.key, task);
    try { return await task; } finally { inFlight.delete(target.key); }
  };
  try {
    // Resume where an interrupted/budget-limited run stopped, then wrap once.
    const ranges = warehouseId ? [[0, null]] : startId > 0 ? [[startId, null], [0, startId]] : [[0, null]];
    for (const [begin, through] of ranges) {
      let after = begin;
      while (true) {
        signal.throwIfAborted();
        const rows = await repository.page({ after, through, visibleOnly, warehouseId });
        if (!rows.length) break;
        for (const row of rows) {
          signal.throwIfAborted();
          const mapped = await parallelMap(photoSlots(row.photos), concurrency, convert);
          signal.throwIfAborted();
          const value = JSON.stringify(mapped);
          if (!dryRun && value !== row.photosWebp) {
            if (await repository.save(row, value)) summary.updated++;
            else summary.stale++;
          }
          summary.scanned++;
          summary.cursor = row.id;
          await onProgress({ ...summary });
          if (limit && summary.scanned >= limit) return summary;
        }
        if (warehouseId) break;
        after = rows.at(-1).id;
      }
    }
    summary.complete = true;
    summary.cursor = 0;
    await onProgress({ ...summary });
    return summary;
  } finally {
    if (summary.updated) {
      try { await clearCache(); } catch { summary.warning = 'Warehouse API cache could not be cleared; entries will expire normally.'; }
    }
  }
}
