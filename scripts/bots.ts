// Test players. They use only the public engine API, like the UI does.
//  - careful: plays by the rules without mistakes (upper bound)
//  - sloppy:  same rules, but makes the mistakes a child makes (see balance.json "bot")
//  - lazy:    powers nothing useful, everyone rests (must lose)
import {
  applyPlan, backToPlan, botBalance, cellsAvailable, cfg, confirmPlan, createMission, currentEvent, endMission, eventChoices, hashString, isBlackout, isUnlocked,
  messageOptions, mulberry32, playSol, proceed, radioBlocked, resolveEvent, sendMessage, startPlanning, today, workPower,
  type BotStyle, type GameState, type Job, type Mode, type Plan, type RadioMessageId, type SystemId,
} from '../src/engine';

const B = botBalance;
const roll = (s: GameState, tag: string) => mulberry32(hashString(s.seed + ':' + s.sol + ':' + tag));

export function botPlan(s: GameState, style: BotStyle): Plan {
  const c = cfg(s.mode), day = today(s);
  const cells: Record<SystemId, number> = { life: 0, shield: 0, greenhouse: 0, radio: 0, lab: 0 }, jobs: Record<string, Job> = {};
  let left = cellsAvailable(s);
  const give = (k: SystemId, n: number) => {
    if (!isUnlocked(s, k)) return;
    const g = Math.max(0, Math.min(n, left, c.SYSTEMS[k].max - cells[k]));
    cells[k] += g; left -= g;
  };
  if (style === 'lazy') {
    give('shield', 3); give('lab', 2); give('radio', 1);
    for (const p of s.crew) jobs[p.id] = 'rest';
    return { cells, jobs };
  }
  const sl = style === 'sloppy', rr = roll(s, 'plan');
  give('life', sl && rr() < B.lifeShort ? c.SYSTEMS.life.want - 1 : c.SYSTEMS.life.want);
  if (day.storm && !(sl && rr() < B.forgetShield)) give('shield', c.SYSTEMS.shield.want);
  give('greenhouse', s.food <= 5 ? 3 : 2);
  if (!isBlackout(s) && !radioBlocked(s)) give('radio', 1);
  if (left >= c.SYSTEMS.lab.want && s.sol >= c.SYSTEMS.lab.unlockSol) give('lab', c.SYSTEMS.lab.want);
  give('greenhouse', 3);
  if (s.air < c.TANK_MAX - 1) give('life', 1);
  if (!sl) give('shield', 3);
  const inside = s.problems.some((p) => c.PROBLEMS[p.type].where === 'inside'), outside = s.problems.some((p) => c.PROBLEMS[p.type].where === 'outside');
  const ill = s.crew.some((p) => p.medbay > 0 || p.sick);
  for (const p of s.crew) {
    let j: Job = 'grow';
    const fit = (p.cond !== 'tired' || (sl && rr() < B.ignoreTired)) && (!p.sick || (sl && rr() < B.ignoreSick));
    const canOut = fit && !p.grounded && (!day.storm || (sl && rr() < B.stormTrip));
    const safeTrip = sl || p.dose + c.DOSE_INDOOR_PER_SOL * (c.MISSION_SOLS - s.sol + 1) + c.DOSE_OUTSIDE_TRIP < c.BADGE_AMBER_MSV;
    const skipFix = sl && rr() < B.skipRepair;
    if (!fit) j = 'rest';
    else if (p.role === 'engineer') j = inside && !skipFix ? 'fix' : outside && canOut && !skipFix ? 'outside' : 'grow';
    else if (p.role === 'medic') j = ill ? 'care' : 'grow';
    else if (p.role === 'scientist') j = cells.lab >= c.SYSTEMS.lab.want && s.samples >= 1 ? 'lab' : 'grow';
    else if (p.role === 'pilot') j = canOut && safeTrip && (sl || p.heavyStreak < 1) && s.sol >= c.SYSTEMS.lab.unlockSol ? 'outside' : 'grow';
    jobs[p.id] = j;
  }
  return { cells, jobs };
}

