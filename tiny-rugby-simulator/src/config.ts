// Every number worth tuning lives here, with a plain-English label, so the game and the developer
// portal (/dev) read the same settings. The game uses the defaults; in development it also loads whatever
// the portal last saved. To add a dial: add a line here, then read `T.<key>` where the game needs it.

import tuned from './tuned.json';

export interface TuneDef { key: string; group: string; label: string; help: string; min: number; max: number; step: number; def: number; unit?: string }

export const TUNE_DEFS: TuneDef[] = [
  { key: 'gameSpeed', group: 'Pace', label: 'Overall game speed', help: 'Slows down or speeds up everything on the pitch at once. 1 is normal.', min: 0.5, max: 1.5, step: 0.05, def: 1, unit: 'x' },
  { key: 'runSpeed', group: 'Pace', label: 'Player running speed', help: 'How fast every player runs. Individual speed ratings still apply on top.', min: 0.6, max: 1.5, step: 0.05, def: 1, unit: 'x' },
  { key: 'lateralSpeed', group: 'Pace', label: 'Sideways running speed', help: 'How fast the ball carrier moves up and down the field when you drag. 1 means as fast as he runs forward.', min: 0.5, max: 3.5, step: 0.05, def: 2.1, unit: 'x' },
  { key: 'attackDepth', group: 'Pace', label: 'Attacking line depth', help: 'How much deeper each supporter stands than the man inside him. Deeper gives runners more room to hit the ball at pace.', min: 0.8, max: 4, step: 0.1, def: 2.3, unit: 'm' },
  { key: 'defSpeed', group: 'Defence', label: 'Defensive closing speed', help: 'How fast defenders close on the ball carrier and how quickly the line comes up.', min: 0.5, max: 1.4, step: 0.05, def: 1, unit: 'x' },
  { key: 'lineSpacing', group: 'Defence', label: 'Defensive line spacing', help: 'Metres between defenders across the field. Wider leaves bigger gaps.', min: 3.5, max: 8, step: 0.1, def: 4.8, unit: 'm' },
  { key: 'lineDepth', group: 'Defence', label: 'Defensive line depth at rucks', help: 'How far behind a ruck the defence re-forms. Further back gives the attack more time.', min: 4, max: 16, step: 0.5, def: 9, unit: 'm' },
  { key: 'tackleSuccess', group: 'Defence', label: 'Tackle success', help: 'Higher means fewer tacklers get bumped off or fooled by a sidestep.', min: 0.5, max: 1.5, step: 0.05, def: 1, unit: 'x' },
  { key: 'maulChance', group: 'Defence', label: 'Lineout mauls', help: 'How often a lineout that is won turns into a driving maul.', min: 0, max: 1, step: 0.05, def: 0.65, unit: '' },
  { key: 'stepWindow', group: 'Defence', label: 'Sidestep window', help: 'How far away a tackler can be and still get fooled by a sidestep. Bigger is more forgiving.', min: 3, max: 8, step: 0.1, def: 3.8, unit: 'm' },
  { key: 'tackleTime', group: 'Tackles and rucks', label: 'Tackle animation length', help: 'Seconds a tackle takes from contact to both players on the ground.', min: 0.3, max: 1.6, step: 0.05, def: 0.6, unit: 's' },
  { key: 'ruckContest', group: 'Tackles and rucks', label: 'Ruck contest probability', help: 'Share of rucks the other team contests with the timing bar. The rest are won automatically.', min: 0, max: 1, step: 0.05, def: 0.2 },
  { key: 'ruckSpeed', group: 'Tackles and rucks', label: 'Ruck formation and halfback speed', help: 'How fast players arrive at a ruck and how quickly the halfback gets to the ball.', min: 0.5, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'gainlineLoss', group: 'Tackles and rucks', label: 'Turnover risk behind the gain line', help: 'Chance of losing the ball when tackled less than 2 m past the last ruck.', min: 0, max: 0.6, step: 0.01, def: 0.03 },
  { key: 'knockOns', group: 'Passing and kicking', label: 'Handling errors', help: 'How often catches are dropped. 0 turns knock-ons off for simple catches; 1 is normal.', min: 0, max: 3, step: 0.1, def: 0.7, unit: 'x' },
  { key: 'passSpeed', group: 'Passing and kicking', label: 'Passing speed', help: 'How fast a pass travels, in metres per second.', min: 8, max: 22, step: 0.5, def: 14, unit: 'm/s' },
  { key: 'passAccuracy', group: 'Passing and kicking', label: 'Passing accuracy', help: 'Higher means passes land closer to where they were aimed and are dropped less often.', min: 0.5, max: 2, step: 0.05, def: 1, unit: 'x' },
  { key: 'kickDist', group: 'Passing and kicking', label: 'Kicking distance', help: 'How far kicks travel.', min: 0.6, max: 1.5, step: 0.05, def: 1, unit: 'x' },
  { key: 'kickHeight', group: 'Passing and kicking', label: 'Kicking height', help: 'How high kicks go, which is also how long they hang in the air.', min: 0.6, max: 1.6, step: 0.05, def: 1, unit: 'x' },
  { key: 'staminaUse', group: 'Players', label: 'Stamina usage', help: 'How much players with low stamina slow down late in a match. 0 turns tiring off.', min: 0, max: 3, step: 0.1, def: 1, unit: 'x' },
  { key: 'tryDifficulty', group: 'Players', label: 'Try-scoring difficulty', help: 'How well the defence tackles inside its own 22. Lower makes tries easier.', min: 0.4, max: 1.6, step: 0.05, def: 0.8, unit: 'x' },
  { key: 'theme', group: 'Picture', label: 'Colour theme', help: '0 Forest and ochre, 1 Teal and orange, 2 Ink and orange, 3 Orange crush. Changes every screen at once.', min: 0, max: 3, step: 1, def: 1 },
  { key: 'spriteScale', group: 'Picture', label: 'Player and ball size', help: 'How big the players and the ball are drawn.', min: 0.75, max: 1.6, step: 0.05, def: 1, unit: 'x' },
  { key: 'camZoom', group: 'Picture', label: 'Camera zoom', help: 'Pixels per metre along the pitch. Higher is closer in and shows less of the field.', min: 6, max: 13, step: 0.5, def: 9, unit: 'px/m' },
  { key: 'camLead', group: 'Picture', label: 'Camera lead', help: 'Where the ball sits across the screen. Lower shows more of the field ahead.', min: 0.15, max: 0.5, step: 0.01, def: 0.3 },
  { key: 'camSmooth', group: 'Picture', label: 'Camera tracking', help: 'How tightly the camera follows the ball. Lower is smoother and lazier.', min: 1.5, max: 12, step: 0.5, def: 5 },
];

