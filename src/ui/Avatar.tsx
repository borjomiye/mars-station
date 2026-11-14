// The station helper. Placeholder face: P6 replaces it with an SVG character with 3 moods.
import type { LogEntry, Mood } from '../engine';
import { t } from './i18n';

const FACE: Record<Mood, string> = { calm: '🙂', worried: '😟', happy: '😄' };

export function Avatar({ lines }: { lines: LogEntry[] }) {
  if (lines.length === 0) return null;
  const mood = lines.some((l) => l.mood === 'worried') ? 'worried' : lines[lines.length - 1].mood;
  return (
    <section className="panel avatar" aria-live="polite">
      <div className="avatar-face" aria-hidden>{FACE[mood]}</div>
      <div className="avatar-lines">
        {lines.map((l, i) => (
          <div key={i}>
            <p>
              {t(l.key, l.params)}{' '}
              {l.sourceLink && (
                <a className="source" href={l.sourceLink} target="_blank" rel="noreferrer">[NASA source]</a>
              )}
            </p>
            {l.termKey && <p className="term">{t(l.termKey)}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
