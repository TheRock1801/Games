import { Gfx, W } from '../engine/gfx';
import type { Game, Scene } from '../engine/game';
import type { Player } from '../career/types';
import { POS_NAMES, keyAttrs, ovr } from '../career/players';
import { CAP, REFRESH_COST, activeTeamId, canSign, capUsed, rerollMarket, signFee, slotFor, sign } from '../career/career';
import { C, button, drawFace, inRect, type Rect } from './ui';
import { CONTENT_Y, chrome, saveGame } from './menus';

const col = (v: number) => (v >= 85 ? C.gold : v >= 70 ? C.ink : C.dim);
export const money = (k: number) => (k >= 1000 ? `$${(k / 1000).toFixed(k % 1000 ? 2 : 0)}M` : `$${k}k`);

// The Open Market: ten players at a time, each a face, a name, a position, a rating and a price.
// Credits (earned from matches) pay the recruitment price; the salary has to fit under the cap. Those are
// the only two numbers. Tap a player for everything else about him.
export class MarketScene implements Scene {
  private ask = false; private msg = ''; private msgT = 0;
  constructor(private game: Game, msg = '') { if (msg) { this.msg = msg; this.msgT = 3; } }
  update(dt: number) { if (this.msgT > 0) this.msgT -= dt; }
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 4)) return;
    const c = game.career!, id = activeTeamId(c) || c.teamId, t = c.teams[c.teamId];
    const used = capUsed(t), club = t.kind === 'club' && id === c.teamId && c.mode !== 'cup';
    // credits and the cap, always in view
    g.card(8, CONTENT_Y, 304, 17, C.panel);
    g.label(`CREDITS: ${c.credits}`, 14, CONTENT_Y + 3, 10, C.gold, { display: true });
    g.label('Salary cap', 106, CONTENT_Y + 5, 6.5, C.dim);
    g.card(142, CONTENT_Y + 6, 60, 5, C.dark); g.card(142, CONTENT_Y + 6, Math.min(60, 60 * used / CAP), 5, used > CAP * 0.92 ? C.red : C.gold);
    g.label(`${money(Math.max(0, CAP - used))} free`, 206, CONTENT_Y + 5, 6.5, C.ink, { bold: true });
    if (!club) { g.label(c.mode === 'cup' ? 'There is no market at a World Cup: you play with the squad you have' : 'The market opens again when you are back with your club', W / 2, CONTENT_Y + 60, 8, C.dim, { align: 1 }); return; }
    // a new ten, for a price, and only when asked for
    if (this.ask) {
      if (button(game, g, 244, CONTENT_Y + 2, 34, 13, 'Yes', { primary: true, size: 7 })) { this.ask = false; if (rerollMarket(c)) { saveGame(game); this.msg = 'Ten new players are on the market'; this.msgT = 3; } }
      if (button(game, g, 280, CONTENT_Y + 2, 30, 13, 'No', { size: 7 })) this.ask = false;
    } else if (button(game, g, 244, CONTENT_Y + 2, 66, 13, `Refresh: ${REFRESH_COST} credits`, { off: c.credits < REFRESH_COST, col: C.panel2, size: 6 })) this.ask = true;

    const list = [...c.market].sort((a, b) => ovr(b) - ovr(a)).slice(0, 10);
    if (!list.length) g.label('Nobody is on the market just now', W / 2, CONTENT_Y + 60, 8, C.dim, { align: 1 });
    list.forEach((p, i) => {
      const x = 8 + (i % 2) * 154, y = CONTENT_Y + 21 + Math.floor(i / 2) * 21.5, r: Rect = [x, y, 150, 20];
      const fee = signFee(p), can = c.credits >= fee, hot = game.ptr.down && inRect(game.ptr, r);
      g.card(x, y, 150, 20, hot ? C.panel2 : C.panel);
      drawFace(g, x + 2, y + 2, 16, p, t);
      g.label(p.name.toUpperCase(), x + 22, y + 2, 7.5, C.ink, { bold: true });
      g.label(POS_NAMES[p.pos] ?? p.pos, x + 22, y + 11, 6, C.dim);
      g.label(`Recruit: ${fee} credits`, x + 60, y + 11, 6, can ? C.gold : C.red, { bold: true });
      g.label('OVR', x + 126, y + 11.5, 5, C.dim, { align: 2 });
      g.label(String(ovr(p)), x + 146, y + 3, 14, col(ovr(p)), { align: 2, display: true });
      if (game.tap && inRect(game.tap, r)) { game.tap = null; game.go(new MarketPlayerScene(game, p)); }
    });
    g.label(this.msgT > 0 ? this.msg : this.ask ? `Spend ${REFRESH_COST} credits on ten new players? The ones here now will be gone` : 'Tap a player for his full profile. Matches earn credits: more for playing, more again for winning', W / 2, CONTENT_Y + 131, 6.5, this.msgT > 0 || this.ask ? C.gold : C.dim, { align: 1 });
  }
}

