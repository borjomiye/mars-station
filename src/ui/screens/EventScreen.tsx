import { content, isChoiceAvailable, type GameState } from '../../engine';
import { t } from '../i18n';

export function EventScreen({ s, onChoose }: { s: GameState; onChoose: (choiceId: string) => void }) {
  const ev = content.getEvent(s.activeEventId!);
  const term = s.log.find((l) => l.sol === s.sol && l.key === ev.titleKey)?.termKey;
  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>{t(ev.titleKey)}</h2>
      <p style={{ margin: 0 }}>{t(ev.descKey)}</p>
      {term && <p className="term">{t(term)}</p>}
      <div className="choices">
        {ev.choices.map((c) => {
          const ok = isChoiceAvailable(s, c);
          return (
            <button key={c.id} disabled={!ok} onClick={() => onChoose(c.id)}>
              {t(c.labelKey)} {!ok && `(${t('ui.unavailable')})`}
            </button>
          );
        })}
      </div>
    </section>
  );
}
