import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const verifyToken = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'wareongo-api',
      audience: 'wareongo-client'
    });

    console.log(`Token verified for ${decoded.email} (${decoded.role}) - IP: ${clientIp}`);

    req.user = decoded;
    next();
  } catch (error) {
    console.error(`Token verification failed - IP: ${clientIp}`, error.message);
    
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

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    console.log(`Admin access denied for ${req.user.email} (role: ${req.user.role})`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  console.log(`Admin access granted for ${req.user.email}`);
  next();
};
