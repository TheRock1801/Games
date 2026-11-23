import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { advance, newComp, record, roundRobin, simFixture, standings } from '../src/career/competition';
import {
  CAP, START_YEAR, candidates, capUsed, finishRound, newCareer, pickWc, proceed, sign, startNextYear, train, upgrade, userFixture,
} from '../src/career/career';
import { CLUB_IDS, NATION_IDS, URC_IDS, WC_POOLS } from '../src/data/teams';
import type { Career, Comp } from '../src/career/types';

describe('fixtures', () => {
  for (const n of [12, 6, 5]) {
    it(`round robin of ${n}: every pair meets once`, () => {
      const ids = Array.from({ length: n }, (_, i) => 'T' + i);
      const rounds = roundRobin(ids, new Rng(n));
      const seen = new Set<string>();
      for (const r of rounds) {
        const inRound = new Set<string>();
        for (const f of r) {
          const k = [f.h, f.a].sort().join('-');
          expect(seen.has(k)).toBe(false); seen.add(k);
          expect(inRound.has(f.h) || inRound.has(f.a)).toBe(false); inRound.add(f.h); inRound.add(f.a);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    });
  }
});

describe('table', () => {
  it('awards 4 for a win, bonus points for 4 tries and a close loss', () => {
    const c = newComp('north', 'X', [['A', 'B']], 0, new Rng(1));
    const f = c.rounds[0][0];
    record(c, f, 30, 25, 4, 3);
    expect(c.table[f.h]).toMatchObject({ w: 1, pts: 5, bp: 1 });
    expect(c.table[f.a]).toMatchObject({ l: 1, pts: 1, bp: 1 });
    expect(standings(c, 0)[0].id).toBe(f.h);
  });
});

describe('competitions run to a champion', () => {
  const c = newCareer(42, 'AKL');
  const run = (comp: Comp) => {
    let guard = 0; const rng = new Rng(7);
    while (!comp.done && guard++ < 50) {
      for (const f of comp.rounds[comp.r]) if (!f.played) simFixture(comp, f, c.teams, rng);
      advance(comp);
    }
    return comp;
  };
  it('southern: 11 rounds, semis, final', () => {
    const s = run(newComp('south', 'S', [CLUB_IDS], 4, new Rng(3)));
    expect(s.done).toBe(true); expect(s.rounds.length).toBe(13); expect(CLUB_IDS).toContain(s.champion);
  });
  it('URC: 16 teams, 15 rounds, then quarters, semis and a final', () => {
    const n = run(newComp('north', 'N', [URC_IDS], 8, new Rng(3)));
    expect(URC_IDS.length).toBe(16);
    expect(n.done).toBe(true); expect(n.rounds.length).toBe(18); expect(URC_IDS).toContain(n.champion);
  });
  it('a table-only league still works: 6 teams, 5 rounds, the table decides', () => {
    const n = run(newComp('north', 'N', [URC_IDS.slice(0, 6)], 0, new Rng(3)));
    expect(n.rounds.length).toBe(5); expect(n.champion).toBe(standings(n, 0)[0].id);
  });
  it('World Cup: six pools of four, 16 go through, and it runs to a champion', () => {
    expect(WC_POOLS.flat().length).toBe(24); expect(new Set(WC_POOLS.flat()).size).toBe(24);
    for (const id of WC_POOLS.flat()) expect(NATION_IDS).toContain(id);
    const w = run(newComp('world', 'W', WC_POOLS, 16, new Rng(3)));
    expect(w.done).toBe(true);
    expect(w.rounds.length).toBe(3 + 4); // three pool rounds, then last 16, quarters, semis, final
    const r16 = w.rounds[3];
    expect(r16.length).toBe(8); expect(new Set(r16.flatMap(x => [x.h, x.a])).size).toBe(16);
    // every pool's top two are in the last 16
    for (let g = 0; g < 6; g++) for (const t of standings(w, g).slice(0, 2)) expect(r16.some(x => x.h === t.id || x.a === t.id)).toBe(true);
    for (const x of w.rounds.flat().filter(x => x.stage)) expect(x.hs).not.toBe(x.as);
  });
  it('world: pools, quarters, semis, final with no drawn knockouts', () => {
    const pools = [0, 1, 2, 3].map(i => NATION_IDS.slice(i * 5, i * 5 + 5));
    const w = run(newComp('world', 'W', pools, 8, new Rng(3)));
    expect(w.done).toBe(true); expect(w.rounds.length).toBe(8);
    for (const f of w.rounds.flat().filter(f => f.stage)) expect(f.hs).not.toBe(f.as);
  });
});

function simYears(c: Career, years: number, switchTeams: boolean) {
  let guard = 0;
  while (c.year < START_YEAR + years && guard++ < 5000) {
    if (c.stage === 'wcpick') pickWc(c, guard % 2 ? c.offers[0] : null);
    else if (c.stage === 'offseason') startNextYear(c, switchTeams && c.offers.length ? c.offers[0] : undefined);
    else if (userFixture(c)) finishRound(c);
    else proceed(c);
  }
  expect(guard).toBeLessThan(5000);
}

describe('career', () => {
  it('runs nine years including two World Cups and team changes', () => {
    const c = newCareer(99, 'PER');
    simYears(c, 9, true);
    expect(c.year).toBe(START_YEAR + 9);
    for (const t of Object.values(c.teams)) {
      expect(t.roster.length).toBe(12);
      for (const p of t.roster) for (const k of ['sta', 'hnd', 'pas', 'kck', 'tkl', 'age', 'salary'] as const) expect(Number.isFinite(p[k])).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
  it('a nation coach takes their own team to the World Cup in 2027', () => {
    const c = newCareer(5, 'WAL');
    let guard = 0;
    while (c.stage !== 'worldcup' && guard++ < 500) {
      if (c.stage === 'offseason') startNextYear(c); else if (userFixture(c)) finishRound(c); else proceed(c);
    }
    expect(c.wcTeamId).toBe('WAL'); expect(c.year).toBe(2027);
    expect(userFixture(c) !== null || c.comps.world!.rounds[0].every(f => f.h !== 'WAL' && f.a !== 'WAL')).toBe(true);
  });
  it('is deterministic for a seed', () => {
    const a = newCareer(1234, 'CHC'), b = newCareer(1234, 'CHC');
    simYears(a, 3, false); simYears(b, 3, false);
    expect(a).toEqual(b);
  });
  it('signing never breaks the cap and swaps the old player into the market', () => {
    const c = newCareer(8, 'PER'), t = c.teams.PER;
    const cand = candidates(c, 0)[0], old = t.roster[0];
    const ok = sign(c, 0, cand);
    if (ok) { expect(t.roster[0]).toBe(cand); expect(c.market).toContain(old); }
    expect(capUsed(t)).toBeLessThanOrEqual(CAP);
  });
  it('training and upgrades spend credits', () => {
    const c = newCareer(8, 'PER'); c.credits = 11; // a training point is 3, the first training-centre level 8
    const before = c.teams.PER.roster[9].hnd;
    expect(train(c, 9, 'hnd')).toBe(true); expect(c.teams.PER.roster[9].hnd).toBe(before + 1);
    expect(upgrade(c, 'train')).toBe(true); expect(c.credits).toBe(0); expect(upgrade(c, 'med')).toBe(false);
  });
});

describe('World Cup tournament mode', () => {
  it('starts in the pool stage with the chosen nation and plays through to a champion', () => {
    const c = newCareer(31, 'FIJ', 'cup');
    expect(c.mode).toBe('cup'); expect(c.stage).toBe('worldcup'); expect(c.wcTeamId).toBe('FIJ');
    expect(c.comps.world!.groups.length).toBe(6);
    let guard = 0;
    while (!c.comps.world!.done && guard++ < 200) { if (userFixture(c)) finishRound(c); else proceed(c); }
    expect(c.comps.world!.done).toBe(true);
    expect(NATION_IDS).toContain(c.comps.world!.champion);
    proceed(c); // nothing follows a finished tournament
    expect(c.stage).toBe('worldcup');
  });
  it('a club career is in the league its team plays in', () => {
    expect(userFixture(newCareer(3, 'LEI'))).not.toBeNull();
    const c = newCareer(3, 'LEI');
    expect(c.comps.north.groups[0]).toContain('LEI'); expect(c.comps.south.groups[0].length).toBe(11);
  });
});
