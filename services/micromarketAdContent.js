// Mirrored in the backend and website. This is the local-copy contract, not a layout.
export const MAX_MICROMARKET_AD_BYTES = 64000;
export const SOUTH_AD_SLUG = 'electronic-city-jigani-bommasandra';
export const SOUTH_AD_NAME = 'Electronic City, Jigani and Bommasandra';
export const SHEDS_AD_SLUG = 'sheds';
export const SHEDS_AD_NAME = 'Industrial Sheds';
/** City pages outside Bangalore: one page per city, slug = city slug, served at /{city}. */
export const AD_CITY_PAGES = { hosur: 'Hosur', hyderabad: 'Hyderabad' };
const isAdCity = citySlug => Object.hasOwn(AD_CITY_PAGES, citySlug);
export const micromarketAdPath = (slug, citySlug = 'bengaluru') => isAdCity(citySlug) ? '/' + citySlug : '/bangalore/' + slug;
export const isSupportedAdIdentity = (citySlug, slug) => typeof slug === 'string' && slug.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  && (citySlug === 'bengaluru' || (isAdCity(citySlug) && slug === citySlug));
/** The place a page names in its headings: the industrial sheds page covers all of Bangalore. */
export const adPagePlace = ({ citySlug, slug, name }) => citySlug === 'bengaluru' && slug === SHEDS_AD_SLUG ? 'Bangalore' : name;

/** Inventory-backed choices; grouped areas and city pages keep fixed identities. */
export function micromarketAdChoices(markets, cities = []) {
  const choices = markets.filter(item => item.citySlug === 'bengaluru' && item.listings > 0)
    .map(({ citySlug, slug, name }) => ({ citySlug, slug, name }));
  if (markets.some(item => item.citySlug === 'bengaluru' && ['hosur-road', 'jigani', 'bommasandra'].includes(item.slug) && item.listings > 0)) {
    choices.push({ citySlug: 'bengaluru', slug: SOUTH_AD_SLUG, name: SOUTH_AD_NAME });
  }
  // The shed page selects by listing type across Bangalore, so any Bangalore stock offers it.
  if (choices.length) choices.push({ citySlug: 'bengaluru', slug: SHEDS_AD_SLUG, name: SHEDS_AD_NAME });
  for (const [slug, name] of Object.entries(AD_CITY_PAGES)) {
    if (cities.some(item => item.slug === slug && item.listings > 0)) choices.push({ citySlug: slug, slug, name });
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}
export const MICROMARKET_AD_COPY_FIELDS = [
  { key: 'heroHeading', label: 'Main heading', section: 'hero', limit: 120 },
  { key: 'availableHeading', label: 'Available spaces heading', section: 'headings', limit: 160 },
  { key: 'locationsHeading', label: 'Map section heading', section: 'headings', limit: 100 },
  { key: 'areaHeading', label: 'Area guide heading', section: 'headings', limit: 120 },
  { key: 'rentHeading', label: 'Rent guide heading', section: 'headings', limit: 160 },
  { key: 'seoTitle', label: 'Page title', section: 'metadata', limit: 200 },
  { key: 'metaDescription', label: 'Page description', section: 'metadata', limit: 400, multiline: true },
];
const text = (maxLength, description) => ({ type: 'string', minLength: 1, maxLength, ...(description ? { description } : {}) });
const object = (properties, optional = []) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties).filter(key => !optional.includes(key)), properties });
export const MICROMARKET_AD_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Micromarket ad page: local copy',
  description: 'Shared ad-page template for Bangalore micromarkets, the Electronic City/Jigani/Bommasandra group, Bangalore industrial sheds and the Hosur and Hyderabad city pages. Identity comes from the inventory and is fixed after creation. Only local copy is stored here. Layout, shared sections, forms, callback wording, fees, photos, maps, listing filters, counts and calculated rents are managed by the template. Use {listings} and {rentRange} for live figures; never hard-code them.',
  ...object({
    version: { type: 'integer', const: 1 },
    citySlug: { type: 'string', enum: ['bengaluru', ...Object.keys(AD_CITY_PAGES)], description: 'Inventory city. Hosur and Hyderabad use the same layout with their own city inventory.' },
    slug: { ...text(100), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', description: 'Inventory or configured group slug. Bangalore pages use /bangalore/{slug}; a city page uses its city slug and URL /{city}.' },
    name: text(120, 'Exact inventory micromarket name. Selected in the CMS, not changed by copy edits.'),
    copy: object(Object.fromEntries(MICROMARKET_AD_COPY_FIELDS.map(field => [field.key, text(field.limit)]))),
    area: object({
      whereItIs: text(5000, 'Local geography and connectivity. **Bold emphasis** is supported.'),
      whoItSuits: text(5000, 'Businesses and uses suited to this micromarket. Omit it for a page with a single area card.'),
    }, ['whoItSuits']),
    mapBylines: {
      type: 'array', minItems: 1, maxItems: 20,
      description: 'Short local descriptions under map card names. Slugs identify existing template markers; they do not change map positions.',
      items: object({ slug: { ...text(100), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, byline: { ...text(100, 'Optional approved local byline; leave blank when none is supplied.'), minLength: 0 } }),
    },
    rentGuide: {
      ...object({
        intro: text(2000),
        description: text(4000, 'Paragraph after the introduction.'),
        sections: {
          type: 'array', minItems: 1, maxItems: 6,
          description: 'Titled paragraphs after the introduction, for a longer rent guide.',
          items: object({ title: text(120), body: text(4000, '**Bold emphasis** is supported.') }),
        },
      }, ['description', 'sections']),
      anyOf: [{ required: ['description'] }, { required: ['sections'] }],
    },
    faqs: {
      type: 'array', minItems: 1, maxItems: 10,
      description: 'Local questions only. The common WareOnGo fee question is inherited from the Bangalore ad page.',
      items: object({ q: text(200), a: text(4000) }),
    },
  }),
  allOf: Object.keys(AD_CITY_PAGES).map(city => ({ if: { properties: { citySlug: { const: city } } }, then: { properties: { slug: { const: city } } } })),
};

function validate(value, schema, path, draft) {
  const fail = message => { throw new Error(path + ': ' + message); };
  if ('const' in schema && value !== schema.const) fail('unsupported value.');
  if (schema.enum && !schema.enum.includes(value)) fail('unsupported value.');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object.');
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) fail('"' + key + '" is not an editable local-copy field.');
    for (const key of schema.required) if (!Object.hasOwn(value, key)) fail('"' + key + '" is required.');
    for (const key of Object.keys(schema.properties)) {
      if (Object.hasOwn(value, key)) validate(value[key], schema.properties[key], path + '.' + key, draft);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail('provide ' + schema.minItems + '–' + schema.maxItems + ' items.');
    value.forEach((item, index) => validate(item, schema.items, path + '[' + index + ']', draft));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > (schema.maxLength ?? Infinity)) fail('text is missing or too long.');
    const identity = ['page.citySlug', 'page.slug', 'page.name'].includes(path);
    if ((!draft || identity) && schema.minLength && !value.trim()) fail('add text before saving for the next build.');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('invalid slug.');
    if (/<\/?[a-z][^>]*>/i.test(value)) fail('use plain text or **bold**, not HTML.');
    for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
      if (!['listings', 'rentRange'].includes(match[1])) fail('unknown placeholder {' + match[1] + '}.');
    }
  } else if (schema.type === 'integer' && !Number.isSafeInteger(value)) fail('expected a whole number.');
}

