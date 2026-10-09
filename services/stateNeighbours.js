/**
 * Which states share a land border, for the "Nearby states" links on a state
 * overview page.
 *
 * Geography, so configuration rather than derivation: nothing in the listings
 * says Karnataka touches Goa. Each border is written once and read both ways,
 * so a one-sided entry cannot make Goa list Karnataka while Karnataka forgets
 * Goa. States the catalogue does not carry are listed anyway and cost nothing;
 * locationService keeps only neighbours that have listings of their own.
 *
 * Keys and values are slugs exactly as GET /locations emits them.
 */
export const STATE_BORDERS = {
  'andhra-pradesh': ['telangana', 'karnataka', 'tamil-nadu', 'odisha', 'chhattisgarh', 'puducherry'],
  assam: ['arunachal-pradesh', 'nagaland', 'manipur', 'mizoram', 'tripura', 'meghalaya', 'west-bengal'],
  bihar: ['uttar-pradesh', 'jharkhand', 'west-bengal'],
  chhattisgarh: ['madhya-pradesh', 'maharashtra', 'telangana', 'odisha', 'jharkhand', 'uttar-pradesh'],
  delhi: ['haryana', 'uttar-pradesh'],
  goa: ['maharashtra', 'karnataka'],
  gujarat: ['rajasthan', 'madhya-pradesh', 'maharashtra'],
  haryana: ['punjab', 'himachal-pradesh', 'uttar-pradesh', 'rajasthan'],
  jharkhand: ['uttar-pradesh', 'odisha', 'west-bengal'],
  karnataka: ['maharashtra', 'telangana', 'tamil-nadu', 'kerala'],
  kerala: ['tamil-nadu', 'puducherry'],
  'madhya-pradesh': ['rajasthan', 'uttar-pradesh', 'maharashtra'],
  maharashtra: ['telangana'],
  odisha: ['west-bengal'],
  puducherry: ['tamil-nadu'],
  punjab: ['jammu-and-kashmir', 'himachal-pradesh', 'rajasthan'],
  rajasthan: ['uttar-pradesh'],
  'uttar-pradesh': ['uttarakhand', 'himachal-pradesh'],
  'west-bengal': ['sikkim'],
};

const NEIGHBOURS = new Map();
for (const [a, list] of Object.entries(STATE_BORDERS)) {
  for (const b of list) {
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!NEIGHBOURS.has(from)) NEIGHBOURS.set(from, new Set());
      NEIGHBOURS.get(from).add(to);
    }
  }
}

/** Slugs of the states bordering `slug`, unordered; [] for an unknown slug. */
export const neighbouringStates = (slug) => [...(NEIGHBOURS.get(slug) ?? [])];
