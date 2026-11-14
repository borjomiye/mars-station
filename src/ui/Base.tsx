// The base: the whole sol is planned on one screen. Station in the middle, cells for each room
// along the bottom, the robot's hint in the sky. After playing, the same screen shows the results.
import { useState, type ReactNode } from 'react';
import {
  SYSTEMS, cellsAvailable, cfg, currentEvent, doseFor, fmt, fmt2, isBlackout, isUnlocked, planTotal, plural, previewSol, radioBlocked, radioCanSend, radioOffReason, stormOn,
  type GameState, type Job, type SystemId,
} from '../engine';
import { SYSTEM_ICON, icon, robotArt } from './art';
import { helperMood } from './bits';
import { helperLine, whyText } from './helper';
import { helperWhy } from './helperWhy';
import { MorningRecap } from './Morning';
import { Station } from './Station';
import { Overlay } from './Frame';

export const STAGE_H = 456;

/** A tiny pixel "report sheet" for the morning report button (drawn, so it matches the ? next to it). */
const ReportGlyph = () => (
  <svg width="22" height="24" viewBox="0 0 11 12" aria-hidden="true" style={{ shapeRendering: 'crispEdges' }}>
    <path d="M1 0h7l2 2v10H1z" fill="currentColor" />
    <path d="M3 3h5v1H3zM3 5h5v1H3zM3 7h5v1H3zM3 9h3v1H3z" fill="var(--panel-2)" />
  </svg>
);

function Helper({ s, onWhy, extra }: { s: GameState; onWhy: () => void; extra?: ReactNode }) {
  const line = helperLine(s, false);
  return (
    <div className="sky-helper">
      <span className="robot-frame"><img src={robotArt(`face-${helperMood(s)}`)} alt="Station helper robot" /></span>
      {line && <p className="sky-bubble">{line}</p>}
      <div className="sky-buttons">
        <button className="secondary icon-btn" onClick={onWhy} aria-label="Why?" title="Why?">?</button>
        {extra}
      </div>
    </div>
  );
}

/** "Why?" window: first the reason for what the robot says now, then how a sol works. */
function WhyWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  const line = helperLine(s, false);
  return (
    <Overlay title="Why?" onClose={onClose}>
      {line && <p className="why-line">“{line}”</p>}
      {helperWhy(s).map((t) => <p key={t}>{t}</p>)}
      <h3 className="why-more">How a sol works</h3>
      {whyText(s).map((t) => <p key={t} className="muted">{t}</p>)}
    </Overlay>
  );
}

type PlanProps = { s: GameState; onCells: (k: SystemId, delta: number) => void; onJob: (crewId: string, job: Job) => void; onDone: () => void };

