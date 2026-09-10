import prisma from '../models/prismaClient.js';
import redisService from './redisService.js';
import {
  canonicalCity,
  canonicalState,
  isRealCityName,
  slugifyCity,
  statsFor,
} from './micromarketService.js';

/**
 * The same job micromarketService does, one and two levels up: which cities and
 * states exist, which have enough inventory to carry an editorial page, and
 * every figure derived from their listings.
 *
 * It imports the derivation itself — statsFor and the canonicalisation helpers —
 * rather than repeating it. That is the whole point: the rate and clear-height
 * columns are free text, and the parsing rules for them now exist once. A city
 * median and a micromarket median inside it are computed by the same code, so
 * they cannot drift apart.
 *
 * Consumers:
 *   wareongo-website  src/services/locationsAPI.ts     (renders the pages)
 *   wareongo-website  scripts/lib/locations.mjs        (sitemap + footer links)
 *   wareongo-cms      lib/locations-api.ts             (editor screens)
 */

/**
 * How many listings a city or state needs before the CMS offers it an editorial
 * page.
 *
 * The same number as MICROMARKET_MIN_LISTINGS, and deliberately so: the
 * threshold exists because a median and a spread computed over three listings
 * describe those three listings rather than a market, and that reason does not
 * change with the size of the area. Note what it does *not* gate — every city
 * and state page already exists and renders its listing grid whatever the
 * count. This only decides whether an editor is offered the wireframe.
 */
export const LOCATION_PAGE_MIN_LISTINGS = 5;

/** Bars on the peer rent chart, the location itself included. */
const PEER_CHART_MAX = 5;

const KINDS = {
  CITY: {
    kind: 'CITY',
    canonical: canonicalCity,
    /** Which column carries the name. */
    valueOf: (row) => row.city,
    pathFor: (slug) => `/listings/city/${slug}`,
    /**
     * Cities compare against the other cities in their own state. Comparing
     * Bengaluru against Bhiwandi tells a reader nothing they can act on; the
     * cities they are also shortlisting inside one state do.
     */
    peerGroupOf: (entry) => entry.stateSlug,
  },
  STATE: {
    kind: 'STATE',
    canonical: canonicalState,
    valueOf: (row) => row.state,
    pathFor: (slug) => `/listings/state/${slug}`,
    /** Every state is in the same group: there is no larger unit to nest in. */
    peerGroupOf: () => 'all',
  },
};

/**
 * Group the catalogue by one of its place columns and derive a page's worth of
 * figures for each.
 *
 * Cities additionally record the state they sit in — most listings wins, the
 * same rule micromarkets use to pick a parent city — because a city page links
 * up to its state and needs a breadcrumb target.
 */
