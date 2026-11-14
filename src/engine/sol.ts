// One sol = briefing -> plan -> event -> results -> radio. Pure functions: (state, decision) -> new state.
// Same mission name + same choices = same result: nothing here rolls dice.
import type { ChosenChoice, CrewMember, EffectiveJob, Forecast, GameState, MessageOption, Mode, Morning, Phase, Plan, RadioMessageId, RealEvent, ResultLine, SolRecord, Storm } from './types';
import { SYSTEMS } from './types';
import { cardDef, cards, cfg, crewDefs, words } from './content';
import { buildSchedule, normSeed, prettyName } from './schedule';
import {
  addProblem, badgeOf, cellsAvailable, clamp, clone, crewById, currentEvent, dayAt, doseFor, effectiveCells, effectiveJobs, enterMedbay, eventChoices,
  findCard, fmt, isBlackout, isUnlocked, jobAllowed, know, knownForecast, planTotal, plural, problemNeed, r3, radioBlocked, sanitizePlan, signed, stormOn, today, workPower,
} from './rules';

export const SAVE_VERSION = 2;

/** The sol state machine: which phase may follow which. */
export const TRANSITIONS: Record<Phase, Phase[]> = {
  briefing: ['plan'],
  plan: ['event', 'results'],
  event: ['plan', 'results'],
  results: ['radio', 'briefing', 'report'],
  radio: ['briefing', 'report'],
  report: [],
};
export function go(s: GameState, to: Phase): GameState {
  if (!TRANSITIONS[s.phase].includes(to)) throw new Error(`Bad transition ${s.phase} -> ${to}`);
  s.phase = to;
  return s;
}

function setSupply(s: GameState): void {
  const c = cfg(s.mode), d = today(s);
  let v = c.CELLS_BY_WEATHER[d.weather];
  const notes = [d.weather + ' sky ' + v];
  for (const p of s.problems) {
    const pd = c.PROBLEMS[p.type];
    if (pd.cellsLost) { v -= pd.cellsLost * p.severity; notes.push(pd.name.toLowerCase() + ' −' + pd.cellsLost * p.severity); }
  }
  if (s.panelBoost && s.sol <= s.panelBoost.until) { v += s.panelBoost.cells; notes.push('polished panels +' + s.panelBoost.cells); }
  if (s.battery > 0) { v += s.battery; notes.push('battery +' + s.battery); s.battery = 0; }
  s.supply = Math.max(0, v);
  s.supplyNotes = notes;
}

function deliverAnswer(s: GameState, id: RadioMessageId): string {
  const c = cfg(s.mode);
  if (id === 'forecast') {
    for (let k = 1; k <= c.RADIO_FORECAST_SOLS; k++) know(s, s.sol + k);
    return 'Earth sent the space weather forecast. See it below.';
  }
  if (id === 'fix') {
    const p = s.problems[0];
    if (!p) return 'Earth says: "Your call, Captain."';
    p.advice += 1;
    return 'Earth sent a repair trick. ' + c.PROBLEMS[p.type].name + ' needs less work.';
  }
  if (id === 'doctors') {
    findCard(s, 'bones');
    const pat = s.crew.filter((p) => p.medbay > 0).sort((a, b) => b.medbay - a.medbay)[0];
    if (pat) {
      pat.medbay = Math.max(0, pat.medbay - 1);
      if (pat.medbay <= 0) { pat.cond = 'fine'; return 'The doctors helped. ' + pat.name + ' leaves the medbay today.'; }
      return 'The doctors helped. ' + pat.name + ' heals one sol sooner.';
    }
    const ill = s.crew.find((p) => p.sick);
    if (ill) { ill.sickRest += 1; return 'The doctors helped. ' + ill.name + ' needs less bed rest.'; }
    return 'Earth says: "Your call, Captain."';
  }
  return 'Earth got your science report. Thank you!';
}

