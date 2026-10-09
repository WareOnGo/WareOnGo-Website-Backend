import { rateNumber, slugifyMicromarket, isNamedMicromarket, canonicalCity, slugifyCity } from './micromarketService.js';
import { CITY_LOCALITY_GROUPS, LOCALITY_TABLE_MIN_TAGGED_LISTINGS, CITY_NEIGHBOURS, COMPARISON_CITIES } from './cityOverviewConfig.js';

// A separate, versioned city contract. The shared state/micromarket derivation
// keeps its existing semantics, including rounding and page eligibility.
const unbuilt = row => /\b(land|plot|bts)\b|build[\s-]*to[\s-]*suit/i.test(row.warehouseType ?? '');
const underConstruction = row => /under[\s_-]*construction|construction[\s_-]*(?:in[\s_-]*progress|ongoing)/i.test(
  [row.warehouseType, row.status, row.availability].filter(Boolean).join(' '));
const known = values => values.filter(value => value !== null);
const numeric = raw => {
  if (raw === null || raw === undefined || raw === '') return null;
  const match = /-?\d+(?:\.\d+)?/.exec(String(raw).replace(/(?<=\d),(?=\d)/g, ''));
  const n = match ? Number(match[0]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const unitSize = row => {
  // Match the unit shown on a warehouse card, not the sum of alternative sizes.
  const value = Array.isArray(row.totalSpaceSqft) ? row.totalSpaceSqft[0] : row.totalSpaceSqft;
  return typeof value === 'number' && Number.isFinite(value) && value >= 100 ? value : null;
};
const spread = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { min: sorted[0], median: (sorted[mid] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1) };
};
const construction = raw => {
  if (/peb/i.test(raw ?? '')) return 'PEB';
  if (/rcc/i.test(raw ?? '')) return 'RCC';
  if (/shed/i.test(raw ?? '')) return 'Shed';
  if (/cold/i.test(raw ?? '')) return 'Cold storage';
  return null;
};
const flooring = raw => {
  if (/vdf/i.test(raw ?? '')) return 'VDF';
  if (/fm[\s-]*2/i.test(raw ?? '')) return 'FM2';
  if (/tile/i.test(raw ?? '')) return 'Tiled';
  if (/plain|concrete|rcc|ipc/i.test(raw ?? '')) return 'Plain concrete / RCC';
  if (/trimix/i.test(raw ?? '')) return 'Trimix';
  return null;
};
const mix = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count, share: Math.round(count * 100 / values.length) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};
const tagsFor = row => {
  const tags = new Map();
  for (const raw of Array.isArray(row.micromarket) ? row.micromarket : []) {
    if (!isNamedMicromarket(raw)) continue;
    const slug = slugifyMicromarket(raw);
    const name = String(raw).trim();
    if (slug && (!tags.has(slug) || name.localeCompare(tags.get(slug)) < 0)) tags.set(slug, name);
  }
  return [...tags].sort(([a], [b]) => a.localeCompare(b));
};

export function cityStockStats(rows) {
  const rents = known(rows.map(row => rateNumber(row.ratePerSqft)));
  const sizes = known(rows.map(unitSize));
  const heights = known(rows.map(row => numeric(row.clearHeightFt))).filter(n => n > 0);
  const docks = known(rows.map(row => numeric(row.numberOfDocks)));
  const builds = rows.map(row => construction(row.warehouseType)).filter(Boolean);
  const floors = rows.map(row => flooring(row.flooringType)).filter(Boolean);
  const dockRange = spread(docks);
  return {
    listings: rows.length, measured: rows.length,
    rent: spread(rents), size: spread(sizes), clearHeight: spread(heights), docks: dockRange,
    docksMedian: dockRange?.median ?? null,
    construction: mix(builds), flooring: mix(floors),
    fireNoc: rows.filter(row => row.fireNocAvailable === true || row.warehouseData?.fireNocAvailable === true).length,
    commercialClu: rows.filter(row => /\bclu\b|change of land[- ]?use/i.test(row.compliances ?? '')).length,
    engineeredFloorShare: floors.length ? Math.round(floors.filter(label => label === 'VDF' || label === 'FM2').length * 100 / floors.length) : null,
    samples: { rent: rents.length, size: sizes.length, clearHeight: heights.length, docks: docks.length, construction: builds.length, flooring: floors.length },
  };
}

const BANDS = [
  ['under-5000', 'Under 5,000 sq ft', 0, 5000],
  ['5000-20000', '5,000–20,000 sq ft', 5000, 20000],
  ['20000-50000', '20,000–50,000 sq ft', 20000, 50000],
  ['50000-100000', '50,000–100,000 sq ft', 50000, 100000],
  ['100000-plus', '100,000 sq ft and above', 100000, null],
];

