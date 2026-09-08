import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Both services already hold the same R2 secret. Derive a separate, one-purpose
// bearer credential; never send the underlying storage credential over HTTP.
export function compressionToken(secret) {
  return createHmac('sha256', secret.trim()).update('wareongo:warehouse-webp-trigger:v1').digest('hex');
}

export function createWebpRouter({ job, configured = () => true, secret = () => process.env.R2_SECRET_ACCESS_KEY }) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const key = secret()?.trim();
    if (!key) return res.status(503).json({ error: 'WebP compression is not configured.' });
    const bearer = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';
    const expected = Buffer.from(compressionToken(key));
    const provided = Buffer.from(bearer);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
  router.post('/', async (_req, res) => {
    try {
      if (!configured()) return res.status(503).json({ error: 'WebP compression is not configured.' });
      return res.status(202).json(await job.start());
    } catch { return res.status(503).json({ error: 'Could not start WebP compression.' }); }
  });
  router.get('/', async (_req, res) => {
    try { return res.json(await job.status()); }
    catch { return res.status(503).json({ error: 'Could not read WebP compression status.' }); }
  });
  return router;
}
