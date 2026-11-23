import { Gfx, W, H } from '../engine/gfx';
import type { Game, PEv, Scene } from '../engine/game';
import { Rng, clamp } from '../engine/rng';
import { sfx } from '../engine/audio';
import { T, type Formation } from '../config';
import { bookOf } from '../plays';
import { AttackPlay, FL, FW, IG, MID, POST, type Aim } from '../match/attack';
import { LO_FLY, LO_NAMES, LO_OVER, LO_TAP, LO_ZONES, Match, RUCK_INTRO, type Side } from '../match/match';
import { where } from '../match/oppsim';
import type { MatchResult } from '../career/types';
import { C, PITCH, button, colourDist, drawAirborneBall, drawBall, drawMatchBall, drawPlayer, inRect, tc, type Rect, type SpritePose } from './ui';

// The pitch is far bigger than the screen: the camera follows the ball along it and across it.
// Pixels per metre along the pitch come from the tuning config; across it is a little tighter.
const TOP = 14;
const VIEW_H = H - TOP;
const ZP = 4;              // height of kick-aim dots, in logical pixels per metre
const AIM_MIN = 8;         // pixels the passing thumb must pull back before an aim line appears
const AIM_MAX = 62;        // pull-back, in pixels, that gives the longest pass or kick
const SWIPE = 7;           // pixels the running thumb must travel before it counts as a movement
const FLICK_V = 230;       // pixels per second: faster than this on the running side is a sidestep
const FLICK_D = 9;

// run = the left half of the screen (the runner), ball = the right half (passing and kicking).
const CARRY = 0.05;        // a swipe that is let go is a small step across: this many metres per pixel, between 1 and 2.5 m

interface Touch {
  t0: number;
  id: number; side: 'run' | 'ball'; x0: number; y0: number; x: number; y: number;
  hist: { t: number; x: number; y: number }[]; armed: boolean; last: number;
}

// A practice situation instead of a full match: used by the Training Ground and the developer portal.
// report: stop at the first tackle (or score, or error) and show how the run went.
// countdown: 3, 2, 1, GO before the play starts by itself (the Training Ground).
export interface Sandbox { title: string; report?: boolean; countdown?: boolean; start(m: Match): void; onExit(): void }
interface Report { metres: number; broke: boolean; passed: boolean; error: string; scored: boolean; where: string }

export class MatchScene implements Scene {
  m: Match;
  camX = 0; camY = 0;
  private touches = new Map<number, Touch>();
  private now = 0;
  private lastPlay: AttackPlay | null = null;
  private plays = 0;
  private them: Side;
  private book: Formation[];
  private report: Report | null = null; private runX = 0;
  private bookOpen = false;
  private allPlays: Formation[] = [];
  private idle = 0;
  private showTutorial: boolean;

  constructor(private game: Game, us: Side, them: Side, knockout: boolean, seed: number, private onDone: (r: MatchResult) => void, private sandbox?: Sandbox) {
    // Swap the away kit if the two jerseys are too alike.
    this.them = them;
    if (colourDist(us.c1, them.c1) < 170) {
      const alt = [them.c2, '#f4f1de', '#22252b'].filter(k => colourDist(k, PITCH.a) > 90)
        .sort((a, b) => colourDist(b, us.c1) - colourDist(a, us.c1))[0];
      if (alt && colourDist(alt, us.c1) > colourDist(them.c1, us.c1)) this.them = { ...them, c1: alt, c2: them.c1 };
    }
    this.m = new Match(us, this.them, new Rng(seed), knockout);
    // Only the first career match teaches controls. Persist once the match is opened;
    // repeated seasons, training drills and returning users receive a clean pitch.
    const key = 'trs.match.tutorial.seen.v1';
    const career = game.career;
    const playedBefore = !!career && (career.record.w + career.record.d + career.record.l > 0 || (career.history?.length ?? 0) > 0);
    this.showTutorial = !sandbox && !playedBefore && game.store.get(key) !== '1';
    if (this.showTutorial) game.store.set(key, '1');
    this.allPlays = bookOf(game); this.book = this.allPlays;
    if (sandbox) this.restart();
  }

  private count = 0; // seconds left on the training countdown

  private retryRect(): Rect { return [W / 2 - 88, 122, 84, 20]; }
  private editRect(): Rect { return [W / 2 + 4, 122, 84, 20]; }

  private restart() {
    this.report = null; this.idle = 0; this.touches.clear();
    this.m.noContest = !!this.sandbox!.report;
    this.count = this.sandbox!.countdown ? 2.3 : 0;
    this.sandbox!.start(this.m);
    this.runX = this.m.play?.startX ?? this.m.spot.x;
    this.snapCam();
  }

  private get left() { return this.game.g.left; }
  private get vw() { return this.game.g.vw; }
  private get sx() { return T.camZoom; }
  private get sy() { return T.camZoom * 5 / 9; }
  private get k() { return T.spriteScale; }

  // ---- input ----
  private playsRect(): Rect { return [this.left + this.vw - 50, TOP + 3, 46, 14]; }
  private slotRect(i: number): Rect { return [this.left + this.vw - 96, TOP + 20 + i * 17, 92, 15]; }
  private exitRect(): Rect { return [this.left + 4, TOP + 3, 34, 14]; }
  // a set play is for the set piece itself: once the first phase has been played it is gone
  private canCall(p: AttackPlay) { return p.state === 'ready' && !p.koOnly && p.phase <= 1 && this.book.length > 0 && !this.sandbox?.report; }

  onEv(e: PEv) {
    const m = this.m;
    if (this.sandbox && e.t === 'down' && inRect(e, this.exitRect())) { this.sandbox.onExit(); return; }
    if (this.report) {
      if (e.t === 'down') { if (inRect(e, this.retryRect())) this.restart(); else if (inRect(e, this.editRect())) this.sandbox!.onExit(); }
      return;
    }
    if (this.count > 0) return; // nothing can be played until GO
    if (m.mode === 'lineout' && m.lo) {
      this.syncLo();
      if (this.loStage !== 'throw' && m.lo.phase === 'aim') { if (e.t === 'down') this.loTap(e); return; }
      this.lineoutEv(e); return;
    }
    if (this.longOf()) { this.longKickEv(e); return; }
    if (m.mode === 'goalkick' && m.pk) { this.goalKickEv(e); return; }
    if (m.mode !== 'play' || !m.play) {
      if (e.t === 'down') m.press();
      if (e.t === 'up') this.touches.delete(e.id);
      return;
    }
    const p = m.play;
    const ts = e.ts ?? this.now;
    if (e.t === 'down') {
      // the set-play button and its five slots sit over the pitch and take the touch first
      if (this.canCall(p)) {
        if (inRect(e, this.playsRect())) { this.bookOpen = !this.bookOpen; sfx('ui'); return; }
        if (this.bookOpen) {
          for (let i = 0; i < this.book.length; i++) if (inRect(e, this.slotRect(i))) {
            p.usePlay(p.playName === this.book[i].name ? null : this.book[i]);
            this.bookOpen = false; sfx('ui'); return;
          }
          this.bookOpen = false;
        }
      }
      const side = e.x < W / 2 ? 'run' : 'ball';
      // one thumb per side: a new touch replaces a stale one
      for (const [id, t] of this.touches) if (t.side === side) this.touches.delete(id);
      this.touches.set(e.id, { id: e.id, side, x0: e.x, y0: e.y, x: e.x, y: e.y, hist: [{ t: ts, x: e.x, y: e.y }], armed: true, last: 0, t0: this.now });
      // the moment the passing thumb goes down the supporters set off, so the ball is taken at pace
      if (p.state === 'maul') p.playMaul(); // any touch plays it away from the maul, and that same touch carries on
      if (side === 'run') p.run(); else p.startRuns();
      return;
    }
    const t = this.touches.get(e.id);
    if (!t) return;
    t.x = e.x; t.y = e.y;
    if (t.side === 'run') this.flick(t, ts, p);
    if (e.t !== 'up') return;
    this.touches.delete(e.id);
    if (t.side === 'run') {
      // A swipe that is let go keeps him moving: a short one changes channel, a long one takes him right
      // across. A thumb that was held and steered has already put him where it wanted him.
      const dy = t.y - t.y0;
      if (this.now - t.t0 < 0.45 && Math.abs(dy) >= SWIPE) p.shift(Math.sign(dy) * Math.min(2.5, Math.max(1, Math.abs(dy) * CARRY)));
      return;
    }
    const a = this.aimOf(t);
    if (a) p.release(a.ax, a.ay, a.power);
  }