/** Morning of the next sol. Mutates (called on a clone). */
function nextSol(s: GameState): GameState {
  const c = cfg(s.mode), prev = s.sol >= 1 ? today(s) : null, last = s.log[s.log.length - 1];
  if (s.sol >= 1) go(s, 'briefing'); else s.phase = 'briefing';
  s.sol++;
  const day = today(s), M: Morning = { lines: [], notes: [], answers: [], unlocked: [], words: [] };
  if (s.sol === 1) {
    M.lines.push('Landing done. The station is running.');
    M.lines.push('The ship home lands on sol ' + c.MISSION_SOLS + '.');
  } else {
    const steps = fmt(s.crop) + ' of ' + c.CROP_STEPS_TO_HARVEST + ' steps.';
    M.lines.push(last && last.harvests ? 'Harvest came in. New crop is at ' + steps : 'Greenhouse: crop is at ' + steps);
    M.lines.push(s.problems.length ? 'Open trouble: ' + s.problems.map((p) => c.PROBLEMS[p.type].name).join(', ') + '.' : 'Hull is holding. Nothing is broken.');
    const med = s.crew.filter((p) => p.medbay > 0);
    M.lines.push(med.length ? 'In the medbay: ' + med.map((p) => p.name).join(', ') + '.' : 'Nobody is in the medbay.');
  }
  if (prev && prev.weather === 'dust' && day.weather !== 'dust') {
    if (!s.flags.panelsCovered) { addProblem(s, 'dusty_panels'); M.notes.push('Dust storm is over. Panels are dusty: fewer cells.'); }
    else M.notes.push('Dust storm is over. The panels stayed clean.');
    s.flags.panelsCovered = false;
  }
  // Earth's answer arrives at breakfast, if the radio can hear it
  if (s.radio.queue.length) {
    if (isBlackout(s)) M.answers.push('No word from Earth. The Sun is in the way.');
    else if (radioBlocked(s)) M.answers.push('No word from Earth. The antenna is off.');
    else { for (const m of s.radio.queue) M.answers.push(deliverAnswer(s, m.id)); s.radio.queue = []; }
  }
  for (let k = 1; k <= c.AUTO_FORECAST_SOLS; k++) know(s, s.sol + k);
  for (const k of SYSTEMS) if (c.SYSTEMS[k].unlockSol === s.sol && s.sol > 1) M.unlocked.push(c.SYSTEMS[k].name);
  if (s.sol === c.JOB_UNLOCK_SOL) M.unlocked.push('Crew jobs');
  const word = (k: string) => { if (!s.seenWords.includes(k)) { s.seenWords.push(k); M.words.push(words[k]); } };
  if (s.sol === 1) { word('sol'); word('cell'); }
  if (s.sol === c.SYSTEMS.shield.unlockSol) word('msv');
  if (day.real.some((e) => e.type === 'FLR')) word('flare');
  if (day.storm) word('sep');
  if (isBlackout(s)) word('conj');
  setSupply(s);
  s.today = { revealed: false, choice: null, sickId: null, skipEvent: false, before: null };
  // yesterday's plan is today's starting point
  if (s.flags.prefill) {
    const pr = s.problems.find((p) => p.type === s.flags.prefill);
    if (pr) {
      const job = c.PROBLEMS[pr.type].where === 'outside' ? 'outside' : 'fix';
      const pool = s.crew.filter((p) => jobAllowed(s, p, job).ok && !p.sick && p.cond !== 'tired');
      const who = pool.find((p) => p.role === 'engineer') || pool[0];
      if (who) { s.plan.jobs[who.id] = job; M.notes.push(who.name + ' is set to fix the ' + c.PROBLEMS[pr.type].name.toLowerCase() + ' today.'); }
    }
    s.flags.prefill = null;
  }
  s.plan = sanitizePlan(s, s.plan);
  s.morning = M;
  return s;
}

