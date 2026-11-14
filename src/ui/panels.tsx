// Always-visible parts: station status, crew with dose badges and jobs, the helper.
import { useState } from 'react';
import {
  JOBS, badgeOf, cellsAvailable, cfg, doseFor, effectiveCells, effectiveJobs, energyOf, fmt, fmt2, isBlackout, jobAllowed, plural, stormOn, today,
  type Badge, type GameState, type Job, type PickSpec,
} from '../engine';
import { helperLine, whyText } from './helper';

export function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="meter-label">
        <span>{label}</span>
        <span>{fmt(value)}/{max}</span>
      </div>
      <div className="bar" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div style={{ width: `${Math.min(100, (100 * value) / max)}%`, background: color }} />
      </div>
    </div>
  );
}

const KIND_SYMBOL: Record<string, string> = { intro: '+', quiet: '·', trouble: '!', chance: '★', ship: '▲' };

export function Hud({ s }: { s: GameState }) {
  const c = cfg(s.mode), day = today(s), st = stormOn(s);
  return (
    <section className="panel hud" aria-label="Station status">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Sol {s.sol} of {c.MISSION_SOLS}</strong>
        <span className="muted">Mission {s.name} · {s.mode}</span>
        <span>
          Sky: {day.weather} · {cellsAvailable(s)} cells
          {st && <strong className="alert"> · solar storm x{st.mult}</strong>}
          {isBlackout(s) && <strong className="alert"> · radio blackout</strong>}
        </span>
      </div>
      <div className="meters">
        <Meter label="Air & water" value={s.air} max={c.TANK_MAX} color="var(--life)" />
        <Meter label="Food" value={s.food} max={c.TANK_MAX} color="var(--food)" />
        <Meter label="Crop steps" value={s.crop} max={c.CROP_STEPS_TO_HARVEST} color="var(--food)" />
        <Meter label="Science sent" value={s.science} max={c.SCIENCE_TARGET} color="var(--science)" />
      </div>
      <div className="row muted" style={{ fontSize: 15 }}>
        <span>Cards {s.cards.found.length} (sent {s.cards.sent.length})</span>
        <span>Samples {fmt(s.samples)}</span>
        <ol className="track" aria-label="Mission timeline">
          {s.schedule.map((d) => {
            const past = d.sol < s.sol, cur = d.sol === s.sol;
            const shown = past || (cur && (s.today.revealed || !!d.storm || d.kind === 'intro' || d.kind === 'ship'));
            return <li key={d.sol} className={past ? 'past' : cur ? 'cur' : ''} title={`Sol ${d.sol}`}>{shown ? KIND_SYMBOL[d.kind] : cur ? '?' : d.sol}</li>;
          })}
        </ol>
      </div>
    </section>
  );
}

const BADGE_SHAPE: Record<Badge, string> = { green: '●', amber: '▲', red: '■' }; // shape differs, not only colour

export function BadgeView({ dose, s }: { dose: number; s: GameState }) {
  const c = cfg(s.mode), b = badgeOf(c, dose), max = c.BADGE_RED_MSV * 1.1;
  return (
    <div className={`badge ${b}`}>
      <span aria-hidden="true">{BADGE_SHAPE[b]}</span>
      <div className="bar" role="meter" aria-label={`Dose badge: ${b}`} aria-valuenow={dose} aria-valuemin={0} aria-valuemax={c.BADGE_RED_MSV}>
        <div style={{ width: `${Math.min(100, (100 * dose) / max)}%` }} />
        <i style={{ left: `${(100 * c.BADGE_AMBER_MSV) / max}%` }} />
        <i style={{ left: `${(100 * c.BADGE_RED_MSV) / max}%` }} />
      </div>
      <span>{b}{c.SHOW_MSV ? ` ${fmt2(dose)} mSv` : ''}</span>
    </div>
  );
}

type CrewProps = {
  s: GameState;
  onJob?: (crewId: string, job: Job) => void;
  pick?: { spec: PickSpec; ids: string[]; onToggle: (crewId: string) => void };
};

