// Queries and small rules shared by the sol loop, the UI and the bots. No state is changed here
// except in the helpers marked "mutates" (they are only called on a clone inside the engine).
import type { Badge, Choice, CrewMember, Day, EffectiveJob, Forecast, GameEvent, GameState, Job, PickSpec, Plan, Problem, Storm, SystemId } from './types';
import { JOBS, SYSTEMS } from './types';
import { cardDef, cfg, chances, troubles, type Balance } from './content';

export const clone = <T>(o: T): T => structuredClone(o);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));
export const fmt2 = (v: number) => v.toFixed(2);
export const signed = (v: number) => (v > 0 ? '+' : '−') + fmt(Math.abs(v));
export const plural = (n: number, w: string) => fmt(n) + ' ' + w + (Math.abs(n - 1) < 1e-9 ? '' : 's');
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function dayAt(s: GameState, sol: number): Day | undefined { return s.schedule[sol - 1]; }
export function today(s: GameState): Day { return s.schedule[s.sol - 1]; }
export function crewById(s: GameState, id: string): CrewMember {
  const p = s.crew.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown crew member: ${id}`);
  return p;
}
export function isUnlocked(s: GameState, sys: SystemId): boolean { return s.sol >= cfg(s.mode).SYSTEMS[sys].unlockSol; }
export function isBlackout(s: GameState, sol = s.sol): boolean { return cfg(s.mode).BLACKOUT_SOLS.includes(sol); }
export function stormOn(s: GameState, sol = s.sol): (Storm & { mult: number }) | null {
  const d = dayAt(s, sol);
  if (!d || !d.storm) return null;
  return { ...d.storm, mult: cfg(s.mode).STORM_MULT_BY_DAY[d.storm.day] ?? 1 };
}
export function badgeOf(c: Balance, dose: number): Badge { return dose >= c.BADGE_RED_MSV ? 'red' : dose >= c.BADGE_AMBER_MSV ? 'amber' : 'green'; }
export function problemNeed(c: Balance, p: Problem): number {
  return Math.max(c.MIN_REPAIR_WORK, c.PROBLEMS[p.type].work + (p.severity - 1) * c.WORK_PER_SEVERITY - p.advice);
}
export function problemEffect(c: Balance, p: Problem): string {
  const d = c.PROBLEMS[p.type];
  if (d.airLeak) return 'air & water −' + d.airLeak * p.severity;
  if (d.growthFactor) return 'crops grow at x' + d.growthFactor[p.severity - 1];
  if (d.blocksRadio) return 'no radio';
  if (d.cellsLost) return '−' + plural(d.cellsLost * p.severity, 'cell');
  return '';
}
export function radioBlocked(s: GameState): boolean { const c = cfg(s.mode); return s.problems.some((p) => c.PROBLEMS[p.type].blocksRadio); }

export function currentEvent(s: GameState): GameEvent | null {
  const d = today(s);
  if (!d || !d.eventId || s.today.skipEvent) return null;
  if (d.kind === 'trouble') return { kind: 'trouble', id: d.eventId, ...troubles[d.eventId] };
  if (d.kind === 'chance') return { kind: 'chance', id: d.eventId, ...chances[d.eventId] };
  return null;
}
export function cellsAvailable(s: GameState): number {
  const ch = s.today.choice;
  return s.supply + (ch && ch.id === 'use_now' ? cfg(s.mode).WIND_BONUS_CELLS : 0);
}
export function planTotal(plan: Plan): number { return SYSTEMS.reduce((a, k) => a + (plan.cells[k] || 0), 0); }

export function jobAllowed(s: GameState, p: CrewMember, j: Job): { ok: boolean; why: string } {
  const c = cfg(s.mode);
  if (p.medbay > 0) return { ok: false, why: 'in the medbay' };
  if (s.sol < c.JOB_UNLOCK_SOL) return { ok: j === 'rest', why: 'jobs open on sol ' + c.JOB_UNLOCK_SOL };
  if (j === 'outside' && p.grounded) return { ok: false, why: 'red badge: stays inside' };
  if (j === 'lab' && !isUnlocked(s, 'lab')) return { ok: false, why: 'lab opens on sol ' + c.SYSTEMS.lab.unlockSol };
  return { ok: true, why: '' };
}

/** Makes any plan legal: locked systems get 0, cells never exceed the supply, jobs are allowed. */
export function sanitizePlan(s: GameState, plan: Plan): Plan {
  const c = cfg(s.mode);
  const cells = {} as Record<SystemId, number>, jobs: Record<string, Job> = {};
  for (const k of SYSTEMS) {
    let v = Math.floor(Number(plan.cells?.[k]) || 0);
    v = isUnlocked(s, k) ? clamp(v, 0, c.SYSTEMS[k].max) : 0;
    if (k === 'radio' && isBlackout(s)) v = 0;
    cells[k] = v;
  }
  let total = SYSTEMS.reduce((a, k) => a + cells[k], 0);
  const avail = cellsAvailable(s);
  // without a storm the shield does nothing, so it is trimmed first
  const order: SystemId[] = stormOn(s) ? c.TRIM_ORDER : ['shield', ...c.TRIM_ORDER.filter((k) => k !== 'shield')];
  for (const k of order) while (total > avail && cells[k] > 0) { cells[k]--; total--; }
  for (const p of s.crew) {
    let j = plan.jobs?.[p.id];
    if (!JOBS.includes(j) || !jobAllowed(s, p, j).ok) j = 'rest';
    jobs[p.id] = j;
  }
  return { cells, jobs };
}

/** Cells after the event choice (a blown fuse can turn a system dark). */
export function effectiveCells(s: GameState): Record<SystemId, number> {
  const cells = { ...s.plan.cells }, ch = s.today.choice;
  if (ch && s.today.revealed) {
    if (ch.id === 'dark_greenhouse') cells.greenhouse = 0;
    if (ch.id === 'dark_labradio') { cells.lab = 0; cells.radio = 0; }
  }
  return cells;
}

/** Jobs after the medbay and the event choice. */
export function effectiveJobs(s: GameState): Record<string, EffectiveJob> {
  const c = cfg(s.mode), out: Record<string, EffectiveJob> = {}, ev = currentEvent(s), ch = s.today.choice;
  for (const p of s.crew) {
    let j: EffectiveJob = s.plan.jobs[p.id] || 'rest';
    if (s.sol < c.JOB_UNLOCK_SOL) j = 'rest';
    if (j === 'outside' && p.grounded) j = 'rest';
    if (p.medbay > 0) j = 'medbay';
    out[p.id] = j;
  }
  if (ev && ch && s.today.revealed) {
    if (ch.job) for (const id of ch.crew) if (out[id] !== 'medbay') out[id] = ch.job;
    if (ev.id === 'solar_storm') {
      if (ch.id === 'shelter_all') for (const p of s.crew) if (out[p.id] !== 'medbay') out[p.id] = 'shelter';
      if (ch.id === 'indoors') for (const p of s.crew) if (out[p.id] === 'outside') out[p.id] = 'rest';
    }
    if (ev.id === 'sick_crew' && s.today.sickId) {
      if (ch.id === 'medbay_now') out[s.today.sickId] = 'medbay';
      if (ch.id === 'bed_rest') out[s.today.sickId] = 'rest';
    }
    if (ch.id === 'scan') {
      const sci = s.crew.find((p) => p.role === 'scientist');
      if (sci && out[sci.id] !== 'medbay') out[sci.id] = 'scan';
    }
  }
  return out;
}

/** Dose of one sol: d = total, extra = what the storm added above a normal day. */
export function doseFor(c: Balance, storm: { mult: number } | null, job: EffectiveJob, shieldCells: number): { d: number; extra: number } {
  const base = c.DOSE_INDOOR_PER_SOL, out = job === 'outside';
  if (!storm) return { d: base + (out ? c.DOSE_OUTSIDE_TRIP : 0), extra: 0 };
  if (out) { const d = (base + c.DOSE_OUTSIDE_TRIP) * storm.mult; return { d, extra: d - base - c.DOSE_OUTSIDE_TRIP }; }
  const gap = 1 - Math.min(1, shieldCells / c.SYSTEMS.shield.want);
  const exposure = gap * (job === 'shelter' || job === 'medbay' ? c.SHELTER_EXPOSURE : 1);
  const d = base * (1 + (storm.mult - 1) * exposure);
  return { d, extra: d - base };
}
export function workPower(c: Balance, p: CrewMember, kind: string): number {
  return c.JOB_OUTPUT[kind] * (c.SPECIALIST_OF[p.role] === kind ? c.SPECIALIST_MULT : 1) * (p.cond === 'tired' ? c.TIRED_EFFECT : 1) * (p.sick ? c.SICK_EFFECT : 1);
}
/** 1 = fresh, 0 = tired, ill or in the medbay. For the energy bar. */
export function energyOf(c: Balance, p: CrewMember): number {
  return p.medbay > 0 || p.sick || p.cond === 'tired' ? 0 : clamp(1 - p.heavyStreak / c.HEAVY_SOLS_TO_TIRED, 0, 1);
}

export function forecastFor(s: GameState, sol: number): Forecast {
  const d = s.schedule[sol - 1], st = stormOn(s, sol);
  return { sol, weather: d.weather, cells: cfg(s.mode).CELLS_BY_WEATHER[d.weather], storm: st ? st.mult : null };
}
export function knownForecast(s: GameState): Forecast[] {
  return s.known.filter((n) => n > s.sol).sort((a, b) => a - b).map((n) => forecastFor(s, n));
}

// ---------- mutating helpers (engine only, on a clone) ----------

export function addProblem(s: GameState, type: string): Problem {
  const old = s.problems.find((p) => p.type === type), c = cfg(s.mode);
  if (old) { old.severity = Math.min(c.PROBLEMS[type].maxSeverity, old.severity + 1); return old; }
  const p: Problem = { uid: ++s.uid, type, severity: 1, done: 0, age: 0, advice: 0 };
  s.problems.push(p);
  return p;
}
export function enterMedbay(s: GameState, p: CrewMember, steps: number, cause: string): void {
  p.medbay = steps; p.sick = false; p.sickRest = 0; p.heavyStreak = 0;
  if (!p.medbayCause) p.medbayCause = cause;
  s.plan.jobs[p.id] = 'rest';
}
export function findCard(s: GameState, id: string | null | undefined, say?: (t: string, why: string) => void, why = ''): boolean {
  if (!id || s.cards.found.includes(id)) return false;
  s.cards.found.push(id);
  if (say) say('Card found: ' + cardDef(id).title, why);
  return true;
}
export function know(s: GameState, sol: number): void {
  if (sol <= cfg(s.mode).MISSION_SOLS && !s.known.includes(sol)) s.known.push(sol);
}

// ---------- event choices: every one has a "+" and a "−" price ----------

export function eventChoices(s: GameState): Choice[] {
  const c = cfg(s.mode), ev = currentEvent(s), out: Choice[] = [];
  if (!ev || !s.today.revealed) return out;
  const free = s.crew.filter((p) => p.medbay <= 0), canOut = free.filter((p) => !p.grounded);
  const add = (id: string, label: string, plus: string, minus: string, extra: Partial<Choice> = {}) =>
    out.push({ id, label, plus, minus, pick: null, enabled: true, why: '', dose: null, ...extra });
  const outPick = (task: string, max: number): Partial<Choice> => ({ pick: { job: 'outside', task, min: 1, max }, enabled: canOut.length > 0, why: 'Nobody can go outside' });
  const inPick = (job: EffectiveJob, task: string, max: number): Partial<Choice> => ({ pick: { job, task, min: 1, max }, enabled: free.length > 0, why: 'Nobody is free' });

  if (ev.kind === 'trouble' && ev.problem) {
    const pr = s.problems.find((p) => p.type === ev.problem), pd = c.PROBLEMS[ev.problem], eff = pr ? problemEffect(c, pr) : '';
    if (pd.where === 'outside') add('fix_now', 'Send crew outside now', 'Fixed today with enough hands', 'They get extra dose and drop their jobs', outPick('repair', 2));
    else add('fix_now', 'Fix it now', 'Fixed today with enough hands', "They drop today's jobs", inPick('fix', 'repair', 2));
    add('tomorrow', 'Fix it tomorrow', "Today's plan stays. A fixer is set for tomorrow", 'Tonight: ' + eff + '. It may grow.');
    add('leave', 'Leave it', 'Costs nothing today', 'Every sol: ' + eff + '. It grows worse.');
  } else if (ev.id === 'solar_storm') {
    const st = stormOn(s), sh = effectiveCells(s).shield;
    const anyOut = s.crew.some((p) => p.medbay <= 0 && !p.grounded && s.plan.jobs[p.id] === 'outside');
    add('shelter_all', 'Everyone into the shelter', 'Less dose if the shield is weak', 'Nobody works today', { dose: doseFor(c, st, 'shelter', sh).d });
    add('indoors', 'Keep working indoors', 'Jobs go on inside', anyOut ? 'Outside trips are called off' : 'Dose depends on shield power', { dose: doseFor(c, st, 'rest', sh).d });
    if (anyOut) add('as_planned', 'Stick to the plan', 'Outside trips go ahead', 'Full storm dose outside', { dose: doseFor(c, st, 'outside', sh).d });
  } else if (ev.id === 'sick_crew' && s.today.sickId) {
    const p = crewById(s, s.today.sickId);
    add('medbay_now', p.name + ' goes to the medbay', 'Healed in ' + c.ILLNESS_MEDBAY_STEPS + ' sols, sooner with care', 'Out of work. No third star');
    add('bed_rest', p.name + ' rests in the bunk', 'No medbay if the rest goes on', 'Needs ' + c.SICK_REST_SOLS_TO_CURE + ' rest sols in a row');
    add('keep_working', p.name + ' keeps working', "Today's job gets done at half power", 'Medbay tonight, for ' + c.SICK_WORK_MEDBAY_STEPS + ' sols');
  } else if (ev.id === 'power_fault') {
    add('dark_greenhouse', 'Greenhouse goes dark today', 'Lab and radio keep power', 'Crops wait. ' + plural(s.plan.cells.greenhouse, 'cell') + ' lost');
    add('dark_labradio', 'Lab and radio go dark today', 'Crops keep growing', 'No science, no message. ' + plural(s.plan.cells.lab + s.plan.cells.radio, 'cell') + ' lost');
    add('rewire', 'Rewire it now', 'Nothing goes dark', 'One crew member drops their job', inPick('rewire', 'rewire', 1));
  } else if (ev.id === 'dust_storm') {
    add('cover', 'Send someone to tilt the panels', 'Panels stay clean after the storm', 'Extra dose. Job dropped', outPick('cover', 1));
    add('wait', 'Wait it out', 'Crew stays inside', 'Dusty panels later: fewer cells');
  } else if (ev.id === 'clean_wind') {
    add('use_now', 'Use the extra power today', '+' + c.WIND_BONUS_CELLS + ' cells today', 'Gone at sunset');
    add('polish', 'Send someone to polish the panels', '+' + c.WIND_POLISH_CELLS + ' cell for ' + c.WIND_POLISH_SOLS + ' sols', 'Extra dose. Job dropped', outPick('polish', 1));
    add('let_go', 'Let it go', 'Costs nothing', 'The panels get dusty again');
  } else if (ev.kind === 'chance') {
    const sci = s.crew.find((p) => p.role === 'scientist'), want = c.SYSTEMS.lab.want;
    const labOk = isUnlocked(s, 'lab') && s.plan.cells.lab >= want, sciOk = !!sci && sci.medbay <= 0;
    add('outside', 'Go outside for it', 'Discovery card and a sample', 'Extra dose. Job dropped', outPick('chance', 1));
    add('scan', 'Scan it from the lab', 'Discovery card, nobody goes outside', 'Needs ' + want + ' lab cells and ' + (sci ? sci.name : 'the scientist') + "'s day",
      { enabled: labOk && sciOk, why: !labOk ? 'The lab has no power. Go back to the plan.' : 'The scientist is in the medbay' });
    add('let_go', 'Let it go', 'Costs nothing', 'The chance is gone by morning');
  }
  return out;
}
export type { PickSpec };