export function createMission(name: string, mode: Mode): GameState {
  const m: Mode = mode === 'commander' ? 'commander' : 'cadet', seed = normSeed(name), c = cfg(m), sched = buildSchedule(seed);
  const s: GameState = {
    version: SAVE_VERSION, name: prettyName(name), seed, mode: m, periodId: sched.periodId, sol: 0, phase: 'briefing',
    air: c.AIR_START, food: c.FOOD_START, crop: 0, samples: 0, labWork: 0, science: 0,
    crew: crewDefs.map((d): CrewMember => ({ id: d.id, name: d.name, role: d.role, cond: 'fine', sick: false, sickRest: 0, medbay: 0, medbaySols: 0, medbayCause: '', dose: 0, stormExtra: 0, trips: 0, heavyStreak: 0, grounded: false })),
    problems: [], uid: 0, schedule: sched.days,
    supply: 0, supplyNotes: [], battery: 0, panelBoost: null,
    plan: { cells: { life: c.SYSTEMS.life.want, shield: 0, greenhouse: c.SYSTEMS.greenhouse.want, radio: 0, lab: 0 }, jobs: {} },
    today: { revealed: false, choice: null, sickId: null, skipEvent: false, before: null },
    radio: { queue: [], sent: 0 }, known: [], cards: { found: [], sent: [] },
    morning: { lines: [], notes: [], answers: [], unlocked: [], words: [] }, lastResults: [], log: [], seenWords: [],
    flags: { panelsCovered: false, prefill: null },
    counters: { airZero: 0, foodZero: 0, harvests: 0, medbaySols: 0 }, over: null,
  };
  for (const p of s.crew) s.plan.jobs[p.id] = 'rest';
  return nextSol(s);
}

export type MorningReport = Morning & { sol: number; weather: string; cells: number; cellNotes: string[]; storm: (Storm & { mult: number }) | null; real: RealEvent[]; blackout: boolean; forecast: Forecast[] };
export function getMorning(s: GameState): MorningReport {
  return { ...s.morning, sol: s.sol, weather: today(s).weather, cells: s.supply, cellNotes: s.supplyNotes, storm: stormOn(s), real: today(s).real, blackout: isBlackout(s), forecast: knownForecast(s) };
}

export function startPlanning(state: GameState): GameState {
  if (state.phase !== 'briefing') return state;
  return go(clone(state), 'plan');
}

export function applyPlan(state: GameState, plan: Plan): GameState {
  if (state.phase !== 'plan') return state;
  const s = clone(state);
  s.plan = sanitizePlan(s, plan);
  const ch = s.today.choice;
  if (ch) { // the event choice may no longer be valid (e.g. a lab scan without lab power)
    const def = eventChoices(s).find((x) => x.id === ch.id);
    if (!def || !def.enabled) { s.today.choice = null; s.plan = sanitizePlan(s, s.plan); }
  }
  return s;
}

/** The event shows itself after the plan is confirmed for the first time. Mutates. */
function revealEvent(s: GameState): void {
  if (s.today.revealed) return;
  s.today.revealed = true;
  const ev = currentEvent(s);
  if (!ev) return;
  if (ev.kind === 'trouble' && ev.problem) addProblem(s, ev.problem);
  if (ev.id === 'sick_crew') {
    const n = s.crew.length, start = today(s).sickIdx;
    for (let k = 0; k < n; k++) { const p = s.crew[(start + k) % n]; if (p.medbay <= 0 && !p.sick) { s.today.sickId = p.id; break; } }
    if (!s.today.sickId) s.today.skipEvent = true;
  }
  if (ev.id === 'clean_wind') s.problems = s.problems.filter((p) => p.type !== 'dusty_panels');
}

export function confirmPlan(state: GameState): GameState {
  if (state.phase !== 'plan') return state;
  const s = clone(state);
  revealEvent(s);
  if (currentEvent(s)) return go(s, 'event');
  return playSol(s).state;
}
export function backToPlan(state: GameState): GameState {
  if (state.phase !== 'event') return state;
  return go(clone(state), 'plan');
}
export function clearChoice(state: GameState): GameState {
  const s = clone(state);
  s.today.choice = null;
  s.plan = sanitizePlan(s, s.plan);
  return s;
}

export function resolveEvent(state: GameState, choiceId: string, crewIds: string[] = []): GameState {
  if (state.phase !== 'event') return state;
  const s = clone(state), def = eventChoices(s).find((x) => x.id === choiceId);
  if (!def || !def.enabled) return s;
  const crew: string[] = [];
  if (def.pick) {
    for (const id of crewIds) {
      const p = s.crew.find((x) => x.id === id);
      if (p && !crew.includes(id) && p.medbay <= 0 && !(def.pick.job === 'outside' && p.grounded) && crew.length < def.pick.max) crew.push(id);
    }
    if (crew.length < def.pick.min) return s;
  }
  s.today.choice = { id: choiceId, crew, job: def.pick ? def.pick.job : null, task: def.pick ? def.pick.task : null, label: def.label };
  s.plan = sanitizePlan(s, s.plan);
  return s;
}

