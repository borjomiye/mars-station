// The mission patch: a frame, a cloth colour and an emblem, all chosen from the mission name.
// The same name always gives the same patch, so a child can "design" it by typing a name.
import { patchArt } from './art';

const BORDERS = ['circle', 'shield', 'hexagon', 'square'] as const;
const EMBLEMS = ['rocket', 'sprout', 'rover', 'otter'] as const;
const CLOTHS = 4; // --patch-cloth-1 … --patch-cloth-4 in theme.css

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.trim().toLowerCase()) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function MissionPatch({ name, size = 96 }: { name: string; size?: number }) {
  const h = hash(name || 'Brave Otter');
  const border = BORDERS[h % 4], emblem = EMBLEMS[(h >>> 2) % 4], cloth = 1 + ((h >>> 4) % CLOTHS);
  return (
    <span className={`patch patch-${border}`} style={{ width: size, height: size, ['--cloth' as string]: `var(--patch-cloth-${cloth})` }}
      role="img" aria-label={`Mission patch for ${name || 'your mission'}`}>
      <span className="patch-cloth" />
      <img className="patch-emblem" src={patchArt(`emblem-${emblem}`)} alt="" />
      <img className="patch-border" src={patchArt(`border-${border}`)} alt="" />
    </span>
  );
}
