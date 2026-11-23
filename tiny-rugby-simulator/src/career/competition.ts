import { Rng, clamp } from '../engine/rng';
import { teamRatings } from './players';
import type { Comp, Fixture, Row, Team } from './types';

const fx = (h: string, a: string, stage = ''): Fixture => ({ h, a, hs: 0, as: 0, ht: 0, at: 0, played: false, stage });

// Circle method. Odd-sized groups get a bye each round.
export function roundRobin(ids: string[], rng: Rng): Fixture[][] {
  const arr: (string | null)[] = rng.shuffle([...ids]);
  if (arr.length % 2) arr.push(null);
  const n = arr.length, rounds: Fixture[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) round.push((r + i) % 2 ? fx(a, b) : fx(b, a));
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

export function newComp(id: Comp['id'], name: string, groups: string[][], ko: number, rng: Rng): Comp {
  const rounds: Fixture[][] = [];
  for (const g of groups) roundRobin(g, rng).forEach((r, i) => { (rounds[i] ??= []).push(...r); });
  const table: Record<string, Row> = {};
  for (const t of groups.flat()) table[t] = { p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, bp: 0, pts: 0 };
  return { id, name, groups, rounds, r: 0, table, ko, done: false, champion: '', awarded: false };
}

export function standings(c: Comp, group: number): { id: string; row: Row }[] {
  return c.groups[group].map(id => ({ id, row: c.table[id] })).sort((a, b) =>
    b.row.pts - a.row.pts || (b.row.pf - b.row.pa) - (a.row.pf - a.row.pa) || b.row.pf - a.row.pf || (a.id < b.id ? -1 : 1));
}

export function record(c: Comp, f: Fixture, hs: number, as: number, ht: number, at: number) {
  Object.assign(f, { hs, as, ht, at, played: true });
  if (f.stage !== '') return; // knockouts do not touch the table
  const side = (id: string, pf: number, pa: number, tries: number) => {
    const r = c.table[id];
    r.p++; r.pf += pf; r.pa += pa;
    if (pf > pa) { r.w++; r.pts += 4; } else if (pf === pa) { r.d++; r.pts += 2; } else { r.l++; if (pa - pf <= 7) { r.bp++; r.pts++; } }
    if (tries >= 4) { r.bp++; r.pts++; }
  };
  side(f.h, hs, as, ht); side(f.a, as, hs, at);
}

export function simScore(home: Team, away: Team, rng: Rng, knockout: boolean) {
  const d = teamRatings(home).ovr - teamRatings(away).ovr;
  const one = (lam: number) => {
    const t = rng.poisson(clamp(lam, 0.3, 9));
    let conv = 0; for (let i = 0; i < t; i++) if (rng.chance(0.72)) conv++;
    return { t, s: t * 5 + conv * 2 + rng.poisson(1.5) * 3 };
  };
  const h = one(2.9 + d / 6 + 0.2), a = one(2.9 - d / 6);
  if (knockout && h.s === a.s) { if (rng.chance(0.5)) h.s += 3; else a.s += 3; }
  return { hs: h.s, as: a.s, ht: h.t, at: a.t };
}

export function simFixture(c: Comp, f: Fixture, teams: Record<string, Team>, rng: Rng) {
  const s = simScore(teams[f.h], teams[f.a], rng, f.stage !== '');
  record(c, f, s.hs, s.as, s.ht, s.at);
}

// Call after every fixture in the current round has a result.
export function advance(c: Comp) {
  if (c.done || !c.rounds[c.r].every(f => f.played)) return;
  c.r++;
  if (c.r < c.rounds.length) return;
  const last = c.rounds[c.rounds.length - 1];
  if (last[0].stage === '') {
    if (c.ko === 0) { c.done = true; c.champion = standings(c, 0)[0].id; c.r = c.rounds.length - 1; return; }
    if (c.ko === 4) {
      const s = standings(c, 0);
      c.rounds.push([fx(s[0].id, s[3].id, 'SF'), fx(s[1].id, s[2].id, 'SF')]);
    } else if (c.ko === 8 && c.groups.length === 1) {
      // one league table, top eight: 1 v 8, 4 v 5, 2 v 7, 3 v 6
      const s = standings(c, 0);
      c.rounds.push([fx(s[0].id, s[7].id, 'QF'), fx(s[3].id, s[4].id, 'QF'), fx(s[1].id, s[6].id, 'QF'), fx(s[2].id, s[5].id, 'QF')]);
    } else if (c.ko === 16) {
      // Six pools of four: the top two of each and the four best third-placed teams go through.
      // They are seeded by pool record (winners, then runners-up, then thirds) and paired 1 v 16, 2 v 15...
      const s = c.groups.map((_, i) => standings(c, i));
      const rank = (xs: { id: string; row: Row }[]) => [...xs].sort((a, b) => b.row.pts - a.row.pts || (b.row.pf - b.row.pa) - (a.row.pf - a.row.pa) || b.row.pf - a.row.pf || (a.id < b.id ? -1 : 1));
      const seeds = [...rank(s.map(x => x[0])), ...rank(s.map(x => x[1])), ...rank(s.map(x => x[2])).slice(0, 4)].map(x => x.id);
      c.rounds.push([[0, 15], [7, 8], [3, 12], [4, 11], [1, 14], [6, 9], [2, 13], [5, 10]].map(([a, b]) => fx(seeds[a], seeds[b], 'R16')));
    } else {
      const s = c.groups.map((_, i) => standings(c, i));
      c.rounds.push([
        fx(s[0][0].id, s[1][1].id, 'QF'), fx(s[2][0].id, s[3][1].id, 'QF'),
        fx(s[1][0].id, s[0][1].id, 'QF'), fx(s[3][0].id, s[2][1].id, 'QF'),
      ]);
    }
  } else {
    const w = last.map(f => (f.hs > f.as ? f.h : f.a));
    if (w.length === 1) { c.done = true; c.champion = w[0]; c.r = c.rounds.length - 1; return; }
    const next: Fixture[] = [];
    for (let i = 0; i < w.length; i += 2) next.push(fx(w[i], w[i + 1], w.length === 2 ? 'FINAL' : w.length === 4 ? 'SF' : 'QF'));
    c.rounds.push(next);
  }
}

export function leagueRounds(c: Comp): number { return c.rounds.filter(r => r[0].stage === '').length; }