/** Runs the sol. Every result line names its cause. */
export function playSol(state: GameState): { state: GameState; results: ResultLine[] } {
  if (state.phase !== 'plan' && state.phase !== 'event') return { state, results: [] };
  const s = clone(state), c = cfg(s.mode), day = today(s), R: ResultLine[] = [];
  const say = (t: string, why = '') => { R.push({ t, why }); };
  revealEvent(s);
  const ev = currentEvent(s);
  if (ev && !s.today.choice) { // bot or preview did not choose: take the last "do nothing" option
    const l = eventChoices(s).filter((x) => x.enabled && !x.pick), d = l[l.length - 1];
    s.today.choice = { id: d.id, crew: [], job: null, task: null, label: d.label };
  }
  const ch: ChosenChoice | null = ev ? s.today.choice : null;
  s.plan = sanitizePlan(s, s.plan);
  s.today.before = { air: s.air, food: s.food, crop: s.crop, science: s.science };
  const jobs = effectiveJobs(s), cells = effectiveCells(s), storm = stormOn(s);
  const rec: SolRecord = { sol: s.sol, supply: cellsAvailable(s), cells, jobs, air: [], harvests: 0, choice: ev && ch ? ev.id + ':' + ch.id : null };
  const names = (list: CrewMember[]) => list.map((p) => p.name).join(' and ');
  const withJob = (j: EffectiveJob) => s.crew.filter((p) => jobs[p.id] === j);
  const tank = (key: 'air' | 'food', label: string, d: number, why: string, causeKey?: string) => {
    if (!d) return;
    const b = s[key];
    s[key] = clamp(s[key] + d, 0, c.TANK_MAX);
    const real = s[key] - b;
    if (key === 'air') rec.air.push({ d: real, key: causeKey || why });
    if (real !== 0) say(label + ' ' + signed(real) + (real !== d ? (d > 0 ? ' (tank full)' : ' (tank empty)') : ''), why);
    else say(label + (d > 0 ? ' tank is full' : ' tank is empty'), why);
  };
  const air = (d: number, why: string, key?: string) => tank('air', 'Air & water', d, why, key);
  const food = (d: number, why: string) => tank('food', 'Food', d, why);

  // 0) events that act before the work day
  if (ev && ch && ev.id === 'sick_crew' && s.today.sickId) {
    const p = crewById(s, s.today.sickId);
    if (ch.id === 'medbay_now') { enterMedbay(s, p, c.ILLNESS_MEDBAY_STEPS, 'feeling ill'); say(p.name + ' went to the medbay', 'ill, your choice'); }
    else { p.sick = true; p.sickRest = 0; }
  }
  if (ev && ch && ev.id === 'power_fault') {
    if (ch.id === 'dark_greenhouse') say('Greenhouse dark today', 'blown fuse, your choice');
    else if (ch.id === 'dark_labradio') say('Lab and radio dark today', 'blown fuse, your choice');
    else say('Fuse rewired: nothing went dark', names(withJob('rewire')) + ' spent the day on it');
  }

  // 1) repairs inside and outside; free outside workers collect samples
  const repair = (where: string, workers: CrewMember[]): CrewMember[] => {
    const idle: CrewMember[] = [];
    workers.sort((a, b) => workPower(c, b, 'fix') - workPower(c, a, 'fix'));
    for (const p of workers) {
      let w = workPower(c, p, 'fix'), did = false;
      for (const pr of s.problems) {
        if (w <= 1e-9) break;
        if (pr.fixed || c.PROBLEMS[pr.type].where !== where) continue;
        const use = Math.min(w, problemNeed(c, pr) - pr.done);
        pr.done += use; w -= use; did = true;
        pr.by = pr.by || [];
        if (!pr.by.includes(p.name)) pr.by.push(p.name);
        if (pr.done >= problemNeed(c, pr) - 1e-9) pr.fixed = true;
      }
      if (!did) idle.push(p);
    }
    return idle;
  };
  const task = ch ? ch.task : null, picked = ch ? ch.crew : [];
  const special = (id: string) => picked.includes(id) && (task === 'chance' || task === 'cover' || task === 'polish');
  // nothing to fix = idle: neither heavy work nor rest
  for (const p of repair('inside', withJob('fix'))) { say(p.name + ' had nothing to fix', 'nothing is broken inside'); jobs[p.id] = 'idle'; }
  for (const p of repair('outside', withJob('outside').filter((x) => !special(x.id)))) {
    const n = workPower(c, p, 'outside');
    s.samples = r3(s.samples + n);
    say('Samples ' + signed(n), p.name + ' went outside');
  }
  for (const pr of s.problems) {
    const pd = c.PROBLEMS[pr.type];
    if (pr.fixed) { say(pd.name + ' fixed!', 'repair by ' + (pr.by || []).join(' and ')); if (pd.airOnFix) air(pd.airOnFix, pd.name.toLowerCase() + ' works again', 'fix'); }
    else if (pr.by && pr.by.length) say(pd.name + ': repair ' + fmt(pr.done) + ' of ' + fmt(problemNeed(c, pr)), pr.by.join(' and ') + ' worked on it');
    delete pr.by;
  }
  s.problems = s.problems.filter((pr) => !pr.fixed);

  // 2) greenhouse
  const lamp = s.problems.find((p) => p.type === 'lamp_fault');
  const lf = lamp ? (c.PROBLEMS.lamp_fault.growthFactor || [1])[lamp.severity - 1] : 1;
  let steps = 0;
  if (cells.greenhouse > 0) {
    const st = cells.greenhouse * c.STEPS_PER_GREENHOUSE_CELL * lf;
    steps += st;
    say('Crop +' + plural(st, 'step'), plural(cells.greenhouse, 'greenhouse cell') + (lamp ? ', lamps are faulty' : ''));
  } else say('Crops wait', 'greenhouse dark');
  for (const p of withJob('grow')) {
    if (cells.greenhouse > 0 || !c.GROW_NEEDS_LIGHT) { const st = workPower(c, p, 'grow'); steps += st; say('Crop +' + plural(st, 'step'), p.name + ' tended the plants'); }
    else say(p.name + ' could not grow', 'greenhouse dark');
  }
  s.crop = r3(s.crop + steps);
  while (s.crop >= c.CROP_STEPS_TO_HARVEST - 1e-9) {
    s.crop = Math.max(0, r3(s.crop - c.CROP_STEPS_TO_HARVEST));
    rec.harvests++; s.counters.harvests++;
    food(c.HARVEST_FOOD, 'harvest: crop reached ' + c.CROP_STEPS_TO_HARVEST + ' steps');
  }

  // 3) lab
  const labOn = isUnlocked(s, 'lab') && cells.lab >= c.SYSTEMS.lab.want;
  for (const p of withJob('lab')) {
    if (!labOn) { say(p.name + ': no lab work', 'lab dark'); continue; }
    if (s.samples < 1) { say(p.name + ': no lab work', 'no samples to study'); continue; }
    s.labWork = r3(s.labWork + workPower(c, p, 'lab'));
    let made = false;
    while (s.labWork >= c.LAB_WORK_PER_SAMPLE - 1e-9 && s.samples >= 1) {
      s.labWork = Math.max(0, r3(s.labWork - c.LAB_WORK_PER_SAMPLE));
      s.samples = r3(s.samples - 1);
      made = true;
      const next = cards.find((k) => k.kind === 'lab' && !s.cards.found.includes(k.id));
      if (next) findCard(s, next.id, say, p.name + ' studied a sample');
      else say('Sample studied: nothing new', 'all lab cards are found');
    }
    if (!made) say('Sample half studied', p.name + ' worked in the lab');
  }
  if (s.samples < 1) s.labWork = 0;

  // 4) outcome of a chance and of outside tasks
  if (ev && ch && ev.kind === 'chance' && ev.id !== 'clean_wind') {
    if (ch.id === 'outside') {
      const p = crewById(s, picked[0]);
      findCard(s, ev.card, say, p.name + ' went outside for it');
      s.samples = r3(s.samples + c.CHANCE_SAMPLES);
      say('Samples ' + signed(c.CHANCE_SAMPLES), p.name + ' brought one back');
    } else if (ch.id === 'scan') {
      if (labOn && withJob('scan').length) findCard(s, ev.card, say, names(withJob('scan')) + ' scanned it from the lab');
      else say('Scan failed', 'lab dark');
    } else say('Chance gone', 'you let it go');
  }
  if (ev && ch && ev.id === 'clean_wind') {
    if (ch.id === 'use_now') say('Cells +' + c.WIND_BONUS_CELLS + ' today', 'wind cleaned the panels');
    else if (ch.id === 'polish') {
      s.panelBoost = { cells: c.WIND_POLISH_CELLS, until: s.sol + c.WIND_POLISH_SOLS };
      say('Cells +' + c.WIND_POLISH_CELLS + ' for ' + c.WIND_POLISH_SOLS + ' sols', crewById(s, picked[0]).name + ' polished the panels');
    } else say('Chance gone', 'you let it go');
  }
  if (ev && ch && ev.id === 'dust_storm') {
    if (ch.id === 'cover') { s.flags.panelsCovered = true; say('Panels tilted against the dust', crewById(s, picked[0]).name + ' went outside'); }
    else say('Panels left in the dust', 'you waited it out');
  }

  // 5) care: all of it goes to the first patient
  const carers = withJob('care'), careFor: Record<string, number> = {};
  if (carers.length) {
    const pts = carers.reduce((a, p) => a + workPower(c, p, 'care'), 0);
    const pat = s.crew.filter((p) => jobs[p.id] === 'medbay').sort((a, b) => b.medbay - a.medbay)[0] || s.crew.find((p) => p.sick && jobs[p.id] === 'rest');
    if (pat) careFor[pat.id] = pts; else say(names(carers) + ' had nobody to care for', 'nobody is ill');
  }

  // 6) air & water
  const miss = c.SYSTEMS.life.want - cells.life;
  if (miss > 0) air(-miss * c.AIR_LOSS_PER_MISSING_CELL, 'life support ' + plural(miss, 'cell') + ' short', 'life');
  else if (miss < 0) air(-miss * c.AIR_GAIN_PER_EXTRA_CELL, 'extra life support cell', 'extra');
  for (const pr of s.problems) { const pd = c.PROBLEMS[pr.type]; if (pd.airLeak) air(-pd.airLeak * pr.severity, pd.name.toLowerCase() + ' leaks', pr.type); }
  // 7) food
  food(-c.FOOD_EATEN_PER_SOL, 'the crew ate');

  // 8) radiation: the badge only fills
  if (storm) say('Solar storm: dose x' + storm.mult + ' without shield', cells.shield >= c.SYSTEMS.shield.want ? 'shield at full power: minimum dose inside' : 'shield has ' + cells.shield + ' of ' + c.SYSTEMS.shield.want + ' cells');
  for (const p of s.crew) {
    const j = jobs[p.id], r = doseFor(c, storm, j, cells.shield), b0 = badgeOf(c, p.dose);
    p.dose = r3(p.dose + r.d);
    p.stormExtra = r3(p.stormExtra + r.extra);
    if (j === 'outside') p.trips++;
    const b1 = badgeOf(c, p.dose);
    if (b1 !== b0) {
      say(p.name + "'s badge turned " + b1, j === 'outside' ? 'trip outside' : r.extra > 0.01 ? 'storm with a weak shield' : 'dose adds up every sol');
      if (b1 === 'red' && c.RED_BADGE_GROUNDS) { p.grounded = true; say(p.name + ' stays inside from now on', 'red badge'); }
    }
  }

  // 9) people: medbay, illness, tiredness
  for (const p of s.crew) {
    const j = jobs[p.id];
    if (j === 'medbay') {
      p.medbaySols++; s.counters.medbaySols++;
      p.medbay = r3(p.medbay - c.MEDBAY_HEAL_PER_SOL - (careFor[p.id] || 0));
      if (p.medbay <= 1e-9) { p.medbay = 0; p.cond = 'fine'; p.sick = false; p.heavyStreak = 0; say(p.name + ' leaves the medbay', careFor[p.id] ? 'healed faster with care' : 'healed'); }
      else say(p.name + ' stays in the medbay', plural(Math.ceil(p.medbay), 'more sol'));
      continue;
    }
    if (p.sick) {
      if (j === 'rest') {
        p.sickRest = r3(p.sickRest + 1 + (careFor[p.id] || 0));
        p.heavyStreak = 0;
        if (p.sickRest >= c.SICK_REST_SOLS_TO_CURE - 1e-9) { p.sick = false; p.sickRest = 0; p.cond = 'fine'; say(p.name + ' is well again', careFor[p.id] ? 'bed rest and care' : 'bed rest'); }
        else say(p.name + ' rests in the bunk', 'one more rest sol needed');
      } else { enterMedbay(s, p, c.SICK_WORK_MEDBAY_STEPS, 'working while ill'); say(p.name + ' got worse: medbay', 'worked while ill'); }
      continue;
    }
    if (c.HEAVY_JOBS.includes(j)) {
      if (p.cond === 'tired' && c.TIRED_HEAVY_WORK_INJURES) {
        enterMedbay(s, p, c.INJURY_MEDBAY_STEPS, j === 'outside' ? 'a trip outside while tired' : 'heavy work while tired');
        say(p.name + ' got hurt: medbay', 'heavy work while tired');
      } else {
        p.heavyStreak++;
        if (p.heavyStreak >= c.HEAVY_SOLS_TO_TIRED && p.cond !== 'tired') { p.cond = 'tired'; say(p.name + ' is tired', c.HEAVY_SOLS_TO_TIRED + ' heavy sols in a row'); }
      }
    } else {
      p.heavyStreak = 0;
      if (j === 'rest' && p.cond === 'tired') { p.cond = 'fine'; say(p.name + ' is rested', 'took a rest sol'); }
    }
  }

  // 10) trouble left alone grows
  for (const pr of s.problems) {
    const pd = c.PROBLEMS[pr.type];
    pr.age++;
    if (pd.growEvery > 0 && pr.age % pd.growEvery === 0 && pr.severity < pd.maxSeverity) { pr.severity++; say(pd.name + ' grew worse', 'left open for ' + plural(pr.age, 'sol')); }
  }
  if (ev && ch && ch.id === 'tomorrow' && ev.problem) s.flags.prefill = ev.problem;

  // 11) milestone cards
  const next = dayAt(s, s.sol + 1);
  if (rec.harvests > 0) findCard(s, 'space_radishes', say, 'first harvest');
  if (day.storm && !(next && next.storm)) findCard(s, 'storm_survived', say, 'the solar storm passed');
  if (day.weather === 'dust' && !(next && next.weather === 'dust')) findCard(s, 'dust_survived', say, 'the dust storm passed');
  if (isBlackout(s) && !isBlackout(s, s.sol + 1)) findCard(s, 'conjunction', say, 'the radio blackout ended');

  // 12) unused cells
  const unused = rec.supply - planTotal(s.plan);
  if (unused > 0) {
    if (c.BATTERY_CAPACITY > 0) {
      s.battery = Math.min(c.BATTERY_CAPACITY, unused);
      say(plural(s.battery, 'cell') + ' saved in the battery', 'not shared out');
      if (unused > s.battery) say(plural(unused - s.battery, 'cell') + ' lost at sunset', 'battery is full');
    } else say(plural(unused, 'cell') + ' lost at sunset', 'not shared out');
  }

  // 13) early return: nobody dies, Mission Control calls the crew home
  s.counters.airZero = s.air <= 0 ? s.counters.airZero + 1 : 0;
  s.counters.foodZero = s.food <= 0 ? s.counters.foodZero + 1 : 0;
  if (s.counters.airZero >= c.ZERO_SOLS_TO_LOSE) s.over = { won: false, why: 'air' };
  else if (s.counters.foodZero >= c.ZERO_SOLS_TO_LOSE) s.over = { won: false, why: 'food' };
  else if (s.counters.airZero || s.counters.foodZero) say('Warning: a tank is empty', 'one more empty sol ends the mission');

  s.log.push(rec);
  s.lastResults = R;
  go(s, 'results');
  return { state: s, results: R };
}

