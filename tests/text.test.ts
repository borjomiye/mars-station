// The sentences of the game live in src/data/en.json ("text"). Code may only use keys that exist there.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t, textKeys } from '../src/engine/text';

const files = ['src/engine', 'src/ui'].flatMap((d) => readdirSync(d).filter((f) => /\.tsx?$/.test(f)).map((f) => `${d}/${f}`));
const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const used = new Set([...source.matchAll(/\bt\(\s*'([a-zA-Z0-9.]+)'/g)].map((m) => m[1]));
// keys built from a prefix, e.g. t(`report.greenhouse${...}Power${...}`)
const dynamic = ['report.greenhouseNoPowerOneSol', 'report.greenhouseNoPowerSols', 'report.greenhouseLowPowerOneSol', 'report.greenhouseLowPowerSols'];

describe('texts in en.json', () => {
  it('every key used in the code exists', () => {
    for (const k of used) expect(textKeys(), k).toContain(k);
  });
  it('no key is left unused', () => {
    for (const k of textKeys()) expect(used.has(k) || dynamic.includes(k), k).toBe(true);
  });
  it('a missing key fails loudly', () => {
    expect(() => t('nope.missing')).toThrow();
  });
  it('values are filled in and text is plain', () => {
    expect(t('sol.fixed', { name: 'Leo' })).toBe('Leo fixed!');
    for (const k of textKeys()) expect(t(k, {})).not.toMatch(/^\s*$/);
  });
});
