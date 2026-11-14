// THE CONTRACT. Every other part of the game (UI, data, scripts, tests) builds on these types.
// Rewritten for the greybox mechanics (5 systems, crew jobs, dose badges, problems, radio, album).

export type Mode = 'cadet' | 'commander';
export type SystemId = 'life' | 'shield' | 'greenhouse' | 'radio' | 'lab';
export const SYSTEMS: SystemId[] = ['life', 'shield', 'greenhouse', 'radio', 'lab'];
export type Job = 'grow' | 'fix' | 'outside' | 'lab' | 'care' | 'rest';
export const JOBS: Job[] = ['grow', 'fix', 'outside', 'lab', 'care', 'rest'];
/** What a person really does today, after the medbay and the event choice are applied. */
export type EffectiveJob = Job | 'medbay' | 'shelter' | 'scan' | 'rewire' | 'idle';
export type Role = 'engineer' | 'medic' | 'botanist' | 'scientist' | 'pilot';
export type Phase = 'briefing' | 'plan' | 'event' | 'results' | 'radio' | 'report';
export type Weather = 'clear' | 'hazy' | 'dust';
export type DayKind = 'intro' | 'quiet' | 'trouble' | 'chance' | 'ship';
export type CardKind = 'chance' | 'lab' | 'milestone';
export type Badge = 'green' | 'amber' | 'red';
export type BotStyle = 'careful' | 'sloppy' | 'lazy';

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

export type SystemDef = { name: string; want: number; max: number; unlockSol: number };
export type ProblemDef = {
  name: string; where: 'inside' | 'outside'; work: number; airLeak: number; growEvery: number; maxSeverity: number; airOnFix: number;
  growthFactor?: number[]; blocksRadio?: boolean; cellsLost?: number;
};
export type TroubleDef = { title: string; line: string; problem?: string };
export type ChanceDef = { title: string; line: string; card: string | null };
export type CardDef = { id: string; title: string; kind: CardKind; hint: string };
export type CrewDef = { id: string; name: string; role: Role };

// ---------- Game state ----------

/** A real DONKI record shown to the player, with its date and source link. */
export type RealEvent = { id: string; type: DonkiEventType; date: string; label: string; note: string; link: string };
export type Storm = { day: number; date: string; link: string };

export type Day = {
  sol: number;
  kind: DayKind;
  eventId: string | null;
  weather: Weather;
  storm: Storm | null;     // solar particle storm (from a real DONKI SEP)
  real: RealEvent[];       // real DONKI records of this day, most important first
  sickIdx: number;         // pre-rolled: who feels ill if the event is sick_crew
};

export type CrewMember = {
  id: string;
  name: string;
  role: Role;
  cond: 'fine' | 'tired';
  sick: boolean;
  sickRest: number;
  medbay: number;          // healing steps left; 0 = not in the medbay
  medbaySols: number;
  medbayCause: string;
  dose: number;            // mSv, only grows
  stormExtra: number;      // dose above normal taken in storms
  trips: number;
  heavyStreak: number;
  grounded: boolean;       // red badge: stays inside
};

export type Problem = { uid: number; type: string; severity: number; done: number; age: number; advice: number; fixed?: boolean; by?: string[] };
export type Plan = { cells: Record<SystemId, number>; jobs: Record<string, Job> };
export type PickSpec = { job: EffectiveJob; task: string; min: number; max: number };
export type Choice = { id: string; label: string; plus: string; minus: string; pick: PickSpec | null; enabled: boolean; why: string; dose: number | null };
export type ChosenChoice = { id: string; crew: string[]; job: EffectiveJob | null; task: string | null; label: string };
export type ResultLine = { t: string; why: string };
export type SolRecord = {
  sol: number; supply: number; cells: Record<SystemId, number>; jobs: Record<string, EffectiveJob>;
  air: { d: number; key: string }[]; harvests: number; choice: string | null;
};
export type Morning = { lines: string[]; notes: string[]; answers: string[]; unlocked: string[]; words: string[] };
export type RadioMessageId = 'forecast' | 'fix' | 'doctors' | 'science';
export type MessageOption = { id: RadioMessageId; label: string; plus: string; minus: string; enabled: boolean; why: string };
export type Forecast = { sol: number; weather: Weather; cells: number; storm: number | null };
export type GameEvent = { kind: 'trouble' | 'chance'; id: string; title: string; line: string; problem?: string; card?: string | null };

export type GameState = {
  version: number;
  name: string;            // "Brave Otter": shown to the player
  seed: string;            // normalised name; same seed = same Mars
  mode: Mode;
  periodId: string;        // real DONKI period this mission lives through
  sol: number;
  phase: Phase;
  air: number;
  food: number;
  crop: number;
  samples: number;
  labWork: number;
  science: number;
  crew: CrewMember[];
  problems: Problem[];
  uid: number;
  schedule: Day[];
  supply: number;
  supplyNotes: string[];
  battery: number;
  panelBoost: { cells: number; until: number } | null;
  plan: Plan;
  today: { revealed: boolean; choice: ChosenChoice | null; sickId: string | null; skipEvent: boolean; before: { air: number; food: number; crop: number; science: number } | null };
  radio: { queue: { id: RadioMessageId; sol: number }[]; sent: number };
  known: number[];         // sols the player has a forecast for
  cards: { found: string[]; sent: string[] };
  morning: Morning;
  lastResults: ResultLine[];
  log: SolRecord[];
  seenWords: string[];
  flags: { panelsCovered: boolean; prefill: string | null };
  counters: { airZero: number; foodZero: number; harvests: number; medbaySols: number };
  over: { won: boolean; why: 'ship' | 'air' | 'food' } | null;
};

export type MissionReport = {
  won: boolean; why: string; sol: number; stars: [boolean, boolean, boolean]; starCount: number; hints: [string, string, string]; mattered: string;
  doses: { name: string; role: Role; dose: number; badge: Badge; trips: number; medbaySols: number }[];
  science: number; target: number; found: string[]; sent: string[]; real: (RealEvent & { sol: number })[];
};
