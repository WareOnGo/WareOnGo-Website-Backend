// Geography is explicit. A corridor can span several existing micromarket tags;
// an unrecognised tag must never be guessed from an address or labelled central.
export const CITY_CORRIDORS = {
  bengaluru: [
    { slug: 'tumkur-road', name: 'Nelamangala / Tumkur Road', direction: 'NH-48 · Northwest', markets: ['nelamangala', 'tumkur-road', 'dobbaspet', 'dabaspet', 'dobbasapete', 'makali', 't-begur', 'dasanapura', 'budihal'] },
    { slug: 'hosur-road', name: 'Hosur Road', direction: 'NH-44 · Bommasandra, Jigani, Attibele', markets: ['hosur-road', 'bommasandra', 'jigani', 'attibele', 'electronic-city', 'bommanahalli', 'begur', 'kudlu-gate'] },
    { slug: 'hoskote', name: 'Hoskote / Old Madras Road', direction: 'NH-75 · East', markets: ['hoskote', 'old-madras-road', 'soukya-road', 'narsapura', 'malur', 'chokkahalli', 'budigere', 'cheemasandra', 'bidrahalli', 'rampura', 'ekarajapura'] },
    { slug: 'airport-road', name: 'Devanahalli / Airport', direction: 'North', markets: ['devanahalli', 'airport-road', 'yelahanka', 'jakkur', 'sidlaghatta-road'] },
    { slug: 'whitefield-sarjapur', name: 'Whitefield / Sarjapur', direction: 'East', markets: ['whitefield', 'sarjapur', 'sarjapura', 'varthur', 'marathalli', 'marathahalli', 'hsr', 'hsr-layout'] },
    { slug: 'peenya', name: 'Peenya', direction: 'Northwest · Inner city', markets: ['peenya', 'peenya-industrial-area'] },
    { slug: 'mysore-road', name: 'Mysore Road / NICE', direction: 'Southwest', markets: ['mysore-road', 'mysuru-road', 'bidadi', 'kumbalgodu'] },
  ],
};

export const CITY_NEIGHBOURS = {
  bengaluru: ['hosur', 'kolar', 'tumakuru', 'tumkur', 'mysuru', 'mysore'],
};

export const COMPARISON_CITIES = ['delhi', 'hyderabad', 'chennai', 'pune', 'bengaluru', 'mumbai', 'kolkata', 'ahmedabad', 'gurugram'];
