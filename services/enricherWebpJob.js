import { createHmac } from 'node:crypto';

const ENDPOINT = 'https://wareongo-cronjobs.duckdns.org/maintenance/webp';

export function createEnricherWebpJob({ request = fetch, secret = () => process.env.R2_SECRET_ACCESS_KEY } = {}) {
  async function call(method) {
    const key = secret()?.trim();
    if (!key) throw new Error('enricher_not_configured');
    const token = createHmac('sha256', key).update('wareongo:warehouse-webp-trigger:v1').digest('hex');
    const response = await request(ENDPOINT, { method, redirect: 'error',
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (response.status !== (method === 'POST' ? 202 : 200)) throw new Error('enricher_unavailable');
    const body = await response.json();
    if (method === 'POST' && (!['accepted', 'already_running'].includes(body?.status)
      || typeof body?.jobId !== 'string' || !body.jobId)) throw new Error('enricher_invalid_acknowledgement');
    if (method === 'GET' && (typeof body !== 'object' || body === null || typeof body.status !== 'string')) throw new Error('enricher_invalid_status');
    return body;
  }
  return { start: () => call('POST'), status: () => call('GET') };
}
