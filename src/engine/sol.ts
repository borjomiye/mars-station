// One sol = morning -> energy -> event -> evening. Pure functions: (state, decision) -> new state.
// Owner: P1. The UI, the simulator and the tests all call only these functions.
import type { Allocation, DonkiEvent, GameState, MessageCard } from './types';
import { SYSTEMS } from './types';
import { balance, findDonkiEvent, getEvent, getSite } from './content';
import { applyEffect, applyPending, availableCrew, clamp, effectiveCells, isChoiceAvailable, say } from './effects';
import { dailyDose, stormDamage } from './radiation';
import { deliverReply, send } from './comms';
import { computeStars } from './scoring';

const clone = (s: GameState): GameState => structuredClone(s);
const MAX_DONKI_LINES = 2;

function assertPhase(state: GameState, phase: GameState['phase']): void {
  if (state.phase !== phase) throw new Error(`Expected phase ${phase}, got ${state.phase}`);
}

const sepToday = (s: GameState) =>
  s.schedule[s.sol - 1].donkiEventIds.some((id) => findDonkiEvent(id)?.type === 'SEP');

/** Morning: solar power, crew back from jobs, deferred consequences, avatar briefing. */
export function startSol(prev: GameState): GameState {
  const s = clone(prev);
  s.phase = 'morning';
  s.todayExposure = 1;
  s.activeEventId = undefined;
  s.lastChoiceId = undefined;
  s.comms.incoming = undefined;
  for (const c of s.crew) {
    c.outsideToday = false;
    if (c.busyUntilSol !== undefined && c.busyUntilSol < s.sol) c.busyUntilSol = undefined;
  }

  const site = getSite(s.siteId);
  const dusty = s.station.dustSolsLeft > 0;
  const raw = balance.energy.baseCells * site.solarMult * (dusty ? balance.energy.dustMult : 1);
  s.resources.energy = Math.round(clamp(raw + s.energyModifier, 0, balance.energy.maxCells));
  s.energyModifier = 0;
  if (dusty) s.station.dustSolsLeft -= 1;

  say(s, { key: 'avatar.morning.hello', params: { sol: s.sol }, mood: 'happy', termKey: 'term.sol' });
  applyPending(s);

  // Real DONKI flares and plasma clouds are early warnings, not dose.
  // At most MAX_DONKI_LINES per morning, most important first (Mars-directed CME, X flare, ...).
  const rank = (e: DonkiEvent) => (e.marsImpact ? 0 : e.classType?.startsWith('X') ? 1 : e.type === 'CME' ? 2 : 3);
  const warnings = s.schedule[s.sol - 1].donkiEventIds
    .map(findDonkiEvent)
    .filter((e): e is DonkiEvent => e !== undefined && e.type !== 'SEP')
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_DONKI_LINES);
  for (const e of warnings) {
    if (e.type === 'FLR') say(s, { key: 'avatar.morning.flare', params: { flareClass: e.classType ?? '?', date: e.date }, mood: 'worried', sourceLink: e.link });
    if (e.type === 'CME') {
      say(s, { key: 'avatar.morning.cme', params: { speed: e.speed ?? '?', date: e.date }, mood: 'worried', sourceLink: e.link });
      if (e.marsImpact) say(s, { key: 'avatar.morning.cmeMars', mood: 'worried' });
    }
  }
  for (const f of s.comms.forecast) {
    if (f.sol === s.sol || f.sol === s.sol + 1) say(s, { key: 'avatar.morning.forecastStorm', params: { sol: f.sol }, mood: 'worried', termKey: 'term.sep' });
  }
  if (dusty) say(s, { key: 'avatar.morning.dust', mood: 'worried' });
  for (const c of s.crew) if (c.status === 'medbay') say(s, { key: 'avatar.morning.medbay', params: { name: c.nameKey }, mood: 'worried' });
  if (s.resources.lifeSupport < balance.lifeSupport.lowThreshold) say(s, { key: 'avatar.morning.lowAir', mood: 'worried' });
  if (s.resources.food < 20) say(s, { key: 'avatar.morning.lowFood', mood: 'worried' });
  return s;
}

export function beginEnergy(prev: GameState): GameState {
  assertPhase(prev, 'morning');
  const s = clone(prev);
  s.phase = 'energy';
  return s;
}

export function allocationValid(state: GameState, a: Allocation): boolean {
  const values = SYSTEMS.map((k) => a[k]);
  return values.every((v) => Number.isInteger(v) && v >= 0) && values.reduce((x, y) => x + y, 0) <= state.resources.energy;
}

