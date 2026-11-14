import { useEffect, useState } from 'react';
import {
  allocateEnergy, beginEnergy, content, newGame, randomSeed, resolveEvent, sendMessageAndSleep, type GameState,
} from '../engine';
import { t } from './i18n';
import { loadGame, saveGame } from './save';
import { Hud } from './Hud';
import { Avatar } from './Avatar';
import { EnergyScreen } from './screens/EnergyScreen';
import { EventScreen } from './screens/EventScreen';
import { EveningScreen } from './screens/EveningScreen';
import { EndScreen } from './screens/EndScreen';
import { DataScreen } from './screens/DataScreen';

export default function App() {
  const [s, setS] = useState<GameState | null>(null);
  const [saved] = useState<GameState | null>(() => loadGame());
  const [showData, setShowData] = useState(false);
  const [seedInput, setSeedInput] = useState('');

  // Save while a mission is running. The save is cleared only on an explicit restart,
  // never on page load (s is null then).
  useEffect(() => {
    if (s) saveGame(s);
  }, [s]);
  const restart = () => {
    saveGame(null);
    setS(null);
  };

  const start = () => {
    const seed = Number(seedInput) || randomSeed();
    setS(newGame(seed));
  };

  const header = (
    <header className="row" style={{ justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0, color: 'var(--mars)' }}>{t('ui.title')}</h1>
      <button className="secondary small" onClick={() => setShowData((v) => !v)}>{t('ui.dataSources')}</button>
    </header>
  );

  if (showData) {
    return (
      <main className="app">
        {header}
        <DataScreen periodId={s?.periodId} onBack={() => setShowData(false)} />
      </main>
    );
  }

  if (!s) {
    return (
      <main className="app">
        {header}
        <section className="panel stack">
          {content.donki.stub && <div className="warning">{t('ui.stubWarning')}</div>}
          <p style={{ margin: 0 }}>{t('ui.subtitle')}</p>
          <label className="row">
            {t('ui.seed')}
            <input inputMode="numeric" value={seedInput} onChange={(e) => setSeedInput(e.target.value.replace(/\D/g, ''))} style={{ font: 'inherit', padding: 8, width: 140 }} />
          </label>
          <div className="row">
            <button onClick={start}>{t('ui.newMission')}</button>
            {saved && saved.phase !== 'ended' && <button className="secondary" onClick={() => setS(saved)}>{t('ui.continue')}</button>}
          </div>
        </section>
      </main>
    );
  }

  const ev = s.activeEventId ? content.getEvent(s.activeEventId) : undefined;
  const linesOf = (phases: string[]) => s.log.filter((l) => l.sol === s.sol && phases.includes(l.phase) && l.key !== ev?.titleKey);

  return (
    <main className="app">
      {header}
      <Hud s={s} />
      {s.phase === 'morning' && (
        <>
          <Avatar lines={linesOf(['morning'])} />
          <button onClick={() => setS(beginEnergy(s))}>{t('ui.toEnergy')}</button>
        </>
      )}
      {s.phase === 'energy' && <EnergyScreen s={s} onConfirm={(a) => setS(allocateEnergy(s, a))} />}
      {s.phase === 'event' && <EventScreen s={s} onChoose={(id) => setS(resolveEvent(s, id))} />}
      {s.phase === 'evening' && (
        <>
          <Avatar lines={linesOf(['event', 'evening'])} />
          <EveningScreen key={s.sol} s={s} onSleep={(card) => setS(sendMessageAndSleep(s, card))} />
        </>
      )}
      {s.phase === 'ended' && (
        <>
          <Avatar lines={linesOf(['event', 'evening'])} />
          <EndScreen s={s} onRestart={restart} />
        </>
      )}
      <p className="muted" style={{ fontSize: 14 }}>{t('ui.seed')}: {s.seed}</p>
    </main>
  );
}
