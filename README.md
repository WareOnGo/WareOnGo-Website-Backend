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
records the job. The long-running Express process then compresses photos.
Overlapping requests receive `{ status: "already_running", jobId }`, including
across instances during a rolling deployment. GET reports `idle`, `queued`,
`running`, `succeeded`, `partial`, `failed` or `interrupted`, with progress counts
and timestamps when available. Completion summaries also appear in Render's
`[warehouse-webp]` logs. An accepted request does not guarantee completion.

The sweep covers visible warehouse listings, reuses existing nonempty objects
under R2's `webp/` prefix, and uploads missing WebPs (1280px maximum width,
quality 75 by default). It reconstructs `photosWebp` from current original
photos, preserving null slots and skipping videos, documents and foreign hosts.
Concurrent photo edits cause that row's update to be skipped and retried on the
next run. Original photos are retained. Downloads have a 30-second timeout and
20MB cap; conversion has a 40-million-pixel cap and runs two photos at a time.

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
`--force`, with `--concurrency=1..4` (default 2). Unlike the HTTP sweep, the CLI
includes hidden warehouses and does not use the Redis lease/cursor; run it as
a separate maintenance operation. `--start-id` resumes then wraps once.

Run `npm run test:webp` for fixture-based compression, recovery and local HTTP
tests, including real Sharp WebP conversion. Tests never load `.env`, access
production data or upload to R2. Redis locking uses an in-memory model in this
suite; it does not require a live Redis instance.

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
