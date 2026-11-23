import { Rng, clamp } from '../engine/rng';
import { PLAY, T, type Formation } from '../config';

// Pitch in metres: x runs 0 (our try line) to 100 (theirs), y runs 0 to FW across. In-goals are IG deep.
// MID is the middle of the pitch, where the posts are; POST is half the gap between them.
export const FL = 100, FW = 50, IG = 8, MID = FW / 2, POST = 2.8;

export interface Runner { id: number; risk: number; name: string; num: number; pos: string; spd: number; str: number; hnd: number; pas?: number; kck: number; sta: number; skin: number; star?: boolean }
export interface Tackler { spd: number; tkl: number; sta: number; skin: number }
export type Pose = 'run' | 'pass' | 'step' | 'fend' | 'fumble';
// job: 0 in open play, 1 bound into the ruck, 2 the tackled man. down: seconds left on the ground.
export interface Man extends Runner { x: number; y: number; down: number; anim: number; v: number; pose: Pose; poseT: number; job: 0 | 1 | 2; out: number; bx: number; by: number; gas: number }
// st: line = holding the defensive line, press = closing on the ball, dive = committed to a tackle,
// miss = on the ground after a tackle or a miss, cover = chasing back after being beaten.
export interface Def extends Tackler {
  x: number; y: number; st: 'line' | 'press' | 'dive' | 'miss' | 'cover'; t: number;
  dx: number; dy: number; stun: number; sweeper: boolean; anim: number; fooled: number; bound: boolean; bx: number; by: number;
  gas: number;              // what he has left for sprinting, 1 full to 0 empty
  wing?: boolean;           // on the end of their line: the quick men who come across to cover a break
  off: boolean;             // on the wrong side of the last ruck: must get back before he can play the ball
  v: number; react: number; // chasing a kick: his speed as he gets going, and the moment it takes him to turn
}

export type PlayEnd =
  | { k: 'try'; x: number; y: number; who: number }
  | { k: 'tackled'; x: number; y: number; support: number; who: number } // only ever in our own in-goal
  | { k: 'turnover'; x: number; y: number; why: 'knockon' | 'intercept' | 'touch' | 'kick' | 'charged' | 'stripped' | 'loose' | 'ruck' | 'holding' | 'short' | 'maul' }
  | { k: 'lineoutUs'; x: number; y: number; pen?: boolean }
  | { k: 'dropgoal'; good: boolean }
  | { k: 'dropout'; x: number };

// fatigue: 0 at kick-off to 1 at full time. Tired legs slow players with low stamina.
export interface StartCfg { x: number; y: number; kind: 'ruck' | 'open' | 'scrum' | 'lineout' | 'tap'; quick?: boolean; offAtt?: number; offDef?: number; fatigue?: number;
  // set: a real scrum or lineout is formed by the players first, and the ball comes out of it. edge: the touchline (0 or FW) a lineout is on.
  set?: boolean; edge?: number;
  // kickoff: our kick-off from halfway. ease: 0..1, how much slack an early-career opponent gives.
  kickoff?: boolean; ease?: number;
  // penKick: a penalty kicked for touch, from the mark. push: how far the wind carries a kicked ball, metres per second of flight.
  penKick?: boolean; push?: { x: number; y: number } }

// Where the three lineout jumpers stand, in metres in from touch: front, middle and back.
export const LO_SPOTS = [6, 10, 14];

// kk: the sort of kick. low skids through, high hangs, long goes for territory, box is the halfback's.
export type KickKind = 'low' | 'high' | 'long' | 'box' | 'drive';
export interface Aim { kind: 'pass' | 'kick'; x: number; y: number; dist: number; drop: boolean; chip: boolean; box: boolean; arc: number; kk: KickKind }
// How each kick behaves when it comes down: hang = seconds in the air (plus a little per metre),
// keep = share of its pace it keeps on landing, wild = how far off line a bounce can go (radians).
const KICKS: Record<KickKind, { arc: number; hang: number; per: number; keep: number; wild: number }> = {
  low: { arc: 4.6, hang: 0.82, per: 1 / 60, keep: 0.22, wild: 0.5 },  // a chip: up over the man in front and down a few metres on
  high: { arc: 11, hang: 3.0, per: 1 / 50, keep: 0.2, wild: 0.9 },    // an up-and-under: time to get under it
  long: { arc: 6.5, hang: 0.9, per: 1 / 20, keep: 0.5, wild: 0.4 },   // for territory: runs on after landing
  box: { arc: 10, hang: 3.4, per: 0, keep: 0.18, wild: 0.8 },
  drive: { arc: 2.6, hang: 0.3, per: 1 / 30, keep: 0.55, wild: 0.45 },   // a set-play kick: low and hard, into space, and it runs on         // hangs long enough to chase
};
export interface Tackle { t: number; dur: number; kind: 'front' | 'side' | 'behind'; who: number; by: number; dir: number }

// Running speed in metres per second. Lower both numbers to slow the whole game down.
// The slope is what separates a winger from a prop: at 94 a man is about 40% quicker than at 60.
const mps = (s: number) => (1.1 + s * 0.048) * T.runSpeed;
// How far back the defensive line starts, by restart type.
const GAP = { ruck: 10, scrum: 11, lineout: 13, tap: 11, open: 26 };
const GUARD = 4;            // the two ruck guards stand this far off it
const SPACING = 5;          // metres between attackers across the field
const STEP_T = 0.22;        // length of a sidestep in seconds
const WING_DEPTH = 8;       // how far behind their line the wingers stand
const SET_PLAY_DROP = 0.18; // how often a called play ends with one of its own passes dropped
const STEP_V = 6.2;         // sideways speed of a sidestep
const STEP_CD = 0.8;        // rest between sidesteps
const DIVE_T = 0.36;        // how long a tackler is in the air
const DIVE_V = 6.5;         // tackle dive speed, metres per second
const COMMIT = 2.3;         // a tackler dives from this far out
const REACH = 0.85;         // tackle contact radius: a tackler has to actually get to him
const TRY_DIVE = 3.2;       // the runner can dive for the line from this close: a lunge, not a leap

// How high a pass loops at the top of its flight, in metres. A short pass is flat and anyone in its way
// can take it. A long one is thrown high: it goes over the heads of the men in between (ours and theirs)
// and can only be caught where it comes down. That is how a winger is picked out with a cut-out pass.
export const passArc = (dist: number) => 0.3 + dist * 0.06 + Math.max(0, dist - 9) * 0.26;
const HEAD = 2.1; // a ball higher than this is out of reach

export class AttackPlay {
  att: Man[]; def: Def[]; carrier: number;
  ball = { x: 0, y: 0, z: 0, mode: 'held' as 'held' | 'pass' | 'kick' | 'bounce' | 'loose' | 'ground' | 'spill' | 'taken', vx: 0, vy: 0, vz: 0, bn: 0, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 1, target: -1, dist: 0, high: 3, cut: 1 };
  // ready: the ball is in hand and waiting for the player. live: open play. tackle: a tackle is being made.
  // ruck: the breakdown is forming. score: the ball is being grounded.
  // set: a scrum or lineout is formed and the ball is not out yet.
  state: 'ready' | 'live' | 'tackle' | 'ruck' | 'score' | 'set' | 'maul' | 'done' = 'ready';
  setKind: 'scrum' | 'lineout' | null = null;
  thrower = -1; jumpers: number[] = [];
  private rest: { line: number; guard: number } | null = null; // where the defence stands at a set piece; null = the ruck default
  end: PlayEnd | null = null;
  time = 0; startX: number;
  phase = 1;
  drift = 0;                 // -1 (towards the top touchline) .. 1 (towards the bottom). Set by the running thumb.
  stepT = 0; stepCd = 0; stepDir = 1; slowT = 0; diveT = 0; dived = false; scoreT = 0;
  flash = ''; flashT = 0; breaks = 0; passes = 0;
  ev: string[] = [];
  ord: number[];             // attackers in open play, from the top touchline to the bottom
  tk: Tackle | null = null;
  ruck: { x: number; y: number } | null = null; // the current breakdown
  atRuck = false;            // the ball is at the base of a ruck (so an upfield aim is a box kick)
  // Each new ruck bumps ruckSeq. The match then decides how it goes and sets ruckOk:
  // won / quick = our ball, steal = they take it, pen = we are penalised for holding on.
  ruckSeq = 0; ruckOk: 'wait' | 'won' | 'quick' | 'steal' | 'pen' = 'wait';
  ruckSupport = 0; lastGain = 0;
  private fat: number;
  private lineV = 0; private vx = 0; private vy = 0; private lat = 0;
  private kicked = false;    // the ball in play came off a boot, so winning it back is a chase, not a mistake
  private kickEnd: PlayEnd | null = null; private chip = false; private box = false;
  private kk: KickKind = 'long'; private kickX = 0; private lastStep = -9;
  rolling = false;           // the supporters have started their runs while the ball is still being aimed
  ruckEdge = 0;              // our ruckers' strength less theirs, at the current ruck
  chasers: number[] = [];    // our men going for a kicked ball
  private icheck = new Set<number>();
  private reslotT = 0; private ruckT = 0;
  private passer = -1;       // who threw the ball that is in the air; he cannot catch his own pass
  private pend: { e: PlayEnd; t: number } | null = null; // an ending that waits for its animation
  private lines = new Map<number, { x: number; y: number }[]>(); // designed running lines still to be run
  private heading = new Map<number, { ux: number; uy: number }>(); // the way a man was going when his line ran out: he keeps going
  private dummies = new Set<number>();  // men running decoy lines in the called play: not looked to as receivers
  private primary = -1;                 // the called play's main target, if it names one
  private latGoal = 0;                  // metres still to move across after a swipe has been let go
  private poise = false;                // the ball has just come out and is being aimed: the carrier holds his pace down
  private ease = 0;
  private geo = { x: 0, edge: 0, into: 1 }; // the lineout this passage started from
  koOnly = false;                       // a kick-off: the ball can only be kicked
  private koLive = false;               // our kick-off is in play and has not been touched yet
  penKick = false;                      // a penalty being kicked for touch
  private penLive = false;              // that kick is in play and nobody has touched it: out is our throw
  markOf = new Map<number, number>();   // which of our men is standing on each mark of the called play
  private script: { t: number; to: number; kx?: number; ky?: number }[] = [];
  private playAt = { x: 0, y: 0 };
  flipped = false;                      // the called play has been turned over for this side of the field
  private turns: { t: number; to: number; x: number; y: number }[] = []; // changes of direction the play makes, soonest first      // where the ball was when the play was called // passes the called play makes by itself, soonest first
  private only = -1;                    // a pass the play made for one man: nobody else of ours takes it
  noFumble = false;                     // the training board's preview shows the play as drawn, without the dropped ball
  private fumbleAt = -1; private scriptN = 0; private dropNext = false; // which of the play's own passes, if any, will be put down
  private goT = 0;                      // when this phase was started
  maulT = 0;                            // how long the maul has been going
  private catcher = -1;                 // their man going for a kicked ball; the others hold off him
  catches = 0;
  private spots = new Map<number, { x: number; y: number }>();   // where a called set play wants each man to start
  playName = '';

