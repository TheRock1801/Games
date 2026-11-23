import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { simOpp } from '../src/match/oppsim';
import { Timing } from '../src/match/minigames';
import { Match, WIND_PUSH } from '../src/match/match';
import { MID } from '../src/match/attack';
import { newCareer } from '../src/career/career';
import { sideFromTeam } from '../src/match/side';
import { playMatch } from './bot';

describe('match', () => {
  for (const skill of [0, 0.6, 1]) {
    it(`bot with skill ${skill} completes matches with sane scores`, () => {
      let us = 0, them = 0, wins = 0, tries = 0, secs = 0, metres = 0, phases = 0;
      const N = 40;
      for (let s = 1; s <= N; s++) {
        const { m, frames } = playMatch(s * 31, skill);
        expect(m.done).toBe(true);
        expect(m.score[0]).toBeLessThan(150); expect(m.score[1]).toBeLessThan(150);
        us += m.score[0]; them += m.score[1]; tries += m.tries[0]; secs += frames / 30; metres += m.stats.metres; phases += m.stats.phases;
        if (m.score[0] > m.score[1]) wins++;
      }
      console.log(`skill ${skill}: us ${(us / N).toFixed(1)} them ${(them / N).toFixed(1)} tries ${(tries / N).toFixed(1)} wins ${wins}/${N} length ${(secs / N).toFixed(0)}s metres ${(metres / N).toFixed(0)} phases ${(phases / N).toFixed(1)}`);
    });
  }
  it('a weaker side concedes more than a stronger one', () => {
    let weak = 0, strong = 0;
    for (let s = 1; s <= 25; s++) { weak += playMatch(s, 0.6, 'API', 'CHC').m.score[1]; strong += playMatch(s, 0.6, 'CHC', 'API').m.score[1]; }
    console.log(`points conceded: API v CHC ${(weak / 25).toFixed(1)}, CHC v API ${(strong / 25).toFixed(1)}`);
    expect(weak).toBeGreaterThan(strong);
  });
});

describe('opposition sim', () => {
  it('always ends with a legal restart and bounded points', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 2000; i++) {
      const kind = rng.pick(['kickoff', 'turnover', 'kick', 'penalty', 'lineout', 'scrum'] as const);
      const r = simOpp({ x: rng.range(1, 99), kind }, { name: 'X', att: 80, def: 78, kick: 80 }, rng);
      expect(r.pts).toBeLessThanOrEqual(7); expect(r.lines.length).toBe(r.track.length); expect(r.clock).toBeGreaterThan(0);
      if (r.next.k !== 'kickoffThem') { expect(r.next.x).toBeGreaterThanOrEqual(1); expect(r.next.x).toBeLessThanOrEqual(99); }
    }
  });
});

describe('mini-games', () => {
  it('timing: centre is perfect, outside is a miss', () => {
    const t = new Timing(1, 0.3, new Rng(1)); t.t = 1; t.pos = (t.lo + t.hi) / 2; t.tap(); expect(t.result).toBe('perfect');
    const u = new Timing(1, 0.3, new Rng(1)); u.t = 1; u.pos = u.hi + 0.05; u.tap(); expect(u.result).toBe('miss');
  });
  it('timing: the sweet spot is a small part of the zone', () => {
    const t = new Timing(1, 0.3, new Rng(1), 5, 0.2); t.t = 1; t.pos = (t.lo + t.hi) / 2 + 0.05; t.tap(); expect(t.result).toBe('good');
  });
});

describe('place kicks', () => {
  const match = (seed: number, wind = { x: 0, y: 0 }) => {
    const c = newCareer(3, 'AKL'), m = new Match(sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), new Rng(seed));
    m.wind = wind;
    return m;
  };
  const kick = (m: Match, x: number, y: number, ax: number, ay: number, power: number) => {
    m.startGoalKick('conv', x, y);
    m.startAim(); m.kickGoal(ax, ay, power);
    const good = m.pk!.good;
    return good;
  };
  it('from in front, aimed at the posts in still air, nearly always goes over; a weak one drops short', () => {
    let good = 0;
    for (let s = 1; s <= 50; s++) if (kick(match(s), 85, MID, 1, 0, 0.5)) good++;
    expect(good).toBeGreaterThan(45);
    const m = match(1); kick(m, 70, MID, 1, 0, 0.05);
    expect(m.pk!.result).toBe('short');
  });
  it('a strong cross wind pushes a straight kick wide, and aiming off brings it back', () => {
    let straight = 0, allowed = 0;
    for (let s = 1; s <= 40; s++) {
      if (kick(match(s, { x: 0, y: 4 }), 78, MID, 1, 0, 0.55)) straight++;
      // aim up-wind by as much as the wind will have moved the ball when it reaches the posts
      const m = match(s, { x: 0, y: 4 }), range = m.aimGoal(1, 0, 0.55) ? (m.startGoalKick('conv', 78, MID), m.aimGoal(1, 0, 0.55)!.dist) : 38, dur = 0.9 + range / 26, f = 22 / range;
      if (kick(m, 78, MID, 22, -4 * dur * WIND_PUSH * f * f, 0.55)) allowed++;
    }
    expect(straight).toBeLessThan(10);
    expect(allowed).toBeGreaterThan(30);
  });
  it('their man charges only once the thumb is down, and gets there if the kicker dawdles', () => {
    const m = match(2);
    m.startGoalKick('conv', 84, MID);
    for (let i = 0; i < 90; i++) m.update(1 / 30);
    expect(m.pk!.cx).toBe(100);          // waiting: he has not moved
    m.startAim();
    for (let i = 0; i < 200 && m.mode === 'goalkick'; i++) m.update(1 / 30);
    expect(m.mode).toBe('banner'); expect(m.banner.title).toBe('CHARGED DOWN');
  });
});
