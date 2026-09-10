# WareOnGo Backend

Node.js backend service for warehouse management and enquiry processing.

## Quick Start

### Prerequisites
- Node.js 20.19+ (verified on Node.js 22)
- PostgreSQL database
- Redis server

### Installation
```bash
npm install
```

### Environment Setup
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT` - Redis configuration
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `JWT_SECRET` - JWT signing secret
- EmailJS configuration for notifications

For the backend's Supabase session connection, include
`connection_limit=5&pool_timeout=20` in `DATABASE_URL`. Add `?` before these
parameters if the URL has no query string, otherwise use `&`. Keep the existing
credentials, host and port. The shared Prisma client supplies these defaults
when omitted; explicit URL settings take precedence. Each backend process gets
its own pool, so budget all running instances and other services against the
session pool limit. The hosted WebP job reuses the backend's pool.

After changing the Render environment, restart/redeploy the backend so its pool
is recreated. `npm run test:pool` checks configuration without database access.

### Database Setup
```bash
npx prisma generate
npx prisma db push
```

### Start Server
```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

## Architecture

### MVC Structure
- **Models**: Prisma ORM with PostgreSQL
- **Views**: JSON API responses
- **Controllers**: Business logic handlers
- **Services**: Reusable business operations
- **Routes**: Endpoint definitions

### Key Components
- **Authentication**: Google OAuth with JWT
- **Caching**: Redis for warehouse queries
- **Notifications**: EmailJS for enquiry alerts
- **Database**: PostgreSQL with optimized indexes

## API Endpoints

### Core Endpoints
- `GET /warehouses` - List warehouses with filtering
- `GET /warehouses/:id` - Get warehouse details
- `POST /enquiries` - Submit enquiry
- `POST /customer-requests` - Submit customer request
- `POST /api/auth/google-login` - Authenticate user
- `GET /health` - System health check

### Management
- `DELETE /cache/warehouses` - Clear warehouse cache
- `POST /maintenance/webp` - Start or reuse the nightly compression job (authenticated)
- `GET /maintenance/webp` - Read its latest status and progress (authenticated)

## Daily warehouse WebPs

The existing Supabase 02:00 IST job still calls CMS `POST /api/deploy`. The CMS
starts the Vercel website build and this backend's `POST /maintenance/webp` in
parallel. There is **no second cron job, database migration or new service**.
Deploy this backend first, then the CMS. Existing R2 and Redis configuration is
required; the CMS and backend must share the same `R2_SECRET_ACCESS_KEY`.

Both maintenance methods require `Authorization: Bearer <derived-token>` where
the token is the hexadecimal HMAC-SHA256 of `wareongo:warehouse-webp-trigger:v1`
using the trimmed R2 secret as the key. The CMS handles this automatically; it
never sends the underlying storage credential. Missing or wrong bearer tokens
return `401`; missing configuration or an unavailable job store returns `503`.
The original CMS deploy-hook bearer credential remains unchanged.

POST returns `202` with `{ status: "accepted", jobId }` immediately after Redis
records the job. The Express process coordinates the sweep; a short-lived child
process converts each image, and then exits to release its native memory.
Overlapping requests receive `{ status: "already_running", jobId }`, including
across instances during a rolling deployment. GET reports `idle`, `queued`,
`running`, `succeeded`, `partial`, `failed` or `interrupted`, with progress counts
and timestamps when available. Completion summaries also appear in Render's
`[warehouse-webp]` logs. An accepted request does not guarantee completion.

The sweep covers visible warehouse listings, reuses existing nonempty objects
under R2's `webp/` prefix, and uploads missing WebPs (1280px maximum dimension,
quality 75 by default). It reconstructs `photosWebp` from current original
photos, preserving null slots and skipping videos, documents and foreign hosts.
Concurrent photo edits cause that row's update to be skipped and retried on the
next run. Original photos are retained. Downloads have a 30-second timeout and
20MB cap. Originals stream to temporary files, rather than accumulating in API
memory. Conversion runs **one photo at a time**, with a 16-million-pixel input
cap, one Sharp thread and no Sharp operation cache. Each decoder has a 64 MiB
JavaScript heap and a 30-second wall timeout. Its process exits after one image,
releasing native allocations and fragmentation; temporary files are removed
on success, failure or cancellation. Only the small finished WebP is read into
the API process for upload. The R2 originals and existing WebPs remain intact.

Memory checks reserve headroom for API traffic. When container metrics are
available, the entire container's working set is checked against its actual
limit. Otherwise the API/child RSS estimate uses a 512 MiB budget. A worker
exceeding 160 MiB RSS is terminated and that photo is retried on another day.
Insufficient starting headroom, or reaching 75% container usage during conversion,
pauses the sweep as `partial` with `reason: "memory_pressure"`, preserving the
last completed warehouse cursor. These checks are sampled, not OS-enforced
limits: they cannot guarantee survival of every sudden system-wide allocation.
Images above the pixel cap use their original-image fallback.

The authenticated job status now persists `activeWarehouseId`, `photoIndex`
and `phase` before download/conversion/upload. It also includes API memory
measurements; 30-second heartbeat logs carry the same diagnostic context.
If the host kills the API without a stack trace, the last active photo remains
visible after restart. Ordinary child crashes produce a per-photo reason such
as `source_worker_exit_sigkill`, allowing other images to continue.

Each completed warehouse is saved immediately. A Redis cursor survives job
failure or restart; the next trigger resumes after that warehouse and wraps
once through earlier IDs. A full sweep resets the cursor. The default work
budget is 45 minutes; time-limited runs and individual failures report `partial`
and retry unfinished photos on following days. Redis leases expire after two
minutes without a heartbeat, so a crashed worker cannot block later runs.
The latest status expires after seven days; the cursor does not expire. Redis
keys use `maintenance:warehouse-webp:*`, separate from warehouse response caches.
Warehouse caches are cleared after updates; failed invalidation is reported
as a warning and normal cache expiry still applies.

