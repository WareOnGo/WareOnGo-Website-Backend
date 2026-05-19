/**
 * Reports total bytes for originals vs WebP variants in the R2 bucket.
 *
 * Approach: list every object once, partition by `webp/` prefix, then pair
 * each webp object to its source by stripping `webp/` and `.webp` and
 * finding any sibling key with the same stem. Only paired originals are
 * counted, so videos/PDFs (which have no WebP) don't skew the ratio.
 */

import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const fmtBytes = b => {
  const gb = b / 1024 ** 3;
  const mb = b / 1024 ** 2;
  return gb >= 1 ? `${gb.toFixed(3)} GB` : `${mb.toFixed(1)} MB`;
};

async function listAll() {
  const out = new Map(); // key -> size
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      ContinuationToken: token,
    }));
    for (const o of res.Contents || []) {
      out.set(o.Key, o.Size);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    process.stdout.write(`\rlisted ${out.size} objects...`);
  } while (token);
  process.stdout.write('\n');
  return out;
}

function main() {
  return listAll().then(map => {
    // Index originals by stem (path without extension) for fast lookup.
    const stemIndex = new Map(); // stem -> { key, size }
    for (const [key, size] of map) {
      if (key.startsWith('webp/')) continue;
      const stem = key.replace(/\.[a-zA-Z0-9]+$/, '');
      stemIndex.set(stem, { key, size });
    }

    let originalBytes = 0;
    let webpBytes = 0;
    let paired = 0;
    let webpOrphans = 0;

    for (const [key, size] of map) {
      if (!key.startsWith('webp/')) continue;
      const stem = key.slice('webp/'.length).replace(/\.webp$/, '');
      const orig = stemIndex.get(stem);
      if (orig) {
        originalBytes += orig.size;
        webpBytes += size;
        paired++;
      } else {
        webpOrphans++;
      }
    }

    const saved = originalBytes - webpBytes;
    const pct = originalBytes ? (saved / originalBytes) * 100 : 0;

    console.log(`\nPaired pairs:        ${paired}`);
    if (webpOrphans) console.log(`WebP orphans:        ${webpOrphans} (source missing — likely deleted)`);
    console.log(`Originals total:     ${fmtBytes(originalBytes)}  (${originalBytes.toLocaleString()} bytes)`);
    console.log(`WebP total:          ${fmtBytes(webpBytes)}  (${webpBytes.toLocaleString()} bytes)`);
    console.log(`Saved:               ${fmtBytes(saved)}  (${saved.toLocaleString()} bytes)`);
    console.log(`Reduction:           ${pct.toFixed(2)}%`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
