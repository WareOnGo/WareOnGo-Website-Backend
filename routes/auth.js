import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`Rate limit exceeded - IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later.'
    });
  }
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is not defined in environment variables');
}
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/google-login', authLimiter, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required'
      });
    }
    
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    const role = email.endsWith('@wareongo.com') ? 'admin' : 'user';

    const user = {
      googleId,
      email,
      name,
      role
    };

    const jwtToken = jwt.sign(user, JWT_SECRET, { 
      expiresIn: process.env.JWT_EXPIRY || '1h',
      issuer: 'wareongo-api',
      audience: 'wareongo-client'
    });

    const duration = Date.now() - startTime;
    console.log(`Login successful for ${email} (${role}) - ${duration}ms - IP: ${clientIp}`);

    res.status(200).json({
      token: jwtToken,
      user
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Login failed - ${duration}ms - IP: ${clientIp}`, error.message);
    
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(401).json({
      error: 'Authentication failed',
      message: isDevelopment ? error.message : 'Invalid authentication credentials'
    });
  }
});

export default router;
