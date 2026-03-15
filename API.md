# WareOnGo Backend API Documentation

## Base URL
```
Production: https://your-domain.com
Development: http://localhost:3000
```

## Authentication

### Google OAuth Login
**POST** `/api/auth/google-login`

Authenticate users using Google OAuth tokens.

**Request Body:**
```json
{
  "token": "google_id_token_here"
}
```

**Response (200):**
```json
{
  "token": "jwt_token_here",
  "user": {
    "googleId": "google_user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user"
  }
}
```

**Role Assignment:**
- Users with `@wareongo.com` email domain receive `admin` role
- All other users receive `user` role

**Rate Limiting:**
- 10 requests per 15 minutes per IP address

**Error Responses:**
- `400` - Missing or invalid token
- `401` - Token verification failed
- `429` - Rate limit exceeded

## Warehouses

### List Warehouses
**GET** `/warehouses`

Retrieve paginated list of warehouses with filtering and caching.

**Query Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | integer | Page number (default: 1) | `?page=2` |
| `pageSize` | integer | Items per page (default: 10) | `?pageSize=20` |
| `city` | string | Filter by city | `?city=Mumbai` |
| `state` | string | Filter by state | `?state=Maharashtra` |
| `warehouseType` | string | Filter by warehouse type | `?warehouseType=Cold Storage` |
| `zone` | string | Filter by zone | `?zone=Industrial` |
| `contactPerson` | string | Filter by contact person | `?contactPerson=John` |
| `compliances` | string | Filter by compliances | `?compliances=ISO` |
| `address` | string | Filter by address (partial match) | `?address=Andheri` |
| `minBudget` | number | Minimum rate per sqft | `?minBudget=50` |
| `maxBudget` | number | Maximum rate per sqft | `?maxBudget=200` |
| `minClearHeight` | number | Minimum clear height | `?minClearHeight=20` |
| `maxClearHeight` | number | Maximum clear height | `?maxClearHeight=40` |
| `minSpace` | integer | Minimum space requirement | `?minSpace=1000` |
| `maxSpace` | integer | Maximum space requirement | `?maxSpace=5000` |
| `fireNocAvailable` | boolean | Fire NOC availability | `?fireNocAvailable=true` |
| `hasCoordinates` | boolean | Only return warehouses with valid lat/long | `?hasCoordinates=true` |