  // The aim is the opposite of the pull, like drawing back a catapult. Screen pixels are turned into
  // metres so the dotted line on screen is exactly the line the ball takes.
  private aimOf(t: { x: number; y: number; x0: number; y0: number }): { ax: number; ay: number; power: number } | null {
    const dx = t.x - t.x0, dy = t.y - t.y0, len = Math.hypot(dx, dy);
    if (len < AIM_MIN) return null;
    return { ax: -dx / this.sx, ay: -dy / this.sy, power: clamp((len - AIM_MIN) / (AIM_MAX - AIM_MIN), 0, 1) };
  }

  // On the running side a fast movement is a move: up or down is a sidestep, forward near the line is a dive.
  // A slow drag only moves the runner across.
  private flick(t: Touch, ts: number, p: AttackPlay) {
    t.hist.push({ t: ts, x: t.x, y: t.y });
    while (t.hist.length > 2 && ts - t.hist[0].t > 0.09) t.hist.shift();
    if (t.hist.length < 2) return;
    const first = t.hist[0], d = t.y - first.y, dx = t.x - first.x, span = ts - first.t;
    const quick = (v: number) => Math.abs(v) >= FLICK_D && (span <= 0 ? Math.abs(v) >= 14 : Math.abs(v) / span >= FLICK_V);
    if (dx > 0 && quick(dx) && Math.abs(dx) > Math.abs(d) * 1.3 && p.canDive()) { p.dive(); t.armed = false; return; }
    const fast = quick(d) && Math.abs(d) >= Math.abs(dx);
    const dir = Math.sign(d);
    if (fast && (t.armed || dir !== t.last)) {
      p.sidestep(dir);
      t.armed = false; t.last = dir;
    } else if (!fast && Math.abs(d) < 3) t.armed = true;
  }

  private touch(side: 'run' | 'ball') { for (const t of this.touches.values()) if (t.side === side) return t; return null; }

  // ---- the lineout throw: the same pull-back, aimed in from touch ----
  private loGeom() {
    const m = this.m, into = m.spot.y < MID ? 1 : -1;
    return { x: m.spot.x, edge: m.spot.y, into };
  }
  private loAim(t: { x: number; y: number; x0: number; y0: number }) {
    const a = this.aimOf(t), lo = this.m.lo!, g = this.loGeom();
    if (!a) return null;
    const inward = a.ay * g.into;
    if (inward <= 0) return null;
    // only a sensible corridor into the lineout: no throwing it down the touchline
    const ang = clamp(Math.atan2(a.ax, inward), -0.3, 0.3);
    return { dist: 3 + a.power * (lo.maxD - 3), ang };
  }
  // A lineout starts with a choice: call a set play (everybody is put on its marks, ball in hand) or throw it in.
  private loFor: unknown = null; private loStage: 'ask' | 'pick' | 'throw' = 'throw';
  private loPlays() { return this.allPlays.filter(f => f.from === 'lineout'); }
  private syncLo() {
    const lo = this.m.lo;
    if (lo === this.loFor) return;
    this.loFor = lo;
    this.loStage = lo && !this.sandbox && this.loPlays().length ? 'ask' : 'throw';
  }
  private loRects(): Rect[] { return [[W / 2 - 86, 64, 82, 34], [W / 2 + 4, 64, 82, 34]]; }
  private loPickRect(i: number): Rect { return [W / 2 - 55, 44 + i * 21, 110, 18]; }
  private loTap(e: PEv) {
    const plays = this.loPlays();
    if (this.loStage === 'ask') {
      const [a, b] = this.loRects();
      if (inRect(e, a)) { sfx('ui'); if (plays.length === 1) this.m.lineoutPlay(plays[0]); else this.loStage = 'pick'; }
      else if (inRect(e, b)) { sfx('ui'); this.loStage = 'throw'; }
      return;
    }
    for (let i = 0; i < plays.length; i++) if (inRect(e, this.loPickRect(i))) { sfx('ui'); this.m.lineoutPlay(plays[i]); return; }
    this.loStage = 'ask';
  }
  private drawLoChoice(g: Gfx) {
    const plays = this.loPlays();
    g.rect(this.left, TOP, this.vw, H - TOP, C.dark, 0.35);
    if (this.loStage === 'ask') {
      const [a, b] = this.loRects();
      g.label('Lineout', W / 2, 44, 13, C.ink, { align: 1, display: true });
      g.card(a[0], a[1], a[2], a[3], C.gold); g.label('SET PLAY', a[0] + a[2] / 2, a[1] + 7, 11, C.dark, { align: 1, bold: true }); g.label(plays.length === 1 ? tc(plays[0].name) : `${plays.length} to choose from`, a[0] + a[2] / 2, a[1] + 22, 6, C.dark, { align: 1 });
      g.card(b[0], b[1], b[2], b[3], C.panel2); g.label('THROW', b[0] + b[2] / 2, b[1] + 7, 11, C.ink, { align: 1, bold: true }); g.label('Aim it yourself', b[0] + b[2] / 2, b[1] + 22, 6, C.dim, { align: 1 });
      return;
    }
    g.label('Which play?', W / 2, 28, 11, C.ink, { align: 1, display: true });
    plays.forEach((f, i) => { const q = this.loPickRect(i); g.card(q[0], q[1], q[2], q[3], C.gold); g.label(tc(f.name), q[0] + q[2] / 2, q[1] + 4, 9, C.dark, { align: 1, bold: true }); });
    g.label('Tap anywhere else to go back', W / 2, 44 + plays.length * 21 + 4, 6, C.dim, { align: 1 });
  }

  private lineoutEv(e: PEv) {
    const lo = this.m.lo!;
    if (lo.phase !== 'aim') return;
    if (e.t === 'down') { this.touches.clear(); this.touches.set(e.id, { id: e.id, side: 'ball', x0: e.x, y0: e.y, x: e.x, y: e.y, hist: [], armed: true, last: 0, t0: this.now }); return; }
    const t = this.touches.get(e.id);
    if (!t) return;
    t.x = e.x; t.y = e.y;
    if (e.t !== 'up') return;
    this.touches.delete(e.id);
    const a = this.loAim(t);
    if (a) this.m.throwLine(a.dist, a.ang);
  }

  // ---- long kicks the player aims himself: a penalty kick for touch, and our kick-off ----
  private longOf() { const m = this.m; return m.mode === 'touchkick' ? m.tkick : null; }

  private longKickEv(e: PEv) {
    const m = this.m, k = this.longOf()!;
    if (k.phase !== 'aim') return;
    if (e.t === 'down') { this.touches.clear(); this.touches.set(e.id, { id: e.id, side: 'ball', x0: e.x, y0: e.y, x: e.x, y: e.y, hist: [], armed: true, last: 0, t0: this.now }); return; }
    const t = this.touches.get(e.id);
    if (!t) return;
    t.x = e.x; t.y = e.y;
    if (e.t !== 'up') return;
    this.touches.delete(e.id);
    const a = this.aimOf(t);
    if (a) m.kickTouch(a.ax, a.ay, a.power);
  }

  // The dotted line is the kick in still air and nothing more. Whether it finds touch is for the player
  // to judge from the line, the landing marker, the touchline and the wind.
  private drawLongKick(g: Gfx) {
    const m = this.m, k = this.longOf()!, sc = this.k;
    const fx = this.X(k.from.x), fy = this.Y(k.from.y);
    this.posts(g, 0); this.posts(g, FL);
    drawPlayer(g, fx - 4 * sc, fy, m.us, 1, k.phase === 'aim' ? 'stand' : 'pass', 0, 1, sc);
    if (k.phase !== 'aim') {
      const p = m.longBall(k), bx = this.X(p.x), by = this.Y(p.y);
      drawAirborneBall(g, bx, by, p.z, sc);
      return;
    }
    drawMatchBall(g, fx + 4 * sc, fy - 1, sc);
    this.drawWind(g, this.left + 6, TOP + 16);
    const t = this.touch('ball'), a0 = t ? this.aimOf(t) : null, a = a0 ? m.aimLong(k, a0.ax, a0.ay, a0.power) : null;
    if (t) { g.frame(t.x0 - 4, t.y0 - 4, 9, 9, C.ink); g.rect(t.x - 2, t.y - 2, 5, 5, C.gold, 0.8); }
    if (a) {
      const ex = this.X(a.x), ey = this.Y(a.y);
      this.dots(g, fx, fy, ex, ey, a.arc, 18, C.gold, true);
      // where it comes down in still air: a ring on the grass, always drawn
      g.frame(ex - 7, ey - 4, 15, 9, C.gold); g.frame(ex - 4, ey - 2, 9, 5, C.ink); g.rect(ex - 1, ey - 1, 3, 3, C.gold);
    }
    // the whole pitch in miniature: the kicker, the line of the kick and where it lands, against both touchlines
    const mw = 78, mh = Math.round(mw * FW / (FL + 2 * IG)), mx = this.left + this.vw - mw - 6, my = TOP + 4;
    const px = (x: number) => mx + (x + IG) / (FL + 2 * IG) * mw, py = (y: number) => my + y / FW * mh;
    g.rect(mx - 2, my - 2, mw + 4, mh + 4, C.dark, 0.85); g.rect(mx, my, mw, mh, PITCH.a);
    g.rect(mx, my, mw, 1, C.ink); g.rect(mx, my + mh - 1, mw, 1, C.ink);
    for (const x of [0, 22, 50, 78, 100]) g.rect(px(x), my, 1, mh, C.ink, x === 50 ? 0.8 : 0.4);
    g.rect(px(k.from.x) - 1, py(k.from.y) - 1, 3, 3, m.us.c1); g.frame(px(k.from.x) - 2, py(k.from.y) - 2, 5, 5, C.ink);
    if (a) {
      for (let i = 1; i <= 8; i++) g.rect(px(k.from.x + (a.x - k.from.x) * i / 8), my + (k.from.y + (a.y - k.from.y) * i / 8) / FW * mh, 1, 1, C.gold);
      g.rect(px(a.x) - 1, my + a.y / FW * mh - 1, 3, 3, C.gold);
    }
    g.rect(this.left, H - 19, this.vw, 19, C.dark, 0.62);
    g.label('Kick for touch: pull back to aim, let go to kick', W / 2, H - 17, 7, C.ink, { align: 1 });
    g.label('It has to cross a touchline. Judge it from the line, the marker and the wind', W / 2, H - 9, 6.5, C.dim, { align: 1 });
  }

