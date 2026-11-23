import { Gfx, H } from '../engine/gfx';
import type { Game, PEv, Scene } from '../engine/game';
import { Rng, clamp } from '../engine/rng';
import type { Formation } from '../config';
import { MAX_KICKS, MAX_PASSES, MAX_PLAYS, MAX_TURNS, OFF_MARK, PREMIUM_PRICE, copyPlay, defaultSpots, getPlays, isPremium, putPlays, spotsFor } from '../plays';
import { FW } from '../match/attack';
import { newCareer, activeTeamId, userFixture } from '../career/career';
import { sideFromTeam } from '../match/side';
import { AttackPlay, MID } from '../match/attack';
import { C, PITCH, button, drawFace, drawMatchBall, drawPlayer, inRect, type Rect } from './ui';
import { MatchScene } from './matchscene';

// The Training Ground: a coaching board. Five plays, Play 1 to Play 5. Drag a player to where he starts;
// tap him and drag on the field to draw his run; the panel beside the field says what he does in the play.
// Nothing needs saving: every change is kept as it is made.
//
// The board shows the patch of field around the ball: 20 m behind it to 14 m ahead, the full width across.
const BX = 4, BY = 22, BW = 228, BH = 132, X0 = -17, X1 = 17, YR = 25;
const PX = BW / (X1 - X0), PY = BH / (YR * 2);
let OY = YR; // how far in from the top touchline the ball starts: halfway at a scrum, ten metres at a lineout
let XS = 0;  // the board looks a little further upfield at a lineout, where their line stands deeper
const sx = (x: number) => BX + (x - X0 - XS) * PX, sy = (y: number) => BY + (y + OY) * PY;
const K = 0.55; // how big the players are drawn on the board
const RECV = '#F4BE46', DUMMY = '#FFFFFF'; // a man who can be passed to runs a yellow line, a decoy a white one

// Where a defensive formation is being edited (the developer portal does this), marks are ahead of the ball.
export interface TrainingOpts { side?: 'attack' | 'defence'; edit?: Formation; onSave?(f: Formation): void; title?: string }

// One moment of the play, run forward in the real engine: where everybody is, and where the ball is.
interface Snap { a: { x: number; y: number }[]; d: { x: number; y: number; dn: boolean }[]; b: { x: number; y: number; z: number; held: boolean }; c: number }
const SX0 = 35, SLIDER: Rect = [BX, 158, BW, 19], FPS = 30, MAX_T = 60; // a play is run until it is tackled, scores or goes out; a minute is only a backstop

export class TrainingScene implements Scene {
  private frames: Snap[] = [];        // the play, a thirtieth of a second at a time
  private marks = new Map<number, number>(); // mark -> which man of the snapshot stands on it
  private at = 0;                     // the frame the slider is on; 0 is the start, where the play is drawn
  private scrub = -1;                 // the finger on the slider
  private endNote = '';
  private mode: '' | 'pass' | 'kick' = ''; // an action being placed on the timeline: who to pass to, or where to kick

  private get lineout() { return this.f.from === 'lineout'; }
  private ox = SX0;                  // where the ball starts, along the field
  private names: { name: string; pos: string; id: number; skin: number }[] = [];
  private tap0: { x: number; y: number } | null = null; // a finger down on a man mid-play: a tap chooses him, a pull draws his new run
  private turning: { t: number; to: number; x: number; y: number } | null = null; // the change of direction being pulled out
  // A real scrum in the middle of the field, or a real lineout on the top touchline: forwards and all.
  private cfg() { return this.def ? { x: SX0, y: MID, kind: 'scrum' as const } : this.lineout ? { x: SX0, y: 0, kind: 'lineout' as const, set: true, edge: 0 } : { x: SX0, y: MID, kind: 'scrum' as const, set: true }; }
  private get lowY() { return 1 - OY; }
  private get highY() { return FW - 1 - OY; }
  private fresh(name: string, from?: 'scrum' | 'lineout'): Formation {
    return { name, side: 'attack', from: from === 'lineout' ? 'lineout' : undefined, spots: spotsFor(from), passes: [{ t: 0.3, to: from === 'lineout' ? 1 : 2 }] };
  }
  private get need() { return this.lineout ? 5 : 6; } // how many backs there are to place
  private slot = 0;
  private own: (Formation | null)[];
  private f!: Formation;
  private sel = -1;
  private drag: { id: number; kind: 'move' | 'route'; moved: boolean } | null = null;
  private premium: boolean;
  private def: boolean;

  constructor(private game: Game, private back: () => Scene, private opts: TrainingOpts = {}) {
    this.own = getPlays(game);
    this.premium = isPremium(game.store);
    this.def = opts.side === 'defence';
    if (opts.edit) { this.f = copyPlay(opts.edit); this.simulate(); } else this.pick(0);
  }

