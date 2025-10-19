import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    console.log(`[AUTH] ⚠️ Rate limit exceeded - IP: ${clientIp}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later.'
    });
  }
});

// Constants from environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

// Validate required environment variables
if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is not defined in environment variables');
}
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// Initialize Google OAuth2 Client
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * @route   POST /google-login
 * @desc    Authenticate user with Google ID token
 * @access  Public
 */
router.post('/google-login', authLimiter, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  
  try {
    console.log(`[AUTH] Login attempt from IP: ${clientIp}`);
    
    // Get the Google ID token from request body
    const { token } = req.body;

    // Validate input
    if (!token) {
      console.log(`[AUTH] ❌ Failed - No token provided from IP: ${clientIp}`);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required'
      });
    }

    console.log(`[AUTH] Verifying Google token...`);
    
    // Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    // Get the payload from the verified ticket
    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    console.log(`[AUTH] ✅ Google verification successful for: ${email}`);

    // Determine role based on email domain
    const role = email.endsWith('@wareongo.com') ? 'admin' : 'user';

    console.log(`[AUTH] User role assigned: ${role} for ${email}`);

    // Create user object
    const user = {
      googleId,
      email,
      name,
      role
    };

    // Sign JWT with user data
    const jwtToken = jwt.sign(user, JWT_SECRET, { 
      expiresIn: process.env.JWT_EXPIRY || '1h',
      issuer: 'wareongo-api',
      audience: 'wareongo-client'
    });

    const duration = Date.now() - startTime;
    console.log(`[AUTH] ✅ Login successful for ${email} (${role}) - Duration: ${duration}ms - IP: ${clientIp}`);

    // Send successful response
    res.status(200).json({
      token: jwtToken,
      user
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AUTH] ❌ Login failed - Duration: ${duration}ms - IP: ${clientIp}`);
    console.error(`[AUTH] Error details:`, {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(401).json({
      error: 'Authentication failed',
      message: isDevelopment ? error.message : 'Invalid authentication credentials'
    });
  }
});

export default router;