/** "What happens tonight" for the plan screen. An event that is not revealed yet is not peeked at. */
export function previewSol(state: GameState): GameState {
  const s = clone(state);
  if (!s.today.revealed) { const d = s.schedule[s.sol - 1]; d.kind = 'quiet'; d.eventId = null; }
  return playSol(s).state;
}

export function radioCanSend(s: GameState): boolean {
  const c = cfg(s.mode), last = s.log[s.log.length - 1];
  return isUnlocked(s, 'radio') && !isBlackout(s) && !radioBlocked(s) && !!last && last.sol === s.sol && last.cells.radio >= c.SYSTEMS.radio.want;
}
export function radioOffReason(s: GameState): string {
  const c = cfg(s.mode), last = s.log[s.log.length - 1];
  if (!isUnlocked(s, 'radio')) return 'The radio opens on sol ' + c.SYSTEMS.radio.unlockSol + '.';
  if (isBlackout(s)) return 'Radio blackout: the Sun is between Mars and Earth.';
  if (radioBlocked(s)) return 'No radio: the antenna is off.';
  if (!last || last.cells.radio < c.SYSTEMS.radio.want) return 'No message tonight: the radio had no cell.';
  return '';
}
export function messageOptions(s: GameState): MessageOption[] {
  const c = cfg(s.mode), unsent = s.cards.found.filter((id) => !s.cards.sent.includes(id));
  const firstBonus = s.radio.sent === 0 && !s.cards.found.includes('first_call') ? c.SCIENCE_PER_CARD.milestone : 0;
  const pts = unsent.reduce((a, id) => a + c.SCIENCE_PER_CARD[cardDef(id).kind], 0) + firstBonus;
  const ill = s.crew.some((p) => p.medbay > 0 || p.sick);
  return [
    { id: 'forecast', label: 'What will space weather be like?', plus: 'Forecast for ' + c.RADIO_FORECAST_SOLS + ' sols, at breakfast', minus: "Uses tonight's message", enabled: true, why: '' },
    { id: 'fix', label: 'How can we fix it faster?', plus: 'The open repair needs less work', minus: "Uses tonight's message", enabled: s.problems.length > 0, why: 'Nothing is broken' },
    { id: 'doctors', label: 'Ask the doctors', plus: 'A patient heals one sol sooner', minus: "Uses tonight's message", enabled: ill, why: 'Nobody is ill' },
    { id: 'science', label: 'Send our science report', plus: plural(unsent.length + (firstBonus ? 1 : 0), 'card') + ' sent: +' + pts + ' science', minus: 'No question tonight, no forecast', enabled: unsent.length > 0, why: 'No new cards to send' },
  ];
}

