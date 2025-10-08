export type Rating = 0 | 1 | 2 | 3;

export interface SchedulerState {
  ivl_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_ts: number;
}

const ONE_DAY_MS = 86_400_000;

export function schedule(state: SchedulerState, rating: Rating, now: number = Date.now()): SchedulerState {
  let { ivl_days, ease, reps, lapses } = state;

  switch (rating) {
    case 0: {
      ivl_days = 1;
      ease = Math.max(1.3, ease - 0.2);
      lapses += 1;
      break;
    }
    case 1: {
      ivl_days = Math.max(1, Math.round(ivl_days * 0.5));
      ease = Math.max(1.3, ease - 0.15);
      break;
    }
    case 2: {
      ivl_days = Math.max(1, Math.round(ivl_days * ease));
      break;
    }
    case 3: {
      ease += 0.15;
      ivl_days = Math.max(1, Math.round(ivl_days * ease * 1.3));
      break;
    }
    default:
      throw new Error(`Unknown rating ${rating}`);
  }

  reps = Math.max(0, reps) + 1;

  const due_ts = now + ivl_days * ONE_DAY_MS;

  return { ivl_days, ease, reps, lapses, due_ts };
}
