import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function createImageCacheRouter({ clearCache, secret = () => process.env.R2_SECRET_ACCESS_KEY }) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const key = secret()?.trim();
    if (!key) return res.status(503).json({ error: 'Image cache invalidation is not configured.' });
    const expected = Buffer.from(createHmac('sha256', key).update('wareongo:image-cache-invalidate:v1').digest('hex'));
    const supplied = Buffer.from(/^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Unauthorized' });
    try { await clearCache(); return res.json({ cleared: true }); }
    catch { return res.status(503).json({ error: 'Could not invalidate image cache.' }); }
  });
  return router;
}
