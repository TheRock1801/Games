import { Rng, clamp } from '../engine/rng';
import { NAMES } from '../data/names';
import type { Attr, Player, Team } from './types';

// Five clear, trainable skills: stamina, handling, passing, kicking and tackling.
// Strength/breakdown are represented by tackling. Pace is derived from position and overall quality.
export const ATTRIBUTES: Attr[] = ['sta', 'hnd', 'pas', 'kck', 'tkl'];
// Position leanings in ATTRIBUTES order.
const BIAS: Record<string, [number, number, number, number, number]> = {
  PR: [6, -9, -20, -30, 13], HK: [5, 0, -10, -30, 9], LK: [8, -4, -17, -30, 13],
  FL: [9, 1, -9, -24, 10], N8: [7, 3, -8, -24, 10],
  HB: [0, 9, 13, 5, -13], FH: [0, 9, 13, 15, -11],
  CE: [4, 7, 5, -8, 3], WG: [7, 10, 0, -9, -9], FB: [7, 9, 5, 10, -5],
};
// All rows sum to 1. Wingers are rated for stamina and handling, not a redundant speed stat.
const WT: Record<string, [number, number, number, number, number]> = {
  PR: [0.28, 0.08, 0.04, 0, 0.60], HK: [0.24, 0.17, 0.10, 0, 0.49],
  LK: [0.28, 0.09, 0.05, 0, 0.58], FL: [0.24, 0.15, 0.08, 0, 0.53],
  N8: [0.25, 0.20, 0.08, 0, 0.47], HB: [0.14, 0.24, 0.44, 0.12, 0.06],
  FH: [0.10, 0.18, 0.38, 0.30, 0.04], CE: [0.16, 0.30, 0.30, 0.04, 0.20],
  WG: [0.38, 0.39, 0.15, 0.05, 0.03], FB: [0.20, 0.31, 0.17, 0.24, 0.08],
};
const PACE: Record<string, number> = { PR: 54, HK: 59, LK: 57, FL: 72, N8: 67, HB: 81, FH: 76, CE: 78, WG: 89, FB: 82 };
export const FORWARDS = ['PR', 'HK', 'LK', 'FL', 'N8'];

export function ovr(p: Player): number {
  const w = WT[p.pos] ?? WT.CE;
  return Math.round(ATTRIBUTES.reduce((s, a, i) => s + p[a] * w[i], 0));
}

// Engine-only movement score. Positions retain genuine pace differences with no extra market stat.
export function paceFor(p: Player): number {
  return clamp(Math.round((PACE[p.pos] ?? 75) + (ovr(p) - 70) * 0.22 + (p.sta - 70) * 0.10), 43, 98);
}

// Tackling drives both the on-field tackle contest and breakdown effectiveness.
export const tackling = (p: Player) => p.tkl;

export const POS_NAMES: Record<string, string> = {
  PR: 'Prop', HK: 'Hooker', LK: 'Lock', FL: 'Flanker', N8: 'Number 8', HB: 'Halfback', FH: 'First five', CE: 'Centre', WG: 'Wing', FB: 'Fullback',
};
export function keyAttrs(pos: string): Attr[] {
  const w = WT[pos] ?? WT.CE;
  return ATTRIBUTES.map((a, i) => ({ a, w: w[i] })).filter(x => x.w >= 0.2).sort((a, b) => b.w - a.w).map(x => x.a);
}
export function salaryFor(o: number): number { return Math.round(15 + Math.max(0, o - 55) ** 2 * 0.12); }
export function genPlayer(rng: Rng, pos: string, base: number, names: string, id: number, young = false): Player {
  const b = BIAS[pos] ?? BIAS.CE, n = NAMES[names] ?? NAMES.NZL;
  const a = (k: number) => clamp(Math.round(base + b[k] + rng.int(-6, 6)), 25, 99);
  const age = young ? rng.int(19, 21) : rng.int(21, 32);
  const p: Player = {
    id, name: `${rng.pick(n.f)} ${rng.pick(n.l)}`, pos, age,
    sta: a(0), hnd: a(1), pas: a(2), kck: a(3), tkl: a(4),
    pot: 0, salary: 0, years: rng.int(1, 3), inj: 0, cond: 100, skin: rng.int(0, 3), xp: 0, points: 0,
  };
  p.pot = clamp(ovr(p) + (age < 25 ? rng.int(2, 12) : 0), 0, 99);
  return p;
}
export function fit(p: Player): number {
  let f = p.inj > 0 ? 0.85 : 1;
  if (p.cond < 60) f *= 1 - (60 - p.cond) / 200;
  return f;
}
export interface Ratings { att: number; def: number; pack: number; kick: number; ovr: number }
export function teamRatings(t: Team, reputationMod = 0): Ratings {
  const r = t.roster, avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const backs = r.filter(p => !FORWARDS.includes(p.pos)), fwds = r.filter(p => FORWARDS.includes(p.pos));
  const m = 1 + reputationMod;
  return {
    att: avg(backs.map(p => (paceFor(p) * 0.20 + p.pas * 0.30 + p.hnd * 0.35 + p.sta * 0.15) * fit(p))) * m,
    def: avg(r.map(p => (p.tkl * 0.65 + p.sta * 0.25 + paceFor(p) * 0.10) * fit(p))) * m,
    pack: avg(fwds.map(p => (p.tkl * 0.78 + p.sta * 0.22) * fit(p))) * m,
    kick: Math.max(...r.filter(p => ['FH', 'FB', 'HB'].includes(p.pos)).map(p => p.kck * fit(p))),
    ovr: avg(r.map(p => ovr(p) * fit(p))) * m,
  };
}
export function stars(o: number): number { return clamp(Math.round((o - 58) / 7), 1, 5); }
export function shortName(p: Player): string {
  const i = p.name.indexOf(' ');
  return i < 0 ? p.name : `${p.name[0]} ${p.name.slice(i + 1)}`;
}