export function allocateEnergy(prev: GameState, a: Allocation): GameState {
  assertPhase(prev, 'energy');
  if (!allocationValid(prev, a)) throw new Error('Invalid allocation');
  const s = clone(prev);
  s.allocation = { ...a };
  s.phase = 'event';
  const ev = getEvent(s.schedule[s.sol - 1].eventId);
  s.activeEventId = ev.id;
  say(s, { key: ev.titleKey, mood: ev.trigger ? 'worried' : 'calm', termKey: ev.termKey });
  return s;
}

/** Player picks a choice; then the day is calculated and the evening begins. */
export function resolveEvent(prev: GameState, choiceId: string): GameState {
  assertPhase(prev, 'event');
  const ev = getEvent(prev.activeEventId!);
  const choice = ev.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Unknown choice ${choiceId}`);
  if (!isChoiceAvailable(prev, choice)) throw new Error(`Choice ${choiceId} needs more free crew`);

  const s = clone(prev);
  s.lastChoiceId = choice.id;
  for (const e of choice.effects) applyEffect(s, e);
  say(s, { key: choice.outcomeKey, mood: 'calm' });
  return endOfDay(s);
}

function endOfDay(s: GameState): GameState {
  s.phase = 'evening';
  const crewCount = s.crew.length;
  const ls = balance.lifeSupport;

  // Resources
  const leak = (100 - s.station.hull) * ls.leakPerHullPoint;
  s.resources.lifeSupport = clamp(s.resources.lifeSupport + effectiveCells(s, 'lifeSupport') * ls.perCell - crewCount * ls.perCrewPerSol - leak);
  if (leak > 0) say(s, { key: 'avatar.evening.leak', mood: 'worried' });

  const productivity = availableCrew(s).length / crewCount; // busy crew can't farm
  s.resources.food = clamp(s.resources.food + effectiveCells(s, 'greenhouse') * balance.food.perCell * productivity - crewCount * balance.food.perCrewPerSol);

  // Radiation and health
  const sep = sepToday(s);
  const thinAir = s.resources.lifeSupport < ls.lowThreshold;
  const starving = s.resources.food <= 0;
  let doseShown = 0;
  for (const c of s.crew) {
    const dose = dailyDose(s, c, sep);
    c.doseMSv = Math.round((c.doseMSv + dose) * 100) / 100;
    doseShown = Math.max(doseShown, dose);
    let penalty = 0;
    if (sep) penalty += stormDamage(s, c);
    if (thinAir) penalty += ls.lowHealthPenalty;
    if (starving) penalty += balance.food.starvingHealthPenalty;

    if (c.status === 'medbay') {
      c.health = clamp(c.health + balance.health.medbayHealPerSol - penalty);
      if (c.health >= balance.health.medbayExitHealth) c.status = 'active';
      continue;
    }
    c.health = clamp(c.health - penalty + (penalty === 0 ? balance.health.dailyRecovery : 0));
    if (c.health <= 0) {
      c.status = 'medbay';
      c.busyUntilSol = undefined;
      s.medbayVisits += 1;
      say(s, { key: 'avatar.evening.medbay', params: { name: c.nameKey }, mood: 'worried' });
    }
  }
  const sepEvent = s.schedule[s.sol - 1].donkiEventIds.map(findDonkiEvent).find((e) => e?.type === 'SEP');
  if (sepEvent) say(s, { key: 'avatar.evening.sep', params: { date: sepEvent.date, dose: doseShown.toFixed(1) }, mood: 'worried', sourceLink: sepEvent.link, termKey: 'term.dose' });
  else say(s, { key: 'avatar.evening.normal', params: { dose: doseShown.toFixed(2) }, mood: 'calm', termKey: 'term.dose' });
  if (thinAir) say(s, { key: 'avatar.evening.thinAir', mood: 'worried' });
  if (starving) say(s, { key: 'avatar.evening.starving', mood: 'worried' });

  // Early end
  if (s.resources.lifeSupport <= 0) return endGame(s, 'failed', 'end.failed.lifeSupport');
  if (s.crew.every((c) => c.status === 'medbay')) return endGame(s, 'failed', 'end.failed.crew');

  deliverReply(s);
  return s;
}

function endGame(s: GameState, result: 'failed' | 'survived', reasonKey: string): GameState {
  s.phase = 'ended';
  s.outcome = { result, reasonKey, stars: computeStars(s, result === 'failed') };
  return s;
}

/** Evening: send one message (or null), then sleep. Next sol starts, or the ship arrives. */
export function sendMessageAndSleep(prev: GameState, card: MessageCard | null): GameState {
  assertPhase(prev, 'evening');
  const s = clone(prev);
  const lost = send(s, card);
  if (s.sol >= s.totalSols) return endGame(s, 'survived', 'end.survived');
  s.sol += 1;
  const next = startSol(s);
  // Tell the player next morning (the UI shows lines of the current sol only).
  if (lost) say(next, { key: 'reply.lost', mood: 'worried' });
  return next;
}
