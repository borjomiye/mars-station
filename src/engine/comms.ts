// Evening calls with Earth. Owner: P2.
// One message per evening; the reply arrives the NEXT evening (Earth plans once per sol).
// So a forecast asked on sol N arrives on sol N+1 and must warn about sols N+2..N+3.
import type { GameState, MessageCard } from './types';
import { balance, findDonkiEvent } from './content';
import { say } from './effects';
import { nextRandom } from './rng';

export function commsAvailable(state: GameState): boolean {
  return !state.comms.blackout && state.allocation.comms >= balance.comms.minCells;
}

export function availableCards(state: GameState): MessageCard[] {
  if (!commsAvailable(state)) return [];
  const cards: MessageCard[] = ['forecast'];
  if (state.science.collected > 0) cards.push('science_report');
  return cards;
}

/** Evening: the reply to the last message arrives (only if the antenna has power). Mutates. */
export function deliverReply(state: GameState): void {
  state.comms.incoming = undefined;
  const out = state.comms.outgoing;
  if (!out || out.sentSol >= state.sol || !commsAvailable(state)) return;

  if (out.card === 'forecast') {
    const from = out.sentSol + balance.comms.forecastFromSol;
    const to = out.sentSol + balance.comms.forecastToSol;
    const storm = state.schedule.find(
      (p) => p.sol >= from && p.sol <= to && p.sol > state.sol && p.donkiEventIds.some((id) => findDonkiEvent(id)?.type === 'SEP'),
    );
    if (storm) {
      state.comms.forecast.push({ sol: storm.sol, type: 'SEP' });
      out.replyKey = 'reply.forecast.storm';
      out.replyParams = { sol: storm.sol };
    } else {
      out.replyKey = 'reply.forecast.calm';
    }
  }
  state.comms.incoming = out;
  state.comms.outgoing = undefined;
  say(state, { key: out.replyKey ?? 'reply.forecast.calm', params: out.replyParams, mood: 'calm', termKey: 'term.delay' });
}

/** Evening: send one card (or nothing). A dust storm can block the radio. Mutates.
 *  Returns true if the message was lost. */
export function send(state: GameState, card: MessageCard | null): boolean {
  if (!card || !availableCards(state).includes(card)) return false;

  if (state.station.dustSolsLeft > 0) {
    const [roll, next] = nextRandom(state.decisionRng);
    state.decisionRng = next;
    if (roll < balance.comms.dustLossChance) return true;
  }

  if (card === 'science_report') {
    const points = state.science.collected;
    state.science.sent += points;
    state.science.collected = 0;
    state.comms.outgoing = { card, sentSol: state.sol, replyKey: 'reply.science_report', replyParams: { points } };
  } else {
    state.comms.outgoing = { card, sentSol: state.sol };
  }
  return false;
}