  constructor(runners: Runner[], tacklers: Tackler[], public cfg: StartCfg, private rng: Rng) {
    this.fat = clamp(cfg.fatigue ?? 0, 0, 1); this.ease = clamp(cfg.ease ?? 0, 0, 1);
    const idx = (pos: string) => Math.max(0, runners.findIndex(r => r.pos === pos));
    this.att = runners.map(r => ({ ...r, x: 0, y: 0, down: 0, anim: 0, v: 0, pose: 'run' as Pose, poseT: 0, job: 0 as const, out: 0, bx: 0, by: 0, gas: 1 }));
    const ci = cfg.kind === 'open' ? idx('FB') : idx('HB');
    this.carrier = ci;
    const c = this.att[ci];
    c.x = clamp(cfg.x, -IG + 1, FL - 0.3); c.y = clamp(cfg.y, 1.5, FW - 1.5);
    this.startX = c.x;
    if (cfg.kind === 'ruck') { this.ruck = { x: c.x + 1.4, y: c.y }; this.atRuck = true; }
    // A real scrum or lineout: the forwards are in it, bound, and stay there until the ball is played.
    const setPiece = cfg.set && (cfg.kind === 'scrum' || cfg.kind === 'lineout') ? cfg.kind : null;
    const pack: number[] = [];
    if (setPiece) {
      const into = (cfg.edge ?? 0) < MID ? 1 : -1, edge = cfg.edge ?? 0;
      this.geo = { x: c.x, edge, into };
      this.att.forEach((m, i) => { if (i !== ci && i !== cfg.offAtt && pack.length < 3 && ['FL', 'N8', 'LK', 'PR', 'HK'].includes(m.pos)) pack.push(i); });
      this.state = 'set'; this.setKind = setPiece; this.atRuck = true; this.ball.mode = 'ground';
      if (setPiece === 'scrum') {
        this.ruck = { x: c.x + 2.6, y: c.y }; this.ball.x = c.x + 1.3; this.ball.y = c.y + 2.2;
        pack.forEach((i, n) => { const m = this.att[i]; m.job = 1; m.bx = m.x = c.x + 1.8; m.by = m.y = c.y + (n - 1) * 1.5; });
      } else {
        // the halfback stands off the line; the three jumpers are the front, middle and back targets
        const lx = c.x; c.x = clamp(lx - 4, -IG + 1, FL - 1); c.y = edge + into * 10;
        this.ruck = { x: c.x + 1.5, y: c.y };
        pack.forEach((i, n) => { const m = this.att[i]; m.job = 1; m.bx = m.x = lx - 0.9; m.by = m.y = edge + into * LO_SPOTS[n]; });
        this.jumpers = [...pack];
        // the winger on that touchline throws it in
        const wings = this.att.map((m, i) => ({ m, i })).filter(o => o.m.pos === 'WG' && o.i !== ci && o.i !== cfg.offAtt);
        const w = wings.length ? (into > 0 ? wings[0] : wings[wings.length - 1]).i : -1;
        if (w >= 0) { const m = this.att[w]; m.job = 1; m.bx = m.x = lx; m.by = m.y = edge + into * 0.4; this.thrower = w; pack.push(w); }
        this.ball.x = lx; this.ball.y = edge;
      }
      this.startX = c.x;
      this.rest = { line: GAP[cfg.kind] + (setPiece === 'lineout' ? 2.5 : 0), guard: 0 };
    }

    // Formation: a staggered line either side of the ball, more men on the side with more room.
    const others = this.att.map((_, i) => i).filter(i => i !== ci && i !== cfg.offAtt && !pack.includes(i));
    const above = clamp(Math.round(others.length * (c.y - 1) / (FW - 2)), 1, others.length - 1);
    this.ord = [...others.slice(0, above), ci, ...others.slice(above)];
    this.att.forEach((m, i) => {
      if (i === ci) return;
      // A sin-binned player stays in the list, parked far off the pitch, so everyone else keeps their number.
      if (i === cfg.offAtt) { m.down = 1e9; m.x = -99; return; }
      if (pack.includes(i)) return; // already bound into the scrum or lineout
      const t = this.slotTarget(i, c);
      m.x = t.x; m.y = t.y;
    });
    // A formation from the play designer overrides the default shape, and gives men their running lines.
    if (PLAY.attack && !cfg.kickoff && !cfg.penKick) this.usePlay(PLAY.attack, true);

    // Defence: a flat line across the field with one sweeper behind it.
    const n = tacklers.length;
    this.def = tacklers.map((t, i) => ({
      ...t, st: 'line' as const, t: 0, dx: 0, dy: 0, stun: 0, anim: 0, fooled: 0, bound: false, bx: 0, by: 0, v: 0, react: 0, off: false, gas: 1,
      // the fullback sweeps behind the line: he is second from the end of the team sheet
      sweeper: i === Math.max(0, n - 2), x: 0, y: 0,
    }));
    if (cfg.offDef !== undefined && this.def[cfg.offDef]) { const o = this.def[cfg.offDef]; o.stun = 1e9; o.x = 999; }
    // their forwards are in the set piece too, opposite ours
    if (setPiece) this.def.filter(d => !d.sweeper && d.stun < 1e8).slice(2, 5).forEach((d, n) => {
      const m = this.att[pack[n]];
      if (!m) return;
      d.bound = true; d.bx = d.x = m.bx + (setPiece === 'scrum' ? 1.7 : 1.8); d.by = d.y = m.by;
    });
    const spots = setPiece ? this.restSpots(this.ruck!, this.rest!.line, 0) : this.restSpots({ x: c.x, y: c.y }, GAP[cfg.kind], cfg.kind === 'ruck' || cfg.kind === 'tap' ? GUARD + 1.4 : 0);
    this.def.forEach((d, i) => {
      const s = spots.get(i);
      if (!s) return;
      d.x = s.x + (cfg.kind === 'open' && !d.sweeper ? rng.range(-1.5, 1.5) : 0); d.y = s.y;
    });
    if (PLAY.defence && !cfg.kickoff && !cfg.penKick) this.setDefence(PLAY.defence);
    if (cfg.kickoff || cfg.penKick) {
      const kx = cfg.penKick ? cfg.x : 50, ky = cfg.penKick ? cfg.y : MID;
      this.penKick = !!cfg.penKick;
      // Our kick-off: the first five has the ball on halfway, the rest are strung along the line ready to
      // chase, and they are spread deep to receive it.
      const k = idx('FH');
      this.carrier = k; this.koOnly = true; this.atRuck = false; this.ruck = null;
      const rest = this.att.map((_, i) => i).filter(i => i !== k && this.att[i].down < 1e8);
      this.att[k].x = kx; this.att[k].y = ky;
      rest.forEach((i, n2) => { this.att[i].x = kx - 0.8; this.att[i].y = 3 + n2 * (FW - 6) / Math.max(1, rest.length - 1); });
      this.ord = [...rest, k].sort((p, q) => this.att[p].y - this.att[q].y);
      const back = this.def.filter(d => d.stun < 1e8);
      back.forEach((d, n2) => { d.x = d.sweeper ? Math.min(FL - 4, kx + 38) : Math.min(FL - 2, kx + 13 + (n2 % 3) * 9); d.y = d.sweeper ? MID : 4 + n2 * (FW - 8) / Math.max(1, back.length - 1); });
      this.ball.x = kx; this.ball.y = ky; this.startX = kx;
    }
    if (cfg.quick) for (let q = 0; q < 2; q++) { const d = this.def[rng.int(0, Math.min(5, n - 1))]; if (d.stun < 1e8) { d.stun = 1; d.x += 2; } }
    {
      const line = this.def.filter(d => !d.sweeper && d.stun < 1e8).sort((p, q) => p.y - q.y), quick = Math.max(...this.def.map(d => d.spd)) + 3;
      for (const d of [line[0], line[line.length - 1]]) if (d) { d.spd = Math.max(d.spd, quick); d.wing = true; }
    }
    { const h = this.att[this.carrier]; this.ball.x = h.x; this.ball.y = h.y; }
  }

  // Acceleration comes from pace: a winger is at full speed sooner than a prop.
  private acc(p: { spd: number }) { return (4.6 + (p.spd - 60) * 0.085) * T.runSpeed; }
  // Pace: the speed attribute, less what the match has taken out of him (stamina), less what this sprint has.
  private spd(p: { spd: number; sta: number; gas?: number }) { return mps(p.spd) * (1 - this.fat * (100 - p.sta) * 0.0045 * T.staminaUse) * (0.8 + 0.2 * (p.gas ?? 1)); }
  // A flat-out sprint empties the tank in about seven seconds for a man with poor stamina and fourteen for a
  // good one; easing off fills it again, slowly. So a long chase is won by the fitter man, and it shows.
  private burn(p: { sta: number; gas: number }, hard: boolean, dt: number) {
    p.gas = clamp(p.gas + (hard ? -(0.05 + (100 - p.sta) * 0.0018) * T.staminaUse : 0.045) * dt, 0, 1);
  }
  private dspd(d: Def) { return this.spd(d) * T.defSpeed * (1 - 0.1 * this.ease); }
  // Tackling is sharper or softer inside the defence's own 22, which is what makes tries hard or easy.
  private tkl(x: number) { return T.tackleSuccess * (x > 78 ? T.tryDifficulty : 1) * (1 - 0.3 * this.ease); }
  private free(m: Man) { return m.down <= 0 && m.job === 0; }
  private up(d: Def) { return d.stun <= 0 && d.st !== 'miss' && !d.bound; }
  private slot(i: number) { return this.ord.indexOf(i); }

  // Where a supporting player wants to be: in his channel, a step deeper for every channel away from the ball.
  private slotTarget(i: number, c: { x: number; y: number }) {
    const k = this.slot(this.carrier), s = this.slot(i), away = s - k, n = Math.abs(away);
    const room = away < 0 ? c.y - 1.5 : FW - 1.5 - c.y;
    const side = away < 0 ? k : this.ord.length - 1 - k;
    const gap = clamp(room / Math.max(1, side), 2.2, SPACING);
    const quick = clamp(mps(this.att[i].spd) / mps(76), 0.85, 1.25);
    return { x: Math.max(-IG + 0.5, c.x - (2.5 + T.attackDepth * n) * quick), y: clamp(c.y + away * gap, 1.2, FW - 1.2) };
  }

  // Where each defender stands when the defence is set: `line` metres past the ball, spread across the
  // field, with two guards closer in if `guard` is given.
  private restSpots(at: { x: number; y: number }, line: number, guard: number) {
    const out = new Map<number, { x: number; y: number }>();
    const liners = this.def.map((d, i) => ({ d, i })).filter(o => !o.d.sweeper && !o.d.bound && o.d.stun < 1e8).sort((p, q) => (p.d.y - q.d.y) || (p.i - q.i));
    const lx = Math.min(at.x + line, Math.max(FL - 0.5, at.x + 2));
    liners.forEach((o, n) => {
      const edgeIn = n === 0 ? 1.8 : n === liners.length - 1 ? -1.8 : 0;
      out.set(o.i, { x: Math.min(lx + (edgeIn ? WING_DEPTH : 0), FL + 3), y: clamp(at.y + (n - (liners.length - 1) / 2) * T.lineSpacing + (MID - at.y) * 0.45 + edgeIn, 2, FW - 2) });
    });
    if (guard > 0) {
      const g = liners.map(o => ({ i: o.i, y: out.get(o.i)!.y })).sort((p, q) => Math.abs(p.y - at.y) - Math.abs(q.y - at.y)).slice(0, 2).sort((p, q) => p.y - q.y);
      g.forEach((o, q) => out.set(o.i, { x: Math.min(at.x + guard, FL - 0.3), y: clamp(at.y + (q ? 2 : -2), 1, FW - 1) }));
    }
    this.def.forEach((d, i) => { if (d.sweeper && d.stun < 1e8) out.set(i, { x: Math.min(lx + 21, FL + 4), y: at.y * 0.5 + MID / 2 }); });
    return out;
  }

