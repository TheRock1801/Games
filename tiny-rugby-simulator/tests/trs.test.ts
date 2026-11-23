import { describe, expect, it } from 'vitest';
import { newCareer, developmentCeiling, upgrade, train } from '../src/career/career';
import { ATTRIBUTES, ovr, paceFor, teamRatings } from '../src/career/players';
import { loadCareer, saveCareer } from '../src/career/saves';
import type { Store } from '../src/engine/game';

describe('TRS player attributes and existing careers', () => {
  it('stores exactly stamina, handling, passing, kicking and tackling', () => {
    const c = newCareer(43, 'AKL'), p = c.teams.AKL.roster[0];
    expect(ATTRIBUTES).toEqual(['sta', 'hnd', 'pas', 'kck', 'tkl']);
    for (const a of ATTRIBUTES) expect(Number.isFinite(p[a])).toBe(true);
    expect('spd' in p).toBe(false);
    expect('str' in p).toBe(false);
    expect(teamRatings(c.teams.AKL).pack).toBeGreaterThan(0);
  });
  it('keeps wingers faster without a visible speed stat', () => {
    const c = newCareer(43, 'AKL'), r = c.teams.AKL.roster;
    expect(paceFor(r.find(p => p.pos === 'WG')!)).toBeGreaterThan(paceFor(r.find(p => p.pos === 'PR')!) + 15);
  });
  it('converts older player records without deleting saved careers', () => {
    const mem = new Map<string, string>();
    const store: Store = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
    const c = newCareer(43, 'AKL');
    const old = c.teams.AKL.roster[0] as unknown as { spd?: number; str?: number; pas?: number; tkl?: number };
    old.spd = 75; old.str = 85; delete old.pas; delete old.tkl;
    saveCareer(store, c);
    const converted = loadCareer(store, c.id!)!;
    const p = converted.teams.AKL.roster[0];
    expect(Number.isFinite(p.pas)).toBe(true);
    expect(Number.isFinite(p.tkl)).toBe(true);
    expect('spd' in p).toBe(false);
    expect(converted.teams.AKL.roster.length).toBe(12);
  });
  it('supports eight facility levels and uses potential as a development cap', () => {
    const c = newCareer(43, 'AKL'); c.credits = 5000;
    const p = c.teams.AKL.roster.find(x => x.star)!;
    const first = developmentCeiling(c, p);
    for (let i = 0; i < 8; i++) expect(upgrade(c, 'train')).toBe(true);
    expect(upgrade(c, 'train')).toBe(false);
    expect(developmentCeiling(c, p)).toBe(Math.min(99, first + 8));
    const old = p.hnd, before = ovr(p);
    if (before < developmentCeiling(c, p) && old < 99) {
      expect(train(c, c.teams.AKL.roster.indexOf(p), 'hnd')).toBe(true);
      expect(p.hnd).toBe(old + 1);
    }
  });
});
