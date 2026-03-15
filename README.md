# WareOnGo Backend

Node.js backend service for warehouse management and enquiry processing.

## Quick Start

### Prerequisites
- Node.js 18+
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