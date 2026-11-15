// Full-screen moments of a sol: title, event, evening call, mission report, plus album and data windows.
import {
  badgeOf, cards, cellsAvailable, cfg, crewById, currentEvent, donki, doseComparison, doseFor, effectiveCells, endMission, eventChoices, fmt, fmt2, getPeriod,
  MODES, messageOptions, missionSetup, normSeed, planTotal, plural, problemNeed, siteDef, stormOn, taskDef, taskText, twistDef, workPower,
  type CardDef, type CardKind, type GameState, type Mode, type RadioMessageId, type RealEvent,
} from '../engine';
import { useState } from 'react';
import { cardPhoto, crewArt, eventScene, icon, robotArt, scene } from './art';
import { CrewCard, SoundToggle, badgeIcon } from './bits';
import { choiceIcon } from './choiceIcons';
import { MissionPatch } from './Patch';
import { sfx, useScreenSounds } from './sound';

// ---------- title ----------

const MODE_NAME: Record<Mode, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

type TitleProps = {
  name: string; setName: (v: string) => void; onRandom: () => void; mode: Mode; setMode: (m: Mode) => void;
  onLaunch: () => void; saved: GameState | null; onContinue: () => void; onAlbum: () => void; onData: () => void; albumCount: number;
};
export function TitleScreen(p: TitleProps) {
  const [help, setHelp] = useState(false);
  // the mission name picks the landing site and the twist: show them as the player types
  const setup = missionSetup(normSeed(p.name || 'Brave Otter')), site = siteDef(setup.siteId), tw = twistDef(setup.twistId);
  return (
    <div className="screen title">
      <img className="screen-bg" src={scene('scene-station')} alt="The station on Mars: two modules and a glass greenhouse dome" />
      <img className="title-robot" src={robotArt('robot-point')} alt="" />

      <nav className="title-corner" aria-label="More">
        <SoundToggle className="corner-btn" />
        <button className="corner-btn" data-sfx="open" onClick={p.onAlbum} aria-label={`Album, ${p.albumCount} of ${cards.length} collected`}>
          <img src={icon('card-back')} alt="" />
          <span className="corner-badge" aria-hidden="true">{p.albumCount}/{cards.length}</span>
          <span className="corner-tip" aria-hidden="true">Album</span>
        </button>
        <button className="corner-btn" data-sfx="open" onClick={p.onData} aria-label="Where the data comes from">
          <svg viewBox="0 0 14 14" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 11h10v1H2zM3 7h2v4H3zM6 4h2v7H6zM9 2h2v9H9z" /></svg>
          <span className="corner-tip" aria-hidden="true">Where the data comes from</span>
        </button>
      </nav>

      <main className="title-panel">
        <header className="title-head">
          <p className="title-tag">A 15-sol survival sim</p>
          <h1>Mars Outpost</h1>
          <p className="title-goal">Keep your crew of five alive for 15 sols until the ship home lands.</p>
        </header>
        {donki.stub && <p className="warning">Placeholder space weather: replace with real DONKI data before the demo.</p>}

        <div className="title-step">
          <label className="step-label" htmlFor="mission-name"><span className="step-num" aria-hidden="true">1</span>Name your mission</label>
          <div className="name-field">
            <MissionPatch name={p.name} size={44} />
            <input
              id="mission-name" value={p.name} maxLength={24} autoComplete="off" placeholder="Brave Otter"
              onChange={(e) => p.setName(e.target.value.replace(/[^\p{L}\p{N} -]/gu, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') p.onLaunch(); }}
            />
            <button className="dice" onClick={p.onRandom} aria-label="Random mission name" title="Random name">
              <svg viewBox="0 0 13 13" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 1h9v1H2zM1 2h1v9H1zM11 2h1v9h-1zM2 11h9v1H2zM3 3h2v2H3zM8 3h2v2H8zM5 5h3v3H5zM3 8h2v2H3zM8 8h2v2H8z" /></svg>
            </button>
          </div>
          <p className="title-mission" aria-live="polite">
            <span title={`${site.plus}. ${site.minus}.`}>Lands in <b>{site.name}</b></span>
            <span title={`${tw.plus}. ${tw.minus}.`}>Twist: <b>{tw.name}</b></span>
          </p>
        </div>

        <div className="title-step">
          <p className="step-label" id="diff-label"><span className="step-num" aria-hidden="true">2</span>Choose difficulty</p>
          <div className="segmented" role="radiogroup" aria-labelledby="diff-label">
            {MODES.map((m) => (
              <button key={m} role="radio" aria-checked={p.mode === m} className={p.mode === m ? 'on' : ''} onClick={() => p.setMode(m)}>
                {p.mode === m && <svg viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 1h1v1H6zM5 2h1v1H5zM4 3h1v1H4zM1 4h1v1H1zM3 4h1v1H3zM2 5h1v1H2z" /></svg>}
                {MODE_NAME[m]}
              </button>
            ))}
          </div>
        </div>

        <button className="launch" data-sfx="launch" onClick={p.onLaunch}>
          <span className="step-num" aria-hidden="true">3</span>
          Launch mission
          <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M8 1h2v1h1v2h-1v1H9v1H8v1H7v1H6V7H5V6H4V5h1V4h1V3h1V2h1zM2 6h2v1H2zM5 9h1v2H5zM2 8h2v1H3v1H2z" /></svg>
        </button>
        <div className="title-more">
          <button className="ghost" data-sfx="open" onClick={() => setHelp(true)}>How to play</button>
          {p.saved && <button className="ghost" onClick={p.onContinue}>Continue {p.saved.name} · sol {p.saved.sol}</button>}
        </div>
      </main>

      {help && (
        <div className="overlay" onClick={() => setHelp(false)}>
          <div className="overlay-box" role="dialog" aria-modal="true" aria-labelledby="htp-title" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head">
              <h2 id="htp-title">How to play</h2>
              <button className="secondary small" data-sfx="close" onClick={() => setHelp(false)} aria-label="Close" autoFocus>X</button>
            </div>
            <ol className="overlay-body htp-steps">
              {/* steps 1-8 written by the team in PR #8 (test/polish), checked against balance.json; step 9 covers the mission name */}
              <li><span className="step-num">1</span><div><b>Goal.</b> Keep all five crew alive until sol 15. If air or food stays at zero for too long (3 sols on Easy, 2 on Medium, 1 on Hard), the mission ends.</div></li>
              <li><span className="step-num">2</span><div><b>Morning.</b> Read the sky. Clear, hazy or dusty weather decides how many power cells the solar panels give today. A solar storm raises radiation.</div></li>
              <li><span className="step-num">3</span><div><b>Plan.</b> Share the power cells between life support, shield, greenhouse, radio and lab. Not enough cells for a system means it works badly or not at all. Then give each person a job.</div></li>
              <li><span className="step-num">4</span><div><b>Jobs.</b> One job per person per sol. Specialists do their own job twice as well. Fixing and going outside are heavy: two sols in a row make a person tired, and a tired person who works hard gets hurt.</div></li>
              <li><span className="step-num">5</span><div><b>Event.</b> Each sol brings trouble to fix or a chance to take. Every choice costs something, so read before you pick.</div></li>
              <li><span className="step-num">6</span><div><b>Results and radio.</b> See what changed and why. Send one message to Earth each night; the answer comes in the morning.</div></li>
              <li><span className="step-num">7</span><div><b>Radiation.</b> Dose only goes up. A trip outside adds more, and a storm multiplies it. A fully powered shield lowers the dose inside. A red badge grounds that person for good.</div></li>
              <li><span className="step-num">8</span><div><b>Stars.</b> One star for surviving, one for enough science from album cards and Mission Control tasks, one for a healthy crew with green badges.</div></li>
              <li><span className="step-num">9</span><div><b>Every mission is different.</b> The mission name picks the landing site, a twist with a gain and a price, and two Mission Control tasks. The same name gives the same mission, so a class can compare.</div></li>
            </ol>
          </div>
        </div>
      )}
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
  const c = cfg(s), ev = currentEvent(s), list = eventChoices(s), ch = s.today.choice, st = stormOn(s);
  // the event announces itself: a storm rumbles, trouble beeps, a chance sparkles
  useScreenSounds(() => (ev ? [[150, ev.id === 'solar_storm' ? sfx.storm : ev.kind === 'trouble' ? sfx.alarm : sfx.chance]] : []), [ev?.id, s.sol]);
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
    <div className={`screen event ev-${ev.id}`}>
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
                  <button key={p.id} className={`pick${on ? ' on' : ''}`} data-sfx="none" disabled={!can} aria-pressed={on} onClick={() => { sfx.pick(!on); onTogglePick(p.id); }}>
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
                  <span className="plus"><img src={icon(choiceIcon(o.plus, 'plus'))} alt="" />+ {o.plus}</span>
                  <span className="minus"><img src={icon(choiceIcon(o.minus, 'minus'))} alt="" />− {o.minus}</span>
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
  useScreenSounds(() => [[120, sfx.staticHiss]], [s.sol]);
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
            <button key={m.id} className="choice" data-sfx="radio" disabled={!m.enabled} onClick={() => onSend(m.id)}>
              <b>“{m.label}”</b>
              <span className="plus"><img src={icon(choiceIcon(m.plus, 'plus'))} alt="" />+ {m.plus}</span>
              <span className="minus"><img src={icon(choiceIcon(m.minus, 'minus'))} alt="" />− {m.minus}</span>
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
  // stars drop in one by one (timed with their animation), then the ship lands; an early return starts with a gentle "aww"
  useScreenSounds(() => [
    ...(r.won ? [] : [[150, sfx.lose] as [number, () => void]]),
    ...r.stars.flatMap((on, i): [number, () => void][] => (on ? [[(r.won ? 300 : 900) + i * 350 + 120, () => sfx.star(i)]] : [])),
    ...(r.won ? [[300 + 3 * 350 + 150, sfx.win] as [number, () => void]] : []),
  ], [s.name, s.sol]);
  const weight = (e: RealEvent) => (e.type === 'SEP' ? 0 : e.label.startsWith('Solar flare X') ? 1 : e.note.includes('heading for Mars') && !e.note.includes('not') ? 2 : 3);
  const top = r.real.slice().sort((a, b) => weight(a) - weight(b) || a.sol - b.sol).slice(0, 2).sort((a, b) => a.sol - b.sol);
  const c = cfg(s), iss = doseComparison.iss.perDayMSv, issDay = (iss.min + iss.max) / 2;
  const avgDose = r.doses.reduce((a, d) => a + d.dose, 0) / Math.max(1, r.doses.length);
  const issDays = Math.max(1, Math.round(avgDose / issDay));
  // one thing to try next time: the first star that was missed, or a harder mode
  const missed = r.stars.findIndex((on) => !on);
  const tryNext = missed >= 0 ? (missed === 0 ? r.mattered : r.hints[missed]) : s.mode !== 'hard' ? 'All three stars! Try a harder mode next.' : 'All three stars on Hard. A true Mars captain!';
  return (
    <div className="screen report">
      <img className="report-banner" src={scene(r.won ? 'scene-victory' : 'scene-failure')} alt="" />
      <div className="report-head">
        <MissionPatch name={s.name} size={84} />
        <div>
          <h1>Mission {s.name}</h1>
          <p><b>{r.won ? 'The ship landed. Mission complete!' : `Mission Control called the crew home early on sol ${r.sol}. Everyone is safe.`}</b></p>
        </div>
        <div className="report-stars" role="img" aria-label={`${r.starCount} of 3 stars`}>{r.stars.map((on, i) => <img key={i} src={icon(on ? 'star' : 'star-empty')} alt="" className={on ? 'on' : ''} style={{ animationDelay: `${(r.won ? 0.3 : 0.9) + i * 0.35}s` }} />)}</div>
      </div>
      <div className="report-body">
        <div className="report-col">
          <ul className="star-list">
            {r.stars.map((on, i) => <li key={i} className={on ? 'on' : ''}><img src={icon(on ? 'star' : 'star-empty')} alt="" /><b>{STAR_NAMES[i]}</b></li>)}
          </ul>
          <p className="try-next"><img src={icon('tip')} alt="" /><span><b>Try next:</b> {tryNext}</span></p>
          <p className="report-science"><img src={icon('science')} alt="" />Science sent home: <b>{r.science} / {r.target}</b> · album {album.length}/{cards.length}</p>
          {s.tasks.length > 0 && (
            <p className="report-science"><img src={icon('radio')} alt="" />Mission Control tasks done: <b>{s.tasks.filter((x) => x.status === 'done').length} / {s.tasks.length}</b> · landed in {siteDef(s.siteId).name}</p>
          )}
          {top.length > 0 && (
            <>
              <h3>Real NASA events in your mission</h3>
              <ul className="real-list">{top.map((e) => <RealLine key={e.id + e.sol} e={e} />)}</ul>
            </>
          )}
        </div>
        <div className="report-col">
          <h3>Your crew</h3>
          <ul className="crew-badges">
            {r.doses.map((d) => {
              const p = s.crew.find((q) => q.name === d.name);
              return (
                <li key={d.name}>
                  <span className="portrait"><img src={crewArt(p?.id ?? 'leo', 'portrait')} alt="" className={`role-${d.role}`} /></span>
                  <b>{d.name}</b>
                  <span className="crew-badge"><img src={badgeIcon(d.badge)} alt="" />{d.badge}</span>
                  {c.SHOW_MSV && <span className="muted">{fmt2(d.dose)} mSv</span>}
                </li>
              );
            })}
          </ul>
          <p className="iss-line">
            <img src={icon('iss')} alt="" />
            <span>Each of your crew got about as much radiation as <b>{plural(issDays, 'day')}</b> on the Space Station. <a href={doseComparison.iss.link} target="_blank" rel="noreferrer">NASA</a></span>
          </p>
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

const KIND_NAME: Record<CardKind, string> = { chance: 'Mars find', lab: 'Lab find', milestone: 'Milestone' };
const KIND_ICON: Record<CardKind, string> = { chance: 'rock-sample', lab: 'science', milestone: 'star' };

/** Found cards show their real NASA photo; a click opens the photo with its fact and sources. */
/** One card: the real NASA photo, the fact and its sources. Used by the album and by the "new card" pop-up. */
export function CardDetail({ card, onBack, backLabel }: { card: CardDef; onBack: () => void; backLabel: string }) {
  const photoLink = `https://images.nasa.gov/details/${card.photo.nasaId}`;
  const sameSource = card.link === photoLink;
  return (
    <div className="album-detail">
      <img className="album-photo" src={cardPhoto(card.id)} alt={card.photo.alt} />
      <div className="album-text">
        <span className="muted">{KIND_NAME[card.kind]}</span>
        <h3>{card.title}</h3>
        <p>{card.fact}</p>
        {sameSource ? (
          <p className="muted album-source">Photo and fact: {card.photo.credit} · <a href={photoLink} target="_blank" rel="noreferrer">NASA Image Library</a></p>
        ) : (
          <>
            <p className="muted album-source">Fact: <a href={card.link} target="_blank" rel="noreferrer">{card.source}</a></p>
            <p className="muted album-source">Photo: {card.photo.credit} · <a href={photoLink} target="_blank" rel="noreferrer">NASA Image Library</a></p>
          </>
        )}
        <button className="secondary" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}

/** A small banner when a card is found, with a button to look at it right away. */
export function CardToast({ id, more, onLook, onClose }: { id: string; more: number; onLook: () => void; onClose: () => void }) {
  const card = cards.find((k) => k.id === id);
  if (!card) return null;
  return (
    <div className="card-toast" role="status" key={id}>
      <img className="card-toast-thumb" src={cardPhoto(card.id)} alt="" />
      <div className="card-toast-text">
        <span>New card{more > 0 ? ` (+${more} more)` : ''}!</span>
        <b>{card.title}</b>
      </div>
      <button className="small" data-sfx="open" onClick={onLook}>Look</button>
      <button className="secondary small" data-sfx="close" onClick={onClose} aria-label="Later">✕</button>
    </div>
  );
}

/** Mission Control requests for this mission and how they stand. */
export function TasksView({ s }: { s: GameState }) {
  const mark = { open: '…', done: '✓', failed: '✕' } as const;
  return (
    <div className="tasks-view">
      <p className="muted">Mission Control sends extra jobs. Each one done adds science, but it may pull power and people away from other work.</p>
      <ul>
        {s.tasks.map((x) => {
          const d = taskDef(x.id);
          return (
            <li key={x.id} className={`task ${x.status}`}>
              <span className="task-mark" aria-hidden="true">{mark[x.status]}</span>
              <span>{taskText(d)}</span>
              <b>{x.status === 'done' ? `+${d.reward} science` : x.status === 'failed' ? 'missed' : `+${d.reward} science`}</b>
            </li>
          );
        })}
      </ul>
      <p className="muted">Landed in <b>{siteDef(s.siteId).name}</b>: {siteDef(s.siteId).plus}. {siteDef(s.siteId).minus}.</p>
      <p className="muted">Twist: <b>{twistDef(s.twistId).name}</b>: {twistDef(s.twistId).plus}. {twistDef(s.twistId).minus}.</p>
    </div>
  );
}

export function AlbumView({ album }: { album: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const card = open ? cards.find((k) => k.id === open) : undefined;
  if (card) return <CardDetail card={card} onBack={() => setOpen(null)} backLabel="◀ Back to album" />;
  return (
    <div className="album-grid">
      {cards.map((k) => {
        const has = album.includes(k.id);
        return has ? (
          <button key={k.id} className="album-card found" onClick={() => setOpen(k.id)} aria-label={`${k.title}: open the photo and fact`}>
            <img className="album-thumb" src={cardPhoto(k.id)} alt={k.photo.alt} loading="lazy" />
            <b>{k.title}</b>
            <span className="muted">{KIND_NAME[k.kind]}</span>
          </button>
        ) : (
          <div key={k.id} className="album-card">
            <img className="album-silhouette" src={icon(KIND_ICON[k.kind])} alt="" />
            <b>???</b>
            <span className="muted">{k.hint}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DataView({ periodId }: { periodId?: string }) {
  const period = periodId ? getPeriod(periodId) : undefined, c = cfg('medium'), dose = doseComparison;
  return (
    <div className="data-view">
      {donki.stub && <p className="warning">Placeholder space weather: replace with real DONKI data before the demo.</p>}
      <p>Solar flares, plasma clouds and solar particle storms come from NASA DONKI. Each one really happened on the date shown. Most were seen from near Earth: the game pretends they reached our station.</p>
      <p>The normal dose of {c.DOSE_INDOOR_PER_SOL} mSv per sol comes from the Curiosity rover: its RAD instrument measured an average of {dose.mars.perDayMSv} mSv per day on Mars from {dose.mars.period} (<a href={dose.mars.link} target="_blank" rel="noreferrer">NASA</a>). In a storm the game multiplies it by {c.STORM_MULT_BY_DAY.join(' and ')}.</p>
      <p>Is that a lot? Astronauts on the Space Station get about {dose.iss.sixMonthsSolarMaxMSv} to {dose.iss.sixMonthsSolarMinMSv} mSv in six months, that is {dose.iss.perDayMSv.min} to {dose.iss.perDayMSv.max} mSv a day (<a href={dose.iss.link} target="_blank" rel="noreferrer">NASA</a>). So a day on Mars is about like a day on the Space Station. On the way to Mars and in solar storms it is higher.</p>
      <p className="muted">Game values, not NASA limits: the badge turns amber at {MODES.map((m) => cfg(m).BADGE_AMBER_MSV).join(' / ')} mSv and red at {MODES.map((m) => cfg(m).BADGE_RED_MSV).join(' / ')} mSv (Easy / Medium / Hard). Crops, repairs and the 15-sol mission are sped up.</p>
      <p className="muted">Also simplified: a fully powered shield trims the everyday dose inside by {Math.round(c.SHIELD_DAILY_CUT * 100)}%. Real shielding helps much more against solar storms than against the everyday cosmic rays. The lower dose in Hellas Basin is a game estimate: thicker air above blocks a little more radiation.</p>
      <p className="muted">The station, the crew and the robot are drawn for the game. The photos on album cards are real NASA images, each with its credit. Lab and health cards come from studies in NASA's Open Science Data Repository (OSDR); every card links to its source.</p>
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
