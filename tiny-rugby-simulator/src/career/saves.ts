// Saved careers. Any number of them, each under its own key, with a small index of which exist.
// Starting a new career never touches another one. Saves from before there were slots (one club career
// and one World Cup, each under a fixed key) are moved into slots the first time the list is read.
import type { Store } from '../engine/game';
import type { Career, Player } from './types';
import { ovr } from './players';
import { clamp } from '../engine/rng';
import { CUP_KEY, SAVE_KEY, START_YEAR, activeComp, activeTeamId } from './career';
import { standings } from './competition';
import { COMP_NAMES } from '../data/teams';

export const INDEX_KEY = 'trytime.careers.v2';
export const MAX_CAREERS = 6;
const keyOf = (id: string) => `trytime.career.${id}`;

function readIndex(store: Store): string[] {
  try { const a = JSON.parse(store.get(INDEX_KEY) ?? '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch { return []; }
}

// Upgrade pre-TRS careers without touching their save IDs, fixtures, credits or recruits.
// Convert the old Strength skill into Tackling, and split old Handling into Handling + Passing.
export function migratePlayer(p: Player): Player {
  const old = p as Player & { spd?: number; str?: number };
  if (!Number.isFinite(p.tkl)) p.tkl = clamp(Math.round((old.str ?? 65) * 0.75 + p.sta * 0.25), 25, 99);
  if (!Number.isFinite(p.pas)) p.pas = clamp(Math.round(p.hnd * 0.7 + (['HB', 'FH'].includes(p.pos) ? p.kck * 0.3 : p.hnd * 0.3)), 25, 99);
  delete old.spd; delete old.str;
  if (!Number.isFinite(p.xp)) p.xp = 0;
  if (!Number.isFinite(p.points)) p.points = 0;
  p.pot = Math.max(p.pot, ovr(p));
  return p;
}
function parse(raw: string | null): Career | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Career;
    if (!c || c.v !== 1 || !c.teams || !c.comps) return null;
    for (const t of Object.values(c.teams)) t.roster.forEach(migratePlayer);
    c.market?.forEach(migratePlayer);
    delete (c as Career & { morale?: number }).morale;
    return c;
  } catch { return null; }
}

const newId = (ids: string[]) => { let n = Date.now().toString(36); while (ids.includes(n)) n += 'x'; return n; };

export function careerIds(store: Store): string[] {
  let ids = readIndex(store);
  for (const old of [SAVE_KEY, CUP_KEY]) {
    const c = parse(store.get(old));
    if (c) { c.id = newId(ids); ids = [...ids, c.id]; store.set(keyOf(c.id), JSON.stringify(c)); store.set(INDEX_KEY, JSON.stringify(ids)); }
    if (store.get(old) !== null) store.del(old);
  }
  return ids;
}

export function loadCareer(store: Store, id: string): Career | null {
  const c = parse(store.get(keyOf(id)));
  if (c) c.id = id;
  return c;
}

export function saveCareer(store: Store, c: Career) {
  const ids = careerIds(store);
  if (!c.id) c.id = newId(ids);
  store.set(keyOf(c.id), JSON.stringify(c));
  if (!ids.includes(c.id)) store.set(INDEX_KEY, JSON.stringify([...ids, c.id]));
}

export function deleteCareer(store: Store, id: string) {
  store.del(keyOf(id));
  store.set(INDEX_KEY, JSON.stringify(careerIds(store).filter(x => x !== id)));
}

export const compTitle = (c: Career) => (c.mode === 'cup' ? 'International Rugby' : c.comps.north.groups.some(g => g.includes(c.teamId)) ? COMP_NAMES.urc : COMP_NAMES.super);
export const seasonNo = (c: Career) => c.year - (c.began ?? START_YEAR) + 1;

// Where the user's side sits in its table or pool right now (0 if it is not in one).
export function position(c: Career): number {
  const comp = activeComp(c), uid = activeTeamId(c) || c.teamId, gi = comp.groups.findIndex(g => g.includes(uid));
  return gi < 0 ? 0 : standings(comp, gi).findIndex(s => s.id === uid) + 1;
}

export interface CareerCard { id: string; team: string; c1: string; c2: string; comp: string; line: string; record: string }

// What the list of careers shows for each one.
export function careerCards(store: Store): CareerCard[] {
  const out: CareerCard[] = [];
  for (const id of careerIds(store)) {
    const c = loadCareer(store, id);
    if (!c) continue;
    const t = c.teams[c.teamId];
    out.push({
      id, team: t.name, c1: t.c1, c2: t.c2, comp: compTitle(c),
      line: c.mode === 'cup' ? `${c.year} World Cup` : `Season ${seasonNo(c)}`,
      record: `Won ${c.record.w}  Drew ${c.record.d}  Lost ${c.record.l}`,
    });
  }
  return out;
}
