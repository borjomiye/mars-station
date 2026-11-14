// Radiation model. Owner: P2.
// D_sol = D_background x k_site x k_event x (1 - shield) x k_exposure
// Background dose: Curiosity RAD (see balance.json radiation._source). SEP multiplier and
// storm health damage are game values, explained on the "Where the data comes from" screen.
import type { CrewMember, GameState } from './types';
import { balance, getSite } from './content';
import { effectiveCells } from './effects';

const r = balance.radiation;

export function shieldFraction(state: GameState): number {
  return Math.min(balance.shielding.max, effectiveCells(state, 'shielding') * balance.shielding.perCell);
}

export function exposureOf(state: GameState, member: CrewMember): number {
  return member.outsideToday ? r.evaMult : state.todayExposure;
}

export function dailyDose(state: GameState, member: CrewMember, sepToday: boolean): number {
  const site = getSite(state.siteId);
  const k = sepToday ? r.sepDoseMult : 1;
  return r.backgroundMSvPerSol * site.doseMult * k * (1 - shieldFraction(state)) * exposureOf(state, member);
}

/** Acute health loss on a radiation storm day (game simplification). */
export function stormDamage(state: GameState, member: CrewMember): number {
  return r.stormHealthDamage * (1 - shieldFraction(state)) * exposureOf(state, member);
}
