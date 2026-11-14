// Engine invariants from the tech doc. Owner: P2.
import { describe, expect, it } from 'vitest';
import {
  allocateEnergy, allocationValid, beginEnergy, choiceHasCost, content, newGame, resolveEvent, sendMessageAndSleep,
} from '../src/engine';
import type { GameState } from '../src/engine';
import en from '../src/data/en.json';
import { bots, playGame } from '../scripts/bots';

const texts = en as Record<string, string>;

describe('determinism', () => {
  it('same seed + same decisions = same result', () => {
    for (const bot of bots) {
      expect(playGame(bot, 42)).toEqual(playGame(bot, 42));
    }
  });

  it('different decisions keep the same event schedule', () => {
    const a = newGame(7).schedule;
    const b = playGame(bots[0], 7).schedule;
    const c = playGame(bots[3], 7).schedule;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('rules', () => {
  it('rejects allocations above available energy', () => {
    const s = beginEnergy(newGame(1));
    const e = s.resources.energy;
    expect(allocationValid(s, { lifeSupport: e, shielding: 1, greenhouse: 0, comms: 0 })).toBe(false);
    expect(allocationValid(s, { lifeSupport: -1, shielding: 0, greenhouse: 0, comms: 0 })).toBe(false);
    expect(() => allocateEnergy(s, { lifeSupport: e + 1, shielding: 0, greenhouse: 0, comms: 0 })).toThrow();
  });

  it('meters stay within 0..100 in every phase', () => {
    const check = (s: GameState) => {
      for (const v of [s.resources.lifeSupport, s.resources.food, s.station.hull, ...s.crew.map((c) => c.health)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    };
    for (const bot of bots) {
      for (let seed = 1; seed <= 50; seed++) {
        let s = newGame(seed);
        while (s.phase !== 'ended') {
          s = beginEnergy(s);
          s = allocateEnergy(s, bot.allocate(s));
          check(s);
          s = resolveEvent(s, bot.choose(s, content.getEvent(s.activeEventId!)));
          check(s);
          if (s.phase === 'ended') break;
          s = sendMessageAndSleep(s, bot.message(s));
          check(s);
        }
      }
    }
  });
});

describe('data', () => {
  it('every choice in events.json has a cost (no free choices)', () => {
    for (const ev of content.events) {
      for (const choice of ev.choices) expect(choiceHasCost(choice), `${ev.id}/${choice.id}`).toBe(true);
    }
  });

  it('every DONKI event has a date and a source link', () => {
    for (const p of content.donki.periods) {
      for (const e of p.events) {
        expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.link).toMatch(/^https:\/\//);
      }
    }
  });

  it('every fact has a study and a link', () => {
    for (const f of content.facts.facts) {
      expect(f.study.length).toBeGreaterThan(0);
      expect(f.link).toMatch(/^https:\/\//);
    }
  });

  it('every text key used by events and the engine exists in en.json', () => {
    const keys = new Set<string>();
    for (const ev of content.events) {
      keys.add(ev.titleKey).add(ev.descKey);
      if (ev.termKey) keys.add(ev.termKey);
      for (const c of ev.choices) keys.add(c.labelKey).add(c.outcomeKey);
    }
    for (const s of content.sites) keys.add(s.nameKey);
    for (const bot of bots) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = playGame(bot, seed);
        for (const line of s.log) {
          keys.add(line.key);
          if (line.termKey) keys.add(line.termKey);
        }
        for (const c of s.crew) keys.add(c.nameKey);
        keys.add(s.outcome!.reasonKey);
      }
    }
    const missing = [...keys].filter((k) => !(k in texts));
    expect(missing).toEqual([]);
  });
});

describe('outcomes', () => {
  it('a game always ends, with 0-3 stars', () => {
    for (const bot of bots) {
      const s = playGame(bot, 3);
      expect(s.phase).toBe('ended');
      expect([0, 1, 2, 3]).toContain(s.outcome!.stars);
    }
  });

  it('not sending science reports caps the mission at 1 star', () => {
    for (let seed = 1; seed <= 30; seed++) expect(playGame(bots[0], seed).outcome!.stars).toBeLessThanOrEqual(1);
  });
});
