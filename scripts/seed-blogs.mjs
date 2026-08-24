// One-time port of the hardcoded blogs in the website repo
// (src/data/blogs.ts) into the Blog table, which is the source of truth from
// here on. Kept in the repo so the migration is auditable and re-runnable.
//
// Idempotent: upserts on slug, so re-running syncs rather than duplicating.
//
// Usage:
//   node scripts/seed-blogs.mjs --file /path/to/blogs.json
//
// Produce blogs.json from the website repo with:
//   node -e "const e=require('esbuild'),f=require('fs');f.writeFileSync('/tmp/g.mjs',
//     e.transformSync(f.readFileSync('src/data/blogs.ts','utf8'),{loader:'ts'}).code)"
//   node --input-type=module -e "import {blogs} from '/tmp/g.mjs';
//     import fs from 'node:fs';fs.writeFileSync('/tmp/blogs.json',JSON.stringify(blogs))"

import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fileArg = process.argv.indexOf('--file');
if (fileArg === -1 || !process.argv[fileArg + 1]) {
  console.error('usage: node scripts/seed-blogs.mjs --file <blogs.json>');
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
  const blogs = JSON.parse(fs.readFileSync(process.argv[fileArg + 1], 'utf8'));
  if (!Array.isArray(blogs) || blogs.length === 0) throw new Error('no blogs in file');

  for (const [i, g] of blogs.entries()) {
    // Array order in the TS file drove the /blogs ItemList JSON-LD positions,
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
    await prisma.blog.upsert({ where: { slug: g.slug }, create: row, update: row });
    console.log(`  upserted ${g.slug} (sortOrder=${i}, ${g.blocks.length} blocks, ${g.faqs.length} faqs)`);
  }

  const total = await prisma.blog.count();
  console.log(`[seed-blogs] ${blogs.length} blogs seeded; table now holds ${total}`);
}

main()
  .catch((err) => {
    console.error('[seed-blogs] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
