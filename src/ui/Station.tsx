// The station as the game board: rooms light up from today's cells, crew stand where they work.
// Hover a person for their card; tap them to pick a job. Owner: P6.
import { useEffect, useState, type ReactNode } from 'react';
import {
  JOBS, cfg, effectiveCells, fmt, effectiveJobs, isBlackout, isUnlocked, jobAllowed, problemNeed, radioBlocked, stormOn, today,
  type EffectiveJob, type GameState, type Job, type SystemId,
} from '../engine';
import { ROOMS, SYSTEM_ICON, board, crewArt, icon, roomOf, scene, stationArt, type RoomId } from './art';
import { CrewCard, crewState } from './bits';
import { FRAME_W } from './Frame';

// Stage units: the station board (1600×448) centred with a strip of Mars on each side.
const GUTTER = 130, BOTTOM = 34;
const UNITS_W = board.board.w + 2 * GUTTER, K = FRAME_W / UNITS_W; // px per board unit
const CREW_H = board.crewHeight * 1.15;
const GROUND = board.board.groundY;
const dome = board.layers.dome;
// every flickering thing (dim room, dome, people inside) follows one switch, so lights and faces blink together
const FLICKER_MS = 800;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PROBLEM_ROOM: Record<string, RoomId> = { loose_pipe: 'workshop', pump_broken: 'workshop', lamp_fault: 'greenhouse', antenna_off: 'radio', hull_crack: 'lab' };
const JOB_ICON: Record<Job, string> = { grow: 'food', fix: 'repair', outside: 'helmet', lab: 'science', care: 'medbay', rest: 'sleep' };

type RoomState = 'locked' | 'dark' | 'dim' | 'on';

/** Cells and jobs in effect: today's plan, or the record of the sol just played. */
function layoutOf(s: GameState): { cells: Record<SystemId, number>; jobs: Record<string, EffectiveJob> } {
  const last = s.log[s.log.length - 1];
  if ((s.phase === 'results' || s.phase === 'radio') && last && last.sol === s.sol) return { cells: last.cells, jobs: last.jobs };
  return { cells: effectiveCells(s), jobs: effectiveJobs(s) };
}

type Props = {
  s: GameState;
  height: number;                                  // stage height in frame px
  selected?: string | null;
  onSelect?: (crewId: string | null) => void;      // tap a person (plan phase)
  onJob?: (crewId: string, job: Job) => void;
  overlay?: ReactNode;                             // things drawn on top (helper bubble, results)
};