  update(dt: number) {
    const m = this.m;
    this.now += dt;
    if (this.report) return;
    if (this.count > 0) {
      // 3, 2, 1: everybody stands still. At GO the play runs, and from then on the ball is the player's to pass.
      this.count -= dt;
      if (this.count <= 0 && m.play) { m.play.run(); sfx('whistle'); }
      return;
    }
    if (m.mode === 'play' && m.play) {
      const p = m.play;
      if (p !== this.lastPlay) {
        this.lastPlay = p; this.plays++; this.bookOpen = false;
        const kind = p.cfg.kind;
        this.book = this.allPlays.filter(f => (kind === 'lineout' ? f.from === 'lineout' : kind === 'scrum' ? f.from !== 'lineout' : false)); for (const t of this.touches.values()) if (t.side === 'run') { t.x0 = t.x; t.y0 = t.y; t.hist = []; }
      }
      const r = this.touch('run');
      if (r && p.state === 'ready' && Math.abs(r.y - r.y0) >= SWIPE) p.run();
      if (this.touch('ball') && p.state === 'ready') p.startRuns();
      if (r) {
        const d = r.y - r.y0;
        p.drift = Math.abs(d) < 2 ? 0 : Math.sign(d) * clamp((Math.abs(d) - 2) / 9, 0, 1);
      } else p.drift = 0;
      if (p.state !== 'ready') this.bookOpen = false;
    } else if (this.touches.size && m.mode !== 'ruck' && m.mode !== 'lineout' && m.mode !== 'touchkick' && m.mode !== 'goalkick') this.touches.clear();
    if (this.game.tap && (m.mode === 'banner' || m.mode === 'oppsim')) m.tap();
    m.update(dt);
    for (const s of m.sfx.splice(0)) sfx(s);
    // A test run of a play ends at the first tackle, score or mistake, with a short report.
    const tp = m.play;
    if (this.sandbox?.report && tp && (tp.state === 'done' || (tp.ruckSeq > 0 && tp.state !== 'tackle'))) {
      const e = tp.end, scored = e?.k === 'try';
      const endX = scored ? FL : tp.ruck?.x ?? tp.ball.x;
      this.report = {
        metres: Math.round(endX - this.runX), broke: tp.breaks > 0, passed: tp.catches > 0, scored,
        where: scored ? 'Over their line' : `${tc(where(endX))}, ${Math.max(0, Math.round(FL - endX))} m out`,
        error: e?.k === 'turnover' ? ({ knockon: 'Knock-on', intercept: 'Intercepted', loose: 'Loose ball lost', stripped: 'Lost in the tackle', touch: 'Into touch', kick: 'Kicked away', charged: 'Charged down', ruck: 'Turned over', holding: 'Penalised', short: 'Not ten metres' } as Record<string, string>)[e.why] : '',
      };
      return;
    }
    // A practice situation starts again a moment after it ends.
    if (this.sandbox) {
      const going = m.mode === 'play' || m.mode === 'ruck' || m.mode === 'lineout' || m.mode === 'scrum';
      this.idle = going ? 0 : this.idle + dt;
      if (this.idle > 1.6) this.restart();
    }
    const c = this.camTarget(), k = Math.min(1, dt * T.camSmooth);
    this.camX += (c.x - this.camX) * k; this.camY += (c.y - this.camY) * k;
  }

  private camTarget() {
    const m = this.m, usePlay = m.play && (m.mode === 'play' || m.mode === 'ruck' || m.mode === 'banner');
    const view = this.vw / this.sx, top = -34, bottom = Math.max(top, FW * this.sy - VIEW_H + 34);
    const xLim = (x: number) => clamp(x, -IG - 1.5, FL + IG + 1.5 - view);
    const k = m.mode === 'goalkick' ? m.pk : null;
    if (k) {
      // a kick at goal: the kicker at the left, the posts in view, then follow the ball
      if (k.phase === 'fly' || k.phase === 'over') {
        const p = m.flightAt(k, k.phase === 'fly' ? Math.min(1, k.t / k.dur) : 1);
        return { x: xLim(Math.min(p.x - view * 0.55, FL + 4 - view)), y: clamp(((p.y + MID) / 2) * this.sy - VIEW_H / 2, top, bottom) };
      }
      return { x: xLim(Math.min(k.from.x - 4, FL + 4 - view)), y: clamp(((k.from.y + MID) / 2) * this.sy - VIEW_H / 2, top, bottom) };
    }
    const lk = this.longOf();
    if (lk) {
      const yOf = (y: number) => clamp(y * this.sy - VIEW_H / 2, top, bottom);
      if (lk.phase !== 'aim') { const p = m.longBall(lk); return { x: xLim(p.x - view * 0.5), y: yOf(p.y) }; }
      const t = this.touch('ball'), a0 = t ? this.aimOf(t) : null, a = a0 ? m.aimLong(lk, a0.ax, a0.ay, a0.power) : null;
      // slide along so the landing spot is on screen, but never so far that the kicker is lost
      const wantX = a ? Math.min(lk.from.x - 3, a.x - view * 0.8) : lk.from.x - view * 0.25;
      return { x: xLim(Math.max(wantX, lk.from.x - view + 6)), y: yOf(a ? (lk.from.y + clamp(a.y, 0, FW)) / 2 : lk.from.y) };
    }
    if (m.mode === 'lineout') {
      // the thrower stands on the touchline: give him headroom at the top, and room for his feet at the bottom
      const upper = m.spot.y < MID;
      return { x: xLim(m.spot.x - view * 0.45), y: upper ? -30 : FW * this.sy - VIEW_H + 22 };
    }
    if (usePlay && m.play!.koOnly && m.play!.penKick) {
      const p = m.play!, c = p.att[p.carrier], t = this.touch('ball'), a0 = t ? this.aimOf(t) : null, a = a0 ? p.aim(a0.ax, a0.ay, a0.power) : null;
      const wantX = a ? Math.min(c.x - 3, a.x - view * 0.8) : c.x - view * 0.25;
      return { x: xLim(Math.max(wantX, c.x - view + 6)), y: clamp((a ? (c.y + clamp(a.y, 0, FW)) / 2 : c.y) * this.sy - VIEW_H / 2, top, bottom) };
    }
    const fx = usePlay ? m.play!.ball.x : m.spot.x, fy = usePlay ? m.play!.ball.y : m.spot.y;
    return { x: xLim(fx - view * T.camLead), y: clamp(fy * this.sy - VIEW_H / 2, top, bottom) };
  }

  snapCam() { const c = this.camTarget(); this.camX = c.x; this.camY = c.y; }

  private X(x: number) { return this.left + Math.round((x - this.camX) * this.sx); }
  private Y(y: number) { return TOP + Math.round(y * this.sy - this.camY); }

