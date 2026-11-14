// Morning: a full-screen scene, the robot walks in and tells the report line by line (typed).
// Tap the bubble to finish a line, "Skip" shows all. Reduced motion shows all at once.
import { useEffect, useMemo, useState } from 'react';
import { stormOn, today, type GameState } from '../engine';
import { robotArt, scene } from './art';
import { BeatLine, beatsOf } from './bits';

const CHARS_PER_TICK = 2, TICK_MS = 33, PAUSE_MS = 650;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function MorningScreen({ s, onNext }: { s: GameState; onNext: () => void }) {
  const beats = useMemo(() => beatsOf(s), [s]);
  const [shown, setShown] = useState(() => (reducedMotion() ? beats.length : 1));
  const [typed, setTyped] = useState(() => (reducedMotion() ? Infinity : 0));
  const cur = beats[shown - 1], curLen = cur && cur.kind !== 'real' ? cur.text.length : 0;
  const typing = typed < curLen, done = shown >= beats.length && !typing;

  useEffect(() => {
    if (typing) { const id = setTimeout(() => setTyped((t) => t + CHARS_PER_TICK), TICK_MS); return () => clearTimeout(id); }
    if (shown < beats.length) { const id = setTimeout(() => { setShown((n) => n + 1); setTyped(0); }, PAUSE_MS); return () => clearTimeout(id); }
    return undefined;
  }, [typing, typed, shown, beats.length]);

  const tap = () => { if (typing) setTyped(Infinity); else if (shown < beats.length) { setShown((n) => n + 1); setTyped(0); } };
  const skip = () => { setShown(beats.length); setTyped(Infinity); };
  const day = today(s), storm = !!stormOn(s), alarm = beats.some((b) => b.kind === 'alert');
  const bg = storm ? 'scene-radiation-storm' : day.weather === 'dust' ? 'scene-dust-storm' : 'scene-station';

  return (
    <div className="screen morning">
      <img className="screen-bg" src={scene(bg)} alt="" />
      <div className="morning-shade" />
      <h1 className="morning-title">Good morning, Captain · Sol {s.sol}</h1>
      <img className={`morning-robot${typing ? ' talking' : ''}`} src={robotArt(alarm ? 'robot-point' : 'robot-tablet')} alt="Station helper robot" />
      <div className="morning-talk">
        <ul className="sr-only">
          {beats.map((b, i) => <li key={i}>{b.text}{b.small ? ` (${b.small})` : ''}{b.real && <> {b.real.note}. <a href={b.real.link} target="_blank" rel="noreferrer">NASA DONKI</a></>}</li>)}
        </ul>
        <div className={`talk-bubble${beats.length > 9 ? ' dense' : ''}`} aria-hidden="true" onClick={tap}>
          {beats.slice(0, shown).map((b, i) => {
            const last = i === shown - 1;
            return <div key={i} className="pop"><BeatLine b={b} text={last && b.kind !== 'real' ? b.text.slice(0, typed) : undefined} caret={last && typing} linkTab={-1} /></div>;
          })}
        </div>
        <div className="morning-buttons">
          {!done && <button className="secondary" onClick={skip}>Skip ▶▶</button>}
          <button className={done ? 'big' : 'secondary'} onClick={onNext}>To the station ▶</button>
        </div>
      </div>
    </div>
  );
}

/** The same report, kept for re-reading while planning. */
export function MorningRecap({ s }: { s: GameState }) {
  const beats = useMemo(() => beatsOf(s), [s]);
  return <div className="talk-bubble static">{beats.map((b, i) => <BeatLine key={i} b={b} />)}</div>;
}
