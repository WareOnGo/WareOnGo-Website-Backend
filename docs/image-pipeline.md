Both backends use `labeled_warehouse_images` automatically. There are no read or
write feature flags to configure. Original URLs, labels and captions are preserved;
WebP has explicit variant and processing fields, and JPEG has separate metadata.
`Warehouse.media` remains the membership/order source, with legacy `photos` as a
fallback only when `media.images` is absent.

Deploy the compatible dashboard backend before this backend so pending images have
a label worker that understands stage states. The shared Supabase schema is already
applied. List/detail responses always include ordered `images` with original-image
fallbacks; the website frontend accepts both old and new API payloads. List cache
keys use `v7-images` to avoid serving older cached payloads.

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
Rebuild the static site once after deploying; subsequent HTML updates follow the
current build cadence. Processing never starts a website deployment.

The legacy `photosWebp` projection remains for existing consumers and checks that
media/photos still match before writing. It never updates media or deletes
originals. If processing needs to be paused, pause its existing trigger and keep a
backend version that understands pending rows. Do not restore the old row-existence
label worker after pending rows have been registered. Queues and removing legacy
columns remain separate work.

Checks: `npm run test:webp`, `npm run test:warehouse-filters`, `npm run test:cache`.
The dashboard backend's `tests/image-pipeline/integration.cjs` exercises both real
HTTP readers and WebP repository against isolated local PostgreSQL with no feature
flags; set `IMAGE_PIPELINE_WEBSITE_ROOT` if using a different checkout location.
