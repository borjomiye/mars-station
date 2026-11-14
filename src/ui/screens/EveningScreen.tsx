import { useState } from 'react';
import { availableCards, commsAvailable, type GameState, type MessageCard } from '../../engine';
import { t } from '../i18n';

export function EveningScreen({ s, onSleep }: { s: GameState; onSleep: (card: MessageCard | null) => void }) {
  const cards = availableCards(s);
  const [card, setCard] = useState<MessageCard | null>(cards[0] ?? null);
  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>{t('ui.eveningTitle')}</h2>
      {!commsAvailable(s) ? (
        <p className="muted">{t('ui.noComms')}</p>
      ) : (
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend>{t('ui.sendCard')}</legend>
          {[...cards, null].map((c) => (
            <label key={c ?? 'none'} className="row">
              <input type="radio" name="card" checked={card === c} onChange={() => setCard(c)} />
              {t(`ui.card.${c ?? 'none'}`)}
            </label>
          ))}
        </fieldset>
      )}
      <button onClick={() => onSleep(card)}>{t('ui.endSol')}</button>
    </section>
  );
}
