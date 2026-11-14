// Helpful default jobs (UI only, the engine is unchanged): a person the captain has not given a job
// this sol does their own light job when it is useful today, and rests otherwise.
// Heavy jobs (outside) are never chosen automatically, and tired or ill people keep resting.
import { applyPlan, cfg, type GameState, type Job } from '../engine';

function usefulJob(s: GameState, crewId: string): Job {
  const c = cfg(s.mode), p = s.crew.find((q) => q.id === crewId)!, cells = s.plan.cells;
  if (s.sol < c.JOB_UNLOCK_SOL || p.medbay > 0 || p.sick || p.cond === 'tired') return 'rest';
  switch (c.SPECIALIST_OF[p.role]) {
    case 'grow': return cells.greenhouse > 0 ? 'grow' : 'rest';
    case 'lab': return cells.lab > 0 && s.samples >= 1 ? 'lab' : 'rest';
    case 'care': return s.crew.some((q) => q.medbay > 0 || q.sick) ? 'care' : 'rest';
    case 'fix': return s.problems.some((pr) => c.PROBLEMS[pr.type].where === 'inside') ? 'fix' : 'rest';
    default: return 'rest'; // the pilot's job is outside: always the captain's choice
  }
}

/** Re-applies the default job for everyone not in `touched` (crew ids the player set by hand this sol). */
export function withAutoJobs(s: GameState, touched: string[]): GameState {
  if (s.phase !== 'plan') return s;
  const jobs = { ...s.plan.jobs };
  let changed = false;
  const c = cfg(s.mode);
  for (const p of s.crew) {
    if (touched.includes(p.id)) continue;
    // only people who are resting or already on their own job: a fixer set for today, or anyone sent outside, is left alone
    const now = jobs[p.id] || 'rest';
    if (now !== 'rest' && now !== c.SPECIALIST_OF[p.role]) continue;
    const j = usefulJob(s, p.id);
    if ((jobs[p.id] || 'rest') !== j) { jobs[p.id] = j; changed = true; }
  }
  return changed ? applyPlan(s, { ...s.plan, jobs }) : s;
}
