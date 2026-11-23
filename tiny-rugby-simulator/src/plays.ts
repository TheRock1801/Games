// Set plays: a starting shape for the nine supporters, a running line for any of them, who may be passed
// to, who the play is for, and (on the training ground) who starts with the ball.
// Marks are relative to the ball: x metres behind it (negative), y metres across from it.
// There are five, always called Play 1 to Play 5, and they belong to the career they were drawn in.
// Outside a career (the developer portal's training screen) they are kept under their own key.
import type { Formation, Spot } from './config';
import type { Store } from './engine/game';
import type { Career } from './career/types';
import { saveCareer } from './career/saves';

export const PLAYS_KEY = 'trytime.plays.v1';
export const PREMIUM_KEY = 'trytime.premium.v1';
export const MAX_PLAYS = 5;
export const MAX_PASSES = 5;
export const MAX_KICKS = 2;
export const MAX_TURNS = 10;
export const OFF_MARK = 100; // `to` values from here up name a man by his place in the side, not by a mark
export const LO_Y = 10; // how far in from touch the ball comes out at a lineout
export const PREMIUM_PRICE = 'NZ$3.99';

export interface PlayHost { store: Store; career: Career | null }

// Play 1 is everybody's. Plays 2 to 5 are planned as a one-off purchase. Nothing is sold yet: the
// entitlement is just a stored flag, and a development build always has it so the feature can be tested.
export function isPremium(store: Store): boolean {
  return store.get(PREMIUM_KEY) === '1' || !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
}

// The standard shape: four men either side of the ball in a staggered line, one sitting deep behind it.
export function defaultSpots(): Spot[] {
  return [
    { x: -10, y: -18 }, { x: -7.6, y: -13.5 }, { x: -5.2, y: -9 }, { x: -3.4, y: -4.5 },
    { x: -7, y: 0.5 },
    { x: -3.4, y: 4.5 }, { x: -5.2, y: 9 }, { x: -7.6, y: 13.5 }, { x: -10, y: 18 },
  ];
}

// Set plays are for the backs, off the back of a real scrum or lineout: the forwards are packed down or
// lined up and are not placed. So a scrum play has six marks (first five, two centres, two wings and the
// fullback) and a lineout play five (one wing is throwing in).
export function scrumSpots(): Spot[] {
  return [{ x: -8, y: -12 }, { x: -10, y: 1 }, { x: -4, y: 5 }, { x: -6, y: 10 }, { x: -8, y: 15 }, { x: -10, y: 21 }];
}
export function lineoutSpots(): Spot[] {
  return [{ x: -9, y: 1 }, { x: -4, y: 5 }, { x: -6, y: 10 }, { x: -8, y: 15 }, { x: -10, y: 21 }];
}
export const spotsFor = (from?: 'scrum' | 'lineout') => (from === 'lineout' ? lineoutSpots() : scrumSpots());

// What Play 1 starts as: off a scrum, the first centre runs a decoy line, the fullback loops outside him.
export const STARTER_PLAY: Formation = {
  name: 'Play 1', side: 'attack', primary: 1,
  passes: [{ t: 0.3, to: 2 }, { t: 1.3, to: 1 }], // halfback to the first five, who finds the fullback coming round
  spots: [
    { x: -8, y: -12 }, { x: -10, y: 1, path: [{ x: 10, y: 15 }] },
    { x: -4, y: 5, path: [{ x: 9, y: 2 }] }, { x: -6, y: 10, path: [{ x: 9, y: -4 }], recv: false }, { x: -8, y: 15, path: [{ x: 11, y: 1 }] }, { x: -10, y: 21, path: [{ x: 13, y: 1 }] },
  ],
};

// What Play 1 holds until it is redrawn: the first receiver straightens, the next man cuts back inside
// him, and the man from depth loops around the outside.
export const SAMPLE_PLAY: Formation = {
  name: 'Play 1', side: 'attack', primary: 4,
  spots: [
    { x: -10, y: -18 }, { x: -7.6, y: -13.5 }, { x: -5.2, y: -9 }, { x: -3.4, y: -4.5 },
    { x: -7, y: 1, path: [{ x: 9, y: 15 }] },
    { x: -3.4, y: 4.5, path: [{ x: 9, y: -1 }], recv: false }, { x: -5.2, y: 9, path: [{ x: 8, y: -4 }] }, { x: -7.6, y: 13.5, path: [{ x: 11, y: 1 }] }, { x: -10, y: 18, path: [{ x: 13, y: 1 }] },
  ],
};

