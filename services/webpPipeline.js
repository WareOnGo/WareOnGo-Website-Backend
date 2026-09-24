import { createHash } from 'node:crypto';
import pipeline from './imagePipelineRepository.cjs';
import contract from './imageContract.cjs';
import { photoTarget, photoSlots } from './webpCompression.js';

const { ImagePipelineRepository } = pipeline;
const { imageUrls } = contract;

export function webpPipelineRepository(prisma) {
  const repository = new ImagePipelineRepository(prisma);
  repository.inventoryRows = () => prisma.$queryRawUnsafe(`SELECT id, "imageUrl", "webpObjectKey", "webpStatus", "webpCheckedAt"
    FROM labeled_warehouse_images`);
  repository.markMissing = rows => rows.length ? prisma.$executeRawUnsafe(`UPDATE labeled_warehouse_images l
    SET "webpStatus" = 'PENDING', "webpAttempts" = 0, "webpNextAttemptAt" = NULL,
      "webpError" = 'Previously stored WebP object is missing', "webpCheckedAt" = now()
    FROM jsonb_to_recordset($1::jsonb) AS r(id int, "webpObjectKey" text, "webpCheckedAt" timestamptz)
    WHERE l.id = r.id AND l."webpStatus" = 'READY' AND l."webpObjectKey" IS NOT DISTINCT FROM r."webpObjectKey"
      AND l."webpCheckedAt" IS NOT DISTINCT FROM r."webpCheckedAt"`, JSON.stringify(rows)) : 0;
  repository.projectLegacy = async () => {
    let after = 0, updated = 0;
    while (true) {
      const rows = await prisma.warehouse.findMany({ where: { id: { gt: after } }, take: 100, orderBy: { id: 'asc' },
        select: { id: true, media: true, photos: true, photosWebp: true } });
      if (!rows.length) break;
      const images = await repository.readImages(rows);
      for (const row of rows) {
        const byUrl = new Map(images.get(row.id).map(image => [image.originalUrl, image.webpUrl]));
        const active = new Set(imageUrls(row));
        const value = JSON.stringify(photoSlots(row.photos).map(url => active.has(url) ? byUrl.get(url) ?? null : null));
        if (value === row.photosWebp) continue;
        updated += await prisma.$executeRawUnsafe(`UPDATE "Warehouse" SET "photosWebp" = $2
          WHERE id = $1 AND photos IS NOT DISTINCT FROM $3 AND "photosWebp" IS NOT DISTINCT FROM $4
            AND COALESCE(media::jsonb, 'null'::jsonb) IS NOT DISTINCT FROM $5::jsonb`, row.id, value, row.photos, row.photosWebp, JSON.stringify(row.media));
      }
      after = rows.at(-1).id;
    }
    return updated;
  };
  return repository;
}

// Hashed keys avoid legacy jpg/png stem collisions and never overwrite a known
// successful object. A completed upload can be reused after a process restart.
export function versionedTarget(row, store) {
  const hash = createHash('sha256').update(row.imageUrl).digest('hex');
  const key = `webp/images/${hash}/${store.version}.webp`;
  return { key, url: `${store.publicBase}/${key}` };
}

