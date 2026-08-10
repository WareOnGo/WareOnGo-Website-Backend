// One-time port of the hardcoded guides in the website repo
// (src/data/guides.ts) into the Guide table, which is the source of truth from
// here on. Kept in the repo so the migration is auditable and re-runnable.
//
// Idempotent: upserts on slug, so re-running syncs rather than duplicating.
//
// Usage:
//   node scripts/seed-guides.mjs --file /path/to/guides.json
//
// Produce guides.json from the website repo with:
//   node -e "const e=require('esbuild'),f=require('fs');f.writeFileSync('/tmp/g.mjs',
//     e.transformSync(f.readFileSync('src/data/guides.ts','utf8'),{loader:'ts'}).code)"
//   node --input-type=module -e "import {guides} from '/tmp/g.mjs';
//     import fs from 'node:fs';fs.writeFileSync('/tmp/guides.json',JSON.stringify(guides))"

import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fileArg = process.argv.indexOf('--file');
if (fileArg === -1 || !process.argv[fileArg + 1]) {
  console.error('usage: node scripts/seed-guides.mjs --file <guides.json>');
  process.exit(1);
}

// Dates arrive as plain 'YYYY-MM-DD'. `new Date()` on that form parses as UTC
// midnight, which is what a Postgres DATE round-trips back to — so
// toISOString().slice(0,10) in the generator returns the exact input string.
// Anything with a time component would risk a day-shift on read.
const asDate = (s) => {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`expected YYYY-MM-DD, got "${s}"`);
  return new Date(`${s}T00:00:00.000Z`);
};

async function main() {
  const guides = JSON.parse(fs.readFileSync(process.argv[fileArg + 1], 'utf8'));
  if (!Array.isArray(guides) || guides.length === 0) throw new Error('no guides in file');

  for (const [i, g] of guides.entries()) {
    // Array order in the TS file drove the /guides ItemList JSON-LD positions,
    // so it has to survive the move to a table.
    const row = {
      slug: g.slug,
      title: g.title,
      seoTitle: g.seoTitle,
      description: g.description,
      summary: g.summary,
      keywords: g.keywords ?? [],
      blocks: g.blocks,
      faqs: g.faqs,
      related: g.related ?? [],
      datePublished: asDate(g.published),
      dateModified: asDate(g.updated),
      sortOrder: i,
      status: 'PUBLISHED',
    };
    await prisma.guide.upsert({ where: { slug: g.slug }, create: row, update: row });
    console.log(`  upserted ${g.slug} (sortOrder=${i}, ${g.blocks.length} blocks, ${g.faqs.length} faqs)`);
  }

  const total = await prisma.guide.count();
  console.log(`[seed-guides] ${guides.length} guides seeded; table now holds ${total}`);
}

main()
  .catch((err) => {
    console.error('[seed-guides] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
