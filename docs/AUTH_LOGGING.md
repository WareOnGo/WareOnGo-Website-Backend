# Authentication Logging Reference

## Log Format & Events

All authentication logs are prefixed with `[AUTH]` for easy filtering and monitoring.

---

## Login Events

### ✅ Successful Login
```
[AUTH] Login attempt from IP: 192.168.1.1
[AUTH] Verifying Google token...
[AUTH] ✅ Google verification successful for: user@example.com
[AUTH] User role assigned: user for user@example.com
[AUTH] ✅ Login successful for user@example.com (user) - Duration: 234ms - IP: 192.168.1.1
```

### ✅ Admin Login
```
[AUTH] Login attempt from IP: 192.168.1.1
[AUTH] Verifying Google token...
[AUTH] ✅ Google verification successful for: admin@wareongo.com
[AUTH] User role assigned: admin for admin@wareongo.com
[AUTH] ✅ Login successful for admin@wareongo.com (admin) - Duration: 198ms - IP: 192.168.1.1
```

### ❌ Failed Login - No Token
```
[AUTH] Login attempt from IP: 192.168.1.1
[AUTH] ❌ Failed - No token provided from IP: 192.168.1.1
```

### ❌ Failed Login - Invalid Token
```
[AUTH] Login attempt from IP: 192.168.1.1
[AUTH] Verifying Google token...
[AUTH] ❌ Login failed - Duration: 145ms - IP: 192.168.1.1
[AUTH] Error details: { name: 'Error', message: 'Token verification failed' }
```

---

## Token Verification Events

### ✅ Successful Verification
```
[AUTH] Token verification attempt - Path: /api/profile - IP: 192.168.1.1
[AUTH] ✅ Token verified for user@example.com (user) - Path: /api/profile
```

### ❌ No Authorization Header
```
[AUTH] Token verification attempt - Path: /api/profile - IP: 192.168.1.1
[AUTH] ❌ No authorization header - Path: /api/profile - IP: 192.168.1.1
```

### ❌ Invalid Format
```
[AUTH] Token verification attempt - Path: /api/profile - IP: 192.168.1.1
[AUTH] ❌ Invalid authorization format - Path: /api/profile - IP: 192.168.1.1
```

### ❌ Token Expired
```
[AUTH] Token verification attempt - Path: /api/profile - IP: 192.168.1.1
[AUTH] ❌ Token verification failed - Path: /api/profile - IP: 192.168.1.1
[AUTH] Error: TokenExpiredError - jwt expired
```

### ❌ Invalid Token
```
[AUTH] Token verification attempt - Path: /api/profile - IP: 192.168.1.1
[AUTH] ❌ Token verification failed - Path: /api/profile - IP: 192.168.1.1
[AUTH] Error: JsonWebTokenError - invalid signature
```

---

## Admin Access Events

### ✅ Admin Access Granted
```
[AUTH] Admin access check - Path: /api/admin/users - IP: 192.168.1.1
[AUTH] ✅ Admin access granted for admin@wareongo.com - Path: /api/admin/users
```

### ❌ Admin Access Denied - Wrong Role
```
[AUTH] Admin access check - Path: /api/admin/users - IP: 192.168.1.1
[AUTH] ❌ Admin access denied for user@example.com (role: user) - Path: /api/admin/users
```

### ❌ Admin Access Denied - No User
```
[AUTH] Admin access check - Path: /api/admin/users - IP: 192.168.1.1
[AUTH] ❌ Admin check failed - No user in request - Path: /api/admin/users
```

---

## Rate Limiting Events

### ⚠️ Rate Limit Threshold Reached
```
[AUTH] ⚠️ Rate limit threshold reached - IP: 192.168.1.1
```

### ⚠️ Rate Limit Exceeded
```
[AUTH] ⚠️ Rate limit exceeded - IP: 192.168.1.1
```

**Current Limits:**
- 10 requests per 15 minutes per IP address
- Applies to `/api/auth/google-login` endpoint

---

## Log Monitoring Tips

### 1. **Filter All Auth Logs**
```bash
# View all authentication logs in real-time
tail -f server.log | grep "\[AUTH\]"

# Or with journalctl if using systemd
journalctl -u wareongo-backend -f | grep "\[AUTH\]"
```

### 2. **Monitor Failed Login Attempts**
```bash
tail -f server.log | grep "\[AUTH\].*❌"
```

### 3. **Monitor Successful Logins**
```bash
tail -f server.log | grep "\[AUTH\].*Login successful"
```

