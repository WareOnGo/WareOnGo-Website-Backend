/**
 * One-off backfill: compress every warehouse photo to WebP and store the URLs
 * in Warehouse.photosWebp (parallel JSON array, same indexing as photos).
 *
 * Run:   node scripts/compress_photos_to_webp.js
 * Flags: --limit=N         only process N warehouses
 *        --warehouse=ID    only process this warehouse id
 *        --concurrency=N   parallel photos per warehouse (default 4)
 *        --dry-run         compute keys but don't upload or write DB
 *        --force           re-upload even if WebP already exists in R2
 *
 * Required env (see .env.example):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 *
 * R2_PUBLIC_URL is the host (no trailing slash) used to serve files
 * publicly, e.g. https://pub-xxxx.r2.dev or https://media.wareongo.com.
 */

import 'dotenv/config';
import sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import prisma from '../models/prismaClient.js';

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
  WEBP_MAX_WIDTH = '1280',
  WEBP_QUALITY = '75',
} = process.env;

for (const [k, v] of Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
})) {
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const ONLY_ID = args.warehouse ? parseInt(args.warehouse, 10) : null;
const START_ID = args['start-id'] ? parseInt(args['start-id'], 10) : 0;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 4;
const DRY_RUN = !!args['dry-run'];
const FORCE = !!args.force;
const MAX_WIDTH = parseInt(WEBP_MAX_WIDTH, 10);
const QUALITY = parseInt(WEBP_QUALITY, 10);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const PUBLIC_BASE = R2_PUBLIC_URL.replace(/\/+$/, '');

function parsePhotos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
}

/**
 * Derive the WebP object key from a source URL. We strip the host and any
 * query string, then prepend `webp/` and swap the extension to `.webp`.
 * Example: https://pub-xxx.r2.dev/warehouses/123/img.jpg -> webp/warehouses/123/img.webp
 */
function webpKeyFor(sourceUrl) {
  let path;
  try {
    path = new URL(sourceUrl).pathname.replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!path) return null;
  const noExt = path.replace(/\.[a-zA-Z0-9]+$/, '');
  return `webp/${noExt}.webp`;
}

function publicUrlFor(key) {
  return `${PUBLIC_BASE}/${key}`;
}

async function existsInBucket(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return false;
    }
    throw err;
  }
}

async function compressAndUpload(sourceUrl) {
  const key = webpKeyFor(sourceUrl);
  if (!key) {
    return { sourceUrl, ok: false, reason: 'unparseable URL' };
  }
  const publicUrl = publicUrlFor(key);

  if (!FORCE && (await existsInBucket(key))) {
    return { sourceUrl, key, publicUrl, ok: true, skipped: true };
  }

  if (DRY_RUN) {
    return { sourceUrl, key, publicUrl, ok: true, dryRun: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(sourceUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    return { sourceUrl, ok: false, reason: `download ${err.name === 'AbortError' ? 'timeout' : err.message}` };
  }
  clearTimeout(timer);
  if (!res.ok) {
    return { sourceUrl, ok: false, reason: `download ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const webp = await sharp(buf)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: webp,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return { sourceUrl, key, publicUrl, ok: true, bytes: webp.length };
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function processWarehouse(w) {
  const photos = parsePhotos(w.photos);
  if (photos.length === 0) {
    return { id: w.id, status: 'no-photos' };
  }

  const existing = parsePhotos(w.photosWebp);
  // If parallel array already covers every index, skip unless --force.
  if (!FORCE && existing.length === photos.length && existing.every(Boolean)) {
    return { id: w.id, status: 'already-done', count: existing.length };
  }

  const results = await mapWithConcurrency(photos, CONCURRENCY, async (url, idx) => {
    if (!FORCE && existing[idx]) return { sourceUrl: url, publicUrl: existing[idx], ok: true, reused: true };
    try {
      return await compressAndUpload(url);
    } catch (err) {
      return { sourceUrl: url, ok: false, reason: err.message };
    }
  });

  const webpUrls = results.map(r => (r.ok ? r.publicUrl : null));
  const okCount = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok);

  if (!DRY_RUN) {
    await prisma.warehouse.update({
      where: { id: w.id },
      data: { photosWebp: JSON.stringify(webpUrls) },
    });
  }

  return {
    id: w.id,
    status: failures.length ? 'partial' : 'ok',
    ok: okCount,
    failed: failures.length,
    failures: failures.map(f => ({ url: f.sourceUrl, reason: f.reason })),
  };
}

async function main() {
  if (ONLY_ID) {
    const w = await prisma.warehouse.findUnique({
      where: { id: ONLY_ID },
      select: { id: true, photos: true, photosWebp: true },
    });
    if (!w) {
      console.error(`Warehouse ${ONLY_ID} not found`);
      await prisma.$disconnect();
      return;
    }
    const result = await processWarehouse(w);
    console.log(JSON.stringify(result));
    await prisma.$disconnect();
    return;
  }

  const where = { photos: { not: null } };
  const totalCount = await prisma.warehouse.count({ where });
  console.log(`Found ${totalCount} candidate warehouses`);

  const pageSize = 50;
  let processed = 0;
  let lastId = START_ID;

  while (true) {
    const batch = await prisma.warehouse.findMany({
      where: { ...where, id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true, photos: true, photosWebp: true },
    });
    if (batch.length === 0) break;

    for (const w of batch) {
      const result = await processWarehouse(w);
      console.log(JSON.stringify(result));
      processed++;
      if (LIMIT && processed >= LIMIT) {
        console.log(`Hit --limit=${LIMIT}, stopping.`);
        await prisma.$disconnect();
        return;
      }
    }
    lastId = batch[batch.length - 1].id;
  }

  await prisma.$disconnect();
  console.log(`Done. Processed ${processed} warehouses.`);
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