export function PlanBase({ s, onCells, onJob, onDone }: PlanProps) {
  const c = cfg(s.mode), avail = cellsAvailable(s), free = avail - planTotal(s.plan), st = stormOn(s), pv = previewSol(s);
  const [selected, setSelected] = useState<string | null>(null);
  const [morning, setMorning] = useState(false);
  const [why, setWhy] = useState(false);
  const effect = (k: SystemId, n: number, short: number): string => {
    if (k === 'life') return short > 0 ? `Air −${short * c.AIR_LOSS_PER_MISSING_CELL} tonight` : short < 0 ? `Air +${-short * c.AIR_GAIN_PER_EXTRA_CELL} tonight` : 'Air stays level';
    if (k === 'shield') return !st ? 'No storm: not needed' : short <= 0 ? 'Storm dose: minimum' : `Storm dose: ${c.SHOW_MSV ? fmt2(doseFor(c, st, 'rest', n).d) + ' mSv' : 'higher'}`;
    if (k === 'greenhouse') return n > 0 ? `Crop +${n * c.STEPS_PER_GREENHOUSE_CELL} steps` : 'Crops wait';
    if (k === 'radio') return isBlackout(s) ? 'Blackout today' : radioBlocked(s) ? 'Antenna is off' : short <= 0 ? 'Message tonight' : n > 0 ? `1 more cell to send` : 'Radio off';
    return short <= 0 ? 'Samples → cards' : n > 0 ? 'Half speed' : 'Lab off';
  };
  const backToEvent = s.today.revealed && !!currentEvent(s);

  return (
    <>
      <Station s={s} height={STAGE_H} selected={selected} onSelect={setSelected} onJob={onJob}
        overlay={<Helper s={s} onWhy={() => setWhy(true)} extra={<button className="secondary icon-btn" onClick={() => setMorning(true)} aria-label="Morning report" title="Morning report"><ReportGlyph /></button>} />} />
      <div className="controls">
        <div className={`free${free > 0 ? ' alert' : ''}`}>
          <span>Free cells</span>
          <b>{free}</b>
          <span className="muted">of {avail}</span>
        </div>
        {SYSTEMS.map((k) => {
          const d = c.SYSTEMS[k], n = s.plan.cells[k], open = isUnlocked(s, k), short = d.want - n, black = k === 'radio' && isBlackout(s);
          return (
            <div key={k} className={`sys${open ? '' : ' locked'}${open && short > 0 && (k !== 'shield' || st) ? ' short' : ''}`}>
              <div className="sys-head"><span className="sys-icon"><img src={icon(SYSTEM_ICON[k])} alt="" /></span><b>{d.name}</b></div>
              {open ? (
                <>
                  <div className="sys-row">
                    <button className="small secondary" aria-label={`Less power for ${d.name}`} disabled={n <= 0} onClick={() => onCells(k, -1)}>−</button>
                    <span className="sys-cells" aria-label={`${n} of ${d.want} cells`}>
                      {Array.from({ length: d.max }, (_, i) => <img key={i} src={icon(i < n ? 'cell' : 'cell-empty')} className={i >= d.want ? 'bonus' : ''} alt="" />)}
                    </span>
                    <button className="small" aria-label={`More power for ${d.name}`} disabled={black || n >= d.max || free <= 0} onClick={() => onCells(k, 1)}>+</button>
                  </div>
                  <p className="sys-effect">{effect(k, n, short)}</p>
                </>
              ) : <p className="sys-locked"><span>Opens on</span><b>sol {d.unlockSol}</b></p>}
            </div>
          );
        })}
        <div className="go">
          <div className="tonight">
            <span className="tonight-title">Tonight</span>
            {([['air', 'Air', s.air, pv.air], ['food', 'Food', s.food, pv.food], ['crop', 'Crop', s.crop, pv.crop]] as const).map(([k, label, a, z]) => (
              <span key={k} className="tonight-row"><span>{label}</span><b className={z > a ? 'good' : z < a ? 'alert' : ''}>{fmt(a)} → {fmt(z)}</b></span>
            ))}
          </div>
          <button className="big" onClick={onDone}>{backToEvent ? 'Back to the event ▶' : 'Done ▶'}</button>
        </div>
      </div>
      {morning && <Overlay title={`This morning · sol ${s.sol}`} onClose={() => setMorning(false)}><MorningRecap s={s} /></Overlay>}
      {why && <WhyWindow s={s} onClose={() => setWhy(false)} />}
    </>
  );
}

export function ResultsBase({ s, onNext }: { s: GameState; onNext: () => void }) {
  const c = cfg(s.mode), b = s.today.before;
  const label = s.over ? 'Mission Control calls ▶' : radioCanSend(s) ? 'Evening call ▶' : s.sol >= c.MISSION_SOLS ? 'The ship lands ▶' : `Sleep → sol ${s.sol + 1} ▶`;
  const note = s.over ? `A tank stayed empty for ${plural(c.ZERO_SOLS_TO_LOSE, 'sol')}.` : radioCanSend(s) ? '' : radioOffReason(s);
  const delta = (a: number, z: number) => <b className={z > a ? 'good' : z < a ? 'alert' : ''}>{fmt(a)}→{fmt(z)}</b>;
  return (
    <>
      <Station s={s} height={STAGE_H} overlay={
        <div className="results-card">
          <h2>Sol {s.sol} results</h2>
          <ul>{s.lastResults.map((r, i) => <li key={i}><b>{r.t}</b> <span className="muted">← {r.why}</span></li>)}</ul>
        </div>
      } />
      <div className="controls results">
        {b && <p className="results-sum">Air {delta(b.air, s.air)} · Food {delta(b.food, s.food)} · Crop {delta(b.crop, s.crop)} · Science {delta(b.science, s.science)}</p>}
        {note && <p className="alert">{note}</p>}
        <button className="big" onClick={onNext}>{label}</button>
      </div>
    </>
  );
}
