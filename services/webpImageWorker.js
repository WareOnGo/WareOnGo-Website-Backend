// One image per process: exiting releases native allocations and allocator
// fragmentation that JavaScript GC cannot reclaim in the long-lived API.
import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(1);

const [input, output, rawWidth, rawQuality] = process.argv.slice(2);
try {
  const width = Number(rawWidth);
  const quality = Number(rawQuality);
  if (!input || !output || !Number.isInteger(width) || width < 320 || width > 2560
    || !Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('invalid_options');
  const result = await sharp(input, { limitInputPixels: 16_000_000, sequentialRead: true })
    .timeout({ seconds: 15 }).rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality }).toFile(output);
  console.log(JSON.stringify({ ok: true, bytes: result.size, peakRssMiB: Math.ceil(process.resourceUsage().maxRSS / 1024) }));
} catch (error) {
  const reason = /pixel limit/i.test(error?.message ?? '') ? 'source_too_many_pixels' : 'source_conversion_failed';
  console.log(JSON.stringify({ ok: false, reason }));
  process.exitCode = 1;
}
