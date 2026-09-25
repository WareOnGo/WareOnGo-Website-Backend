Both backends use `labeled_warehouse_images` automatically. There are no read or
write feature flags to configure. Original URLs, labels and captions are preserved;
WebP and compressed JPEG have explicit variant and processing fields. Original
JPEG files remain untouched.
`Warehouse.media` remains the membership/order source, with legacy `photos` as a
fallback only when `media.images` is absent.

Deploy the compatible dashboard backend before this backend so pending images have
a label worker that understands stage states. The shared Supabase schema is already
applied. Public list/detail responses select approved photos using the website
fields in that same table. They include at most eight useful T1/T2 photos, aiming
for an indoor/outdoor balance using the original scene classifications. Approved
T3 photos only fill a soft minimum of four; sparse galleries can contain fewer.
BLOCK, REVIEW, pending, failed, missing, document/unknown, and UNUSABLE images
never fill a quota. Exact source hashes deduplicate photos. Useful overview views
receive cover preference, with stable ordering for ties.

Both current Luna and Sol Batch assessments are supported. Original URL and
recorded source hash identify the assessed immutable R2 object; a replacement
must use a new URL and receive a new assessment. Request handlers do not download
originals or invoke models. `websiteOverride` is reserved for trusted staff writes:
`{ decision, sourceSha256, reviewedBy, reviewedAt, reason, qualityTier? }`. Only a
matching source hash and complete review metadata can override an assessment.
Malformed or stale overrides withhold the image. This release adds no override UI.

`images`, legacy `photos`, and `photosWebp` contain the same selected gallery in
the same order. Null WebP slots retain positional alignment. A failed WebP can
fall back only to its selected original. No approved photos produces explicit
empty arrays for the existing “Images available on request” frontend state.
Approval-read errors produce empty galleries, never unfiltered originals.

List cache keys use `v9-approved-images`. Redis caches listing fields only;
membership, visibility, approvals, and overrides are read fresh on every request,
including cache hits. Public responses send `X-Wareongo-Image-Policy:
approved-4-8-v1` and require HTTP revalidation. Compression, dashboard/PPT readers,
and the legacy storage projection continue using the unfiltered image registry.
No warehouse media, photos, image rows, or R2 objects are changed by these readers.

A read-only preview on 2026-09-25 selected 10,375 image references across 2,142
visible warehouses, from 14,957 current references. 659 galleries had fewer than
four photos; 81 had none (13 already had no images, 68 became empty after the
approval/usefulness rules). These listings keep the existing request-images state;
rejected originals are not a fallback. This is inventory coverage, not an accuracy
claim about model decisions.

`POST /maintenance/webp` retains its existing authentication and asynchronous job
interface. Both HTTP and the manual compression CLI use the image table and cover
visible and hidden stock. Sharp remains serial with its existing memory, size and
time limits. Completed results are reused, and unfinished stages retain their
retry state. The image cursor has its own namespace; the Redis run lock remains
shared with older jobs.

`POST /maintenance/image-cache` clears warehouse response caches. Its bearer token
is HMAC-SHA256(R2_SECRET_ACCESS_KEY.trim(), 'wareongo:image-cache-invalidate:v1').
The dashboard's optional `IMAGE_PIPELINE_CACHE_URL` can point to that HTTPS endpoint
for immediate invalidation. Without it, existing cache expiry handles updates.
Rebuild the static site after deploying this backend so prerendered galleries,
listing/overview covers, image sitemaps, structured data and OG images consume the
filtered API. Existing generated pages and image assets are not purged by a
backend release. Subsequent static HTML follows the current build cadence;
processing never starts a website deployment. Independently authored featured
assets without an image-registry association need separate editorial review.

The legacy `photosWebp` projection remains for existing consumers and checks that
media/photos still match before writing. It never updates media or deletes
originals. If processing needs to be paused, pause its existing trigger and keep a
backend version that understands pending rows. Do not restore the old row-existence
label worker after pending rows have been registered. Queues and removing legacy
columns remain separate work.

Checks: `npm run test:website-images`, `npm run test:webp`,
`npm run test:warehouse-filters`, `npm run test:cache`, and `prisma validate`.
`npm run test:website-images:integration` uses the existing isolated local
image-pipeline test database via `TEST_DATABASE_URL` and exercises real SQL/HTTP,
shared images, rejected legacy URLs, media removals, and later review changes.
Never run these fixture suites against production. No new database migration is
needed: the website columns already exist; this Prisma schema mirrors them.
The dashboard backend's `tests/image-pipeline/integration.cjs` exercises both real
HTTP readers and WebP repository against isolated local PostgreSQL with no feature
flags; set `IMAGE_PIPELINE_WEBSITE_ROOT` if using a different checkout location.