export function Crew({ s, onJob, pick }: CrewProps) {
  const c = cfg(s.mode), jobs = effectiveJobs(s), st = stormOn(s), shield = effectiveCells(s).shield;
  return (
    <section className="panel stack" aria-label="Crew">
      <strong>Crew</strong>
      <div className="crew">
        {s.crew.map((p) => {
          const letter = p.medbay > 0 ? 'M' : p.sick ? 'S' : p.cond === 'tired' ? 'T' : 'F';
          const cond = p.medbay > 0 ? `Medbay: ${plural(Math.ceil(p.medbay), 'sol')} left` : p.sick ? 'Ill: must rest' : p.cond === 'tired' ? 'Tired: half effect' : 'Fine';
          const energy = energyOf(c, p);
          const locked = !!s.today.choice && s.today.revealed && jobs[p.id] !== (s.plan.jobs[p.id] || 'rest') && p.medbay <= 0;
          const canPick = !!pick && p.medbay <= 0 && !(pick.spec.job === 'outside' && p.grounded);
          const after = pick ? p.dose + doseFor(c, st, pick.spec.job, shield).d : 0;
          return (
            <div key={p.id} className={`crew-card${p.medbay > 0 ? ' medbay' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span><span className="face" aria-hidden="true">{letter}</span> <strong>{p.name}</strong> <span className="muted">{p.role}</span></span>
                <span className={cond === 'Fine' ? 'muted' : 'alert'}>{cond}{p.grounded ? ' · stays inside' : ''}</span>
              </div>
              <div className="energy">
                <span className="muted">Energy</span>
                <div className="bar" role="meter" aria-label={`${p.name} energy`} aria-valuenow={Math.round(energy * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${energy * 100}%`, background: energy > 0.5 ? 'var(--food)' : 'var(--energy)' }} />
                </div>
              </div>
              <BadgeView dose={p.dose} s={s} />
              {pick ? (
                canPick ? (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className={badgeOf(c, after) !== 'green' || p.cond === 'tired' || p.sick ? 'alert' : 'muted'}>
                      Badge after: {badgeOf(c, after)}{c.SHOW_MSV ? ` (${fmt2(p.dose)} → ${fmt2(after)} mSv)` : ''}
                      {p.cond === 'tired' ? ' · tired: will get hurt' : ''}{p.sick ? ' · ill: will get worse' : ''}
                    </span>
                    <button className={`small ${pick.ids.includes(p.id) ? '' : 'secondary'}`} aria-pressed={pick.ids.includes(p.id)} onClick={() => pick.onToggle(p.id)}>
                      {pick.ids.includes(p.id) ? 'Picked ✓' : 'Pick'}
                    </button>
                  </div>
                ) : <span className="muted">Cannot go</span>
              ) : onJob && s.sol >= c.JOB_UNLOCK_SOL && p.medbay <= 0 && !locked ? (
                <div className="jobs" role="group" aria-label={`Job for ${p.name}`}>
                  {JOBS.map((j) => (
                    <button key={j} className={`small ${s.plan.jobs[p.id] === j ? '' : 'secondary'}`} aria-pressed={s.plan.jobs[p.id] === j} disabled={!jobAllowed(s, p, j).ok} onClick={() => onJob(p.id, j)}>
                      {j}{c.SPECIALIST_OF[p.role] === j ? ' x2' : ''}
                    </button>
                  ))}
                </div>
              ) : (
                <span>Today: {jobs[p.id]}{locked ? ' (event choice)' : ''}{s.sol < c.JOB_UNLOCK_SOL ? ` (jobs open on sol ${c.JOB_UNLOCK_SOL})` : ''}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Helper({ s, picking }: { s: GameState; picking: boolean }) {
  const c = cfg(s.mode), key = `${s.sol}:${s.phase}`;
  const [asked, setAsked] = useState('');
  const [why, setWhy] = useState('');
  const line = helperLine(s, picking);
  if (!line) return null;
  return (
    <section className="panel stack" aria-label="Station helper">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {c.HELPER_ALWAYS_ON || asked === key
          ? <p style={{ margin: 0 }}><strong>Helper:</strong> {line}</p>
          : <button className="secondary small" onClick={() => setAsked(key)}>Ask the helper</button>}
        <button className="secondary small" aria-expanded={why === key} onClick={() => setWhy(why === key ? '' : key)}>Why?</button>
      </div>
      {why === key && <div className="term stack">{whyText(s).map((t) => <p key={t} style={{ margin: 0 }}>{t}</p>)}</div>}
    </section>
  );
}
