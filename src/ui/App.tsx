import { useState } from 'react';
import {
  applyPlan, backToPlan, cards, clearChoice, confirmPlan, createMission, donki, eventChoices, playSol, proceed, randomMissionName, resolveEvent, sendMessage, startPlanning,
  type GameState, type Job, type Mode, type SystemId,
} from '../engine';
import { addToAlbum, loadAlbum, loadGame, saveGame } from './save';
import { Crew, Helper, Hud } from './panels';
import { BriefingScreen, DataScreen, EventScreen, PlanScreen, RadioScreen, ReportScreen, ResultsScreen } from './screens';

type Picking = { id: string; ids: string[] };

export default function App() {
  const [s, setState] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(() => loadGame());
  const [album, setAlbum] = useState<string[]>(() => loadAlbum());
  const [picking, setPicking] = useState<Picking | null>(null);
  const [showData, setShowData] = useState(false);
  const [name, setName] = useState(() => randomMissionName());
  const [mode, setMode] = useState<Mode>('cadet');

  /** Every engine step goes through here: save the mission, keep found cards in the album. */
  const set = (next: GameState) => {
    setPicking(null);
    setState(next);
    saveGame(next);
    setSaved(next.phase === 'report' ? null : next);
    setAlbum((a) => addToAlbum(a, next.cards.found));
  };
  const toMenu = () => { setPicking(null); setState(null); };

  const header = (
    <header className="row" style={{ justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0, color: 'var(--mars)' }}>Mars Outpost</h1>
      <div className="row">
        {s && <button className="secondary small" onClick={toMenu}>Menu</button>}
        <button className="secondary small" onClick={() => setShowData((v) => !v)}>Where the data comes from</button>
      </div>
    </header>
  );

  if (showData) return <main className="app">{header}<DataScreen periodId={s?.periodId} onBack={() => setShowData(false)} /></main>;

  if (!s) {
    return (
      <main className="app">
        {header}
        <section className="panel stack">
          {donki.stub && <div className="warning">Placeholder space weather: replace with real DONKI data before the demo.</div>}
          <p style={{ margin: 0 }}>You are the captain of a small station on Mars. Keep five people safe for 15 sols until the ship home lands.</p>
          <label className="stack">
            Mission name (same name = same Mars)
            <span className="row">
              <input value={name} maxLength={24} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))} aria-label="Mission name" />
              <button className="secondary small" onClick={() => setName(randomMissionName())}>Random name</button>
            </span>
          </label>
          <div className="row" role="group" aria-label="Mode">
            <button className={mode === 'cadet' ? '' : 'secondary'} aria-pressed={mode === 'cadet'} onClick={() => setMode('cadet')}>Cadet · helper hints, gentler storms</button>
            <button className={mode === 'commander' ? '' : 'secondary'} aria-pressed={mode === 'commander'} onClick={() => setMode('commander')}>Commander · real mSv, forecast by radio</button>
          </div>
          <div className="row">
            <button onClick={() => set(createMission(name || 'Brave Otter', mode))}>Launch mission ▶</button>
            {saved && <button className="secondary" onClick={() => setState(saved)}>Continue Mission {saved.name} (sol {saved.sol})</button>}
          </div>
        </section>
        <section className="panel stack">
          <strong>Discovery album · {album.length} of {cards.length} found</strong>
          <ul className="lines album">
            {cards.map((k) => <li key={k.id} className={album.includes(k.id) ? '' : 'muted'}>{album.includes(k.id) ? `■ ${k.title}` : `□ ??? · hint: ${k.hint}`}</li>)}
          </ul>
        </section>
      </main>
    );
  }

  if (s.phase === 'report') {
    return (
      <main className="app">
        {header}
        <Hud s={s} />
        <ReportScreen s={s} album={album} onAgain={() => set(createMission(s.name, s.mode))} onNew={() => { setName(randomMissionName()); toMenu(); }} />
      </main>
    );
  }

  const setCells = (k: SystemId, delta: number) => set(applyPlan(s, { ...s.plan, cells: { ...s.plan.cells, [k]: s.plan.cells[k] + delta } }));
  const setJob = (crewId: string, job: Job) => set(applyPlan(s, { ...s.plan, jobs: { ...s.plan.jobs, [crewId]: job } }));
  const choose = (id: string) => {
    const def = eventChoices(s).find((x) => x.id === id);
    if (def?.pick) setPicking({ id, ids: [] }); else set(resolveEvent(s, id));
  };
  const pickDef = picking ? eventChoices(s).find((x) => x.id === picking.id) : undefined;
  const togglePick = (crewId: string) => {
    if (!picking || !pickDef?.pick) return;
    const max = pickDef.pick.max, has = picking.ids.includes(crewId);
    const ids = has ? picking.ids.filter((x) => x !== crewId) : [...picking.ids, crewId].slice(-max);
    setPicking({ id: picking.id, ids });
  };

  return (
    <main className="app">
      {header}
      <Hud s={s} />
      {s.phase === 'briefing' && <BriefingScreen s={s} onPlan={() => set(startPlanning(s))} />}
      {s.phase === 'plan' && <PlanScreen s={s} onCells={setCells} onDone={() => set(confirmPlan(s))} />}
      {s.phase === 'event' && (
        <EventScreen
          s={s} picking={picking} onChoose={choose}
          onPickConfirm={() => picking && set(resolveEvent(s, picking.id, picking.ids))} onPickCancel={() => setPicking(null)}
          onChange={() => set(clearChoice(s))} onBack={() => set(backToPlan(s))} onPlay={() => set(playSol(s).state)}
        />
      )}
      {s.phase === 'results' && <ResultsScreen s={s} onNext={() => set(proceed(s))} />}
      {s.phase === 'radio' && <RadioScreen s={s} onSend={(id) => set(sendMessage(s, id))} />}
      <Crew s={s} onJob={s.phase === 'plan' ? setJob : undefined} pick={picking && pickDef?.pick ? { spec: pickDef.pick, ids: picking.ids, onToggle: togglePick } : undefined} />
      <Helper s={s} picking={!!picking} />
    </main>
  );
}
