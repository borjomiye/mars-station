import { availableCrew, content, type GameState } from '../engine';
import { t } from './i18n';

function Meter({ label, value, color, max = 100, suffix = '' }: { label: string; value: number; color: string; max?: number; suffix?: string }) {
  return (
    <div>
      <div className="meter-label">
        <span>{label}</span>
        <span>{Math.round(value)}{suffix}</span>
      </div>
      <div className="bar" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
        <div style={{ width: `${(100 * value) / max}%`, background: color }} />
      </div>
    </div>
  );
}

export function Hud({ s }: { s: GameState }) {
  const free = new Set(availableCrew(s).map((c) => c.id));
  return (
    <section className="panel hud" aria-label="Station status">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{t('ui.sol', { sol: s.sol, total: s.totalSols })}</strong>
        <span className="muted">{t(content.getSite(s.siteId).nameKey)}</span>
      </div>
      <div className="meters">
        <Meter label={t('ui.energy')} value={s.resources.energy} max={12} color="var(--energy)" />
        <Meter label={t('ui.lifeSupport')} value={s.resources.lifeSupport} color="var(--life)" suffix="%" />
        <Meter label={t('ui.food')} value={s.resources.food} color="var(--food)" suffix="%" />
        <Meter label={t('ui.hull')} value={s.station.hull} color="var(--hull)" suffix="%" />
      </div>
      <div className="muted">
        {t('ui.science')}: {t('ui.scienceValue', { collected: s.science.collected, sent: s.science.sent, goal: content.balance.science.goal })}
      </div>
      <div className="crew">
        {s.crew.map((c) => (
          <div key={c.id} className={`crew-card ${c.status}`}>
            <strong>{t(c.nameKey)}</strong>
            <div>{t('ui.health')}: {Math.round(c.health)}</div>
            <div>{t('ui.dose')}: {c.doseMSv.toFixed(1)} mSv</div>
            <div className="muted">
              {c.status === 'medbay' ? t('ui.status.medbay') : free.has(c.id) ? t('ui.status.active') : t('ui.status.busy')}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
