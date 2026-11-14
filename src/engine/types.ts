// THE CONTRACT. Only the engine owner (P1) changes this file.
// Every other part of the game (UI, data, scripts, tests) builds on these types.

export type SystemId = 'lifeSupport' | 'shielding' | 'greenhouse' | 'comms';
export const SYSTEMS: SystemId[] = ['lifeSupport', 'shielding', 'greenhouse', 'comms'];
export type Allocation = Record<SystemId, number>;

export type Phase = 'morning' | 'energy' | 'event' | 'evening' | 'ended';
export type Role = 'engineer' | 'medic' | 'botanist' | 'scientist' | 'pilot';
export type Mood = 'calm' | 'worried' | 'happy';

// ---------- Data files (src/data/*.json) ----------

export type DonkiEventType = 'SEP' | 'FLR' | 'CME';

export type DonkiEvent = {
  id: string;            // DONKI id, e.g. sepID / flrID / activityID
  type: DonkiEventType;
  date: string;          // YYYY-MM-DD (UTC)
  time?: string;         // ISO timestamp as given by DONKI
  classType?: string;    // flares: C / M / X class, e.g. "M2.1"
  speed?: number;        // CME speed km/s (most accurate analysis)
  marsImpact?: boolean;  // CME: WSA-ENLIL model lists Mars among impacts
  link: string;          // page of this event in DONKI
};

export type DonkiPeriod = {
  id: string;
  start: string;         // YYYY-MM-DD, day 0 of the period = sol 1
  days: number;
  kind: 'calm' | 'stormy';
  events: DonkiEvent[];
};

export type DonkiFile = {
  stub: boolean;         // true = placeholder data, must be replaced before the demo
  generatedAt: string;
  source: string;
  periods: DonkiPeriod[];
};

export type Site = {
  id: string;
  nameKey: string;
  lat: number;
  lon: number;
  solarMult: number;     // multiplies base solar energy
  doseMult: number;      // < 1 for low plains (more atmosphere overhead)
  hasIce: boolean;
  image?: string;
  imageCredit?: string;
};

export type Fact = { id: string; textKey: string; study: string; link: string };

// Effects are data: events.json describes choices only through these.
export type Effect =
  | { kind: 'lifeSupport'; delta: number }
  | { kind: 'food'; delta: number }
  | { kind: 'hull'; delta: number }
  | { kind: 'crewHealth'; delta: number }           // every active crew member
  | { kind: 'science'; delta: number }              // collected (not yet sent)
  | { kind: 'energyNextSol'; delta: number }
  | { kind: 'eva'; count: number }                  // N crew go outside today: extra dose, busy today
  | { kind: 'busy'; count: number; sols: number }   // N crew busy inside (not in greenhouse)
  | { kind: 'shelter' }                             // whole crew hides in the storm shelter today
  | { kind: 'dust'; sols: number }                  // dust storm: less solar power for N sols
  | { kind: 'systemBroken'; system: SystemId; sols: number } // works at half power
  | { kind: 'schedule'; inSols: number; effect: Effect; reasonKey: string };

export type Choice = {
  id: string;
  labelKey: string;      // button text
  outcomeKey: string;    // what the avatar says after the choice
  effects: Effect[];
};

export type EventDef = {
  id: string;
  titleKey: string;
  descKey: string;
  weight: number;        // chance in the random deck; 0 = never drawn randomly
  trigger?: 'SEP';       // drawn only on days with a real DONKI SEP
  termKey?: string;      // term to explain the first time this event appears
  choices: Choice[];
};

// ---------- Game state ----------

export type MessageCard = 'forecast' | 'science_report';

export type Message = {
  card: MessageCard;
  sentSol: number;
  replyKey?: string;
  replyParams?: Record<string, string | number>;
};

export type CrewMember = {
  id: string;
  nameKey: string;
  role: Role;            // label only in the hackathon version (no role bonuses)
  health: number;        // 0..100
  doseMSv: number;       // accumulated dose
  status: 'active' | 'medbay';
  busyUntilSol?: number; // busy (repair, lab, EVA) up to and including this sol
  outsideToday?: boolean;
};

export type SolPlan = {
  sol: number;
  eventId: string;
  donkiEventIds: string[]; // real DONKI events on this day of the period
};

export type ScheduledEffect = { sol: number; effect: Effect; reasonKey: string };

export type LogEntry = {
  sol: number;
  phase: Phase;
  key: string;           // en.json key
  params?: Record<string, string | number>;
  mood: Mood;
  termKey?: string;      // explain this term (first time only)
  sourceLink?: string;   // NASA source shown next to the line
};

export type GameState = {
  version: number;
  seed: number;
  decisionRng: number;   // state of the second RNG (outcomes that depend on choices)
  sol: number;
  totalSols: number;
  phase: Phase;
  siteId: string;
  periodId: string;
  schedule: SolPlan[];
  resources: { energy: number; lifeSupport: number; food: number };
  allocation: Allocation;
  energyModifier: number;  // applied to the next sol's energy, then reset
  station: { hull: number; dustSolsLeft: number; broken: Partial<Record<SystemId, number>> };
  crew: CrewMember[];
  science: { collected: number; sent: number };
  comms: {
    outgoing?: Message;    // sent this or a previous evening, waiting for a reply
    incoming?: Message;    // the reply that arrived this evening
    forecast: { sol: number; type: DonkiEventType }[]; // what Earth told us is coming
    blackout: boolean;
  };
  todayExposure: number;   // 1 = normal, shelter lowers it
  activeEventId?: string;
  lastChoiceId?: string;
  pending: ScheduledEffect[];
  medbayVisits: number;
  seenTerms: string[];
  log: LogEntry[];
  outcome?: { result: 'failed' | 'survived'; reasonKey: string; stars: 0 | 1 | 2 | 3 };
};
