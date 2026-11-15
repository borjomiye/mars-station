// Small pieces shared by the screens: top bar, crew card, dose badge, robot mood, morning report lines.
import { useEffect, useRef, useState } from 'react';
import {
  badgeOf, cellsAvailable, cfg, effectiveJobs, energyOf, fmt, fmt2, getMorning, isBlackout, plural, stormOn, today,
  type Badge, type CrewMember, type GameState, type RealEvent,
} from '../engine';
import { crewArt, icon } from './art';
import { setMuted, useMuted } from './sound';

/** Sound on/off: a pixel speaker, with waves when on and a cross when off. The choice is remembered. */
export function SoundToggle({ className }: { className: string }) {
  const muted = useMuted();
  return (
    <button className={className} data-sfx="none" aria-pressed={!muted} aria-label={muted ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'} onClick={() => setMuted(!muted)}>
      <svg viewBox="0 0 12 12" width="22" height="22" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="currentColor" d="M1 4h2v4H1zM3 3h1v6H3zM4 2h1v8H4zM5 1h1v10H5z" />
        {muted
          ? <path fill="currentColor" d="M7 4h1v1H7zM8 5h1v1H8zM9 6h1v1H9zM10 7h1v1h-1zM10 4h1v1h-1zM9 5h1v1H9zM8 6h1v1H8zM7 7h1v1H7z" />
          : <path fill="currentColor" d="M7 5h1v2H7zM8 3h1v1H8zM9 4h1v4H9zM8 8h1v1H8zM10 2h1v1h-1zM11 3h1v6h-1zM10 9h1v1h-1z" />}
      </svg>
    </button>
  );
}

// ---------- top bar ----------

/** 'up' / 'down' right after the value changed, so the number can bounce or shake (motion.css). */
function useChange(value: number): '' | 'up' | 'down' {
  const prev = useRef(value);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (value !== prev.current) setDir(value > prev.current ? 'up' : 'down');
    prev.current = value;
  }, [value]);
  return dir;
}

function Meter({ img, label, value, max, color }: { img: string; label: string; value: number; max: number; color: string }) {
  const dir = useChange(value);
  return (
    <div className="hud-meter" title={`${label}: ${fmt(value)} of ${max}`}>
      <img src={img} alt="" />
      <div className="hud-meter-body">
        <div className="hud-meter-label"><span>{label}</span><b key={value} className={dir ? `tick ${dir}` : undefined}>{fmt(value)}/{max}</b></div>
        <div className="bar" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
          <div style={{ width: `${Math.min(100, (100 * value) / max)}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

export function Hud({ s, onMenu, onData, onTasks }: { s: GameState; onMenu: () => void; onData: () => void; onTasks: () => void }) {
  const tasksDone = s.tasks.filter((x) => x.status === 'done').length;
  const c = cfg(s), day = today(s), st = stormOn(s);
  const sky = day.weather === 'dust' ? 'weather-dust' : day.weather === 'hazy' ? 'weather-clearing' : 'weather-clear';
  return (
    <header className="hud" aria-label="Station status">
      <div className="hud-sol">
        <img src={icon('sol')} alt="" />
        <div><b>Sol {s.sol} / {c.MISSION_SOLS}</b><span>Mission {s.name}</span></div>
      </div>
      <div className="hud-sky" title={`Sky: ${day.weather}`}>
        <span className="sky-frame"><img src={icon(sky)} alt="" /></span>
        <div><b>{day.weather}</b><span><img src={icon('cell')} alt="" />{cellsAvailable(s)} cells</span></div>
      </div>
      <Meter img={icon('air')} label="Air & water" value={s.air} max={c.TANK_MAX} color="var(--life)" />
      <Meter img={icon('food')} label="Food" value={s.food} max={c.TANK_MAX} color="var(--food)" />
      <Meter img={icon('science')} label="Science" value={s.science} max={c.SCIENCE_TARGET} color="var(--science)" />
      <div className="hud-flags">
        {st && <span className="flag alert" title="Solar storm today"><img src={icon('flare')} alt="" />storm ×{st.mult}</span>}
        {isBlackout(s) && <span className="flag alert"><img src={icon('radio')} alt="" />blackout</span>}
        <span className="flag" title="The ship home"><img src={icon('ship-home')} alt="" />{Math.max(0, c.MISSION_SOLS - s.sol)} sols</span>
      </div>
      <div className="hud-buttons">
        <SoundToggle className="secondary small sound-btn" />
        {s.tasks.length > 0 && (
          <button className="secondary small tasks-btn" data-sfx="open" onClick={onTasks} aria-label={`Mission Control tasks: ${tasksDone} of ${s.tasks.length} done`} title="Mission Control tasks">
            Tasks {tasksDone}/{s.tasks.length}
          </button>
        )}
        <button className="secondary small" data-sfx="open" onClick={onData} aria-label="Where the data comes from">i</button>
        <button className="secondary small" onClick={onMenu}>Menu</button>
      </div>
    </header>
  );
}

// ---------- crew ----------

export const badgeIcon = (b: Badge) => icon(`badge-${b}`);

export function crewState(p: CrewMember): { key: string | null; text: string } {
  if (p.medbay > 0) return { key: 'sick', text: `In the medbay · ${plural(Math.ceil(p.medbay), 'sol')} left` };
  if (p.sick) return { key: 'sick', text: 'Ill · must rest' };
  if (p.cond === 'tired') return { key: 'tired', text: 'Tired · works at half power' };
  return { key: null, text: 'Fine' };
}

/** Who this person is and how they are: shown on hover and when picked. */
export function CrewCard({ s, p }: { s: GameState; p: CrewMember }) {
  const c = cfg(s), b = badgeOf(c, p.dose), st = crewState(p), energy = energyOf(c, p), job = effectiveJobs(s)[p.id] ?? 'rest';
  const max = c.BADGE_RED_MSV * 1.1;
  return (
    <div className="crew-card">
      <div className="crew-card-head">
        <span className="portrait"><img src={crewArt(p.id, 'portrait')} alt="" className={`role-${p.role}`} /></span>
        <div><b>{p.name}</b><span className="muted">{p.role} · best at {c.SPECIALIST_OF[p.role]}</span></div>
      </div>
      <div className={`crew-card-state${st.key ? ' alert' : ''}`}>{st.key && <img src={icon(st.key)} alt="" />}{st.text}{p.grounded ? ' · stays inside' : ''}</div>
      <div className="crew-card-row"><span>Energy</span>
        <div className="bar" role="meter" aria-label={`${p.name} energy`} aria-valuenow={Math.round(energy * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${energy * 100}%`, background: energy > 0.5 ? 'var(--food)' : 'var(--energy)' }} />
        </div>
      </div>
      <div className={`crew-card-row badge ${b}`}><img src={badgeIcon(b)} alt="" />
        <div className="bar" role="meter" aria-label={`Dose badge: ${b}`} aria-valuenow={p.dose} aria-valuemin={0} aria-valuemax={c.BADGE_RED_MSV}>
          <div style={{ width: `${Math.min(100, (100 * p.dose) / max)}%` }} />
        </div>
        <span>{b}{c.SHOW_MSV ? ` · ${fmt2(p.dose)} mSv` : ''}</span>
      </div>
      <div className="crew-card-row"><span>Today</span><b>{job}</b></div>
    </div>
  );
}

