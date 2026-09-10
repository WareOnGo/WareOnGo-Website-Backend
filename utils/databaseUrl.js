// Budget connections per backend process instead of using Prisma's CPU-based
// default, which can exceed Supabase's 15-client session pool during a build.
export function databaseUrlWithPoolDefaults(value) {
  if (!value) return value;
  let url;
  try { url = new URL(value); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL'); }
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
  return url.toString();
}
