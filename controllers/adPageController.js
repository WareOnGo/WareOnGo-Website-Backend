import prisma from '../models/prismaClient.js';
import { parseAdPages } from '../services/adPageContent.js';

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
