import { Prisma } from '@prisma/client';
import { CITY_ALIASES, canonicalCity } from './micromarketService.js';

export class WarehouseQueryError extends Error {}

const columns = {
  city: Prisma.sql`w.city`, state: Prisma.sql`w.state`,
  warehouseType: Prisma.sql`w."warehouseType"`, zone: Prisma.sql`w.zone`,
  contactPerson: Prisma.sql`w."contactPerson"`, compliances: Prisma.sql`w.compliances`,
};
const textRanges = [
  ['minBudget', 'maxBudget', Prisma.sql`w."ratePerSqft"`],
  ['minClearHeight', 'maxClearHeight', Prisma.sql`w."clearHeightFt"`],
];
const absent = value => value === undefined || value === null || value === '';

function text(value, name) {
  if (typeof value !== 'string') throw new WarehouseQueryError(`${name} must be a string`);
  return value.trim();
}

function integer(value, name, fallback, minimum) {
  if (absent(value)) return fallback;
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))) {
    throw new WarehouseQueryError(`${name} must be an integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > 2147483647) {
    throw new WarehouseQueryError(`${name} is outside the supported range`);
  }
  return number;
}

/** Normalize only this endpoint's supported inputs, before caching or querying. */
export function readWarehouseQuery(input = {}, requestedPage = 1, requestedSize = 10) {
  const page = integer(requestedPage, 'page', 1, 1);
  const pageSize = integer(requestedSize, 'pageSize', 10, 1);
  if ((page - 1) * pageSize > 2147483647) throw new WarehouseQueryError('Page offset is too large');
  const filters = {};
  for (const name of Object.keys(columns)) {
    if (absent(input[name])) continue;
    const values = (Array.isArray(input[name]) ? input[name] : [input[name]])
      .flatMap(value => text(value, name).split(',').map(part => part.trim())).filter(Boolean);
    if (values.length) filters[name] = values;
  }
  if (!absent(input.address)) filters.address = text(input.address, 'address');
  // These columns are free text. Preserve their existing string comparison
  // semantics; correcting numeric budget/height parsing is a separate change.
  for (const [min, max] of textRanges) {
    for (const name of [min, max]) {
      if (!absent(input[name])) filters[name] = text(input[name], name);
    }
  }
  for (const name of ['minSpace', 'maxSpace']) {
    const value = integer(input[name], name, undefined, 0);
    if (value !== undefined) filters[name] = value;
  }
  if (filters.minSpace !== undefined && filters.maxSpace !== undefined && filters.minSpace > filters.maxSpace) {
    throw new WarehouseQueryError('minSpace must not exceed maxSpace');
  }
  if (!absent(input.spaceRanges)) {
    if (filters.minSpace !== undefined || filters.maxSpace !== undefined) {
      throw new WarehouseQueryError('Use spaceRanges or minSpace/maxSpace, not both');
    }
    // Inclusive bands, e.g. 0-10000,50000-. An empty upper bound is unbounded.
    const parts = text(input.spaceRanges, 'spaceRanges').split(',');
    if (parts.length > 4) throw new WarehouseQueryError('spaceRanges supports up to four ranges');
    const ranges = parts.map(part => {
      const match = /^(\d+)-(\d*)$/.exec(part.trim());
      if (!match) throw new WarehouseQueryError('spaceRanges must contain min-max ranges');
      const min = integer(match[1], 'spaceRanges minimum', undefined, 0);
      const max = integer(match[2], 'spaceRanges maximum', undefined, 0);
      if (max !== undefined && min > max) throw new WarehouseQueryError('spaceRanges minimum must not exceed maximum');
      return { min, max };
    });
    filters.spaceRanges = [...new Map(ranges.map(range => [`${range.min}-${range.max ?? ''}`, range])).values()]
      .sort((a, b) => a.min - b.min || (a.max ?? Infinity) - (b.max ?? Infinity));
  }
  for (const name of ['fireNocAvailable', 'hasCoordinates']) {
    if (absent(input[name])) continue;
    if (![true, false, 'true', 'false'].includes(input[name])) throw new WarehouseQueryError(`${name} must be true or false`);
    filters[name] = input[name] === true || input[name] === 'true';
  }
  if (!absent(input.locationMatch)) {
    if (!['exact', 'partial'].includes(input.locationMatch)) throw new WarehouseQueryError('locationMatch must be exact or partial');
    filters.locationMatch = input.locationMatch;
  }
  if (!absent(input.micromarket)) {
    const slug = text(input.micromarket, 'micromarket').toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new WarehouseQueryError('micromarket must be a locality slug');
    if (!filters.city?.length) throw new WarehouseQueryError('city is required with micromarket');
    filters.micromarket = slug;
    filters.locationMatch = 'exact';
  }
  return { filters, page, pageSize };
}

// JavaScript trim()/\s includes NBSP and other Unicode spaces that PostgreSQL's
// locale-dependent [:space:] can miss. Match the existing catalogue exactly.
const whitespace = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
const normalizedPlace = column => Prisma.sql`lower(btrim(regexp_replace(${column}, ${`[${whitespace}]+`}, ' ', 'g')))`;

/** Shared WHERE for the page and count. Every request value is a bound parameter. */
export function warehouseWhere(filters) {
  const conditions = [Prisma.sql`w.visibility = true`];
  for (const [name, column] of Object.entries(columns)) {
    const values = filters[name];
    if (!values?.length) continue;
    if (filters.locationMatch === 'exact' && ['city', 'state'].includes(name)) {
      const places = name === 'city' ? values.map(canonicalCity) : values;
      const aliases = name === 'city'
        ? Object.entries(CITY_ALIASES).filter(([, city]) => places.includes(city)).map(([alias]) => alias) : [];
      const matches = [...new Set([...places, ...aliases].map(value => value.toLowerCase().replace(/\s+/g, ' ').trim()))];
      conditions.push(Prisma.sql`${normalizedPlace(column)} IN (${Prisma.join(matches)})`);
    } else if (name === 'warehouseType') {
      // Each chosen type retains the single-type match, including hybrid stock.
      conditions.push(Prisma.sql`(${Prisma.join(values.map(value => Prisma.sql`${column} ILIKE ${`%${value}%`}`), ' OR ')})`);
    } else if (values.length > 1) {
      conditions.push(Prisma.sql`lower(${column}) IN (${Prisma.join(values.map(value => value.toLowerCase()))})`);
    } else {
      conditions.push(Prisma.sql`${column} ILIKE ${`%${values[0]}%`}`);
    }
  }
  if (filters.address) conditions.push(Prisma.sql`w.address ILIKE ${`%${filters.address}%`}`);
  for (const [min, max, column] of textRanges) {
    if (filters[min] !== undefined) conditions.push(Prisma.sql`${column} >= ${filters[min]}`);
    if (filters[max] !== undefined) conditions.push(Prisma.sql`${column} <= ${filters[max]}`);
  }
  if (filters.fireNocAvailable !== undefined) conditions.push(Prisma.sql`d."fireNocAvailable" = ${filters.fireNocAvailable}`);
  if (filters.hasCoordinates) conditions.push(Prisma.sql`d.latitude IS NOT NULL AND d.longitude IS NOT NULL`);

  const ranges = filters.spaceRanges ?? (filters.minSpace !== undefined || filters.maxSpace !== undefined
    ? [{ min: filters.minSpace, max: filters.maxSpace }] : []);
  if (ranges.length) {
    const matches = ranges.map(range => {
      const bounds = [];
      if (range.min !== undefined) bounds.push(Prisma.sql`space >= ${range.min}`);
      if (range.max !== undefined) bounds.push(Prisma.sql`space <= ${range.max}`);
      return Prisma.sql`(${Prisma.join(bounds, ' AND ')})`;
    });
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM unnest(w."totalSpaceSqft") AS space WHERE ${Prisma.join(matches, ' OR ')}
    )`);
  }
  if (filters.micromarket) {
    // Match micromarketService's named-tag/slug rules, without deriving its
    // overview statistics or depending on the catalogue's separate cache.
    // Database tests compare this membership against that unchanged service.
    const trimmedTag = Prisma.sql`btrim(tag, ${whitespace})`;
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM unnest(w.micromarket) AS tag
      WHERE length(${trimmedTag}) > 2 AND ${trimmedTag} !~ '^[A-Za-z0-9]{32}$'
        AND btrim(regexp_replace(regexp_replace(regexp_replace(
          lower(tag), ${`[${whitespace}/]+`}, '-', 'g'), '[^a-z0-9-]', '', 'g'), '-+', '-', 'g'), '-') = ${filters.micromarket}
    )`);
  }
  return Prisma.join(conditions, ' AND ');
}

const source = Prisma.sql`FROM "Warehouse" w LEFT JOIN "WarehouseData" d ON d."warehouseId" = w.id`;

/** Two ordinary reads, with one predicate and a fixed public-field whitelist. */
export function warehouseQueries({ filters, page, pageSize }) {
  const where = warehouseWhere(filters);
  return {
    rows: Prisma.sql`SELECT
      w.id, w.address, w.city, w.state, w."totalSpaceSqft", w."clearHeightFt",
      w.compliances, w."otherSpecifications", w."ratePerSqft",
      w."warehouseType", w.zone, w.micromarket,
      w.status_updated_at AS "statusUpdatedAt", w."numberOfDocks", w."flooringType",
      CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object(
        'fireNocAvailable', d."fireNocAvailable", 'fireSafetyMeasures', d."fireSafetyMeasures",
        'latitude', d.latitude, 'longitude', d.longitude
      ) END AS "warehouseData"
      ${source} WHERE ${where} ORDER BY w.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    count: Prisma.sql`SELECT count(*)::integer AS total ${source} WHERE ${where}`,
  };
}
