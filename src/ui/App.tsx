// The game, one 1280×720 screen at a time: title → morning → base (plan) → event → results → evening → … → report.
import { useState } from 'react';
import {
  applyPlan, backToPlan, clearChoice, confirmPlan, createMission, eventChoices, playSol, proceed, randomMissionName, resolveEvent, sendMessage, startPlanning,
  type GameState, type Job, type Mode, type SystemId,
} from '../engine';
import { addToAlbum, loadAlbum, loadGame, saveGame } from './save';
import { Frame, Overlay } from './Frame';
import { Hud } from './bits';
import { withAutoJobs } from './autoJobs';
import { MorningScreen } from './Morning';
import { PlanBase, ResultsBase } from './Base';
import { AlbumView, DataView, EventScreen, RadioScreen, ReportScreen, TitleScreen } from './Screens';

type Picking = { id: string; ids: string[] };
type Window = 'album' | 'data' | null;

export default function App() {
  const [s, setState] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(() => loadGame());
  const [album, setAlbum] = useState<string[]>(() => loadAlbum());
  const [picking, setPicking] = useState<Picking | null>(null);
  const [win, setWin] = useState<Window>(null);
  const [name, setName] = useState(() => randomMissionName());
  const [mode, setMode] = useState<Mode>('easy');
  const [manual, setManual] = useState<{ sol: number; ids: string[] }>({ sol: 0, ids: [] }); // jobs the captain set by hand this sol

  /** Every engine step goes through here: save the mission, keep found cards in the album. */
  const set = (next: GameState) => {
    setPicking(null);
    setState(next);
    saveGame(next);
    setSaved(next.phase === 'report' ? null : next);
    setAlbum((a) => addToAlbum(a, next.cards.found));
  };
  const toMenu = () => { setPicking(null); setState(null); };
  const windows = (
    <>
      {win === 'album' && <Overlay title={`Discovery album · ${album.length} found`} onClose={() => setWin(null)} wide><AlbumView album={album} /></Overlay>}
      {win === 'data' && <Overlay title="Where the data comes from" onClose={() => setWin(null)} wide><DataView periodId={s?.periodId} /></Overlay>}
    </>
  );

  let screen;
  if (!s) {
    screen = (
      <TitleScreen
        name={name} setName={setName} onRandom={() => setName(randomMissionName())} mode={mode} setMode={setMode}
        onLaunch={() => set(createMission(name || 'Brave Otter', mode))} saved={saved} onContinue={() => saved && setState(saved)}
        onAlbum={() => setWin('album')} onData={() => setWin('data')} albumCount={album.length}
      />
    );
  } else if (s.phase === 'report') {
    screen = <ReportScreen s={s} album={album} onAgain={() => set(createMission(s.name, s.mode))} onNew={() => { setName(randomMissionName()); toMenu(); }} />;
  } else if (s.phase === 'briefing') {
    screen = <MorningScreen key={s.sol} s={s} onNext={() => { setManual({ sol: s.sol, ids: [] }); set(withAutoJobs(startPlanning(s), [])); }} />;
  } else {
    const hand = manual.sol === s.sol ? manual.ids : [];
    const setCells = (k: SystemId, delta: number) => set(withAutoJobs(applyPlan(s, { ...s.plan, cells: { ...s.plan.cells, [k]: s.plan.cells[k] + delta } }), hand));
    const setJob = (crewId: string, job: Job) => {
      setManual({ sol: s.sol, ids: hand.includes(crewId) ? hand : [...hand, crewId] });
      set(applyPlan(s, { ...s.plan, jobs: { ...s.plan.jobs, [crewId]: job } }));
    };
    const choose = (id: string) => {
      const def = eventChoices(s).find((x) => x.id === id);
      if (def?.pick) setPicking({ id, ids: [] }); else set(resolveEvent(s, id));
    };
    const togglePick = (crewId: string) => {
      const def = picking ? eventChoices(s).find((x) => x.id === picking.id) : undefined;
      if (!picking || !def?.pick) return;
      const has = picking.ids.includes(crewId);
      setPicking({ id: picking.id, ids: has ? picking.ids.filter((x) => x !== crewId) : [...picking.ids, crewId].slice(-def.pick.max) });
    };
    screen = (
      <div className="screen in-sol">
        <Hud s={s} onMenu={toMenu} onData={() => setWin('data')} />
        {s.phase === 'plan' && <PlanBase s={s} onCells={setCells} onJob={setJob} onDone={() => set(confirmPlan(s))} />}
        {s.phase === 'results' && <ResultsBase s={s} onNext={() => set(proceed(s))} />}
        {s.phase === 'event' && (
          <EventScreen
            s={s} picking={picking} onChoose={choose} onTogglePick={togglePick}
            onPickConfirm={() => picking && set(resolveEvent(s, picking.id, picking.ids))} onPickCancel={() => setPicking(null)}
            onChange={() => set(clearChoice(s))} onBack={() => set(backToPlan(s))} onPlay={() => set(playSol(s).state)}
          />
        )}
        {s.phase === 'radio' && <RadioScreen s={s} onSend={(id) => set(sendMessage(s, id))} />}
      </div>
    );
  }

  return <Frame>{screen}{windows}</Frame>;
}