export function Station({ s, height, selected, onSelect, onJob, overlay }: Props) {
  const c = cfg(s.mode), day = today(s), st = stormOn(s), { cells, jobs } = layoutOf(s);
  const dusty = day.weather === 'dust' || s.problems.some((p) => p.type === 'dusty_panels');
  const top = height - (board.board.h + BOTTOM) * K;           // station board top in px
  const X = (u: number) => (u + GUTTER) * K, Y = (u: number) => top + u * K;

  // Lit means "does something today": every room helps with one cell (the lab at half speed);
  // the radio needs its one cell. Short of the need, the chip shows a warning.
  const roomState = (id: RoomId): RoomState => {
    const sys = board.rooms[id].system, n = cells[sys];
    if (!isUnlocked(s, sys)) return 'locked';
    if (n === 0) return 'dark';
    // the radio sends only with its cell; the lab works at partial speed from one cell
    if (id === 'radio' && n < c.SYSTEMS[sys].want) return 'dark';
    if (id === 'radio' && (isBlackout(s) || radioBlocked(s))) return 'dark';
    if (id === 'greenhouse' && s.problems.some((p) => p.type === 'lamp_fault')) return 'dim';
    return 'on';
  };
  const roomWarn = (id: RoomId) => {
    const sys = board.rooms[id].system, n = cells[sys], d = c.SYSTEMS[sys];
    if (!isUnlocked(s, sys) || n >= d.want) return false;
    // a warning only where being short hurts: air drops, or a storm dose gets bigger
    if (id === 'workshop') return true;
    if (id === 'medbay') return !!st;
    return false;
  };

  // broken lamps: one shared on/off switch for the room, the dome and everyone inside
  const anyDim = ROOMS.some((id) => roomState(id) === 'dim');
  const [blinkOff, setBlinkOff] = useState(false);
  useEffect(() => {
    if (!anyDim || reducedMotion()) { setBlinkOff(false); return undefined; }
    const t = setInterval(() => setBlinkOff((b) => !b), FLICKER_MS);
    return () => clearInterval(t);
  }, [anyDim]);

  const groups: Record<string, string[]> = {};
  for (const p of s.crew) { const r = roomOf(p.id, jobs[p.id] ?? 'rest'); (groups[r] ??= []).push(p.id); }

  const figure = (id: string, cx: number, footY: number, suit: boolean, side: 'left' | 'right', light: RoomState = 'on') => {
    const p = s.crew.find((q) => q.id === id)!, job = jobs[id] ?? 'rest', h = CREW_H * K, w = h * 0.62;
    const state = crewState(p).key ?? (job === 'rest' || job === 'shelter' ? 'sleep' : null);
    const isSel = selected === id, canJob = !!onJob && s.sol >= c.JOB_UNLOCK_SOL && p.medbay <= 0;
    return (
      <div key={id} className={`st-crew${isSel ? ' selected' : ''}${light === 'dark' || light === 'locked' ? ' in-dark' : light === 'dim' ? ' in-dim' : ''} tip-${side}`} style={{ left: cx - w / 2, top: footY - h, width: w, height: h }}>
        <button className="st-crew-hit" aria-label={`${p.name}, ${p.role}: ${job}`} aria-expanded={isSel}
          onClick={() => onSelect?.(isSel ? null : id)}>
          {state && <img className="st-status" src={icon(state)} alt="" />}
          <img className="st-body" src={crewArt(id, suit ? 'suit' : 'body')} alt="" />
          <span className="st-name">{p.name}</span>
        </button>
        <div className="st-card" role={isSel ? 'dialog' : undefined} aria-label={`${p.name} card`}>
          <CrewCard s={s} p={p} />
          {isSel && canJob && (
            <div className="st-jobs" role="group" aria-label={`Job for ${p.name}`}>
              {JOBS.map((j) => {
                const ok = jobAllowed(s, p, j).ok, on = (s.plan.jobs[p.id] || 'rest') === j;
                return (
                  <button key={j} className={`small ${on ? '' : 'secondary'}`} aria-pressed={on} disabled={!ok} onClick={() => onJob!(p.id, j)}>
                    <img src={icon(JOB_ICON[j])} alt="" />{j}{c.SPECIALIST_OF[p.role] === j ? ' ×2' : ''}
                  </button>
                );
              })}
            </div>
          )}
          {isSel && !canJob && <p className="muted st-card-note">{p.medbay > 0 ? 'Resting in the medbay.' : s.sol < c.JOB_UNLOCK_SOL ? `Jobs open on sol ${c.JOB_UNLOCK_SOL}.` : 'Today is already decided.'}</p>}
        </div>
      </div>
    );
  };

  return (
    <section className={`station${st ? ' storm' : ''}${blinkOff ? ' blink-off' : ''}`} aria-label="Station" style={{ height }} onClick={(e) => { if (e.target === e.currentTarget) onSelect?.(null); }}>
      <div className="st-bg" style={{ backgroundImage: `url(${scene(day.weather === 'dust' ? 'bg-dust-storm' : 'bg-clear')})` }} />
      <div className="st-ground" style={{ top: Y(GROUND - 34), left: X(-40), width: (board.board.w + 80) * K, height: 70 * K }} />
      <img className="st-board" src={stationArt('station-board')} alt="" style={{ left: X(0), top: Y(0), width: board.board.w * K }} />

      {/* the greenhouse is round: the dome layer drawn again, darkened and cut to the glass only (the base keeps its light).
          Always rendered so turning the power on and off fades. */}
      <img className={`st-dome-dark ${roomState('greenhouse')}`} src={stationArt('dome')} alt="" style={{ left: X(dome.x), top: Y(dome.y), width: dome.w * K }} />

      {ROOMS.map((id) => {
        const r = board.rooms[id], state = roomState(id), sys = r.system, d = c.SYSTEMS[sys], n = cells[sys];
        const problem = s.problems.find((p) => PROBLEM_ROOM[p.type] === id);
        return (
          <div key={id} className={`st-room ${state}${id === 'greenhouse' ? ' round' : ''}`} style={{ left: X(r.x), top: Y(r.y), width: r.w * K, height: r.h * K }}>
            <div className="st-chip" title={`${r.name}: ${n} of ${d.want} cells`}>
              <img src={icon(SYSTEM_ICON[sys])} alt="" />
              {state === 'locked'
                ? <span>sol {d.unlockSol}</span>
                : <span className="st-cells">{Array.from({ length: Math.max(d.want, n) }, (_, i) => <img key={i} src={icon(i < n ? 'cell' : 'cell-empty')} alt="" />)}</span>}
              {roomWarn(id) && <img src={icon('warning')} alt={`needs ${d.want - n} more cell${d.want - n === 1 ? '' : 's'}`} title={`Needs ${d.want} cells to work properly`} />}
            </div>
            {id === 'greenhouse' && state !== 'locked' && (
              <div className="st-crop" title="Next harvest">
                <span>harvest</span>
                <span className="st-crop-bar" role="meter" aria-label="Crop growth to next harvest" aria-valuenow={s.crop} aria-valuemin={0} aria-valuemax={c.CROP_STEPS_TO_HARVEST}>
                  <i style={{ width: `${Math.min(100, (100 * s.crop) / c.CROP_STEPS_TO_HARVEST)}%` }} />
                </span>
                <span>{fmt(s.crop)}/{c.CROP_STEPS_TO_HARVEST}</span>
              </div>
            )}
            {problem && (
              <div className="st-problem" title={c.PROBLEMS[problem.type].name}>
                <img src={icon('repair')} alt="" />
                <span>{c.PROBLEMS[problem.type].name}</span>
                <span className="st-repair" role="meter" aria-label="Repair" aria-valuenow={problem.done} aria-valuemin={0} aria-valuemax={problemNeed(c, problem)}>
                  <i style={{ width: `${Math.min(100, (100 * problem.done) / problemNeed(c, problem))}%` }} />
                </span>
              </div>
            )}
          </div>
        );
      })}

      {ROOMS.flatMap((id) => {
        const ids = groups[id] ?? [], r = board.rooms[id], floor = Y(r.slots[0].y), light = roomState(id);
        return ids.map((cid, i) => figure(cid, X(r.x + (r.w * (i + 1)) / (ids.length + 1)), floor, false, id === 'radio' || id === 'workshop' ? 'left' : 'right', light));
      })}

      {[0, 1].map((i) => (
        <img key={i} className="st-panel" src={stationArt(dusty ? 'solar-panel-dusty' : 'solar-panel')} alt={i === 0 ? (dusty ? 'Dusty solar panels' : 'Solar panels') : ''}
          style={{ left: X(board.board.w - 36 + i * 62), top: Y(GROUND - 40 + i * 10), width: 80 * K }} />
      ))}
      {(groups.outside ?? []).map((cid, i) => figure(cid, X(-GUTTER + 40 + i * 46), Y(GROUND + 22 + (i % 2) * 8), true, 'right'))}

      {overlay}
    </section>
  );
}
