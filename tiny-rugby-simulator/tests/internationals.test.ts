import { describe, it, expect } from 'vitest';
import { newCareer, canSign, sign, rerollMarket, train, upgrade } from '../src/career/career';
import { INTERNATIONAL_NAMES } from '../src/data/international-names';
import { NATION_IDS, TEAMS } from '../src/data/teams';
import { SLOTS } from '../src/career/types';

describe('international player name placeholders', () => {
  it('covers every World Cup nation with twelve distinct real-name placeholders', () => {
    expect(NATION_IDS).toHaveLength(24);
    expect(Object.keys(INTERNATIONAL_NAMES).sort()).toEqual([...NATION_IDS].sort());
    for (const id of NATION_IDS) {
      const names = INTERNATIONAL_NAMES[id];
      expect(names).toHaveLength(SLOTS.length);
      expect(new Set(names).size).toBe(SLOTS.length);
      expect(names.every(s => s.trim().includes(' '))).toBe(true);
    }
  });

  it('uses international names for a new World Cup and keeps club roster names generated', () => {
    const c = newCareer(47, 'NZL', 'cup');
    expect(c.teams.NZL.roster.map(p => p.name)).toEqual([...INTERNATIONAL_NAMES.NZL]);
    expect(c.teams.RSA.roster.map(p => p.name)).toEqual([...INTERNATIONAL_NAMES.RSA]);
    expect(c.teams.AKL.roster.map(p => p.name)).not.toEqual([...INTERNATIONAL_NAMES.NZL]);
    expect(c.teams.NZL.roster.map(p => p.pos)).toEqual([...SLOTS]);
  });

  it('fixes World Cup squads while retaining the club market in a normal career', () => {
    const cup = newCareer(11, 'NZL', 'cup');
    expect(cup.market).toHaveLength(0);
    const example = cup.teams.NZL.roster[0];
    expect(canSign(cup, 0, example)).toBe(false);
    expect(sign(cup, 0, example)).toBe(false);
    expect(rerollMarket(cup)).toBe(false);
    expect(train(cup, 0, 'sta')).toBe(false);
    expect(upgrade(cup, 'train')).toBe(false);
    const club = newCareer(11, 'AKL');
    expect(club.market.length).toBeGreaterThan(0);
    expect(club.teams.AKL.kind).toBe('club');
    expect(TEAMS.filter(t => t.kind === 'nation')).toHaveLength(24);
  });
});
