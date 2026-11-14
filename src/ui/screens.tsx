// One screen per phase of the sol, plus the report and the data sources.
import {
  SYSTEMS, cardDef, cards, cellsAvailable, cfg, crewById, currentEvent, donki, doseFor, endMission, eventChoices, fmt, fmt2, getMorning, getPeriod, isBlackout, isUnlocked,
  knownForecast, messageOptions, planTotal, plural, previewSol, problemEffect, problemNeed, radioBlocked, radioCanSend, radioOffReason, stormOn,
  type Forecast, type GameState, type RadioMessageId, type RealEvent, type SystemId,
} from '../engine';

const RealCard = ({ e }: { e: RealEvent }) => (
  <div className="real">
    <strong>Real event · {e.date} · {e.label}</strong>
    <span className="source"> {e.note}. <a href={e.link} target="_blank" rel="noreferrer">NASA DONKI</a></span>
  </div>
);
const ForecastLine = ({ f }: { f: Forecast }) => (
  <p className={f.storm ? 'alert' : 'muted'} style={{ margin: 0 }}>
    Forecast sol {f.sol}: {f.weather}, {f.cells} cells{f.storm ? `, solar storm x${f.storm}` : ', no storm'}
  </p>
);

export function BriefingScreen({ s, onPlan }: { s: GameState; onPlan: () => void }) {
  const m = getMorning(s);
  return (
    <section className="panel stack">
      <h2>Morning briefing · sol {s.sol}</h2>
      <ul className="lines">
        {m.lines.map((l) => <li key={l}>{l}</li>)}
        {m.notes.map((l) => <li key={l} className="alert">{l}</li>)}
        {m.answers.map((l) => <li key={l}><strong>Earth: {l}</strong></li>)}
      </ul>
      {m.unlocked.length > 0 && <p className="good" style={{ margin: 0 }}><strong>New today: {m.unlocked.join(', ')}</strong></p>}
      {m.words.map((w) => <p key={w} className="term" style={{ margin: 0 }}>New word · {w}</p>)}
      {m.real.map((e) => <RealCard key={e.id} e={e} />)}
      {m.storm && <p className="alert" style={{ margin: 0 }}>Solar storm today: dose x{m.storm.mult} unless the shield is fully powered.</p>}
      {m.blackout && <p className="alert" style={{ margin: 0 }}>Radio blackout today: the Sun is between Mars and Earth.</p>}
      <p style={{ margin: 0 }}><strong>Today: {m.weather} sky · {m.cells} energy cells</strong> <span className="muted">({m.cellNotes.join(', ')})</span></p>
      {m.forecast.map((f) => <ForecastLine key={f.sol} f={f} />)}
      <button onClick={onPlan}>Plan the sol ▶</button>
    </section>
  );
}

