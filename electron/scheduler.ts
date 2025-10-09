export type Rating = 0 | 1 | 2 | 3;

export interface SchedulerState {
  // Review scheduling
  ivl_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_ts: number;
  // Adaptive fields
  learning_stage: number; // 0 = not in learning; otherwise 1..N
  difficulty: number; // 0..1 (hard..easy inversed)
  suspended: number; // 0 or 1
}

const ONE_MIN_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MIN_MS;
const ONE_DAY_MS = 86_400_000;

// Short “learning” steps for new/lapsed cards (minutes/hours)
const LEARNING_STEPS_MS = [10 * ONE_MIN_MS, 60 * ONE_MIN_MS] as const; // 10m, 1h

// Leech threshold: auto-suspend after this many lapses
const LEECH_LAPSES = 8;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function easeFromDifficulty(difficulty: number) {
  // Map difficulty [0..1] to ease roughly [1.3 .. 2.5]
  return clamp(2.5 - difficulty * 1.2, 1.3, 2.6);
}

export function schedule(
  state: SchedulerState,
  rating: Rating,
  now: number = Date.now(),
): SchedulerState {
  let { ivl_days, ease, reps, lapses, learning_stage, difficulty, suspended } = state;

  if (suspended) {
    // Keep suspended cards out of queue
    return { ...state };
  }

  // Difficulty drift (FSRS-inspired, simplified)
  if (rating === 0) difficulty = clamp(difficulty + 0.12, 0, 1);
  else if (rating === 1) difficulty = clamp(difficulty + 0.06, 0, 1);
  else if (rating === 2) difficulty = clamp(difficulty - 0.02, 0, 1);
  else if (rating === 3) difficulty = clamp(difficulty - 0.08, 0, 1);
  ease = easeFromDifficulty(difficulty);

  // Learning mode: short intervals in minutes/hours
  const inLearning = learning_stage > 0 || reps === 0;
  if (inLearning) {
    // Enter/continue learning steps
    if (rating === 0) {
      lapses += 1;
      learning_stage = 1; // restart learning
      const due_ts = now + LEARNING_STEPS_MS[0];
      if (lapses >= LEECH_LAPSES) {
        suspended = 1;
      }
      return {
        ivl_days: Math.max(1, ivl_days || 1),
        ease,
        reps: Math.max(0, reps),
        lapses,
        due_ts,
        learning_stage,
        difficulty,
        suspended,
      };
    }

    if (rating === 1 || rating === 2) {
      // If this is a brand‑new card (reps === 0) and we’re
      // entering learning via a non-fail rating, ensure we
      // mark it as being in learning so due queries include it.
      if (reps === 0 && learning_stage === 0) {
        learning_stage = 1;
      }
      // Stay on current step for hard, advance one step for good
      if (rating === 2) {
        learning_stage += 1;
      }
      if (learning_stage <= LEARNING_STEPS_MS.length) {
        const stepIdx = Math.max(0, learning_stage - 1);
        const due_ts = now + LEARNING_STEPS_MS[stepIdx];
        return {
          ivl_days: Math.max(1, ivl_days || 1),
          ease,
          reps: Math.max(0, reps),
          lapses,
          due_ts,
          learning_stage,
          difficulty,
          suspended,
        };
      }
      // Completed learning steps → graduate to day-scale
      learning_stage = 0;
      reps = Math.max(0, reps) + 1;
      ivl_days = 1;
      const due_ts = now + ONE_DAY_MS;
      return { ivl_days, ease, reps, lapses, due_ts, learning_stage, difficulty, suspended };
    }

    if (rating === 3) {
      // Easy can skip remaining learning steps and jump ahead a bit
      learning_stage = 0;
      reps = Math.max(0, reps) + 1;
      ivl_days = Math.max(1, Math.round(2 + 2 * ease));
      const due_ts = now + ivl_days * ONE_DAY_MS;
      return { ivl_days, ease, reps, lapses, due_ts, learning_stage, difficulty, suspended };
    }
  }

  // Review mode: day-scale intervals
  switch (rating) {
    case 0: {
      lapses += 1;
      learning_stage = 1; // relapse into learning
      const due_ts = now + LEARNING_STEPS_MS[0];
      if (lapses >= LEECH_LAPSES) {
        suspended = 1;
      }
      return {
        ivl_days: Math.max(1, Math.round(ivl_days * 0.5)),
        ease,
        reps,
        lapses,
        due_ts,
        learning_stage,
        difficulty,
        suspended,
      };
    }
    case 1: {
      ivl_days = Math.max(1, Math.round(ivl_days * (0.7 + 0.1 * difficulty)));
      break;
    }
    case 2: {
      ivl_days = Math.max(1, Math.round(ivl_days * (1.0 + ease * 0.5)));
      break;
    }
    case 3: {
      ivl_days = Math.max(1, Math.round(ivl_days * (1.2 + ease * 0.8)));
      break;
    }
    default:
      throw new Error(`Unknown rating ${rating}`);
  }

  reps = Math.max(0, reps) + 1;
  const due_ts = now + ivl_days * ONE_DAY_MS;
  return { ivl_days, ease, reps, lapses, due_ts, learning_stage, difficulty, suspended };
}
