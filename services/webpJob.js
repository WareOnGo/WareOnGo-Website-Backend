import { randomUUID } from 'node:crypto';

export const JOB_KEYS = ['maintenance:warehouse-webp:lock', 'maintenance:warehouse-webp:status', 'maintenance:warehouse-webp:cursor'];
const LEASE_SECONDS = 120;
const STATUS_SECONDS = 7 * 24 * 60 * 60;
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('job_store_timeout')), 8_000);
    })]);
  } finally { clearTimeout(timer); }
}
// These scripts keep status/cursor updates and lease ownership atomic across
// instances, including during rolling deploys. An expired owner cannot delete
// the next worker's lock or overwrite its progress.
export const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]); return 1
end
return 0`;
export const CHECKPOINT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('EXPIRE', KEYS[1], ARGV[2])
if ARGV[3] ~= '' then redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]) end
if ARGV[5] ~= '' then redis.call('SET', KEYS[3], ARGV[5]) end
return 1`;
export const FINISH = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('DEL', KEYS[1]); return 1`;

export function createWebpJob({ getRedis, run, schedule = fn => setImmediate(fn),
  heartbeatMs = 30_000, maxRunMs = 45 * 60_000, now = () => new Date().toISOString(), log = console }) {
  async function status() {
    const redis = await bounded(getRedis());
    const value = await bounded(redis.get(JOB_KEYS[1]));
    if (!value) return { status: 'idle' };
    const current = JSON.parse(value);
    if (['queued', 'running'].includes(current.status) && await bounded(redis.get(JOB_KEYS[0])) !== current.jobId) {
      return { ...current, status: 'interrupted', message: 'The worker stopped. The next trigger resumes from its saved cursor.' };
    }
    return current;
  }

  async function execute(redis, job) {
    const controller = new AbortController();
    let progress = {};
    let leaseBusy = false;
    const renew = async () => {
      if (leaseBusy || controller.signal.aborted) return;
      leaseBusy = true;
      try {
        const owned = await bounded(redis.eval(CHECKPOINT, { keys: JOB_KEYS,
          arguments: [job.jobId, String(LEASE_SECONDS), '', String(STATUS_SECONDS), ''] }));
        if (!owned) controller.abort(new Error('lease_lost'));
      } catch { controller.abort(new Error('lease_unavailable')); }
      finally { leaseBusy = false; }
    };
    const heartbeat = setInterval(() => { void renew(); }, heartbeatMs);
    const deadline = setTimeout(() => controller.abort(new Error('run_budget_reached')), maxRunMs);
    heartbeat.unref?.(); deadline.unref?.();
    try {
      const saved = Number(await bounded(redis.get(JOB_KEYS[2])) ?? 0);
      const startId = Number.isSafeInteger(saved) && saved >= 0 ? saved : 0;
      const onProgress = async (value) => {
        controller.signal.throwIfAborted();
        progress = value;
        const current = { ...job, status: 'running', updatedAt: now(), progress };
        const owned = await bounded(redis.eval(CHECKPOINT, { keys: JOB_KEYS,
          arguments: [job.jobId, String(LEASE_SECONDS), JSON.stringify(current), String(STATUS_SECONDS), String(value.cursor ?? startId)] }));
        if (!owned) { controller.abort(new Error('lease_lost')); controller.signal.throwIfAborted(); }
      };
      await onProgress({ cursor: startId });
      progress = await run({ startId, signal: controller.signal, onProgress });
      controller.signal.throwIfAborted();
      const finalStatus = !progress.complete || progress.failed || progress.stale ? 'partial' : 'succeeded';
      const finished = await bounded(redis.eval(FINISH, { keys: JOB_KEYS,
        arguments: [job.jobId, JSON.stringify({ ...job, status: finalStatus, finishedAt: now(), progress }), String(STATUS_SECONDS)] }));
      if (!finished) { controller.abort(new Error('lease_lost')); controller.signal.throwIfAborted(); }
      log.info('[warehouse-webp]', finalStatus, { jobId: job.jobId, ...progress });
    } catch {
      const reason = controller.signal.reason?.message;
      const finalStatus = reason === 'run_budget_reached' ? 'partial' : controller.signal.aborted ? 'interrupted' : 'failed';
      const message = finalStatus === 'partial' ? 'Time budget reached; the next daily trigger resumes from the saved cursor.'
        : 'Compression stopped; the next trigger retries unfinished photos.';
      try {
        await bounded(redis.eval(FINISH, { keys: JOB_KEYS, arguments: [job.jobId,
          JSON.stringify({ ...job, status: finalStatus, finishedAt: now(), message, progress }), String(STATUS_SECONDS)] }));
      } catch { /* The expiring lease makes an interrupted worker recoverable. */ }
      log.error('[warehouse-webp]', finalStatus, { jobId: job.jobId });
    } finally { clearInterval(heartbeat); clearTimeout(deadline); }
  }

  return {
    status,
    async start() {
      const redis = await bounded(getRedis());
      const job = { jobId: randomUUID(), status: 'queued', startedAt: now() };
      const acquired = await bounded(redis.eval(ACQUIRE, { keys: JOB_KEYS,
        arguments: [job.jobId, String(LEASE_SECONDS), JSON.stringify(job), String(STATUS_SECONDS)] }));
      if (!acquired) {
        const active = await status();
        return { status: 'already_running', jobId: active.jobId ?? null };
      }
      // This is the long-running Express server, not a serverless CMS function.
      // A restart may interrupt this task; per-warehouse DB writes and the Redis
      // cursor make the next daily invocation resume safely without a new cron.
      schedule(() => execute(redis, job));
      return { status: 'accepted', jobId: job.jobId };
    },
  };
}
