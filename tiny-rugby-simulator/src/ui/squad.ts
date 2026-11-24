import { Gfx, W } from '../engine/gfx';
import type { Game, Scene } from '../engine/game';
import type { Attr, Player } from '../career/types';
import { ovr } from '../career/players';
import { CAP, TRAIN_COST, activeTeamId, candidates, canSign, capUsed, developmentCeiling, sign, train } from '../career/career';
import { C, button, drawFace, inRect, tc, type Rect } from './ui';
import { CONTENT_Y, chrome, saveGame } from './menus';

const POS: Record<string, string> = {
  PR: 'Prop', HK: 'Hooker', LK: 'Lock', FL: 'Flanker', N8: 'Number 8', HB: 'Halfback', FH: 'First five', WG: 'Wing', FB: 'Fullback', CE: 'Centre',
};
const col = (v: number) => (v >= 85 ? C.gold : v >= 70 ? C.ink : v >= 60 ? C.dim : C.red);

// Long international names keep their surname visible on the small mobile squad cards.
function fitPlayerName(g: Gfx, full: string, width: number, size: number, display = false): string {
  const opt = { bold: true, display };
  if (g.tw(full, size, opt) <= width) return full;
  const words = full.trim().split(/\s+/);
  const initial = (words[0]?.[0] ?? '').toUpperCase();
  for (let keep = Math.min(3, words.length - 1); keep >= 1; keep--) {
    const next = initial + '. ' + words.slice(-keep).join(' ');
    if (g.tw(next, size, opt) <= width) return next;
  }
  const last = words[words.length - 1] ?? full;
  let s = initial + '. ' + last;
  while (s.length > 4 && g.tw(s + '…', size, opt) > width) s = s.slice(0, -1);
  return s === initial + '. ' + last ? s : s + '…';
}


function fitness(g: Gfx, x: number, y: number, w: number, p: Player) {
  if (p.inj > 0) { g.label(`Injured, ${p.inj} wk`, x, y - 2.5, 6.5, C.red, { bold: true }); return; }
  g.card(x, y, w, 4, C.dark);
  g.card(x, y, Math.max(3, w * p.cond / 100), 4, p.cond < 60 ? C.red : p.cond < 80 ? C.gold : C.green);
}

// The career's home screen: ten players, each a face, a name, a position, a rating and how fit he is.
export class SquadScene implements Scene {
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 1)) return;
    const c = game.career!, id = activeTeamId(c) || c.teamId, t = c.teams[id], editable = id === c.teamId;
    t.roster.slice(0, 12).forEach((p, i) => {
      const r: Rect = [8 + (i % 2) * 154, CONTENT_Y + Math.floor(i / 2) * 22.5, 150, 21];
      const hot = game.ptr.down && inRect(game.ptr, r);
      g.card(r[0], r[1], r[2], r[3], hot ? C.panel2 : C.panel);
      drawFace(g, r[0] + 2, r[1] + 2, 17, p, t);
      // a featured player wears a gold flash; the rest are the squad you started with
      if (p.star) g.rect(r[0], r[1] + 1, 2, r[3] - 2, C.gold);
      g.label(fitPlayerName(g, p.name, 108, 8), r[0] + 24, r[1] + 1.5, 8, p.star ? C.ink : C.dim, { bold: true });
      g.label(POS[p.pos] ?? p.pos, r[0] + 24, r[1] + 11.5, 6, C.dim);
      fitness(g, r[0] + 70, r[1] + 14, 38, p);
      g.label(String(ovr(p)), r[0] + 146, r[1] + 3, 13, col(ovr(p)), { align: 2, display: true });
      if (game.tap && inRect(game.tap, r)) { game.tap = null; game.go(new PlayerScene(game, id, i)); }
    });
    void editable; void capUsed; void CAP; void W;
  }
}

