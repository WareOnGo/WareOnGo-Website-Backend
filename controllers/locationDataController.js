import locationService from '../services/locationService.js';

/**
 * Derived city and state data — the source of truth for both the website build
 * and the CMS editor screens, exactly as /micromarkets is one level down. See
 * services/locationService.js.
 */
export async function getLocations(req, res) {
  try {
    res.status(200).json(await locationService.getLocations());
  } catch (error) {
    console.error('Error deriving locations:', error);
    res.status(500).json({ error: 'An error occurred while deriving locations.' });
  }
}

export async function getLocation(req, res) {
  try {
    const { kind, slug } = req.params;
    const upper = String(kind ?? '').toUpperCase();
    if (upper !== 'CITY' && upper !== 'STATE') {
      return res.status(400).json({ error: "kind must be 'city' or 'state'." });
    }
    const { gates } = await locationService.getLocations();
    const found = await locationService.getLocation(upper, slug);
    if (!found) return res.status(404).json({ error: 'Location not found.' });
    res.status(200).json({ data: found, gates });
  } catch (error) {
    console.error('Error deriving location:', error);
    res.status(500).json({ error: 'An error occurred while deriving the location.' });
  }
}
