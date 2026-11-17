import {
  advanceHelper,
  helperLevel,
  helperWorkEnd,
  type HelperKind,
  type HelperState,
  type HelperTarget,
  type HelperTimer,
} from './helpers';
import type { Boost } from './magic-items';

/**
 * Advance one shared job chronologically. Applying capped potion and helper savings in
 * separate passes can finish a job too early; their extra rates must share the same clock.
 * The caller advances the potion's other timers and its global `applied` cursor separately.
 */
export function advanceBoostedHelper(
  kind: HelperKind,
  helper: HelperState,
  boost: Boost,
  multiplier: number,
  now: number,
  timerOf: (target: HelperTarget) => HelperTimer | undefined,
): ReturnType<typeof advanceHelper> {
  const timer = helper.job && timerOf(helper.job.target);
  if (!timer) return advanceHelper(kind, helper, now, timerOf);
  let result: ReturnType<typeof advanceHelper>;
  const record = (value: typeof result) => {
    if (value === 'ready' || (value === 'state' && result !== 'ready') || !result)
      result = value ?? result;
  };
  const potionStart = Math.max(boost.start, boost.applied);
  const potionEnd = Math.min(now, boost.end);
  let at = Math.min(now, boost.applied, helper.job!.applied);
  while (at < now) {
    const job = helper.job;
    const workEnd = job && helperWorkEnd(kind, helper)!;
    const helperRate =
      job && job.applied <= at && at < workEnd! ? helperLevel(kind, helper.level)!.multiplier : 0;
    const potionRate = at >= potionStart && at < potionEnd ? multiplier - 1 : 0;
    const boundaries = [now, potionStart, potionEnd];
    if (job) boundaries.push(job.applied, workEnd!, helper.readyAt ?? now);
    const until = Math.min(...boundaries.filter((value) => value > at));
    const rate = helperRate + potionRate;
    const end = timer.end;
    const done = end - rate * (until - at) <= until;
    const stop = done ? Math.max(at, Math.ceil((end + rate * at) / (1 + rate))) : until;
    const saved = rate > 0 ? Math.max(0, done ? end - stop : rate * (until - at)) : 0;
    if (saved > 0) {
      timer.move(saved);
      if (helperRate) helper.saved = (helper.saved ?? 0) + (saved * helperRate) / rate / 1000;
      record('progress');
    }
    if (job && helperRate) job.applied = done ? workEnd! : Math.min(until, workEnd!);
    // Completion also cancels a recurring assignment waiting for its next work day.
    if (done && helper.job) helper.job.applied = helperWorkEnd(kind, helper)!;
    record(advanceHelper(kind, helper, until, timerOf));
    at = until;
    if (done) break;
  }
  record(advanceHelper(kind, helper, now, timerOf));
  return result;
}