export function parseMicromarketAdPage(value, { draft = false } = {}) {
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).length > MAX_MICROMARKET_AD_BYTES) throw new Error('Micromarket ad page is too large.');
  validate(value, MICROMARKET_AD_SCHEMA, 'page', draft);
  if (!isSupportedAdIdentity(value.citySlug, value.slug)) throw new Error('Unsupported ad-page identity.');
  if (!Object.hasOwn(value.rentGuide, 'description') && !Object.hasOwn(value.rentGuide, 'sections')) throw new Error('page.rentGuide: add a description or titled sections.');
  if (new Set(value.mapBylines.map(item => item.slug)).size !== value.mapBylines.length) throw new Error('Duplicate map card byline.');
  return JSON.parse(serialized);
}

export function parseMicromarketAdPages(value) {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Invalid micromarket ad-page collection.');
  const pages = value.map(page => parseMicromarketAdPage(page));
  const keys = pages.map(page => page.citySlug + '/' + page.slug);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate micromarket ad-page URL.');
  return pages;
}

export function createMicromarketAdTemplate({ citySlug = 'bengaluru', slug, name }) {
  const markers = {
    'bengaluru/peenya': ['peenya', 'nelamangala', 'dobbaspet'],
    'bengaluru/hoskote': ['hoskote', 'whitefield', 'devanahalli'],
    'bengaluru/nelamangala': ['nelamangala', 'dobbaspet', 'peenya'],
    ['bengaluru/' + SOUTH_AD_SLUG]: ['hosur-road', 'sarjapura'],
    ['bengaluru/' + SHEDS_AD_SLUG]: ['budigere', 'whitefield', 'jakkur-yelahanka', 'peenya', 'jigani-bommasandra', 'nelamangala', 'hoskote', 'kumbalgodu'],
    'hosur/hosur': ['hosur', 'attibele', 'bommasandra'],
    'hyderabad/hyderabad': ['medchal', 'kompally-devaryamjal', 'shamshabad', 'patancheru'],
  }[citySlug + '/' + slug] ?? [slug];
  const place = adPagePlace({ citySlug, slug, name });
  // Hyderabad has one area card and a rent guide in titled sections.
  const city = citySlug === 'hyderabad';
  return parseMicromarketAdPage({
    version: 1, citySlug, slug, name,
    copy: {
      heroHeading: 'Warehouses for Rent',
      availableHeading: 'Warehouses Available Now in ' + place,
      locationsHeading: 'Explore Spaces in & Around ' + place,
      areaHeading: 'Is ' + place + ' Right for You?',
      rentHeading: 'Warehouse Rent in ' + place,
      seoTitle: 'Warehouses for Rent in ' + place + ' · WareOnGo',
      metaDescription: '{listings} warehouses for rent in ' + place + ({ hosur: ', Tamil Nadu.', hyderabad: ', Telangana.' }[citySlug] ?? (place === 'Bangalore' ? '.' : ', Bangalore.')) + ' Share your requirements for a shortlist.',
    },
    area: city ? { whereItIs: '' } : { whereItIs: '', whoItSuits: '' },
    mapBylines: markers.map(slug => ({ slug, byline: '' })),
    rentGuide: city
      ? { intro: '', sections: ['Where the Stock Sits', 'What Drives the Rent', 'What to Check'].map(title => ({ title, body: '' })) }
      : { intro: '', description: '' },
    faqs: [
      { q: 'What Is the Rent for a Warehouse in ' + place + '?', a: '' },
      { q: 'What Sizes Are Available in ' + place + '?', a: '' },
    ],
  }, { draft: true });
}
