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
starts its website build and this backend's authenticated `POST /maintenance/webp`
in parallel. This backend now forwards WebP start/status calls to the EC2
[warehouse enricher](https://github.com/rs0125/procurement-enrichment), using
`https://wareongo-cronjobs.duckdns.org/maintenance/webp`.

The CMS URL, schedule, response acknowledgement and scoped HMAC credential are
preserved. The CMS, backend and enricher share the existing `R2_SECRET_ACCESS_KEY`;
the raw credential is never transmitted. The token is HMAC-SHA256 of
`wareongo:warehouse-webp-trigger:v1` using the trimmed key. Wrong tokens return
401. Failed handoffs return a bounded 503 response; this backend does not start
another local compressor as a fallback.

POST returns HTTP 202 with `{ status: "accepted" | "already_running", jobId }`.
GET returns the enricher's last persisted status and summary. Accepted means the
run was recorded, not completed. Detailed run results now live in `CronRunLog`
on the enricher, rather than the old Redis job-status key and Render worker logs.

The enricher reuses completed WebPs, repairs missing variants after a complete
R2 inventory, compresses serially to 1280 px / quality 75, and repairs the legacy
`photosWebp` projection with concurrent-edit checks. Originals and `Warehouse.media`
are retained. Per-image claims/retries survive restarts. Batches have a 45-minute
budget and a 500-image cap. Native decoders and disk buffers run under EC2 memory
limits. Image readers, approval filtering and original fallbacks are unchanged.
Images completed after a website build's data fetch appear on its next build.

Deploy and verify the enricher first, confirm the old WebP job is idle, then
publish this handoff. Keep both migrated crons under observation before queue
work. See the enricher's `docs/CRON_MIGRATION.md` for cutover and rollback.

The manual `scripts/compress_photos_to_webp.js` retains the earlier table-driven worker for explicit maintenance.
Use `--warehouse=ID`, `--limit=N` or `--dry-run`. Retry state governs progress;
force/start-id/parallel native decoding overrides are rejected. Both entry points
include hidden stock and share per-image claims. The CLI runs as a separate
maintenance operation. The unused Redis HTTP job runner and earlier
photo-column-only compressor have been removed; scheduled runs are owned by EC2.

Run `npm run test:webp` for fixture-based compression, recovery and local HTTP
tests, including real Sharp WebP conversion. Tests never load `.env`, access
production data or upload to R2. The HTTP tests verify forwarding to the
enricher, duplicate acknowledgements and persisted status without a local job
runner or Redis lease.

For a local memory replay, run
`node tests/webp/memory-replay.mjs /path/to/manifest.json`, where the manifest is
an array of `{ "path": "/path/to/photo.jpg" }` records. It processes eight passes
with fixture uploads, reports combined API/worker RSS and uses a 512 MiB budget.
The 2026-09-09 replay of warehouse 983's 18 real 12MP JPEGs completed 144
conversions: the old in-process implementation peaked at 747.4 MiB; the new
implementation sampled 216.6 MiB combined (222.6 MiB when adding the separate
process peaks conservatively). The replay excludes live API traffic and used
a larger local host, not a kernel-enforced 512 MiB container. These historical
measurements describe the retained local maintenance encoder; production
compression now runs under the EC2 worker's resource limits. Sharp documents its Linux
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
