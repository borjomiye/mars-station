// Bots that play the engine without UI. Used by scripts/simulate.ts and tests. Owner: P2.
import type { Allocation, EventDef, GameState, MessageCard } from '../src/engine';
import {
  allocateEnergy, availableCards, beginEnergy, content, isChoiceAvailable, newGame, resolveEvent, sendMessageAndSleep,
} from '../src/engine';

export type Bot = {
  name: string;
  allocate(s: GameState): Allocation;
  choose(s: GameState, ev: EventDef): string;
  message(s: GameState): MessageCard | null;
};

/** Fill systems in priority order, each up to its wanted amount. */
function fill(energy: number, wants: [keyof Allocation, number][]): Allocation {
  const a: Allocation = { lifeSupport: 0, shielding: 0, greenhouse: 0, comms: 0 };
  let left = energy;
  for (const [k, n] of wants) {
    const take = Math.min(n, left);
    a[k] += take;
    left -= take;
  }
  return a;
}

function firstAvailable(s: GameState, ev: EventDef, preferred: string[]): string {
  for (const id of preferred) {
    const c = ev.choices.find((x) => x.id === id);
    if (c && isChoiceAvailable(s, c)) return id;
  }
  return ev.choices.find((c) => isChoiceAvailable(s, c))!.id;
}

const stormExpected = (s: GameState) => s.comms.forecast.some((f) => f.sol === s.sol);

export const bots: Bot[] = [
  {
    name: 'do-nothing',
    allocate: (s) => fill(s.resources.energy, [['lifeSupport', 4], ['greenhouse', 3], ['shielding', 99]]),
    choose: (s, ev) => firstAvailable(s, ev, ['shelter', 'wait_inside', 'ignore', 'live_with_it', 'lab_work']),
    message: () => null,
  },
  {
    name: 'max-shielding',
    allocate: (s) => fill(s.resources.energy, [['lifeSupport', 3], ['greenhouse', 2], ['shielding', 99]]),
    choose: (s, ev) => firstAvailable(s, ev, ['shelter', 'wait_inside', 'fix_now', 'repair_now', 'lab_work']),
    message: (s) => (availableCards(s).includes('science_report') ? 'science_report' : null),
  },
  {
    name: 'never-shield',
    allocate: (s) => fill(s.resources.energy, [['lifeSupport', 4], ['comms', 1], ['greenhouse', 99]]),
    choose: (s, ev) => firstAvailable(s, ev, ['keep_working', 'eva_samples', 'brush_panels', 'fix_now', 'repair_now']),
    message: (s) => (availableCards(s).includes('science_report') ? 'science_report' : null),
  },
  {
    // Isolates the shielding decision: zero cells in shielding, but always uses the shelter.
    // If this bot gets 3 stars often, the shield system has no teeth (balance task).
    name: 'shelter-no-shield',
    allocate: (s) => fill(s.resources.energy, [['lifeSupport', 4], ['comms', 1], ['greenhouse', 99]]),
    choose: (s, ev) => firstAvailable(s, ev, ['shelter', 'fix_now', 'repair_now', 'brush_panels', 'eva_samples', 'lab_work']),
    message: (s) => {
      const cards = availableCards(s);
      if (cards.includes('science_report') && (s.science.collected >= 2 || s.sol >= s.totalSols - 1)) return 'science_report';
      return cards.includes('forecast') ? 'forecast' : null;
    },
  },
  {
    name: 'sensible',
    allocate: (s) =>
      stormExpected(s)
        ? fill(s.resources.energy, [['lifeSupport', 4], ['shielding', 4], ['comms', 1], ['greenhouse', 99]])
        : fill(s.resources.energy, [['lifeSupport', 4], ['comms', 1], ['greenhouse', 3], ['shielding', 99]]),
    choose: (s, ev) => firstAvailable(s, ev, ['shelter', 'fix_now', 'repair_now', 'brush_panels', 'eva_samples', 'lab_work']),
    message: (s) => {
      const cards = availableCards(s);
      // Report every other evening, ask for the forecast otherwise.
      if (cards.includes('science_report') && (s.science.collected >= 2 || s.sol >= s.totalSols - 1)) return 'science_report';
      return cards.includes('forecast') ? 'forecast' : null;
    },
  },
];

export function playGame(bot: Bot, seed: number): GameState {
  let s = newGame(seed);
  while (s.phase !== 'ended') {
    s = beginEnergy(s);
    s = allocateEnergy(s, bot.allocate(s));
    const ev = content.getEvent(s.activeEventId!);
    s = resolveEvent(s, bot.choose(s, ev));
    if (s.phase === 'ended') break;
    s = sendMessageAndSleep(s, bot.message(s));
  }
  return s;
}
