// Local-only workload replay. A manifest is an array of {path} records pointing
// to downloaded fixture images. No .env, database or R2 connection is used.
// node tests/webp/memory-replay.mjs /tmp/fixtures/manifest.json
import { readFile } from 'node:fs/promises';
import { createPhotoStore } from '../../services/webpCompression.js';
import { convertImageFile, imageMemoryUsage } from '../../services/webpImageProcess.js';

const files = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!files.length) throw new Error('No fixture images');
const MIB = 1048576;
const config = { account: 'fixture', accessKey: 'fixture', secret: 'fixture', bucket: 'fixture',
  publicBase: 'https://fixture.example', width: 1280, quality: 75 };
const started = Date.now();
const baseline = process.memoryUsage().rss;
let parentPeak = baseline;
let workerPeak = 0;
let combinedPeak = baseline;
let converted = 0;
const sampleMemory = async pid => {
  const memory = await imageMemoryUsage(pid);
  const parent = process.memoryUsage().rss;
  parentPeak = Math.max(parentPeak, parent);
  workerPeak = Math.max(workerPeak, memory.childRss);
  combinedPeak = Math.max(combinedPeak, parent + memory.childRss);
  // The test is explicitly against 512 MiB, even on a larger host.
  return { ...memory, used: parent + memory.childRss, limit: 512 * MIB };
};
const store = createPhotoStore(config, {
  client: { send: async () => ({}) },
  fetchPhoto: async source => new Response(await readFile(source)),
  convertFile: async (...args) => {
    const result = await convertImageFile(...args, { sampleMemory });
    workerPeak = Math.max(workerPeak, result.peakRssMiB * MIB);
    return result;
  },
});
const timer = setInterval(() => { parentPeak = Math.max(parentPeak, process.memoryUsage().rss); }, 10);
try {
  for (let repeat = 0; repeat < 8; repeat++) {
    for (const file of files) {
      await store.upload(file.path, { key: 'fixture.webp' }, new AbortController().signal);
      converted++;
    }
    console.log(JSON.stringify({ pass: repeat + 1, converted, parentRssMiB: +(process.memoryUsage().rss / MIB).toFixed(1),
      sampledCombinedPeakMiB: +(combinedPeak / MIB).toFixed(1) }));
  }
} finally {
  clearInterval(timer);
  console.log(JSON.stringify({ mode: 'one_short_lived_decoder', converted, baselineMiB: +(baseline / MIB).toFixed(1),
    parentPeakMiB: +(parentPeak / MIB).toFixed(1), workerPeakMiB: +(workerPeak / MIB).toFixed(1),
    sampledCombinedPeakMiB: +(combinedPeak / MIB).toFixed(1),
    conservativeCombinedPeakMiB: +((parentPeak + workerPeak) / MIB).toFixed(1), elapsedMs: Date.now() - started }));
}