export const copyPlay = (f: Formation): Formation => ({
  name: f.name, side: f.side, primary: f.primary, ball: f.ball,
  passes: f.passes?.length ? f.passes.map(p => ({ t: p.t, to: p.to })) : undefined,
  kicks: f.kicks?.length ? f.kicks.map(k => ({ t: k.t, x: k.x, y: k.y })) : undefined,
  turns: f.turns?.length ? f.turns.map(k => ({ t: k.t, to: k.to, x: k.x, y: k.y })) : undefined,
  from: f.from === 'lineout' ? 'lineout' : undefined,
  start: f.start && (f.start.x || f.start.y) ? { x: f.start.x, y: f.start.y } : undefined,
  spots: f.spots.map(s => ({ x: s.x, y: s.y, path: s.path?.map(p => ({ ...p })), recv: s.recv === false ? false : undefined })),
});

// Whatever was stored, made safe: five slots, fixed names, only numbers that are numbers.
function clean(a: unknown): (Formation | null)[] {
  const out: (Formation | null)[] = Array(MAX_PLAYS).fill(null);
  if (!Array.isArray(a)) return out;
  for (let i = 0; i < MAX_PLAYS; i++) {
    const f = a[i] as Formation | null;
    if (!f || !Array.isArray(f.spots) || !f.spots.every(s => s && isFinite(s.x) && isFinite(s.y))) continue;
    const n = Math.min(9, f.spots.length), ok = (v: unknown) => typeof v === 'number' && v >= 0 && v < n;
    const c = copyPlay({ ...f, spots: f.spots.slice(0, 9) });
    c.name = `Play ${i + 1}`; c.side = 'attack';
    c.primary = ok(f.primary) && c.spots[f.primary!].recv !== false ? f.primary : undefined;
    c.ball = ok(f.ball) ? f.ball : undefined;
    const ps = (Array.isArray(f.passes) ? f.passes : []).filter(p => p && isFinite(p.t) && p.t >= 0 && p.t <= 60 && (ok(p.to) || (p.to >= OFF_MARK && p.to < OFF_MARK + 10))).slice(0, MAX_PASSES).sort((p, q) => p.t - q.t);
    c.passes = ps.length ? ps.map(p => ({ t: p.t, to: p.to })) : undefined;
    const ts = (Array.isArray(f.turns) ? f.turns : []).filter(k => k && isFinite(k.t) && k.t >= 0 && k.t <= 60 && isFinite(k.x) && isFinite(k.y) && (ok(k.to) || (k.to >= OFF_MARK && k.to < OFF_MARK + 10))).slice(0, MAX_TURNS);
    c.turns = ts.length ? ts.map(k => ({ t: k.t, to: k.to, x: k.x, y: k.y })) : undefined;
    const ks = (Array.isArray(f.kicks) ? f.kicks : []).filter(k => k && isFinite(k.t) && k.t >= 0 && k.t <= 60 && isFinite(k.x) && isFinite(k.y)).slice(0, MAX_KICKS);
    c.kicks = ks.length ? ks.map(k => ({ t: k.t, x: k.x, y: k.y })) : undefined;
    c.start = f.start && isFinite(f.start.x) && isFinite(f.start.y) && (f.start.x || f.start.y) ? { x: f.start.x, y: f.start.y } : undefined;
    out[i] = c;
  }
  return out;
}

export function loadPlays(store: Store): (Formation | null)[] {
  try { const raw = store.get(PLAYS_KEY); return clean(raw ? JSON.parse(raw) : null); } catch { return clean(null); } // a damaged playbook just reads as empty
}
export function savePlays(store: Store, plays: (Formation | null)[]) { store.set(PLAYS_KEY, JSON.stringify(plays.slice(0, MAX_PLAYS))); }

// The five plays of the career being played. A career that has never opened the Training Ground has
// the sample in Play 1 and four empty slots.
export function getPlays(h: PlayHost): (Formation | null)[] {
  const c = h.career;
  if (!c) { const p = loadPlays(h.store); if (!h.store.get(PLAYS_KEY)) p[0] = copyPlay(STARTER_PLAY); return p; }
  if (!c.plays) { const p = clean(null); p[0] = copyPlay(STARTER_PLAY); return p; }
  return clean(c.plays);
}

// Every change is kept at once, in the career's own save.
export function putPlays(h: PlayHost, plays: (Formation | null)[]) {
  const c = h.career;
  if (!c) { savePlays(h.store, plays); return; }
  c.plays = clean(plays);
  saveCareer(h.store, c);
}

// What can be called in a match.
export function bookOf(h: PlayHost): Formation[] {
  const all = getPlays(h), prem = isPremium(h.store);
  return all.filter((f, i): f is Formation => !!f && (i === 0 || prem));
}
