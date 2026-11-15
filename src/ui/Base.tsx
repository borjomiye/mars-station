// The base: the whole sol is planned on one screen. Station in the middle, cells for each room
// along the bottom, the robot's hint in the sky. After playing, the same screen shows the results.
import { useState, type ReactNode } from 'react';
import {
  SYSTEMS, cellsAvailable, cfg, currentEvent, doseFor, fmt, fmt2, isBlackout, isUnlocked, planTotal, plural, previewSol, radioBlocked, radioCanSend, radioOffReason, stormOn, taskDef, taskText,
  type GameState, type Job, type SystemId,
} from '../engine';
import { SYSTEM_ICON, icon, robotArt } from './art';
import { helperMood } from './bits';
import { helperLine, whyText } from './helper';
import { helperWhy } from './helperWhy';
import { MorningRecap } from './Morning';
import { Station } from './Station';
import { resultNotes } from './results';
import { Overlay } from './Frame';
import { sfx, useScreenSounds } from './sound';

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
        <button className="secondary icon-btn" data-sfx="open" onClick={onWhy} aria-label="Why?" title="Why?">?</button>
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
  const c = cfg(s), avail = cellsAvailable(s), free = avail - planTotal(s.plan), st = stormOn(s), pv = previewSol(s);
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
        overlay={<><Helper s={s} onWhy={() => setWhy(true)} extra={<button className="secondary icon-btn" data-sfx="open" onClick={() => setMorning(true)} aria-label="Morning report" title="Morning report"><ReportGlyph /></button>} /><TaskPin s={s} /></>} />
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
                    <button className="small secondary" data-sfx="none" aria-label={`Less power for ${d.name}`} disabled={n <= 0} onClick={() => { sfx.cell(n - 1, false); onCells(k, -1); }}>−</button>
                    <span className="sys-cells" aria-label={`${n} of ${d.want} cells`}>
                      {/* the key changes when a cell fills, so the new cell plays its "snap in" animation (motion.css) */}
                      {Array.from({ length: d.max }, (_, i) => <img key={`${i}-${i < n}`} src={icon(i < n ? 'cell' : 'cell-empty')} className={`${i >= d.want ? 'bonus' : ''}${i < n ? ' on' : ''}`} alt="" />)}
                    </span>
                    <button className="small" data-sfx="none" aria-label={`More power for ${d.name}`} disabled={black || n >= d.max || free <= 0} onClick={() => { sfx.cell(n + 1, true); onCells(k, 1); }}>+</button>
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

/** Open Mission Control tasks, pinned in the sky while the captain plans the sol. */
function TaskPin({ s }: { s: GameState }) {
  const open = s.tasks.filter((x) => x.status === 'open');
  if (!open.length) return null;
  return (
    <aside className="task-pin" aria-label="Mission Control tasks">
      <span className="task-pin-head"><img src={icon('radio')} alt="" />Mission Control</span>
      <ul>{open.map((x) => { const d = taskDef(x.id); return <li key={x.id}>{taskText(d)} <b>+{d.reward}</b></li>; })}</ul>
    </aside>
  );
}

export function ResultsBase({ s, prev, onNext }: { s: GameState; prev: GameState | null; onNext: () => void }) {
  const c = cfg(s), b = s.today.before;
  const [details, setDetails] = useState(false);
  const notes = resultNotes(prev, s);
  // each note over a room makes its sound as it pops up (same timing as the animation in Station)
  useScreenSounds(() => Object.values(notes).flatMap((list, k) => (list ?? []).map((n, i): [number, () => void] => [
    (k * 3 + i) * 180 + 140,
    n.text.startsWith('Harvest') ? sfx.harvest : n.icon === 'card-back' ? sfx.card : n.tone === 'good' ? sfx.good : n.tone === 'bad' ? sfx.bad : sfx.soft,
  ])), [s.sol]);
  const label = s.over ? 'Mission Control calls ▶' : radioCanSend(s) ? 'Evening call ▶' : s.sol >= c.MISSION_SOLS ? 'The ship lands ▶' : `Sleep → sol ${s.sol + 1} ▶`;
  const note = s.over ? `A tank stayed empty for ${plural(c.ZERO_SOLS_TO_LOSE, 'sol')}.` : radioCanSend(s) ? '' : radioOffReason(s);
  const tiles: { img: string; label: string; a: number; z: number }[] = b ? [
    { img: icon('air'), label: 'Air', a: b.air, z: s.air },
    { img: icon('food'), label: 'Food', a: b.food, z: s.food },
    { img: icon('science'), label: 'Science', a: b.science, z: s.science },
  ] : [];
  return (
    <>
      <Station s={s} height={STAGE_H} notes={notes} overlay={
        <div className="results-title"><h2>Sol {s.sol} is over</h2><span>What changed is shown over each room.</span></div>
      } />
      <div className="controls results">
        <div className="result-tiles">
          {tiles.map((t) => (
            <div key={t.label} className={`result-tile${t.z > t.a ? ' up' : t.z < t.a ? ' down' : ''}`}>
              <img src={t.img} alt="" />
              <span>{t.label}</span>
              <b>{fmt(t.a)} → {fmt(t.z)}</b>
            </div>
          ))}
        </div>
        <div className="results-side">
          {note && <p className="alert">{note}</p>}
          <button className="secondary small" data-sfx="open" onClick={() => setDetails(true)}>All details</button>
          <button className="big" onClick={onNext}>{label}</button>
        </div>
      </div>
      {details && (
        <Overlay title={`Sol ${s.sol}: everything that happened`} onClose={() => setDetails(false)}>
          <ul className="details-list">{s.lastResults.map((r, i) => <li key={i}><b>{r.t}</b> <span className="muted">← {r.why}</span></li>)}</ul>
        </Overlay>
      )}
    </>
  );
}
