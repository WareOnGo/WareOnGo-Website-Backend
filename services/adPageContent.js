import defaults from '../data/ad-pages/bangalore.json' with { type: 'json' };

export const MAX_AD_PAGE_BYTES = 500000;
// Shared by the native validator and the AI writing schema export.
export const AD_TEXT_LIMIT = 20000;
export const AD_LIST_LIMIT = 30;
export const AD_REQUIRED_TEXT_PATHS = ['areaGroups.title', 'areaGroups.rows.need', 'areaGroups.rows.areas', 'rentGuide.intro', 'rentGuide.description', 'rentGuide.rows.area', 'rentGuide.rows.rent', 'faqs.q', 'faqs.a'];
export const AD_REQUIRED_LIST_PATHS = ['areaGroups', 'areaGroups.rows', 'rentGuide.rows', 'faqs'];
export const AD_REQUIRED_COPY_FIELDS = ["seoTitle","metaDescription","heroHeading","heroAccent","enquiryHeading","enquiryDescription","enquirySubmit","enquirySuccessHeading","enquirySuccessDescription","enquirySuccessCta","featuredHeading","availableHeading","filterAll","filterSmall","filterMedium","filterLarge","availableFooter","availableCta","locationsHeading","locationsCta","mapLabel","areaHeading","areaNeedHeading","areaLocationsHeading","whyHeading","requestHeading","requestDescription","requestCta","requestPhoneCta","servicesHeading","audiencesHeading","contactHeading","contactDescription","contactSuccess","rentHeading","rentAreaHeading","rentRateHeading","rentUnit","faqHeading"];
export const AD_REQUIRED_CARD_FIELDS = {
  benefits: ['title'], services: ['title', 'body', 'cta', 'mobileTitle', 'mobileBody'], audiences: ['title', 'body', 'primaryCta'],
};

