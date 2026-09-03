import prisma from '../models/prismaClient.js';
import redisService from './redisService.js';

/**
 * The single source of truth for micromarkets: which ones exist, which earn a
 * page, and every figure derived from their inventory.
 *
 * This lived in three places before — the website's route loader, the website's
 * sitemap script, and the CMS — each with its own copy of the parsing rules for
 * free-text rates and clear heights. Three copies of a derivation is three
 * chances to show an editor one median while the site publishes another, which
 * is the worst failure available to this feature. It lives here now because the
 * database is here: everything downstream reads, nothing re-derives.
 *
 * Consumers:
 *   wareongo-website  src/loaders/locationLoader.ts   (renders the pages)
 *   wareongo-website  scripts/lib/locations.mjs       (sitemap + footer links)
 *   wareongo-cms      lib/micromarkets-api.ts         (editor screens)
 */

/** A micromarket needs this many listings before it gets a page of its own. */
export const MICROMARKET_MIN_LISTINGS = 5;

/**
 * Its parent city supplies the {city} URL segment and is the breadcrumb target,
 * so nesting under a near-empty city page helps nobody.
 */
export const PARENT_CITY_MIN_LISTINGS = 6;

const CITY_ALIASES = {
  bangalore: 'Bengaluru',
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  gurgaon: 'Gurugram',
};

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

const canonicalCity = (raw) => {
  const lower = String(raw ?? '').trim().toLowerCase();
  if (!lower) return null;
  return CITY_ALIASES[lower] ?? titleCase(lower);
};

const slugifyCity = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

/** Keeps '/' readable as a separator: "Alipur/Budhpur" -> "alipur-budhpur". */
const slugifyMicromarket = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/** The city column also holds locality fragments ("Sector 78, Badshahpur"). */
const isRealCityName = (name) => name.length > 2 && !name.includes(',');

/**
 * Some rows carry an unresolved micro_market row id (32 base62 characters) where
 * a name should be, because the tagging tool wrote the foreign key through.
 * Those are not places and must never become pages.
 */
const MICROMARKET_ID_RE = /^[A-Za-z0-9]{32}$/;
const isNamedMicromarket = (raw) => {
  const v = String(raw ?? '').trim();
  return v.length > 2 && !MICROMARKET_ID_RE.test(v);
};

// ----- derivation -----------------------------------------------------------

