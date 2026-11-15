// Morning briefing (design "variant A"): Mars sky and ground, the robot tells the news in a speech bubble
// (typed line by line), and a board shows space weather, the station and what is new today.
// Tap the bubble to finish a line. Reduced motion shows all lines at once.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cfg, fmt, getMorning, knownForecast, type GameState, type Weather } from '../engine';
import { icon, robotArt } from './art';
import { BeatLine, beatsOf, talkOf, type Beat } from './bits';
import skyArt from '../assets/briefing/stars.svg';
import groundArt from '../assets/briefing/ground.svg';
import tailArt from '../assets/briefing/tail.svg';
import okArt from '../assets/briefing/ok.svg';
import stationArt from '../assets/briefing/station.svg';
import newArt from '../assets/briefing/new-today.svg';

const CHARS_PER_TICK = 2, TICK_MS = 33, PAUSE_MS = 650;
/** Today plus at most this many forecast sols fit on the board. */
const MAX_FORECAST = 3;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SKY: Record<Weather, { label: string; art: string }> = {
  clear: { label: 'Clear', art: 'weather-clear' },
  hazy: { label: 'Hazy', art: 'weather-clearing' },
  dust: { label: 'Dust storm', art: 'weather-dust' },
};
/** getMorning() gives the weather as a plain string. */
const skyOf = (w: string): Weather => (w === 'dust' || w === 'hazy' ? w : 'clear');

export function MorningScreen({ s, onNext }: { s: GameState; onNext: () => void }) {
  const m = useMemo(() => getMorning(s), [s]);
  const talk = useMemo<Beat[]>(() => {
    const said = talkOf(s, false);
    return said.length ? said : [{ kind: 'say', text: 'A quiet night. Here is your morning report.' }];
  }, [s]);
  const [shown, setShown] = useState(() => (reducedMotion() ? talk.length : 1));
  const [typed, setTyped] = useState(() => (reducedMotion() ? Infinity : 0));
  const curLen = talk[shown - 1]?.text.length ?? 0, typing = typed < curLen;

  useEffect(() => {
    if (typing) { const id = setTimeout(() => setTyped((t) => t + CHARS_PER_TICK), TICK_MS); return () => clearTimeout(id); }
    if (shown < talk.length) { const id = setTimeout(() => { setShown((n) => n + 1); setTyped(0); }, PAUSE_MS); return () => clearTimeout(id); }
    return undefined;
  }, [typing, typed, shown, talk.length]);
  const tap = () => { if (typing) setTyped(Infinity); else if (shown < talk.length) { setShown((n) => n + 1); setTyped(0); } };

  const alarm = talk.some((b) => b.kind === 'alert');
  const tint = m.storm ? ' storm' : skyOf(m.weather) === 'dust' ? ' dust' : '';

  return (
    <div className={`screen brief${tint}`}>
      <img className="brief-sky" src={skyArt} alt="" />
      <img className="brief-ground" src={groundArt} alt="" />
      <h1 className="brief-title">Good morning, Captain · Sol {s.sol}</h1>

      <div className="brief-helper">
        <div className="brief-bubble" onClick={tap}>
          <img className="brief-bubble-icon" src={icon(m.answers.length ? 'earth' : 'message')} alt="" />
          <ul className="sr-only">{talk.map((b, i) => <li key={i}>{b.text}</li>)}</ul>
          <div className="brief-lines" aria-hidden="true">
            {talk.slice(0, shown).map((b, i) => {
              const last = i === shown - 1;
              return <div key={i} className="pop"><BeatLine b={b} text={last ? b.text.slice(0, typed) : undefined} caret={last && typing} /></div>;
            })}
          </div>
          <img className="brief-tail" src={tailArt} alt="" />
        </div>
        <img className={`brief-robot${typing ? ' talking' : ''}`} src={robotArt(alarm ? 'robot-point' : 'robot-tablet')} alt="Station helper robot" />
      </div>

      <div className="brief-board">
        <SpaceWeather s={s} />
        <Status s={s} />
        {(m.unlocked.length > 0 || m.words.length > 0) && <NewToday unlocked={m.unlocked} words={m.words} />}
      </div>

      <div className="brief-foot">
        <button className="big" onClick={onNext}>To the station ▶</button>
      </div>
    </div>
  );
}

