// Recursively convert BigInt values to strings so objects can be JSON.stringified
export function sanitizeForJSON(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  // Dates have no enumerable properties, so the generic object branch below
  // would flatten them to {} — serialize to ISO strings instead.
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForJSON);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeForJSON(v);
    }
    return out;
  }
  return value;
}
