import prisma from '../models/prismaClient.js';

/**
 * CMS-authored editorial content for city and state overview pages.
 *
 * Shaped to match the website's `LocationPageContent` interface exactly
 * (wareongo-website src/data/locationPages.ts), so the renderer needs no
 * translation layer and the build-time generator can emit the rows verbatim.
 * The same contract micromarketController serves, one and two levels up — and
 * the same reason optional slots are omitted rather than nulled: the
 * generator drops undefined keys, which keeps the emitted module clean and an
 * unset heading indistinguishable from an absent one.
 */
const orUndefined = (v) => (v === null || v === '' ? undefined : v);

/** True when any leaf of the overrides object holds a value. */
const anyOverrideSet = (o) => {
  if (!o || typeof o !== 'object') return false;
  return Object.values(o).some((v) =>
    v !== null && typeof v === 'object' ? Object.values(v).some((n) => n !== null) : v !== null,
  );
};

const toApiShape = (p) => ({
  kind: p.kind,
  slug: p.slug,
  seoTitle: p.seoTitle,
  metaDescription: p.metaDescription,
  h1: p.h1,
  heroEyebrow: orUndefined(p.heroEyebrow),
  heroProse: p.heroProse,
  heroImage: p.heroImage ?? undefined,
  marketHeading: orUndefined(p.marketHeading),
  marketProse: orUndefined(p.marketProse),
  marketImage: p.marketImage ?? undefined,
  rentsHeading: orUndefined(p.rentsHeading),
  rentsProse: orUndefined(p.rentsProse),
  specHeading: orUndefined(p.specHeading),
  specProse: orUndefined(p.specProse),
  inventoryHeading: orUndefined(p.inventoryHeading),
  faqs: p.faqs,
  relatedBlogs: p.relatedBlogs,
  statOverrides: anyOverrideSet(p.statOverrides) ? p.statOverrides : undefined,
});

// Read at build time by the website's scripts/generate-location-pages.mjs. Only
// PUBLISHED rows are exposed; drafts cannot produce public overview pages.
export async function getLocationPages(req, res) {
  try {
    const pages = await prisma.locationPage.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ kind: 'asc' }, { slug: 'asc' }],
    });
    res.status(200).json({ data: pages.map(toApiShape) });
  } catch (error) {
    console.error('Error fetching location pages:', error);
    res.status(500).json({ error: 'An error occurred while fetching location pages.' });
  }
}

export async function getLocationPage(req, res) {
  try {
    const kind = String(req.params.kind ?? '').toUpperCase();
    if (kind !== 'CITY' && kind !== 'STATE') {
      return res.status(400).json({ error: "kind must be 'city' or 'state'." });
    }
    const page = await prisma.locationPage.findFirst({
      where: { kind, slug: req.params.slug, status: 'PUBLISHED' },
    });
    if (!page) return res.status(404).json({ error: 'Location page not found.' });
    res.status(200).json({ data: toApiShape(page) });
  } catch (error) {
    console.error('Error fetching location page:', error);
    res.status(500).json({ error: 'An error occurred while fetching the location page.' });
  }
}
