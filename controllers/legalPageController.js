import prisma from '../models/prismaClient.js';

export const LEGAL_SLUGS = ['privacy-policy', 'terms-of-service'];

// Select the approved revision only: neither drafts nor deploy bookkeeping
// belong in a public response. No Redis cache; these two rows are build inputs.
export async function getLegalPages(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const rows = await prisma.legalPage.findMany({
      where: { slug: { in: LEGAL_SLUGS } },
      select: { slug: true, publishedContent: true },
      orderBy: { slug: 'asc' },
    });
    // Missing seed data must stop a build, never remove a legal page or revive
    // an obsolete policy from a frontend fallback.
    if (rows.length !== LEGAL_SLUGS.length) {
      return res.status(503).json({ error: 'Legal pages have not been initialized.' });
    }
    return res.status(200).json({ data: rows.map(({ slug, publishedContent: p }) => ({
      slug, title: p.title, seoTitle: p.seoTitle, description: p.description,
      effectiveDate: p.effectiveDate, updated: p.updated, blocks: p.blocks, notice: p.notice,
    })) });
  } catch (error) {
    console.error('Error fetching legal pages:', error);
    return res.status(500).json({ error: 'An error occurred while fetching legal pages.' });
  }
}
