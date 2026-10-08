import { log, setSetting } from './db';
import { env } from './env';
import { pollProcessing, publishDue, recoverInterrupted } from './publisher';
import { syncDue } from './sync';

type G = typeof globalThis & { __reelsWorker?: { timer: NodeJS.Timeout; ticks: number; busy: boolean } };

const TICK_MS = 30_000;

/** One scheduler pass: publish what's due, check processing uploads, refresh stats every ~5 minutes. */
export async function tick(opts: { sync?: boolean } = {}) {
  setSetting('worker.last_tick', new Date().toISOString());
  await publishDue();
  await pollProcessing();
  if (opts.sync) await syncDue();
}

export function startWorker() {
  const g = globalThis as G;
  if (g.__reelsWorker || !env.workerEnabled()) return;
  recoverInterrupted();
  const state = { ticks: 0, busy: false, timer: undefined as unknown as NodeJS.Timeout };
  state.timer = setInterval(async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      await tick({ sync: state.ticks % 10 === 0 });
    } catch (e) {
      log('error', `Планировщик: ${(e as Error).message}`);
    } finally {
      state.ticks++;
      state.busy = false;
    }
  }, TICK_MS);
  state.timer.unref?.();
  g.__reelsWorker = state;
  console.log('[reels] планировщик запущен: проверка очереди каждые 30 с');
}
