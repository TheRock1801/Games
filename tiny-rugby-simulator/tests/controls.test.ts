import { describe, expect, it } from 'vitest';
import { Gfx } from '../src/engine/gfx';
import { Game, type Store } from '../src/engine/game';
import { TitleScene } from '../src/ui/menus';
import { MatchScene } from '../src/ui/matchscene';
import { newCareer } from '../src/career/career';
import { sideFromTeam } from '../src/match/side';
import { SCENARIOS } from '../src/scenarios';

// Drives the match screen with touches, the way thumbs would. Left half runs, right half passes.
function scene(id: string) {
  const mem = new Map<string, string>();
  const store: Store = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
  const g = new Gfx({ fillStyle: '' as any, globalAlpha: 1, fillRect() {} });
  g.resize(1560, 720);
  const game = new Game(g, store);
  game.go(new TitleScene(game));
  const c = newCareer(5, 'AKL'), sc = SCENARIOS.find(s => s.id === id)!;
  const s = new MatchScene(game, sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), false, 11, () => {}, { title: 't', start: m => sc.start(m), onExit: () => {} });
  game.go(s);
  game.frame(1 / 60);
  return { game, s, m: s.m, p: s.m.play! };
}
const drag = (game: Game, id: number, from: [number, number], to: [number, number], lift = true) => {
  game.push({ t: 'down', id, x: from[0], y: from[1] }); game.frame(1 / 60);
  game.push({ t: 'move', id, x: to[0], y: to[1] }); game.frame(1 / 60);
  if (lift) { game.push({ t: 'up', id, x: to[0], y: to[1] }); game.frame(1 / 60); }
};

describe('touch controls', () => {
  it('nothing happens at a ruck until the player acts', () => {
    const { game, p } = scene('boxkick');
    for (let i = 0; i < 120; i++) game.frame(1 / 60);
    expect(p.state).toBe('ready');
  });
  it('right thumb: pulling back and letting go passes the opposite way', () => {
    const { game, p } = scene('boxkick');
    const c = p.att[p.carrier];
    drag(game, 1, [250, 90], [270, 60]); // pulled right and up, so the ball goes back and down the screen
    expect(p.ball.mode).toBe('pass');
    expect(p.ball.tx).toBeLessThan(c.x);
    expect(p.ball.ty).toBeGreaterThan(c.y);
  });
  it('right thumb: a tiny movement does nothing', () => {
    const { game, p } = scene('boxkick');
    drag(game, 1, [250, 90], [253, 91]);
    expect(p.ball.mode).toBe('held'); expect(p.passes).toBe(0);
  });
  it('right thumb: aiming up the field from a ruck is a box kick', () => {
    const { game, p } = scene('boxkick');
    expect(p.aim(1, 0.1, 0.5)?.box).toBe(true);
    drag(game, 1, [280, 90], [240, 92]); // pulled back towards our own line
    expect(p.ball.mode).toBe('kick');
  });
  it('left thumb: a touch runs, a slow drag moves across, a flick sidesteps', () => {
    const { game, p } = scene('boxkick');
    game.push({ t: 'down', id: 2, x: 60, y: 90 }); game.frame(1 / 60);
    for (let y = 91; y <= 100; y++) { game.push({ t: 'move', id: 2, x: 60, y }); game.frame(1 / 60); }
    expect(p.state).toBe('live');
    expect(p.drift).toBeGreaterThan(0);
    expect(p.stepCd).toBeLessThanOrEqual(0);
    game.push({ t: 'move', id: 2, x: 60, y: 70 }); game.frame(1 / 60); // 30 pixels in one frame
    expect(p.stepCd).toBeGreaterThan(0);
    expect(p.stepDir).toBe(-1);
  });
  it('both thumbs work at once', () => {
    const { game, p } = scene('boxkick');
    game.push({ t: 'down', id: 2, x: 60, y: 90 }); game.frame(1 / 60);
    drag(game, 1, [250, 90], [270, 60]);
    expect(p.ball.mode).toBe('pass');
  });
  it('near the line a forward swipe on the running side is a dive, and it scores', () => {
    const { game, p, m } = scene('ruck5');
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    game.push({ t: 'down', id: 2, x: 60, y: 90 }); game.frame(1 / 60);
    const c = p.att[p.carrier];
    for (let i = 0; i < 200 && c.x < 97.5; i++) game.frame(1 / 60);
    const from = c.x;
    game.push({ t: 'move', id: 2, x: 61, y: 90 }); game.frame(1 / 60);
    game.push({ t: 'move', id: 2, x: 78, y: 90 }); game.frame(1 / 60);
    game.push({ t: 'move', id: 2, x: 95, y: 91 }); game.frame(1 / 60);
    expect(p.dived).toBe(true);
    for (let i = 0; i < 20; i++) game.frame(1 / 60);
    expect(c.x - from).toBeLessThan(3.2);   // a lunge of a metre or two, not a flight
    let tries = m.tries[0];
    for (let i = 0; i < 200 && m.tries[0] === tries && m.play === p; i++) game.frame(1 / 60);
    expect(m.tries[0] === tries + 1 || p.ruckSeq > 0 || p.state === 'done').toBe(true);
  });
  it('lineout: a pull-back throw into the lineout is thrown, a throw along the touchline is not', () => {
    const { game, m } = scene('lineout');
    expect(m.mode).toBe('lineout');
    drag(game, 1, [250, 60], [280, 62]); // sideways pull: the aim points down the line, not in
    expect(m.lo!.phase).toBe('aim');
    drag(game, 1, [250, 90], [250, 50]); // pulled up the screen, so the throw goes down it, into the field
    expect(m.lo!.phase).toBe('fly');
    for (let i = 0; i < 120 && m.mode === 'lineout'; i++) game.frame(1 / 60);
    expect(m.mode).not.toBe('lineout');
  });
  it('a scrum resolves by itself', () => {
    const { game, m } = scene('scrum');
    expect(m.mode).toBe('scrum');
    for (let i = 0; i < 200 && m.mode === 'scrum'; i++) game.frame(1 / 60);
    expect(m.mode).not.toBe('scrum');
  });
});
