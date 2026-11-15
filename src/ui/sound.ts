import { useEffect, useSyncExternalStore, type DependencyList } from 'react';

type Wave = 'square' | 'triangle' | 'sine' | 'sawtooth' | 'noise';
type Note = { f: number; to?: number; at?: number; d: number; wave?: Wave; vol?: number; attack?: number };

const MUTE_KEY = 'mars-station-muted';
const MASTER = 0.32;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
let muted = readMuted();
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    out = ctx.createGain();
    out.gain.value = MASTER;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 7000;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -12;
    out.connect(soft).connect(limit).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function play(notes: Note[]): void {
  const c = audio();
  if (!c || !out) return;
  const now = c.currentTime + 0.01;
  for (const n of notes) {
    const t0 = now + (n.at ?? 0), t1 = t0 + n.d, vol = n.vol ?? 0.5, attack = n.attack ?? 0.004;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    env.connect(out);
    if (n.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.2;
      band.frequency.setValueAtTime(n.f, t0);
      if (n.to) band.frequency.exponentialRampToValueAtTime(n.to, t1);
      src.connect(band).connect(env);
      src.start(t0);
      src.stop(t1 + 0.02);
    } else {
      const osc = c.createOscillator();
      osc.type = n.wave ?? 'square';
      osc.frequency.setValueAtTime(n.f, t0);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t1);
      osc.connect(env);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }
}

const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;
const SCALE = [C5, D5, E5, F5, G5, A5, 987.77, C6];
const arp = (fs: number[], step: number, d: number, wave: Wave = 'square', vol = 0.35, at = 0): Note[] =>
  fs.map((f, i) => ({ f, at: at + i * step, d, wave, vol }));

let lastType = 0;

export const sfx = {
  click: () => play([{ f: 1400, to: 900, d: 0.045, vol: 0.22 }]),
  soft: () => play([{ f: 900, to: 700, d: 0.05, wave: 'triangle', vol: 0.4 }]),
  confirm: () => play(arp([G5, C6], 0.06, 0.09, 'square', 0.28)),
  cell: (n: number, up: boolean) => {
    const f = SCALE[Math.max(0, Math.min(SCALE.length - 1, n))];
    play(up ? [{ f, d: 0.07, vol: 0.3 }, { f: f * 2, at: 0.035, d: 0.05, wave: 'triangle', vol: 0.25 }]
      : [{ f: f * 0.9, to: f * 0.7, d: 0.08, wave: 'triangle', vol: 0.45 }]);
  },
  pick: (on: boolean) => play([{ f: on ? 780 : 620, to: on ? 1040 : 470, d: 0.07, wave: 'triangle', vol: 0.45 }]),
  type: () => {
    const c = audio();
    if (!c || c.currentTime - lastType < 0.05) return;
    lastType = c.currentTime;
    play([{ f: 560 + Math.random() * 260, d: 0.03, wave: 'square', vol: 0.09 }]);
  },
  good: () => play(arp([E6, G6], 0.05, 0.12, 'triangle', 0.4)),
  bad: () => play([{ f: 260, to: 170, d: 0.18, wave: 'square', vol: 0.18 }, { f: 400, to: 200, d: 0.12, wave: 'noise', vol: 0.12 }]),
  harvest: () => play(arp([C5, E5, G5, C6], 0.06, 0.12, 'triangle', 0.45)),
  card: () => play([...arp([C6, E6, G6, C6 * 2], 0.045, 0.08, 'square', 0.16), { f: 6000, to: 9000, d: 0.25, wave: 'noise', vol: 0.06, at: 0.05 }]),
  alarm: () => play([0, 0.26].flatMap((at) => [{ f: 880, at, d: 0.11, vol: 0.2 }, { f: 660, at: at + 0.12, d: 0.12, vol: 0.2 }])),
  storm: () => play([
    { f: 120, to: 60, d: 1.1, wave: 'noise', vol: 0.35, attack: 0.2 },
    { f: 1800, to: 900, d: 0.9, wave: 'noise', vol: 0.08, attack: 0.3 },
    ...[0.35, 0.65].map((at) => ({ f: 740, to: 520, at, d: 0.22, wave: 'square' as const, vol: 0.16 })),
  ]),
  chance: () => play(arp([C5, E5, G5, C6, E6], 0.05, 0.14, 'triangle', 0.4)),
  radio: () => play([0, 0.1, 0.2, 0.38, 0.48].map((at, i) => ({ f: 1200, at, d: i === 2 ? 0.14 : 0.06, wave: 'sine' as const, vol: 0.3 }))),
  staticHiss: () => play([{ f: 2400, to: 1200, d: 0.35, wave: 'noise', vol: 0.12, attack: 0.05 }]),
  star: (i: number) => play([{ f: [E5, G5, C6][i] ?? C6, d: 0.22, wave: 'square', vol: 0.22 }, { f: ([E5, G5, C6][i] ?? C6) * 2, at: 0.02, d: 0.3, wave: 'triangle', vol: 0.3 }]),
  win: () => play([...arp([C5, E5, G5], 0.11, 0.14, 'square', 0.22), { f: C6, at: 0.33, d: 0.55, wave: 'square', vol: 0.22 }, { f: E6, at: 0.33, d: 0.55, wave: 'triangle', vol: 0.25 }]),
  lose: () => play(arp([G5, F5, D5, C5], 0.14, 0.2, 'triangle', 0.4)),
  launch: () => play([{ f: 200, to: 2600, d: 0.7, wave: 'noise', vol: 0.25, attack: 0.15 }, ...arp([C5, G5, C6], 0.08, 0.3, 'square', 0.18, 0.45)]),
  open: () => play([{ f: 500, to: 900, d: 0.08, wave: 'triangle', vol: 0.45 }]),
  close: () => play([{ f: 900, to: 500, d: 0.08, wave: 'triangle', vol: 0.45 }]),
};
export type SfxName = keyof typeof sfx;

export function isMuted(): boolean { return muted; }
export function setMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { }
  if (v && ctx) void ctx.suspend();
  listeners.forEach((f) => f());
  if (!v) sfx.click();
}
export function useMuted(): boolean {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => muted, () => false);
}

export function useScreenSounds(make: () => [number, () => void][], deps: DependencyList): void {
  useEffect(() => {
    const ids = make().map(([ms, f]) => window.setTimeout(f, ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, deps);
}

export function buttonSound(target: EventTarget | null): void {
  const b = target instanceof Element ? target.closest('button') : null;
  if (!b || b.disabled) return;
  const name = b.dataset.sfx ?? (b.classList.contains('big') || b.classList.contains('launch') ? 'confirm' : b.classList.contains('secondary') ? 'soft' : 'click');
  if (name === 'none') return;
  const f = sfx[name as SfxName] as (() => void) | undefined;
  if (f && f.length === 0) f();
}
