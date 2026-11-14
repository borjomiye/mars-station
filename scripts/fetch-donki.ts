// Downloads real NASA DONKI events (SEP, FLR, CME), cuts them into 15-day periods and writes
// src/data/donki-periods.json. Run once by the data owner (P4); the game never calls the API.
//
// Usage:
//   npm run fetch:donki -- [startDate=2020-01-01] [endDate=2025-12-31] [--dry] [--api-nasa]
//   --dry       only prints storm statistics per window, does not write the file
//   --api-nasa  use api.nasa.gov (needs NASA_API_KEY in .env) instead of the CCMC web service
//
// Default source: NASA CCMC DONKI web service (ccmc.gsfc.nasa.gov/DONKI/WS), the origin of the
// api.nasa.gov DONKI endpoints. No key needed, max 60 days per request.
// Note (Nov 2026): api.nasa.gov/DONKI/FLR returned 404, so flares always come from CCMC.
// GST (geomagnetic storms) are skipped on purpose: they are about Earth's magnetic field, Mars has none.
import { existsSync, writeFileSync } from 'node:fs';
import type { DonkiEvent, DonkiFile, DonkiPeriod } from '../src/engine/types';

if (existsSync('.env')) process.loadEnvFile('.env');
const KEY = process.env.NASA_API_KEY ?? 'DEMO_KEY';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const USE_API_NASA = process.argv.includes('--api-nasa');
const START = args[0] ?? '2020-01-01';
const END = args[1] ?? '2025-12-31';
const WINDOW_DAYS = 15;
const CHUNK_DAYS = 30; // CCMC allows at most 60 days per request
const OUT = 'src/data/donki-periods.json';
const DAY = 86_400_000;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

type RawSep = { sepID: string; eventTime: string; link: string };
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
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      return text.trim() ? (JSON.parse(text) as T[]) : [];
    }
    console.warn(`  ${type} ${start}..${end}: HTTP ${res.status} (attempt ${attempt})`);
    if (res.status === 429) throw new Error('Rate limit hit. Use your own NASA_API_KEY in .env.');
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`Failed to fetch ${type} ${start}..${end}`);
}

// Filters keep the game readable: one morning line per notable event, not hundreds.
const MIN_CME_SPEED = 1000; // km/s: fast CMEs, or any CME the ENLIL model sends to Mars
const STRONG_FLARE = /^[MX]/; // M and X class flares only
const MAX_STORM_DAYS = Number(process.env.MAX_STORM_DAYS ?? 3); // more storm days per 15 sols is unwinnable

function toEvents(sep: RawSep[], flr: RawFlr[], cme: RawCme[]): DonkiEvent[] {
  const out: DonkiEvent[] = [];
  // DONKI lists one SEP per instrument/threshold; the game needs one storm per day.
  const sepDays = new Set<string>();
  for (const e of sep) {
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
  return out.sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date));
}

async function main() {
  console.log(`Fetching DONKI ${START}..${END} from ${USE_API_NASA ? `api.nasa.gov (key: ${KEY === 'DEMO_KEY' ? 'DEMO_KEY' : 'own key'}) + CCMC for flares` : 'CCMC DONKI web service'}`);
  const all: DonkiEvent[] = [];
  for (let t = Date.parse(START); t <= Date.parse(END); t += CHUNK_DAYS * DAY) {
    const s = iso(t);
    const e = iso(Math.min(t + (CHUNK_DAYS - 1) * DAY, Date.parse(END)));
    const [sep, flr, cme] = await Promise.all([get<RawSep>('SEP', s, e), get<RawFlr>('FLR', s, e), get<RawCme>('CME', s, e)]);
    const kept = toEvents(sep, flr, cme);
    const count = (type: string) => kept.filter((x) => x.type === type).length;
    console.log(`  ${s}..${e}: raw SEP ${sep.length}, FLR ${flr.length}, CME ${cme.length} -> kept storm days ${count('SEP')}, M/X flares ${count('FLR')}, fast/Mars CMEs ${count('CME')}`);
    all.push(...kept);
  }

  // Cut into non-overlapping 15-day windows; keep only windows that have data.
  const periods: DonkiPeriod[] = [];
  const stormDayHistogram = new Map<number, number>();
  let totalWindows = 0;
  let tooStormy = 0;
  for (let t = Date.parse(START); t + (WINDOW_DAYS - 1) * DAY <= Date.parse(END); t += WINDOW_DAYS * DAY) {
    totalWindows++;
    const start = iso(t);
    const end = iso(t + (WINDOW_DAYS - 1) * DAY);
    const events = all.filter((e) => e.date >= start && e.date <= end);
    const stormDays = events.filter((e) => e.type === 'SEP').length; // already one per day
    stormDayHistogram.set(stormDays, (stormDayHistogram.get(stormDays) ?? 0) + 1);
    if (events.length === 0) continue;
    if (stormDays > MAX_STORM_DAYS) {
      tooStormy++;
      continue;
    }
    periods.push({ id: `donki-${start}`, start, days: WINDOW_DAYS, kind: stormDays > 0 ? 'stormy' : 'calm', events });
  }

  const stormy = periods.filter((p) => p.kind === 'stormy');
  const calm = periods.filter((p) => p.kind === 'calm');
  console.log(`\nWindows: ${totalWindows}, usable: ${periods.length}, stormy (1-${MAX_STORM_DAYS} storm days): ${stormy.length}, calm: ${calm.length}, dropped as too stormy: ${tooStormy}`);
  console.log('Storm (SEP) days per window -> number of windows:');
  for (const [n, c] of [...stormDayHistogram.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${n} days: ${c}`);

  // Pool: all stormy windows + the same number of calm windows that still have flares/CMEs.
  const calmPick = calm.filter((p) => p.events.length >= 1).slice(0, Math.max(stormy.length, 3));
  const pool = [...stormy, ...calmPick].sort((a, b) => a.start.localeCompare(b.start));

  if (DRY) {
    console.log(`\n--dry: would write ${pool.length} periods (${stormy.length} stormy, ${calmPick.length} calm). Nothing written.`);
    return;
  }
  const file: DonkiFile = {
    stub: false,
    generatedAt: new Date().toISOString(),
    source: `NASA DONKI (${USE_API_NASA ? "api.nasa.gov + " : ""}ccmc.gsfc.nasa.gov/DONKI), ${START}..${END}: SEP (one per day), M/X flares, CMEs >= ${MIN_CME_SPEED} km/s or aimed at Mars`,
    periods: pool,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  console.log(`\nWrote ${pool.length} periods to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
