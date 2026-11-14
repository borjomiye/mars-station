// Deterministic RNG (mulberry32). Owner: P1.
// Two streams:
//  - schedule: created from the seed in newGame(); decides site, DONKI period and the event of every sol.
//  - decisions: its state lives in GameState.decisionRng; used for outcomes that depend on choices.
// So the same seed gives the whole class the same events, whatever each student decides.

/** One step of the serializable stream: returns [value in 0..1, next state]. */
export function nextRandom(rngState: number): [number, number] {
  const next = (rngState + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

export function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function pickWeighted<T extends { weight: number }>(rand: () => number, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
