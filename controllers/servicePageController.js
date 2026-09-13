import prisma from '../models/prismaClient.js';

export const SERVICE_SLUGS = ['warehouse-search', 'build-to-suit', 'lease-negotiation', 'compliance-procurement'];
const written = value => typeof value === 'string' && value.trim().length > 0;

// A title, image or empty block is not a written service page. This also
// protects builds from incomplete content inserted outside the CMS.
export function hasServiceWriting(content) {
  return Array.isArray(content?.blocks) && content.blocks.some(b =>
    b?.kind === 'p' ? written(b.text)
      : b?.kind === 'ul' || b?.kind === 'ol' ? Array.isArray(b.items) && b.items.some(written)
        : b?.kind === 'table' ? Array.isArray(b.table?.rows) && b.table.rows.some(row => Array.isArray(row) && row.some(written)) : false,
  );
}

const toPublic = ({ slug, publishedContent: p }) => ({
  slug, title: p.title, seoTitle: p.seoTitle, description: p.description,
  summary: p.summary, keywords: p.keywords, blocks: p.blocks, faqs: p.faqs,
});
const eligible = row => SERVICE_SLUGS.includes(row.slug) && row.publishedContent?.slug === row.slug && hasServiceWriting(row.publishedContent);

export async function getServicePages(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const rows = await prisma.servicePage.findMany({
      where: { slug: { in: SERVICE_SLUGS } },
      select: { slug: true, publishedContent: true },
    });
    return res.status(200).json({ data: rows.filter(eligible)
      .sort((a, b) => SERVICE_SLUGS.indexOf(a.slug) - SERVICE_SLUGS.indexOf(b.slug)).map(toPublic) });
  } catch {
    console.error('[services] could not fetch published pages');
    return res.status(500).json({ error: 'Could not load service pages.' });
  }
}

export async function getServicePage(req, res) {
  res.set('Cache-Control', 'no-store');
  const slug = req.params.slug;
  if (!SERVICE_SLUGS.includes(slug)) return res.status(404).json({ error: 'Service page not found.' });
  try {
    const row = await prisma.servicePage.findUnique({ where: { slug }, select: { slug: true, publishedContent: true } });
    if (!row || !eligible(row)) return res.status(404).json({ error: 'Service page not found.' });
    return res.status(200).json({ data: toPublic(row) });
  } catch {
    console.error('[services] could not fetch published page');
    return res.status(500).json({ error: 'Could not load this service page.' });
  }
}
