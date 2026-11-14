// Applying effects from events.json, and the deferred-consequence queue. Owner: P1.
import type { Choice, CrewMember, Effect, GameState, LogEntry, SystemId } from './types';
import { balance } from './content';

export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Crew who can take a job today: not in medbay and not busy. */
export function availableCrew(state: GameState): CrewMember[] {
  return state.crew.filter((c) => c.status === 'active' && !(c.busyUntilSol !== undefined && c.busyUntilSol >= state.sol));
}

function crewNeeded(effect: Effect): number {
  if (effect.kind === 'eva' || effect.kind === 'busy') return effect.count;
  return 0;
}

export function isChoiceAvailable(state: GameState, choice: Choice): boolean {
  const needed = choice.effects.reduce((s, e) => s + crewNeeded(e), 0);
  return needed <= availableCrew(state).length;
}

/** Does this effect cost something? Used by tests: no choice may be free. */
export function isCost(effect: Effect): boolean {
  switch (effect.kind) {
    case 'lifeSupport':
    case 'food':
    case 'hull':
    case 'crewHealth':
    case 'science':
    case 'energyNextSol':
      return effect.delta < 0;
    case 'eva':
    case 'busy':
    case 'shelter':
    case 'dust':
    case 'systemBroken':
      return true;
    case 'schedule':
      return isCost(effect.effect);
  }
}

export function choiceHasCost(choice: Choice): boolean {
  return choice.effects.some(isCost);
}

/** Adds a log line; explains a term the first time it appears. Mutates state (call on a clone). */
export function say(state: GameState, entry: Omit<LogEntry, 'sol' | 'phase'>): void {
  const line: LogEntry = { sol: state.sol, phase: state.phase, ...entry };
  if (line.termKey) {
    if (state.seenTerms.includes(line.termKey)) delete line.termKey;
    else state.seenTerms.push(line.termKey);
  }
  state.log.push(line);
}

/** Applies one effect. Mutates state (call on a clone). */
export function applyEffect(state: GameState, effect: Effect): void {
  switch (effect.kind) {
    case 'lifeSupport':
      state.resources.lifeSupport = clamp(state.resources.lifeSupport + effect.delta);
      break;
    case 'food':
      state.resources.food = clamp(state.resources.food + effect.delta);
      break;
    case 'hull':
      state.station.hull = clamp(state.station.hull + effect.delta);
      break;
    case 'crewHealth':
      for (const c of state.crew) if (c.status === 'active') c.health = clamp(c.health + effect.delta);
      break;
    case 'science':
      state.science.collected = Math.max(0, state.science.collected + effect.delta);
      break;
    case 'energyNextSol':
      state.energyModifier += effect.delta;
      break;
    case 'eva':
      for (const c of availableCrew(state).slice(0, effect.count)) {
        c.busyUntilSol = state.sol;
        c.outsideToday = true;
      }
      break;
    case 'busy':
      for (const c of availableCrew(state).slice(0, effect.count)) c.busyUntilSol = state.sol + effect.sols - 1;
      break;
    case 'shelter':
      state.todayExposure = balance.radiation.shelterExposure;
      for (const c of state.crew) if (c.status === 'active') c.busyUntilSol = Math.max(c.busyUntilSol ?? 0, state.sol);
      break;
    case 'dust':
      state.station.dustSolsLeft = Math.max(state.station.dustSolsLeft, effect.sols);
      break;
    case 'systemBroken':
      state.station.broken[effect.system] = Math.max(state.station.broken[effect.system] ?? 0, state.sol + effect.sols - 1);
      break;
    case 'schedule':
      state.pending.push({ sol: state.sol + effect.inSols, effect: effect.effect, reasonKey: effect.reasonKey });
      break;
  }
}

/** Fires deferred consequences due this sol. */
export function applyPending(state: GameState): void {
  const due = state.pending.filter((p) => p.sol === state.sol);
  state.pending = state.pending.filter((p) => p.sol !== state.sol);
  for (const p of due) {
    applyEffect(state, p.effect);
    say(state, { key: 'avatar.morning.pending', params: { reason: p.reasonKey }, mood: 'worried' });
  }
}

/** Power cells that actually work in a system (broken systems run at half power). */
export function effectiveCells(state: GameState, system: SystemId): number {
  const cells = state.allocation[system];
  const brokenUntil = state.station.broken[system];
  return brokenUntil !== undefined && brokenUntil >= state.sol ? cells * balance.brokenSystemMult : cells;
}