function SpaceWeather({ s }: { s: GameState }) {
  const m = getMorning(s);
  const days = [
    { sol: s.sol, weather: skyOf(m.weather), cells: m.cells, storm: m.storm ? m.storm.mult : null },
    ...knownForecast(s).slice(0, MAX_FORECAST).map((f) => ({ sol: f.sol, weather: f.weather, cells: f.cells, storm: f.storm })),
  ];
  const real = m.real[0];
  return (
    <section className="brief-sec" aria-labelledby="brief-weather">
      <div className="brief-label">
        <img src={icon('earth')} alt="" />
        <h2 id="brief-weather">SPACE WEATHER</h2>
        <span>from Earth</span>
      </div>
      <div className="brief-wx">
        <div className="brief-days-wrap">
          <ul className="brief-days" style={{ gridTemplateColumns: `repeat(${Math.max(3, days.length)}, minmax(0, 1fr))` }}
            aria-label={days.length > 1 ? `Forecast, sols ${days[0].sol} to ${days[days.length - 1].sol}` : `Sol ${s.sol}`}>
            {days.map((d, i) => (
              <li key={d.sol} className={`brief-day${i === 0 ? ' now' : ''}`}>
                {i === 0 && <span className="brief-now">TODAY</span>}
                <span className="brief-sol">SOL {d.sol}</span>
                <img className="brief-sky-icon" src={icon(SKY[d.weather].art)} alt="" />
                <b>{SKY[d.weather].label}</b>
                <span className="brief-cells"><img src={icon('cell')} alt="" /><span className="brief-n">{d.cells}</span> {d.cells === 1 ? 'cell' : 'cells'}</span>
                <span className="brief-pips" aria-hidden="true">{Array.from({ length: d.cells }, (_, k) => <i key={k} />)}</span>
                {d.storm
                  ? <span className="brief-storm"><img src={icon('warning')} alt="" />Storm x{d.storm}</span>
                  : <span className="brief-calm"><img src={okArt} alt="" />No storm</span>}
              </li>
            ))}
            {days.length === 1 && <li className="brief-day unknown"><span className="brief-sol">LATER</span><span>No forecast yet. Earth can send one tonight.</span></li>}
          </ul>
          {m.cellNotes.length > 1 && <p className="brief-cell-notes">Today: {m.cellNotes.join(' · ')}</p>}
        </div>

        {real && (
          <article className="brief-real">
            <header>
              <span className="brief-real-k"><img src={icon('flare')} alt="" />REAL DATA</span>
              <span>{real.date}</span>
            </header>
            <div className="brief-real-b">
              <ul>
                {m.real.slice(0, 2).map((e) => <li key={e.id}><b>{e.label}</b><span className="brief-note">{e.note}</span></li>)}
              </ul>
              {m.real.length > 2 && <p className="brief-more">+{m.real.length - 2} more on this date</p>}
              <a href={real.link} target="_blank" rel="noreferrer">Source: NASA DONKI ▸</a>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'plain';
function Card({ art, name, badge, tone, children }: { art: string; name: string; badge: string; tone: Tone; children: ReactNode }) {
  return (
    <li>
      <div className="brief-st-top">
        <img src={art} alt="" />
        <span className="brief-st-k">{name}</span>
        <span className={`brief-badge ${tone}`}>{badge}</span>
      </div>
      {children}
    </li>
  );
}

function Status({ s }: { s: GameState }) {
  const c = cfg(s.mode), last = s.log[s.log.length - 1];
  const harvested = !!last && last.harvests > 0, need = c.CROP_STEPS_TO_HARVEST, grown = Math.min(need, Math.floor(s.crop + 1e-9));
  const med = s.crew.filter((p) => p.medbay > 0), open = s.problems;
  return (
    <section className="brief-sec rule" aria-labelledby="brief-status">
      <div className="brief-label">
        <img src={stationArt} alt="" />
        <h2 id="brief-status">STATION STATUS</h2>
      </div>
      <ul className="brief-status">
        <Card art={icon('food')} name="HARVEST" badge={harvested ? 'IN' : 'GROWING'} tone={harvested ? 'ok' : 'plain'}>
          <p>{harvested ? 'Came in. New crop: ' : 'Crop: '}step {fmt(s.crop)} of {need}</p>
          <span className="brief-steps" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${need}, minmax(0, 1fr))` }}>
            {Array.from({ length: need }, (_, k) => <i key={k} className={k < grown ? 'on' : undefined} />)}
          </span>
        </Card>
        <Card art={icon('hull')} name="REPAIRS" badge={open.length ? `${open.length} TO FIX` : 'OK'} tone={open.length ? 'bad' : 'ok'}>
          <p>{open.length ? `To fix: ${open.map((p) => c.PROBLEMS[p.type].name).join(', ')}.` : 'Hull is holding. Nothing broken.'}</p>
        </Card>
        <Card art={icon('medbay')} name="MEDBAY" badge={med.length ? `${med.length} IN` : 'EMPTY'} tone={med.length ? 'warn' : 'ok'}>
          <p>{med.length ? `Inside: ${med.map((p) => p.name).join(', ')}.` : 'Nobody inside.'}</p>
        </Card>
      </ul>
    </section>
  );
}

function NewToday({ unlocked, words }: { unlocked: string[]; words: string[] }) {
  return (
    <section className="brief-sec rule" aria-labelledby="brief-new">
      <div className="brief-label">
        <img src={newArt} alt="" />
        <h2 id="brief-new">NEW TODAY</h2>
      </div>
      <div className="brief-new">
        {unlocked.length > 0 && (
          <p className="brief-unlock"><span>New today:</span> <strong>{unlocked.join(', ')}!</strong> <span className="brief-tag">NEW</span></p>
        )}
        {words.map((w) => <p key={w} className="brief-word"><span className="brief-tag word">NEW WORD</span> {w}</p>)}
      </div>
    </section>
  );
}

/** The same report, kept for re-reading while planning. */
export function MorningRecap({ s }: { s: GameState }) {
  const beats = useMemo(() => beatsOf(s), [s]);
  return <div className="talk-bubble static">{beats.map((b, i) => <BeatLine key={i} b={b} />)}</div>;
}