export type Tuning = Record<string, number>;
// Factory settings: what the game was designed around.
export const FACTORY_TUNING: Tuning = Object.fromEntries(TUNE_DEFS.map(d => [d.key, d.def]));
const clampTo = (d: TuneDef, v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : undefined);
// The game's actual defaults: the factory settings plus whatever the portal last published (src/tuned.json).
export const DEFAULT_TUNING: Tuning = Object.fromEntries(TUNE_DEFS.map(d => [d.key, clampTo(d, (tuned as Record<string, unknown>)[d.key]) ?? d.def]));
// The live settings. Read as T.runSpeed and so on.
export const T: Tuning = { ...DEFAULT_TUNING };

export function applyTuning(o: Partial<Tuning> | null | undefined) {
  for (const d of TUNE_DEFS) {
    T[d.key] = clampTo(d, o?.[d.key]) ?? DEFAULT_TUNING[d.key];
  }
}

// A saved formation or play from the designer. x is metres behind (negative) or ahead of the ball,
// y is metres across from the ball. path is the running line as points relative to the start.
// recv false makes him a dummy runner: he runs his line as a decoy and is not looked to as a receiver.
export interface Spot { x: number; y: number; path?: { x: number; y: number }[]; recv?: boolean }
// primary: the spot that is the play's main target. ball: the spot that starts with the ball (training only).
export interface Formation { name: string; side: 'attack' | 'defence'; spots: Spot[]; primary?: number; ball?: number;
  // passes: the ball is passed to the man on mark `to`, `t` seconds after the play starts, without being asked
  passes?: { t: number; to: number }[];
  // kicks: at `t` seconds the ball is kicked to a point, in metres from where the ball started
  kicks?: { t: number; x: number; y: number }[];
  // turns: at `t` seconds the man on mark `to` leaves the line he was on and runs to a new point (same measure as kicks)
  turns?: { t: number; to: number; x: number; y: number }[];
  from?: 'scrum' | 'lineout';        // which set piece the play is for (a scrum if not said)
  start?: { x: number; y: number } } // where the man with the ball starts, in metres from the ball's mark (training only)
export const PLAY: { attack: Formation | null; defence: Formation | null } = { attack: null, defence: null };

// What the portal saves in the browser. The game itself only ever reads it in a development build.
export const DEV_KEY = 'trytime.dev.v1';
export interface DevStore { tuning: Tuning; history: { at: string; note: string; tuning: Tuning }[]; formations: Formation[]; use: { attack: string | null; defence: string | null } }

export function loadDev(get: (k: string) => string | null): DevStore {
  const blank: DevStore = { tuning: { ...DEFAULT_TUNING }, history: [], formations: [], use: { attack: null, defence: null } };
  try {
    const raw = get(DEV_KEY);
    if (!raw) return blank;
    const d = JSON.parse(raw) as Partial<DevStore>;
    return { tuning: { ...DEFAULT_TUNING, ...(d.tuning ?? {}) }, history: d.history ?? [], formations: d.formations ?? [], use: d.use ?? blank.use };
  } catch { return blank; }
}

// Puts a saved portal state into effect for the next match.
export function useDev(d: DevStore) {
  applyTuning(d.tuning);
  PLAY.attack = d.formations.find(f => f.side === 'attack' && f.name === d.use.attack) ?? null;
  PLAY.defence = d.formations.find(f => f.side === 'defence' && f.name === d.use.defence) ?? null;
}