  private get locked() { return !this.opts.edit && this.slot > 0 && !this.premium; }

  private sides() {
    const game = this.game, c = game.career ?? newCareer(2026, 'AKL');
    const id = activeTeamId(c) || c.teamId, fx = game.career ? userFixture(c) : null;
    const opp = fx ? (fx.h === id ? fx.a : fx.h) : Object.keys(c.teams).find(k => k !== id && c.teams[k].kind === c.teams[id].kind)!;
    return { us: sideFromTeam(c.teams[id]), them: sideFromTeam(c.teams[opp]) };
  }

  private pick(slot: number) {
    this.slot = slot; this.sel = -1; this.drag = null; this.mode = '';
    this.f = this.own[slot] ? copyPlay(this.own[slot]!) : this.fresh(`Play ${slot + 1}`);
    // a play drawn before set plays were for the backs alone has too many marks: it starts again from the standard shape
    if (!this.def && this.f.spots.length !== this.need) this.f = this.fresh(this.f.name, this.f.from);
    this.at = 0; this.simulate();
  }

  // Runs the play as drawn against their defence in the real match engine and keeps every frame, so the
  // slider can show what each change does to the men in front of it. Same seed every time: only the
  // play changes the picture.
  private simulate() {
    const { us, them } = this.sides();
    const p = new AttackPlay(us.runners, them.tacklers, this.cfg(), new Rng(11));
    p.releaseSet(); // the ball is won and at the halfback's feet: this is where a set play starts
    this.ox = p.att[p.carrier].x; OY = p.att[p.carrier].y; XS = this.lineout && !this.def ? 5 : 0;
    this.names = p.att.map(m => ({ name: m.name, pos: m.pos, id: m.id, skin: m.skin }));
    p.noFumble = true; // the board shows the play as it was drawn
    if (this.def) p.setDefence(this.f); else p.usePlay(this.f, true);
    this.marks = new Map(p.markOf);
    p.run();
    this.frames = []; this.endNote = '';
    for (let n = 0; n <= MAX_T * FPS; n++) {
      this.frames.push({ a: p.att.map(m => ({ x: m.x, y: m.y })), d: p.def.map(d => ({ x: d.x, y: d.y, dn: d.st === 'miss' })), b: { x: p.ball.x, y: p.ball.y, z: p.ball.z, held: p.ball.mode === 'held' }, c: p.carrier });
      if (p.state !== 'live') { this.endNote = p.state === 'score' ? 'Try!' : p.state === 'done' ? 'Ball lost' : 'Tackled'; break; }
      p.step(1 / FPS);
    }
    this.at = Math.min(this.at, this.frames.length - 1);
  }

  private get snap() { return this.frames[this.at]; }
  private get time() { return this.at / FPS; }
  // the board follows the ball once it has gone past the gain line
  private get slide() { return this.at > 0 ? Math.max(0, this.snap.b.x - this.ox - 6) : 0; }
  private tx(x: number) { return BX + (x - this.ox - XS - this.slide - X0) * PX; }
  private ty(y: number) { return BY + y * PY; }
  // which man of the snapshot a selection or an action means: the one on that mark, or (forwards, halfback) the man himself
  private man(to: number) { return to >= OFF_MARK ? to - OFF_MARK : to === -2 ? this.frames[0]?.c ?? -1 : this.marks.get(to) ?? -1; }
  private setTime(e: { x: number }) { if (this.at === 0) this.sel = -1;
    this.at = Math.round(clamp((e.x - SLIDER[0] - 6) / (SLIDER[2] - 12), 0, 1) * (this.frames.length - 1));
    if (this.at === 0 && this.sel >= OFF_MARK) this.sel = -1; // forwards and the halfback are only given things to do once play is on
  }

  // Kept the moment it changes: in the career's save, or wherever the caller wants a formation put.
  private keep() {
    if (this.locked) return;
    this.simulate();
    if (this.opts.onSave) { this.opts.onSave(copyPlay(this.f)); return; }
    this.own[this.slot] = copyPlay(this.f);
    putPlays(this.game, this.own);
  }

  // Who would stand on this mark: marks are handed out top to bottom, the same way the match does it.
  private who(i: number) {
    return this.names[this.man(i)] ?? { name: `Player ${i + 1}`, pos: '', id: 1, skin: 1 };
  }

  update() { /* nothing moves on the board */ }