export function cityOverviewFor(rows, citySlug) {
  // Repeated locality tags or input rows cannot inflate any city total.
  const unique = [...new Map(rows.map(row => [row.id, row])).values()];
  const stock = unique.filter(row => !unbuilt(row) && !underConstruction(row));
  const summary = { ...cityStockStats(stock), listings: unique.length };
  const band = (min, max) => stock.filter(row => {
    const size = unitSize(row);
    return size !== null && size >= min && (max === null || size < max);
  });
  const definitions = Object.hasOwn(CITY_LOCALITY_GROUPS, citySlug) ? CITY_LOCALITY_GROUPS[citySlug] : undefined;
  const stockIds = new Set(stock.map(row => row.id));
  const groups = new Map();
  let taggedListings = 0;
  let baseListings = 0;
  for (const row of unique) {
    const tags = tagsFor(row);
    if (!tags.length) continue;
    taggedListings++;
    const matches = definitions
      ? definitions.filter(def => def.markets.some(slug => tags.some(([tag]) => tag === slug)))
      : tags.map(([slug, name]) => ({ slug, name }));
    if (!matches.length) continue;
    // Eligibility and the denominator count visible tagged listings once.
    // Row statistics retain the existing built-stock exclusions, including BTS.
    baseListings++;
    if (!stockIds.has(row.id)) continue;
    for (const { slug, name } of matches) {
      if (!groups.has(slug)) groups.set(slug, { slug, name, direction: '', rows: [] });
      const group = groups.get(slug);
      // Equivalent tags can arrive with different casing; keep the label stable
      // when database row order changes without altering the supplied wording.
      if (name.localeCompare(group.name) < 0) group.name = name;
      group.rows.push(row);
    }
  }
  const eligible = taggedListings >= LOCALITY_TABLE_MIN_TAGGED_LISTINGS;
  // Keep the response field names for existing consumers; corridor mode is retired.
  const corridors = eligible ? [...groups.values()].map(({ rows: members, ...group }) => {
    const stats = cityStockStats(members);
    return { ...group, ...stats, share: stats.listings * 100 / baseListings,
      ...(stats.listings < 3 ? { rent: null, size: null, construction: [] } : {}) };
  }).sort((a, b) => definitions
    ? definitions.findIndex(def => def.slug === a.slug) - definitions.findIndex(def => def.slug === b.slug)
    : b.listings - a.listings || a.name.localeCompare(b.name)) : [];
  const markets = new Map();
  for (const row of unique) for (const [slug, name] of tagsFor(row)) {
    const market = markets.get(slug) ?? { slug, name, listings: 0 };
    market.listings++;
    markets.set(slug, market);
  }
  return {
    version: 1, summary, nearbyLabel: 'Nearby cities',
    excluded: { unbuilt: unique.filter(unbuilt).length, underConstruction: unique.filter(row => !unbuilt(row) && underConstruction(row)).length },
    corridorMode: 'localities', corridors,
    localityTable: { eligible, taggedListings, baseListings, minTaggedListings: LOCALITY_TABLE_MIN_TAGGED_LISTINGS,
      grouping: definitions ? 'areas' : 'micromarkets' },
    segments: { large: cityStockStats(band(20000, null)), small: cityStockStats(band(0, 20000)) },
    rentBySize: BANDS.map(([slug, label, min, max]) => ({ slug, label, min, max, ...cityStockStats(band(min, max)) })),
    specsBySize: { large: cityStockStats(band(50000, null)), small: cityStockStats(band(0, 20000)) },
    micromarkets: [...markets.values()].filter(market => market.listings >= 3).sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
      .map(market => ({ ...market, path: unique.length >= 6 && market.listings >= 5 ? `/listings/city/${citySlug}/${market.slug}` : null })),
    comparisonCities: [], nearbyCities: [],
  };
}

export function attachCityOverviews(cities, listings) {
  const byCity = new Map();
  for (const row of listings) {
    const name = canonicalCity(row.city);
    if (!name) continue;
    const slug = slugifyCity(name);
    if (!byCity.has(slug)) byCity.set(slug, []);
    byCity.get(slug).push(row);
  }
  for (const city of cities) city.cityOverview = cityOverviewFor(byCity.get(city.slug) ?? [], city.slug);
  const usable = cities.filter(city => city.hasPage && city.cityOverview.summary.rent);
  for (const city of cities) {
    const ranked = usable.filter(peer => peer.slug !== city.slug).sort((a, b) => {
      const rank = slug => { const index = COMPARISON_CITIES.indexOf(slug); return index === -1 ? 100 : index; };
      return rank(a.slug) - rank(b.slug) || b.listings - a.listings || a.slug.localeCompare(b.slug);
    }).slice(0, 4);
    if (ranked.length && city.cityOverview.summary.rent) city.cityOverview.comparisonCities = [...ranked, city].map(peer => ({
      name: peer.name, slug: peer.slug, path: peer.path, medianRent: peer.cityOverview.summary.rent.median, isSelf: peer.slug === city.slug,
    }));
    const neighbours = Object.hasOwn(CITY_NEIGHBOURS, city.slug) ? CITY_NEIGHBOURS[city.slug] : undefined;
    city.cityOverview.nearbyLabel = neighbours ? 'Nearby cities' : `Other cities${city.parentState ? ` in ${city.parentState}` : ''}`;
    city.cityOverview.nearbyCities = cities.filter(peer => peer.slug !== city.slug && peer.hasPage && (neighbours
      ? neighbours.includes(peer.slug) : city.stateSlug && peer.stateSlug === city.stateSlug))
      .sort((a, b) => neighbours ? neighbours.indexOf(a.slug) - neighbours.indexOf(b.slug) : b.listings - a.listings)
      .slice(0, 4).map(peer => ({ name: peer.name, slug: peer.slug, path: peer.path }));
  }
}
