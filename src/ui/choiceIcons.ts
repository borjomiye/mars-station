// A small picture for each "+" and "−" line on choice cards, picked from the words in the line (UI only).
// Children read the picture first; the text is there for the details.
const RULES: [RegExp, string][] = [
  [/\bstar\b/i, 'star-empty'],
  [/\bshield\b/i, 'shield'],
  [/\bdose\b|radiation/i, 'flare'],
  [/air/i, 'air'],
  [/medbay|heal|\bill\b|patient|doctor/i, 'medbay'],
  [/\brest\b|bunk|sleep/i, 'sleep'],
  [/forecast|weather/i, 'weather-clear'],
  [/crop|greenhouse/i, 'crop'],
  [/food|harvest/i, 'food'],
  [/sample/i, 'rock-sample'],
  [/science|card|\blab\b|discovery/i, 'science'],
  [/message|radio|question/i, 'radio'],
  [/fix|repair|rewire|grows? worse|may grow/i, 'repair'],
  [/outside|trip/i, 'helmet'],
  [/\bjobs?\b|work/i, 'job'],
  [/inside/i, 'hull'],
  [/cell|power|panel|dark|battery|sunset/i, 'cell'],
];

export function choiceIcon(text: string, side: 'plus' | 'minus'): string {
  for (const [re, name] of RULES) if (re.test(text)) return name;
  return side === 'plus' ? 'star' : 'warning';
}
