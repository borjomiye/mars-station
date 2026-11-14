import { content, type GameState } from '../../engine';
import { t } from '../i18n';

export function EndScreen({ s, onRestart }: { s: GameState; onRestart: () => void }) {
  const o = s.outcome!;
  const met = s.schedule
    .filter((p) => p.sol <= s.sol)
    .flatMap((p) => p.donkiEventIds)
    .map((id) => content.findDonkiEvent(id))
    .filter((e) => e !== undefined);
  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>{t(o.reasonKey)}</h2>
      <div className="stars" aria-label={`${o.stars} stars`}>{'★'.repeat(o.stars)}{'☆'.repeat(3 - o.stars)}</div>
      <p style={{ margin: 0 }}>{t(`end.stars.${o.stars}`)}</p>
      <h3 style={{ marginBottom: 0 }}>{t('end.report')}</h3>
      <p style={{ margin: 0 }}>{t('end.scienceSent', { sent: s.science.sent, goal: content.balance.science.goal })}</p>
      <ul>
        {s.crew.map((c) => (
          <li key={c.id}>{t(c.nameKey)}: {c.doseMSv.toFixed(1)} mSv</li>
        ))}
      </ul>
      {met.length > 0 && (
        <>
          <p style={{ margin: 0 }}>{t('end.realEvents')}</p>
          <ul>
            {met.map((e) => (
              <li key={e.id}>
                {e.type} {e.classType ?? ''} {e.date} <a href={e.link} target="_blank" rel="noreferrer">DONKI</a>
              </li>
            ))}
          </ul>
        </>
      )}
      {o.result === 'failed' && <p className="term">{t(o.reasonKey === 'end.failed.lifeSupport' ? 'end.tip.lifeSupport' : 'end.tip.crew')}</p>}
      <button onClick={onRestart}>{t('ui.playAgain')}</button>
    </section>
  );
}
