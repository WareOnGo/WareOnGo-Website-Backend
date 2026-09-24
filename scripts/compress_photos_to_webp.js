import { compressWebpPipeline, webpPipelineRepository } from '../services/webpPipeline.js';
import warehouses from '../services/warehouseService.js';
/**
 * Manual entry point for the same compression service the nightly CMS trigger
 * runs. Supported flags: --warehouse=ID --limit=N --dry-run. Both entry points
 * use the shared image table and cover hidden stock too. Retry states govern
 * progress; force/start-id/parallel native decoding overrides are rejected.
 * No automatic CLI side effects occur when this module is imported.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import prisma from '../models/prismaClient.js';
import { compressionConfig, createPhotoStore } from '../services/webpCompression.js';

export function parseArgs(args) {
  const options = { concurrency: 1, startId: 0, visibleOnly: false };
  const numeric = { warehouse: 'warehouseId', limit: 'limit', 'start-id': 'startId', concurrency: 'concurrency' };
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else {
      const match = /^--(warehouse|limit|start-id|concurrency)=(\d+)$/.exec(arg);
      if (!match) throw new Error('Invalid flag. Use --warehouse=ID, --limit=N, --start-id=ID, --concurrency=1..4, --force or --dry-run.');
      const value = Number(match[2]);
      if (!Number.isSafeInteger(value) || value < (match[1] === 'start-id' ? 0 : 1) || (match[1] === 'concurrency' && value > 4)) {
        throw new Error('Invalid numeric flag value.');
      }
      options[numeric[match[1]]] = value;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.force || options.startId || options.concurrency !== 1) {
    throw new Error('Table-driven WebP jobs use per-image retry state and serial decoding; omit force/start-id/concurrency overrides.');
  }
  const result = await compressWebpPipeline({ ...options,
    repository: webpPipelineRepository(prisma), store: createPhotoStore(compressionConfig()),
    clearCache: () => warehouses.clearWarehouseCache(),
    signal: AbortSignal.timeout(45 * 60_000),
    onProgress: async progress => { console.log(JSON.stringify(progress)); },
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('WebP compression stopped. Completed rows are saved; check configuration and retry unfinished photos.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
