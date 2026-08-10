import prisma from '../models/prismaClient.js';

// Postgres DATE columns come back as UTC-midnight Date objects, so slicing the
// ISO string returns the calendar date that was stored — no timezone shift.
// These feed Article.datePublished / dateModified, which must stay stable
// across builds or Google sees the content change date every deploy.
const asIsoDate = (d) => (d ? d.toISOString().slice(0, 10) : undefined);

// Shaped to match the public site's `Guide` interface exactly, so the renderer
// and its Article/FAQPage JSON-LD are unchanged by the move to the DB.
const toApiShape = (g) => ({
  slug: g.slug,
  title: g.title,
  seoTitle: g.seoTitle,
  description: g.description,
  summary: g.summary,
  published: asIsoDate(g.datePublished),
  updated: asIsoDate(g.dateModified),
  keywords: g.keywords,
  blocks: g.blocks,
  faqs: g.faqs,
  related: g.related,
});

// Read at build time by the website's scripts/generate-guides.mjs. Only
// PUBLISHED rows are exposed — drafts must never reach the static site.
// sortOrder drives the /guides ItemList JSON-LD positions.
export async function getGuides(req, res) {
  try {
    const guides = await prisma.guide.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.status(200).json({ data: guides.map(toApiShape) });
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({ error: 'An error occurred while fetching guides.' });
  }
}

export async function getGuideBySlug(req, res) {
  try {
    const guide = await prisma.guide.findFirst({
      where: { slug: req.params.slug, status: 'PUBLISHED' },
    });
    if (!guide) return res.status(404).json({ error: 'Guide not found.' });
    res.status(200).json({ data: toApiShape(guide) });
  } catch (error) {
    console.error('Error fetching guide:', error);
    res.status(500).json({ error: 'An error occurred while fetching the guide.' });
  }
}
