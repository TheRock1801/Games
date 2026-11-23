// Renders game screens to PNG files without a browser, so layouts can be checked by eye.
// Uses a real canvas (@napi-rs/canvas) and the game's own fonts, so what it draws is what a phone draws.
// Run with:  SHOTS=<output folder> npx vitest run tests/shots.test.ts
//   SHOT_W=1560 for a phone-shaped screen, SHOT_NAMES=title,squad,... to pick screens.
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { Gfx, type Ctx } from '../src/engine/gfx';
import { Game, type Store } from '../src/engine/game';
import { TitleScene } from '../src/ui/menus';
import { demo } from '../src/demo';
import { DEFAULT_TUNING, applyTuning } from '../src/config';

const PW = Number(process.env.SHOT_W ?? 1280), PH = 720;
const out = process.env.SHOTS;
const names = (process.env.SHOT_NAMES ?? 'title,select,squad,player,matchcentre,table,fixtures,club,offseason,wcpick,ready,play,step,tackle,ruck,scrum,lineout,penalty,goalkick,oppsim,fulltime').split(',');

it.skipIf(!out)('render screens', () => {
  GlobalFonts.registerFromPath('public/fonts/display.woff2', 'TTDisplay');
  GlobalFonts.registerFromPath('public/fonts/sans-600.woff2', 'TTSans');
  GlobalFonts.registerFromPath('public/fonts/sans-700.woff2', 'TTSans');
  GlobalFonts.registerFromPath('public/fonts/block-600.woff2', 'TTBlock');
  GlobalFonts.registerFromPath('public/fonts/block-700.woff2', 'TTBlock');
  // SHOT_THEME=1 renders in another colour theme
  applyTuning({ ...DEFAULT_TUNING, theme: Number(process.env.SHOT_THEME ?? DEFAULT_TUNING.theme) });
  mkdirSync(out!, { recursive: true });
  for (const name of names) {
    const mem = new Map<string, string>();
    const store: Store = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
    const canvas = createCanvas(PW, PH);
    const ctx = canvas.getContext('2d');
    const g = new Gfx(ctx as unknown as Ctx);
    g.resize(PW, PH);
    const game = new Game(g, store);
    game.go(new TitleScene(game));
    if (name !== 'title') demo(game, name);
    for (let i = 0; i < (name === 'title' ? 40 : 1); i++) game.frame(1 / 30);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, PW, PH);
    game.frame(1 / 30);
    writeFileSync(join(out!, `${name}.png`), canvas.toBuffer('image/png'));
  }
});
