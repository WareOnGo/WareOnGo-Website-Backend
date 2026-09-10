// Build clients ask for fresh inventory without evicting visitor caches. HTTP
// fetch cache settings alone do not affect our application-level Redis cache.
export function requestCacheOptions(req, res) {
  const directives = String(req.headers?.['cache-control'] ?? '')
    .toLowerCase().split(',').map(value => value.trim());
  const bypassCache = directives.includes('no-cache') || directives.includes('no-store');
  if (bypassCache) {
    res.set('Cache-Control', 'no-store');
    // Lets builds detect an older backend that silently ignores the request.
    res.set('X-Wareongo-Cache', 'bypass');
  }
  return { bypassCache };
}