  // Calls a saved set play. The supporters walk to their marks (or start on them, at a restart), and when
  // the ball is played each runs his drawn line at his own pace, then goes back to normal support play.
  // Marks and lines are relative to the ball: x metres behind (negative) or ahead, y metres across.
  usePlay(f: Formation | null, instant = false) {
    this.spots.clear(); this.lines.clear(); this.heading.clear(); this.dummies.clear(); this.primary = -1; this.playName = ''; this.markOf.clear(); this.script = []; this.turns = [];
    if (!f || this.state !== 'ready') return;
    const c = this.att[this.carrier];
    const ox = c.x, oy = c.y; // marks, runs and kicks are all measured from where the ball is now
    this.playAt = { x: ox, y: oy };
    // Plays are drawn with the open side below the ball: a lineout on the top touchline, a scrum with room
    // underneath it. On the other side of the field the whole play is turned over, runs, passes, kicks and all.
    const flip = f.from === 'lineout' ? (oy > MID ? -1 : 1) : oy > MID + 6 ? -1 : 1;
    this.flipped = flip < 0;
    if (instant && f.start && (f.start.x || f.start.y)) {
      // on the training ground the man with the ball can start somewhere else
      c.x = clamp(ox + Math.min(0, f.start.x), -IG + 0.5, FL - 0.5); c.y = clamp(oy + f.start.y * flip, 1, FW - 1);
      this.ball.x = c.x; this.ball.y = c.y;
    }
    const men = this.ord.filter(i => i !== this.carrier && this.free(this.att[i])); // forwards bound into a scrum or lineout have no mark
    const marks = f.spots.map((sp, idx) => ({ sp, idx })).sort((p, q) => (p.sp.y - q.sp.y) * flip);
    let starter = -1;
    // spread the marks over the men who are actually free, keeping top-to-bottom order
    // one man to a mark, top to bottom. With more men than marks (a play drawn for six backs, called at a
    // ruck with eight men free) the marks go to men spread evenly across the line and the rest play as normal.
    const pick = (k: number, of: number, from: number) => (of <= 1 ? 0 : Math.round(k * (from - 1) / (of - 1)));
    const markFor = new Map<number, (typeof marks)[number]>();
    if (men.length >= marks.length) marks.forEach((mk, k) => markFor.set(men[pick(k, marks.length, men.length)], mk));
    else men.forEach((i, n) => markFor.set(i, marks[pick(n, men.length, marks.length)]));
    men.forEach(i => {
      const mk = markFor.get(i);
      if (!mk) return;
      const sp = mk.sp;
      if (!this.markOf.has(mk.idx)) this.markOf.set(mk.idx, i);
      const at = { x: clamp(ox + Math.min(sp.x, -0.5), -IG + 0.5, FL - 0.5), y: clamp(oy + sp.y * flip, 1, FW - 1) };
      this.spots.set(i, at);
      if (instant) { this.att[i].x = at.x; this.att[i].y = at.y; }
      if (sp.path?.length) this.lines.set(i, sp.path.map(p => ({ x: clamp(at.x + p.x, -IG + 0.5, FL + IG - 1), y: clamp(at.y + p.y * flip, 1, FW - 1) })));
      if (sp.recv === false) this.dummies.add(i);
      if (f.primary === mk.idx && sp.recv !== false) this.primary = i;
      if (f.ball === mk.idx) starter = i;
    });
    // On the training ground a play can start with the ball in somebody else's hands. In a match the
    // ball is wherever the ruck, scrum or lineout left it.
    if (instant && starter >= 0) {
      const m = this.att[starter];
      this.carrier = starter; this.ball.x = m.x; this.ball.y = m.y;
      this.lines.delete(starter); this.dummies.delete(starter); this.spots.delete(starter);
      this.ord.sort((p, q) => this.att[p].y - this.att[q].y);
    }
    this.playName = f.name;
    // a mark, or (from 100 up) a man named by his place in the side: a forward or the halfback
    const manOf = (to: number) => (to >= 100 ? (this.att[to - 100] ? to - 100 : -1) : this.markOf.get(to) ?? -1);
    this.script = [
      ...(f.passes ?? []).map(p => ({ t: p.t, to: manOf(p.to) })).filter(p => p.to >= 0),
      ...(f.kicks ?? []).map(k => ({ t: k.t, to: -1, kx: ox + k.x, ky: oy + k.y * flip })),
    ].sort((p, q) => p.t - q.t);
    this.rollFumble();
    this.turns = (f.turns ?? []).map(k => ({ t: k.t, to: manOf(k.to), x: clamp(ox + k.x, -IG + 0.5, FL + IG - 1), y: clamp(oy + k.y * flip, 1, FW - 1) })).filter(k => k.to >= 0).sort((p, q) => p.t - q.t);
  }

  get scripted() { return this.script.length > 0; }
  // Called once the play's passes are known: 18 times in 100 one of them, picked at random, is dropped.
  private rollFumble() {
    const n = this.script.filter(p => p.kx === undefined).length;
    this.scriptN = 0; this.dropNext = false;
    this.fumbleAt = !this.noFumble && n > 0 && this.rng.chance(SET_PLAY_DROP) ? this.rng.int(0, n - 1) : -1;
  }

  // A kick the play makes by itself, to a point: a chip if it is short, a bomb in the middle, long beyond that.
  private kickTo(x: number, y: number) {
    const c = this.att[this.carrier];
    if (this.ball.mode !== 'held') return;
    const L = { x: clamp(x, c.x - 5, FL + IG - 1), y }, dist = Math.hypot(L.x - c.x, L.y - c.y);
    if (dist < 2) return;
    c.pose = 'pass'; c.poseT = 0.3; this.poise = false; this.latGoal = 0; this.ev.push('kick');
    this.launch(c, L, dist, 'drive'); // never a bomb: a set-play kick is hit low and hard into the space
  }

  // A pass the play makes by itself: to that man, where he will be when it gets there, and never forward.
  private passTo(i: number) {
    const c = this.att[this.carrier], m = this.att[i], b = this.ball;
    if (i === this.carrier || !m || !this.free(m) || b.mode !== 'held') return;
    const fly = 0.1 + Math.hypot(m.x - c.x, m.y - c.y) / T.passSpeed;
    const tx = Math.min(m.x + m.v * fly * 0.85, c.x - 0.2), ty = clamp(m.y, 0.5, FW - 0.5), dist = Math.hypot(tx - c.x, ty - c.y);
    Object.assign(b, { mode: 'pass', fx: c.x, fy: c.y, tx, ty, t: 0, dur: 0.1 + dist / T.passSpeed, dist, target: i });
    this.passer = this.carrier; this.icheck.clear(); this.passes++; this.ev.push('pass'); this.only = i;
    this.dropNext = this.scriptN++ === this.fumbleAt;
    c.pose = 'pass'; c.poseT = 0.3; this.poise = false; this.latGoal = 0;
  }

  // Stands the defence where a designed formation puts it (marks are metres ahead of the ball and across).
  setDefence(f: Formation) {
    const c = this.att[this.carrier];
    this.def.filter(d => d.stun < 1e8).forEach((d, n) => { const sp = f.spots[n]; if (sp) { d.x = clamp(c.x + Math.max(1, sp.x), c.x + 1, FL + 4); d.y = clamp(c.y + sp.y, 1, FW - 1); } });
  }

  // The ball comes out of the scrum or lineout to the halfback. From here it is the player's.
  releaseSet(quick = false) {
    if (this.state !== 'set') return;
    const c = this.att[this.carrier];
    this.ball.mode = 'held'; this.ball.x = c.x; this.ball.y = c.y; this.ball.z = 0;
    this.state = 'ready'; this.atRuck = true;
    if (quick) { const slow = this.def.filter(d => this.up(d) && !d.sweeper); for (let q = 0; q < 2 && slow.length; q++) this.rng.pick(slow).stun = 0.9; }
  }

  // A lineout catch that the forwards close around and drive. It goes forward as a body until the player
  // plays the ball away (playMaul), it is driven over the line, or they hold it up.
  startMaul(zone: number) {
    if (this.state !== 'set' || this.setKind !== 'lineout') return;
    const j = this.att[this.jumpers[zone] ?? this.jumpers[0]] ?? this.att[this.carrier];
    this.ruck = { x: j.x + 0.6, y: j.y }; this.maulT = 0; this.state = 'maul';
    this.ball.mode = 'ground'; this.ball.x = j.x; this.ball.y = j.y; this.ball.z = 0;
    this.flash = 'MAUL!'; this.flashT = 0.9;
  }

  // The chance per second that they hold it up. Nothing for three seconds, then it climbs.
  maulRisk() { return clamp((this.maulT - 3) * 0.05, 0, 0.5); }

  // The halfback takes it from the back of the maul. From here it is a ruck ball like any other.
  playMaul() {
    if (this.state !== 'maul') return;
    const c = this.att[this.carrier];
    this.ball.mode = 'held'; this.ball.x = c.x; this.ball.y = c.y; this.ball.z = 0;
    this.state = 'ready'; this.atRuck = true;
  }

  private mauling(dt: number) {
    const r = this.ruck!, rng = this.rng;
    this.maulT += dt;
    const ours = this.att.filter(m => m.job === 1), theirs = this.def.filter(d => d.bound);
    const avg = (a: number[]) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
    const edge = avg(ours.map(m => m.str)) - avg(theirs.map(d => d.tkl)) + (ours.length - theirs.length) * 4;
    const v = clamp(0.6 + edge * 0.025, 0.15, 1.3) * Math.min(1, this.maulT / 0.8);
    r.x += v * dt;
    ours.forEach((m, k) => { const tx = r.x - 0.7 - (k % 2) * 0.9, ty = r.y + (k - (ours.length - 1) / 2) * 0.8; this.moveTo(m, tx, ty, 3.2, dt); m.bx = tx; m.by = ty; });
    theirs.forEach((d, k) => { const tx = r.x + 0.7 + (k % 2) * 0.8, ty = r.y + (k - (theirs.length - 1) / 2) * 0.8; this.moveTo(d, tx, ty, 3.2, dt); d.bx = tx; d.by = ty; });
    const c = this.att[this.carrier];
    this.moveTo(c, r.x - 2.8, r.y + this.geo.into * 1.2, this.spd(c), dt);
    this.ball.x = r.x - 0.9; this.ball.y = r.y;
    // everybody else goes with it: our backs keep their depth, their line gives ground to stay onside
    this.att.forEach((m, i) => { if (i !== this.carrier && this.free(m)) { m.x += v * dt; if (v > 0.3) m.anim += dt * 5; } });
    for (const d of this.def) if (this.up(d) && !d.sweeper && d.x < r.x + 4.5) this.moveTo(d, r.x + 5, d.y, this.dspd(d) * 0.6, dt);
    if (r.x >= FL) {
      // driven over
      const i = this.att.findIndex(m => m.job === 1);
      if (i >= 0) { const m = this.att[i]; m.job = 0; m.x = Math.max(m.x, FL - 0.2); this.carrier = i; this.ball.mode = 'held'; }
      this.state = 'score'; this.scoreT = 0.45; this.dived = true; this.ev.push('good');
      return;
    }
    if (rng.chance(this.maulRisk() * dt)) {
      this.flash = 'HELD UP!'; this.flashT = 1; this.ev.push('tackle');
      this.pend = { e: { k: 'turnover', x: clamp(r.x, 1, FL - 1), y: r.y, why: 'maul' }, t: 0.9 };
    }
  }

  // The passing thumb has gone down. Aiming is not playing: at a ruck, a scrum or a lineout nothing starts
  // until the ball actually leaves the hands (release) or the running thumb sets off with it (run). The one
  // exception is a called play that passes by itself, which this touch starts.
  startRuns() {
    if (this.state !== 'ready' || this.koOnly || !this.script.length) return;
    this.poise = false;
    this.go();
  }

  // The running thumb: carry it yourself, at full pace.
  run() { this.poise = false; this.go(); }

  // A swipe that has been let go carries on: the runner keeps moving across by about this many metres.
  shift(metres: number) { if (this.state === 'live' && this.ball.mode === 'held') this.latGoal = clamp(metres, -18, 18); }

  // A runner's channel, bent towards the nearest gap between defenders in front of him. He stays in his
  // own part of the field (so the line keeps its width and two men never pick the same hole); quick men
  // range further for a gap, strong men are happy with a narrow one.
  private gapY(m: Man, y: number, ballX: number): number {
    const ys = this.def.filter(d => this.up(d) && !d.sweeper && d.x > ballX - 1 && d.x < ballX + 16).map(d => d.y).sort((p, q) => p - q);
    if (ys.length < 2) return y;
    const reach = 2.6 + clamp((m.spd - 60) / 16, 0, 2), need = 3.2 - clamp((m.str - 60) / 40, 0, 1);
    let best = y, bd = reach;
    for (let k = 0; k <= ys.length; k++) {
      const lo = k === 0 ? 0 : ys[k - 1], hi = k === ys.length ? FW : ys[k];
      if (hi - lo < need) continue;
      const mid = k === 0 ? Math.max(1.5, hi - 2.6) : k === ys.length ? Math.min(FW - 1.5, lo + 2.6) : (lo + hi) / 2;
      if (Math.abs(mid - y) < bd) { bd = Math.abs(mid - y); best = mid; }
    }
    return best;
  }

  // Their kick-off, coming to us from (fx, fy). The ball is in the air and nobody has it: our men get
  // under it, theirs chase it, and play is live from the moment it is caught or picked up.
  receiveKick(fx: number, fy: number) {
    const c = this.att[this.carrier], b = this.ball, rng = this.rng;
    const to = { x: c.x, y: c.y };
    // the catcher is not standing on the spot: he has to move to it
    c.x = clamp(c.x + rng.range(-6, 2), 2, FL - 2); c.y = clamp(c.y + rng.range(-5, 5), 2, FW - 2);
    this.state = 'live'; this.atRuck = false; this.kk = 'high'; this.kicked = false; this.kickEnd = null; this.kickX = fx; this.passer = -1;
    const dist = Math.hypot(to.x - fx, to.y - fy);
    Object.assign(b, { mode: 'kick', x: fx, y: fy, z: 0, fx, fy, tx: to.x, ty: to.y, t: 0, dist, dur: 3.3, high: 12, target: -1, cut: 1 });
    for (const d of this.def) { d.react = rng.range(0, 0.25); d.v = this.dspd(d) * 0.8; } // their chasers are already coming
    this.ev.push('kick');
  }