/** Leading number out of free text: "8", "8-10", "₹22 / sq ft", "35 ft". */
const firstNumber = (raw) => {
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/**
 * Land, open plots and build-to-suit sites. They stay in the listing count and
 * in the grid — a tenant looking for a BTS site should find it — and are out of
 * every computed figure, because they have no clear height, no docks and often
 * no rent.
 */
const isUnbuilt = (type) => /\b(land|plot|bts)\b|build[\s-]*to[\s-]*suit/i.test(type ?? '');

const CONSTRUCTION_LABELS = [
  [/peb/i, 'PEB'],
  [/rcc/i, 'RCC'],
  [/cold/i, 'Cold storage'],
  [/shed/i, 'Shed'],
];

const constructionLabel = (raw) => {
  const v = raw?.trim();
  if (!v) return null;
  for (const [re, label] of CONSTRUCTION_LABELS) if (re.test(v)) return label;
  return v;
};

/**
 * Flooring is free text with no controlled vocabulary, so this normalises the
 * spellings that recur and otherwise reports what was typed. Inventing buckets
 * would put a taxonomy on the page the data doesn't support.
 */
const flooringLabel = (raw) => {
  const v = raw?.trim().replace(/\s+/g, ' ');
  if (!v || /^(n\/?a|none|nil|not specified|-+)$/i.test(v)) return null;
  if (/vdf/i.test(v)) return 'VDF';
  if (/fm\s*-?\s*2/i.test(v)) return 'FM2';
  if (/trimix/i.test(v)) return 'Trimix';
  if (/ipc|plain cement/i.test(v)) return 'IPC';
  return v.charAt(0).toUpperCase() + v.slice(1);
};

/** Commercial change-of-land-use, recorded in the free-text compliances column. */
const hasCommercialClu = (compliances) => /\bclu\b|change of land[- ]?use/i.test(compliances ?? '');

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Published min to max with no trimming, so a wide spread reads as wide. */
const spread = (nums) =>
  nums.length === 0
    ? null
    : { min: Math.min(...nums), median: Math.round(median(nums)), max: Math.max(...nums) };

const mix = (labels, denominator, limit) => {
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: denominator > 0 ? Math.round((count / denominator) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
};

const firstSize = (sizes) => {
  const first = Array.isArray(sizes) ? sizes[0] : sizes;
  return typeof first === 'number' && first > 100 ? first : null;
};

function statsFor(rows) {
  const built = rows.filter((r) => !isUnbuilt(r.warehouseType));
  const flooring = built.map((r) => flooringLabel(r.flooringType)).filter(Boolean);

  return {
    listings: rows.length,
    measured: built.length,
    rent: spread(built.map((r) => firstNumber(r.ratePerSqft)).filter((n) => n !== null && n > 0)),
    size: spread(built.map((r) => firstSize(r.totalSpaceSqft)).filter((n) => n !== null)),
    clearHeight: spread(built.map((r) => firstNumber(r.clearHeightFt)).filter((n) => n !== null && n > 0)),
    docksMedian: (() => {
      const docks = built.map((r) => firstNumber(r.numberOfDocks)).filter((n) => n !== null && n > 0);
      return docks.length > 0 ? Math.round(median(docks)) : null;
    })(),
    construction: mix(built.map((r) => constructionLabel(r.warehouseType)).filter(Boolean), built.length, 4),
    // Flooring's denominator is the rows that record one, not the whole belt —
    // "16% VDF" would otherwise mean "16% of everything, and no idea about the
    // rest", which is not how it reads on a page.
    flooring: mix(flooring, flooring.length, 3),
    fireNoc: built.filter((r) => r.fireNocAvailable === true).length,
    commercialClu: built.filter((r) => hasCommercialClu(r.compliances)).length,
  };
}

// ----- assembly -------------------------------------------------------------

// Bump on any response-shape change, or cached entries are served against the
// new contract — which is exactly what happened when listingIds was added and
// the old payload kept coming back.
//   v1: first release
//   v2: gained listingIds
//   v3: gained peers
const CACHE_KEY = 'micromarkets:v3';
const CACHE_TTL_SECONDS = 600;

class MicromarketService {
  async getMicromarkets() {
    try {
      const cached = await redisService.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.log('[micromarkets] cache read failed, computing:', err.message);
    }

    const rows = await prisma.warehouse.findMany({
      where: { visibility: true },
      select: {
        id: true,
        city: true,
        micromarket: true,
        totalSpaceSqft: true,
        clearHeightFt: true,
        compliances: true,
        ratePerSqft: true,
        warehouseType: true,
        numberOfDocks: true,
        flooringType: true,
        warehouseData: { select: { fireNocAvailable: true } },
      },
    });

    const listings = rows.map((r) => ({ ...r, fireNocAvailable: r.warehouseData?.fireNocAvailable ?? null }));

    // Cities allowed to host a micromarket page, mapped to their page slug.
    const cityTotals = new Map();
    for (const l of listings) {
      const city = canonicalCity(l.city);
      if (city) cityTotals.set(city, (cityTotals.get(city) ?? 0) + 1);
    }
    const hostCities = new Map();
    for (const [city, total] of cityTotals) {
      if (isRealCityName(city) && total >= PARENT_CITY_MIN_LISTINGS) hostCities.set(city, slugifyCity(city));
    }

    // Group by tag. Deduped per listing, so a row tagged with the same locality
    // twice counts once.
    const groups = new Map();
    for (const l of listings) {
      const tags = [
        ...new Set(
          (Array.isArray(l.micromarket) ? l.micromarket : [])
            .map((m) => String(m).trim())
            .filter(isNamedMicromarket),
        ),
      ];
      const city = canonicalCity(l.city);
      for (const name of tags) {
        const slug = slugifyMicromarket(name);
        if (!slug) continue;
        // First spelling seen wins as the display name: the values are already
        // properly cased, and title-casing would mangle "Alipur/Budhpur".
        const entry = groups.get(slug) ?? { name, rows: [], cities: new Map() };
        entry.rows.push(l);
        if (city) entry.cities.set(city, (entry.cities.get(city) ?? 0) + 1);
        groups.set(slug, entry);
      }
    }

    const data = Array.from(groups.entries())
      .map(([slug, entry]) => {
        // Most listings wins, but only among cities that can host a page, so a
        // micromarket whose top city is a junk value still nests under its
        // next-best real one instead of losing its page.
        const parent = Array.from(entry.cities.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .find(([city]) => hostCities.has(city));
        const parentCity = parent?.[0] ?? null;
        const stats = statsFor(entry.rows);
        return {
          name: entry.name,
          slug,
          parentCity,
          citySlug: parentCity ? hostCities.get(parentCity) : null,
          /** Whether the site builds a page for this at all. */
          hasPage: stats.listings >= MICROMARKET_MIN_LISTINGS && parentCity !== null,
          /**
           * Which warehouses belong to this micromarket, so the website renders
           * its grid from this answer instead of re-matching tags to slugs. That
           * matching is the last place the two could have disagreed: two
           * spellings of one locality collapse to the same slug here, and a
           * consumer comparing names would quietly drop one of them.
           */
          listingIds: entry.rows.map((r) => r.id),
          ...stats,
        };
      })
      .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));

    /**
     * The bars of each page's nearby-market chart: the busiest siblings under the
     * same city, plus the micromarket itself, each at its own median rent.
     *
     * Computed here so the chart on a page and the number on the sibling's own
     * page cannot disagree — they are the same field read twice. Same city only,
     * deliberately: comparing Nelamangala against Chakan tells a reader nothing
     * they can act on, whereas the belts they are also shortlisting do.
     *
     * A sibling with no parseable rent is dropped rather than drawn at zero, and
     * a lone bar is no chart at all, so a micromarket with no priced siblings
     * gets an empty list and the section hides itself downstream.
     */
    const PEER_CHART_MAX = 5;
    const byCity = new Map();
    for (const m of data) {
      if (!m.hasPage || !m.citySlug) continue;
      const list = byCity.get(m.citySlug) ?? [];
      list.push(m);
      byCity.set(m.citySlug, list);
    }
    for (const m of data) {
      if (!m.hasPage || !m.citySlug || m.rent === null) {
        m.peers = [];
        continue;
      }
      const siblings = (byCity.get(m.citySlug) ?? [])
        .filter((s) => s.slug !== m.slug && s.rent !== null)
        .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
        .slice(0, PEER_CHART_MAX - 1);
      m.peers =
        siblings.length === 0
          ? []
          : [
              ...siblings.map((s) => ({
                name: s.name,
                slug: s.slug,
                citySlug: s.citySlug,
                medianRent: s.rent.median,
                isSelf: false,
              })),
              { name: m.name, slug: m.slug, citySlug: m.citySlug, medianRent: m.rent.median, isSelf: true },
            ];
    }

    const payload = {
      gates: {
        micromarketMinListings: MICROMARKET_MIN_LISTINGS,
        parentCityMinListings: PARENT_CITY_MIN_LISTINGS,
      },
      data,
    };

    try {
      await redisService.setEx(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(payload));
    } catch (err) {
      console.log('[micromarkets] cache write failed:', err.message);
    }

    return payload;
  }
}

export default new MicromarketService();