// Version 1 stored fields for a retired layout. Migrate in memory, preserving
// authored fields that are still rendered. Historical revisions remain intact.
const PREVIOUS_SERVICE_COPY = {
  'find-warehouse': {
    titles: ['Find a warehouse', 'Find the Perfect Space', 'Verified Warehouses, Handpicked for You'],
    bodies: ['Verified Bangalore spaces matched to your needs within 4 hours.', 'Verified spaces matched to your needs within 4 hours', 'Verified spaces to suit you in 4 hours', 'Share your size, location, specs and budget. Our team picks the options that fit and sends you a shortlist within 4 hours. All of our warehouses are verified by an area manager.'],
    cta: 'Find my warehouse',
  },
  'build-to-suit': {
    titles: ['Build to suit', 'Built-to-Suit Warehouses'],
    bodies: ['We find land and owners to build to your specifications.', 'We find land that fits you, and build to your specs', 'We find land and build to your specs'],
    cta: 'Start a build to suit',
  },
  'list-space': {
    titles: ['Find a tenant or buyer', 'Find a Tenant or Buyer'],
    bodies: ['Find tenants or buyers for your warehouse or spare space.', 'Find tenants or buyers for your property, hassle-free', 'Find tenants or buyers with ease', 'Own a warehouse, or have space left over? We bring you tenants and buyers from the businesses that come to us.'],
    cta: 'List my space',
  },
  'transaction-management': {
    titles: ['End-to-end transaction management', 'Complete Deal Management', 'End-to-End Transaction Management'],
    bodies: ['Visits, negotiation, paperwork and compliance, managed through move-in.', 'Visits, Negotiation and Handover, handled end-to-end', 'One expert: from search to handover', 'Site visits, negotiation, documentation and compliance checks, handled by one team until you move in.'],
    cta: 'Get started',
  },
};
const PLACEHOLDER_TITLES = {
  verified: 'Verified spaces', local: 'Local expertise', lease: 'Lease support',
  'benefit-4': 'Benefit 4', 'benefit-5': 'Benefit 5', 'benefit-6': 'Benefit 6',
};
const PREVIOUS_BENEFIT_BODIES = {
  local: 'The right locality, specs and paperwork, worked by **our experts**.',
  lease: 'We negotiate the rent, security and lock-in, so that you **get the best deal**.',
  verified: 'Every space is **verified by our area managers** before it reaches your shortlist.',
  'benefit-4': '**One expert advisor** from proposal to move-in.',
  'benefit-5': 'We take care of **the boring details** for you.',
  'benefit-6': "Can't find the best fit? We arrange a **tailored warehouse** for you in 6 months.",
};
function upgradeLegacy(value) {
  if (value?.version !== 1) return value;
  const benefits = Array.isArray(value.benefits) ? value.benefits.map(item => {
    const current = defaults.benefits.find(card => card.id === item?.id);
    if (!current) return item;
    if (item.title === PLACEHOLDER_TITLES[item.id] && typeof item.body === 'string' && !item.body.trim()) return current;
    return { ...item, mobileTitle: item.title === current.title ? current.mobileTitle : '', body: item.body === PREVIOUS_BENEFIT_BODIES[item.id] ? current.body : item.body };
  }) : value.benefits;
  if (benefits?.length === 3 && benefits.every(item => ['verified', 'local', 'lease'].includes(item.id))) benefits.push(...defaults.benefits.slice(3));
  if (Array.isArray(benefits)) benefits.sort((a, b) => defaults.benefits.findIndex(item => item.id === a.id) - defaults.benefits.findIndex(item => item.id === b.id));
  return { ...value, version: 2,
    copy: { ...value.copy,
      ...Object.fromEntries(['areaHeading', 'areaNeedHeading', 'areaLocationsHeading', 'rentHeading', 'rentAreaHeading', 'rentRateHeading', 'rentUnit', 'faqHeading'].map(key => [key, defaults.copy[key]])),
      availableHeading: value.copy?.availableHeading === 'Warehouses and Godowns Available Now in Bangalore' ? defaults.copy.availableHeading : value.copy?.availableHeading,
      heroAccent: value.copy?.heroAccent === 'in Bangalore.' ? defaults.copy.heroAccent : value.copy?.heroAccent,
      whyHeading: value.copy?.whyHeading === 'Why choose WareOnGo' ? defaults.copy.whyHeading : value.copy?.whyHeading,
    },
    benefits,
    services: Array.isArray(value.services) ? value.services.map(item => {
      const current = defaults.services.find(card => card.id === item?.id);
      if (!current) return item;
      const previous = PREVIOUS_SERVICE_COPY[item.id];
      return { ...item,
        title: previous.titles.includes(item.title) ? current.title : item.title,
        body: previous.bodies.includes(item.body) ? current.body : item.body,
        cta: previous.cta === item.cta ? current.cta : item.cta,
        mobileTitle: current.mobileTitle, mobileBody: current.mobileBody,
      };
    }) : value.services,
    areaGroups: defaults.areaGroups, rentGuide: defaults.rentGuide, faqs: defaults.faqs,
  };
}

// Version 3 adds optional mobile copy and independent images for every map area.
// Upgrade only older records: missing fields on a v3 payload remain validation errors.
function upgrade(value) {
  const previous = upgradeLegacy(value);
  if (previous?.version !== 2) return previous;
  const images = { ...previous.images };
  for (const slot of ['micromarket-doddaballapur', 'micromarket-bidadi', 'micromarket-sarjapur', 'micromarket-north-bangalore', 'micromarket-indiranagar', 'micromarket-marathalli', 'micromarket-jp-nagar', 'micromarket-hsr']) {
    if (images[slot] === undefined) images[slot] = slot === 'micromarket-doddaballapur'
      ? images['warehouse-2255'] ?? defaults.images[slot] : defaults.images[slot];
  }
  return { ...previous, version: 3, images,
    benefits: Array.isArray(previous.benefits) ? previous.benefits.map(card => ({ mobileBody: '', ...card })) : previous.benefits,
    audiences: Array.isArray(previous.audiences) ? previous.audiences.map(card => ({ mobileTitle: '', mobileBody: '', ...card })) : previous.audiences,
  };
}

