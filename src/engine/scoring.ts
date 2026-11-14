// Stars and the end of the mission. Owner: P2.
import type { GameState } from './types';
import { balance } from './content';

export function computeStars(state: GameState, failed: boolean): 0 | 1 | 2 | 3 {
  if (failed) return 0;
  if (state.science.sent < balance.science.goal) return 1;
  const safeDose = state.crew.every((c) => c.doseMSv < balance.radiation.doseLimitFor3Stars);
  if (state.medbayVisits === 0 && safeDose) return 3;
  return 2;
}
