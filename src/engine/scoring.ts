// Stars, the Captain's report and "the one decision that mattered most".
import type { GameState, MissionReport, RealEvent } from './types';
import { cardDef, cfg } from './content';
import { badgeOf, fmt, plural } from './rules';

type Run = { a: number; b: number; zero: boolean };

export function matteredMost(s: GameState): string {
  const c = cfg(s.mode);
  if (!s.over || s.over.won) return '';
  if (s.over.why === 'food') {
    const want = c.SYSTEMS.greenhouse.want;
    let best: Run | null = null, run: Run | null = null;
    for (const r of s.log) {
      if (r.cells.greenhouse < want) {
        const cur: Run = run ?? { a: r.sol, b: r.sol, zero: true };
        cur.b = r.sol;
        if (r.cells.greenhouse > 0) cur.zero = false;
        run = cur;
        if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur };
      } else run = null;
    }
    if (best) return 'The greenhouse had ' + (best.zero ? 'no' : 'too little') + ' power on sol' + (best.a === best.b ? ' ' + best.a : 's ' + best.a + '–' + best.b) + '.';
    return 'Only ' + plural(s.counters.harvests, 'harvest') + ' came in. More hands in the greenhouse would help.';
  }
  const sums: Record<string, { lost: number; sols: number }> = {};
  for (const r of s.log) for (const a of r.air) if (a.d < 0) { const k = sums[a.key] || (sums[a.key] = { lost: 0, sols: 0 }); k.lost -= a.d; k.sols++; }
  const top = Object.keys(sums).sort((a, b) => sums[b].lost - sums[a].lost)[0];
  if (!top) return 'Air & water ran out.';
  const tail = ' (−' + fmt(sums[top].lost) + ' air & water).';
  if (top === 'life') return 'Life support was short of power on ' + plural(sums[top].sols, 'sol') + tail;
  return 'The ' + c.PROBLEMS[top].name.toLowerCase() + ' leaked for ' + plural(sums[top].sols, 'sol') + tail + ' Fix it early.';
}

export function endMission(s: GameState): MissionReport {
  const c = cfg(s.mode), won = !!(s.over && s.over.won);
  const badges = s.crew.map((p) => badgeOf(c, p.dose));
  const noMed = s.counters.medbaySols === 0, allGreen = badges.every((b) => b === 'green');
  const third = c.THIRD_STAR_RULE === 'medbay' ? noMed : c.THIRD_STAR_RULE === 'green' ? allGreen : noMed && allGreen;
  const stars: [boolean, boolean, boolean] = [won, s.science >= c.SCIENCE_TARGET, won && third], hints: [string, string, string] = ['', '', ''];
  if (!stars[0]) hints[0] = matteredMost(s);
  if (!stars[1]) {
    const unsent = s.cards.found.filter((id) => !s.cards.sent.includes(id));
    const pot = s.science + unsent.reduce((a, id) => a + c.SCIENCE_PER_CARD[cardDef(id).kind], 0);
    hints[1] = pot >= c.SCIENCE_TARGET ? plural(unsent.length, 'card') + ' never went home. Send the science report.'
      : 'Only ' + plural(s.cards.found.length, 'card') + ' found. Take chances and power the lab.';
  }
  if (!stars[2]) {
    const m = s.crew.find((p) => p.medbaySols > 0), i = badges.findIndex((b) => b !== 'green');
    if (!won) hints[2] = 'Reach sol ' + c.MISSION_SOLS + ' first.';
    else if (m && c.THIRD_STAR_RULE !== 'green') hints[2] = m.name + ' spent ' + plural(m.medbaySols, 'sol') + ' in the medbay after ' + m.medbayCause + '.';
    else if (i >= 0) hints[2] = s.crew[i].name + "'s badge turned " + badges[i] + ': ' + plural(s.crew[i].trips, 'trip') + ' outside' + (s.crew[i].stormExtra > 0.01 ? ' and storm dose.' : '.');
  }
  const real: (RealEvent & { sol: number })[] = [];
  for (const d of s.schedule) if (d.sol <= s.sol) for (const e of d.real) real.push({ sol: d.sol, ...e });
  return {
    won, why: s.over ? s.over.why : '', sol: s.sol, stars, starCount: stars.filter(Boolean).length, hints, mattered: matteredMost(s),
    doses: s.crew.map((p, i) => ({ name: p.name, role: p.role, dose: p.dose, badge: badges[i], trips: p.trips, medbaySols: p.medbaySols })),
    science: s.science, target: c.SCIENCE_TARGET, found: s.cards.found.slice(), sent: s.cards.sent.slice(), real,
  };
}