// ---------- robot ----------

export function helperMood(s: GameState): 'alert' | 'worried' | 'happy' | 'thinking' | 'calm' {
  if (stormOn(s) || s.counters.airZero || s.counters.foodZero || s.problems.some((p) => p.severity > 1)) return 'alert';
  if (s.problems.length || s.crew.some((p) => p.medbay > 0 || p.sick || p.cond === 'tired')) return 'worried';
  if (s.phase === 'results') { const last = s.log[s.log.length - 1]; return last && last.harvests > 0 ? 'happy' : 'calm'; }
  if (s.phase === 'plan' || s.phase === 'event') return 'thinking';
  return s.phase === 'radio' ? 'happy' : 'calm';
}

// ---------- morning report ----------

export type Beat = { kind: 'say' | 'alert' | 'earth' | 'good' | 'word' | 'real' | 'today' | 'forecast'; text: string; real?: RealEvent; small?: string };

/** What the robot says out loud. From sol 2 on the engine's `lines` are the station status
 *  (harvest, repairs, medbay); the morning board shows those as cards, so it passes `withStatus = false`. */
export function talkOf(s: GameState, withStatus = true): Beat[] {
  const m = getMorning(s), out: Beat[] = [];
  for (const a of m.answers) out.push({ kind: 'earth', text: `Earth: ${a}` });
  if (withStatus || s.sol === 1) for (const l of m.lines) out.push({ kind: 'say', text: l });
  for (const l of m.notes) out.push({ kind: 'alert', text: l });
  for (const l of m.news ?? []) out.push({ kind: 'good', text: l }); // Mission Control task results
  if (m.storm) out.push({ kind: 'alert', text: `Solar storm today: dose x${m.storm.mult} unless the shield is fully powered.` });
  if (m.blackout) out.push({ kind: 'alert', text: 'Radio blackout today: the Sun is between Mars and Earth.' });
  return out;
}

export function beatsOf(s: GameState): Beat[] {
  const m = getMorning(s), out: Beat[] = talkOf(s);
  if (m.unlocked.length) out.push({ kind: 'good', text: `New today: ${m.unlocked.join(', ')}!` });
  for (const w of m.words) out.push({ kind: 'word', text: `New word · ${w}` });
  for (const e of m.real) out.push({ kind: 'real', text: `Real event · ${e.date} · ${e.label}`, real: e });
  out.push({ kind: 'today', text: `Today: ${m.weather} sky · ${m.cells} energy cells`, small: m.cellNotes.join(', ') });
  for (const f of m.forecast) out.push({ kind: 'forecast', text: `Forecast sol ${f.sol}: ${f.weather}, ${f.cells} cells${f.storm ? `, solar storm x${f.storm}` : ', no storm'}` });
  return out;
}

export function BeatLine({ b, text, caret, linkTab }: { b: Beat; text?: string; caret?: boolean; linkTab?: number }) {
  if (b.kind === 'real' && b.real) {
    return <p className="beat real"><b>{b.text}</b> <span className="source">{b.real.note}. <a href={b.real.link} target="_blank" rel="noreferrer" tabIndex={linkTab}>NASA DONKI</a></span></p>;
  }
  return <p className={`beat ${b.kind}`}>{text ?? b.text}{caret && <span className="caret" />}{b.small && !caret && <span className="muted"> ({b.small})</span>}</p>;
}
