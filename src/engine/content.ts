// Typed access to the JSON data files. Engine code reads data only through here.
import type { CardDef, CardKind, ChanceDef, Fact, CrewDef, DonkiEvent, DonkiFile, DonkiPeriod, Mode, ProblemDef, Role, SystemDef, SystemId, TroubleDef, Weather } from './types';
import balanceJson from '../data/balance.json';
import eventsJson from '../data/events.json';
import cardsJson from '../data/cards.json';
import factsJson from '../data/facts.json';
import textJson from '../data/en.json';
import donkiJson from '../data/donki-periods.json';

type Base = typeof balanceJson.base;
/** All balance numbers of one mode (base merged with the mode's overrides). */
export type Balance = Omit<Base, 'SYSTEMS' | 'PROBLEMS' | 'SPECIALIST_OF' | 'JOB_OUTPUT' | 'CELLS_BY_WEATHER' | 'SCIENCE_PER_CARD' | 'TRIM_ORDER'> & {
  SYSTEMS: Record<SystemId, SystemDef>;
  PROBLEMS: Record<string, ProblemDef>;
  SPECIALIST_OF: Record<Role, string>;
  JOB_OUTPUT: Record<string, number>;
  CELLS_BY_WEATHER: Record<Weather, number>;
  SCIENCE_PER_CARD: Record<CardKind, number>;
  TRIM_ORDER: SystemId[];
};

const merged: Record<Mode, Balance> = {
  easy: { ...balanceJson.base, ...balanceJson.modes.easy } as unknown as Balance,
  medium: { ...balanceJson.base, ...balanceJson.modes.medium } as unknown as Balance,
  hard: { ...balanceJson.base, ...balanceJson.modes.hard } as unknown as Balance,
};
export function cfg(mode: Mode): Balance {
  return merged[mode];
}
/** Mode-independent numbers (the schedule must be the same Mars in every mode). */
export const baseBalance = balanceJson.base as unknown as Balance;
export const botBalance = balanceJson.bot;

export const troubles = eventsJson.troubles as Record<string, TroubleDef>;
export const chances = eventsJson.chances as Record<string, ChanceDef>;
export const facts = factsJson.facts as Fact[];
type RawCard = Omit<CardDef, 'fact' | 'source' | 'link'> & { fact?: string; link?: string; factId?: string };
/** A card's fact is either its own (from the photo's NASA caption) or an OSDR fact from facts.json. */
function resolveCard(c: RawCard): CardDef {
  const { factId, ...rest } = c;
  if (factId) {
    const f = facts.find((x) => x.id === factId);
    if (!f) throw new Error(`Card ${c.id}: unknown fact ${factId}`);
    return { ...rest, fact: f.text, source: `NASA OSDR, ${f.osd}: ${f.study}`, link: f.link };
  }
  if (!c.fact || !c.link) throw new Error(`Card ${c.id}: needs fact + link or factId`);
  return { ...rest, fact: c.fact, source: `NASA Image Library, ${c.photo.nasaId}`, link: c.link };
}
export const cards = (cardsJson.cards as RawCard[]).map(resolveCard);
export const crewDefs = textJson.crew as CrewDef[];
export const words = textJson.words as Record<string, string>;
export const missionNames = { a: textJson.missionNameA, b: textJson.missionNameB };
export const donki = donkiJson as DonkiFile;

export function cardDef(id: string): CardDef {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
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