### 4. **Monitor Admin Access**
```bash
tail -f server.log | grep "\[AUTH\].*Admin"
```

### 5. **Monitor Rate Limit Events**
```bash
tail -f server.log | grep "\[AUTH\].*Rate limit"
```

### 6. **Track Specific User**
```bash
tail -f server.log | grep "\[AUTH\]" | grep "user@example.com"
```

### 7. **Track Specific IP**
```bash
tail -f server.log | grep "\[AUTH\]" | grep "192.168.1.1"
```

---

## Security Alerts to Watch For

### 🚨 High Priority

1. **Multiple Failed Login Attempts**
   - Pattern: Multiple `❌ Login failed` from same IP in short time
   - Action: Investigate potential brute force attack

2. **Rate Limit Exceeded Frequently**
   - Pattern: Multiple `⚠️ Rate limit exceeded` from same IP
   - Action: Consider blocking or investigating the IP

3. **Admin Access Denied Multiple Times**
   - Pattern: Multiple `❌ Admin access denied` for same user
   - Action: Potential privilege escalation attempt

4. **Token Verification Failures**
   - Pattern: Many `TokenExpiredError` or `JsonWebTokenError` events
   - Action: Check for token manipulation attempts

### ⚠️ Medium Priority

1. **Unusual Login Times**
   - Pattern: Admin logins at unusual hours
   - Action: Verify with admin team

2. **Geographic Anomalies**
   - Pattern: Same user logging in from different IPs/locations quickly
   - Action: Potential account compromise

---

## Production Logging Best Practices

### 1. **Use a Logging Library** (Recommended)

Install Winston for better log management:
```bash
npm install winston
```

### 2. **Log Levels**
- `ERROR`: Failed authentications, token errors
- `WARN`: Rate limits, suspicious activity
- `INFO`: Successful logins, admin access
- `DEBUG`: Token verification details (dev only)

### 3. **Log Rotation**
Prevent log files from growing too large:
```bash
npm install winston-daily-rotate-file
```

### 4. **Centralized Logging** (Production)
Consider services like:
- **Papertrail** - Simple cloud logging
- **Loggly** - Advanced log management
- **DataDog** - Full observability platform
- **ELK Stack** - Self-hosted (Elasticsearch, Logstash, Kibana)

### 5. **Metrics to Track**
- Total login attempts per hour/day
- Success vs failure rate
- Average authentication duration
- Most active users
- Most active IP addresses
- Rate limit violations per IP
- Admin access frequency

---

## Example: Setting Up Winston (Optional)

```javascript
// utils/logger.js
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/auth.log',
      level: 'info'
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export default logger;
```

Then replace `console.log` with `logger.info`, `console.error` with `logger.error`, etc.

---

## Sample Log Analysis Queries

### Count Failed Logins by IP
```bash
grep "\[AUTH\].*❌.*Login failed" server.log | \
  grep -oP "IP: \K[0-9.]+" | \
  sort | uniq -c | sort -nr
```

### Count Successful Logins by User
```bash
grep "\[AUTH\].*✅.*Login successful" server.log | \
  grep -oP "for \K[^\s]+" | \
  sort | uniq -c | sort -nr
```

### Average Authentication Duration
```bash
grep "\[AUTH\].*Login successful" server.log | \
  grep -oP "Duration: \K[0-9]+" | \
  awk '{sum+=$1; count++} END {print sum/count "ms"}'
```

---

## Integration with Monitoring Tools

### Prometheus Metrics (Advanced)
Consider adding metrics collection:
```javascript
import promClient from 'prom-client';

const loginAttempts = new promClient.Counter({
  name: 'auth_login_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['status', 'role']
});

const authDuration = new promClient.Histogram({
  name: 'auth_duration_seconds',
  help: 'Authentication duration in seconds'
});
```

---

## Quick Reference

| Event | Log Pattern | Severity |
|-------|-------------|----------|
| Login Attempt | `Login attempt from IP:` | INFO |
| Login Success | `✅ Login successful for` | INFO |
| Login Failed | `❌ Login failed` | ERROR |
| Token Verified | `✅ Token verified for` | INFO |
| Token Failed | `❌ Token verification failed` | ERROR |
| Admin Granted | `✅ Admin access granted` | INFO |
| Admin Denied | `❌ Admin access denied` | WARN |
| Rate Limited | `⚠️ Rate limit exceeded` | WARN |

---

**Last Updated:** October 19, 2025
