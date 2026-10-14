import prisma from '../models/prismaClient.js';
import { parseAdPages } from '../services/adPageContent.js';
import { parseMicromarketAdPages } from '../services/micromarketAdContent.js';
import { Prisma } from '@prisma/client';

export async function getMicromarketAdPages(_req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const rows = await prisma.micromarketAdPage.findMany({
      where: { publishedContent: { not: Prisma.AnyNull } },
      select: { citySlug: true, slug: true, name: true, publishedContent: true },
      orderBy: [{ citySlug: 'asc' }, { slug: 'asc' }],
    });
    if (rows.some(row => row.citySlug !== row.publishedContent?.citySlug || row.slug !== row.publishedContent?.slug || row.name !== row.publishedContent?.name)) {
      throw new Error('Micromarket ad page identity mismatch.');
    }
    return res.status(200).json({ data: parseMicromarketAdPages(rows.map(row => row.publishedContent)) });
  } catch {
    console.error('[micromarket-ad-pages] could not load approved content');
    return res.status(500).json({ error: 'Could not load micromarket ad pages.' });
  }
}

export async function getAdPages(_req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const rows = await prisma.adPage.findMany({ where: { slug: 'bangalore' }, select: { slug: true, publishedContent: true } });
    if (rows.some(row => row.slug !== row.publishedContent?.slug)) throw new Error('Ad page URL mismatch.');
    return res.status(200).json({ data: parseAdPages(rows.map(row => row.publishedContent)) });
  } catch {
    console.error('[ad-pages] could not load approved content');
    return res.status(500).json({ error: 'Could not load ad pages.' });
  }
}