// One market player in full: what he is, what he could become, what he costs, and who he would replace.
export class MarketPlayerScene implements Scene {
  constructor(private game: Game, private p: Player) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 4)) return;
    const c = game.career!, t = c.teams[c.teamId], p = this.p;
    if (!c.market.includes(p)) { game.go(new MarketScene(game)); return; }
    const slot = slotFor(c, p), cur = slot >= 0 ? t.roster[slot] : null, fee = signFee(p), o = ovr(p);
    drawFace(g, 8, CONTENT_Y, 40, p, t);
    g.label(p.name.toUpperCase(), 56, CONTENT_Y - 1, 13, C.ink, { display: true });
    g.label(`${POS_NAMES[p.pos] ?? p.pos}   Age ${p.age}`, 56, CONTENT_Y + 16, 8, C.dim);
    g.label(p.age <= 23 ? 'Young, with room to grow' : p.pot > o + 2 ? 'Still improving' : 'At his peak', 56, CONTENT_Y + 27, 6.5, p.pot > o + 5 ? C.gold : C.dim);
    g.card(206, CONTENT_Y, 52, 38, C.panel); g.label(String(o), 232, CONTENT_Y + 2, 22, col(o), { align: 1, display: true }); g.label('Overall', 232, CONTENT_Y + 27, 6.5, C.dim, { align: 1 });
    g.card(260, CONTENT_Y, 52, 38, C.panel); g.label(String(Math.max(o, p.pot)), 286, CONTENT_Y + 2, 22, p.pot > o ? C.gold : C.dim, { align: 1, display: true }); g.label('Potential', 286, CONTENT_Y + 27, 6.5, C.dim, { align: 1 });
    // every attribute; the ones that matter most in his position are marked
    const key = keyAttrs(p.pos) as string[];
    const attrs: [string, string, number][] = [['sta', 'Stamina', p.sta], ['hnd', 'Handling', p.hnd], ['pas', 'Passing', p.pas], ['kck', 'Kicking', p.kck], ['tkl', 'Tackling', p.tkl]];
    if (['PR', 'HK', 'LK', 'FL', 'N8', 'CE'].includes(p.pos)) key.push('tkl');
    attrs.forEach(([k, name, v], i) => {
      const x = 8 + (i % 2) * 154, y = CONTENT_Y + 43 + Math.floor(i / 2) * 14, on = key.includes(k);
      g.card(x, y, 150, 12.5, C.panel); if (on) g.rect(x, y + 1, 2, 10.5, C.gold);
      g.label(name, x + 6, y + 2.5, 7, on ? C.ink : C.dim, { bold: on });
      g.card(x + 84, y + 4, 40, 5, C.dark); g.card(x + 84, y + 4, 40 * v / 100, 5, v >= 85 ? C.gold : v >= 70 ? C.green : v >= 60 ? C.blue : C.red);
      g.label(String(v), x + 146, y + 1.5, 9, col(v), { align: 2, display: true });
    });
    g.label('Marked attributes count most towards his rating in that position', 8, CONTENT_Y + 86, 5.5, C.dim);
    // the two prices, and who makes way
    const capOk = slot >= 0 && canSign(c, slot, p), crOk = c.credits >= fee, ok = capOk && crOk;
    g.card(8, CONTENT_Y + 94, 198, 30, C.panel);
    g.label('Recruitment cost', 14, CONTENT_Y + 97, 6.5, C.dim); g.label(`${fee} credits`, 14, CONTENT_Y + 106, 10, crOk ? C.gold : C.red, { display: true });
    g.label('Salary', 100, CONTENT_Y + 97, 6.5, C.dim); g.label(`${money(p.salary)} a year`, 100, CONTENT_Y + 106, 10, capOk ? C.ink : C.red, { display: true });
    const why = slot < 0 ? 'There is no place in the squad for that position' : !crOk ? `You have ${c.credits} credits: ${fee - c.credits} short` : !capOk ? `Over the cap: only ${money(Math.max(0, CAP - capUsed(t) + cur!.salary))} of room` : `Replaces ${cur!.name} (${ovr(cur!)}), who goes back on the market`;
    g.label(why, 74, CONTENT_Y + 129, 6.5, ok ? C.dim : C.red);
    if (button(game, g, 212, CONTENT_Y + 94, 100, 30, 'RECRUIT', { primary: ok, off: !ok, size: 13 }) && ok && sign(c, slot, p)) {
      saveGame(game); game.go(new MarketScene(game, `${p.name} has signed`)); return;
    }
    if (button(game, g, 8, 164, 60, 13, 'Back', { size: 7.5 })) game.go(new MarketScene(game));
  }
}
