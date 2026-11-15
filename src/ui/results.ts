import { badgeOf, cardDef, cfg, fmt, type GameState } from '../engine';
import type { RoomId } from './art';
import { PROBLEM_ROOM, type Note } from './Station';

type Notes = Partial<Record<RoomId | 'outside', Note[]>>;

export function resultNotes(prev: GameState | null, s: GameState): Notes {
  const c = cfg(s), out: Notes = {}, last = s.log[s.log.length - 1], b = s.today.before;
  const add = (room: RoomId | 'outside', n: Note) => { (out[room] ??= []).push(n); };
  if (!last || last.sol !== s.sol || !b) return out;

  const steps = s.crop - b.crop + last.harvests * c.CROP_STEPS_TO_HARVEST;
  if (last.harvests > 0) add('greenhouse', { text: `Harvest! Food +${c.HARVEST_FOOD * last.harvests}`, icon: 'food', tone: 'good' });
  if (steps > 0) add('greenhouse', { text: `Crop +${fmt(steps)}`, icon: 'crop', tone: 'good' });
  else if (last.cells.greenhouse === 0) add('greenhouse', { text: 'Crops wait', icon: 'crop', tone: 'bad' });

  const air = s.air - b.air;
  if (air !== 0) add('workshop', { text: `Air ${air > 0 ? '+' : '−'}${fmt(Math.abs(air))}`, icon: 'air', tone: air > 0 ? 'good' : 'bad' });

  if (prev) {
    for (const p of prev.problems) {
      if (s.problems.some((q) => q.uid === p.uid)) continue;
      const room = PROBLEM_ROOM[p.type] ?? 'outside';
      add(room, { text: `${c.PROBLEMS[p.type].name} fixed!`, icon: 'repair', tone: 'good' });
    }
    for (const p of s.problems) {
      const was = prev.problems.find((q) => q.uid === p.uid);
      if (was && p.severity > was.severity) add(PROBLEM_ROOM[p.type] ?? 'outside', { text: `${c.PROBLEMS[p.type].name} got worse`, icon: 'warning', tone: 'bad' });
    }
  }

  const found = prev ? s.cards.found.filter((id) => !prev.cards.found.includes(id)) : [];
  for (const id of found) {
    const k = cardDef(id);
    const again = (s.cards.owned ?? []).includes(id);
    add(k.kind === 'lab' ? 'lab' : k.kind === 'chance' ? 'outside' : 'radio', { text: again ? `Seen again: ${k.title}` : `New card: ${k.title}`, icon: 'card-back', tone: again ? 'plain' : 'good' });
  }
  if (prev && s.samples > prev.samples) add('outside', { text: `Sample +${fmt(s.samples - prev.samples)}`, icon: 'rock-sample', tone: 'good' });

  if (prev) {
    for (const p of s.crew) {
      const was = prev.crew.find((q) => q.id === p.id);
      if (!was) continue;
      if (p.medbay > 0 && was.medbay <= 0) add('medbay', { text: `${p.name} → medbay`, icon: 'sick', tone: 'bad' });
      if (p.medbay <= 0 && was.medbay > 0) add('medbay', { text: `${p.name} is well`, icon: 'medbay', tone: 'good' });
      if (p.cond === 'tired' && was.cond !== 'tired') add('medbay', { text: `${p.name} is tired`, icon: 'tired', tone: 'bad' });
      if (p.cond !== 'tired' && was.cond === 'tired') add('medbay', { text: `${p.name} rested`, icon: 'sleep', tone: 'good' });
      const b0 = badgeOf(c, was.dose), b1 = badgeOf(c, p.dose);
      if (b1 !== b0) add('medbay', { text: `${p.name}: badge ${b1}`, icon: `badge-${b1}`, tone: 'bad' });
    }
  }
  return out;
}
