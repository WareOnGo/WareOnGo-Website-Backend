import prisma from '../models/prismaClient.js';

// Postgres DATE columns come back as UTC-midnight Date objects, so slicing the
// ISO string returns the calendar date that was stored — no timezone shift.
// These feed Article.datePublished / dateModified, which must stay stable
// across builds or Google sees the content change date every deploy.
const asIsoDate = (d) => (d ? d.toISOString().slice(0, 10) : undefined);

// Shaped to match the public site's `Blog` interface exactly, so the renderer
// and its Article/FAQPage JSON-LD are unchanged by the move to the DB.
const toApiShape = (g) => ({
  slug: g.slug,
  title: g.title,
  seoTitle: g.seoTitle,
  description: g.description,
  summary: g.summary,
  // Omitted rather than sent as null when unset, like `published` — the
  // website's generator drops undefined keys, so the emitted module stays clean.
  author: g.author ?? undefined,
  published: asIsoDate(g.datePublished),
  updated: asIsoDate(g.dateModified),
  keywords: g.keywords,
  blocks: g.blocks,
  faqs: g.faqs,
  related: g.related,
});

// Read at build time by the website's scripts/generate-blogs.mjs. Only
// PUBLISHED rows are exposed — drafts must never reach the static site.
// sortOrder drives the /blogs ItemList JSON-LD positions.
export async function getBlogs(req, res) {
  try {
    const blogs = await prisma.blog.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.status(200).json({ data: blogs.map(toApiShape) });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ error: 'An error occurred while fetching blogs.' });
  }
}

export async function getBlogBySlug(req, res) {
  try {
    const blog = await prisma.blog.findFirst({
      where: { slug: req.params.slug, status: 'PUBLISHED' },
    });
    if (!blog) return res.status(404).json({ error: 'Blog not found.' });
    res.status(200).json({ data: toApiShape(blog) });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ error: 'An error occurred while fetching the blog.' });
  }
}
