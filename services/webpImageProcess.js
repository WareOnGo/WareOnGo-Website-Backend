import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MIB = 1024 * 1024;
const WORKER = fileURLToPath(new URL('./webpImageWorker.js', import.meta.url));
const read = path => readFile(path, 'utf8').catch(() => null);
const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Working set excludes reclaimable file cache. Prefer the whole container so
// traffic, Prisma, and other processes count against Render's memory budget.
export async function imageMemoryUsage(pid, readText = read) {
  const childStat = pid ? await readText(`/proc/${pid}/status`) : null;
  const childRss = Number(/VmRSS:\s+(\d+)/.exec(childStat ?? '')?.[1] ?? 0) * 1024;
  for (const [usagePath, limitPath, statPath, inactiveKey] of [
    ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.stat', 'inactive_file'],
    ['/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.stat', 'total_inactive_file'],
  ]) {
    const [usage, limit, stats] = await Promise.all([readText(usagePath), readText(limitPath), readText(statPath)]);
    if (number(usage) && number(limit) && number(limit) < Number.MAX_SAFE_INTEGER) {
      const inactive = Number(new RegExp(`^${inactiveKey} (\\d+)$`, 'm').exec(stats ?? '')?.[1] ?? 0);
      return { used: Math.max(0, Number(usage) - inactive), limit: Number(limit), childRss, scope: 'container' };
    }
  }
  return { used: process.memoryUsage().rss + childRss, limit: 512 * MIB, childRss, scope: 'processes' };
}

const pressure = () => Object.assign(new Error('webp_memory_pressure'), { code: 'WEBP_MEMORY_PRESSURE' });
let preceding = Promise.resolve();

// Serialize decoders even if a manual CLI invocation parallelizes downloads.
// A worker crash/timeout becomes a failed photo, not an API process exit.
export async function convertImageFile(input, output, config, signal, {
  sampleMemory = imageMemoryUsage, timeoutMs = 30_000, monitorMs = 100, workerPath = WORKER,
} = {}) {
  const previous = preceding;
  let release;
  preceding = new Promise(resolve => { release = resolve; });
  try {
    await previous;
    signal.throwIfAborted();
    const before = await sampleMemory();
    // Reserve 160 MiB for the child plus 64 MiB for traffic/allocation spikes.
    if (before.used + 224 * MIB >= before.limit) throw pressure();
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--max-old-space-size=64', workerPath, input, output, String(config.width), String(config.quality)], {
        stdio: ['ignore', 'pipe', 'ignore'],
        // No application credentials or NODE_OPTIONS are inherited by the decoder.
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', UV_THREADPOOL_SIZE: '1', MALLOC_ARENA_MAX: '2' },
      });
      let result = '';
      let failure;
      let checking = false;
      let closed = false;
      const stop = error => { if (!closed) { failure ??= error; child.kill('SIGKILL'); } };
      const abort = () => stop(signal.reason ?? new Error('aborted'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timer = setTimeout(() => stop(new Error('source_worker_timeout')), timeoutMs);
      const monitor = setInterval(async () => {
        if (checking || closed || failure) return;
        checking = true;
        try {
          const memory = await sampleMemory(child.pid);
          if (closed || failure) return;
          if (memory.childRss > 160 * MIB) stop(new Error('source_worker_memory_limit'));
          else if (memory.used >= memory.limit * 0.75) stop(pressure());
        } catch { stop(new Error('source_memory_check_failed')); }
        finally { checking = false; }
      }, monitorMs);
      child.stdout.on('data', chunk => {
        result += chunk;
        if (result.length > 2048) stop(new Error('source_worker_invalid_response'));
      });
      child.on('error', () => { failure ??= new Error('source_worker_start_failed'); });
      child.on('close', (code, exitSignal) => {
        closed = true;
        clearTimeout(timer); clearInterval(monitor); signal.removeEventListener('abort', abort);
        // Do not release the gate or delete the image files until the process
        // has actually exited, including after cancellation or memory pressure.
        if (failure) return reject(failure);
        let message;
        try { message = JSON.parse(result); } catch { /* Native crash or incomplete output. */ }
        if (code === 0 && message?.ok === true && Number.isSafeInteger(message.bytes) && message.bytes > 0) return resolve(message);
        const reason = /^source_[a-z_]+$/.test(message?.reason ?? '') ? message.reason
          : `source_worker_exit_${exitSignal?.toLowerCase() ?? code ?? 'unknown'}`;
        reject(new Error(reason));
      });
    });
  } finally { release(); }
}
