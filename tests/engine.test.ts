// Engine rules, determinism, win/lose and a full simulated mission per mode.
import { describe, expect, it } from 'vitest';
import {
  MODES, addProblem, applyPlan, cardDef, cards, cfg, cellsAvailable, createMission, crewById, donki, endMission, enterMedbay, eventChoices, go, jobAllowed,
  planTotal, playSol, proceed, radioCanSend, sendMessage, startPlanning, wordCount,
  type GameState, type Job, type Plan, type SystemId,
} from '../src/engine';
import { balanceReport, botStep, runMission } from '../scripts/bots';

const C = cfg('medium');
const D0 = C.DOSE_INDOOR_PER_SOL;
const sched = (s: GameState) => s.schedule.map((d) => d.kind[0] + (d.eventId || '-') + d.weather[0] + (d.storm ? 'S' : '')).join(' ');

/** A clean lab mission without events, for single-rule checks. */
function mk(sol: number, edit?: (s: GameState) => void): GameState {
  const s = createMission('unit test', 'medium');
  for (const d of s.schedule) { d.kind = 'quiet'; d.eventId = null; d.storm = null; d.weather = 'clear'; d.real = []; }
  s.sol = sol; s.supply = 10; s.phase = 'plan';
  edit?.(s);
  return s;
}
const plan = (cells: Partial<Record<SystemId, number>> = {}, jobs: Record<string, Job> = {}): Plan => ({
  cells: { life: 3, shield: 0, greenhouse: 0, radio: 0, lab: 0, ...cells },
  jobs: { leo: 'rest', mei: 'rest', amara: 'rest', otto: 'rest', sam: 'rest', ...jobs },
});
const run = (s: GameState, p: Plan) => playSol(applyPlan(s, p)).state;
const stepSol = (s: GameState, p: Plan) => {
  let t = proceed(run(s, p));
  if (t.phase === 'radio') t = sendMessage(t, null);
  return startPlanning(t);
};
const storm = (s: GameState) => { s.schedule[5].storm = { day: 0, date: 'test', link: '' }; };
const dose = (s: GameState, id: string) => crewById(s, id).dose;

describe('same Mars for everyone', () => {
  it('same name + same choices = same result', () => {
    expect(JSON.stringify(runMission('Brave Otter', 'hard'))).toBe(JSON.stringify(runMission('Brave Otter', 'hard')));
  });
  it('the seed ignores case and the "Mission" prefix', () => {
    expect(sched(createMission('mission BRAVE  otter', 'easy'))).toBe(sched(createMission('Brave Otter', 'easy')));
  });
  it('different names give a different Mars', () => {
    expect(sched(createMission('Brave Otter', 'easy'))).not.toBe(sched(createMission('Quiet Falcon', 'easy')));
  });
  it('every mode plays the same Mars', () => {
    for (const m of MODES) expect(sched(createMission('Brave Otter', m))).toBe(sched(createMission('Brave Otter', 'easy')));
  });
});