  // A lineout throw sent over the top to the backs: dist metres in from touch, ang radians off straight.
  // It is a real ball in the air. Whoever can get under it does, theirs included.
  longThrow(dist: number, ang: number) {
    if (this.state !== 'set' || this.setKind !== 'lineout') return;
    const g = this.geo, t = this.att[this.thrower] ?? this.att[this.carrier], b = this.ball;
    const e = this.rng.norm(0, 0.05) + ang;
    const to = { x: g.x + Math.sin(e) * dist, y: clamp(g.edge + g.into * Math.cos(e) * dist, 1, FW - 1) };
    this.state = 'ready'; this.go();
    Object.assign(b, { mode: 'pass', x: t.x, y: t.y, z: 0, fx: t.x, fy: t.y, tx: to.x, ty: to.y, t: 0, dist, dur: 0.3 + dist / 12, target: -1 });
    this.passer = this.thrower; this.icheck.clear(); this.passes++; this.ev.push('pass');
    b.target = this.receiver();
  }

  // The player starts the phase. Men bound into the ruck peel off and rejoin.
  go() {
    if (this.state !== 'ready' || this.koOnly) return; // a kick-off or a kick for touch has to be kicked
    this.state = 'live'; this.goT = this.time;
    if (!this.atRuck) return;
    this.atRuck = false;
    for (const m of this.att) if (m.job === 1) m.out = 0.5;
    for (const d of this.def) if (d.bound) { d.bound = false; d.stun = 0.6; }
    // anyone still on our side of the ruck is offside until he has got back round
    const line = (this.ruck?.x ?? 0) + 0.5;
    for (const d of this.def) d.off = d.stun < 1e8 && !d.sweeper && d.x < line;
  }

  // A sidestep. dir -1 is up the screen, 1 is down. A tackler who is about to hit dives at where the
  // runner was heading, so a step at the right moment leaves him on the ground.
  sidestep(dir: number) {
    if (this.state === 'ready') this.go();
    if (this.state !== 'live' || this.stepCd > 0 || this.ball.mode !== 'held' || this.diveT > 0) return;
    const c = this.att[this.carrier];
    this.stepDir = dir < 0 ? -1 : 1;
    this.stepT = STEP_T; this.stepCd = STEP_CD;
    c.pose = 'step'; c.poseT = STEP_T + 0.08;
    const far = T.stepWindow + (c.spd - 75) * 0.03;
    const spam = this.time - this.lastStep < 2.2 ? 0.55 : 0; // a second step straight after the first is read
    this.lastStep = this.time;
    for (const d of this.def) {
      if (!this.up(d) || (d.st !== 'press' && d.st !== 'line') || d.x < c.x - 0.3) continue;
      const q = Math.hypot(d.x - c.x, d.y - c.y);
      if (q > far || q < 1.5) continue; // too early and he adjusts; too late and he already has him
      // A good tackler often reads the step and stays on his feet.
      if (this.rng.chance(clamp((0.3 + (d.sweeper ? 0.45 : 0) + (d.tkl - c.spd) * 0.007 + spam) * this.tkl(c.x), 0.08, 0.92))) continue;
      const t = q / (DIVE_V + this.vx);
      this.commit(d, c.x + this.vx * t, c.y + this.vy * t);
      d.fooled = 1;
    }
    this.ev.push('step');
  }

  // A dive for the line, from close in. It gets under most tackles, but come up short and that is a ruck.
  canDive() { return this.state === 'live' && this.ball.mode === 'held' && this.diveT <= 0 && this.att[this.carrier].x >= FL - TRY_DIVE; }
  dive() {
    if (this.state === 'ready') this.go();
    if (!this.canDive()) return;
    this.diveT = 0.24; this.dived = true; this.stepT = 0;
    this.ev.push('step');
  }

  // How close a tackler gets before he leaves his feet. A good one stays up and tracks his man longer;
  // a poor one goes early, and can be run round.
  private commitAt(d: Def) { return d.sweeper ? 1.35 : clamp(1.45 + (85 - d.tkl) * 0.012, 1.35, Math.min(COMMIT, 1.95)); }

  private commit(d: Def, ax: number, ay: number) {
    const dx = ax - d.x, dy = ay - d.y, l = Math.hypot(dx, dy) || 1;
    d.st = 'dive'; d.t = DIVE_T; d.dx = dx / l; d.dy = dy / l;
  }

  // What the passing thumb is aiming. (ax, ay) is the direction the ball will go, power 0..1 its length.
  // Pointing up the field is a kick (a box kick from the base of a ruck); anything else is a pass.
  aim(ax: number, ay: number, power: number): Aim | null {
    const l = Math.hypot(ax, ay);
    if (l <= 0 || (this.state !== 'ready' && this.state !== 'live') || this.ball.mode !== 'held' || this.diveT > 0) return null;
    const c = this.att[this.carrier], ux = ax / l, uy = ay / l;
    power = clamp(power, 0, 1);
    if (this.koOnly && this.penKick) {
      // a penalty for touch: any direction but backwards, and a long ball
      if (ux < -0.2) return null;
      const dist = (12 + 40 * power) * (0.75 + c.kck / 400) * T.kickDist;
      return { kind: 'kick', x: c.x + ux * dist, y: c.y + uy * dist, dist, drop: false, chip: false, box: false, arc: KICKS.long.arc * T.kickHeight, kk: 'long' };
    }
    if (this.koOnly) {
      // a kick-off: forward only, at least far enough to reach the ten-metre line; a short pull hangs high
      if (ux < 0.35) return null;
      const kk: KickKind = power < 0.4 ? 'high' : 'long';
      const dist = Math.max(11, (5 + 43 * power) * (0.75 + c.kck / 400) * T.kickDist);
      return { kind: 'kick', x: c.x + ux * dist, y: c.y + uy * dist, dist, drop: false, chip: false, box: false, arc: KICKS[kk].arc * T.kickHeight, kk };
    }
    if (ux <= 0.3) {
      const dist = 3 + 21 * power;
      return { kind: 'pass', x: c.x + ux * dist, y: c.y + uy * dist, dist, drop: false, chip: false, box: false, arc: passArc(dist), kk: 'low' };
    }
    const box = this.state === 'ready' && this.atRuck;
    // a short pull is a chip of 5 to 11 metres; beyond that the range opens out
    const dist = (box ? (9 + 17 * power) * (0.8 + c.kck / 500) : power < 0.3 ? (5 + 20 * power) * (0.85 + c.kck / 650) : (6 + 49 * power) * (0.75 + c.kck / 400)) * T.kickDist;
    const x = c.x + ux * dist, y = c.y + uy * dist;
    let drop = false;
    if (!box && c.x >= 55 && x >= FL) {
      const yAt = c.y + (y - c.y) * ((FL - c.x) / (x - c.x));
      drop = Math.abs(yAt - MID) < 3.6;
    }
    const kk: KickKind = box ? 'box' : power < 0.3 ? 'low' : power < 0.62 ? 'high' : 'long';
    return { kind: 'kick', x, y, dist, drop, chip: kk === 'low', box, arc: KICKS[kk].arc * T.kickHeight, kk };
  }

  // Lets the ball go along the aimed line.
  release(ax: number, ay: number, power: number) {
    const a = this.aim(ax, ay, power);
    if (!a) return;
    this.script = []; this.only = -1; // the player has taken over
    const wasKo = this.koOnly;
    this.koOnly = false;
    this.go();
    if (wasKo) {
      // the chasers have timed their run: they cross halfway at pace as the ball is struck
      if (this.penKick) this.penLive = true; else this.koLive = true;
      this.att.forEach((m, i) => { if (i !== this.carrier) m.v = this.spd(m) * 0.8; });
    }
    const c = this.att[this.carrier], rng = this.rng;
    c.pose = 'pass'; c.poseT = 0.3; this.stepT = 0; this.poise = false; this.latGoal = 0;
    const turn = (sd: number) => {
      const e = rng.norm(0, sd), cs = Math.cos(e), sn = Math.sin(e), ux = (a.x - c.x) / a.dist, uy = (a.y - c.y) / a.dist;
      return { x: c.x + (ux * cs - uy * sn) * a.dist, y: c.y + (ux * sn + uy * cs) * a.dist };
    };
    if (a.kind === 'pass') {
      // Good hands put it where it was aimed. Poor hands are a little off, never wildly.
      const to = turn(Math.max(0, 90 - (c.pas ?? c.hnd)) * 0.002 / T.passAccuracy);
      Object.assign(this.ball, { mode: 'pass', fx: c.x, fy: c.y, tx: to.x, ty: to.y, t: 0, dur: 0.1 + a.dist / T.passSpeed, dist: a.dist, target: -1 });
      this.passer = this.carrier;
      this.ball.target = this.receiver();
      this.icheck.clear(); this.passes++; this.ev.push('pass');
      return;
    }
    this.ev.push('kick');
    const pressure = this.def.some(d => this.up(d) && Math.hypot(d.x - c.x, d.y - c.y) < 2.4);
    {
      // A charge-down needs a defender right on the kicker and in the line of the kick. Then the ball
      // comes off him and is loose for either side; nothing is whistled.
      const ux = (a.x - c.x) / a.dist, uy = (a.y - c.y) / a.dist;
      const blocker = this.def.find(d => this.up(d) && !d.off && Math.hypot(d.x - c.x, d.y - c.y) < 1.5 && ((d.x - c.x) * ux + (d.y - c.y) * uy) / (Math.hypot(d.x - c.x, d.y - c.y) || 1) > 0.6);
      if (blocker && rng.chance(0.4)) {
        const b = this.ball;
        this.kicked = false; this.kickEnd = null; this.kk = 'low'; this.passer = -1;
        Object.assign(b, { mode: 'bounce', x: blocker.x, y: blocker.y, z: 1.2, bn: 1, t: 0, tx: blocker.x, ty: blocker.y, vx: rng.range(-3, 3), vy: rng.range(-4, 4), vz: 3.5 });
        this.flash = 'CHARGED DOWN!'; this.flashT = 0.8; this.ev.push('tackle');
        return;
      }
    }
    if (a.drop) {
      const dist = Math.hypot(FL - c.x, MID - c.y);
      const p = clamp(0.9 - (dist - 15) / 45 + (c.kck - 75) / 120 - (pressure ? 0.3 : 0), 0.02, 0.95);
      this.finish({ k: 'dropgoal', good: rng.chance(p) });
      return;
    }
    // A poor kicker sprays it.
    const L = turn((100 - c.kck) * (this.penLive ? 0.0025 : 0.0035));
    if (this.penLive && this.cfg.push) {
      // the aiming line is still air; the wind carries the real ball for as long as it is up
      const up = KICKS[a.kk].hang + a.dist * KICKS[a.kk].per;
      L.x += this.cfg.push.x * up; L.y += this.cfg.push.y * up;
    }
    this.launch(c, L, Math.hypot(L.x - c.x, L.y - c.y), a.kk);
  }

  // Who is best placed to get to where the pass is going: the man who can be there soonest, counting
  // the pace he already has. The ball goes where it was aimed; this only decides who runs for it.
  private receiver(): number {
    const b = this.ball;
    let best = -1, bt = 1e9, pt = 1e9;
    this.att.forEach((m, i) => {
      if (i === this.passer || !this.free(m) || this.dummies.has(i)) return;
      const eta = Math.hypot(b.tx - m.x, b.ty - m.y) / Math.max(2, (this.spd(m) + m.v) / 2);
      if (i === this.primary) pt = eta;
      if (eta < bt) { bt = eta; best = i; }
    });
    return pt <= bt + 0.5 ? this.primary : best;
  }

  // A player gets his hands to the ball. Returns true if he drops it.
  private take(i: number, base: number): boolean {
    const r = this.att[i], b = this.ball;
    // An easy ball to a man in space is caught. What makes a catch hard is a tackler arriving with it,
    // a ball he has to reach for, or one picked up off the ground; then his hands decide it.
    const hands = 1 + Math.max(0, 80 - r.hnd) / 25;
    const pressure = this.def.some(d => this.up(d) && Math.hypot(d.x - r.x, d.y - r.y) < 1.4) ? 0.006 * hands : 0;
    const reach = Math.max(0, Math.hypot(r.x - b.x, r.y - b.y) - 1) * 0.006 * hands;
    const doomed = this.dropNext && b.mode === 'pass';
    this.dropNext = false;
    if (doomed || !this.rng.chance(1 - ((1 - base) * hands + pressure + reach) * T.knockOns / T.passAccuracy)) {
      r.pose = 'fumble'; r.poseT = 1.5;
      this.spill(r, 1, { k: 'turnover', x: r.x, y: r.y, why: 'knockon' }, 'KNOCK ON!');
      return true;
    }
    if (b.mode === 'pass') this.catches++;
    this.only = -1;
    this.koLive = false; this.penLive = false;
    this.carrier = i; this.passer = -1; b.mode = 'held'; b.x = r.x; b.y = r.y; b.z = 0;
    this.vx = r.v; this.vy = 0;
    return false;
  }

