import healthService from '../services/healthService.js';

export async function getHealth(req, res) {
  try {
    const healthCheck = await healthService.checkHealth();
    
    // Set appropriate HTTP status code
    const statusCode = healthCheck.status === 'OK' ? 200 : 503;
    
    res.status(statusCode).json(healthCheck);
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
}