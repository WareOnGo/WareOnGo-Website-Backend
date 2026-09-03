import prisma from '../models/prismaClient.js';

// Shaped to match the public site's `MicromarketContent` interface exactly
// (wareongo-website src/data/micromarkets.ts), so the renderer needs no
// translation layer and the build-time generator can emit the rows verbatim.
//
// Optional slots are omitted rather than sent as null: the website's generator
// drops undefined keys, which keeps the emitted TS module clean and keeps an
// unset heading indistinguishable from an absent one.
const orUndefined = (v) => (v === null || v === '' ? undefined : v);

/** True when any leaf of the overrides object holds a number. */
const anyOverrideSet = (o) => {
  if (!o || typeof o !== 'object') return false;
  return Object.values(o).some((v) =>
    v !== null && typeof v === 'object' ? Object.values(v).some((n) => n !== null) : v !== null,
  );
};

const toApiShape = (m) => ({
  citySlug: m.citySlug,
  slug: m.slug,
  seoTitle: m.seoTitle,
  metaDescription: m.metaDescription,
  h1: m.h1,
  heroEyebrow: orUndefined(m.heroEyebrow),
  heroProse: m.heroProse,
  heroImage: m.heroImage ?? undefined,
  marketHeading: orUndefined(m.marketHeading),
  marketProse: orUndefined(m.marketProse),
  marketImage: m.marketImage ?? undefined,
  rentsHeading: orUndefined(m.rentsHeading),
  rentsProse: orUndefined(m.rentsProse),
  specHeading: orUndefined(m.specHeading),
  specProse: orUndefined(m.specProse),
  inventoryHeading: orUndefined(m.inventoryHeading),
  faqs: m.faqs,
  relatedBlogs: m.relatedBlogs,
  // Omitted unless something is actually set. The CMS form always posts a full
  // object, so a page with no corrections stores a shape full of nulls — sending
  // that would put a block of dead keys into the generated module for every one
  // of forty-odd pages.
  statOverrides: anyOverrideSet(m.statOverrides) ? m.statOverrides : undefined,
});

// Read at build time by the website's scripts/generate-micromarkets.mjs. Only
// PUBLISHED rows are exposed — a draft must never flip a live page from the
// plain listing grid to the editorial template.
export async function getMicromarketPages(req, res) {
  try {
    const pages = await prisma.micromarketPage.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ citySlug: 'asc' }, { slug: 'asc' }],
    });
    res.status(200).json({ data: pages.map(toApiShape) });
  } catch (error) {
    console.error('Error fetching micromarket pages:', error);
    res.status(500).json({ error: 'An error occurred while fetching micromarket pages.' });
  }
}

export async function getMicromarketPage(req, res) {
  try {
    const page = await prisma.micromarketPage.findFirst({
      where: {
        citySlug: req.params.citySlug,
        slug: req.params.slug,
        status: 'PUBLISHED',
      },
    });
    if (!page) return res.status(404).json({ error: 'Micromarket page not found.' });
    res.status(200).json({ data: toApiShape(page) });
  } catch (error) {
    console.error('Error fetching micromarket page:', error);
    res.status(500).json({ error: 'An error occurred while fetching the micromarket page.' });
  }
}
