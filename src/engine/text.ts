import textJson from '../data/en.json';

const texts = textJson.text as Record<string, string>;

export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = texts[key];
  if (template === undefined) throw new Error(`Missing text: ${key}`);
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export const textKeys = (): string[] => Object.keys(texts);