  private hit(e: { x: number; y: number }) {
    let best = -1, bd = 8;
    if (this.at > 0) {
      // part-way through: the men are where the play has taken them
      // anybody of ours can be chosen: a back by his mark, a forward or the halfback as himself
      const byMan = new Map([...this.marks].map(([mark, man]) => [man, mark]));
      this.snap.a.forEach((m, n) => { const d = Math.hypot(this.tx(m.x) - e.x, this.ty(m.y) - 4 - e.y); if (d < bd) { bd = d; best = byMan.get(n) ?? OFF_MARK + n; } });
      return best;
    }
    this.f.spots.forEach((s, i) => { const d = Math.hypot(sx(s.x) - e.x, sy(s.y) - 4 - e.y); if (d < bd) { bd = d; best = i; } });
    const st = this.f.start ?? { x: 0, y: 0 };
    if (!this.def && Math.hypot(sx(st.x) - e.x, sy(st.y) - 4 - e.y) < bd) best = -2; // the man with the ball
    return best;
  }

  onEv(e: PEv) {
    if (this.locked) return;
    const board: Rect = [BX, BY, BW, BH];
    // the time slider
    if (e.t === 'down' && inRect(e, SLIDER)) { this.scrub = e.id; this.drag = null; this.setTime(e); return; }
    if (e.id === this.scrub) { this.setTime(e); if (e.t === 'up') this.scrub = -1; return; }
    if (e.t === 'down') {
      if (!inRect(e, board)) return;
      const h = this.hit(e);
      // away from the start the board is for looking and for choosing who gets a pass; marks and runs are set at the start
      if (this.at > 0) {
        if (this.def) return;
        if (this.mode === 'kick') {
          // where the finger is, in metres from where the ball started
          const k = { t: Math.round(this.time * 10) / 10, x: X0 + XS + (e.x - BX) / PX + this.slide, y: (e.y - BY) / PY - OY };
          this.f.kicks = [...(this.f.kicks ?? []).filter(q => Math.abs(q.t - k.t) > 0.15), k].sort((p, q) => p.t - q.t).slice(0, MAX_KICKS);
          this.mode = ''; this.keep(); return;
        }
        if (this.mode === 'pass') { if (h >= 0) { this.addPass(h); this.mode = ''; } return; }
        // with a man chosen, a touch on open field is where he runs to from this moment on
        // and it is drawn the way a run is: pull the arrow out to where he should go
        if (h === -1 && this.sel >= 0) { this.drag = { id: e.id, kind: 'route', moved: true }; this.startTurn(e); return; }
        // a finger on a man chooses him, and pulling away from him draws his new run from this moment
        this.sel = h;
        if (h !== -1) { this.tap0 = { x: e.x, y: e.y }; this.drag = { id: e.id, kind: 'route', moved: false }; }
        return;
      }
      if (h !== -1) { this.sel = h; this.drag = { id: e.id, kind: 'move', moved: false }; }
      else if (this.sel >= 0 && this.sel < OFF_MARK && !this.def) { this.drag = { id: e.id, kind: 'route', moved: true }; this.route(e); }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.id) return;
    if (this.tap0) {
      if (Math.hypot(e.x - this.tap0.x, e.y - this.tap0.y) > 5 && this.at > 0 && this.sel !== -1) { this.tap0 = null; this.startTurn(e); }
      else if (e.t === 'up') { this.tap0 = null; this.drag = null; }
      return;
    }
    if (this.turning) { this.aimTurn(e); if (e.t === 'up') { this.turning = null; this.drag = null; this.keep(); } return; }
    const s = this.sel === -2 ? (this.f.start ??= { x: 0, y: 0 }) : this.f.spots[this.sel];
    if (!s) { this.drag = null; return; } // he was deselected with a finger still down
    if (d.kind === 'move') {
      const wx = X0 + XS + (e.x - BX) / PX, wy = (e.y + 4 - BY) / PY - OY;
      if (d.moved || Math.hypot(sx(s.x) - e.x, sy(s.y) - 4 - e.y) > 4) {
        d.moved = true;
        // attackers start behind the ball, defenders in front of it
        s.x = this.def ? clamp(wx, 1.5, X1 - 1) : clamp(wx, X0 + XS + 1, this.sel === -2 ? 0 : -1); s.y = clamp(wy, this.lowY, this.highY);
      }
    } else this.route(e);
    if (e.t === 'up') { this.drag = null; if (d.moved) this.keep(); }
  }

  // A new run for the chosen man from the slider's moment, replacing whatever he was doing: any run he was
  // given at this same moment goes, and the arrow follows the finger.
  private startTurn(e: { x: number; y: number }) {
    const k = { t: Math.round(this.time * 10) / 10, to: this.sel, x: 0, y: 0 };
    this.f.turns = [...(this.f.turns ?? []).filter(q => !(q.to === k.to && Math.abs(q.t - k.t) < 0.15)), k].sort((p, q) => p.t - q.t).slice(-MAX_TURNS);
    this.turning = k; this.aimTurn(e);
  }