export function PlanScreen({ s, onCells, onDone }: { s: GameState; onCells: (k: SystemId, delta: number) => void; onDone: () => void }) {
  const c = cfg(s.mode), avail = cellsAvailable(s), free = avail - planTotal(s.plan), st = stormOn(s), pv = previewSol(s);
  const effect = (k: SystemId, n: number, short: number): string => {
    if (k === 'life') return short > 0 ? `Air & water −${short * c.AIR_LOSS_PER_MISSING_CELL} tonight` : short < 0 ? `Air & water +${-short * c.AIR_GAIN_PER_EXTRA_CELL} tonight` : 'Air & water stays level';
    if (k === 'shield') return !st ? 'No storm today: shield not needed' : short <= 0 ? 'Storm dose inside: minimum' : `Storm dose inside: ${c.SHOW_MSV ? fmt2(doseFor(c, st, 'rest', n).d) + ' mSv each' : 'higher'}`;
    if (k === 'greenhouse') return n > 0 ? `Crop +${n * c.STEPS_PER_GREENHOUSE_CELL} steps, plus crew help` : 'Crops wait';
    if (k === 'radio') return isBlackout(s) ? 'Blackout: the Sun is in the way' : radioBlocked(s) ? 'Antenna is off: no radio' : short <= 0 ? 'Message to Earth tonight' : 'No message tonight';
    return short <= 0 ? 'Lab works: samples become cards' : 'Lab dark: no science';
  };
  return (
    <section className="panel stack">
      <h2>Plan the sol</h2>
      <p style={{ margin: 0 }} className={free > 0 ? 'alert' : ''}><strong>Cells today: {avail} · free: {free}</strong> <span className="muted">({s.supplyNotes.join(', ')})</span></p>
      {SYSTEMS.map((k) => {
        const d = c.SYSTEMS[k], n = s.plan.cells[k], open = isUnlocked(s, k), short = d.want - n, black = k === 'radio' && isBlackout(s);
        return (
          <div key={k} className="system">
            <div>
              <strong>{d.name}</strong>{' '}
              {open
                ? <span className={short > 0 ? 'alert' : 'good'}>{n} of {d.want}{short > 0 ? ` · ${short} short` : n > d.want ? ` · +${n - d.want} extra` : ' · OK'}</span>
                : <span className="muted">opens on sol {d.unlockSol}</span>}
              <div className="cells" aria-hidden="true">{Array.from({ length: d.max }, (_, i) => <span key={i} className={`cell${i < n ? '' : ' empty'}${i >= d.want ? ' bonus' : ''}`} />)}</div>
              {open && <div className="muted" style={{ fontSize: 15 }}>{effect(k, n, short)}</div>}
            </div>
            <div className="row">
              <button className="small secondary" aria-label={`Less power for ${d.name}`} disabled={!open || n <= 0} onClick={() => onCells(k, -1)}>−</button>
              <button className="small" aria-label={`More power for ${d.name}`} disabled={!open || black || n >= d.max || free <= 0} onClick={() => onCells(k, 1)}>+</button>
            </div>
          </div>
        );
      })}
      {s.problems.map((p) => (
        <p key={p.uid} className="alert" style={{ margin: 0 }}>
          Open trouble: {c.PROBLEMS[p.type].name} ({c.PROBLEMS[p.type].where}) · repair {fmt(p.done)}/{fmt(problemNeed(c, p))} · every sol: {problemEffect(c, p)}
        </p>
      ))}
      {knownForecast(s).map((f) => <ForecastLine key={f.sol} f={f} />)}
      <p style={{ margin: 0 }}>Tonight with this plan: Air & water {fmt(s.air)}→{fmt(pv.air)} · Food {fmt(s.food)}→{fmt(pv.food)} · Crop {fmt(s.crop)}→{fmt(pv.crop)}</p>
      <button onClick={onDone}>{s.today.revealed && currentEvent(s) ? 'Back to the event ▶' : 'Done planning ▶'}</button>
    </section>
  );
}