**Multiple Values:**
Filters support multiple values using comma separation or multiple parameters:
```
?city=Mumbai,Delhi
?city=Mumbai&city=Delhi
```

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "address": "123 Industrial Area, Andheri East",
      "city": "Mumbai",
      "state": "Maharashtra",
      "totalSpaceSqft": [1000, 2000, 5000],
      "clearHeightFt": "25",
      "compliances": "ISO 9001, HACCP",
      "otherSpecifications": "24/7 Security, CCTV",
      "ratePerSqft": "150",
      "photos": ["url1.jpg", "url2.jpg"],
      "warehouseType": "General Storage",
      "zone": "Industrial",
      "contactPerson": "John Doe",
      "googleLocation": "https://maps.google.com/...",
      "latitude": 19.1136,
      "longitude": 72.8697,
      "fireNocAvailable": true,
      "fireSafetyMeasures": "Fire extinguishers, sprinkler system"
    }
  ],
  "pagination": {
    "totalItems": 150,
    "totalPages": 15,
    "currentPage": 1,
    "pageSize": 10
  }
}
```

**Caching:**
- Responses are cached for 5 minutes (configurable via `CACHE_TTL` environment variable)
- Cache keys include all filter parameters
- Cache automatically invalidates after TTL expires

### Get Warehouse by ID
**GET** `/warehouses/{id}`

Retrieve detailed information for a specific warehouse.

**Path Parameters:**
- `id` (integer, required) - Warehouse ID

**Response (200):**
```json
{
  "id": 1,
  "address": "123 Industrial Area, Andheri East",
  "numberOfDocks": "5",
  "totalSpaceSqft": [1000, 2000, 5000],
  "clearHeightFt": "25",
  "city": "Mumbai",
  "state": "Maharashtra",
  "postalCode": "400069",
  "photos": ["url1.jpg", "url2.jpg"],
  "warehouseType": "General Storage",
  "zone": "Industrial",
  "compliances": "ISO 9001, HACCP",
  "otherSpecifications": "24/7 Security, CCTV",
  "ratePerSqft": "150",
  "googleLocation": "https://maps.google.com/...",
  "latitude": 19.1136,
  "longitude": 72.8697,
  "fireNocAvailable": true,
  "fireSafetyMeasures": "Fire extinguishers, sprinkler system"
}
```

**Error Responses:**
- `400` - Invalid warehouse ID format
- `404` - Warehouse not found or not visible
- `500` - Server error

## Enquiries

### Create Enquiry
**POST** `/enquiries`

Submit a new enquiry from website visitors.

**Request Body:**
```json
{
  "name": "John Doe",
  "phoneNumber": "+91-9876543210",
  "email": "john@example.com",
  "source": "Website Contact Form"
}
```

**Field Validation:**
- `name` (required) - Non-empty string
- `phoneNumber` (required) - Valid phone number format
- `email` (optional) - Valid email format if provided
- `source` (required) - Non-empty string

**Response (201):**
```json
{
  "id": 123,
  "name": "John Doe",
  "phoneNumber": "+91-9876543210",
  "email": "john@example.com",
  "source": "Website Contact Form",
  "createdat": "2024-01-15T10:30:00.000Z"
}
```

**Email Notifications:**
- Automatic email notification sent to admin team
- Email failures do not affect enquiry creation
- Enquiry is always saved to database regardless of email status

**Error Responses:**
- `400` - Missing or invalid required fields
- `500` - Database error

## Customer Requests

### Create Customer Request
**POST** `/customer-requests`

Submit a detailed customer request with requirements.

**Request Body:**
```json
{
  "full_name": "Jane Smith",
  "phone_number": "+91-9876543210",
  "company_name": "ABC Logistics",
  "preferred_location": "Mumbai, Pune",
  "additional_requirements": "Need cold storage facility with 24/7 access"
}
```

**Field Validation:**
All fields are required and must be non-empty strings:
- `full_name` - Customer's full name
- `phone_number` - Valid phone number
- `company_name` - Company name
- `preferred_location` - Preferred warehouse locations
- `additional_requirements` - Detailed requirements

**Response (201):**
```json
{
  "id": 456,
  "full_name": "Jane Smith",
  "phone_number": "+91-9876543210",
  "company_name": "ABC Logistics",
  "preferred_location": "Mumbai, Pune",
  "additional_requirements": "Need cold storage facility with 24/7 access",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

**Email Notifications:**
- Automatic email notification sent to admin team
- Email failures do not affect request creation
- Request is always saved to database regardless of email status

**Error Responses:**
- `400` - Missing or invalid required fields
- `500` - Database error

## System Management

### Health Check
**GET** `/health`

Check system health including database and Redis connectivity.

**Response (200) - Healthy:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "services": {
    "server": "OK",
    "database": "OK",
    "redis": "OK"
  }
}
```

**Response (503) - Degraded:**
```json
{
  "status": "DEGRADED",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "services": {
    "server": "OK",
    "database": "ERROR",
    "redis": "OK"
  }
}
```

### Clear Warehouse Cache
**DELETE** `/cache/warehouses`

Clear all cached warehouse data. Useful after warehouse data updates.

**Response (200):**
```json
{
  "message": "Cache cleared successfully",
  "clearedKeys": 25
}
```

**Response (200) - No Cache:**
```json
{
  "message": "No cache entries found to clear"
}
```

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Error Type",
  "message": "Detailed error description"
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created successfully
- `400` - Bad request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Resource not found
- `429` - Rate limit exceeded
- `500` - Internal server error
- `503` - Service unavailable (health check degraded)

## Rate Limiting

### Authentication Endpoints
- **Limit:** 10 requests per 15 minutes per IP
- **Applies to:** `/api/auth/google-login`
- **Headers:** Standard rate limit headers included in response

### General Endpoints
- No rate limiting currently applied
- Consider implementing for production use

## Data Types

### Phone Number Format
Accepts various formats:
- `+91-9876543210`
- `+919876543210`
- `9876543210`
- `(+91) 9876543210`

### Photo Arrays
Photos are stored as JSON strings and parsed to arrays:
- Single photo: `["photo1.jpg"]`
- Multiple photos: `["photo1.jpg", "photo2.jpg", "photo3.jpg"]`

### Space Arrays
Total space is stored as integer arrays representing different available spaces:
- Example: `[1000, 2000, 5000]` means spaces of 1000, 2000, and 5000 sqft are available

## Environment Configuration

### Required Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=your_password

# Authentication
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret
JWT_EXPIRY=1h

# Email Notifications
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
EMAILJS_TEMPLATE_ID=your_template_id

# Server Configuration
PORT=3000
NODE_ENV=production
CACHE_TTL=300
CORS_ORIGINS=https://wareongo.com,http://localhost:3000
```

## Database Schema

### Warehouse Table
- Primary storage for warehouse information
- Includes location, specifications, and contact details
- Related to WarehouseData for extended information

### WarehouseData Table
- Extended warehouse information
- Fire safety details, coordinates, and technical specifications
- One-to-one relationship with Warehouse

### Enquiry Table
- Website enquiry submissions
- Basic contact information and source tracking

### CustomerRequest Table
- Detailed customer requirements
- Company information and specific needs

## Caching Strategy

### Redis Implementation
- Warehouse list queries are cached with filter-specific keys
- Cache TTL: 5 minutes (configurable)
- Automatic cache invalidation on TTL expiry
- Manual cache clearing via API endpoint

### Cache Key Format
```
warehouses:page:{page}:size:{pageSize}:filters:{filterHash}
```

### Cache Considerations
- Space filters require in-memory post-processing
- Complex filters may result in cache misses
- Production environments should monitor cache hit rates

## Security Considerations

### Authentication
- Google OAuth integration for user verification
- JWT tokens with configurable expiry
- Role-based access control (admin/user)

### Data Protection
- Contact information excluded from public warehouse listings
- Input validation on all endpoints
- SQL injection protection via Prisma ORM

### Rate Limiting
- Authentication endpoints protected against brute force
- Consider implementing general rate limiting for production

## Performance Optimization

### Database Indexing
- Optimized indexes for common query patterns
- GIN indexes for array and text search operations
- Composite indexes for multi-field queries

### Caching
- Redis caching for expensive warehouse queries
- Configurable TTL for different environments
- Efficient cache key generation

### Query Optimization
- Selective field retrieval to minimize data transfer
- Pagination to handle large datasets
- Efficient filtering with database-level operations

## Monitoring and Logging

### Health Monitoring
- Comprehensive health check endpoint
- Database and Redis connectivity verification
- System uptime tracking

### Error Logging
- Structured error logging for debugging
- Email notification failure tracking
- Authentication attempt logging

### Performance Metrics
- Consider implementing metrics collection
- Monitor cache hit rates
- Track API response times