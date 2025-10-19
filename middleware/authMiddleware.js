import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware to verify JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const verifyToken = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const requestedPath = req.path;
  
  try {
    console.log(`[AUTH] Token verification attempt - Path: ${requestedPath} - IP: ${clientIp}`);
    
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log(`[AUTH] ❌ No authorization header - Path: ${requestedPath} - IP: ${clientIp}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    }

    // Check if Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      console.log(`[AUTH] ❌ Invalid authorization format - Path: ${requestedPath} - IP: ${clientIp}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'wareongo-api',
      audience: 'wareongo-client'
    });

    console.log(`[AUTH] ✅ Token verified for ${decoded.email} (${decoded.role}) - Path: ${requestedPath}`);

    // Attach user info to request
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error(`[AUTH] ❌ Token verification failed - Path: ${requestedPath} - IP: ${clientIp}`);
    console.error(`[AUTH] Error: ${error.name} - ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token verification failed'
    });
  }
};

/**
 * Middleware to verify admin role
 * Must be used after verifyToken
 */
export const requireAdmin = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const requestedPath = req.path;
  
  console.log(`[AUTH] Admin access check - Path: ${requestedPath} - IP: ${clientIp}`);
  
  if (!req.user) {
    console.log(`[AUTH] ❌ Admin check failed - No user in request - Path: ${requestedPath}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    console.log(`[AUTH] ❌ Admin access denied for ${req.user.email} (role: ${req.user.role}) - Path: ${requestedPath}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  console.log(`[AUTH] ✅ Admin access granted for ${req.user.email} - Path: ${requestedPath}`);
  next();
};
