// THE CONTRACT. Every other part of the game (UI, data, scripts, tests) builds on these types.
// Rewritten for the greybox mechanics (5 systems, crew jobs, dose badges, problems, radio, album).

export type Mode = 'easy' | 'medium' | 'hard';
/** Difficulty levels, easiest first. All of them play the same Mars for the same mission name. */
export const MODES: Mode[] = ['easy', 'medium', 'hard'];
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
/** A real NASA photo for a card; the image file is src/assets/cards/<card id>.jpg. */
export type CardPhoto = { nasaId: string; alt: string; credit: string };
/** Album card. fact/source/link are resolved in content.ts (from the card itself or from facts.json). */
export type CardDef = { id: string; title: string; kind: CardKind; hint: string; fact: string; source: string; link: string; photo: CardPhoto };
/** ISS vs Mars dose per day in mSv, each with its NASA source (src/data/radlab-iss.json). */
export type DoseComparison = {
  stub: boolean;
  iss: { sixMonthsSolarMaxMSv: number; sixMonthsSolarMinMSv: number; perDayMSv: { min: number; max: number }; source: string; link: string };
  mars: { perDayMSv: number; period: string; source: string; link: string };
};
/** A space biology fact from NASA OSDR (src/data/facts.json). */
export type Fact = { id: string; osd: string; study: string; text: string; link: string };
export type CrewDef = { id: string; name: string; role: Role };

/** Changes to the balance numbers for one mission: `add` to a number or `set` a value; dotted paths reach inside objects. */
export type BalancePatch = { add?: Record<string, number>; set?: Record<string, number | boolean> };
/** A landing site (src/data/sites.json). The mission name picks it. */
export type SiteDef = { id: string; name: string; where: string; plus: string; minus: string; card: string; patch: BalancePatch };
/** A mission twist (src/data/twists.json): one gain with one price. */
export type TwistDef = { id: string; name: string; plus: string; minus: string; patch: BalancePatch };
export type TaskCheck = 'harvest' | 'samples' | 'cards' | 'report' | 'forecast' | 'airAbove' | 'noMedbay' | 'greenBadges';
/** A request from Mission Control (src/data/tasks.json). */
export type TaskDef = { id: string; check: TaskCheck; need: number; by: number; reward: number; text: string };
export type TaskState = { id: string; status: 'open' | 'done' | 'failed'; sol: number | null };

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
export type Morning = { lines: string[]; notes: string[]; answers: string[]; unlocked: string[]; words: string[]; news: string[] }; // news: Mission Control task results
export type RadioMessageId = 'forecast' | 'fix' | 'doctors' | 'science';
export type MessageOption = { id: RadioMessageId; label: string; plus: string; minus: string; enabled: boolean; why: string };
export type Forecast = { sol: number; weather: Weather; cells: number; storm: number | null };
export type GameEvent = { kind: 'trouble' | 'chance'; id: string; title: string; line: string; problem?: string; card?: string | null };

export type GameState = {
  version: number;
  name: string;            // "Brave Otter": shown to the player
  seed: string;            // normalised name; same seed = same Mars
  mode: Mode;
  siteId: string;          // landing site, picked by the mission name
  twistId: string;         // mission twist, picked by the mission name
  tasks: TaskState[];      // Mission Control requests for this mission
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
  cards: { found: string[]; sent: string[]; owned?: string[] }; // owned: already in the player's album when the mission started
  morning: Morning;
  lastResults: ResultLine[];
  log: SolRecord[];
  seenWords: string[];
  flags: { panelsCovered: boolean; prefill: string | null };
  counters: { airZero: number; foodZero: number; harvests: number; medbaySols: number; samples: number; airLow: number };
  over: { won: boolean; why: 'ship' | 'air' | 'food' } | null;
};

export type MissionReport = {
  won: boolean; why: string; sol: number; stars: [boolean, boolean, boolean]; starCount: number; hints: [string, string, string]; mattered: string;
  doses: { name: string; role: Role; dose: number; badge: Badge; trips: number; medbaySols: number }[];
  science: number; target: number; found: string[]; sent: string[]; real: (RealEvent & { sol: number })[];
};