describe('real NASA data', () => {
  it('DONKI data is not a stub and every record has a source link', () => {
    expect(donki.stub).toBe(false);
    for (const p of donki.periods) for (const e of p.events) expect(e.link).toMatch(/^https:\/\//);
  });
  it('every mission shows real DONKI events with their date and link', () => {
    for (let i = 0; i < 30; i++) {
      const s = createMission('real ' + i, 'easy'), real = s.schedule.flatMap((d) => d.real);
      expect(real.length).toBeGreaterThan(0);
      for (const e of real) { expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(e.link).toMatch(/^https:\/\//); }
    }
  });
  it('a solar storm in the game always comes from a real SEP record', () => {
    let storms = 0;
    for (let i = 0; i < 30; i++) for (const d of createMission('storm ' + i, 'easy').schedule) if (d.storm) {
      storms++;
      expect(d.storm.link).toMatch(/SEP/);
      expect(d.eventId).toBe('solar_storm');
    }
    expect(storms).toBeGreaterThan(0);
  });
});

describe('full missions played by bots', () => {
  it('invariants hold and the morning lines stay short', () => {
    for (const mode of MODES) for (let i = 0; i < 12; i++) {
      const prev: Record<string, number> = {};
      runMission('seed ' + i, mode, i % 2 ? 'careful' : 'sloppy', (t) => {
        const c = cfg(t.mode);
        expect(t.air).toBeGreaterThanOrEqual(0); expect(t.air).toBeLessThanOrEqual(c.TANK_MAX);
        expect(t.food).toBeGreaterThanOrEqual(0); expect(t.food).toBeLessThanOrEqual(c.TANK_MAX);
        expect(t.crop).toBeGreaterThanOrEqual(0); expect(t.crop).toBeLessThan(c.CROP_STEPS_TO_HARVEST);
        expect(planTotal(t.plan)).toBeLessThanOrEqual(cellsAvailable(t));
        for (const p of t.crew) { expect(p.dose).toBeGreaterThanOrEqual((prev[p.id] ?? 0) - 1e-9); prev[p.id] = p.dose; }
        for (const l of [...t.morning.lines, ...t.morning.notes, ...t.morning.answers]) expect(wordCount(l), l).toBeLessThanOrEqual(15);
      });
    }
  });
  it('a careful player brings the crew home in every mode', () => {
    for (const mode of MODES) for (let i = 0; i < 12; i++) {
      const s = runMission('home ' + i, mode);
      expect(s.phase).toBe('report');
      expect(s.sol).toBe(C.MISSION_SOLS);
      expect(endMission(s).stars[0]).toBe(true);
    }
  });
  it('neglect ends in an early return, and the report names the decision that mattered', () => {
    const s = runMission('Brave Otter', 'hard', 'lazy'), r = endMission(s);
    expect(r.won).toBe(false);
    expect(s.sol).toBeLessThan(C.MISSION_SOLS);
    expect(r.starCount).toBe(0);
    expect(r.mattered.length).toBeGreaterThan(10);
  });
  it('mistakes cost stars: sloppy play never beats careful play on average', () => {
    const b = balanceReport(20, ['careful', 'sloppy']);
    const avg = (k: string) => b[k].stars.reduce((a, n, i) => a + n * i, 0) / b[k].missions;
    expect(avg('sloppy / medium')).toBeLessThan(avg('careful / medium'));
  });
  it('every event choice has a price', () => {
    for (let i = 0; i < 12; i++) {
      let s = createMission('price ' + i, 'hard'), guard = 0;
      while (s.phase !== 'report' && guard++ < 400) {
        if (s.phase === 'event') for (const ch of eventChoices(s)) { expect(ch.minus.length, ch.id).toBeGreaterThan(3); expect(ch.plus.length, ch.id).toBeGreaterThan(3); }
        s = botStep(s, 'careful');
      }
    }
  });
});

describe('energy, air and food', () => {
  it('the botanist grows twice as well', () => {
    expect(run(mk(6), plan({ greenhouse: 1 }, { amara: 'grow' })).crop).toBeCloseTo(3);
    expect(run(mk(6), plan({ greenhouse: 1 }, { leo: 'grow' })).crop).toBeCloseTo(2);
  });
  it('in a dark greenhouse the crops wait', () => {
    expect(run(mk(6), plan({ greenhouse: 0 }, { amara: 'grow' })).crop).toBeCloseTo(0);
  });
  it('a full crop is harvested and the crew eats', () => {
    const s = run(mk(6, (t) => { t.crop = C.CROP_STEPS_TO_HARVEST - 1; t.food = 5; }), plan({ greenhouse: 3 }));
    expect(s.food).toBeCloseTo(5 + C.HARVEST_FOOD - C.FOOD_EATEN_PER_SOL);
    expect(s.crop).toBeCloseTo(2);
  });
  it('each missing life support cell costs air; an extra cell gives it back', () => {
    expect(run(mk(6), plan({ life: 1 })).air).toBeCloseTo(C.AIR_START - 2);
    expect(run(mk(6, (t) => { t.air = 5; }), plan({ life: 4 })).air).toBeCloseTo(6);
  });
  it('unused cells are lost at sunset', () => {
    const s = run(mk(6), plan());
    expect(s.lastResults.some((r) => r.t.includes('lost at sunset'))).toBe(true);
    expect(s.battery).toBe(0);
  });
  it('every result line names its cause', () => {
    const s = run(mk(6, (t) => { addProblem(t, 'hull_crack'); }), plan({ greenhouse: 2, life: 2 }, { sam: 'outside', amara: 'grow' }));
    for (const r of s.lastResults) expect(r.why.length, r.t).toBeGreaterThan(2);
  });
});

describe('trouble and repairs', () => {
  it('the engineer fixes a hull crack alone in one sol', () => {
    expect(run(mk(6, (t) => { addProblem(t, 'hull_crack'); }), plan({}, { leo: 'outside' })).problems).toHaveLength(0);
  });
  it('a non-engineer needs two sols, and the crack leaks meanwhile', () => {
    const s = run(mk(6, (t) => { addProblem(t, 'hull_crack'); }), plan({}, { sam: 'outside' }));
    expect(s.problems).toHaveLength(1);
    expect(s.problems[0].done).toBeCloseTo(1);
    expect(s.air).toBeCloseTo(C.AIR_START - 1);
  });
  it('trouble left alone grows', () => {
    const s = stepSol(stepSol(mk(6, (t) => { addProblem(t, 'hull_crack'); }), plan()), plan());
    expect(s.problems[0].severity).toBe(2);
    expect(s.air).toBeCloseTo(C.AIR_START - 2);
  });
});

describe('crew', () => {
  const tired = () => stepSol(stepSol(mk(6), plan({}, { sam: 'outside' })), plan({}, { sam: 'outside' }));
  it('two heavy sols in a row make a person tired', () => {
    expect(crewById(tired(), 'sam').cond).toBe('tired');
  });
  it('heavy work while tired ends in the medbay; a rest sol removes tired', () => {
    expect(crewById(run(tired(), plan({}, { sam: 'outside' })), 'sam').medbay).toBe(C.INJURY_MEDBAY_STEPS);
    expect(crewById(stepSol(tired(), plan({}, { sam: 'rest' })), 'sam').cond).toBe('fine');
  });
  it('fix with nothing broken is not heavy work', () => {
    const s = stepSol(stepSol(mk(6), plan({}, { leo: 'fix' })), plan({}, { leo: 'fix' }));
    expect(crewById(s, 'leo').cond).toBe('fine');
    expect(crewById(s, 'leo').heavyStreak).toBe(0);
  });
  it('the medic shortens a medbay stay', () => {
    const m = mk(6, (t) => { enterMedbay(t, crewById(t, 'leo'), 2, 'test'); });
    expect(crewById(run(m, plan({}, { mei: 'care' })), 'leo').medbay).toBe(0);
    expect(crewById(run(m, plan()), 'leo').medbay).toBe(1);
  });
});

describe('radiation', () => {
  it('storm + full shield: minimum dose inside', () => {
    expect(dose(run(mk(6, storm), plan({ shield: 3 })), 'leo')).toBeCloseTo(D0);
  });
  it('storm + no shield: the storm multiplier applies inside', () => {
    expect(dose(run(mk(6, storm), plan({ shield: 0 })), 'leo')).toBeCloseTo(D0 * C.STORM_MULT_BY_DAY[0]);
  });
  it('storm + outside: full storm dose despite the shield', () => {
    expect(dose(run(mk(6, storm), plan({ shield: 3 }, { sam: 'outside' })), 'sam')).toBeCloseTo((D0 + C.DOSE_OUTSIDE_TRIP) * C.STORM_MULT_BY_DAY[0]);
  });
  it('a normal trip outside adds the trip dose', () => {
    const s = run(mk(6), plan({}, { sam: 'outside' }));
    expect(dose(s, 'sam')).toBeCloseTo(D0 + C.DOSE_OUTSIDE_TRIP);
    expect(dose(s, 'leo')).toBeCloseTo(D0);
  });
  it('a red badge keeps a person inside', () => {
    const s = run(mk(6, (t) => { crewById(t, 'sam').dose = C.BADGE_RED_MSV - 0.5; }), plan({}, { sam: 'outside' }));
    expect(crewById(s, 'sam').grounded).toBe(true);
    expect(jobAllowed(s, crewById(s, 'sam'), 'outside').ok).toBe(false);
  });
});

describe('lab, science and radio', () => {
  it('the scientist turns a sample into a card in one sol; a half-powered lab works at half speed; a dark lab does nothing', () => {
    const ok = run(mk(6, (t) => { t.samples = 1; }), plan({ lab: 2 }, { otto: 'lab' }));
    expect(ok.cards.found).toContain('lab_1');
    expect(ok.samples).toBeCloseTo(0);
    const half = run(mk(6, (t) => { t.samples = 1; }), plan({ lab: 1 }, { otto: 'lab' }));
    expect(half.cards.found).not.toContain('lab_1');
    expect(half.labWork).toBeCloseTo(1);
    const dark = run(mk(6, (t) => { t.samples = 1; }), plan({ lab: 0 }, { otto: 'lab' }));
    expect(dark.labWork).toBeCloseTo(0);
  });
  it('science counts only when the report is sent', () => {
    const s = proceed(run(mk(6, (t) => { t.cards.found = ['layered_rock', 'lab_1']; }), plan({ radio: 1 })));
    expect(s.phase).toBe('radio');
    expect(s.science).toBe(0);
    expect(sendMessage(s, 'science').science).toBe(C.SCIENCE_PER_CARD.chance + C.SCIENCE_PER_CARD.lab + C.SCIENCE_PER_CARD.milestone);
  });
  it("Earth's forecast arrives next morning", () => {
    const f = sendMessage(proceed(run(mk(6), plan({ radio: 1 }))), 'forecast');
    expect(f.sol).toBe(7);
    expect(f.known).toEqual(expect.arrayContaining([8, 9]));
    expect(f.morning.answers).toHaveLength(1);
  });
  it('the radio is silent on the blackout sols', () => {
    for (const sol of C.BLACKOUT_SOLS) {
      const s = applyPlan(mk(sol), plan({ radio: 1 }));
      expect(s.plan.cells.radio).toBe(0);
      expect(radioCanSend(playSol(s).state)).toBe(false);
    }
  });
});

describe('data and state machine', () => {
  it('the album has 16 cards with a title and a hint', () => {
    expect(cards).toHaveLength(16);
    for (const k of cards) { expect(cardDef(k.id).title.length).toBeGreaterThan(2); expect(k.hint.length).toBeGreaterThan(2); }
  });
  it('illegal phase transitions are rejected', () => {
    expect(() => go(createMission('x', 'easy'), 'radio')).toThrow();
  });
});