  // The ball comes loose and bounces away where everyone can see it, and only then is the whistle blown.
  private spill(from: { x: number; y: number }, dir: number, e: PlayEnd, say: string) {
    const b = this.ball;
    Object.assign(b, { mode: 'spill', fx: from.x + 0.4 * dir, fy: from.y, tx: from.x + dir * this.rng.range(2, 3.2), ty: clamp(from.y + this.rng.range(-1.2, 1.2), 0.3, FW - 0.3), t: 0, dur: 0.6 });
    this.pend = { e, t: 1.25 };
    this.flash = say; this.flashT = 1.2; this.ev.push('knock');
  }

  private launch(c: Man, L: { x: number; y: number }, dist: number, kk: KickKind) {
    const kd = KICKS[kk];
    this.chip = kk === 'low'; this.box = kk === 'box'; this.kk = kk; this.kicked = true; this.kickX = c.x;
    // the defence has to see it, turn and get going; nobody starts at full pace
    for (const d of this.def) { d.react = (d.sweeper ? this.rng.range(0.3, 0.6) : this.rng.range(0.5, 0.9)) + 0.25 * this.ease; d.v = 0; }
    this.kickEnd = this.resolveKick(c, L);
    // A kick that is going out on the full is still in the air when it crosses the line: it flies the
    // first part (cut) of its whole arc, so nobody standing on the touchline plucks it off the grass.
    let tx = L.x, ty = L.y, cut = 1;
    if (L.y < 0 || L.y > FW) { const t = ((L.y < 0 ? 0 : FW) - c.y) / (L.y - c.y); tx = c.x + (L.x - c.x) * t; ty = L.y < 0 ? 0 : FW; cut = clamp(t, 0.05, 1); }
    Object.assign(this.ball, {
      mode: 'kick', fx: c.x, fy: c.y, tx: Math.min(tx, FL + IG), ty, t: 0, target: -1, dist,
      dur: (kd.hang + dist * kd.per) * Math.sqrt(T.kickHeight) * cut, high: kd.arc * T.kickHeight, cut,
    });
  }

  // A kick that never lands in the field: out on the full, or dead. Anything that lands is played for.
  private resolveKick(c: Man, L: { x: number; y: number }): PlayEnd | null {
    if (L.y < 0 || L.y > FW) {
      const edge = L.y < 0 ? 0 : FW;
      const t = (edge - c.y) / (L.y - c.y);
      const cx = c.x + (L.x - c.x) * t;
      if (cx >= FL) return { k: 'dropout', x: 48 };
      if (this.penLive) return { k: 'lineoutUs', x: clamp(cx, 5, 95), y: edge, pen: true }; // a penalty that finds touch is our throw
      // out on the full: from inside our 22 the lineout is where it went out, otherwise back where it was kicked
      return { k: 'turnover', x: c.x <= 22 ? cx : c.x, y: edge, why: 'touch' };
    }
    if (L.x > FL + IG) return { k: 'dropout', x: 48 };
    return null;
  }

  // For test scenarios: the ball carrier drops it, here and now.
  forceKnockOn() { const c = this.att[this.carrier]; if (this.ball.mode !== 'held') return; this.go(); c.pose = 'fumble'; c.poseT = 1.5; this.spill(c, 1, { k: 'turnover', x: c.x, y: c.y, why: 'knockon' }, 'KNOCK ON!'); }

  private finish(e: PlayEnd) { this.state = 'done'; this.end = e; }

  step(dt: number) {
    if (this.state === 'done') return;
    if (this.flashT > 0) this.flashT -= dt;
    for (const m of this.att) if (m.poseT > 0) { m.poseT -= dt; if (m.poseT <= 0) m.pose = 'run'; }
    if (this.pend) { this.ending(dt); return; }
    if (this.state === 'ready') {
      // The ball is never played until the player plays it. At a ruck the rest of the field keeps moving.
      if (this.atRuck) this.breakdown(dt);
      else if (this.spots.size && !this.rolling) this.att.forEach((m, i) => { const sp = this.spots.get(i); if (sp && this.free(m)) this.moveTo(m, sp.x, sp.y, this.spd(m) * 0.85, dt); });
      return;
    }
    this.time += dt;
    if (this.state === 'score') {
      const c = this.att[this.carrier];
      this.scoreT -= dt;
      if (this.scoreT > 0.25) c.x = Math.min(FL + IG - 1, c.x + (this.dived ? 1.5 : 2.5) * dt);
      this.ball.x = c.x; this.ball.y = c.y;
      if (this.scoreT <= 0) this.finish({ k: 'try', x: c.x, y: c.y, who: this.carrier });
      return;
    }
    if (this.state === 'maul') { this.mauling(dt); return; }
    if (this.state === 'set') return; // packed down or lined up, waiting for the ball
    if (this.state === 'tackle') { this.tackling(dt); this.breakdown(dt); return; }
    if (this.state === 'ruck') { this.rucking(dt); return; }
    this.live(dt);
  }

