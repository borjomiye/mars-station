// Mission save and the discovery album in localStorage. Storage may be unavailable (private mode): then we just don't save.
import { SAVE_VERSION, type GameState } from '../engine';

const KEY = 'mars-station-save';
const ALBUM = 'mars-station-album';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // saves from before the Easy/Medium/Hard modes
    const old: Record<string, GameState['mode']> = { cadet: 'easy', commander: 'medium' };
    if (old[s.mode]) s.mode = old[s.mode];
    return s.version === SAVE_VERSION && s.phase !== 'report' ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState | null): void {
  try {
    if (s && s.phase !== 'report') localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The album keeps cards between missions. */
export function loadAlbum(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(ALBUM) || '[]');
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addToAlbum(album: string[], found: string[]): string[] {
  const fresh = found.filter((id) => !album.includes(id));
  if (!fresh.length) return album;
  const next = [...album, ...fresh];
  try {
    localStorage.setItem(ALBUM, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
