import boardJson from '../assets/station/board.json';
import type { EffectiveJob, GameState, SystemId } from '../engine';

const pick = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.(png|jpg)$/, '$1'), url]));

const icons = pick(import.meta.glob('../assets/icons/*.png', { eager: true, import: 'default' }));
const crew = pick(import.meta.glob('../assets/crew/*.png', { eager: true, import: 'default' }));
const robot = pick(import.meta.glob('../assets/robot/*.png', { eager: true, import: 'default' }));
const scenes = pick(import.meta.glob('../assets/scenes/*.jpg', { eager: true, import: 'default' }));
const station = pick(import.meta.glob('../assets/station/*.png', { eager: true, import: 'default' }));
const patch = pick(import.meta.glob('../assets/patch/*.png', { eager: true, import: 'default' }));
const cardPhotos = pick(import.meta.glob('../assets/cards/*.jpg', { eager: true, import: 'default' }));

const need = (set: Record<string, string>, name: string): string => {
  const url = set[name];
  if (!url) throw new Error(`Missing art: ${name}`);
  return url;
};
export const icon = (name: string) => need(icons, name);
export const crewArt = (id: string, kind: 'body' | 'suit' | 'portrait' = 'body') => need(crew, kind === 'body' ? id : `${kind}-${id}`);
export const robotArt = (name: string) => need(robot, name);
export const scene = (name: string) => need(scenes, name);
export const stationArt = (name: string) => need(station, name);
export const patchArt = (name: string) => need(patch, name);
export const cardPhoto = (cardId: string) => need(cardPhotos, cardId);

export type RoomId = 'lab' | 'medbay' | 'greenhouse' | 'workshop' | 'radio';
export type Rect = { x: number; y: number; w: number; h: number };
type RoomJson = Rect & { name: string; system: SystemId; label: { x: number; y: number }; slots: { x: number; y: number }[] };
export const board = boardJson as unknown as {
  board: { w: number; h: number; groundY: number }; crewHeight: number; rooms: Record<RoomId, RoomJson>;
  layers: Record<'module-left' | 'module-right' | 'dome', Rect>;
};
export const ROOMS: RoomId[] = ['lab', 'medbay', 'greenhouse', 'workshop', 'radio'];

const HOME: Record<string, RoomId> = { leo: 'workshop', mei: 'medbay', amara: 'greenhouse', otto: 'lab', sam: 'radio' };
export function roomOf(crewId: string, job: EffectiveJob): RoomId | 'outside' {
  switch (job) {
    case 'grow': return 'greenhouse';
    case 'fix': case 'rewire': case 'idle': return 'workshop';
    case 'lab': case 'scan': return 'lab';
    case 'care': case 'medbay': case 'shelter': return 'medbay';
    case 'outside': return 'outside';
    default: return HOME[crewId] ?? 'medbay';
  }
}

export const SYSTEM_ICON: Record<SystemId, string> = { life: 'air', shield: 'shield', greenhouse: 'crop', radio: 'radio', lab: 'science' };

export function eventScene(id: string, s: GameState): string {
  const map: Record<string, string> = {
    dust_storm: 'scene-dust-storm', solar_storm: 'scene-radiation-storm', hull_crack: 'scene-hull-crack', antenna_off: 'scene-antenna-off',
    pump_broken: 'scene-breakdown', loose_pipe: 'scene-breakdown', power_fault: 'scene-breakdown', lamp_fault: 'scene-breakdown',
    sick_crew: s.crew.filter((p) => p.medbay > 0).length > 0 ? 'scene-medbay-2' : 'scene-medbay-1',
    striped_rock: 'scene-striped-rock', dawn_frost: 'scene-frost', dust_devil: 'scene-dust-devil', clean_wind: 'scene-dust-devil', blue_sunset: 'scene-blue-sunset',
  };
  return scene(map[id] ?? 'scene-station');
}
