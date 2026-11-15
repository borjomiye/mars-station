import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import balance from '../src/data/balance.json';
import type { DonkiEvent, DonkiFile, DonkiPeriod } from '../src/engine/types';

if (existsSync('.env')) process.loadEnvFile('.env');
const KEY = process.env.NASA_API_KEY ?? 'DEMO_KEY';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const USE_API_NASA = process.argv.includes('--api-nasa');
const REFRESH = process.argv.includes('--refresh');
const START = args[0] ?? '2013-01-01';
const END = args[1] ?? '2026-10-31';
const WINDOW_DAYS: number = balance.base.MISSION_SOLS;
const STORM_MIN_SOL: number = balance.base.STORM_MIN_SOL;
const STORM_MAX_SOL: number = balance.base.STORM_MAX_SOL;
const CHUNK_DAYS = 30;
const OUT = 'src/data/donki-periods.json';
const CACHE_DIR = 'node_modules/.cache';
const DAY = 86_400_000;

const MIN_CME_SPEED = 1000;
const STRONG_FLARE = /^[MX]/;
const MAX_STORM_DAYS = Number(process.env.MAX_STORM_DAYS ?? 3);
const MAX_EVENTS_PER_DAY = 3;
const MAX_STORMY = Number(process.env.MAX_STORMY ?? 40);
const MAX_CALM = Number(process.env.MAX_CALM ?? 15);

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(Date.parse(date) + n * DAY);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

type RawSep = { sepID: string; eventTime: string; link: string; instruments?: { displayName?: string }[] | null };
type RawFlr = { flrID: string; beginTime: string; peakTime?: string; classType?: string; link: string };
type RawCme = {
  activityID: string;
  startTime: string;
  link: string;
  cmeAnalyses?: { speed?: number; isMostAccurate?: boolean; enlilList?: { impactList?: { location?: string }[] | null }[] | null }[] | null;
};