  // A ball that has been spilled or stolen: show it, then blow the whistle.
  private ending(dt: number) {
    const b = this.ball, p = this.pend!;
    if (b.mode === 'spill') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.fx + (b.tx - b.fx) * k; b.y = b.fy + (b.ty - b.fy) * k;
      b.z = k < 0.6 ? Math.sin((k / 0.6) * Math.PI) * 1.1 : Math.sin(((k - 0.6) / 0.4) * Math.PI) * 0.4;
    }
    p.t -= dt;
    if (p.t <= 0) { this.pend = null; this.finish(p.e); }
  }

  private live(dt: number) {
    // a man given a new direction part-way through the play takes it from that moment
    while (this.turns.length && this.time - this.goT >= this.turns[0].t) {
      const k = this.turns.shift()!;
      this.heading.delete(k.to); this.lines.set(k.to, [{ x: k.x, y: k.y }]);
    }
    if (this.script.length && this.ball.mode === 'held' && this.time - this.goT >= this.script[0].t) { const sc = this.script.shift()!; if (sc.kx !== undefined) this.kickTo(sc.kx, sc.ky!); else this.passTo(sc.to); }
    if (this.stepT > 0) this.stepT -= dt;
    if (this.stepCd > 0) this.stepCd -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    const b = this.ball, rng = this.rng, held = b.mode === 'held';
    const c = this.att[this.carrier];

    // ball carrier: always runs forward, the thumb only moves him across the field
    if (held) {
      this.att.forEach((m, i) => this.burn(m, i === this.carrier && !this.poise, dt));
      const top = this.spd(c) * 0.97 * (this.slowT > 0 ? 0.55 : 1) * (this.poise ? 0.4 : 1);
      c.v = Math.min(top, c.v + this.acc(c) * dt);
      const dr = clamp(this.drift, -1, 1);
      // sideways speed builds quickly rather than instantly, so a drag feels smooth but goes a long way
      // Sideways: a held drag moves him for as long as it is held; a swipe that is let go carries on for
      // a distance set by the swipe. Either way it builds fast but not instantly, so he cannot zigzag for free.
      const full = this.spd(c) * T.lateralSpeed;
      if (dr !== 0) this.latGoal = 0;
      const mine = this.lines.get(this.carrier);
      if (dr !== 0 || this.latGoal !== 0) { this.lines.delete(this.carrier); this.heading.delete(this.carrier); } // the player has taken the wheel
      else if (mine?.length && mine[0].x <= c.x + 0.4) { mine.shift(); this.heading.delete(this.carrier); }
      const aimAt2 = dr === 0 && this.latGoal === 0 ? this.lines.get(this.carrier)?.[0] : undefined;
      const wantLat = dr !== 0 ? dr * full : Math.abs(this.latGoal) > 0.2 ? Math.sign(this.latGoal) * full
        : aimAt2 ? clamp((aimAt2.y - c.y) / Math.max(0.5, aimAt2.x - c.x) * c.v, -full, full) : 0;
      this.lat += clamp(wantLat - this.lat, -70 * dt, 70 * dt);
      if (dr === 0 && this.latGoal !== 0) { const was = this.latGoal; this.latGoal -= this.lat * dt; if (was * this.latGoal <= 0) this.latGoal = 0; }
      const side = clamp(Math.abs(this.lat) / (full || 1), 0, 1);
      let vx = c.v * Math.sqrt(1 - 0.3 * side * side), vy = this.lat;
      if (this.stepT > 0) { vy = this.stepDir * Math.max(STEP_V, Math.abs(this.lat) + 2); vx *= 0.8; }
      if (this.diveT > 0) { vx = 6.5; vy = 0; } // about a metre and a half, all told
      this.vx = vx; this.vy = vy;
      c.x += vx * dt; c.y += vy * dt; c.anim += dt * (4 + c.v * 1.6);
      if (c.y < 0 || c.y > FW) { this.finish({ k: 'turnover', x: clamp(c.x, 1, FL - 1), y: clamp(c.y, 0, FW), why: 'touch' }); return; }
      b.x = c.x; b.y = c.y; b.z = 0;
      if (c.x >= FL) { this.state = 'score'; this.scoreT = this.dived && this.diveT > 0 ? 0.5 : 0.55; this.ev.push('good'); return; }
      if (this.diveT > 0) {
        this.diveT -= dt;
        // short of the line: he is on the ground and it is a ruck
        if (this.diveT <= 0) { this.dived = false; this.toGround(-1, 'behind'); return; }
      }
    }

    // support runners: hold their channel and keep coming forward
    const inKick = b.mode === 'kick' || b.mode === 'bounce' || (b.mode === 'loose' && this.kicked);
    const aimAt = this.ballAim();
    if (inKick) {
      // who gets there soonest, counting the pace they already have
      const lead = this.chasers[0] ?? -1;
      const etas = this.att.map((m, i) => ({ i, eta: this.free(m) ? Math.hypot(aimAt.x - m.x, aimAt.y - m.y) / Math.max(1.5, (this.spd(m) + m.v) / 2) : 1e9 }))
        .sort((p, q) => p.eta - q.eta).slice(0, 3).filter(o => o.eta < 1e8);
      // whoever was already going for it keeps going unless somebody is clearly better placed
      const keep = etas.findIndex(o => o.i === lead);
      if (keep > 0 && etas[keep].eta < etas[0].eta + 0.35) etas.unshift(etas.splice(keep, 1)[0]);
      this.chasers = etas.map(o => o.i);
    } else this.chasers = [];
    const chase = b.mode === 'pass' || (b.mode === 'loose' && !this.kicked);
    if (b.mode === 'pass') b.target = this.only >= 0 && this.free(this.att[this.only]) ? this.only : this.receiver();
    const focus = inKick && this.chasers.length ? this.att[this.chasers[0]] : chase && b.target >= 0 ? this.att[b.target] : c;
    this.reslotT -= dt;
    if (held && this.reslotT <= 0) { this.reslotT = 0.4; this.reslot(c); }
    this.att.forEach((m, i) => {
      if (held && i === this.carrier) return;
      if (!this.rejoin(m, i, dt)) return;
      const top = this.spd(m);
      // A man who has got in front of the ball is no use there: he all but stops until it has come past him.
      const crawl = (held || b.mode === 'pass') && i !== b.target && m.x > b.x + 0.3;
      if (chase && i === b.target) {
        // The man the ball is heading for goes to meet it, forwards, sideways or back, timing his run
        // to arrive with it. He never stands and waits: if he is there early he keeps moving up the field.
        const dx = b.tx - m.x, dy = b.ty - m.y, l = Math.hypot(dx, dy), left = b.mode === 'pass' ? Math.max(0.05, b.dur - b.t) : 0.05;
        const want = clamp(l / left, top * 0.55, top);
        m.v += clamp(want - m.v, -9 * dt, this.acc(m) * dt);
        if (l > 0.5) { const s = Math.min(l, m.v * dt); m.x += (dx / l) * s; m.y += (dy / l) * s; }
        else m.x += m.v * dt;
        m.anim += dt * (4 + m.v * 1.6);
        return;
      }
      if (inKick && this.chasers.includes(i)) {
        // keeps the pace he already had and builds on it: this is what a deep, moving line is for
        m.v = Math.min(top, m.v + this.acc(m) * dt);
        // one man goes for the ball; the next two hold off either side of it, for the bounce or the tackle
        const n = this.chasers.indexOf(i);
        if (n === 0 || b.mode === 'loose') this.moveTo(m, aimAt.x, aimAt.y, m.v, dt);
        else this.moveTo(m, aimAt.x - 3.5, clamp(aimAt.y + (n === 1 ? -4.5 : 4.5), 1, FW - 1), m.v, dt);
        return;
      }
      if (this.slot(i) < 0) return;
      const line = this.lines.get(i);
      if (line?.length) {
        m.v = crawl ? Math.min(m.v, top * 0.1) : Math.min(top * 1.1, m.v + this.acc(m) * 1.1 * dt);
        const dx = line[0].x - m.x, dy = line[0].y - m.y, l = Math.hypot(dx, dy);
        if (l > 0.6) this.heading.set(i, { ux: dx / l, uy: dy / l });
        if (this.moveTo(m, line[0].x, line[0].y, m.v, dt) < 0.4) line.shift();
        return;
      }
      // The arrow is a direction, not a distance: a short one and a long one are run at the same pace, and a
      // man who reaches the end of his keeps on the same way (up the field at least) until the play breaks down.
      const hd = this.heading.get(i);
      if (hd) {
        m.v = crawl ? Math.min(m.v, top * 0.1) : Math.min(top * 1.1, m.v + this.acc(m) * 1.1 * dt);
        const ux = Math.max(hd.ux, 0.45), uy = m.y < 1.5 && hd.uy < 0 || m.y > FW - 1.5 && hd.uy > 0 ? 0 : hd.uy, n2 = Math.hypot(ux, uy);
        m.x += (ux / n2) * m.v * dt; m.y = clamp(m.y + (uy / n2) * m.v * dt, 0.8, FW - 0.8); m.anim += dt * (4 + m.v * 1.6);
        return;
      }
      // the halfback shadows the ball, a few metres behind it, so he is already there when the tackle comes
      const t = m.pos === 'HB' ? { x: Math.max(-IG + 0.5, focus.x - 4.5), y: clamp(focus.y + (m.y >= focus.y ? 1.8 : -1.8), 1.2, FW - 1.2) } : this.slotTarget(i, focus);
      if (m.pos !== 'HB') t.y = this.gapY(m, t.y, focus.x);
      // He runs at full pace until he is nearly level with the ball, then holds just behind it. So the
      // line arrives flat and fast instead of waiting in its starting stagger.
      const lead = b.mode === 'held' ? c.v : top * 0.9;
      const flat = m.pos === 'HB' ? t.x : focus.x - 1 - 0.8 * Math.abs(this.slot(i) - this.slot(this.carrier));
      const want = crawl ? top * 0.1 : m.x < flat - 0.4 ? top : clamp(lead + (flat - m.x) * 2, top * 0.35, top);
      m.v += clamp(want - m.v, -10 * dt, this.acc(m) * dt);
      m.x += m.v * dt;
      m.y += clamp((t.y - m.y) * 2.4, -top * 0.75, top * 0.75) * dt;
      m.anim += dt * (4 + m.v * 1.6);
    });

    // ball in the air
    if (b.mode === 'pass') {
      // A pass flies in a straight line to where it was aimed. Whoever gets to it, gets it.
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.fx + (b.tx - b.fx) * k; b.y = b.fy + (b.ty - b.fy) * k; b.z = Math.sin(k * Math.PI) * passArc(b.dist);
      if (b.y < 0 || b.y > FW) { this.finish({ k: 'turnover', x: clamp(b.x, 1, FL - 1), y: clamp(b.y, 0, FW), why: 'touch' }); return; }
      if (k > 0.1) {
        for (let i = 0; i < this.def.length; i++) {
          const d = this.def[i];
          if (b.z > HEAD || !this.up(d) || d.off || this.icheck.has(i) || Math.hypot(d.x - b.x, d.y - b.y) > 0.85) continue;
          this.icheck.add(i);
          if (rng.chance(0.2)) {
            b.mode = 'taken'; b.x = d.x; b.y = d.y; b.z = 0;
            this.pend = { e: { k: 'turnover', x: d.x, y: d.y, why: 'intercept' }, t: 0.6 };
            this.flash = 'INTERCEPTED!'; this.flashT = 0.6;
            return;
          }
        }
        // A man right in the ball's path takes it; near the end of its flight anyone close can reach it.
        let ci = -1, cd = k >= 0.6 ? 1.4 : 0.7;
        if (b.z > HEAD && k < 0.92) cd = 0; // still over everybody's head
        this.att.forEach((m, i) => {
          if (i === this.passer || !this.free(m) || (this.only >= 0 && i !== this.only && this.free(this.att[this.only]))) return;
          const q = Math.hypot(m.x - b.x, m.y - b.y);
          // a decoy runner is not looking for it: he only gets it if it hits him
          if (q < (this.dummies.has(i) ? Math.min(cd, 0.6) : cd)) { cd = q; ci = i; }
        });
        if (ci >= 0) { if (this.take(ci, 0.9992 - b.dist * 0.00015)) return; }
        else if (k >= 1) {
          // nobody got to it: it hits the grass and bounces on the way it was going, and it is anybody's
          const sp = Math.min(9, b.dist / b.dur) * 0.45, ux = (b.tx - b.fx) / (b.dist || 1), uy = (b.ty - b.fy) / (b.dist || 1);
          b.mode = 'bounce'; b.bn = 0; b.z = 0; b.t = 0; b.vx = ux * sp; b.vy = uy * sp; b.vz = 4.8;
          this.kicked = false; this.kk = 'low'; this.passer = -1; this.only = -1;
          this.kickTwist(0.5);
        }
      }
    } else if (b.mode === 'kick') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.fx + (b.tx - b.fx) * k; b.y = b.fy + (b.ty - b.fy) * k; b.z = Math.sin(k * b.cut * Math.PI) * b.high;
      // a man standing under it can take it out of the air as it comes down
      if (k > 0.6 && b.z < 1.8 && this.contest(0.96, 0.93, true)) return;
      if (k >= 1) {
        if (this.kickEnd) { this.finish(this.kickEnd); return; }
        // It comes down in play and bounces. A rugby ball does not bounce straight.
        const kd = KICKS[this.kk], sp = (b.dist / b.dur) * kd.keep, ux = (b.tx - b.fx) / (b.dist || 1), uy = (b.ty - b.fy) / (b.dist || 1);
        b.mode = 'bounce'; b.bn = 0; b.z = 0; b.x = b.tx; b.y = b.ty; b.t = 0; this.passer = -1;
        b.vx = ux * sp; b.vy = uy * sp; b.vz = 3 + b.high * 0.42;
        this.kickTwist(kd.wild * 0.6);
      }
    } else if (b.mode === 'bounce') {
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 20 * dt;
      if (b.z <= 0) {
        b.z = 0; b.bn++;
        const sp = Math.hypot(b.vx, b.vy);
        if (b.bn > 5 || sp < 1) { b.vz = 0; const fr = Math.max(0, 1 - 2.6 * dt); b.vx *= fr; b.vy *= fr; if (sp < 0.35) { b.mode = 'loose'; b.t = 0; } }
        else { b.vz = Math.max(1.7, -b.vz * 0.64); b.vx *= 0.72; b.vy *= 0.72; this.kickTwist(KICKS[this.kk].wild); }
      }
      b.tx = b.x; b.ty = b.y;
      if (this.outOfPlay()) return;
      if (b.z < 1.3 && this.contest(0.975, 0.8)) return;
    } else if (b.mode === 'loose') {
      // The ball is lying there and both sides are going for it. Nobody has it until somebody picks it up.
      b.t += dt;
      b.tx = b.x; b.ty = b.y;
      let ai = -1, ad = 1e9;
      this.att.forEach((m, i) => { const q = Math.hypot(m.x - b.x, m.y - b.y); if (this.free(m) && q < ad) { ad = q; ai = i; } });
      b.target = ai;
      if (this.contest(0.997, 1)) return;
      if (b.t > 7) { this.pend = { e: { k: 'turnover', x: clamp(b.x, 1, FL - 1), y: b.y, why: this.kicked ? 'kick' : 'loose' }, t: 0.3 }; return; }
    }

    this.defend(dt);
  }

  // Where to run to get the ball: where a kick is coming down, or a little ahead of a bouncing ball.
  // Nobody knows where the next bounce will send it, so they follow it rather than wait for it.
  private ballAim() {
    const b = this.ball;
    if (b.mode === 'bounce') return { x: b.x + b.vx * 0.35, y: clamp(b.y + b.vy * 0.35, 0.5, FW - 0.5) };
    return { x: b.tx, y: clamp(b.ty, 0.5, FW - 0.5) };
  }

  // An oval ball: each bounce turns it a little, and now and then a lot.
  private kickTwist(wild: number) {
    const b = this.ball, rng = this.rng;
    const turn = rng.chance(0.12) ? (rng.chance(0.5) ? 1 : -1) * rng.range(0.9, 1.7) : rng.norm(0, wild * 0.5);
    const cs = Math.cos(turn), sn = Math.sin(turn), vx = b.vx * cs - b.vy * sn, vy = b.vx * sn + b.vy * cs;
    b.vx = vx; b.vy = vy;
  }

  // A live ball going over a line. Returns true if that ended the play.
  private outOfPlay(): boolean {
    const b = this.ball;
    if (b.y < 0 || b.y > FW) {
      const edge = b.y < 0 ? 0 : FW;
      if (b.x >= FL) { this.finish({ k: 'dropout', x: 48 }); return true; }
      // 50:22: kicked from our own half, bounced, and out inside their 22 is our throw
      if (this.penLive) this.finish({ k: 'lineoutUs', x: clamp(b.x, 5, 95), y: edge, pen: true });
      else if (this.kicked && this.kickX < 50 && b.x >= 78) this.finish({ k: 'lineoutUs', x: Math.min(b.x, 95), y: edge });
      else this.finish({ k: 'turnover', x: clamp(b.x, 1, FL - 1), y: edge, why: 'touch' });
      return true;
    }
    if (b.x > FL + IG) { this.finish({ k: 'dropout', x: 48 }); return true; }
    return false;
  }

  // Both sides try to get a hand on a ball that is in reach. ours / theirs: how sure each side's hands
  // are for this sort of ball. Returns true if open play has stopped (a knock-on, or they have it).
  private contest(ours: number, theirs: number, air = false): boolean {
    const b = this.ball, reach = air ? 2 : 0.95;
    let ai = -1, ad = reach, di = -1, dd = reach;
    this.att.forEach((m, i) => { const q = Math.hypot(m.x - b.x, m.y - b.y); if (this.free(m) && i !== this.passer && q < ad) { ad = q; ai = i; } });
    this.def.forEach((d, i) => { const q = Math.hypot(d.x - b.x, d.y - b.y); if (this.up(d) && !d.off && d.st !== 'dive' && q < dd) { dd = q; di = i; } });
    if (ai < 0 && di < 0) return false;
    // Both sides under a high ball: it is a jump for it. The man arriving at pace has the edge, and
    // sometimes neither of them holds it and it comes down loose.
    let oursIt = ai >= 0 && (di < 0 || ad <= dd);
    if (air && ai >= 0 && di >= 0) {
      const m = this.att[ai], roll = this.rng.next();
      if (roll < 0.2) {
        b.mode = 'bounce'; b.bn = 1; b.t = 0; b.tx = b.x; b.ty = b.y;
        b.vx = this.rng.range(-2.5, 3.5); b.vy = this.rng.range(-3, 3); b.vz = 3;
        this.flash = 'SPILLED!'; this.flashT = 0.7;
        return false;
      }
      oursIt = this.rng.chance(clamp(0.45 + (m.v > 3 ? 0.1 : 0) + (m.spd - this.def[di].spd) * 0.004, 0.25, 0.72));
    }
    if (oursIt) {
      const m = this.att[ai];
      // our own kick-off has to go ten metres before we can play it; where it first bounced does not matter
      if (this.koLive && m.x < 60) { this.finish({ k: 'turnover', x: 50, y: MID, why: 'short' }); return true; }
      if (this.take(ai, ours)) return true;
      // ours: play goes straight on, and grounding it in their in-goal is a try
      this.kicked = false; this.chasers = [];
      if (this.slot(ai) < 0) this.join(ai);
      if (m.x >= FL) { this.state = 'score'; this.scoreT = 0.45; this.dived = true; this.ev.push('good'); return true; }
      this.ev.push('good');
      return false;
    }
    const d = this.def[di];
    this.koLive = false; this.penLive = false;
    // a bouncing ball can beat a defender too: he grabs at it and it gets away from him
    if (!this.rng.chance(theirs)) { d.stun = 0.6; if (b.mode === 'bounce') this.kickTwist(1.2); return false; }
    b.mode = 'taken'; b.x = d.x; b.y = d.y; b.z = 0;
    if (d.x >= FL) { this.pend = { e: { k: 'dropout', x: 48 }, t: 0.6 }; return true; }
    this.pend = { e: { k: 'turnover', x: clamp(d.x, 1, FL - 1), y: d.y, why: this.kicked ? 'kick' : 'loose' }, t: 0.6 };
    return true;
  }

  // Men leaving a ruck or getting up off the ground come back into the line. Returns true once he is in play.
  private rejoin(m: Man, i: number, dt: number): boolean {
    if (m.down > 1e8) return false;
    if (m.down > 0) { m.down -= dt; if (m.down > 0) return false; m.job = 0; this.join(i); }
    if (m.job === 1) { if (m.out <= 0) return false; m.out -= dt; if (m.out > 0) return false; m.job = 0; this.join(i); }
    if (m.job === 2) { m.job = 0; this.join(i); }
    return true;
  }

  private join(i: number) {
    if (this.ord.includes(i)) return;
    const y = this.att[i].y;
    let at = this.ord.findIndex(k => this.att[k].y > y);
    if (at < 0) at = this.ord.length;
    this.ord.splice(at, 0, i);
  }

  // Moves a man who has run out of room on his side around the back to the other side.
  private reslot(c: Man) {
    const k = this.slot(this.carrier), n = this.ord.length - 1;
    if (k < 0) return;
    const want = clamp(Math.round(n * (c.y - 1) / (FW - 2)), 0, n);
    if (k > want + 1) { this.ord[k] = this.ord[k - 1]; this.ord[k - 1] = this.carrier; }
    else if (k < want - 1) { this.ord[k] = this.ord[k + 1]; this.ord[k + 1] = this.carrier; }
  }

  private defend(dt: number) {
    const b = this.ball, hold = b.mode === 'held';
    const c = this.att[this.carrier];
    const tgt = hold ? c : this.ballAim();
    const kickers = new Set(this.def.map((d, i) => ({ i, q: this.up(d) && !d.sweeper ? Math.hypot(d.x - tgt.x, d.y - tgt.y) : 1e9 })).sort((p, q) => p.q - q.q).slice(0, 2).map(o => o.i));
    const live = (d: Def) => this.up(d) && d.st !== 'dive';
    const kicking = b.mode === 'kick' || b.mode === 'bounce' || (b.mode === 'loose' && this.kicked);
    if (kicking) {
      // the best-placed man is the catcher, and he stays the catcher unless somebody is clearly nearer
      let best = -1, bq = 1e9;
      this.def.forEach((d, i) => { if (!this.up(d) || !(d.sweeper || kickers.has(i))) return; const q = Math.hypot(d.x - tgt.x, d.y - tgt.y) / Math.max(2, this.dspd(d)); if (q < bq) { bq = q; best = i; } });
      const cur = this.def[this.catcher];
      if (!(cur && this.up(cur) && Math.hypot(cur.x - tgt.x, cur.y - tgt.y) / Math.max(2, this.dspd(cur)) < bq + 0.4)) this.catcher = best;
    } else this.catcher = -1;
    // The two nearest men in front of the ball press it. Everyone else keeps the line.
    const front = this.def.map((d, i) => ({ i, q: live(d) && d.x >= tgt.x - 0.4 && !d.sweeper ? Math.hypot(d.x - tgt.x, (d.y - tgt.y) * 1.3) : 1e9 }))
      .sort((p, q) => p.q - q.q);
    const pressers = new Set<number>();
    if (front[0] && front[0].q < 7) pressers.add(front[0].i);
    if (front[1] && front[1].q < 3.6) pressers.add(front[1].i);
    // the line is broken once the ball is past most of the men who were in it
    const inLine = this.def.filter(d => this.up(d) && !d.sweeper), broken = hold && inLine.length > 0 && inLine.filter(d => d.x < tgt.x - 0.6).length >= inLine.length * 0.5;
    const through = front[0] ? front[0].q > 1e8 : true; // nobody left in front but the sweeper
    // The line comes up together, then holds a few metres off the ball.
    this.lineV = Math.min(1.8 * T.defSpeed, this.lineV + 2.5 * dt);
    const lineX = tgt.x + 3.2;
    // Line defenders mark the attackers in order across the field, so the line slides with the ball.
    const liners = this.def.map((d, i) => ({ d, i })).filter(o => !o.d.sweeper && o.d.stun < 1e8).sort((p, q) => p.d.y - q.d.y);
    const marks = this.ord.map(i => this.att[i]);
    const markY = new Map<number, number>();
    const markMan = new Map<number, Man>();
    // While a called play is running each line defender picks his man and goes at him, decoy or not.
    // That is what a set play is for: it pulls them out of their line and leaves the space behind.
    const bite = this.playName !== '' && this.time - this.goT < 5;
    liners.forEach((o, n) => {
      const m = marks[Math.round(n * (marks.length - 1) / Math.max(1, liners.length - 1))];
      markY.set(o.i, m ? m.y : o.d.y);
      if (m) markMan.set(o.i, m);
    });

    const hunters = new Set(this.def.map((d, i) => ({ i, q: live(d) && d.x < tgt.x - 0.6 ? Math.hypot(d.x - tgt.x, d.y - tgt.y) : 1e9 })).sort((p, q) => p.q - q.q).slice(0, 2).filter(o => o.q < 1e8).map(o => o.i));
    for (let i = 0; i < this.def.length; i++) {
      const d = this.def[i];
      if (d.stun > 0) { d.stun -= dt; continue; }
      if (d.st === 'miss') { d.t -= dt; if (d.t <= 0) { d.st = 'cover'; d.fooled = 0; } continue; }
      this.burn(d, d.st === 'cover', dt);
      const top = this.dspd(d);
      const dist = Math.hypot(tgt.x - d.x, tgt.y - d.y);
      if (d.off) {
        // offside: back behind the ruck first, by running. Once play has moved well on, it no longer matters.
        const back = (this.ruck?.x ?? d.x) + 1.5;
        if (d.x >= back || tgt.x > back + 7 || !hold && b.mode !== 'pass') d.off = false;
        else { d.st = 'line'; this.moveTo(d, back + 1, d.y, top, dt); continue; }
      }
      if (d.st === 'dive') {
        d.x += d.dx * DIVE_V * dt; d.y += d.dy * DIVE_V * dt; d.t -= dt; d.anim += dt * 10;
        if (hold && Math.hypot(d.x - c.x, d.y - c.y) < REACH) { if (this.contact(d, i)) return; continue; }
        if (d.t <= 0) {
          d.st = 'miss'; d.t = 1.2;
          if (hold && Math.hypot(d.x - c.x, d.y - c.y) < 4) { this.breaks++; this.ev.push('break'); this.flash = 'BEATEN!'; this.flashT = 0.5; }
        }
        continue;
      }
      let tx: number, ty: number, sp = top;
      if (d.x < tgt.x - 0.6) {
        // Beaten. The two nearest chase the runner, at their own pace, to where he is going. The others do
        // not all follow him: each gets back goal-side of the man he was marking, so the far side of the
        // pitch stays covered and a pass or a cross-kick is not a free run.
        d.st = 'cover';
        if (hunters.has(i) || (d.wing && broken)) { tx = tgt.x + 0.5 + Math.abs(tgt.y - d.y) * 0.8; ty = tgt.y; }
        else { ty = markY.get(i) ?? d.y; tx = tgt.x + 4 + Math.abs(ty - tgt.y) * 0.35; }
        if (hold && dist < 1.4) { this.commit(d, c.x + this.vx * 0.1, c.y + this.vy * 0.1); continue; }
      } else if (d.wing && broken && !kicking) {
        // a break: the winger leaves his man and runs to cut the runner off, well ahead of where he is now
        // He runs to cut the runner off, but never away from him: he does not go further back than he
        // already is, and once he is close he goes straight at him.
        d.st = 'cover';
        if (dist < 6) { tx = tgt.x + this.vx * 0.15; ty = tgt.y + (hold ? this.vy * 0.2 : 0); }
        else { tx = Math.min(d.x, tgt.x + 3 + Math.abs(tgt.y - d.y) * 0.7); ty = tgt.y + (hold ? this.vy * 0.4 : 0); }
        if (hold && dist < this.commitAt(d)) { const t = dist / (DIVE_V + Math.max(0, this.vx)); this.commit(d, c.x + this.vx * t, c.y + this.vy * t); continue; }
      } else if (d.sweeper && !kicking) {
        if (broken || through || dist < 4.5) { d.st = 'press'; const look = clamp(dist / 9, 0.15, 0.6); tx = tgt.x + this.vx * look * 0.5; ty = tgt.y + (hold ? this.vy * look : 0); sp = top; }
        else { d.st = 'line'; tx = Math.min(d.x, Math.max(tgt.x + 18, d.x - top * dt)); ty = tgt.y * 0.75 + 5; sp = top * 0.7; }
      } else if (b.mode === 'kick' || b.mode === 'bounce' || (b.mode === 'loose' && this.kicked)) {
        // A kick over the top. He needs a moment to turn, then gets going at his own acceleration.
        // The sweeper and the two nearest go for the ball; the rest drop back behind it.
        if (d.react > 0) { d.react -= dt; continue; }
        d.st = 'press';
        d.v = Math.min(top, d.v + this.acc(d) * dt);
        const goes = d.sweeper || kickers.has(i);
        if (i === this.catcher || (goes && b.mode === 'loose')) this.moveTo(d, tgt.x, tgt.y, d.v, dt);
        else if (goes) this.moveTo(d, tgt.x + 3.5, clamp(tgt.y + (d.y >= tgt.y ? 4.5 : -4.5), 1, FW - 1), d.v, dt); // in support, not under it
        else this.moveTo(d, Math.max(d.x, tgt.x - 4), d.y, d.v, dt);
        continue;
      } else if (pressers.has(i) || dist < 2.2) {
        d.st = 'press'; tx = tgt.x + (hold ? this.vx * 0.12 : 0); ty = tgt.y + (hold ? this.vy * 0.2 : 0); sp = top * 0.9;
      } else {
        // Hold the line: come up together, slide across with the man being marked, never back-pedal.
        d.st = 'line';
        ty = markY.get(i) ?? d.y;
        const myLine = lineX + (d.wing ? WING_DEPTH : 0); // a winger holds his depth; he only comes up for a break
        tx = d.x > myLine ? Math.max(myLine, d.x - this.lineV * dt) : d.x;
        const man = bite && !d.wing ? markMan.get(i) : undefined;
        if (man && man !== c) { const want = Math.max(man.x + 1.2, tgt.x + 0.6); tx = d.x > want ? Math.max(want, d.x - top * 0.8 * dt) : d.x; }
        const slide = clamp(ty - d.y, -top * (man ? 0.95 : 0.7) * dt, top * (man ? 0.95 : 0.7) * dt);
        if (Math.abs(slide) > 0.004 || tx !== d.x) d.anim += dt * 9;
        d.x = tx; d.y += slide;
        continue;
      }
      const dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy);
      if (l > 0.1) { const s = Math.min(l, sp * dt); d.x += (dx / l) * s; d.y += (dy / l) * s; d.anim += dt * (4 + sp * 1.6); }
      if (hold && d.st === 'press' && dist < this.commitAt(d)) {
        const t = dist / (DIVE_V + Math.max(0, this.vx));
        this.commit(d, c.x + this.vx * t, c.y + this.vy * t);
      }
    }
    this.spread(dt);
  }

  // keep defenders off each other's toes
  private spread(dt: number) {
    for (let i = 0; i < this.def.length; i++) for (let j = i + 1; j < this.def.length; j++) {
      const p = this.def[i], q = this.def[j];
      if (!this.up(p) || !this.up(q) || p.st === 'dive' || q.st === 'dive') continue;
      const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
      if (l < 1.6 && l > 0.01) { const push = (1.6 - l) * 0.5 * Math.min(1, dt * 8); p.y -= (dy / l) * push; q.y += (dy / l) * push; }
    }
  }

  // A tackler has reached the ball carrier. Returns true if open play has stopped.
  private contact(d: Def, di: number): boolean {
    const c = this.att[this.carrier], rng = this.rng;
    // A dive for the line goes under most tackles.
    if (this.diveT > 0 && rng.chance(0.65)) { d.st = 'miss'; d.t = 1.3; return false; }
    // Strength against the tackler's: a strong runner sometimes bumps him off.
    const bust = clamp((0.09 + (c.str - d.tkl) * 0.006 + (d.x < c.x ? 0.06 : 0)) / this.tkl(c.x), 0.02, 0.6) * (d.sweeper ? 0.5 : 1); // the last man makes his tackles
    if (rng.chance(bust)) {
      d.st = 'miss'; d.t = 1.3; this.slowT = 0.3; this.breaks++; this.ev.push('break');
      c.pose = 'fend'; c.poseT = 0.35; this.flash = 'BUMPED OFF!'; this.flashT = 0.5;
      return false;
    }
    this.ev.push('tackle');
    const kind = d.x < c.x - 0.3 ? 'behind' : Math.abs(d.y - c.y) > Math.abs(d.x - c.x) * 0.9 ? 'side' : 'front';
    // Ball retention: poor hands, a big hitter, or being caught flat-footed can jolt the ball loose.
    const flat = c.v < this.spd(c) * 0.6 ? 0.03 : 0;
    const lost = rng.chance(clamp((0.004 + Math.max(0, 72 - c.hnd) * 0.002 + Math.max(0, d.tkl - c.str) * 0.0008 + flat) * T.knockOns, 0, 0.1));
    if (c.x < 0) {
      const support = this.att.filter((m, k) => k !== this.carrier && this.free(m) && Math.hypot(m.x - c.x, m.y - c.y) < 9).length;
      this.finish({ k: 'tackled', x: c.x, y: c.y, support, who: this.carrier });
      return true;
    }
    this.toGround(di, kind);
    if (lost) this.spill(c, 1, { k: 'turnover', x: c.x, y: c.y, why: 'stripped' }, 'LOST IT IN THE TACKLE!');
    return true;
  }

  // The ball carrier goes to ground: by = the tackler, or -1 if he dived short on his own.
  private toGround(by: number, kind: Tackle['kind']) {
    const c = this.att[this.carrier], d = by >= 0 ? this.def[by] : null;
    this.state = 'tackle'; this.script = []; this.turns = [];
    this.tk = { t: 0, dur: by >= 0 ? T.tackleTime : 0.35, kind, who: this.carrier, by, dir: d && d.y < c.y ? 1 : -1 };
    this.stepT = 0; this.diveT = 0; this.drift = 0; this.latGoal = 0; this.poise = false;
    c.job = 2; c.v = 0;
    const at = this.ord.indexOf(this.carrier);
    if (at >= 0) this.ord.splice(at, 1);
    if (d) { d.st = 'miss'; d.t = 2.6; }
    this.ball.mode = 'ground'; this.ball.z = 0;
    this.setupRuck();
  }

  // Decided the moment the tackle is made, so everybody is already moving while the two men go down:
  // who gets to the base, who binds, where the defence drops to.
  private setupRuck() {
    const tk = this.tk!, down = this.att[tk.who];
    const r = this.ruck = { x: down.x, y: down.y };
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - r.x, p.y - r.y);
    const eta = (m: Man) => dist(m) / this.spd(m);
    // The halfback goes to the base if he is about as close as anyone. If he is the one on the ground,
    // or would take noticeably longer than the nearest man, the nearest man does the job for this ruck.
    const avail = this.att.map((m, i) => ({ m, i })).filter(o => this.free(o.m)).sort((p, q) => eta(p.m) - eta(q.m));
    const nine = avail.find(o => o.m.pos === 'HB' && eta(o.m) <= eta(avail[0].m) + 0.7) ?? avail[0];
    if (nine) {
      this.carrier = nine.i;
      // the next two arrivals bind over the ball; two defenders do the same on the other side
      avail.filter(o => o.i !== nine.i && dist(o.m) < 12).slice(0, 2).forEach(o => {
        o.m.job = 1; o.m.out = 0;
        const at = this.ord.indexOf(o.i);
        if (at >= 0) this.ord.splice(at, 1);
      });
      // he takes his place in the line by where the ruck is, not where he happens to be standing
      const at = this.ord.indexOf(nine.i);
      if (at >= 0) this.ord.splice(at, 1);
      let ins = this.ord.findIndex(k => this.att[k].y > r.y);
      if (ins < 0) ins = this.ord.length;
      this.ord.splice(ins, 0, nine.i);
    }
    this.def.filter(d => this.up(d) && !d.sweeper && dist(d) < 10).sort((p, q) => dist(p) - dist(q)).slice(0, 2).forEach(d => { d.bound = true; d.st = 'line'; });
    for (const d of this.def) d.off = false;
    this.bindSpots();
    this.lines.clear(); this.heading.clear(); this.spots.clear(); this.dummies.clear(); this.primary = -1; this.playName = '';
    this.setKind = null; this.rest = null; this.thrower = -1; this.jumpers = []; this.rolling = false; this.chasers = [];
    this.lineV = 0; this.vx = 0; this.vy = 0; this.lat = 0;
  }

  // Where the ruckers bind, either side of wherever the tackled man has ended up.
  private bindSpots() {
    const r = this.ruck!;
    let n = 0, k = 0;
    for (const m of this.att) if (m.job === 1) { m.bx = r.x - 0.95; m.by = r.y + (n++ ? 0.75 : -0.75); }
    for (const d of this.def) if (d.bound) { d.bx = r.x + 0.95; d.by = r.y + (k++ ? 0.75 : -0.75); }
  }

  // The tackle itself: the two bodies go to ground together, while everyone else gets on with it.
  private tackling(dt: number) {
    const tk = this.tk!, c = this.att[tk.who], d = tk.by >= 0 ? this.def[tk.by] : null;
    tk.t += dt;
    const k = Math.min(1, tk.t / tk.dur);
    if (k < 0.7) {
      // front-on he is driven back, from the side he is dragged across, from behind he pitches forward
      if (tk.kind === 'front') c.x -= 1.1 * dt;
      else if (tk.kind === 'side') { c.x += 0.9 * dt; c.y = clamp(c.y + tk.dir * 0.9 * dt, 0.3, FW - 0.3); }
      else c.x += 1.6 * dt;
    }
    if (d) {
      // wrapped round him as they go down, then the two bodies land side by side rather than in a heap
      const down = k >= 0.7 ? 0.65 : 0;
      const gx = c.x + (tk.kind === 'front' ? 0.75 + down : tk.kind === 'behind' ? -0.8 - down : 0.1), gy = c.y + (tk.kind === 'side' ? -tk.dir * (0.55 + down) : 0.12);
      const pull = Math.min(1, dt * 7);
      d.x += (gx - d.x) * pull; d.y += (gy - d.y) * pull;
    }
    this.ball.x = c.x; this.ball.y = c.y;
    if (this.ruck) { this.ruck.x = c.x; this.ruck.y = c.y; this.bindSpots(); }
    if (tk.t >= tk.dur) this.startRuck();
  }

  // The tackle is complete: it is a ruck, and the match can decide how it goes.
  private startRuck() {
    const tk = this.tk!, down = this.att[tk.who];
    if (down.x >= FL) { // carried over the line in the tackle
      this.carrier = tk.who; this.ball.mode = 'held'; this.state = 'score'; this.scoreT = 0.4; this.dived = true;
      return;
    }
    const r = this.ruck!;
    if (this.carrier === tk.who) { this.finish({ k: 'turnover', x: r.x, y: r.y, why: 'ruck' }); return; } // nobody left to play it
    down.down = 3.4;
    this.lastGain = r.x - this.startX;
    this.startX = r.x;
    this.ruckSupport = this.att.filter(m => this.free(m) && Math.hypot(m.x - r.x, m.y - r.y) < 9).length;
    this.ball.x = r.x - 0.7; this.ball.y = r.y;
    {
      const mine = this.att.filter(m => m.job === 1), theirs = this.def.filter(d => d.bound);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 60);
      this.ruckEdge = avg(mine.map(m => m.str)) - avg(theirs.map(d => d.tkl)) + (mine.length - theirs.length) * 6;
    }
    this.state = 'ruck'; this.ruckOk = 'wait'; this.ruckT = 0; this.ruckSeq++;
  }

  private moveTo(p: { x: number; y: number; anim: number }, tx: number, ty: number, sp: number, dt: number): number {
    const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
    if (l > 0.12) { const s = Math.min(l, sp * dt); p.x += (dx / l) * s; p.y += (dy / l) * s; p.anim += dt * (4 + sp * 1.6); }
    return l;
  }

  // Everything that happens around a breakdown while the ball is not in open play: bodies arrive and
  // bind, the halfback gets to the base, the backs line up again, the defence drops back onside.
  // Nobody is moved by magic: a defence caught out of position by a break stays out of position.
  private breakdown(dt: number): number {
    const r = this.ruck;
    if (!r) return 0;
    const base = { x: r.x - 1.5, y: r.y };
    let nineD = 0;
    this.att.forEach((m, i) => {
      if (m.down > 1e8) return;
      if (m.job === 2 || m.down > 0) {
        if (this.state !== 'tackle') { m.down -= dt; if (m.down <= 0) { m.down = 0; m.job = 0; this.join(i); } }
        return;
      }
      const top = this.spd(m) * T.ruckSpeed;
      if (i === this.carrier) { nineD = this.ball.mode === 'held' ? 0 : this.moveTo(m, base.x, base.y, top, dt); return; }
      if (m.job === 1) { this.moveTo(m, m.bx, m.by, top, dt); return; }
      if (this.slot(i) < 0) return;
      const t = this.spots.get(i) ?? this.slotTarget(i, base);
      if (this.moveTo(m, t.x, t.y, top * 0.85, dt) < 0.2) m.v = 0;
    });
    const spots = this.restSpots(r, this.rest?.line ?? T.lineDepth, this.rest ? this.rest.guard : GUARD);
    this.def.forEach((d, i) => {
      if (d.stun > 1e8) return;
      if (d.st === 'miss') { if (this.state !== 'tackle' || this.tk?.by !== i) { d.t -= dt; if (d.t <= 0) d.st = 'line'; } return; }
      if (d.st === 'dive') { d.st = 'miss'; d.t = 0.9; return; }
      const top = this.dspd(d) * T.ruckSpeed;
      if (d.bound) { this.moveTo(d, d.bx, d.by, top, dt); return; }
      d.st = 'line';
      const s = spots.get(i);
      if (s) this.moveTo(d, s.x, s.y, top * 0.8, dt);
    });
    this.spread(dt);
    return nineD;
  }

  private rucking(dt: number) {
    const r = this.ruck!, nineD = this.breakdown(dt);
    this.ruckT += dt;
    if (this.ruckOk === 'wait') return;
    if (this.ruckOk === 'steal' || this.ruckOk === 'pen') {
      // Their man gets over the ball before our support does: shown, then whistled.
      let thief: Def | null = null, td = 1e9;
      for (const d of this.def) { const q = Math.hypot(d.x - r.x, d.y - r.y); if (d.stun <= 0 && d.st !== 'miss' && q < td) { td = q; thief = d; } }
      if (thief && td > 0.7 && this.ruckT < 2.5) { thief.bound = false; this.moveTo(thief, r.x - 0.4, r.y, this.spd(thief), dt); return; }
      if (this.ruckOk === 'steal') {
        if (thief) { this.ball.mode = 'taken'; this.ball.x = thief.x; this.ball.y = thief.y; }
        this.flash = 'TURNED OVER!'; this.flashT = 0.9;
        this.pend = { e: { k: 'turnover', x: r.x, y: r.y, why: 'ruck' }, t: 0.9 };
      } else {
        this.flash = 'HOLDING ON!'; this.flashT = 0.9;
        this.pend = { e: { k: 'turnover', x: r.x, y: r.y, why: 'holding' }, t: 0.9 };
      }
      this.ev.push('bad');
      return;
    }
    if (nineD > 0.45) return;
    // The halfback has the ball at the base. Now it is the player's to use.
    const c = this.att[this.carrier];
    this.ball.mode = 'held'; this.ball.x = c.x; this.ball.y = c.y;
    this.state = 'ready'; this.atRuck = true; this.phase++; this.tk = null; this.dived = false;
    c.v = 0;
    if (this.ruckOk === 'quick') {
      const slow = this.def.filter(d => this.up(d) && !d.sweeper);
      for (let q = 0; q < 2 && slow.length; q++) this.rng.pick(slow).stun = 0.9;
    }
  }
}