function endOrNext(s: GameState): GameState {
  if (s.sol >= cfg(s.mode).MISSION_SOLS) { s.over = { won: true, why: 'ship' }; return go(s, 'report'); }
  return nextSol(s);
}
/** After the results: the evening call, the next morning, or the report. */
export function proceed(state: GameState): GameState {
  if (state.phase !== 'results') return state;
  const s = clone(state);
  if (s.over) return go(s, 'report');
  if (radioCanSend(s)) return go(s, 'radio');
  return endOrNext(s);
}
/** One message per sol (or null for none). Earth answers next morning. */
export function sendMessage(state: GameState, messageId: RadioMessageId | null): GameState {
  if (state.phase !== 'radio') return state;
  const s = clone(state), c = cfg(s.mode), opt = messageOptions(s).find((m) => m.id === messageId);
  if (messageId && opt && opt.enabled) {
    if (s.radio.sent === 0) findCard(s, 'first_call');
    s.radio.sent++;
    if (messageId === 'science') {
      for (const id of s.cards.found.filter((x) => !s.cards.sent.includes(x))) { s.cards.sent.push(id); s.science += c.SCIENCE_PER_CARD[cardDef(id).kind]; }
    }
    s.radio.queue.push({ id: messageId, sol: s.sol });
  }
  return endOrNext(s);
}