  // ---- drawing ----
  draw(g: Gfx) {
    const m = this.m, L = this.left, VW = this.vw;
    g.rect(L, 0, VW, H, C.dark);
    this.drawField(g);
    const showPlay = m.play && (m.mode === 'play' || m.mode === 'ruck' || m.mode === 'banner' || m.mode === 'scrum' || m.mode === 'lineout');
    if (showPlay) this.drawPlay(g, m.play!);
    if (m.mode === 'scrum') g.label(m.scrumFeed === 'us' ? 'Scrum: your feed' : 'Scrum: their feed', W / 2, H - 20, 10, m.scrumFeed === 'us' ? C.ink : C.red, { align: 1, display: true, a: 0.95 });
    if (m.mode === 'lineout' && m.lo && m.play) {
      this.syncLo();
      if (this.loStage !== 'throw' && m.lo.phase === 'aim') this.drawLoChoice(g); else this.drawLineout(g, m.play);
    }
    if (this.longOf()) this.drawLongKick(g);
    if (m.mode === 'goalkick' && m.pk) this.drawGoalKick(g);
    if (m.mode === 'penalty') { this.posts(g, 0); this.posts(g, FL); drawPlayer(g, this.X(m.spot.x), this.Y(m.spot.y), m.us, 1, 'stand', 0, 1, this.k); drawMatchBall(g, this.X(m.spot.x) + 9, this.Y(m.spot.y) - 1, this.k); }
    this.hud(g);
    switch (m.mode) {
      case 'play': this.drawControls(g, m.play!); break;
      case 'banner': {
        const b = m.banner;
        g.rect(L, 64, VW, 46, C.dark, 0.86); g.rect(L, 64, VW, 1, C.gold); g.rect(L, 109, VW, 1, C.gold);
        g.label(b.title, W / 2, b.sub ? 70 : 77, b.title.length > 18 ? 15 : 20, C.gold, { align: 1, display: true });
        if (b.sub) g.label(b.sub, W / 2, 94, 9, C.ink, { align: 1 });
        break;
      }
      case 'ruck':
        if (m.ruckIntro > 0) {
          // in fast, held, out fast
          const t = RUCK_INTRO - m.ruckIntro, a = Math.min(1, t / 0.1, m.ruckIntro / 0.14);
          this.outlined(g, 'CONTESTED', W / 2, 66 - (1 - Math.min(1, t / 0.1)) * 8, 30, C.gold, a);
        } else if (m.timing) this.drawTiming(g);
        break;
      case 'penalty': this.drawMenu(g); break;
      case 'oppsim': this.drawSim(g); break;
      case 'fulltime': this.drawFullTime(g); break;
    }
    if (this.sandbox) {
      const r = this.exitRect();
      g.card(r[0], r[1], r[2], r[3], C.dark, 0.8); g.label('Exit', r[0] + r[2] / 2, r[1] + 3, 7.5, C.ink, { align: 1, bold: true });
      g.label(this.sandbox.title, r[0] + r[2] + 6, r[1] + 3, 7.5, C.ink, { a: 0.85 });
      const rp = this.report;
      if (rp) {
        g.card(W / 2 - 96, 34, 192, 114, C.dark, 0.95); g.rect(W / 2 - 95, 34, 190, 2, C.gold);
        g.label(rp.scored ? 'Try!' : rp.error ? rp.error : 'Tackled', W / 2, 39, 15, rp.scored ? C.gold : rp.error ? C.red : C.ink, { align: 1, display: true });
        const rows: [string, string][] = [['Metres gained', String(rp.metres)], ['Defensive line broken', rp.broke ? 'Yes' : 'No'], ['Pass completed', rp.passed ? 'Yes' : 'No'], ['Try scored', rp.scored ? 'Yes' : 'No'], ['Play ended', rp.where]];
        rows.forEach(([a, b], i) => { g.label(a, W / 2 - 84, 60 + i * 11, 7.5, C.dim); g.label(b, W / 2 + 84, 60 + i * 11, 7.5, b === 'Yes' ? C.gold : C.ink, { align: 2, bold: true }); });
        const rr = this.retryRect(), er = this.editRect();
        g.card(rr[0], rr[1], rr[2], rr[3], C.gold); g.label('RETRY PLAY', rr[0] + rr[2] / 2, rr[1] + 5, 9, C.dark, { align: 1, bold: true });
        g.card(er[0], er[1], er[2], er[3], C.panel2); g.label('EDIT PLAY', er[0] + er[2] / 2, er[1] + 5, 9, C.ink, { align: 1, bold: true });
      }
      if (this.count > 0) {
        // 3... 2... 1... GO!
        const n = Math.ceil((this.count - 0.5) / 0.6), txt = n >= 1 ? String(n) : 'GO!', beat = n >= 1 ? ((this.count - 0.5) / 0.6) % 1 : this.count / 0.5;
        this.outlined(g, txt, W / 2, 60 - beat * 6, 44 + beat * 10, C.gold);
      }
    }
  }

