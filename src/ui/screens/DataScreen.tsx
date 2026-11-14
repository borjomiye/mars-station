import { content } from '../../engine';
import { t } from '../i18n';

export function DataScreen({ periodId, onBack }: { periodId?: string; onBack: () => void }) {
  const period = periodId ? content.getPeriod(periodId) : undefined;
  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>{t('data.title')}</h2>
      {content.donki.stub && <div className="warning">{t('ui.stubWarning')}</div>}
      <p>{t('data.donki')}</p>
      <p>{t('data.rad')}</p>
      <p className="muted">{t('data.simplified')}</p>
      <p className="muted">{content.donki.source}</p>
      {period && (
        <ul>
          {period.events.map((e) => (
            <li key={e.id}>
              {e.type} {e.classType ?? ''} {e.date}{' '}
              <a href={e.link} target="_blank" rel="noreferrer">DONKI</a>
            </li>
          ))}
        </ul>
      )}
      <button className="secondary" onClick={onBack}>{t('ui.back')}</button>
    </section>
  );
}
