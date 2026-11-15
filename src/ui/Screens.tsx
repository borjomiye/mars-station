// Full-screen moments of a sol: title, event, evening call, mission report, plus album and data windows.
import {
  badgeOf, cards, cellsAvailable, cfg, crewById, currentEvent, donki, doseFor, effectiveCells, endMission, eventChoices, fmt, fmt2, getPeriod,
  MODES, messageOptions, planTotal, plural, problemNeed, stormOn, workPower,
  type GameState, type Mode, type RadioMessageId, type RealEvent,
} from '../engine';
import { crewArt, eventScene, icon, patchArt, robotArt, scene } from './art';
import { CrewCard, badgeIcon } from './bits';

// ---------- title ----------

const MODE_NAME: Record<Mode, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

type TitleProps = {
  name: string; setName: (v: string) => void; onRandom: () => void; mode: Mode; setMode: (m: Mode) => void;
  onLaunch: () => void; saved: GameState | null; onContinue: () => void; onAlbum: () => void; onData: () => void; albumCount: number;
};
export function TitleScreen(p: TitleProps) {
  return (
    <div className="screen title">
      <img className="screen-bg" src={scene('scene-station')} alt="The station on Mars: two modules and a glass greenhouse dome" />
      <img className="title-robot" src={robotArt('robot-wave')} alt="" />
      <div className="title-panel">
        <h1>Mars Outpost</h1>
        <p>You are the captain of a small station on Mars. Keep five people safe for 15 sols until the ship home lands.</p>
        {donki.stub && <p className="warning">Placeholder space weather: replace with real DONKI data before the demo.</p>}
        <label className="title-name">
          <span>Mission name <span className="muted">(same name = same Mars)</span></span>
          <span className="row">
            <input value={p.name} maxLength={24} onChange={(e) => p.setName(e.target.value.replace(/[^\p{L}\p{N} -]/gu, ''))} aria-label="Mission name" placeholder="Brave Otter" />
            <button className="secondary small" onClick={p.onRandom}>Random</button>
          </span>
        </label>
        <div className="row" role="group" aria-label="Difficulty">
          {MODES.map((m) => <button key={m} className={p.mode === m ? '' : 'secondary'} aria-pressed={p.mode === m} onClick={() => p.setMode(m)}>{MODE_NAME[m]}</button>)}
        </div>
        <div className="row">
          <button className="big" onClick={p.onLaunch}>Launch mission ▶</button>
          {p.saved && <button className="secondary" onClick={p.onContinue}>Continue {p.saved.name} · sol {p.saved.sol}</button>}
        </div>
        <div className="row">
          <button className="secondary small" onClick={p.onAlbum}><img className="btn-icon" src={icon('card-back')} alt="" />Album {p.albumCount}/{cards.length}</button>
          <button className="secondary small" onClick={p.onData}>Where the data comes from</button>
        </div>
      </div>
    </div>
  );
}

// ---------- event ----------

