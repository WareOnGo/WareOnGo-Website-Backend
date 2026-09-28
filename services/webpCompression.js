import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { convertImageFile } from './webpImageProcess.js';

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

export function createPhotoStore(config, { client, fetchPhoto = fetch, requestTimeoutMs = 30_000, convertFile = convertImageFile, temporaryRoot = tmpdir() } = {}) {
  const s3 = client ?? new S3Client({ region: 'auto', endpoint: `https://${config.account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secret }, maxAttempts: 2 });
  return {
    publicBase: config.publicBase,
    bucket: config.bucket,
    version: `sharp-w${config.width}-q${config.quality}-v1`,
    async objectMetadata(key, signal) {
      try {
        const object = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
          { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
        return object.ContentLength > 0 ? { bytes: object.ContentLength, modifiedAt: object.LastModified ?? null } : null;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
      }
    },
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
    async upload(source, target, signal, activity = async () => {}) {
      const directory = await mkdtemp(join(temporaryRoot, 'warehouse-webp-'));
      try {
        await activity('download');
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
        const input = join(directory, 'original');
        const output = join(directory, 'converted.webp');
        let file;
        let reader;
        let size = 0;
        try {
          file = await open(input, 'wx', 0o600);
          reader = response.body.getReader();
          while (true) {
            requestSignal.throwIfAborted();
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BYTES) throw new Error('source_too_large');
            // Write each bounded chunk to disk; never retain a whole original or
            // duplicate it via Buffer.concat inside the long-lived API process.
            await file.writeFile(value);
          }
        } finally {
          if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          else await response.body.cancel().catch(() => {});
          await file?.close();
        }
        signal.throwIfAborted();
        await activity('convert');
        const converted = await convertFile(input, output, config, signal);
        signal.throwIfAborted();
        await activity('upload', { workerPeakRssMiB: converted.peakRssMiB });
        const { size: outputBytes } = await stat(output);
        if (!outputBytes || outputBytes > MAX_BYTES) throw new Error('source_invalid_output');
        // Only the small finished WebP enters API memory, never decoded pixels.
        const body = await readFile(output);
        await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: target.key, Body: body,
          ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
        return outputBytes;
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}
