// Downloads real NASA DONKI events (SEP, FLR, CME), cuts them into 15-day periods and writes
// src/data/donki-periods.json. Run once by the data owner (P4); the game never calls the API.
//
// Usage:
//   npm run fetch:donki -- [startDate=2020-01-01] [endDate=2025-12-31] [--dry]
//   --dry  only prints SEP statistics per window, does not write the file
//
// Needs NASA_API_KEY in .env (get one at https://api.nasa.gov). DEMO_KEY is rate limited.
// GST (geomagnetic storms) are skipped on purpose: they are about Earth's magnetic field, Mars has none.
import { existsSync, writeFileSync } from 'node:fs';
import type { DonkiEvent, DonkiFile, DonkiPeriod } from '../src/engine/types';

if (existsSync('.env')) process.loadEnvFile('.env');
const KEY = process.env.NASA_API_KEY ?? 'DEMO_KEY';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const START = args[0] ?? '2020-01-01';
const END = args[1] ?? '2025-12-31';
const WINDOW_DAYS = 15;
const CHUNK_DAYS = 120; // request size per API call
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
  let url = `https://api.nasa.gov/DONKI/${type}?startDate=${start}&endDate=${end}&api_key=${KEY}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      return text.trim() ? (JSON.parse(text) as T[]) : [];
    }
    console.warn(`  ${type} ${start}..${end}: HTTP ${res.status} (attempt ${attempt})`);
    if (res.status === 429) throw new Error('Rate limit hit. Use your own NASA_API_KEY in .env.');
    if (res.status === 404) {
      // api.nasa.gov returned 404 for FLR in Nov 2026; the public CCMC DONKI web service still serves it.
      url = `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/${type}?startDate=${start}&endDate=${end}`;
      continue;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`Failed to fetch ${type} ${start}..${end}`);
}

function toEvents(sep: RawSep[], flr: RawFlr[], cme: RawCme[]): DonkiEvent[] {
  const out: DonkiEvent[] = [];
  for (const e of sep) out.push({ id: e.sepID, type: 'SEP', date: e.eventTime.slice(0, 10), time: e.eventTime, link: e.link });
  for (const e of flr) {
    const t = e.peakTime ?? e.beginTime;
    out.push({ id: e.flrID, type: 'FLR', date: t.slice(0, 10), time: t, classType: e.classType, link: e.link });
  }
  for (const e of cme) {
    const analyses = e.cmeAnalyses ?? [];
    const best = analyses.find((a) => a.isMostAccurate) ?? analyses[0];
    const marsImpact = analyses.some((a) => (a.enlilList ?? []).some((m) => (m.impactList ?? []).some((i) => i.location === 'Mars')));
    out.push({ id: e.activityID, type: 'CME', date: e.startTime.slice(0, 10), time: e.startTime, speed: best?.speed, marsImpact, link: e.link });
  }
  return out.sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date));
}

async function main() {
  console.log(`Fetching DONKI ${START}..${END} (key: ${KEY === 'DEMO_KEY' ? 'DEMO_KEY' : 'own key'})`);
  const all: DonkiEvent[] = [];
  for (let t = Date.parse(START); t <= Date.parse(END); t += CHUNK_DAYS * DAY) {
    const s = iso(t);
    const e = iso(Math.min(t + (CHUNK_DAYS - 1) * DAY, Date.parse(END)));
    const [sep, flr, cme] = await Promise.all([get<RawSep>('SEP', s, e), get<RawFlr>('FLR', s, e), get<RawCme>('CME', s, e)]);
    console.log(`  ${s}..${e}: SEP ${sep.length}, FLR ${flr.length}, CME ${cme.length}`);
    all.push(...toEvents(sep, flr, cme));
  }

  // Cut into non-overlapping 15-day windows; keep only windows that have data.
  const periods: DonkiPeriod[] = [];
  const sepHistogram = new Map<number, number>();
  let totalWindows = 0;
  for (let t = Date.parse(START); t + (WINDOW_DAYS - 1) * DAY <= Date.parse(END); t += WINDOW_DAYS * DAY) {
    totalWindows++;
    const start = iso(t);
    const end = iso(t + (WINDOW_DAYS - 1) * DAY);
    const events = all.filter((e) => e.date >= start && e.date <= end);
    const seps = events.filter((e) => e.type === 'SEP').length;
    sepHistogram.set(seps, (sepHistogram.get(seps) ?? 0) + 1);
    if (events.length === 0) continue;
    periods.push({ id: `donki-${start}`, start, days: WINDOW_DAYS, kind: seps > 0 ? 'stormy' : 'calm', events });
  }

  const stormy = periods.filter((p) => p.kind === 'stormy');
  const calm = periods.filter((p) => p.kind === 'calm');
  console.log(`\nWindows: ${totalWindows}, with data: ${periods.length}, stormy (>=1 SEP): ${stormy.length}, calm: ${calm.length}`);
  console.log('SEP per window -> number of windows:');
  for (const [n, count] of [...sepHistogram.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${n} SEP: ${count}`);

  // Pool: all stormy windows + the same number of calm windows that still have flares/CMEs.
  const calmPick = calm.filter((p) => p.events.length >= 2).slice(0, Math.max(stormy.length, 3));
  const pool = [...stormy, ...calmPick].sort((a, b) => a.start.localeCompare(b.start));

  if (DRY) {
    console.log(`\n--dry: would write ${pool.length} periods (${stormy.length} stormy, ${calmPick.length} calm). Nothing written.`);
    return;
  }
  const file: DonkiFile = {
    stub: false,
    generatedAt: new Date().toISOString(),
    source: `NASA DONKI via api.nasa.gov, ${START}..${END}, types SEP/FLR/CME`,
    periods: pool,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  console.log(`\nWrote ${pool.length} periods to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
