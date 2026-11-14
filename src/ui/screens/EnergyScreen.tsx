import { useState } from 'react';
import { SYSTEMS, type Allocation, type GameState, type SystemId } from '../../engine';
import { t } from '../i18n';

export function EnergyScreen({ s, onConfirm }: { s: GameState; onConfirm: (a: Allocation) => void }) {
  const [a, setA] = useState<Allocation>({ ...s.allocation });
  const used = SYSTEMS.reduce((sum, k) => sum + a[k], 0);
  const left = s.resources.energy - used;
  const change = (k: SystemId, d: number) => setA((prev) => ({ ...prev, [k]: Math.max(0, prev[k] + d) }));
  const broken = (k: SystemId) => (s.station.broken[k] ?? 0) >= s.sol;

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>{t('ui.energyTitle')}</h2>
      <p style={{ margin: 0 }}>{t('ui.energyHelp', { cells: s.resources.energy })}</p>
      <div className="cells" aria-label={t('ui.cellsLeft', { left })}>
        {Array.from({ length: s.resources.energy }, (_, i) => (
          <div key={i} className={`cell ${i < left ? '' : 'empty'}`} />
        ))}
        <span className="muted" style={{ marginLeft: 8 }}>{t('ui.cellsLeft', { left })}</span>
      </div>
      {SYSTEMS.map((k) => (
        <div key={k} className="system">
          <div>
            <strong>{t(`ui.system.${k}`)}</strong> {broken(k) && <span className="muted">{t('ui.broken')}</span>}
            <div className="muted">{t(`ui.system.${k}.help`)}</div>
          </div>
          <div className="row">
            <button className="small secondary" aria-label={`- ${t(`ui.system.${k}`)}`} disabled={a[k] === 0} onClick={() => change(k, -1)}>−</button>
            <strong style={{ minWidth: 24, textAlign: 'center' }}>{a[k]}</strong>
            <button className="small secondary" aria-label={`+ ${t(`ui.system.${k}`)}`} disabled={left <= 0} onClick={() => change(k, 1)}>+</button>
          </div>
        </div>
      ))}
      <button disabled={left < 0} onClick={() => onConfirm(a)}>{t('ui.confirmEnergy')}</button>
    </section>
  );
}