  private aimTurn(e: { x: number; y: number }) {
    const k = this.turning!;
    k.x = X0 + XS + (e.x - BX) / PX + this.slide; k.y = clamp((e.y - BY) / PY - OY, this.lowY, this.highY);
  }

  // A dotted line with an arrowhead, the same for a run and for a change of direction.
  private arrow(g: Gfx, x0: number, y0: number, x1: number, y1: number, col: string, w = 2) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) return;
    const n = Math.max(3, Math.round(len / 5)), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let k = 1; k < n; k++) g.rect(x0 + (x1 - x0) * k / n - w / 2, y0 + (y1 - y0) * k / n - w / 2, w, w, col);
    for (let k = 0; k < 3; k++) { const hw = 0.8 + k * 0.9; g.rect(x1 - ux * k * 1.8 - hw, y1 - uy * k * 1.8 - hw, hw * 2, hw * 2, col); }
  }

  // The chosen player, unmistakably: his face in an orange box at the top of the panel.
  private chosen(g: Gfx, x: number, w: number, who: { name: string; pos: string; id: number; skin: number }, line: string) {
    g.card(x, 22, w, 28, C.red); g.frame(x, 22, w, 28, C.ink);
    drawFace(g, x + 3, 25, 22, who, { c1: '#2b59c3', c2: C.ink });
    const sp = who.name.indexOf(' ');
    g.label(sp > 0 ? who.name.slice(sp + 1) : who.name, x + 28, 25, 7.5, C.dark, { bold: true });
    g.label(who.pos, x + 28, 34, 6, C.dark);
    g.label(line, x + 28, 41.5, 5.5, C.dark, { bold: true });
  }

  private addPass(to: number) {
    const f = this.f, sp = f.spots[to];
    if ((!sp && to < OFF_MARK) || this.snap.c === this.man(to)) return;
    f.passes = [...(f.passes ?? []).filter(p => Math.abs(p.t - this.time) > 0.15), { t: Math.round(this.time * 10) / 10, to }].sort((p, q) => p.t - q.t).slice(0, MAX_PASSES);
    this.keep();
  }

  // The arrow's end is wherever the finger is. It can go right across the field.
  private route(e: { x: number; y: number }) {
    const s = this.f.spots[this.sel];
    const wx = clamp(X0 + XS + (e.x - BX) / PX, X0 + XS + 0.5, X1 + XS + 12), wy = clamp((e.y - BY) / PY - OY, this.lowY, this.highY);
    s.path = Math.hypot(wx - s.x, wy - s.y) < 1.5 ? undefined : [{ x: wx - s.x, y: wy - s.y }];
  }

  // Train play: the real match engine, their real defence, a countdown, and then it all happens at once.
  private train() {
    const game = this.game, { us, them } = this.sides();
    const play = copyPlay(this.f), def = this.def;
    game.go(new MatchScene(game, us, them, false, (Date.now() & 0xffff) + 7, () => {}, {
      title: this.opts.title ?? play.name, report: true, countdown: true,
      start: m => { m.startPlay(this.cfg()); m.play!.releaseSet(); m.play!.usePlay(def ? null : play, true); if (def) m.play!.setDefence(play); },
      onExit: () => game.go(this),
    }));
  }

  // The play at the slider's moment: everybody where the engine put them, and the ball.
  private drawSnap(g: Gfx, us: { c1: string; c2: string }, th: { c1: string; c2: string }) {
    const sn = this.snap, inside = (x: number, y: number) => x > BX + 3 && x < BX + BW - 3 && y > BY + 3 && y < BY + BH + 2;
    const selMan = this.man(this.sel), anim = this.at * 0.3;
    // Only the run each man is on right now: his first one until a new one has been given, then the newest.
    sn.a.forEach((m, n) => {
      const mark = [...this.marks].find(([, man]) => man === n)?.[0], to = mark ?? OFF_MARK + n;
      const turn = (this.f.turns ?? []).filter(k => k.to === to && k.t <= Math.round(this.time * 10) / 10 + 0.001).pop();
      const sp = mark !== undefined ? this.f.spots[mark] : undefined, first = sp?.path?.[0];
      const end = turn ? { x: this.ox + turn.x, y: OY + turn.y } : first && sp ? { x: this.ox + sp.x + first.x, y: OY + sp.y + first.y } : null;
      if (!end || Math.hypot(end.x - m.x, end.y - m.y) < 1.2 || (!turn && m.x > end.x)) return; // nothing to run, or he has run it
      const inX = (v: number) => clamp(v, BX + 3, BX + BW - 3), inY = (v: number) => clamp(v, BY + 3, BY + BH - 3);
      const col = mark === undefined || this.f.spots[mark]?.recv !== false ? RECV : DUMMY;
      this.arrow(g, inX(this.tx(m.x)), inY(this.ty(m.y) - 4), inX(this.tx(end.x)), inY(this.ty(end.y) - 4), col, n === selMan ? 3 : 2);
    });
    sn.d.forEach((d, i) => { const x = this.tx(d.x), y = this.ty(d.y); if (inside(x, y)) drawPlayer(g, x, y, th, i, d.dn ? 'lie' : 'run', anim + i, -1, K); });
    sn.a.map((m, i) => ({ m, i })).sort((p, q) => p.m.y - q.m.y).forEach(({ m, i }) => {
      const x = this.tx(m.x), y = this.ty(m.y);
      if (!inside(x, y)) return;
      if (i === selMan) { g.rect(x - 6, y - 1, 12, 4, C.gold, 0.4); g.frame(x - 6, y - 10, 12, 13, C.gold); }
      drawPlayer(g, x, y, us, i, 'run', anim + i, 1, K);
      if (i === sn.c && sn.b.held) g.rect(x - 2, y - 13, 5, 1, C.gold), g.rect(x - 1, y - 12, 3, 1, C.gold), g.rect(x, y - 11, 1, 1, C.gold);
    });
    const bx = this.tx(sn.b.x), by = this.ty(sn.b.y);
    if (inside(bx, by)) drawMatchBall(g, bx + (sn.b.held ? 4 : 0), by - 3 - sn.b.z * 2);
    if (this.at === this.frames.length - 1 && this.endNote) { g.card(BX + BW / 2 - 34, BY + 12, 68, 13, C.dark, 0.85); g.label(this.endNote, BX + BW / 2, BY + 15, 8, C.gold, { align: 1, bold: true }); }
  }

  private star(g: Gfx, x: number, y: number, col: string = C.gold) { g.rect(x - 2, y, 5, 1, col); g.rect(x, y - 2, 1, 5, col); g.rect(x - 1, y - 1, 3, 3, col); }

  draw(g: Gfx) {
    const game = this.game, f = this.f, def = this.def;
    g.rect(g.left, 0, g.vw, H, C.bg);
    g.rect(g.left, 0, g.vw, 19, C.dark);
    if (button(game, g, 4, 3, 30, 13, 'Back', { size: 7 })) { game.go(this.back()); return; }
    if (this.opts.edit) g.label(this.opts.title ?? 'Training Ground', 42, 3.5, 11, C.gold, { display: true });
    else for (let i = 0; i < MAX_PLAYS; i++) {
      // the five plays, across the top
      const on = this.slot === i, shut = i > 0 && !this.premium;
      if (button(game, g, 42 + i * 55, 3, 52, 13, shut ? `Play ${i + 1} (locked)` : `Play ${i + 1}`, { col: on ? C.gold : this.own[i] ? C.panel2 : C.panel, primary: on, size: shut ? 6 : 7.5 }) && !on) this.pick(i);
    }

    // the board
    for (let i = 0; i < 4; i++) g.rect(BX + i * BW / 4, BY, BW / 4 + 1, BH, i % 2 ? PITCH.b : PITCH.a);
    g.frame(BX, BY, BW, BH, C.ink);
    const gx = this.tx(this.ox);
    if (gx > BX + 2) { for (let y = BY; y < BY + BH; y += 7) g.rect(gx, y, 1, 4, C.ink, 0.7); g.label('Gain line', gx + 3, BY + 2, 6, C.ink, { a: 0.7 }); } // level with where the ball started
    g.label('Their line this way', BX + BW - 4, BY + BH - 9, 6, C.ink, { align: 2, a: 0.6 });
    const us = { c1: '#2b59c3', c2: C.ink }, th = { c1: C.ink, c2: C.red };
    for (const k of f.kicks ?? []) { const x = this.tx(this.ox + k.x), y = this.ty(OY + k.y); if (x > BX + 4 && x < BX + BW - 4 && y > BY + 4 && y < BY + BH - 4) { for (let d = -3; d <= 3; d++) { g.rect(x + d, y + d, 1, 1, DUMMY); g.rect(x + d, y - d, 1, 1, DUMMY); } g.label(`Kick ${k.t.toFixed(1)}s`, x, y + 5, 5, DUMMY, { align: 1 }); } }
    const st = f.start ?? { x: 0, y: 0 };
    if (this.at > 0) this.drawSnap(g, us, th); else {
    if (!def) this.frames[0]?.d.forEach((d, n) => { const x = this.tx(d.x), y = this.ty(d.y); if (x < BX + BW - 3 && y > BY + 3) drawPlayer(g, x, y, th, n, 'stand', 0, -1, K); });
    else for (const s of defaultSpots()) drawPlayer(g, sx(s.x), sy(s.y), us, 1, 'stand', 0, 1, K);
    // the halfback at the ball; he has it unless the play starts with somebody else
    if (!def) { const placed = new Set(this.marks.values()), f0 = this.frames[0]; f0?.a.forEach((m, n) => { if (n !== f0.c && !placed.has(n)) drawPlayer(g, this.tx(m.x), this.ty(m.y), us, n, 'stand', 0, 1, K); }); }
    if (this.sel === -2) { g.rect(sx(st.x) - 6, sy(st.y) - 1, 12, 4, C.gold, 0.4); g.frame(sx(st.x) - 6, sy(st.y) - 10, 12, 13, C.gold); }
    drawPlayer(g, sx(st.x), sy(st.y), us, 2, 'stand', 0, 1, K);
    if (def || f.ball === undefined) drawMatchBall(g, sx(st.x) + 4, sy(st.y) - 3);
    // running lines first, players on top
    f.spots.forEach((s, i) => {
      const p = s.path?.[0];
      if (!p || def) return;
      this.arrow(g, sx(s.x), sy(s.y) - 4, sx(s.x + p.x), sy(s.y + p.y) - 4, s.recv === false ? DUMMY : RECV, i === this.sel ? 3 : 2); // all eligible receivers are yellow, deliberate decoys white
    });
    [...f.spots.keys()].sort((a, b) => f.spots[a].y - f.spots[b].y).forEach(i => {
      const s = f.spots[i], px = sx(s.x), py = sy(s.y);
      if (i === this.sel) { g.rect(px - 6, py - 1, 12, 4, C.gold, 0.4); g.frame(px - 6, py - 10, 12, 13, C.gold); }
      drawPlayer(g, px, py, def ? th : us, i, 'stand', 0, def ? -1 : 1, K);
      if (def) return;
      if (f.primary === i) this.star(g, px, py - 13);
      if (f.ball === i) { drawMatchBall(g, px + 4, py - 3); g.card(px - 8, py + 3, 16, 6, C.dark, 0.85); g.label('BALL', px, py + 3.5, 4.5, C.gold, { align: 1, bold: true }); }
    });

    }

    // beside the field: the selected player, or how the board works
    const px = 238, pw = 78, s = this.sel >= 0 && this.sel < OFF_MARK ? f.spots[this.sel] : null, chosenNow = !!s || this.sel >= OFF_MARK;
    const passes = f.passes ?? [];
    if (this.locked) { /* the sign on the door is drawn below */ }
    else if (!def && this.at > 0 && !chosenNow) {
      // part-way through the play: put a pass or a kick in at this moment
      g.label(`At ${this.time.toFixed(1)} seconds`, px, 23, 9, C.gold, { bold: true });
      const held = this.snap.b.held;
      if (button(game, g, px, 36, 38, 18, 'Pass', { col: this.mode === 'pass' ? C.gold : C.panel2, primary: this.mode === 'pass', off: !held || passes.length >= MAX_PASSES, size: 8 })) this.mode = this.mode === 'pass' ? '' : 'pass';
      if (button(game, g, px + 40, 36, 38, 18, 'Kick', { col: this.mode === 'kick' ? C.gold : C.panel2, primary: this.mode === 'kick', off: !held, size: 8 })) this.mode = this.mode === 'kick' ? '' : 'kick';
      g.label(this.mode === 'pass' ? 'Now tap who gets it' : this.mode === 'kick' ? 'Now tap where it goes' : held ? 'Add one here, or slide on' : 'The ball is in the air here', px, 58, 6, this.mode ? C.gold : C.dim, { bold: !!this.mode });
      // what the play does, in order
      const acts = [...passes.map(p => ({ t: p.t, label: `pass to ${this.who(p.to).pos || 'him'}`, drop: () => { f.passes = passes.filter(q => q !== p); if (!f.passes.length) f.passes = undefined; } })),
        ...(f.turns ?? []).map(k => ({ t: k.t, label: `${this.who(k.to).pos || 'man'} new run`, drop: () => { f.turns = (f.turns ?? []).filter(q => q !== k); if (!f.turns.length) f.turns = undefined; } })),
        ...(f.kicks ?? []).map(k => ({ t: k.t, label: 'kick', drop: () => { f.kicks = (f.kicks ?? []).filter(q => q !== k); if (!f.kicks.length) f.kicks = undefined; } }))].sort((p, q) => p.t - q.t);
      acts.slice(0, 7).forEach((a, i) => {
        const y = 70 + i * 12;
        g.label(`${a.t.toFixed(1)}s`, px, y + 2, 6.5, C.gold, { bold: true }); g.label(a.label, px + 18, y + 2, 6.5, C.ink);
        if (button(game, g, px + 64, y, 14, 10, 'x', { size: 6 })) { a.drop(); this.keep(); }
      });
      if (!acts.length) g.label('Nothing yet: he just runs', px, 72, 6, C.dim);
    }
    else if (this.sel === -2 && !def && this.at === 0) {
      this.chosen(g, px, pw, this.who(-2), 'Starts with the ball');
      g.label('Drag him to where he starts.', px, 55, 6, C.ink);
      if (button(game, g, px, 66, pw, 15, 'Back to the mark', { off: !f.start, size: 7 })) { f.start = undefined; this.keep(); }
      if (button(game, g, px, 85, pw, 12, 'Done', { size: 6.5 })) this.sel = -1;
    }
    else if (chosenNow && !def && this.at > 0) {
      // part-way through the play: this is where a pass to him is put in
      const w = this.who(this.sel), has = this.snap.c === this.man(this.sel), mine = passes.filter(p => p.to === this.sel);
      this.chosen(g, px, pw, w, `At ${this.time.toFixed(1)} seconds`);
      const myTurns = (f.turns ?? []).filter(k => k.to === this.sel);
      const why = has ? 'He has the ball here' : passes.length >= MAX_PASSES ? 'That is all the passes' : '';
      if (button(game, g, px, 53, pw, 17, 'Pass to him here', { primary: !why, off: !!why, size: 7.5 }) && !why) this.addPass(this.sel);
      if (why) g.label(why, px, 72, 5.5, C.dim);
      mine.forEach((p, i) => { if (button(game, g, px, 80 + i * 15, pw, 13, `Remove pass at ${p.t.toFixed(1)} s`, { size: 6 })) { f.passes = passes.filter(q => q !== p); if (!f.passes.length) f.passes = undefined; this.keep(); } });
      myTurns.slice(0, 3).forEach((k, i) => { if (button(game, g, px, 80 + (mine.length + i) * 15, pw, 13, `Remove new run at ${k.t.toFixed(1)} s`, { size: 6 })) { f.turns = (f.turns ?? []).filter(q => q !== k); if (!f.turns.length) f.turns = undefined; this.keep(); } });
      g.label('Drag on the field to draw', px, 128, 5.5, C.gold, { bold: true }); g.label('his run from this moment', px, 135, 5.5, C.gold, { bold: true });
      if (button(game, g, px, 143, pw, 12, 'Done', { size: 6.5 })) this.sel = -1;
    }
    else if (s && !def) {
      const w = this.who(this.sel), receiving = s.recv !== false;
      this.chosen(g, px, pw, w, s.path ? 'Run drawn' : 'No run yet');
      g.label(s.path ? 'Drag to redraw the run' : 'Drag to draw his run', px, 54, 6, C.ink);
      if (button(game, g, px, 64, pw, 15, receiving ? 'Receiver: on' : 'Dummy runner', { primary: receiving, size: 7 })) {
        s.recv = receiving ? false : undefined;
        if (!s.recv && f.primary === this.sel) f.primary = undefined;
        this.keep();
      }
      if (button(game, g, px, 81, pw, 15, f.primary === this.sel ? 'Main receiver *' : 'Main receiver', { primary: f.primary === this.sel, off: s.recv === false, size: 7 })) { f.primary = f.primary === this.sel ? undefined : this.sel; this.keep(); }
      if (button(game, g, px, 98, pw, 15, f.ball === this.sel ? 'Starts with ball *' : 'Starts with ball', { primary: f.ball === this.sel, size: 6.5 })) { f.ball = f.ball === this.sel ? undefined : this.sel; this.keep(); }
      if (button(game, g, px, 115, pw, 15, 'Clear run', { off: !s.path, size: 7 })) { s.path = undefined; this.keep(); }
      if (button(game, g, px, 132, pw, 12, 'Done', { size: 6.5 })) this.sel = -1;
    } else {
      g.label(def ? 'Defence' : f.name, px, 23, 9, C.gold, { bold: true });
      const lines = def ? ['Drag defenders', 'into position.'] : ['Place the backs: tap one,', 'drag him to move him, drag', 'on the field for his run.'];
      lines.forEach((t, i) => g.label(t, px, 35 + i * 8, 6.5, C.ink));
      // which set piece the play is for
      if (!def && !this.opts.edit) {
        g.label('Starts from', px, 62, 6, C.dim);
        if (button(game, g, px, 70, 38, 14, 'Scrum', { col: !this.lineout ? C.gold : C.panel2, primary: !this.lineout, size: 7 }) && this.lineout) { this.f = this.fresh(f.name); this.sel = -1; this.keep(); }
        if (button(game, g, px + 40, 70, 38, 14, 'Lineout', { col: this.lineout ? C.gold : C.panel2, primary: this.lineout, size: 7 }) && !this.lineout) { this.f = this.fresh(f.name, 'lineout'); this.sel = -1; this.keep(); }
      }
      if (!def) {
        g.rect(px, 92, 12, 2, RECV); g.label('Receiver', px + 16, 89, 6, C.dim);
        g.rect(px, 102, 12, 2, DUMMY); g.label('Dummy runner', px + 16, 99, 6, C.dim);
        if (passes.length + (f.kicks?.length ?? 0) + (f.turns?.length ?? 0)) { if (button(game, g, px, 120, pw, 13, `Clear passes, kicks, runs`, { size: 6 })) { f.passes = f.kicks = f.turns = undefined; this.keep(); } }
        else g.label('Slide the time to add passes', px, 122, 5.5, C.dim);
      }
      if (button(game, g, px, 137, pw, 14, 'Reset shape', { size: 7 })) {
        this.f = def && this.opts.edit ? copyPlay(this.opts.edit) : this.fresh(f.name, f.from);
        this.sel = -1; this.keep();
      }
    }
    // along the bottom
    if (!this.locked) {
      // the time slider: drag it to run the play forward and back; the marks on it are the passes
      const [x0, y0, w0, h0] = SLIDER, n = Math.max(1, this.frames.length - 1), at = (fr: number) => x0 + 6 + (w0 - 12) * fr / n;
      g.card(x0, y0, w0, h0, C.dark);
      g.rect(x0 + 6, y0 + 12, w0 - 12, 2, C.panel2);
      const every = n > 20 * FPS ? 5 : n > 9 * FPS ? 2 : 1; // a long play has fewer numbers on its slider, not smaller ones
      for (let sec = 0; sec * FPS <= n; sec++) { g.rect(at(sec * FPS), y0 + (sec % every ? 12 : 10), 1, sec % every ? 3 : 6, C.dim); if (sec % every === 0) g.label(String(sec), at(sec * FPS) + 2, y0 + 1.5, 5, C.dim); }
      for (const k of f.turns ?? []) if (k.t * FPS <= n) g.rect(at(k.t * FPS), y0 + 13, 1, 5, C.ink);
      for (const k of f.kicks ?? []) if (k.t * FPS <= n) { const x = at(k.t * FPS); g.rect(x - 1, y0 + 8, 3, 9, DUMMY); g.rect(x - 2, y0 + 10, 5, 5, DUMMY); }
      for (const p of passes) if (p.t * FPS <= n) { const x = at(p.t * FPS); g.rect(x - 1, y0 + 8, 3, 9, RECV); g.rect(x - 2, y0 + 10, 5, 5, RECV); }
      g.card(at(this.at) - 3, y0 + 6, 7, 12, C.gold); g.rect(at(this.at), y0 + 8, 1, 8, C.dark);
      g.label(this.at === 0 ? 'Drag' : `${this.time.toFixed(1)} s${this.at === this.frames.length - 1 && this.endNote ? ' · ' + this.endNote : ''}`, x0 + w0 - 4, y0 + 1.5, 5.5, this.at ? C.gold : C.dim, { align: 2, bold: this.at > 0 });
      if (button(game, g, 238, 158, 78, 19, 'TRAIN PLAY', { primary: true, size: 9 })) { this.train(); return; }
    }

    if (this.locked) {
      // plays 2 to 5 are the paid part; nothing is sold yet, so this is just the sign on the door
      g.card(BX + 24, BY + 30, BW - 48, 74, C.dark, 0.93); g.rect(BX + 25, BY + 30, BW - 50, 2, C.gold);
      g.label('Set Play Creator', BX + BW / 2, BY + 37, 13, C.gold, { align: 1, display: true });
      g.label('Four more plays of your own to call in matches.', BX + BW / 2, BY + 57, 7, C.ink, { align: 1 });
      g.label(`A one-time unlock, ${PREMIUM_PRICE}. Not on sale yet.`, BX + BW / 2, BY + 69, 7, C.dim, { align: 1 });
      g.label('Play 1 is free to draw, train and use.', BX + BW / 2, BY + 85, 7, C.dim, { align: 1 });
    }
  }
}
