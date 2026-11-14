// New game from a seed. Owner: P1.
import type { CrewMember, GameState, Role, SolPlan } from './types';
import { balance, donki, donkiEventsOnSol, events, sites } from './content';
import { mulberry32, pick, pickWeighted } from './rng';
import { startSol } from './sol';

export const SAVE_VERSION = 1;

const ROLES: Role[] = ['engineer', 'medic', 'botanist', 'scientist', 'pilot'];

/** Draws the whole mission from the seed: site, real DONKI period, event of every sol. */
export function buildSchedule(seed: number, periodId: string, totalSols: number): SolPlan[] {
  const rand = mulberry32(seed ^ 0x5eed);
  const deck = events.filter((e) => e.weight > 0 && !e.trigger);
  const quiet = events.find((e) => e.id === 'quiet_sol');
  const schedule: SolPlan[] = [];
  for (let sol = 1; sol <= totalSols; sol++) {
    const real = donkiEventsOnSol(periodId, sol);
    const hasSep = real.some((e) => e.type === 'SEP');
    let eventId: string;
    if (hasSep) eventId = 'radiation_storm';
    else if (sol === 1 && quiet) eventId = quiet.id; // calm first sol = tutorial
    else {
      const prev = schedule[schedule.length - 1]?.eventId;
      // no identical non-quiet events two sols in a row
      const options = deck.filter((e) => e.id === 'quiet_sol' || e.id !== prev);
      eventId = pickWeighted(rand, options).id;
    }
    schedule.push({ sol, eventId, donkiEventIds: real.map((e) => e.id) });
  }
  return schedule;
}

export function newGame(seed: number): GameState {
  const rand = mulberry32(seed);
  const site = pick(rand, sites);
  const period = pick(rand, donki.periods);
  const totalSols = balance.totalSols;

  const crew: CrewMember[] = ROLES.map((role) => ({
    id: role,
    nameKey: `crew.${role}`,
    role,
    health: balance.start.crewHealth,
    doseMSv: 0,
    status: 'active',
  }));

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    decisionRng: (seed * 2654435761) >>> 0,
    sol: 1,
    totalSols,
    phase: 'morning',
    siteId: site.id,
    periodId: period.id,
    schedule: buildSchedule(seed, period.id, totalSols),
    resources: { energy: 0, lifeSupport: balance.start.lifeSupport, food: balance.start.food },
    allocation: { lifeSupport: 0, shielding: 0, greenhouse: 0, comms: 0 },
    energyModifier: 0,
    station: { hull: balance.start.hull, dustSolsLeft: 0, broken: {} },
    crew,
    science: { collected: 0, sent: 0 },
    comms: { forecast: [], blackout: false },
    todayExposure: 1,
    pending: [],
    medbayVisits: 0,
    seenTerms: [],
    log: [],
  };
  return startSol(state);
}
