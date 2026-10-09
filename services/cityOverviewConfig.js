export const LOCALITY_TABLE_MIN_TAGGED_LISTINGS = 25;

// Bengaluru uses the ten areas from the Bangalore ads landing page, in order.
// Membership uses only these exact micromarket slugs, never addresses or
// additional corridor aliases. Other cities get one row per micromarket.
export const CITY_LOCALITY_GROUPS = {
  bengaluru: [
    { slug: 'nelamangala-dobbaspet-makali', name: 'Nelamangala, Dobbaspet, Makali', markets: ['nelamangala', 'dobbaspet', 'makali'] },
    { slug: 'hoskote-budigere-soukya-road', name: 'Hoskote, Budigere, Soukya Road', markets: ['hoskote', 'budigere', 'soukya-road'] },
    { slug: 'peenya', name: 'Peenya', markets: ['peenya'] },
    { slug: 'hosur-road', name: 'Hosur Road: Bommasandra, Jigani, Attibele', markets: ['hosur-road', 'bommasandra', 'jigani', 'attibele'] },
    { slug: 'bidadi-harohalli', name: 'Bidadi, Harohalli', markets: ['bidadi', 'harohalli'] },
    { slug: 'kumbalgodu', name: 'Kumbalgodu', markets: ['kumbalgodu'] },
    { slug: 'devanahalli', name: 'Devanahalli', markets: ['devanahalli'] },
    { slug: 'whitefield', name: 'Whitefield', markets: ['whitefield'] },
    { slug: 'marathahalli-sarjapur', name: 'Marathahalli, Sarjapur', markets: ['marathalli', 'sarjapura'] },
    { slug: 'hsr', name: 'HSR Layout', markets: ['hsr'] },
  ],
};

export const CITY_NEIGHBOURS = {
  bengaluru: ['hosur', 'kolar', 'tumakuru', 'tumkur', 'mysuru', 'mysore'],
};

export const COMPARISON_CITIES = ['delhi', 'hyderabad', 'chennai', 'pune', 'bengaluru', 'mumbai', 'kolkata', 'ahmedabad', 'gurugram'];