export function botChoice(s: GameState, style: BotStyle): [string, string[]] {
  const c = cfg(s.mode), ev = currentEvent(s), list = eventChoices(s).filter((x) => x.enabled);
  const lastId = (): [string, string[]] => { const l = list.filter((x) => !x.pick); return [l[l.length - 1].id, []]; };
  if (!ev || style === 'lazy') return lastId();
  if (style === 'sloppy' && roll(s, 'choice')() < B.skipChoice) return lastId(); // "I'll deal with it later"
  const has = (id: string) => list.some((x) => x.id === id);
  const fit = s.crew.filter((p) => p.medbay <= 0 && !p.sick && p.cond !== 'tired');
  const fixers = fit.slice().sort((a, b) => workPower(c, b, 'fix') - workPower(c, a, 'fix'));
  const safe = fit.filter((p) => !p.grounded && p.dose + c.DOSE_INDOOR_PER_SOL * (c.MISSION_SOLS - s.sol + 1) + c.DOSE_OUTSIDE_TRIP < c.BADGE_AMBER_MSV).sort((a, b) => a.dose - b.dose);
  if (ev.id === 'solar_storm') return ['indoors', []];
  if (ev.id === 'sick_crew') return ['bed_rest', []];
  if (ev.id === 'power_fault') return ['dark_labradio', []];
  if (ev.id === 'dust_storm') return ['wait', []];
  if (ev.id === 'clean_wind') return ['use_now', []];
  if (ev.kind === 'chance') {
    if (has('scan')) return ['scan', []];
    if (has('outside') && safe.length) return ['outside', [safe[0].id]];
    return ['let_go', []];
  }
  const fix = list.find((x) => x.id === 'fix_now');
  if (fix && fix.pick) {
    const pool = fix.pick.job === 'outside' ? fixers.filter((p) => !p.grounded) : fixers;
    return pool.length ? ['fix_now', [pool[0].id]] : ['tomorrow', []];
  }
  return lastId();
}

export function botMessage(s: GameState, style: BotStyle): RadioMessageId | null {
  if (style === 'lazy') return null;
  if (style === 'sloppy' && roll(s, 'msg')() < B.skipMessage) return null; // forgot the radio
  const c = cfg(s.mode), o = messageOptions(s), en = (id: RadioMessageId) => !!o.find((m) => m.id === id)?.enabled;
  const unsent = s.cards.found.filter((id) => !s.cards.sent.includes(id)).length;
  if (en('science') && (unsent >= 2 || s.sol >= c.MISSION_SOLS - 2)) return 'science';
  if (en('doctors')) return 'doctors';
  if (en('fix')) return 'fix';
  return 'forecast';
}

/** One step of the state machine, whatever the phase is. */
export function botStep(s: GameState, style: BotStyle): GameState {
  if (s.phase === 'briefing') return startPlanning(s);
  if (s.phase === 'plan') return confirmPlan(applyPlan(s, botPlan(s, style)));
  if (s.phase === 'event') {
    const [id, crew] = botChoice(s, style);
    let t = resolveEvent(s, id, crew);
    if (id === 'use_now') { const b = backToPlan(t); t = confirmPlan(applyPlan(b, botPlan(b, style))); }
    return playSol(t).state;
  }
  if (s.phase === 'results') return proceed(s);
  if (s.phase === 'radio') return sendMessage(s, botMessage(s, style));
  return s;
}

export function runMission(seed: string, mode: Mode, style: BotStyle = 'careful', hook?: (s: GameState) => void): GameState {
  let s = createMission(seed, mode), guard = 0;
  hook?.(s);
  while (s.phase !== 'report' && guard++ < 400) { s = botStep(s, style); hook?.(s); }
  return s;
}

export type BalanceRow = {
  missions: number; stars: [number, number, number, number]; reachedShip: number;
  avgScience: number; avgMinAir: number; avgMinFood: number; avgMaxDose: number; avgMedbaySols: number;
};
/** How many missions end with 0/1/2/3 stars, per bot and mode. */
export function balanceReport(n = 40, styles: BotStyle[] = ['careful', 'sloppy', 'lazy']): Record<string, BalanceRow> {
  const out: Record<string, BalanceRow> = {}, round = (v: number) => Math.round(v * 100) / 100;
  for (const style of styles) for (const mode of ['cadet', 'commander'] as Mode[]) {
    const a: BalanceRow = { missions: n, stars: [0, 0, 0, 0], reachedShip: 0, avgScience: 0, avgMinAir: 0, avgMinFood: 0, avgMaxDose: 0, avgMedbaySols: 0 };
    for (let i = 0; i < n; i++) {
      let minAir = 99, minFood = 99;
      const s = runMission('balance ' + i, mode, style, (t) => { minAir = Math.min(minAir, t.air); minFood = Math.min(minFood, t.food); });
      const r = endMission(s);
      a.stars[r.starCount]++;
      a.reachedShip += r.won ? 1 : 0;
      a.avgScience += r.science / n; a.avgMinAir += minAir / n; a.avgMinFood += minFood / n;
      a.avgMaxDose += Math.max(...s.crew.map((p) => p.dose)) / n; a.avgMedbaySols += s.counters.medbaySols / n;
    }
    a.avgScience = round(a.avgScience); a.avgMinAir = round(a.avgMinAir); a.avgMinFood = round(a.avgMinFood); a.avgMaxDose = round(a.avgMaxDose); a.avgMedbaySols = round(a.avgMedbaySols);
    out[style + ' / ' + mode] = a;
  }
  return out;
}
