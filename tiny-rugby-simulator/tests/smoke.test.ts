import { describe, expect, it } from 'vitest';
import { Gfx, W, H } from '../src/engine/gfx';
import { Game, type Store } from '../src/engine/game';
import { Rng } from '../src/engine/rng';
import { TitleScene } from '../src/ui/menus';
import { MatchScene } from '../src/ui/matchscene';

function harness() {
  const mem = new Map<string, string>();
  const store: Store = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
  let rects = 0;
  const ctx = { fillStyle: '' as any, globalAlpha: 1, fillRect() { rects++; } };
  const g = new Gfx(ctx);
  g.resize(1280, 720);
  const game = new Game(g, store);
  game.go(new TitleScene(game));
  return { game, mem, rects: () => rects };
}

// Random taps and drags across every screen: nothing may throw, and the game must stay drawable.
describe('smoke', () => {
  for (const seed of [1, 2, 3]) {
    it(`random input, seed ${seed}`, () => {
      const { game, mem, rects } = harness();
      const rng = new Rng(seed);
      const seen = new Set<string>();
      let matches = 0;
      for (let f = 0; f < 60000; f++) {
        if (rng.chance(0.25)) {
          const x = rng.range(0, W), y = rng.range(0, H), id = rng.int(1, 2);
          game.push({ t: 'down', id, x, y });
          if (rng.chance(0.3)) game.push({ t: 'move', id, x: x + rng.range(-40, 40), y: y + rng.range(-40, 40) });
          else game.push({ t: 'up', id, x, y });
        }
        if (rng.chance(0.05)) game.push({ t: 'up', id: rng.int(1, 2), x: rng.range(0, W), y: rng.range(0, H) });
        const before = game.scene;
        game.frame(1 / 30);
        seen.add(game.scene.constructor.name);
        if (game.scene !== before && game.scene instanceof MatchScene) matches++;
      }
      console.log(`seed ${seed}: screens ${[...seen].join(', ')}; matches started ${matches}; year ${game.career?.year}`);
      expect(rects()).toBeGreaterThan(1000);
      expect(seen.has('SquadScene') || seen.has('MyCareerScene')).toBe(true);
      const raw = mem.get([...mem.keys()].find(k => k.startsWith('trytime.career.')) ?? '');
      expect(raw).toBeTruthy();
      expect(() => JSON.parse(raw!)).not.toThrow();
    });
  }
});
