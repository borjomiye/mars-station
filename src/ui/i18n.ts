// Text lookup. All player-facing text lives in src/data/en.json.
import en from '../data/en.json';

const texts = en as Record<string, string>;

/** t('key', {param}) - params that are themselves text keys (e.g. crew names) get translated too. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = texts[key];
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`Missing text: ${key}`);
    return key;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params?.[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === 'string' && v in texts ? texts[v] : String(v);
  });
}