function group(listings, spec, stateSlugOf) {
  const groups = new Map();
  for (const row of listings) {
    const name = spec.canonical(spec.valueOf(row));
    if (!name || !isRealCityName(name)) continue;
    const slug = slugifyCity(name);
    if (!slug) continue;
    const entry = groups.get(slug) ?? { name, rows: [], states: new Map() };
    entry.rows.push(row);
    if (spec.kind === 'CITY') {
      const state = canonicalState(row.state);
      if (state && isRealCityName(state)) {
        entry.states.set(state, (entry.states.get(state) ?? 0) + 1);
      }
    }
    groups.set(slug, entry);
  }

  return Array.from(groups.entries())
    .map(([slug, entry]) => {
      const stats = statsFor(entry.rows);
      const parentState =
        spec.kind === 'CITY'
          ? (Array.from(entry.states.entries()).sort(
              (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
            )[0]?.[0] ?? null)
          : null;
      return {
        kind: spec.kind,
        name: entry.name,
        slug,
        path: spec.pathFor(slug),
        parentState,
        stateSlug: parentState ? (stateSlugOf.get(parentState) ?? slugifyCity(parentState)) : null,
        /**
         * Whether an editor is offered the editorial wireframe for this one. The
         * plain grid renders either way — see LOCATION_PAGE_MIN_LISTINGS.
         */
        hasPage: stats.listings >= LOCATION_PAGE_MIN_LISTINGS,
        /**
         * Which warehouses belong here, so the website scopes its grid from this
         * answer rather than re-matching city names downstream. Two spellings of
         * one city collapse to the same slug here; a consumer comparing raw
         * names would quietly drop one of them.
         */
        listingIds: entry.rows.map((r) => r.id),
        ...stats,
      };
    })
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}

/**
 * The bars of each page's chart: the busiest comparable locations plus the
 * location itself, each at its own median rent.
 *
 * Computed here, alongside the medians themselves, so that a bar on one page
 * and the headline figure on the page it links to are the same field read
 * twice. A location with no parseable rent is dropped rather than drawn at
 * zero, and a lone bar is no chart at all, so anything without priced peers
 * gets an empty list and the section hides itself downstream.
 */
function attachPeers(entries, spec) {
  const byGroup = new Map();
  for (const e of entries) {
    if (!e.hasPage || e.rent === null) continue;
    const g = spec.peerGroupOf(e);
    if (!g) continue;
    const list = byGroup.get(g) ?? [];
    list.push(e);
    byGroup.set(g, list);
  }

  const bar = (x, isSelf) => ({
    name: x.name,
    slug: x.slug,
    path: x.path,
    medianRent: x.rent.median,
    isSelf,
  });

  for (const e of entries) {
    if (!e.hasPage || e.rent === null) {
      e.peers = [];
      continue;
    }
    const siblings = (byGroup.get(spec.peerGroupOf(e)) ?? [])
      .filter((s) => s.slug !== e.slug && s.rent !== null)
      .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
      .slice(0, PEER_CHART_MAX - 1);
    e.peers = siblings.length === 0 ? [] : [...siblings.map((s) => bar(s, false)), bar(e, true)];
  }
}

// Bumped whenever the shape or the derivation changes, so a deploy cannot serve
// figures computed by the previous version.
//   v1: first release
const CACHE_KEY = 'locations:v1';
const CACHE_TTL_SECONDS = 600;

class LocationService {
  async getLocations({ bypassCache = false } = {}) {
    if (!bypassCache) {
      try {
        const cached = await redisService.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (err) {
        console.log('[locations] cache read failed, computing:', err.message);
      }
    }

    const rows = await prisma.warehouse.findMany({
      where: { visibility: true },
      select: {
        id: true,
        city: true,
        state: true,
        totalSpaceSqft: true,
        ratePerSqft: true,
        clearHeightFt: true,
        numberOfDocks: true,
        flooringType: true,
        warehouseType: true,
        compliances: true,
        warehouseData: { select: { fireNocAvailable: true } },
      },
    });

    // fireNocAvailable lives on the related row; statsFor reads it flat, the
    // same way micromarketService hands it over.
    const listings = rows.map((r) => ({
      ...r,
      fireNocAvailable: r.warehouseData?.fireNocAvailable ?? null,
    }));

    // States first, so cities can name the state slug they nest under.
    const states = group(listings, KINDS.STATE, new Map());
    const stateSlugOf = new Map(states.map((s) => [s.name, s.slug]));
    const cities = group(listings, KINDS.CITY, stateSlugOf);

    attachPeers(cities, KINDS.CITY);
    attachPeers(states, KINDS.STATE);

    const payload = {
      gates: { locationPageMinListings: LOCATION_PAGE_MIN_LISTINGS },
      data: { cities, states },
    };

    if (!bypassCache) {
      try {
        await redisService.setEx(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(payload));
      } catch (err) {
        console.log('[locations] cache write failed:', err.message);
      }
    }

    return payload;
  }

  /** One location, or null. `kind` is case-insensitive: 'city' or 'CITY'. */
  async getLocation(kind, slug, options) {
    const upper = String(kind ?? '').toUpperCase();
    if (upper !== 'CITY' && upper !== 'STATE') return null;
    const { data } = await this.getLocations(options);
    const list = upper === 'CITY' ? data.cities : data.states;
    return list.find((l) => l.slug === slug) ?? null;
  }
}

export default new LocationService();
