// Typed access to the JSON data files. Engine code reads data only through here.
import type { DonkiEvent, DonkiFile, DonkiPeriod, EventDef, Fact, Site } from './types';
import balanceJson from '../data/balance.json';
import eventsJson from '../data/events.json';
import donkiJson from '../data/donki-periods.json';
import sitesJson from '../data/sites.json';
import factsJson from '../data/facts.json';
import radlabJson from '../data/radlab-iss.json';

export const balance = balanceJson;
export type Balance = typeof balanceJson;
export const events = eventsJson.events as EventDef[];
export const donki = donkiJson as DonkiFile;
export const sites = sitesJson.sites as Site[];
export const facts = factsJson as { stub: boolean; facts: Fact[] };
export const radlab = radlabJson;

export function getEvent(id: string): EventDef {
  const e = events.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event: ${id}`);
  return e;
}

export function getSite(id: string): Site {
  const s = sites.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown site: ${id}`);
  return s;
}

export function getPeriod(id: string): DonkiPeriod {
  const p = donki.periods.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown DONKI period: ${id}`);
  return p;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day index (0-based) of a DONKI event inside its period. Sol = dayIndex + 1. */
export function dayIndex(period: DonkiPeriod, event: DonkiEvent): number {
  return Math.round((Date.parse(event.date) - Date.parse(period.start)) / DAY_MS);
}

export function donkiEventsOnSol(periodId: string, sol: number): DonkiEvent[] {
  const period = getPeriod(periodId);
  return period.events.filter((e) => dayIndex(period, e) === sol - 1);
}

export function findDonkiEvent(id: string): DonkiEvent | undefined {
  for (const p of donki.periods) {
    const e = p.events.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}