This work runs inside the existing Render web service, so service restarts or
hosting idle shutdowns can interrupt it. In particular, [Render free web
services](https://render.com/docs/free) can spin down after 15 minutes without
inbound traffic. Saved progress is recoverable on the next daily trigger;
there is no assumption that a background promise keeps an instance awake.
A cold start can also exceed the CMS acknowledgement timeout, which is reported
in the CMS response. Check job status before manually retrying. Images completed
after a website build's data fetch become available on the next daily build.

The manual `scripts/compress_photos_to_webp.js` now uses the same compression
core. It retains `--warehouse=ID`, `--limit=N`, `--start-id=ID`, `--dry-run` and
`--force`, with `--concurrency=1..4` (default 1). This flag can parallelize I/O;
native decoders remain serialized within a process. Unlike the HTTP sweep, the CLI
includes hidden warehouses and does not use the Redis lease/cursor; run it as
a separate maintenance operation. `--start-id` resumes then wraps once.

Run `npm run test:webp` for fixture-based compression, recovery and local HTTP
tests, including real Sharp WebP conversion. Tests never load `.env`, access
production data or upload to R2. Redis locking uses an in-memory model in this
suite; it does not require a live Redis instance.

For a local memory replay, run
`node tests/webp/memory-replay.mjs /path/to/manifest.json`, where the manifest is
an array of `{ "path": "/path/to/photo.jpg" }` records. It processes eight passes
with fixture uploads, reports combined API/worker RSS and uses a 512 MiB budget.
The 2026-09-09 replay of warehouse 983's 18 real 12MP JPEGs completed 144
conversions: the old in-process implementation peaked at 747.4 MiB; the new
implementation sampled 216.6 MiB combined (222.6 MiB when adding the separate
process peaks conservatively). The replay excludes live API traffic and used
a larger local host, not a kernel-enforced 512 MiB container. Render verification
is still required after deploying this change. Sharp documents its Linux
[allocator fragmentation risk](https://sharp.pixelplumbing.com/install/#linux-memory-allocator)
and [cache/concurrency controls](https://sharp.pixelplumbing.com/api-utility/).

## Features

### Warehouse Management
- Paginated warehouse listings
- Advanced filtering (location, type, specifications)
- Redis caching for performance
- Google Maps location integration

### Enquiry Processing
- Website enquiry capture
- Customer request handling
- Automatic email notifications
- Database-first approach (no data loss on email failures)

### Authentication
- Google OAuth integration
- Role-based access (admin/user)
- JWT token management
- Rate limiting protection

## Data Flow

### Enquiry Submission
1. Validate input data
2. Save to database
3. Return success response
4. Send email notification (async)

### Warehouse Queries
1. Check Redis cache
2. Query database if cache miss
3. Apply filters and pagination
4. Cache results
5. Return formatted response

## Configuration

### Environment Variables
See `.env.example` for complete configuration options.

### Cache Settings
- Default TTL: 5 minutes
- Configurable via `CACHE_TTL`
- Manual cache clearing available

### Rate Limiting
- Authentication: 10 requests/15 minutes per IP
- Configurable limits for production scaling

## Development

### Testing
```bash
npm test
```

### Database Changes
```bash
npx prisma db push
npx prisma generate
```

### Code Structure
```
├── controllers/     # Request handlers
├── services/        # Business logic
├── routes/          # Endpoint definitions
├── middleware/      # Authentication, validation
├── models/          # Prisma client
├── utils/           # Helper functions
└── prisma/          # Database schema
```

## Production Deployment

### Requirements
- Node.js runtime
- PostgreSQL database
- Redis instance
- Environment variables configured

### Health Monitoring
- `/health` endpoint for load balancer checks
- Database and Redis connectivity verification
- Uptime tracking

### Performance
- Redis caching reduces database load
- Optimized database indexes
- Efficient query patterns
- Async email processing

## Documentation

- **API Documentation**: See `API.md`
- **Database Schema**: See `prisma/schema.prisma`
- **Environment Setup**: See `.env.example`

## Support

For technical issues or questions, refer to the API documentation or check the application logs for detailed error information.

## Micromarket overview geography

`GET /micromarkets` includes `parentState` and `stateSlug` alongside the existing
city/micromarket identity, statistics and listing IDs. State is the most common
recorded state for the canonical parent city; city aliases share the result and
ties resolve alphabetically. Missing/invalid states remain null. The v5 cache
key prevents older cached payloads from omitting these fields after deployment.

Published content from `/micromarket-pages` keeps its existing `(citySlug, slug)`
key. The website renders it at `/overview/{state}/{city}/{micromarket}`; existing
listing URLs keep their plain grid. Deploy this backend before rebuilding the
website and retargeting the CMS. No schema migration is needed.

Run `node --test tests/micromarket-overview.test.js` for the isolated geography
and API contract checks; they replace database/cache access with fixtures.

## Inventory cache bypass for builds

Inventory GET endpoints (`/warehouses`, `/locations`, `/micromarkets`, including
location and micromarket detail lookups) honour `Cache-Control: no-cache` or
`no-store`. These requests read the database directly, skip both Redis reads and
writes, and return `Cache-Control: no-store` and `X-Wareongo-Cache: bypass`.
Ordinary requests retain the existing cache behaviour. Database errors propagate;
a fresh request never falls back to stale Redis data.

Deploy this backend before rebuilding the website with fresh inventory support.
There are no new environment variables, credentials, cron jobs or migrations.
Run `npm run test:cache` for isolated cache/controller regression checks.