export async function compressOne(row, { repository, store, existing, collisions, signal, onProgress }) {
  const legacy = photoTarget(row.imageUrl, store.publicBase);
  if (!legacy) {
    await repository.fail('webp', row, 'Source URL or image format is unsupported', { unsupported: true });
    return { skipped: 1 };
  }
  const generated = versionedTarget(row, store);
  // Retrying unknown imported settings does not force a recompression.
  const reusableKey = [row.webpObjectKey, generated.key, !collisions.has(legacy.key) && legacy.key]
    .find(key => key && existing.has(key));
  let target = generated, metadata, reused = false;
  if (reusableKey) {
    target = { key: reusableKey, url: `${store.publicBase}/${reusableKey.split('/').map(encodeURIComponent).join('/')}` };
    metadata = await store.objectMetadata(target.key, signal);
    reused = !!metadata;
  }
  if (!metadata) {
    target = generated;
    const bytes = await store.upload(row.imageUrl, target, signal, (phase, details) => onProgress({ phase, ...details }));
    metadata = { bytes, modifiedAt: new Date() };
    existing.add(target.key);
  }
  const saved = await repository.complete('webp', row, {
    storageBucket: store.bucket,
    originalObjectKey: decodeURIComponent(new URL(row.imageUrl).pathname).replace(/^\/+/, ''),
    webpUrl: target.url, webpObjectKey: target.key, webpBytes: metadata.bytes,
    webpAt: metadata.modifiedAt, webpVersion: reused && target.key !== generated.key ? row.webpVersion ?? null : store.version,
  });
  return { updated: saved, stale: saved ? 0 : 1, reused: reused ? 1 : 0, uploaded: reused ? 0 : 1, bytes: reused ? 0 : metadata.bytes };
}

export async function compressWebpPipeline({ repository, store, signal = new AbortController().signal,
  limit = 500, warehouseId = null, dryRun = false, onProgress = async () => {}, clearCache = async () => {} }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('webp_invalid_run_options');
  const summary = { cursor: 0, cursorKind: 'image-table-v1', scanned: 0, updated: 0, uploaded: 0,
    reused: 0, skipped: 0, failed: 0, stale: 0, bytes: 0, complete: false, errors: [] };
  if (dryRun) return { ...summary, dryRun: true, backlog: await repository.backlog('webp') };
  signal.throwIfAborted();
  await repository.reconcile();
  // Complete inventory before declaring a stored object missing.
  const inventoryStartedAt = new Date();
  const existing = await store.existingKeys(signal);
  const rows = await repository.inventoryRows();
  const owners = new Map(), collisions = new Set();
  for (const row of rows) {
    const target = photoTarget(row.imageUrl, store.publicBase);
    if (target) {
      if (owners.has(target.key) && owners.get(target.key) !== row.imageUrl) collisions.add(target.key);
      owners.set(target.key, row.imageUrl);
    }
  }
  await repository.markMissing(rows.filter(row => row.webpStatus === 'READY' && !existing.has(row.webpObjectKey)
    && (!row.webpCheckedAt || row.webpCheckedAt <= inventoryStartedAt)));
  try {
    while (summary.scanned < limit) {
      signal.throwIfAborted();
      // Native decodes stay serial. Claim only the next image, not hours of work.
      const [row] = await repository.claim('webp', { limit: 1, warehouseId });
      if (!row) { summary.complete = true; break; }
      summary.scanned++;
      try {
        const result = await compressOne(row, { repository, store, existing, collisions, signal,
          onProgress: progress => onProgress({ ...summary, activeImageId: row.id, ...progress }) });
        for (const [key, count] of Object.entries(result)) summary[key] += count;
      } catch (error) {
        const interrupted = signal.aborted || error?.code === 'WEBP_MEMORY_PRESSURE';
        await repository.fail('webp', row, 'Image conversion or storage failed', { deferred: interrupted });
        if (interrupted) throw error;
        summary.failed++;
        if (summary.errors.length < 5) summary.errors.push({ imageId: row.id, reason: 'conversion_or_storage_failed' });
      }
      await onProgress({ ...summary });
    }
  } finally {
    // Repairs prior projection failures even when no compression remains.
    // Projection failure must still invalidate caches for committed image rows.
    try { summary.projected = await repository.projectLegacy(); }
    catch { summary.warning = 'Legacy image projection deferred to the next run'; }
    if (summary.updated || summary.projected) {
      try { await clearCache(); }
      catch { summary.warning = 'Image cache refresh deferred to TTL'; }
    }
  }
  summary.backlog = await repository.backlog('webp');
  await onProgress({ ...summary });
  return summary;
}