type EventProps = {
  s: GameState; picking: { id: string; ids: string[] } | null;
  onChoose: (id: string) => void; onPickConfirm: () => void; onPickCancel: () => void; onChange: () => void; onBack: () => void; onPlay: () => void;
};
export function EventScreen({ s, picking, onChoose, onPickConfirm, onPickCancel, onChange, onBack, onPlay }: EventProps) {
  const c = cfg(s.mode), ev = currentEvent(s), list = eventChoices(s), ch = s.today.choice, st = stormOn(s);
  if (!ev) return null;
  const sick = ev.id === 'sick_crew' && s.today.sickId ? crewById(s, s.today.sickId) : null;
  const title = sick ? `${sick.name} feels ill` : ev.id === 'solar_storm' && st && st.day > 0 ? `Solar storm, day ${st.day + 1}` : ev.title;
  const pickDef = picking ? list.find((x) => x.id === picking.id) : null;
  const chosen = ch ? list.find((x) => x.id === ch.id) : null, freeNow = cellsAvailable(s) - planTotal(s.plan);
  return (
    <section className="panel stack">
      <h2>{ev.kind === 'trouble' ? 'Trouble' : 'Chance'}: {title}</h2>
      <p style={{ margin: 0 }}>{sick ? `${sick.name} the ${sick.role} woke up ill.` : ev.line}</p>
      {ev.id === 'solar_storm' && st && <p className="real" style={{ margin: 0 }}><strong>Real event · {st.date}</strong> <a href={st.link} target="_blank" rel="noreferrer">NASA DONKI</a></p>}
      {pickDef && pickDef.pick && picking ? (
        <>
          <p style={{ margin: 0 }}><strong>{pickDef.label}</strong></p>
          <p style={{ margin: 0 }}>Pick {pickDef.pick.min}{pickDef.pick.max > pickDef.pick.min ? ` or ${pickDef.pick.max}` : ''} crew below. Their dose badge after the job is shown.</p>
          <p className="alert" style={{ margin: 0 }}>Picked: {picking.ids.length ? picking.ids.map((id) => crewById(s, id).name).join(', ') : 'nobody yet'}</p>
          <div className="row">
            <button disabled={picking.ids.length < pickDef.pick.min} onClick={onPickConfirm}>Confirm</button>
            <button className="secondary" onClick={onPickCancel}>Cancel</button>
          </div>
        </>
      ) : !ch ? (
        <>
          <div className="choices">
            {list.map((o) => (
              <button key={o.id} className="choice secondary" disabled={!o.enabled} onClick={() => onChoose(o.id)}>
                <strong>{o.label}</strong>
                <span>+ {o.plus}</span>
                <span>− {o.minus}</span>
                {!o.enabled && <span>({o.why})</span>}
                {o.enabled && o.dose !== null && <span>Dose today: {c.SHOW_MSV ? `${fmt2(o.dose)} mSv each` : o.dose <= c.DOSE_INDOOR_PER_SOL + 0.01 ? 'the minimum' : 'more than usual'}</span>}
                {o.enabled && o.pick && <span>You pick who goes</span>}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={onBack}>← Back to the plan</button>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}><strong>You chose: {ch.label}</strong>{ch.crew.length > 0 && ` · crew: ${ch.crew.map((id) => crewById(s, id).name).join(', ')}`}</p>
          {chosen && <p className="muted" style={{ margin: 0 }}>+ {chosen.plus}<br />− {chosen.minus}</p>}
          {freeNow > 0 && <p className="alert" style={{ margin: 0 }}>{plural(freeNow, 'free cell')} not shared yet. Go back to the plan.</p>}
          <div className="row">
            <button onClick={onPlay}>Play the sol ▶</button>
            <button className="secondary" onClick={onChange}>Change choice</button>
            <button className="secondary" onClick={onBack}>← Back to the plan</button>
          </div>
        </>
      )}
    </section>
  );
}

export function ResultsScreen({ s, onNext }: { s: GameState; onNext: () => void }) {
  const c = cfg(s.mode), b = s.today.before;
  const label = s.over ? 'Mission Control calls ▶' : radioCanSend(s) ? 'Evening call ▶' : s.sol >= c.MISSION_SOLS ? 'The ship lands ▶' : `Sleep → sol ${s.sol + 1} ▶`;
  const note = s.over ? `A tank stayed empty for ${c.ZERO_SOLS_TO_LOSE} sols.` : radioCanSend(s) ? '' : radioOffReason(s);
  return (
    <section className="panel stack">
      <h2>Sol {s.sol} results</h2>
      {b && <p style={{ margin: 0 }}><strong>Air & water {fmt(b.air)}→{fmt(s.air)} · Food {fmt(b.food)}→{fmt(s.food)} · Crop {fmt(b.crop)}→{fmt(s.crop)}</strong></p>}
      <ul className="lines results">
        {s.lastResults.map((r, i) => <li key={i}><strong>{r.t}</strong> <span className="muted">← {r.why}</span></li>)}
      </ul>
      {note && <p className="alert" style={{ margin: 0 }}>{note}</p>}
      <button onClick={onNext}>{label}</button>
    </section>
  );
}

export function RadioScreen({ s, onSend }: { s: GameState; onSend: (id: RadioMessageId | null) => void }) {
  return (
    <section className="panel stack">
      <h2>Evening call</h2>
      <p className="muted" style={{ margin: 0 }}>One message to Earth. The answer comes at breakfast.</p>
      <div className="choices">
        {messageOptions(s).map((m) => (
          <button key={m.id} className="choice secondary" disabled={!m.enabled} onClick={() => onSend(m.id)}>
            <strong>“{m.label}”</strong>
            <span>+ {m.plus}</span>
            <span>− {m.minus}</span>
            {!m.enabled && <span>({m.why})</span>}
          </button>
        ))}
      </div>
      <button className="secondary" onClick={() => onSend(null)}>No message tonight ▶</button>
    </section>
  );
}

const STAR_NAMES = ['Crew home safe', 'Science done', 'Nobody in the medbay, all badges green'];

export function ReportScreen({ s, album, onAgain, onNew }: { s: GameState; album: string[]; onAgain: () => void; onNew: () => void }) {
  const r = endMission(s);
  // one line per real event, the most important first: storms, X flares, clouds aimed at Mars
  const weight = (e: RealEvent) => (e.type === 'SEP' ? 0 : e.label.startsWith('Solar flare X') ? 1 : e.note.includes('heading for Mars') && !e.note.includes('not') ? 2 : 3);
  const top = r.real.slice().sort((a, b) => weight(a) - weight(b) || a.sol - b.sol).slice(0, 6).sort((a, b) => a.sol - b.sol);
  return (
    <section className="panel stack">
      <h2>Captain's report · Mission {s.name}</h2>
      <p style={{ margin: 0 }}><strong>{r.won ? 'The ship landed. Mission complete.' : `Mission Control called the crew home early on sol ${r.sol}. Everyone is safe.`}</strong></p>
      <div className="stars" role="img" aria-label={`${r.starCount} of 3 stars`}>{r.stars.map((on, i) => <span key={i}>{on ? '★' : '☆'}</span>)}</div>
      <p style={{ margin: 0 }}><strong>Stars earned: {r.starCount} / 3.</strong> {r.starCount === 0 ? 'No stars this time. Same Mars again: change one decision.' : r.starCount === 3 ? 'Perfect mission!' : `${plural(3 - r.starCount, 'star')} still to earn.`}</p>
      <ul className="lines">
        {r.stars.map((on, i) => (
          <li key={i}><strong>Star {i + 1} · {STAR_NAMES[i]}:</strong> {on ? <span className="good">earned</span> : <span className="alert">how to get it: {r.hints[i]}</span>}</li>
        ))}
      </ul>
      {!r.won && <p className="alert" style={{ margin: 0 }}><strong>The decision that mattered most:</strong> {r.mattered}</p>}
      <h3>Radiation dose over {r.sol} sols</h3>
      <table>
        <tbody>
          {r.doses.map((d) => (
            <tr key={d.name}><th scope="row">{d.name}</th><td className="muted">{d.role}</td><td>{fmt2(d.dose)} mSv</td><td className={d.badge === 'green' ? 'good' : 'alert'}>{d.badge}</td><td className="muted">{plural(d.trips, 'trip')} outside · {plural(d.medbaySols, 'sol')} in medbay</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ margin: 0 }}>mSv (millisievert) is a unit for radiation dose. The game speeds time up: 15 sols stand for a much longer stay.</p>
      <h3>Science sent home: {r.science} / {r.target}</h3>
      <p style={{ margin: 0 }}>Cards found {r.found.length}, sent {r.sent.length} · album {album.length} of {cards.length}</p>
      <p className="muted" style={{ margin: 0 }}>{r.found.map((id) => cardDef(id).title + (r.sent.includes(id) ? '' : ' (not sent)')).join(' · ') || 'no cards'}</p>
      <h3>Real NASA events in your mission</h3>
      {top.length ? top.map((e) => <RealCard key={e.id + e.sol} e={e} />) : <p className="muted" style={{ margin: 0 }}>none reached</p>}
      {r.real.length > top.length && <p className="muted" style={{ margin: 0 }}>…and {r.real.length - top.length} more. The full list is under “Where the data comes from”.</p>}
      <div className="row">
        <button onClick={onAgain}>Same Mars again ▶</button>
        <button className="secondary" onClick={onNew}>New mission</button>
      </div>
    </section>
  );
}

export function DataScreen({ periodId, onBack }: { periodId?: string; onBack: () => void }) {
  const period = periodId ? getPeriod(periodId) : undefined, c = cfg('commander');
  return (
    <section className="panel stack">
      <h2>Where the data comes from</h2>
      {donki.stub && <div className="warning">Placeholder space weather: replace with real DONKI data before the demo.</div>}
      <p>Solar flares, plasma clouds and solar particle storms come from NASA DONKI. Each one really happened on the date shown. Most were seen from near Earth: the game pretends they reached our station.</p>
      <p>The normal dose of {c.DOSE_INDOOR_PER_SOL} mSv per sol follows the Curiosity rover's RAD instrument (Hassler et al., Science 2014). In a storm the game multiplies it by {c.STORM_MULT_BY_DAY.join(' and ')}.</p>
      <p className="muted">Game values, not NASA limits: the badge turns amber at {c.BADGE_AMBER_MSV} mSv and red at {c.BADGE_RED_MSV} mSv. Crops, repairs and the 15-sol mission are sped up.</p>
      <p className="muted">{donki.source}</p>
      {period && (
        <>
          <h3>All DONKI records of this mission ({period.start}, {period.days} days)</h3>
          <ul className="lines">
            {period.events.map((e) => <li key={e.id}>{e.type} {e.classType ?? ''} {e.date} <a href={e.link} target="_blank" rel="noreferrer">DONKI</a></li>)}
          </ul>
        </>
      )}
      <button className="secondary" onClick={onBack}>Back</button>
    </section>
  );
}