// Mirrored in the CMS and website build. Keep this contract and the import
// snapshot together; tests cover draft privacy and invalid build inputs.
export function parseAdPage(value, { draft = false } = {}) {
  const serialized = JSON.stringify(value);
  if (serialized && new TextEncoder().encode(serialized).byteLength > MAX_AD_PAGE_BYTES) throw new Error('The ad page is too large.');
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  function read(input, example, path) {
    if (typeof example === 'string') {
      if (typeof input !== 'string' || input.length > AD_TEXT_LIMIT) fail(path, `Enter text up to ${AD_TEXT_LIMIT.toLocaleString('en-US')} characters.`);
      return input;
    }
    if (typeof example === 'number') {
      if (!Number.isFinite(input)) fail(path, 'Enter a valid number.');
      return input;
    }
    if (Array.isArray(example)) {
      if (!Array.isArray(input) || input.length > AD_LIST_LIMIT) fail(path, `Use at most ${AD_LIST_LIMIT} entries.`);
      return input.map((item, index) => read(item, example[0], `${path}.${index + 1}`));
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(path, 'This section is missing.');
    // Pick only content fields. Database metadata and private revisions are
    // never copied into the public endpoint or generated website snapshot.
    return Object.fromEntries(Object.entries(example).map(([key, child]) => [key, read(input[key], child, path ? `${path}.${key}` : key)]));
  }
  if (![1, 2, 3].includes(value?.version) || value?.slug !== 'bangalore') fail('page', 'Unknown ad page or content version.');
  const page = read(upgrade(value), defaults, '');
  for (const group of ['benefits', 'services', 'audiences']) {
    const actual = page[group].map(item => item.id).sort();
    const expected = defaults[group].map(item => item.id).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(group, 'Keep the existing card identities.');
  }
  if (page.areaGroups.length !== defaults.areaGroups.length || page.areaGroups.some((group, i) => group.id !== defaults.areaGroups[i].id || group.scope !== defaults.areaGroups[i].scope)) fail('areaGroups', 'Keep the highway and city groups in their existing order.');
  for (const [slot, image] of Object.entries(page.images)) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 10000 || image.height > 10000) fail(`images.${slot}`, 'Enter valid image dimensions.');
    if (!image.url && draft) continue;
    let safe = false;
    try {
      const url = new URL(image.url, 'https://wareongo.com');
      const local = image.url.startsWith('/') && !image.url.startsWith('//');
      safe = (local || image.url.startsWith('https://')) && url.protocol === 'https:' && !url.username && !url.password && !image.url.includes('\\') && !/[\u0000-\u0020]/.test(image.url);
    } catch { /* Report a field error below without echoing an invalid URL. */ }
    if (!safe) fail(`images.${slot}`, 'Choose a website image or an HTTPS image URL.');
    if (!draft && !image.alt.trim()) fail(`images.${slot}.alt`, 'Describe the image.');
  }
  if (!draft) {
    if (!page.name.trim()) fail('name', 'Add a page name.');
    for (const key of AD_REQUIRED_COPY_FIELDS) if (!page.copy[key].trim()) fail(`copy.${key}`, 'Add this text before saving for the next build.');
    function required(input, path) {
      if (Array.isArray(input)) {
        if (AD_REQUIRED_LIST_PATHS.includes(path) && !input.length) fail(path, 'Add at least one entry.');
        input.forEach(item => required(item, path));
      } else if (input && typeof input === 'object') {
        for (const [key, item] of Object.entries(input)) required(item, path ? path + '.' + key : key);
      } else if (AD_REQUIRED_TEXT_PATHS.includes(path) && !input.trim()) fail(path, 'Complete this text before publishing.');
    }
    required(page, '');
    const messages = { benefits: 'Give each benefit a title.', services: 'Complete each service card.', audiences: 'Complete each audience card.' };
    for (const [group, fields] of Object.entries(AD_REQUIRED_CARD_FIELDS)) {
      for (const item of page[group]) if (fields.some(field => !item[field].trim()) || (group === 'audiences' && item.id === '3pls' && !item.secondaryCta.trim())) fail(group, messages[group]);
    }
  }
  return page;
}

export function parseAdPages(value) {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('The approved Bangalore ad page is missing.');
  return value.map(page => parseAdPage(page));
}