// One player: who he is and what he is good at, with training on the same screen. Replacing him is
// a second view, so neither is cramped.
export class PlayerScene implements Scene {
  private market = false;
  constructor(private game: Game, private teamId: string, private slot: number) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 1)) return;
    const c = game.career!, t = c.teams[this.teamId], p = t.roster[this.slot];
    const editable = this.teamId === c.teamId && t.kind === 'club' && c.mode !== 'cup' && c.stage !== 'worldcup';
    drawFace(g, 8, CONTENT_Y, 40, p, t);
    g.label(fitPlayerName(g, p.name, 200, 13, true), 56, CONTENT_Y - 1, 13, C.ink, { display: true });
    g.label(`${POS[p.pos] ?? p.pos}   Age ${p.age}${t.kind === 'club' ? `   $${p.salary}k a year, ${p.years} to run` : ''}`, 56, CONTENT_Y + 16, 7.5, C.dim);
    g.label('Fitness', 56, CONTENT_Y + 28, 6.5, C.dim); fitness(g, 84, CONTENT_Y + 31, 60, p);
    g.card(262, CONTENT_Y, 50, 38, C.panel);
    g.label(String(ovr(p)), 287, CONTENT_Y + 2, 22, col(ovr(p)), { align: 1, display: true });
    g.label('Overall', 287, CONTENT_Y + 27, 6.5, C.dim, { align: 1 });
    const back = () => { if (this.market) this.market = false; else game.go(new SquadScene(game)); };

    if (this.market) {
      g.label(t.kind === 'club' ? `Replacements on the market.  Cap room $${CAP - capUsed(t)}k` : 'Others in the national pool', 8, CONTENT_Y + 46, 8.5, C.gold, { bold: true });
      const list = candidates(c, this.slot).slice(0, 4);
      if (!list.length) g.label('Nobody available right now', 8, CONTENT_Y + 64, 8, C.dim);
      list.forEach((m: Player, i) => {
        const y = CONTENT_Y + 60 + i * 17, ok = canSign(c, this.slot, m);
        g.card(8, y, 304, 15, C.panel);
        drawFace(g, 10, y + 1.5, 12, m, t);
        g.label(m.name, 28, y + 3.5, 8, C.ink, { bold: true });
        g.label(`Age ${m.age}`, 138, y + 4, 7, C.dim);
        g.label(String(ovr(m)), 186, y + 2, 10, col(ovr(m)), { align: 2, display: true });
        g.label(ovr(m) > ovr(p) ? `+${ovr(m) - ovr(p)}` : String(ovr(m) - ovr(p)), 192, y + 4, 7, ovr(m) > ovr(p) ? C.gold : C.dim);
        if (button(game, g, 236, y + 1.5, 74, 12, t.kind === 'club' ? `Sign for $${m.salary}k` : 'Select', { off: !ok, primary: ok, size: 7 })) { sign(c, this.slot, m); saveGame(game); this.market = false; }
      });
      if (button(game, g, 8, 160, 70, 16, 'Back', { size: 8 })) back();
      return;
    }

    const attrs: [Attr, string, string][] = [
      ['sta', 'Stamina', 'Endurance and sustained effort'], ['hnd', 'Handling', 'Catching and ball retention'],
      ['pas', 'Passing', 'Pass accuracy and distance'], ['kck', 'Kicking', 'Range and accuracy'], ['tkl', 'Tackling', 'Tackles and breakdown contests'],
    ];
    attrs.forEach(([a, label, what], i) => {
      const y = CONTENT_Y + 44 + i * 15.5, v = p[a];
      g.card(8, y, 304, 14, C.panel);
      g.label(label, 14, y + 1, 8, C.ink, { bold: true });
      g.label(what, 14, y + 8.2, 5.5, C.dim);
      g.card(104, y + 4, 110, 6, C.dark); g.card(104, y + 4, 110 * v / 100, 6, v >= 85 ? C.gold : v >= 70 ? C.green : v >= 60 ? C.blue : C.red);
      g.label(String(v), 234, y + 2, 10, col(v), { align: 2, display: true });
      const canLevel = v < 99 && ovr(p) < developmentCeiling(c, p);
      if (editable && button(game, g, 244, y + 1.5, 64, 11, !canLevel ? 'Potential' : (p.points ?? 0) > 0 ? '+1: XP point' : `+1: ${TRAIN_COST} cr`, { off: !canLevel || ((p.points ?? 0) < 1 && c.credits < TRAIN_COST), primary: true, size: 7.5 })) { if (train(c, this.slot, a)) saveGame(game); }
    });
    if (button(game, g, 8, 160, 70, 16, 'Back', { size: 8 })) { back(); return; }
    if (editable) {
      g.label(`${c.credits} credit${c.credits === 1 ? '' : 's'} to spend`, 150, 164, 7.5, C.dim, { align: 1 });
      if (button(game, g, 222, 160, 90, 16, 'Replace him', { size: 8 })) this.market = true;
    }
  }
}
