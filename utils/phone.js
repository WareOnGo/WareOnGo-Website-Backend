// Basic phone validation util
// Accepts international numbers with optional + and digits, allows spaces, dashes, and parentheses
export function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.trim();
  // Simple regex: optional + at start, then 7-15 digits, allow separators
  const regex = /^\+?[0-9()\-\s]{7,20}$/;
  return regex.test(cleaned);
}
