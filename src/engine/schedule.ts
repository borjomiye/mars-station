// The whole mission is drawn from the seed here: real DONKI period, weather, event of every sol.
// It does not depend on the mode, so Cadet and Commander fly the same Mars.
import type { Day, DonkiEvent, DonkiPeriod, RealEvent } from './types';
import { baseBalance, crewDefs, dayIndex, donki, missionNames } from './content';
import { hashString, mulberry32 } from './rng';

export function normSeed(name: string): string {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^mission /, '') || 'brave otter';
}
export function prettyName(name: string): string {
  return normSeed(name).split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
/** Only for a brand-new mission name; the engine itself never uses Math.random(). */
export function randomMissionName(): string {
  const a = missionNames.a, b = missionNames.b;
  return a[Math.floor(Math.random() * a.length)] + ' ' + b[Math.floor(Math.random() * b.length)];
}

const rank = (e: DonkiEvent): number =>
  e.type === 'SEP' ? 0 : e.marsImpact ? 1 : e.type === 'FLR' && (e.classType ?? '').startsWith('X') ? 2 : e.type === 'CME' ? 3 : 4;

/** "This really happened on <date>": we never say it hit Mars unless the model lists Mars. */
function toReal(e: DonkiEvent): RealEvent {
  const label = e.type === 'SEP' ? 'Solar particle storm' : e.type === 'FLR' ? `Solar flare ${e.classType ?? ''}`.trim() : `Plasma cloud from the Sun${e.speed ? `, ${e.speed} km/s` : ''}`;
  const note = e.type === 'CME' ? (e.marsImpact ? 'model: heading for Mars' : 'model: not heading for Mars') : 'seen from near Earth';
  return { id: e.id, type: e.type, date: e.date, label, note, link: e.link };
}

const sepSols = (p: DonkiPeriod): number[] => p.events.filter((e) => e.type === 'SEP').map((e) => dayIndex(p, e) + 1);

export function buildSchedule(seed: string): { periodId: string; days: Day[] } {
  const c = baseBalance, N = c.MISSION_SOLS, rng = mulberry32(hashString(seed));
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const shuffle = <T>(arr: T[]): T[] => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const days: Day[] = [];
  for (let i = 1; i <= N; i++) days.push({ sol: i, kind: 'quiet', eventId: null, weather: 'clear', storm: null, real: [], sickIdx: ri(0, crewDefs.length - 1) });
  const setEv = (sol: number, kind: Day['kind'], id: string | undefined) => {
    const d = days[sol - 1];
    if (d && !d.eventId && id) { d.kind = kind; d.eventId = id; }
  };

  // 1) real DONKI period: day 0 of the period = sol 1
  const fits = donki.periods.filter((p) => p.days >= N && sepSols(p).filter((s) => s <= N).every((s) => s >= c.STORM_MIN_SOL && s <= c.STORM_MAX_SOL));
  const pool = fits.length ? fits : donki.periods;
  const stormy = pool.filter((p) => sepSols(p).some((s) => s <= N)), calm = pool.filter((p) => !stormy.includes(p));
  const wantStormy = rng() < c.STORMY_PERIOD_CHANCE, pickFrom = (wantStormy && stormy.length) || !calm.length ? stormy : calm;
  const period = pickFrom[Math.floor(rng() * pickFrom.length)];
  const stormLen = c.STORM_MULT_BY_DAY.length;
  for (const e of period.events.slice().sort((x, y) => rank(x) - rank(y))) {
    const sol = dayIndex(period, e) + 1;
    if (sol < 1 || sol > N) continue;
    if (days[sol - 1].real.length < c.MAX_REAL_EVENTS_PER_SOL) days[sol - 1].real.push(toReal(e));
    if (e.type === 'SEP') for (let k = 0; k < stormLen && sol + k <= N; k++) {
      const d = days[sol - 1 + k];
      if (!d.storm) { d.storm = { day: k, date: e.date, link: e.link }; d.kind = 'trouble'; d.eventId = 'solar_storm'; }
    }
  }
  // 2) weather and the dust storm
  for (const d of days) if (d.sol > c.CLEAR_UNTIL_SOL) d.weather = rng() < c.HAZY_CHANCE ? 'hazy' : 'clear';
  const dustLen = ri(c.DUST_LEN_MIN, c.DUST_LEN_MAX);
  let starts: number[] = [];
  for (let sol = c.DUST_START_MIN; sol <= c.DUST_START_MAX; sol++) if (sol < N && !days[sol - 1].eventId) starts.push(sol);
  if (!starts.length) starts = days.filter((d) => d.sol > c.FIRST_CHANCE_SOL && d.sol < N && !d.eventId).map((d) => d.sol);
  const dustPick = rng();
  if (starts.length) {
    const st = starts[Math.floor(dustPick * starts.length)];
    setEv(st, 'trouble', 'dust_storm');
    for (let k = 0; k < dustLen && st + k <= N; k++) days[st - 1 + k].weather = 'dust';
  }
  // 3) teaching sols and fixed slots
  days[0].kind = days[0].eventId ? days[0].kind : 'intro';
  setEv(c.TUTORIAL_TROUBLE_SOL, 'trouble', c.TUTORIAL_TROUBLE);
  if (!days[2].eventId) days[2].kind = 'intro';
  const chancePool = shuffle(c.CHANCE_POOL), troublePool = shuffle(c.TROUBLE_POOL);
  const fi = chancePool.findIndex((x) => x !== 'clean_wind');
  setEv(c.FIRST_CHANCE_SOL, 'chance', chancePool.splice(fi, 1)[0]);
  if (!days[N - 1].eventId) days[N - 1].kind = 'ship';
  // 4) the rest: troubles, chances, quiet sols
  const free = days.filter((d) => d.sol > c.FIRST_CHANCE_SOL && d.sol < N && !d.eventId && d.kind === 'quiet').map((d) => d.sol);
  let nT = c.RANDOM_TROUBLES, nC = c.CHANCES_TOTAL - 1;
  while (nT + nC > free.length) { if (nT >= nC && nT > 0) nT--; else nC--; } // stormy missions drop random troubles first
  let kinds: string[] = [...Array(nT).fill('trouble'), ...Array(nC).fill('chance')];
  while (kinds.length < free.length) kinds.push('quiet');
  kinds = shuffle(kinds);
  free.forEach((sol, i) => {
    if (kinds[i] === 'trouble') setEv(sol, 'trouble', troublePool.shift());
    else if (kinds[i] === 'chance') setEv(sol, 'chance', chancePool.shift());
  });
  return { periodId: period.id, days };
}
