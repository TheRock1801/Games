import { describe, expect, it } from 'vitest';
import { visibleTouchExit, AttackPlay } from '../src/match/attack';
import { airborneBallScale } from '../src/ui/ui';
import { Rng } from '../src/engine/rng';
import { newCareer } from '../src/career/career';
import { sideFromTeam } from '../src/match/side';
import { Game, type Store } from '../src/engine/game';
import { Gfx, type Ctx } from '../src/engine/gfx';
import { MatchScene } from '../src/ui/matchscene';
import { TrainingScene } from '../src/ui/training';

const make = () => {
  const memory = new Map<string, string>();
  const store: Store = { get: key => memory.get(key) ?? null, set: (key, value) => { memory.set(key, value); }, del: key => { memory.delete(key); } };
  const ctx = { fillStyle: '#fff', globalAlpha: 1, fillRect() {} } as unknown as Ctx;
  const game = new Game(new Gfx(ctx), store);
  game.career = newCareer(101, 'AKL');
  return { game, memory, us: sideFromTeam(game.career.teams.AKL), them: sideFromTeam(game.career.teams.SYD) };
};

describe('clean match presentation', () => {
  it('makes a high kick substantially larger while keeping a ground-level ball normal', () => {
    expect(airborneBallScale(0)).toBe(1);
    expect(airborneBallScale(12)).toBeGreaterThan(3);
    expect(airborneBallScale(-1)).toBe(1);
  });

  it('shows touch crossings beyond either sideline without altering in-field kick destinations', () => {
    expect(visibleTouchExit({ x: 40, y: 23 }, { x: 67, y: -12 }).y).toBeCloseTo(-2.4);
    expect(visibleTouchExit({ x: 40, y: 23 }, { x: 67, y: 75 }).y).toBeCloseTo(52.4);
    expect(visibleTouchExit({ x: 40, y: 23 }, { x: 65, y: 18 })).toEqual({ x: 65, y: 18, cut: 1 });
  });

  it('teaches controls in the first career match but does not repeat the instructions', () => {
    const { game, us, them, memory } = make();
    const first = new MatchScene(game, us, them, false, 1, () => {});
    expect((first as unknown as { showTutorial: boolean }).showTutorial).toBe(true);
    expect(memory.get('trs.match.tutorial.seen.v1')).toBe('1');
    const next = new MatchScene(game, us, them, false, 2, () => {});
    expect((next as unknown as { showTutorial: boolean }).showTutorial).toBe(false);
  });

  it('keeps tutorial overlays away from returning players and training drills', () => {
    const { game, us, them, memory } = make();
    const drill = new MatchScene(game, us, them, false, 1, () => {}, {
      title: 'Training', start: match => match.startPlay({ x: 40, y: 25, kind: 'open' }), onExit() {},
    });
    expect((drill as unknown as { showTutorial: boolean }).showTutorial).toBe(false);
    expect(memory.has('trs.match.tutorial.seen.v1')).toBe(false);
    game.career!.record.w = 1;
    const returning = new MatchScene(game, us, them, false, 2, () => {});
    expect((returning as unknown as { showTutorial: boolean }).showTutorial).toBe(false);
  });
});

describe('training board and ball chasers', () => {
  it('deselects a player on a blank tap without changing his route', () => {
    const { game } = make();
    const training = new TrainingScene(game, () => ({ update() {}, draw() {} }));
    const board = training as unknown as { sel: number; f: unknown };
    board.sel = 0;
    const before = JSON.stringify(board.f);
    training.onEv({ t: 'down', id: 4, x: 220, y: 150 });
    training.onEv({ t: 'up', id: 4, x: 220, y: 150 });
    expect(board.sel).toBe(-1);
    expect(JSON.stringify(board.f)).toBe(before);
  });

  it('keeps drag-to-route working after the blank-tap change', () => {
    const { game } = make();
    const training = new TrainingScene(game, () => ({ update() {}, draw() {} }));
    const board = training as unknown as { sel: number; f: { spots: { path?: unknown[] }[] } };
    board.sel = 0;
    training.onEv({ t: 'down', id: 4, x: 180, y: 136 });
    training.onEv({ t: 'move', id: 4, x: 196, y: 112 });
    training.onEv({ t: 'up', id: 4, x: 196, y: 112 });
    expect(board.f.spots[0].path?.length).toBeGreaterThan(0);
  });

  it('sends a defender who started behind the kick towards its landing point', () => {
    const { us, them } = make();
    const play = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'open' }, new Rng(10));
    for (let i = 0; i < play.def.length; i++) { play.def[i].stun = i === 0 ? 0 : 1e9; play.def[i].off = false; }
    const defender = play.def[0];
    Object.assign(defender, { x: 53, y: 23, react: 0, st: 'line' });
    Object.assign(play.ball, { mode: 'kick', x: 46, y: 20, fx: 46, fy: 20, tx: 69, ty: 19, z: 9, dur: 3, dist: 23 });
    const d0 = Math.hypot(defender.x - 69, defender.y - 19);
    const chase = play as unknown as { defend(dt: number): void };
    for (let i = 0; i < 10; i++) chase.defend(1 / 30);
    expect(Math.hypot(defender.x - 69, defender.y - 19)).toBeLessThan(d0);
  });
});
