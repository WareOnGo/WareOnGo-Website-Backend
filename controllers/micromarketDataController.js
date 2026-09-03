import micromarketService from '../services/micromarketService.js';

/**
 * Derived micromarket data — the source of truth for both the website build and
 * the CMS editor screens. See services/micromarketService.js for why it lives
 * here rather than being computed three times downstream.
 */
export async function getMicromarkets(req, res) {
  try {
    res.status(200).json(await micromarketService.getMicromarkets());
  } catch (error) {
    console.error('Error deriving micromarkets:', error);
    res.status(500).json({ error: 'An error occurred while deriving micromarkets.' });
  }
}

export async function getMicromarket(req, res) {
  try {
    const { citySlug, slug } = req.params;
    const { data, gates } = await micromarketService.getMicromarkets();
    // Matched on the pair, so only the parent city's URL resolves — the same
    // tag reached via a different city is not this page.
    const found = data.find((m) => m.slug === slug && m.citySlug === citySlug);
    if (!found) return res.status(404).json({ error: 'Micromarket not found.' });
    res.status(200).json({ data: found, gates });
  } catch (error) {
    console.error('Error deriving micromarket:', error);
    res.status(500).json({ error: 'An error occurred while deriving the micromarket.' });
  }
}