async function get<T>(type: 'SEP' | 'FLR' | 'CME', start: string, end: string): Promise<T[]> {
  const url =
    USE_API_NASA && type !== 'FLR'
      ? `https://api.nasa.gov/DONKI/${type}?startDate=${start}&endDate=${end}&api_key=${KEY}`
      : `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/${type}?startDate=${start}&endDate=${end}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      return text.trim() ? (JSON.parse(text) as T[]) : [];
    }
    const left = res.headers.get('x-ratelimit-remaining');
    console.warn(`  ${type} ${start}..${end}: HTTP ${res.status} (attempt ${attempt}${left ? `, quota left ${left}` : ''})`);
    if (res.status === 429 && KEY === 'DEMO_KEY') throw new Error('Rate limit hit. Use your own NASA_API_KEY in .env.');
    await new Promise((r) => setTimeout(r, (res.status === 429 ? 15_000 : 2000) * attempt));
  }
  throw new Error(`Failed to fetch ${type} ${start}..${end}`);
}

const isModelOnly = (e: RawSep) => {
  const names = (e.instruments ?? []).map((i) => i.displayName ?? '');
  return names.length > 0 && names.every((n) => n.startsWith('MODEL'));
};

function toEvents(sep: RawSep[], flr: RawFlr[], cme: RawCme[]): DonkiEvent[] {
  const out: DonkiEvent[] = [];
  const sepDays = new Set<string>();
  for (const e of sep) {
    if (isModelOnly(e)) continue;
    const date = e.eventTime.slice(0, 10);
    if (sepDays.has(date)) continue;
    sepDays.add(date);
    out.push({ id: e.sepID, type: 'SEP', date, time: e.eventTime, link: e.link });
  }
  for (const e of flr) {
    if (!e.classType || !STRONG_FLARE.test(e.classType)) continue;
    const t = e.peakTime ?? e.beginTime;
    out.push({ id: e.flrID, type: 'FLR', date: t.slice(0, 10), time: t, classType: e.classType, link: e.link });
  }
  for (const e of cme) {
    const analyses = e.cmeAnalyses ?? [];
    const best = analyses.find((a) => a.isMostAccurate) ?? analyses[0];
    const marsImpact = analyses.some((a) => (a.enlilList ?? []).some((m) => (m.impactList ?? []).some((i) => i.location === 'Mars')));
    if (!marsImpact && (best?.speed ?? 0) < MIN_CME_SPEED) continue;
    out.push({ id: e.activityID, type: 'CME', date: e.startTime.slice(0, 10), time: e.startTime, speed: best?.speed, marsImpact, link: e.link });
  }
  return out;
}

const rank = (e: DonkiEvent): number =>
  e.type === 'SEP' ? 0 : e.marsImpact ? 1 : e.type === 'FLR' && (e.classType ?? '').startsWith('X') ? 2 : e.type === 'CME' ? 3 : 4;
const flareSize = (e: DonkiEvent) => (e.type === 'FLR' ? Number((e.classType ?? '').slice(1)) || 0 : 0);

function trimPerDay(events: DonkiEvent[]): DonkiEvent[] {
  const byDay = new Map<string, DonkiEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const kept: DonkiEvent[] = [];
  for (const list of byDay.values()) kept.push(...list.sort((a, b) => rank(a) - rank(b) || flareSize(b) - flareSize(a)).slice(0, MAX_EVENTS_PER_DAY));
  return kept.sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date));
}

async function download(): Promise<DonkiEvent[]> {
  const cache = `${CACHE_DIR}/donki-${START}-${END}.json`;
  if (!REFRESH && existsSync(cache)) {
    console.log(`Using cached download ${cache} (pass --refresh to download again)`);
    return JSON.parse(readFileSync(cache, 'utf8')) as DonkiEvent[];
  }
  console.log(`Fetching DONKI ${START}..${END} from ${USE_API_NASA ? `api.nasa.gov (key: ${KEY === 'DEMO_KEY' ? 'DEMO_KEY' : 'own key'}) + CCMC for flares` : 'CCMC DONKI web service'}`);
  mkdirSync(`${CACHE_DIR}/donki-chunks`, { recursive: true });
  const all: DonkiEvent[] = [];
  for (let t = Date.parse(START); t <= Date.parse(END); t += CHUNK_DAYS * DAY) {
    const s = iso(t);
    const e = iso(Math.min(t + (CHUNK_DAYS - 1) * DAY, Date.parse(END)));
    const chunkFile = `${CACHE_DIR}/donki-chunks/${s}_${e}.json`;
    if (!REFRESH && existsSync(chunkFile)) {
      all.push(...(JSON.parse(readFileSync(chunkFile, 'utf8')) as DonkiEvent[]));
      continue;
    }
    const [sep, flr, cme] = await Promise.all([get<RawSep>('SEP', s, e), get<RawFlr>('FLR', s, e), get<RawCme>('CME', s, e)]);
    const kept = toEvents(sep, flr, cme);
    const count = (type: string) => kept.filter((x) => x.type === type).length;
    console.log(`  ${s}..${e}: raw SEP ${sep.length}, FLR ${flr.length}, CME ${cme.length} -> storm days ${count('SEP')}, M/X flares ${count('FLR')}, fast/Mars CMEs ${count('CME')}`);
    writeFileSync(chunkFile, JSON.stringify(kept));
    all.push(...kept);
  }
  writeFileSync(cache, JSON.stringify(all));
  return all;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makePeriod(start: string, all: DonkiEvent[], kind: DonkiPeriod['kind']): DonkiPeriod {
  const end = addDays(start, WINDOW_DAYS - 1);
  const events = trimPerDay(all.filter((e) => e.date >= start && e.date <= end));
  return { id: `donki-${start}`, start, days: WINDOW_DAYS, kind, events };
}

function pickStormy(all: DonkiEvent[]): DonkiPeriod[] {
  const stormDays = [...new Set(all.filter((e) => e.type === 'SEP').map((e) => e.date))].sort();
  const sols = (start: string) => stormDays.map((d) => daysBetween(start, d) + 1).filter((s) => s >= 1 && s <= WINDOW_DAYS);
  const valid = (start: string) => {
    const s = sols(start);
    return s.length >= 1 && s.length <= MAX_STORM_DAYS && s.every((x) => x >= STORM_MIN_SOL && x <= STORM_MAX_SOL);
  };
  const starts = new Set<string>();
  for (const d of stormDays) for (let sol = STORM_MIN_SOL; sol <= STORM_MAX_SOL; sol++) starts.add(addDays(d, 1 - sol));
  const ok = [...starts].filter((s) => s >= START && addDays(s, WINDOW_DAYS - 1) <= END && valid(s)).sort();
  const groups = new Map<string, string[]>();
  for (const s of ok) {
    const first = stormDays.find((d) => d >= s)!;
    groups.set(first, [...(groups.get(first) ?? []), s]);
  }
  const picked: DonkiPeriod[] = [];
  let lastEnd = '';
  for (const [first, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const free = list.filter((s) => s > lastEnd);
    if (!free.length) continue;
    const start = free[hash(first) % free.length];
    picked.push(makePeriod(start, all, 'stormy'));
    lastEnd = addDays(start, WINDOW_DAYS - 1);
  }
  console.log(`Storm days (observed SEP): ${stormDays.length}; storms that fit sols ${STORM_MIN_SOL}-${STORM_MAX_SOL}: ${picked.length}`);
  return picked;
}

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

function pickCalm(all: DonkiEvent[], stormy: DonkiPeriod[]): DonkiPeriod[] {
  const busy = (start: string, end: string) => stormy.some((p) => start <= addDays(p.start, p.days - 1) && end >= p.start);
  const calm: DonkiPeriod[] = [];
  for (let t = Date.parse(START); t + (WINDOW_DAYS - 1) * DAY <= Date.parse(END); t += WINDOW_DAYS * DAY) {
    const start = iso(t);
    const end = addDays(start, WINDOW_DAYS - 1);
    if (busy(start, end)) continue;
    const p = makePeriod(start, all, 'calm');
    if (!p.events.length || p.events.some((e) => e.type === 'SEP')) continue;
    calm.push(p);
  }
  const notable = (p: DonkiPeriod) => p.events.some((e) => e.marsImpact || (e.type === 'FLR' && (e.classType ?? '').startsWith('X')));
  const best = calm.filter(notable);
  const rest = calm.filter((p) => !notable(p));
  console.log(`Calm windows with events: ${calm.length} (${best.length} with an X flare or a CME aimed at Mars)`);
  return [...spread(best, MAX_CALM), ...spread(rest, Math.max(0, MAX_CALM - best.length))];
}

async function main() {
  const all = await download();
  const allStormy = pickStormy(all);
  const hasX = (p: DonkiPeriod) => p.events.some((e) => e.type === 'FLR' && (e.classType ?? '').startsWith('X'));
  const xStormy = allStormy.filter(hasX).slice(0, MAX_STORMY);
  const stormy = [...xStormy, ...spread(allStormy.filter((p) => !hasX(p)), MAX_STORMY - xStormy.length)];
  const calm = pickCalm(all, stormy);
  const pool = [...stormy, ...calm].sort((a, b) => a.start.localeCompare(b.start));

  console.log('\nPeriods:');
  for (const p of pool) {
    const storms = p.events.filter((e) => e.type === 'SEP').map((e) => daysBetween(p.start, e.date) + 1);
    const top = p.events.filter((e) => e.type === 'FLR').sort((a, b) => rank(a) - rank(b) || flareSize(b) - flareSize(a))[0];
    console.log(`  ${p.id} ${p.kind.padEnd(6)} storm sols [${storms.join(',')}]  events ${p.events.length}${top ? `  top flare ${top.classType}` : ''}${p.events.some((e) => e.marsImpact) ? '  Mars CME' : ''}`);
  }
  console.log(`\n${pool.length} periods: ${stormy.length} stormy, ${calm.length} calm`);

  if (DRY) {
    console.log('--dry: nothing written.');
    return;
  }
  const file: DonkiFile = {
    stub: false,
    generatedAt: new Date().toISOString(),
    source: `NASA DONKI (${USE_API_NASA ? 'api.nasa.gov + ' : ''}ccmc.gsfc.nasa.gov/DONKI), ${START}..${END}: observed SEP (one per day), M/X flares, CMEs >= ${MIN_CME_SPEED} km/s or aimed at Mars`,
    periods: pool,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  console.log(`Wrote ${pool.length} periods to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