type EventProps = {
  s: GameState; picking: { id: string; ids: string[] } | null;
  onChoose: (id: string) => void; onTogglePick: (crewId: string) => void; onPickConfirm: () => void; onPickCancel: () => void;
  onChange: () => void; onBack: () => void; onPlay: () => void;
};
export function EventScreen({ s, picking, onChoose, onTogglePick, onPickConfirm, onPickCancel, onChange, onBack, onPlay }: EventProps) {
  const c = cfg(s.mode), ev = currentEvent(s), list = eventChoices(s), ch = s.today.choice, st = stormOn(s);
  if (!ev) return null;
  const sick = ev.id === 'sick_crew' && s.today.sickId ? crewById(s, s.today.sickId) : null;
  const title = sick ? `${sick.name} feels ill` : ev.id === 'solar_storm' && st && st.day > 0 ? `Solar storm, day ${st.day + 1}` : ev.title;
  const pickDef = picking ? list.find((x) => x.id === picking.id) : null;
  const chosen = ch ? list.find((x) => x.id === ch.id) : null, freeNow = cellsAvailable(s) - planTotal(s.plan);
  const shield = effectiveCells(s).shield;
  // repair picks: how much work the problem still needs and how much the picked people bring
  const problem = pickDef?.pick?.task === 'repair' && ev.problem ? s.problems.find((p) => p.type === ev.problem) : undefined;
  const repairNeed = problem ? Math.max(0, problemNeed(c, problem) - problem.done) : null;
  const picked = picking ? picking.ids.reduce((a, id) => a + workPower(c, crewById(s, id), 'fix'), 0) : 0;
  return (
    <div className="screen event">
      <img className="screen-bg" src={eventScene(ev.id, s)} alt="" />
      <div className={`event-head ${ev.kind}`}>
        <img src={icon(ev.kind === 'trouble' ? 'warning' : 'star')} alt="" />
        <div>
          <h1>{ev.kind === 'trouble' ? 'Trouble' : 'Chance'}: {title}</h1>
          <p>{sick ? `${sick.name} the ${sick.role} woke up ill.` : ev.line}</p>
          {ev.id === 'solar_storm' && st && <p className="real-line">Real event · {st.date} · <a href={st.link} target="_blank" rel="noreferrer">NASA DONKI</a></p>}
        </div>
      </div>

      <div className="event-panel">
        {pickDef && pickDef.pick && picking ? (
          <>
            <p className="event-ask">
              <b>{pickDef.label}:</b> pick {pickDef.pick.min}{pickDef.pick.max > pickDef.pick.min ? ` or ${pickDef.pick.max}` : ''}. Hover a person to see their card.
              {repairNeed !== null && <> · Work: <b className={picked >= repairNeed - 1e-9 ? 'good' : 'alert'}>{fmt(picked)}</b> (needs {fmt(repairNeed)}){picked >= repairNeed - 1e-9 ? ' ✓ fixed today' : ''}</>}
            </p>
            <div className="pick-row">
              {s.crew.map((p) => {
                const can = p.medbay <= 0 && !(pickDef.pick!.job === 'outside' && p.grounded), on = picking.ids.includes(p.id);
                const after = p.dose + doseFor(c, st, pickDef.pick!.job, shield).d, b = badgeOf(c, after);
                const power = repairNeed !== null ? workPower(c, p, 'fix') : null;
                return (
                  <button key={p.id} className={`pick${on ? ' on' : ''}`} disabled={!can} aria-pressed={on} onClick={() => onTogglePick(p.id)}>
                    <span className="pick-tip"><CrewCard s={s} p={p} /></span>
                    <span className="portrait"><img src={crewArt(p.id, 'portrait')} alt="" className={`role-${p.role}`} /></span>
                    <b>{p.name}</b>
                    {power !== null && (
                      <span className={`pick-power${power > 1 ? ' best' : power < 1 ? ' weak' : ''}`}>
                        {power > 1 ? '★ ' : ''}repair ×{fmt(power)}{power >= (repairNeed ?? Infinity) - 1e-9 ? ' · alone' : ''}
                      </span>
                    )}
                    <span className="pick-badge"><img src={badgeIcon(b)} alt="" />after: {b}{c.SHOW_MSV ? ` ${fmt2(after)}` : ''}</span>
                    {p.cond === 'tired' && <span className="alert">tired: may get hurt</span>}
                    {p.sick && <span className="alert">ill: will get worse</span>}
                    {!can && <span className="muted">cannot go</span>}
                  </button>
                );
              })}
            </div>
            <div className="row end">
              <button className="secondary" onClick={onPickCancel}>Cancel</button>
              <button className="big" disabled={picking.ids.length < pickDef.pick.min} onClick={onPickConfirm}>Confirm ▶</button>
            </div>
          </>
        ) : !ch ? (
          <>
            <div className="choice-row">
              {list.map((o) => (
                <button key={o.id} className="choice" disabled={!o.enabled} onClick={() => onChoose(o.id)}>
                  <b>{o.label}</b>
                  <span className="plus">+ {o.plus}</span>
                  <span className="minus">− {o.minus}</span>
                  {!o.enabled && <span className="muted">({o.why})</span>}
                  {o.enabled && o.dose !== null && <span className="muted">Dose today: {c.SHOW_MSV ? `${fmt2(o.dose)} mSv each` : o.dose <= c.DOSE_INDOOR_PER_SOL + 0.01 ? 'the minimum' : 'more than usual'}</span>}
                  {o.enabled && o.pick && <span className="muted">You pick who goes</span>}
                </button>
              ))}
            </div>
            <div className="row end"><button className="secondary" onClick={onBack}>← Back to the station</button></div>
          </>
        ) : (
          <>
            <p className="event-ask"><b>You chose: {ch.label}</b>{ch.crew.length > 0 && ` · ${ch.crew.map((id) => crewById(s, id).name).join(', ')}`}</p>
            {chosen && <p className="muted">+ {chosen.plus} · − {chosen.minus}</p>}
            {freeNow > 0 && <p className="alert">{plural(freeNow, 'free cell')} not shared yet. Go back to the station.</p>}
            <div className="row end">
              <button className="secondary" onClick={onBack}>← Station</button>
              <button className="secondary" onClick={onChange}>Change choice</button>
              <button className="big" onClick={onPlay}>Play the sol ▶</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- evening call ----------

export function RadioScreen({ s, onSend }: { s: GameState; onSend: (id: RadioMessageId | null) => void }) {
  return (
    <div className="screen radio">
      <img className="screen-bg" src={scene('scene-interior')} alt="" />
      <div className="radio-panel">
        <div className="radio-head">
          <img src={icon('earth')} alt="" />
          <div><h1>Evening call with Earth</h1><p>One message tonight. Mission Control answers at breakfast.</p></div>
        </div>
        <div className="choice-row two">
          {messageOptions(s).map((m) => (
            <button key={m.id} className="choice" disabled={!m.enabled} onClick={() => onSend(m.id)}>
              <b>“{m.label}”</b>
              <span className="plus">+ {m.plus}</span>
              <span className="minus">− {m.minus}</span>
              {!m.enabled && <span className="muted">({m.why})</span>}
            </button>
          ))}
        </div>
        <div className="row end"><button className="secondary" onClick={() => onSend(null)}>No message tonight ▶</button></div>
      </div>
    </div>
  );
}

// ---------- mission report ----------

const STAR_NAMES = ['Crew home safe', 'Science done', 'Nobody in the medbay, all badges green'];
const RealLine = ({ e }: { e: RealEvent }) => <li><b>{e.date} · {e.label}</b> <span className="muted">{e.note}.</span> <a href={e.link} target="_blank" rel="noreferrer">DONKI</a></li>;

export function ReportScreen({ s, album, onAgain, onNew }: { s: GameState; album: string[]; onAgain: () => void; onNew: () => void }) {
  const r = endMission(s);
  const weight = (e: RealEvent) => (e.type === 'SEP' ? 0 : e.label.startsWith('Solar flare X') ? 1 : e.note.includes('heading for Mars') && !e.note.includes('not') ? 2 : 3);
  const top = r.real.slice().sort((a, b) => weight(a) - weight(b) || a.sol - b.sol).slice(0, 3).sort((a, b) => a.sol - b.sol);
  return (
    <div className="screen report">
      <img className="report-banner" src={scene(r.won ? 'scene-victory' : 'scene-failure')} alt="" />
      <div className="report-head">
        <div>
          <h1>Captain's report · Mission {s.name}</h1>
          <p><b>{r.won ? 'The ship landed. Mission complete!' : `Mission Control called the crew home early on sol ${r.sol}. Everyone is safe.`}</b></p>
        </div>
        <div className="report-stars" role="img" aria-label={`${r.starCount} of 3 stars`}>{r.stars.map((on, i) => <img key={i} src={icon(on ? 'star' : 'star-empty')} alt="" />)}</div>
      </div>
      <div className="report-body">
        <div className="report-col">
          <ul className="star-list">
            {r.stars.map((on, i) => <li key={i}><img src={icon(on ? 'star' : 'star-empty')} alt="" /><span><b>{STAR_NAMES[i]}</b> {on ? <span className="good">earned</span> : <span className="alert">{r.hints[i]}</span>}</span></li>)}
          </ul>
          {!r.won && <p className="alert"><b>What mattered most:</b> {r.mattered}</p>}
          <p><b>Science sent home: {r.science} / {r.target}</b> · cards {r.found.length} found, {r.sent.length} sent · album {album.length}/{cards.length}</p>
          <h3>Real NASA events in your mission</h3>
          <ul className="real-list">{top.length ? top.map((e) => <RealLine key={e.id + e.sol} e={e} />) : <li className="muted">none reached</li>}</ul>
        </div>
        <div className="report-col">
          <h3>Radiation dose over {plural(r.sol, 'sol')}</h3>
          <table>
            <tbody>
              {r.doses.map((d) => {
                const p = s.crew.find((q) => q.name === d.name);
                return (
                  <tr key={d.name}>
                    <td><span className="portrait small"><img src={crewArt(p?.id ?? 'leo', 'portrait')} alt="" className={`role-${d.role}`} /></span></td>
                    <th scope="row">{d.name}</th>
                    <td>{fmt2(d.dose)} mSv</td>
                    <td><img className="mini" src={badgeIcon(d.badge)} alt="" /> {d.badge}</td>
                    <td className="muted">{plural(d.trips, 'trip')} · {plural(d.medbaySols, 'medbay sol')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small-text">mSv (millisievert) measures radiation dose. The game speeds time up.</p>
        </div>
      </div>
      <div className="report-buttons">
        <button className="secondary" onClick={onNew}>New mission</button>
        <button className="big" onClick={onAgain}>Same Mars again ▶</button>
      </div>
    </div>
  );
}

// ---------- windows ----------

export function AlbumView({ album }: { album: string[] }) {
  return (
    <div className="album-grid">
      {cards.map((k) => {
        const has = album.includes(k.id);
        return (
          <div key={k.id} className={`album-card${has ? ' found' : ''}`}>
            <img src={has ? patchArt('emblem-rocket') : icon('card-back')} alt="" />
            <b>{has ? k.title : '???'}</b>
            <span className="muted">{has ? k.kind : k.hint}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DataView({ periodId }: { periodId?: string }) {
  const period = periodId ? getPeriod(periodId) : undefined, c = cfg('medium');
  return (
    <div className="data-view">
      {donki.stub && <p className="warning">Placeholder space weather: replace with real DONKI data before the demo.</p>}
      <p>Solar flares, plasma clouds and solar particle storms come from NASA DONKI. Each one really happened on the date shown. Most were seen from near Earth: the game pretends they reached our station.</p>
      <p>The normal dose of {c.DOSE_INDOOR_PER_SOL} mSv per sol follows the Curiosity rover's RAD instrument (Hassler et al., Science 2014). In a storm the game multiplies it by {c.STORM_MULT_BY_DAY.join(' and ')}.</p>
      <p className="muted">Game values, not NASA limits: the badge turns amber at {c.BADGE_AMBER_MSV} mSv and red at {c.BADGE_RED_MSV} mSv. Crops, repairs and the 15-sol mission are sped up.</p>
      <p className="muted">The pictures are drawn for the game; they are not NASA photos.</p>
      <p className="muted">{donki.source}</p>
      {period && (
        <>
          <h3>All DONKI records of this mission ({period.start}, {period.days} days)</h3>
          <ul>{period.events.map((e) => <li key={e.id}>{e.type} {e.classType ?? ''} {e.date} <a href={e.link} target="_blank" rel="noreferrer">DONKI</a></li>)}</ul>
        </>
      )}
    </div>
  );
}