  // Big display lettering with a dark outline, for calls that must not be missed.
  private outlined(g: Gfx, txt: string, x: number, y: number, size: number, col: string, a = 1) {
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [0, 3]]) g.label(txt, x + dx, y + dy, size, C.dark, { align: 1, display: true, a });
    g.label(txt, x, y, size, col, { align: 1, display: true, a });
  }

  private drawField(g: Gfx) {
    const X = (x: number) => this.X(x), sx = this.sx, fh = FW * this.sy, L = this.left, VW = this.vw, Tp = this.Y(0);
    g.rect(L, TOP, VW, VIEW_H, PITCH.edge);
    for (let i = 0; i < 10; i++) g.rect(X(i * 10), Tp, 10 * sx + 1, fh, i % 2 ? PITCH.b : PITCH.a);
    // the in-goals are a different green with a hatch, so the try line is impossible to miss
    for (const x0 of [-IG, FL]) {
      g.rect(X(x0), Tp, IG * sx, fh, PITCH.goal);
      for (let y = 0; y < fh; y += 10) g.rect(X(x0), Tp + y, IG * sx, 3, '#fff', 0.06);
    }
    g.rect(X(-IG), Tp, 3, fh, this.m.us.c1); g.rect(X(FL + IG) - 3, Tp, 3, fh, this.them.c1);
    const ink = C.ink;
    g.rect(X(0) - 1, Tp, 3, fh, ink); g.rect(X(FL) - 1, Tp, 3, fh, ink);          // try lines
    g.rect(X(50) - 1, Tp, 3, fh, ink, 0.95);                                         // halfway
    g.rect(X(22), Tp, 2, fh, ink, 0.85); g.rect(X(78), Tp, 2, fh, ink, 0.85);       // the 22s
    for (const x of [5, 40, 60, 95]) for (let y = 0; y < fh; y += 9) g.rect(X(x), Tp + y, 1, 5, ink, 0.4);
    for (const y of [5, 15, FW - 15, FW - 5]) for (const x of [5, 22, 40, 50, 60, 78, 95]) g.rect(X(x) - 5, this.Y(y), 11, 1, ink, 0.45);
    g.rect(X(-IG), Tp, (FL + 2 * IG) * sx, 2, ink, 0.95); g.rect(X(-IG), Tp + fh - 2, (FL + 2 * IG) * sx, 2, ink, 0.95);
    // big painted numbers either side of each line, near both touchlines
    for (const [x, s] of [[22, '22'], [50, '50'], [78, '22']] as const) for (const y of [7, FW - 7]) g.pix(s, X(x) + 6, this.Y(y) - 10, ink, 4, 0, 0.8);
    this.drawStadium(g, Tp, fh);
  }

  // What is beyond the touchlines. Far side: boards and a stand of spectators. Near side: boards, the two
  // benches with reserves and a coach each, a touch judge keeping up with play, and the kit that lies about.
  // All of it is kept dim and small: it is there to be a stadium, not to be looked at.
  private drawStadium(g: Gfx, Tp: number, fh: number) {
    const X = (x: number) => this.X(x), sx = this.sx, L = this.left, VW = this.vw, us = this.m.us, th = this.them;
    const cols = [us.c1, C.ink, th.c1, C.dark];
    const Bt = Tp + fh; // the near touchline
    // far side
    g.rect(L, Tp - 40, VW, 28, '#1d2a30');
    const crowd = ['#c9c3b0', us.c1, '#7f8c93', th.c1, '#e0b98a', '#53626a'];
    const i0 = Math.floor((this.camX * sx) / 5) - 2;
    for (let row = 0; row < 4; row++) for (let i = i0; i < i0 + VW / 5 + 4; i++) {
      const h = (i * 7 + row * 13) % 11; if (h === 0) continue;
      const bob = (i + row) % 9 === 0 ? Math.round(Math.sin(this.now * 5 + i) * 0.6 + 0.5) : 0;
      g.rect(L + i * 5 - Math.round(this.camX * sx) + row * 2, Tp - 16 - row * 6 - bob, 3, 4, crowd[(i * 3 + row) % crowd.length], 0.75);
    }
    for (let i = -1; i < 12; i++) g.rect(X(i * 10) + 1, Tp - 11, 10 * sx - 2, 6, cols[(i + 4) % 4], 0.9);
    g.rect(L, Tp - 5, VW, 5, PITCH.edge);
    // near side: the run-off, then boards
    g.rect(L, Bt, VW, 40, PITCH.edge);
    for (let i = -1; i < 12; i++) g.rect(X(i * 10) + 1, Bt + 27, 10 * sx - 2, 6, cols[(i + 6) % 4], 0.9);
    const bench = (x0: number, kit: { c1: string; c2: string }, face: number) => {
      const bx = X(x0), w = 9 * sx;
      g.rect(bx, Bt + 9, w, 13, '#1d2a30', 0.9); g.rect(bx, Bt + 9, w, 2, '#F7F1E4', 0.5);           // the dugout and its roof
      for (let n = 0; n < 6; n++) { const px = bx + 5 + n * (w - 10) / 5; g.rect(px - 1, Bt + 13, 3, 2, '#d9a066'); g.rect(px - 2, Bt + 15, 5, 4, kit.c1); g.rect(px - 2, Bt + 16, 5, 1, kit.c2); } // reserves
      drawPlayer(g, bx + (face > 0 ? w + 6 : -6), Bt + 9, { c1: '#2b3238', c2: '#F7F1E4' }, 1, 'stand', 0, face, 0.75);        // the coach, on his feet
      for (let n = 0; n < 3; n++) g.rect(bx + (face > 0 ? -5 - n * 3 : w + 3 + n * 3), Bt + 19, 2, 3, n % 2 ? C.gold : '#9cc4e0');  // water bottles
    };
    bench(36, us, 1); bench(55, th, -1);
    g.rect(X(47.5), Bt + 12, 5 * sx, 7, '#F7F1E4', 0.8); g.rect(X(47.5) + 2, Bt + 14, 5 * sx - 4, 3, '#25333A', 0.8);                 // the fourth official's table
    // the touch judge runs the line level with the ball
    const bxw = this.m.play ? this.m.play.ball.x : this.m.spot.x;
    drawPlayer(g, X(clamp(bxw, 0, FL)), Bt + 6, { c1: '#f4be46', c2: '#25333A' }, 0, this.m.mode === 'play' ? 'run' : 'stand', this.now * 8, 1, 0.8);
    g.rect(X(clamp(bxw, 0, FL)) + 4, Bt - 6, 1, 6, '#25333A'); g.rect(X(clamp(bxw, 0, FL)) + 5, Bt - 6, 4, 3, C.red);
    // corner flags
    for (const x of [0, FL]) for (const y of [Tp, Bt]) { g.rect(X(x), y - 8, 1, 8, C.ink); g.rect(X(x) + 1, y - 8, 3, 2, C.red); }
  }

  // The whole pitch in miniature: the kicker, the line of the kick and where it lands, against both touchlines.
  private miniMap(g: Gfx, from: { x: number; y: number }, a: { x: number; y: number } | null) {
    const mw = 78, mh = Math.round(mw * FW / (FL + 2 * IG)), mx = this.left + this.vw - mw - 6, my = TOP + 4;
    const px = (x: number) => mx + (x + IG) / (FL + 2 * IG) * mw, py = (y: number) => my + y / FW * mh;
    g.rect(mx - 2, my - 2, mw + 4, mh + 4, C.dark, 0.85); g.rect(mx, my, mw, mh, PITCH.a);
    g.rect(mx, my, mw, 1, C.ink); g.rect(mx, my + mh - 1, mw, 1, C.ink);
    for (const x of [0, 22, 50, 78, 100]) g.rect(px(x), my, 1, mh, C.ink, x === 50 ? 0.8 : 0.4);
    g.rect(px(from.x) - 1, py(from.y) - 1, 3, 3, this.m.us.c1); g.frame(px(from.x) - 2, py(from.y) - 2, 5, 5, C.ink);
    if (!a) return;
    for (let i = 1; i <= 8; i++) g.rect(px(from.x + (a.x - from.x) * i / 8), py(from.y + (a.y - from.y) * i / 8), 1, 1, C.gold);
    g.rect(px(a.x) - 1, py(a.y) - 1, 3, 3, C.gold);
  }

  private posts(g: Gfx, x: number) {
    // The camera is bird's-eye. Draw the two pad tops and the crossbar from above,
    // at the exact (x, y) coordinates used by goal-kick scoring.
    const px = this.X(x), far = this.Y(MID - POST), near = this.Y(MID + POST);
    const white = '#FFFDF2', edge = '#1C2327', kit = x === 0 ? this.m.us.c1 : this.them.c1;
    g.rect(px + 2, far + 2, 3, near - far + 3, '#000', 0.22); // soft pitch shadow
    g.rect(px - 1, far, 3, near - far, edge);
    g.rect(px, far + 1, 1.5, near - far - 2, white);
    for (const y of [far, near]) {
      g.rect(px - 5, y - 5, 11, 11, edge);
      g.rect(px - 4, y - 4, 9, 9, kit);
      g.rect(px - 2, y - 2, 5, 5, white);
      g.rect(px - 1, y - 1, 3, 3, edge);
    }
  }

  private drawPlay(g: Gfx, p: AttackPlay) {
    const us = this.m.us, th = this.them, k = this.k, b = p.ball;
    const held = b.mode === 'held', st = p.state, moving = st !== 'ready' || p.atRuck;
    const tk = p.tk && st === 'tackle' ? p.tk : null, tkK = tk ? Math.min(1, tk.t / tk.dur) : 0;
    const c = p.att[p.carrier];
    const list: { y: number; f: () => void }[] = [];
    list.push({ y: MID - POST, f: () => { this.posts(g, 0); this.posts(g, FL); } });

    const lo = this.m.mode === 'lineout' ? this.m.lo : null, heave = this.m.mode === 'scrum' ? Math.sin(this.now * 14) * 1.2 : 0;
    p.att.forEach((a, i) => {
      if (a.down > 1e8) return;
      // in a scrum the pack heaves; in a lineout the jumper the ball is thrown to goes up for it
      const up = lo && lo.phase === 'fly' && p.jumpers[lo.zone] === i ? Math.sin(Math.min(1, lo.t / LO_FLY) * Math.PI) * 8 * k : 0;
      const px = this.X(a.x) + (a.job === 1 ? heave : 0), py = this.Y(a.y) - up, has = held && i === p.carrier;
      list.push({ y: a.y + (tk && tk.who === i ? 0.05 : 0), f: () => {
        if (has) {
          // the man with the ball stands on an ochre ring
          const pulse = 0.55 + 0.35 * Math.sin(this.now * 9);
          g.rect(px - 7 * k, py, 14 * k, 1, C.gold, pulse); g.rect(px - 7 * k, py + 3, 14 * k, 1, C.gold, pulse);
          g.rect(px - 9 * k, py + 1, 2, 2, C.gold, pulse); g.rect(px + 7 * k, py + 1, 2, 2, C.gold, pulse);
        }
        let pose: SpritePose = 'run', face = 1;
        if (tk && tk.who === i) {
          // tackled: knocked back, then falling, then down. Front-on he goes over backwards, otherwise on his face.
          pose = tkK < 0.3 ? 'stand' : tkK < 0.7 ? 'fall' : 'lie';
          face = tk.kind === 'front' ? 1 : -1;
        } else if (st === 'score' && i === p.carrier) pose = p.dived || p.scoreT < 0.3 ? 'dive' : 'run';
        else if (p.diveT > 0 && has) pose = 'dive';
        else if (a.down > 0 || a.job === 2) pose = a.down < 0.7 && a.down > 0 ? 'kneel' : 'lie';
        else if (a.job === 1 && st !== 'live') pose = Math.hypot(a.x - a.bx, a.y - a.by) > 0.6 ? 'run' : p.setKind === 'lineout' ? (i === p.thrower && lo?.phase === 'fly' ? 'pass' : 'stand') : 'wrap';
        else if (a.pose === 'pass' || a.pose === 'fumble') pose = 'pass';
        else if (a.pose === 'fend') pose = 'fend';
        else if (!moving || (has && st === 'ready')) pose = 'stand';
        else if (st === 'ready' || st === 'ruck' || st === 'tackle' || st === 'set' || st === 'maul') pose = this.still(a) ? 'stand' : 'run';
        if (has && p.stepT > 0) for (let n = 1; n <= 2; n++) g.rect(px - 4 * k, py - 11 * k - p.stepDir * n * 4, 8 * k, 9 * k, us.c1, 0.3 / n);
        drawPlayer(g, px, py, us, a.skin, pose, a.anim, face, k);
        if (has || (tk && tk.who === i && tkK < 0.7) || (st === 'score' && i === p.carrier)) {
          const flat = pose === 'dive';
          drawMatchBall(g, px + (flat ? 8 : tk ? 1 : 4) * k, py - (flat ? 3 : tkK > 0.3 ? 4 : 7) * k, k);
        }
        // once he is down the ball is placed back on his own side, ready for the halfback
        if (tk && tk.who === i && tkK >= 0.7) drawMatchBall(g, px - 10 * k, py - 1, k);
        if (a.star && pose !== 'lie') {
          const sx2 = px - 8 * k, sy2 = py - 21 * k, pulse = 0.75 + 0.25 * Math.sin(this.now * 4 + i);
          g.rect(px - 6 * k, py + 4 * k, 12 * k, 1.5 * k, C.gold, pulse);
          g.rect(sx2, sy2 + 2 * k, 7 * k, 1.5 * k, C.gold);
          g.rect(sx2 + 3 * k, sy2, 1.5 * k, 6 * k, C.gold);
        }
        if (has && st !== 'score') { const ay = py - 22 * k; g.rect(px - 2, ay, 5, 1, C.gold); g.rect(px - 1, ay + 1, 3, 1, C.gold); g.rect(px, ay + 2, 1, 1, C.gold); }
      } });
    });
    p.def.forEach((d, i) => {
      if (d.stun > 1e8) return;
      // their marker in the lineout is flagged, and goes up if he steals it
      const zone = lo && d.bound ? p.jumpers.findIndex(j => Math.abs(p.att[j].by - d.by) < 0.1) : -1, marker = !!lo && zone >= 0 && zone === lo.marked;
      const up = marker && lo!.phase === 'fly' && !lo!.won && zone === lo!.zone ? Math.sin(Math.min(1, lo!.t / LO_FLY) * Math.PI) * 8 * k : 0;
      const px = this.X(d.x) + (d.bound ? heave : 0), py = this.Y(d.y) - up;
      let pose: SpritePose = 'run', face = -1;
      if (tk && tk.by === i) { pose = tkK < 0.7 ? 'wrap' : 'lie'; face = tk.kind === 'behind' ? 1 : -1; }
      else if (d.st === 'dive') { pose = 'dive'; face = d.dx >= 0 ? 1 : -1; }
      else if (d.st === 'miss') pose = d.t < 0.6 ? 'kneel' : 'lie';
      else if (d.bound) pose = Math.hypot(d.x - d.bx, d.y - d.by) > 0.6 ? 'run' : p.setKind === 'lineout' ? 'stand' : 'wrap';
      else if (!moving || d.stun > 0) pose = 'stand';
      else if (st !== 'live') pose = this.still(d) ? 'stand' : 'run';
      else if (d.st === 'cover') face = 1;
      list.push({ y: d.y, f: () => {
        if (marker) { g.rect(px - 6 * k, py + 2, 12 * k, 2, C.red); g.rect(px - 1, py - 21 * k, 3, 3, C.red); }
        drawPlayer(g, px, py, th, d.skin, pose, d.anim, face, k);
        if (b.mode === 'taken' && Math.hypot(d.x - b.x, d.y - b.y) < 0.2) drawMatchBall(g, px - 4 * k, py - 7 * k, k);
      } });
    });
    list.sort((a, q) => a.y - q.y).forEach(s => s.f());

    // the ball when nobody has it in hand
    const fd = this.m.mode === 'scrum' && this.m.feeder >= 0 ? p.def[this.m.feeder] : null;
    if (fd) drawMatchBall(g, this.X(fd.x) - 5 * k, this.Y(fd.y) - 7 * k, k);
    else if (b.mode === 'ground' && st !== 'tackle' && p.setKind !== 'lineout') drawMatchBall(g, this.X(b.x), this.Y(b.y) - 1, k);
    else if (b.mode === 'pass' || b.mode === 'kick' || b.mode === 'bounce' || b.mode === 'loose' || b.mode === 'spill') {
      if (b.mode === 'kick') {
        // where it is coming down, so the chase can be read
        const lx = this.X(b.tx), ly = this.Y(b.ty), pulse = 0.5 + 0.4 * Math.sin(this.now * 10);
        g.frame(lx - 7, ly - 4, 15, 9, C.ink); g.rect(lx - 2, ly - 1, 5, 3, C.gold, pulse);
      }
      const bx = this.X(b.x), by = this.Y(b.y), onGround = b.mode === 'loose';
      if (b.mode === 'kick' || b.mode === 'bounce') drawAirborneBall(g, bx, by, b.z, k);
      else {
        g.rect(bx - 3 * k, by, 6 * k, 2, '#000', 0.3);
        drawMatchBall(g, bx, by - (onGround ? 1 : 6 * k) - Math.round(b.z * ZP), k);
      }
    }
    const bt = this.touch('ball');
    if (this.m.mode === 'play' && bt && held && (st === 'ready' || st === 'live')) this.drawAim(g, p, bt);
    if (p.flashT > 0) g.label(tc(p.flash), this.X(b.x), this.Y(b.y) - 38 * k, 9, C.gold, { align: 1, bold: true });
    if (this.showTutorial && st === 'live' && b.mode === 'kick' && b.fx > b.tx) g.label('Get under the kick', W / 2, TOP + 4, 8, C.ink, { align: 1, bold: true, a: 0.9 });
    if (this.showTutorial && p.canDive() && st === 'live') g.label('Swipe forward to dive', this.X(c.x), this.Y(c.y) + 6, 7, C.ink, { align: 1, a: 0.9 });
  }

  // Players waiting at a breakdown stand still once they have got where they are going.
  private stillAt = new WeakMap<object, { x: number; y: number; t: number }>();
  private still(o: { x: number; y: number }) {
    const s = this.stillAt.get(o);
    if (!s || Math.hypot(s.x - o.x, s.y - o.y) > 0.02) { this.stillAt.set(o, { x: o.x, y: o.y, t: this.now }); return false; }
    return this.now - s.t > 0.12;
  }

  // Dots along the exact path the ball will take, at the height it will fly.
  private dots(g: Gfx, x0: number, y0: number, x1: number, y1: number, arc: number, n: number, col: string, shadow: boolean) {
    for (let i = 1; i <= n; i++) {
      const f = i / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      if (shadow) g.rect(x - 1, y, 2, 1, '#000', 0.25);
      g.rect(x - 1, y - 6 * this.k - Math.sin(f * Math.PI) * arc * ZP, 2, 2, col);
    }
  }

  // White and low for a pass, arcing to a landing marker for a kick.
  private drawAim(g: Gfx, p: AttackPlay, t: Touch) {
    const c = p.att[p.carrier], a0 = this.aimOf(t);
    g.frame(t.x0 - 4, t.y0 - 4, 9, 9, C.ink); g.rect(t.x - 2, t.y - 2, 5, 5, C.gold, 0.8);
    const a: Aim | null = a0 ? p.aim(a0.ax, a0.ay, a0.power) : null;
    if (!a) return;
    const kick = a.kind === 'kick';
    const col = !kick ? C.ink : a.drop ? C.gold : a.kk === 'low' ? '#9cc4e0' : a.kk === 'high' || a.kk === 'box' ? C.red : '#f0a36c';
    const ex = this.X(a.x), ey = this.Y(a.y);
    this.dots(g, this.X(c.x), this.Y(c.y), ex, ey, a.arc, kick ? 14 : Math.max(4, Math.round(a.dist / 1.5)), col, kick);
    if (kick) {
      g.frame(ex - 6, ey - 3, 13, 7, col); g.rect(ex - 1, ey - 1, 3, 3, col);
      this.kickStrip(g, p, a);
    } else { g.rect(ex - 2, ey - 8, 5, 5, C.gold); g.rect(ex - 1, ey - 7, 3, 3, C.dark); }
  }

  // The lineout is played by the real players: three jumpers, the thrower on the line, the halfback
  // standing off. This draws what goes over them: the aim, the ball in flight and the hint.
  // CHIP KICK | BOMB | LONG KICK, centred under the scoreboard and well inside the screen on any phone.
  // The pull decides which: short, medium, long. From a ruck it is a box kick; at the posts, a drop goal.
  private kickStrip(g: Gfx, p: AttackPlay, a: Aim) {
    const opts: [string, boolean][] = a.drop ? [['DROP GOAL', true]] : a.kk === 'box' ? [['BOX KICK', true]]
      : p.penKick && p.koOnly ? [['KICK FOR TOUCH', true]]
      : p.koOnly ? [['BOMB', a.kk === 'high'], ['LONG KICK', a.kk === 'long']]
      : [['CHIP KICK', a.kk === 'low'], ['BOMB', a.kk === 'high'], ['LONG KICK', a.kk === 'long']];
    const w = opts.length === 1 ? 76 : 58, gap = 3, total = opts.length * w + (opts.length - 1) * gap, x0 = W / 2 - total / 2, y = TOP + 4;
    opts.forEach(([name, on], i) => {
      const x = x0 + i * (w + gap);
      g.card(x, y, w, 14, on ? C.gold : C.dark, on ? 1 : 0.75);
      g.label(name, x + w / 2, y + 3, 7.5, on ? C.dark : C.dim, { align: 1, bold: true });
    });
  }

  private drawLineout(g: Gfx, p: AttackPlay) {
    const m = this.m, lo = m.lo!, k = this.k, geo = this.loGeom();
    const th = p.att[p.thrower] ?? { x: geo.x, y: geo.edge };
    const tx = this.X(th.x), ty = this.Y(th.y);
    const at = (d: number) => geo.edge + geo.into * d;
    const end = (dist: number, ang: number) => ({ x: this.X(geo.x + Math.sin(ang) * dist), y: this.Y(at(Math.cos(ang) * dist)) });
    if (lo.phase === 'fly') {
      const e = end(lo.dist, lo.ang), nine = p.att[p.carrier];
      if (lo.t <= LO_FLY) {
        const fl = lo.t / LO_FLY;
        drawMatchBall(g, tx + (e.x - tx) * fl, ty + (e.y - ty) * fl - 12 * k - Math.sin(fl * Math.PI) * 14, k);
      } else if (lo.won) {
        // tapped down off the top to the halfback
        const fl = Math.min(1, (lo.t - LO_FLY) / LO_TAP), nx = this.X(nine.x) + 4 * k, ny = this.Y(nine.y) - 7 * k;
        drawMatchBall(g, e.x + (nx - e.x) * fl, e.y - 20 * k + (ny - (e.y - 20 * k)) * fl, k);
      } else drawMatchBall(g, e.x + 1.8 * this.sx, e.y - 20 * k, k);
      return;
    }
    drawMatchBall(g, tx + 5 * k, ty - 12 * k, k);
    const t = this.touch('ball'), a = t ? this.loAim(t) : null;
    if (t) { g.frame(t.x0 - 4, t.y0 - 4, 9, 9, C.ink); g.rect(t.x - 2, t.y - 2, 5, 5, C.gold, 0.8); }
    if (a) {
      const risk = a.dist > LO_OVER ? 0.3 : m.stealChance(a.dist, a.ang), col = risk < 0.14 ? C.ink : risk < 0.28 ? C.gold : C.red, e = end(a.dist, a.ang);
      let zone = 0;
      LO_ZONES.forEach((z, i) => { if (Math.abs(a.dist - z) < Math.abs(a.dist - LO_ZONES[zone])) zone = i; });
      this.dots(g, tx, ty - 6 * k, e.x, e.y - 6 * k, 3.5, 9, col, false);
      g.frame(e.x - 5, e.y - 18 * k, 11, 7, col);
      g.label(a.dist > LO_OVER ? 'Over the top, to the backs: risky' : `${LO_NAMES[zone]}${risk >= 0.28 ? ': risky' : ''}`, W / 2, geo.into > 0 ? H - 31 : TOP + 22, 9, col, { align: 1, bold: true });
    }
    if (this.showTutorial) {
      const hy = geo.into > 0 ? H - 14 : TOP;
      g.rect(this.left, hy, this.vw, 14, C.dark, 0.70);
      g.label('Pull to aim the throw. Release to throw.', W / 2, hy + 3, 7, C.ink, { align: 1 });
    }
  }

  private hud(g: Gfx) {
    const m = this.m, us = m.us, th = this.them, L = this.left, R = this.left + this.vw;
    g.rect(L, 0, this.vw, TOP, C.dark);
    g.rect(L + 4, 3, 5, 8, us.c1); g.rect(L + 4, 6, 5, 2, us.c2);
    g.label(us.id, L + 12, 3, 7, C.ink, { bold: true }); g.label(String(m.score[0]), L + 30, 0.5, 11, C.gold, { display: true });
    g.rect(R - 9, 3, 5, 8, th.c1); g.rect(R - 9, 6, 5, 2, th.c2);
    g.label(th.id, R - 12, 3, 7, C.ink, { bold: true, align: 2 }); g.label(String(m.score[1]), R - 30, 0.5, 11, C.gold, { display: true, align: 2 });
    const mins = Math.min(80, Math.floor(m.clock / 60)), secs = Math.floor(m.clock % 60);
    g.label(`${m.half === 1 ? '1st' : '2nd'}  ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, W / 2, 3, 7.5, C.ink, { align: 1, bold: true });
  }

  // Nothing sits over the pitch in open play. Before the ball is played there is the set-play button,
  // and for the first few phases a reminder of what each thumb does.
  private drawControls(g: Gfx, p: AttackPlay) {
    // Score and clock already live in the HUD. No permanent phase/name subtitles.
    if (p.state === 'maul') {
      const risk = p.maulRisk();
      if (this.showTutorial) {
        g.rect(this.left, H - 13, this.vw, 13, C.dark, 0.70);
        g.label('MAUL: tap to move the ball away', W / 2, H - 11, 7, C.ink, { align: 1 });
      } else if (risk > 0.15) g.label('USE IT', W / 2, H - 12, 9, C.red, { align: 1, bold: true });
      return;
    }
    if (p.koOnly && p.penKick) {
      // a penalty for touch: the wind, where it would land in still air, and the whole pitch in miniature
      const t = this.touch('ball'), a0 = t ? this.aimOf(t) : null, a = a0 ? p.aim(a0.ax, a0.ay, a0.power) : null, c = p.att[p.carrier];
      this.drawWind(g, this.left + 6, TOP + 16);
      if (a) { const ex = this.X(a.x), ey = this.Y(a.y); g.frame(ex - 7, ey - 4, 15, 9, C.gold); g.frame(ex - 4, ey - 2, 9, 5, C.ink); }
      this.miniMap(g, c, a);
      if (this.showTutorial) {
        g.rect(this.left, H - 14, this.vw, 14, C.dark, 0.7);
        g.label('Aim for touch: pull back, release to kick', W / 2, H - 12, 7, C.ink, { align: 1 });
      }
      return;
    }
    if (p.koOnly) {
      const tx = this.X(60);
      for (let y = 0; y < FW * this.sy; y += 6) g.rect(tx, this.Y(0) + y, 1, 3, C.gold, 0.8);
      if (this.showTutorial) {
        g.rect(this.left, H - 14, this.vw, 14, C.dark, 0.7);
        g.label('Kick past the 10m line: pull back, release', W / 2, H - 12, 7, C.ink, { align: 1 });
      }
      return;
    }
    if (p.state !== 'ready') return;
    if (this.canCall(p)) {
      const r = this.playsRect();
      g.card(r[0], r[1], r[2], r[3], this.bookOpen ? C.gold : C.dark, 0.85);
      g.label(p.playName ? tc(p.playName) : 'Set plays', r[0] + r[2] / 2, r[1] + 3, 7, this.bookOpen ? C.dark : C.ink, { align: 1, bold: true });
      if (this.bookOpen) this.book.forEach((f, i) => {
        const s = this.slotRect(i), on = p.playName === f.name;
        g.card(s[0], s[1], s[2], s[3], on ? C.gold : C.dark, 0.9);
        g.label(`${i + 1}  ${f.name}`, s[0] + 6, s[1] + 3.5, 7.5, on ? C.dark : C.ink, { bold: true });
      });
    }
    if (!this.showTutorial || this.plays > 2 || this.bookOpen) return;
    g.rect(this.left, H - 19, this.vw, 19, C.dark, 0.68);
    g.rect(W / 2, H - 17, 1, 14, C.ink, 0.3);
    g.label('LEFT: RUN', W / 2 - 7, H - 17, 7.5, C.gold, { align: 2, bold: true });
    g.label('Drag / flick', W / 2 - 7, H - 8, 6.5, C.ink, { align: 2 });
    g.label('RIGHT: PASS / KICK', W / 2 + 7, H - 17, 7.5, C.gold, { bold: true });
    g.label('Pull / release', W / 2 + 7, H - 8, 6.5, C.ink);
  }

  // A small bar low on the screen, so the pitch and the players stay in view behind it.
  private drawTiming(g: Gfx) {
    const t = this.m.timing!;
    const pw = 168, px = W / 2 - pw / 2, py = H - 31;
    g.card(px, py, pw, 28, C.dark, 0.74); g.rect(px + 1, py, pw - 2, 1, C.gold);
    const note = t.done ? (t.result === 'perfect' ? 'PENALTY' : t.result === 'good' ? 'SECURED' : 'LOST') : this.showTutorial ? 'TAP TO CONTEST' : 'RUCK';
    g.label(note, W / 2, py + 3, 7.5, t.done ? (t.result === 'miss' ? C.red : C.gold) : C.ink, { align: 1, bold: true });
    const bx = px + 8, bw = pw - 16, by = py + 14;
    g.rect(bx, by, bw, 8, C.panel);
    g.rect(bx + t.lo * bw, by, (t.hi - t.lo) * bw, 8, C.green);
    const mid = (t.lo + t.hi) / 2, half = (t.hi - t.lo) / 2 * t.sweet; // drawn exactly as wide as it really is
    g.rect(bx + (mid - half) * bw, by, Math.max(1, half * 2 * bw), 8, C.gold);
    g.rect(bx + t.pos * bw - 1, by - 2, 3, 12, C.ink);
  }

  private drawMenu(g: Gfx) {
    const m = this.m;
    g.card(70, 34, 180, 118, C.dark, 0.93); g.rect(71, 34, 178, 1, C.gold);
    g.label('Penalty to you', W / 2, 40, 13, C.gold, { align: 1, display: true });
    g.label(`${tc(where(m.spot.x))}, ${Math.round(FL - m.spot.x)} m out`, W / 2, 58, 8, C.ink, { align: 1 });
    m.options.forEach((o, i) => {
      if (button(this.game, g, 88, 74 + i * 25, 144, 21, o || 'Out of range for goal', { off: !o, primary: i === 0 && !!o, size: 9 })) m.choose(i);
    });
  }

  private drawSim(g: Gfx) {
    const s = this.m.sim!, n = Math.min(s.track.length, Math.floor(this.m.simT / 0.8) + 1);
    const x = W / 2 - 91, y = TOP + 16, w = 182;
    // Opposition possession is shown as a moving field marker, not a wall of commentary.
    g.card(x, y, w, this.showTutorial ? 46 : 39, C.dark, 0.84);
    g.label('THEIR ATTACK', W / 2, y + 4, 10, C.gold, { align: 1, bold: true });
    g.rect(x + 8, y + 20, w - 16, 10, PITCH.a);
    g.rect(x + 8, y + 20, 1, 10, C.ink); g.rect(x + w - 9, y + 20, 1, 10, C.ink);
    g.rect(x + w / 2, y + 20, 1, 10, C.ink, 0.55);
    const pos = clamp(s.track[Math.max(0, n - 1)] ?? 50, 0, 100);
    g.rect(x + 8 + (w - 16) * pos / 100 - 2, y + 18, 5, 14, C.gold);
    if (this.showTutorial) g.label('Tap to skip', W / 2, y + 34, 7, C.dim, { align: 1 });
  }

  private drawFullTime(g: Gfx) {
    const m = this.m, won = m.score[0] > m.score[1], drew = m.score[0] === m.score[1];
    g.card(46, 20, 228, 146, C.dark, 0.95); g.rect(47, 20, 226, 2, C.gold);
    g.label('Full time', W / 2, 27, 9, C.dim, { align: 1, bold: true });
    g.label(won ? 'You win!' : drew ? 'Draw' : 'Defeat', W / 2, 38, 16, won ? C.gold : drew ? C.ink : C.red, { align: 1, display: true });
    g.label(`${m.us.id}  ${m.score[0]} - ${m.score[1]}  ${this.them.id}`, W / 2, 60, 20, C.ink, { align: 1, display: true });
    if (m.note) g.label(m.note, W / 2, 86, 8, C.gold, { align: 1 });
    g.label(`Tries ${m.tries[0]} - ${m.tries[1]}`, W / 2, 98, 9, C.ink, { align: 1, bold: true });
    g.label(`${Math.round(m.stats.metres)} metres made   ${m.stats.breaks} tacklers beaten   ${m.stats.passes} passes`, W / 2, 112, 7.5, C.dim, { align: 1 });
    if (button(this.game, g, 100, 134, 120, 24, 'Continue', { primary: true, size: 10 })) this.onDone(m.result());
  }

  // ---- kicks at goal, on the pitch: the same pull-back, into the wind, with their man coming ----
  private goalKickEv(e: PEv) {
    const m = this.m, k = m.pk!;
    if (k.phase !== 'wait' && k.phase !== 'aim') return;
    if (e.t === 'down') {
      this.touches.clear();
      this.touches.set(e.id, { id: e.id, side: 'ball', x0: e.x, y0: e.y, x: e.x, y: e.y, hist: [], armed: true, last: 0, t0: this.now });
      m.startAim();
      return;
    }
    const t = this.touches.get(e.id);
    if (!t) return;
    t.x = e.x; t.y = e.y;
    if (e.t !== 'up') return;
    this.touches.delete(e.id);
    const a = this.aimOf(t);
    if (a) m.kickGoal(a.ax, a.ay, a.power);
  }

  // An arrow for the wind and bars for how hard it is blowing.
  private drawWind(g: Gfx, x: number, y: number) {
    const w = this.m.wind, force = Math.hypot(w.x, w.y), bars = force < 1.6 ? 1 : force < 3 ? 2 : 3;
    g.card(x, y, 62, 26, C.dark, 0.78);
    g.label('Wind', x + 5, y + 3, 6.5, C.dim);
    g.label(bars === 1 ? 'Light' : bars === 2 ? 'Fresh' : 'Strong', x + 5, y + 13, 7.5, bars === 3 ? C.red : C.ink, { bold: true });
    // the arrow points the way the ball will be pushed, in screen terms
    const cx = x + 46, cy = y + 13, ux = (w.x * this.sx) || 0.001, uy = w.y * this.sy, l = Math.hypot(ux, uy), dx = ux / l, dy = uy / l;
    for (let i = -6; i <= 6; i++) g.rect(cx + dx * i - 1, cy + dy * i - 1, 2, 2, C.gold);
    for (let i = 1; i <= 4; i++) { g.rect(cx + dx * (6 - i) - dy * i - 1, cy + dy * (6 - i) + dx * i - 1, 2, 2, C.gold); g.rect(cx + dx * (6 - i) + dy * i - 1, cy + dy * (6 - i) - dx * i - 1, 2, 2, C.gold); }
    for (let i = 0; i < 3; i++) g.rect(x + 5 + i * 5, y + 22, 4, 2, i < bars ? C.gold : C.panel2);
  }

  private drawGoalKick(g: Gfx) {
    const m = this.m, k = m.pk!, sc = this.k, conv = k.kind === 'conv';
    const fx = this.X(k.from.x), fy = this.Y(k.from.y);
    const list: { y: number; f: () => void }[] = [
      { y: MID - POST, f: () => { this.posts(g, 0); this.posts(g, FL); } },
      { y: k.from.y, f: () => drawPlayer(g, fx - 5 * sc, fy, m.us, 1, k.phase === 'fly' || k.phase === 'over' ? 'pass' : 'stand', 0, 1, sc) },
    ];
    // their charger: on the goal line until the thumb goes down, then coming hard
    if (conv) list.push({ y: k.cy, f: () => {
      const px = this.X(k.cx), py = this.Y(k.cy);
      if (k.phase === 'aim') { g.rect(px - 7 * sc, py + 3, 14 * sc, 1, C.red); g.rect(px - 1, py - 22 * sc, 3, 3, C.red); }
      drawPlayer(g, px, py, this.them, 2, k.phase === 'aim' ? 'run' : k.result === 'charged' ? 'dive' : 'stand', k.canAnim, -1, sc);
    } });
    list.sort((a, b) => a.y - b.y).forEach(o => o.f());

    if (k.phase === 'fly' || (k.phase === 'over' && k.result !== 'charged')) {
      const p = m.flightAt(k, k.phase === 'fly' ? Math.min(1, k.t / k.dur) : 1), bx = this.X(p.x), by = this.Y(p.y);
      drawAirborneBall(g, bx, by, p.z, sc);
    } else drawMatchBall(g, fx + 3 * sc, fy - 1, sc);

    this.drawWind(g, this.left + 6, TOP + 16);
    const dist = Math.round(Math.hypot(FL - k.from.x, MID - k.from.y));
    g.label(`${conv ? 'CONVERSION' : 'GOAL KICK'}   ${dist}m`, this.left + 6, TOP + 4, 7.5, C.gold, { bold: true });
    if (k.phase !== 'wait' && k.phase !== 'aim') return;
    const t = this.touch('ball'), a0 = t ? this.aimOf(t) : null, a = a0 ? m.aimGoal(a0.ax, a0.ay, a0.power) : null;
    if (t) { g.frame(t.x0 - 4, t.y0 - 4, 9, 9, C.ink); g.rect(t.x - 2, t.y - 2, 5, 5, C.gold, 0.8); }
    if (a) {
      // the line is where the ball goes in still air; the wind will move it, so aim off
      const reach = a.x >= FL, ex = this.X(a.x), ey = this.Y(a.y);
      this.dots(g, fx, fy, ex, ey, a.arc, 16, reach ? C.gold : C.ink, true);
      g.frame(ex - 5, ey - 3, 11, 7, reach ? C.gold : C.ink);
      if (!reach) g.label('Not far enough: pull back further', W / 2, H - 33, 8, C.red, { align: 1, bold: true });
    }
    if (this.showTutorial) {
      g.rect(this.left, H - 14, this.vw, 14, C.dark, 0.7);
      g.label('Pull back to aim. Release to kick. Watch the wind.', W / 2, H - 12, 7, C.ink, { align: 1 });
    }
  }
}
