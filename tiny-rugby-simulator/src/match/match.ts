import { Rng, clamp } from '../engine/rng';
import { T, type Formation } from '../config';
import { AttackPlay, FL, FW, LO_SPOTS, MID, POST, type PlayEnd, type Runner, type StartCfg, type Tackler } from './attack';
import { Timing } from './minigames';
import { simOpp, type Next, type OppResult, type OppStart } from './oppsim';
import type { MatchResult } from '../career/types';

export interface Side {
  id: string; name: string; c1: string; c2: string; pat?: number;
  ease?: number; // 0..1: how much slack this side gives as an opponent (early in a career it is a lot)
  runners: Runner[]; tacklers: Tackler[];
  pack: number; att: number; def: number; kick: number;
}

// ruck = a contested ruck: the timing bar is up while the players carry on forming it underneath.
export type Mode = 'banner' | 'play' | 'ruck' | 'scrum' | 'lineout' | 'penalty' | 'touchkick' | 'goalkick' | 'oppsim' | 'fulltime';

// A penalty kick for touch. out: it crosses the touchline (at lx metres up the field, on the edge y).
// A long kick from the ground or the hand that the player aims himself: a kick for touch, or a kick-off.
// The aim is still air. The real flight is bent by the wind, then the ball lands and rolls on, and where
// it finishes (in the field, over a touchline, or dead) is worked out from that path.
export interface LongAim { x: number; y: number; arc: number; dist: number }
export interface LongKick {
  phase: 'aim' | 'fly' | 'roll'; t: number; dur: number; from: { x: number; y: number };
  to: { x: number; y: number }; drift: { x: number; y: number }; arc: number;
  land: { x: number; y: number }; end: { x: number; y: number }; out: boolean; full: boolean; dead: boolean;
}
// A kick at goal, taken on the pitch. wait: nothing yet. aim: the thumb is down and (at a conversion)
// their man is charging. fly: the ball is in the air. cx, cy: where the charger is.
// How far the wind carries a place kick: metres of drift at the end of its flight, per metre-a-second of
// wind, per second in the air. The push builds through the flight, so a long kick is moved far more.
export const WIND_PUSH = 1.3;
export interface GoalAim { x: number; y: number; arc: number; dist: number }
export interface PlaceKick {
  phase: 'wait' | 'aim' | 'fly' | 'over'; kind: 'pen' | 'conv'; from: { x: number; y: number };
  t: number; dur: number; to: { x: number; y: number }; drift: { x: number; y: number }; arc: number;
  cx: number; cy: number; canAnim: number; good: boolean; result: 'good' | 'wide' | 'short' | 'charged' | '';
}

// A lineout throw. Jumpers stand 5 to 15 m in from touch; the three targets are the front, middle and back.
export const LO_ZONES = LO_SPOTS, LO_NAMES = ['Front', 'Middle', 'Back'];
// a throw longer than this goes over the back of the lineout to the backs
export const LO_OVER = 16.5;
// how long the CONTESTED call stays up before the ruck bar starts
export const RUCK_INTRO = 0.85;
// seconds for the throw to reach the jumper, and for him to tap it down to the halfback
export const LO_FLY = 0.6, LO_TAP = 0.4;
export interface Lineout { phase: 'aim' | 'fly'; t: number; dist: number; ang: number; zone: number; won: boolean; marked: number; maxD: number }

const HALF = 2400; // game seconds per half
// How fast the match clock runs against everything that uses it up. 1.25 makes a match a fifth shorter
// to play while the scoreboard still counts to 80 minutes.
const CLOCK_RATE = 1.25;
const GAINLINE = 2; // tackled less than this many metres past the last ruck: the ball is at risk
const WHY: Record<string, [string, string]> = {
  knockon: ['KNOCK ON', 'Scrum to them'], intercept: ['INTERCEPTED', ''], touch: ['INTO TOUCH', 'Their lineout'],
  kick: ['KICK FIELDED', 'Their ball'], charged: ['CHARGED DOWN', ''], stripped: ['LOST IN THE TACKLE', 'Scrum to them'],
  loose: ['LOOSE BALL', 'They got to it first'], short: ['NOT TEN METRES', 'Their scrum on halfway'], maul: ['MAUL HELD UP', 'They stopped the drive. Their ball'], ruck: ['TURNOVER', 'Ball stolen at the ruck'], holding: ['PENALTY AGAINST', 'Holding on at the ruck'],
};

export class Match {
  score = [0, 0]; tries = [0, 0];
  clock = 0; half = 1; phase = 1;
  mode: Mode = 'banner';
  play: AttackPlay | null = null;
  timing: Timing | null = null; timingKind: 'ruck' = 'ruck'; private holdT = 0;
  lo: Lineout | null = null; scrumT = 0;
  scrumFeed: 'us' | 'them' = 'us'; // whose put-in the scrum is
  tkick: LongKick | null = null;   // a penalty kick for touch
  ruckIntro = 0;                   // seconds of the CONTESTED call still to run
  noContest = false;               // training runs: no ruck contests, a tackle just ends the run
  feeder = -1;                     // which of their men is putting the ball into the scrum
  pk: PlaceKick | null = null; gkKind: 'pen' | 'conv' = 'conv';
  // The wind for this match, as metres per second across the pitch: x up the field, y down the screen.
  // Mostly light or moderate, now and then strong. It pushes place kicks off line.
  wind = { x: 0, y: 0 };
  banner = { title: '', sub: '', t: 0, dur: 1, then: () => {} };
  sim: OppResult | null = null; simT = 0;
  spot = { x: 50, y: MID };
  options: string[] = [];
  stats = { metres: 0, breaks: 0, phases: 0, passes: 0 };
  sfx: string[] = [];
  note = ''; // extra line on the full-time screen
  private firstRecv: 0 | 1; private seenRuck = 0; private lastT = 0; private phaseX = 0;

  constructor(public us: Side, public them: Side, public rng: Rng, public knockout = false) {
    this.firstRecv = rng.chance(0.5) ? 0 : 1;
    {
      const roll = rng.next(), force = roll < 0.5 ? rng.range(0.5, 1.6) : roll < 0.9 ? rng.range(1.6, 3) : rng.range(3, 4.6), dir = rng.range(0, Math.PI * 2);
      this.wind = { x: Math.cos(dir) * force, y: Math.sin(dir) * force };
    }
    this.show(`${us.name} v ${them.name}`, this.firstRecv === 0 ? 'You receive the kick-off' : 'You kick off', 2.2, () => this.kickoff(this.firstRecv));
  }

  get done() { return this.mode === 'fulltime'; }
  result(): MatchResult { return { us: this.score[0], them: this.score[1], ust: this.tries[0], themt: this.tries[1] }; }

  private show(title: string, sub: string, dur: number, then: () => void) {
    this.banner = { title, sub, t: 0, dur, then };
    this.mode = 'banner';
  }

  // Returns true when the half or the match has ended and play must not carry on.
  private clockCheck(): boolean {
    if (this.clock < HALF * this.half) return false;
    if (this.half === 1) {
      this.half = 2; this.clock = HALF; this.sfx.push('whistle');
      this.show('HALF TIME', `${this.us.id} ${this.score[0]} - ${this.score[1]} ${this.them.id}`, 2.5, () => this.kickoff(this.firstRecv === 0 ? 1 : 0));
    } else this.fulltime();
    return true;
  }

  private fulltime() {
    this.clock = HALF * 2; this.sfx.push('whistle'); this.note = '';
    if (this.knockout && this.score[0] === this.score[1]) {
      const edge = (this.us.att + this.us.def - this.them.att - this.them.def) / 200;
      const win = this.rng.chance(clamp(0.5 + edge, 0.2, 0.8));
      this.score[win ? 0 : 1] += 3;
      this.note = win ? 'Won by a golden point drop goal' : 'Lost to a golden point drop goal';
    }
    this.mode = 'fulltime';
  }

  private kickoff(recv: number) {
    if (this.clockCheck()) return;
    if (recv === 0) {
      // Their kick-off. It comes through the air from halfway and has to be caught: nothing is given.
      this.startPlay({ x: this.rng.range(16, 26), y: this.rng.range(FW * 0.2, FW * 0.8), kind: 'open' });
      this.play!.receiveKick(50, MID);
    } else {
      // Ours. It can only be kicked. Then the whole side chases it and it is played like any other kick:
      // if we get to it first, on we go; if they field it, their attack starts from there.
      this.spot = { x: 50, y: MID };
      this.startPlay({ x: 50, y: MID, kind: 'open', kickoff: true });
    }
  }

  private ourBall(cfg: StartCfg) { if (!this.clockCheck()) this.startPlay(cfg); }

  // A fresh passage of play from a restart. Once it is going, tackles and rucks happen inside it:
  // the same players carry on from where they are until we score or lose the ball.
  startPlay(cfg: StartCfg, mode: Mode = 'play') {
    this.phase = 1;
    this.play = new AttackPlay(this.us.runners, this.them.tacklers, { ...cfg, fatigue: clamp(this.clock / (HALF * 2), 0, 1), ease: this.them.ease ?? 0 }, this.rng);
    this.feeder = -1;
    this.seenRuck = 0; this.lastT = 0; this.phaseX = this.play.startX;
    this.timing = null;
    this.mode = mode;
  }

  private startOpp(st: OppStart) {
    if (this.clockCheck()) return;
    this.sim = simOpp(st, { name: this.them.name, att: this.them.att, def: this.us.def, kick: this.them.kick }, this.rng);
    this.simT = 0; this.mode = 'oppsim';
  }

  private finishOpp() {
    const s = this.sim!;
    this.score[1] += s.pts; this.tries[1] += s.tries; this.clock += s.clock;
    this.apply(s.next);
  }

  private apply(n: Next) {
    if (n.k === 'kickoffThem') { this.kickoff(1); return; }
    if (this.clockCheck()) return;
    this.spot = { x: n.x, y: n.y };
    if (n.k === 'scrum') this.startScrum('us');
    else if (n.k === 'lineout') this.startLineout(n.x, n.y);
    else if (n.k === 'penalty') this.penaltyMenu();
    else if (n.k === 'open') this.startPlay({ x: n.x, y: n.y, kind: 'open' });
    else this.startPlay({ x: n.x, y: n.y, kind: 'ruck', quick: true });
  }

  // A scrum is a quick restart, not a game of its own: it packs down, heaves for a moment and the
  // ball comes out. The side feeding it nearly always wins it.
  startScrum(feed: 'us' | 'them' = 'us') {
    if (this.clockCheck()) return;
    this.clock += 60; this.scrumT = 1.9; this.scrumFeed = feed;
    const s = this.spot;
    // the players who will play the next phase are the ones in the scrum: nothing is reset when it ends
    this.startPlay({ x: s.x, y: clamp(s.y, 6, FW - 6), kind: 'scrum', set: true }, 'scrum');
    if (feed === 'them') {
      // their halfback puts it in, from their side of the scrum; ours stands off
      const p = this.play!, r0 = p.ruck!, nine = p.att[p.carrier];
      const i = p.def.findIndex(d => !d.bound && !d.sweeper && d.stun < 1e8);
      if (i >= 0) { p.def[i].x = r0.x - 0.2; p.def[i].y = r0.y + 2.6; this.feeder = i; }
      nine.x -= 2.5; nine.y -= 2;
    }
  }

  private endScrum() {
    const rng = this.rng, s = this.spot, edge = (this.us.pack - this.them.pack) / 300;
    if (this.scrumFeed === 'them') {
      // their put-in: they nearly always keep it, but a stronger pack can take one against the head
      if (rng.chance(clamp(0.07 + edge * 1.5, 0.02, 0.2))) { this.sfx.push('good'); this.show('AGAINST THE HEAD!', 'Your pack wins their scrum', 1.3, () => { this.play!.releaseSet(true); this.mode = 'play'; }); return; }
      this.startOpp({ x: s.x, kind: 'scrum' });
      return;
    }
    if (rng.chance(clamp(0.05 - edge, 0.02, 0.15))) { this.show('SCRUM LOST', 'Their pack drove you off the ball', 1.6, () => this.startOpp({ x: s.x, kind: 'turnover' })); return; }
    if (rng.chance(clamp(0.05 + edge, 0.01, 0.15))) { this.show('SCRUM PENALTY', 'Your pack wins it', 1.4, () => this.penaltyMenu()); return; }
    this.play!.releaseSet();
    this.mode = 'play';
  }

  // Our throw. The player aims it; one of their jumpers is marking a zone and can be seen doing it.
  startLineout(x: number, y: number) {
    this.spot = { x: clamp(x, 5, 95), y: y < MID ? 0 : FW };
    this.clock += 40;
    this.lo = { phase: 'aim', t: 0, dist: 0, ang: 0, zone: 1, won: false, marked: this.rng.int(0, 2), maxD: clamp(17 + this.us.pack * 0.09, 20, 26) };
    this.startPlay({ x: this.spot.x, y: this.spot.y, kind: 'lineout', set: true, edge: this.spot.y }, 'lineout');
  }

  // A lineout played as a set play: there is no throw to aim. The ball is won, it is in the halfback's
  // hands, and everybody is standing where the chosen play puts them, ready for it to be started.
  lineoutPlay(f: Formation) {
    const lo = this.lo, p = this.play;
    if (!lo || lo.phase !== 'aim' || this.mode !== 'lineout' || !p) return;
    this.lo = null; this.mode = 'play';
    p.releaseSet(false);
    p.usePlay(f, true);
    this.sfx.push('good');
  }

  // How risky a throw of this length and angle is. Used for the aiming line's colour as well as the result.
  stealChance(dist: number, ang: number): number {
    const lo = this.lo!;
    let zone = 0;
    LO_ZONES.forEach((z, i) => { if (Math.abs(dist - z) < Math.abs(dist - LO_ZONES[zone])) zone = i; });
    const off = Math.abs(dist - LO_ZONES[zone]);
    return clamp(0.05 + (this.them.pack - this.us.pack) / 400 + [0, 0.03, 0.07][zone] + off * 0.07 + Math.abs(ang) * 0.9 + (zone === lo.marked ? 0.12 : 0), 0.03, 0.75);
  }

  // dist: metres in from touch. ang: radians off straight, positive towards their line.
  throwLine(dist: number, ang: number) {
    const lo = this.lo;
    if (!lo || lo.phase !== 'aim' || this.mode !== 'lineout') return;
    dist = clamp(dist, 3, lo.maxD); ang = clamp(ang, -0.3, 0.3);
    if (dist > LO_OVER) {
      // over the back to the backs: a real ball in the air, with everything that can go wrong with one
      this.lo = null; this.mode = 'play';
      this.play!.longThrow(dist, ang);
      this.sfx.push('pass');
      return;
    }
    let zone = 0;
    LO_ZONES.forEach((z, i) => { if (Math.abs(dist - z) < Math.abs(dist - LO_ZONES[zone])) zone = i; });
    Object.assign(lo, { phase: 'fly', t: 0, dist, ang, zone, won: !this.rng.chance(this.stealChance(dist, ang)) });
    this.sfx.push('pass');
  }

  private endLineout() {
    const lo = this.lo!, s = this.spot;
    this.lo = null;
    if (!lo.won) { this.sfx.push('bad'); this.show('LINEOUT STOLEN', lo.zone === lo.marked ? 'They were waiting for that one' : 'Their jumper got up first', 1.5, () => this.startOpp({ x: s.x, kind: 'turnover' })); return; }
    this.sfx.push('good');
    // off the top to the halfback, who is standing off the line; ball from the back catches the defence flat
    // more often than not the forwards close round the catcher and drive it
    if (this.rng.chance(T.maulChance)) this.play!.startMaul(lo.zone); else this.play!.releaseSet(lo.zone === 2);
    this.mode = 'play';
  }

  private penaltyMenu() {
    this.sfx.push('whistle'); this.clock += 20;
    this.options = [this.spot.x >= 60 ? 'Kick at goal' : '', 'Kick to touch', 'Tap and go'];
    this.timing = null;
    this.mode = 'penalty';
  }

  // A conversion or a penalty goal. Same pitch, same camera, same pull-back as every other kick.
  startGoalKick(kind: 'pen' | 'conv', x: number, y: number) {
    this.clock += 60; this.gkKind = kind;
    this.spot = { x, y };
    this.play = null; // the passage that led here is over; nothing of it is drawn again
    this.pk = { phase: 'wait', kind, from: { x, y }, t: 0, dur: 1, to: { x, y }, drift: { x: 0, y: 0 }, arc: 6, cx: FL, cy: MID + (y - MID) * 0.6, canAnim: 0, good: false, result: '' };
    this.mode = 'goalkick';
  }

  // Where a place kick would go with no wind. A better kicker gets a longer, higher line for the same pull.
  aimGoal(ax: number, ay: number, power: number): GoalAim | null {
    const k = this.pk, l = Math.hypot(ax, ay);
    if (!k || l <= 0 || ax / l < -0.1) return null; // any direction but backwards: from the corner the posts are almost side-on
    const q = 0.75 + this.us.kick / 400, pw = clamp(power, 0, 1);
    const dist = (16 + 42 * pw) * q * T.kickDist;
    return { x: k.from.x + (ax / l) * dist, y: k.from.y + (ay / l) * dist, arc: (4 + 10 * pw) * q * T.kickHeight, dist };
  }

  // The thumb goes down: at a conversion their man sets off from the goal line.
  startAim() { const k = this.pk; if (k && k.phase === 'wait' && this.mode === 'goalkick') k.phase = 'aim'; }

  // The position of a place kick part-way through its flight (f from 0 to 1): the aimed line, bent by the wind.
  flightAt(k: PlaceKick, f: number) {
    return { x: k.from.x + (k.to.x - k.from.x) * f + k.drift.x * f * f, y: k.from.y + (k.to.y - k.from.y) * f + k.drift.y * f * f, z: Math.sin(f * Math.PI) * k.arc };
  }

  kickGoal(ax: number, ay: number, power: number) {
    const k = this.pk;
    if (!k || (k.phase !== 'aim' && k.phase !== 'wait') || this.mode !== 'goalkick') return;
    // the kicker's own accuracy turns the line a little; the wind then pushes the ball as it flies
    const e = this.rng.norm(0, (100 - this.us.kick) * 0.0016), cs = Math.cos(e), sn = Math.sin(e);
    const a = this.aimGoal(ax * cs - ay * sn, ax * sn + ay * cs, power);
    if (!a) return;
    const dur = 0.9 + a.dist / 26;
    Object.assign(k, { phase: 'fly', t: 0, dur, to: { x: a.x, y: a.y }, arc: a.arc, drift: { x: this.wind.x * dur * WIND_PUSH, y: this.wind.y * dur * WIND_PUSH } });
    // Score at the exact intersection with the goal line. Sampling 1/80 of a flight could
    // call a ball WIDE even when it visibly travelled just inside an upright.
    const crossing = () => {
      if (this.flightAt(k, 1).x < FL || k.from.x >= FL) return null;
      let lo = 0, hi = 1;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (this.flightAt(k, mid).x < FL) lo = mid; else hi = mid;
      }
      const f = (lo + hi) / 2;
      return { f, p: this.flightAt(k, f) };
    };
    let crossed = crossing();
    if (crossed && k.to.x < FL + 10 && k.to.x > k.from.x + 1) {
      // Continue the visible flight past the posts without changing the actual crossing point.
      const { f, p } = crossed, sc = (FL + 10 - k.from.x) / (k.to.x - k.from.x);
      k.to = { x: k.from.x + (k.to.x - k.from.x) * sc, y: k.from.y + (k.to.y - k.from.y) * sc };
      k.dur *= sc;
      k.drift = { x: k.drift.x * sc * sc, y: k.drift.y * sc * sc };
      k.arc = p.z / Math.max(0.08, Math.sin(Math.PI * f / sc));
      crossed = crossing(); // judge the same geometry that will actually be drawn
    }
    if (!crossed) k.result = 'short';
    else {
      const { y, z } = crossed.p;
      k.result = Math.abs(y - MID) >= POST ? 'wide' : z < 3 ? 'short' : 'good';
    }
    k.good = k.result === 'good';
    this.sfx.push('kick');
  }

  // Menu choice for penalties and lineouts.
  choose(i: number) {
    if (this.mode === 'penalty') {
      if (i === 0 && this.options[0]) this.startGoalKick('pen', this.spot.x, this.spot.y);
      else if (i === 1) this.startTouchKick();
      else if (i === 2) this.startPlay({ x: this.spot.x, y: this.spot.y, kind: 'tap' });
    }
  }

  // A penalty kicked for touch is a real kick in a real passage of play: both sides are on the field, the
  // ball is live until it actually crosses a line, and if it does that untouched it is our throw.
  startTouchKick() {
    this.clock += 30;
    this.startPlay({ x: this.spot.x, y: this.spot.y, kind: 'open', penKick: true, push: { x: this.wind.x * WIND_PUSH * 0.8, y: this.wind.y * WIND_PUSH * 0.8 } });
  }

  private newLong(from: { x: number; y: number }): LongKick {
    return { phase: 'aim', t: 0, dur: 1, from: { ...from }, to: { ...from }, drift: { x: 0, y: 0 }, arc: 8, land: { ...from }, end: { ...from }, out: false, full: false, dead: false };
  }

  // Where a long kick would come down in still air. (ax, ay) is the direction, power 0..1 the length.
  aimLong(k: LongKick, ax: number, ay: number, power: number): LongAim | null {
    const l = Math.hypot(ax, ay);
    if (l <= 0 || ax / l < -0.2) return null;
    const q = 0.75 + this.us.kick / 400, pw = clamp(power, 0, 1);
    const dist = (12 + 40 * pw) * q * T.kickDist;
    return { x: k.from.x + (ax / l) * dist, y: k.from.y + (ay / l) * dist, arc: (5 + 6 * pw) * T.kickHeight, dist };
  }

  // The ball's position part-way through its flight (f from 0 to 1): the aimed line, bent by the wind.
  longAt(k: LongKick, f: number) {
    return { x: k.from.x + (k.to.x - k.from.x) * f + k.drift.x * f * f, y: k.from.y + (k.to.y - k.from.y) * f + k.drift.y * f * f, z: Math.sin(f * Math.PI) * k.arc };
  }

  private launchLong(k: LongKick, ax: number, ay: number, power: number): boolean {
    if (k.phase !== 'aim') return false;
    // the kicker's accuracy turns the line a little, the wind pushes the ball as it flies, and when it
    // lands it rolls on, not quite straight
    const e = this.rng.norm(0, (100 - this.us.kick) * 0.0025), cs = Math.cos(e), sn = Math.sin(e);
    const a = this.aimLong(k, ax * cs - ay * sn, ax * sn + ay * cs, power);
    if (!a) return false;
    const dur = 0.9 + a.dist / 24;
    Object.assign(k, { phase: 'fly', t: 0, dur, to: { x: a.x, y: a.y }, arc: a.arc, drift: { x: this.wind.x * dur * WIND_PUSH * 0.8, y: this.wind.y * dur * WIND_PUSH * 0.8 }, out: false, full: false, dead: false });
    const off = (p: { x: number; y: number }) => p.y < 0 || p.y > FW || p.x > FL + 8;
    // does it go out on the full?
    for (let i = 1; i <= 60; i++) {
      const p = this.longAt(k, i / 60);
      if (!off(p)) continue;
      k.dur *= i / 60; k.to = { x: p.x - k.drift.x * (i / 60) ** 2, y: p.y - k.drift.y * (i / 60) ** 2 }; k.drift = { x: k.drift.x * (i / 60) ** 2, y: k.drift.y * (i / 60) ** 2 };
      k.land = k.end = { x: p.x, y: p.y }; k.out = true; k.full = true; k.dead = p.x > FL + 8;
      this.sfx.push('kick');
      return true;
    }
    // it lands in the field and runs on
    const land = this.longAt(k, 1);
    const turn = this.rng.norm(0, 0.4), c2 = Math.cos(turn), s2 = Math.sin(turn);
    const dx = (land.x - k.from.x) / a.dist, dy = (land.y - k.from.y) / a.dist, run = a.dist * this.rng.range(0.16, 0.34);
    let end = { x: land.x + (dx * c2 - dy * s2) * run, y: land.y + (dx * s2 + dy * c2) * run };
    for (let i = 1; i <= 20; i++) {
      const p = { x: land.x + (end.x - land.x) * i / 20, y: land.y + (end.y - land.y) * i / 20 };
      if (off(p)) { end = p; k.out = true; k.dead = p.x > FL + 8; break; }
    }
    k.land = { x: land.x, y: land.y }; k.end = end;
    this.sfx.push('kick');
    return true;
  }

  // Where a long kick's ball is right now, for drawing and for the camera.
  longBall(k: LongKick) {
    if (k.phase === 'fly') return this.longAt(k, Math.min(1, k.t / k.dur));
    if (k.phase === 'roll') { const f = Math.min(1, k.t / 0.8), e = 1 - (1 - f) * (1 - f); return { x: k.land.x + (k.end.x - k.land.x) * e, y: k.land.y + (k.end.y - k.land.y) * e, z: Math.abs(Math.sin(f * Math.PI * 2.5)) * 0.8 * (1 - f) }; }
    return { x: k.from.x, y: k.from.y, z: 0 };
  }

  private stepLong(k: LongKick, dt: number): boolean {
    if (k.phase === 'fly') { k.t += dt; if (k.t >= k.dur) { if (k.full) return true; k.phase = 'roll'; k.t = 0; } }
    else if (k.phase === 'roll') { k.t += dt; if (k.t >= 0.95) return true; }
    return false;
  }

  kickTouch(ax: number, ay: number, power: number) {
    const k = this.tkick;
    if (k && this.mode === 'touchkick' && this.launchLong(k, ax, ay, power)) this.clock += 30;
  }

  private endTouchKick() {
    const k = this.tkick!;
    this.tkick = null;
    // a penalty that finds touch, on the full or off a bounce, is our throw where it went out
    if (k.out && !k.dead) { this.sfx.push('good'); this.startLineout(clamp(k.end.x, 5, 95), k.end.y); return; }
    this.sfx.push('bad');
    if (k.dead) this.show('BALL DEAD', 'Kicked too long. Their drop-out', 1.6, () => this.startOpp({ x: 78, kind: 'kick' }));
    else this.show('MISSED TOUCH', 'The kick stayed in play. Their ball', 1.6, () => this.startOpp({ x: clamp(k.end.x, 1, 99), kind: 'kick' }));
  }

  // A press anywhere: timing games and place kicks react on touch down.
  press() {
    if (this.mode === 'ruck' && this.ruckIntro <= 0) this.timing?.tap(); // a thumb already down when it is called does not count

  }

  // A tap: skips banners and the opposition ticker.
  tap() {
    if (this.mode === 'banner' && this.banner.t > 0.35) this.banner.t = this.banner.dur;
    else if (this.mode === 'oppsim' && this.sim) {
      const all = this.sim.lines.length * 0.8;
      if (this.simT < all) this.simT = all; else this.simT = all + 99;
    }
  }

  private seenClock = 0;

  update(dt: number) {
    this.tick(dt);
    // whatever time was used since the last look, a quarter as much again goes with it
    if (this.clock > this.seenClock && this.mode !== 'fulltime') this.clock += (this.clock - this.seenClock) * (CLOCK_RATE - 1);
    this.seenClock = this.clock;
  }

  private tick(dt: number) {
    switch (this.mode) {
      case 'banner': {
        const b = this.banner; b.t += dt;
        if (b.t >= b.dur) b.then();
        break;
      }
      case 'play': case 'ruck': this.runPlay(dt * T.gameSpeed); break;
      case 'touchkick': if (this.stepLong(this.tkick!, dt)) this.endTouchKick(); break;
      case 'scrum': this.scrumT -= dt; if (this.scrumT <= 0) this.endScrum(); break;
      case 'lineout': {
        const lo = this.lo!;
        if (lo.phase === 'fly') { lo.t += dt; if (lo.t > LO_FLY + LO_TAP) this.endLineout(); }
        break;
      }
      case 'goalkick': {
        const k = this.pk!;
        if (k.phase === 'aim' && k.kind === 'conv') {
          // their man charges from the goal line while the kick is being lined up
          const dx = k.from.x + 1 - k.cx, dy = k.from.y - k.cy, l = Math.hypot(dx, dy), sp = 8.4 * T.defSpeed * dt; // he comes hard
          k.canAnim += dt * 12;
          if (l < 1.7) { k.phase = 'over'; k.result = 'charged'; k.t = 0; this.sfx.push('tackle'); }
          else { k.cx += (dx / l) * sp; k.cy += (dy / l) * sp; }
        } else if (k.phase === 'fly') { k.t += dt; if (k.t >= k.dur) { k.phase = 'over'; k.t = 0; } }
        else if (k.phase === 'over') { k.t += dt; if (k.t > 0.8) { const good = k.good; this.pk = null; this.onGoalKick(good, k.result); } }
        break;
      }
      case 'oppsim': {
        this.simT += dt;
        if (this.simT > this.sim!.lines.length * 0.8 + 1.6) this.finishOpp();
        break;
      }
    }
  }

  // Shows a timing result for half a second before acting on it.
  private held(dt: number, t: Timing): boolean {
    if (this.holdT === 0) this.sfx.push(t.result === 'miss' ? 'bad' : 'good');
    this.holdT += dt;
    if (this.holdT <= 0.5) return false;
    this.holdT = 0;
    return true;
  }

  private runPlay(dt: number) {
    const p = this.play!;
    p.step(dt);
    this.clock += (p.time - this.lastT) * 10; this.lastT = p.time;
    this.sfx.push(...p.ev.splice(0));
    this.phase = p.phase;
    if (this.mode === 'ruck') {
      // a contested ruck: the bar decides it while the bodies keep arriving
      const t = this.timing!;
      if (this.ruckIntro > 0) this.ruckIntro -= dt; else t.update(dt);
      if (t.done && this.held(dt, t)) {
        const res = t.result ?? 'miss';
        this.timing = null; this.mode = 'play';
        if (res === 'miss') p.ruckOk = this.rng.chance(0.12) ? 'pen' : 'steal';
        else if (res === 'perfect') {
          // dead centre: their man is pinged at the breakdown, and it is a penalty where the ruck was
          this.sfx.push('whistle'); this.stats.phases++;
          this.show('PENALTY!', 'A perfect contest at the ruck. Kick for touch', 1.5, () => { this.clock += 20; this.startTouchKick(); });
        } else this.ruckWon(p, false);
      }
    } else if (p.ruckSeq !== this.seenRuck && p.state === 'ruck') { this.seenRuck = p.ruckSeq; this.onRuck(p); }
    if (this.play === p && p.state === 'done' && p.end && (this.mode === 'play' || this.mode === 'ruck')) { this.timing = null; this.onPlayEnd(p, p.end); }
  }

  // A tackle has been made and the ruck is forming. Decide how it will go.
  private onRuck(p: AttackPlay) {
    const rng = this.rng, r = p.ruck!;
    this.stats.metres += r.x - this.phaseX; this.phaseX = r.x;
    this.spot = { x: r.x, y: r.y };
    this.clock += 18;
    if (this.clockCheck()) return;
    // Caught behind the gain line with the defence on top: the ball is often lost.
    // Rare now, and always shown: caught behind the gain line with nobody near, their man gets over the ball.
    if (!this.noContest && (p.lastGain < GAINLINE && p.ruckSupport === 0 && rng.chance(T.gainlineLoss * 3) || p.lastGain < GAINLINE && rng.chance(T.gainlineLoss))) { p.ruckOk = rng.chance(0.1) ? 'pen' : 'steal'; return; }
    if (!this.noContest && rng.chance(T.ruckContest)) {
      this.ruckIntro = RUCK_INTRO; this.sfx.push('whistle');
      const s = p.ruckSupport;
      this.timingKind = 'ruck';
      // The bar moves briskly and the target is small. How small depends on who is in there: strong
      // ruckers with support arriving make it bigger, a lone carrier against big tacklers makes it tiny.
      const zone = clamp(0.25 + p.ruckEdge / 240 + 0.02 * Math.min(s, 3) - (s === 0 ? 0.05 : 0), 0.15, 0.4);
      // the penalty spot in the middle is small, and only a strong pack makes it much bigger
      this.timing = new Timing(1.35 + 0.025 * Math.min(p.phase, 8), zone, rng, 5, clamp(0.07 + p.ruckEdge / 400, 0.05, 0.12));
      this.mode = 'ruck';
      return;
    }
    this.ruckWon(p, false);
  }

  private ruckWon(p: AttackPlay, quick: boolean) {
    if (!this.noContest && this.rng.chance(0.008)) { this.show('PENALTY', 'They are offside at the ruck', 1.4, () => this.penaltyMenu()); return; }
    this.stats.phases++;
    p.ruckOk = quick ? 'quick' : 'won';
  }

  private onPlayEnd(p: AttackPlay, e: PlayEnd) {
    this.stats.breaks += p.breaks; this.stats.passes += p.passes;
    const rng = this.rng;
    switch (e.k) {
      case 'try': {
        this.stats.metres += Math.max(0, FL - this.phaseX);
        this.score[0] += 5; this.tries[0]++; this.sfx.push('try');
        // taken in line with where the ball was grounded: under the posts is close, out wide is a long way back
        const back = clamp(Math.abs(e.y - MID) * 1.05 + 11, 12, 28);
        this.show('TRY!', p.att[e.who].name, 2.4, () => this.startGoalKick('conv', FL - back, e.y));
        break;
      }
      case 'tackled':
        this.show('HELD IN GOAL', 'Five-metre scrum to them', 1.8, () => { this.spot = { x: 5, y: clamp(e.y, 6, FW - 6) }; this.startScrum('them'); });
        break;
      case 'turnover': {
        this.sfx.push('bad');
        const w = WHY[e.why];
        const kind: OppStart['kind'] = e.why === 'kick' ? 'kick' : e.why === 'touch' ? 'lineout' : e.why === 'knockon' || e.why === 'stripped' ? 'scrum'
          : e.why === 'holding' ? 'penalty' : 'turnover';
        // a scrum to them is packed down on the pitch with their put-in; the rest goes to their attack
        if (e.why === 'short') this.show(w[0], w[1], 1.6, () => { this.spot = { x: 50, y: MID }; this.startScrum('them'); });
        else if (kind === 'scrum') this.show(w[0], w[1], 1.6, () => { this.spot = { x: clamp(e.x, 5, 95), y: clamp(e.y, 6, FW - 6) }; this.startScrum('them'); });
        else this.show(w[0], w[1], 1.6, () => this.startOpp({ x: clamp(e.x, 1, 99), kind }));
        break;
      }
      case 'lineoutUs':
        this.sfx.push('good');
        this.show(e.pen ? 'FOUND TOUCH' : '50:22!', 'Your lineout', e.pen ? 1.2 : 1.8, () => { if (!this.clockCheck()) this.startLineout(e.x, e.y); });
        break;
      case 'dropgoal':
        if (e.good) { this.score[0] += 3; this.sfx.push('good'); this.show('DROP GOAL!', '3 points', 2, () => this.kickoff(0)); }
        else { this.sfx.push('bad'); this.show('DROP GOAL MISSED', '22 drop-out', 1.6, () => this.ourBall({ x: 48, y: MID, kind: 'open' })); }
        break;
      case 'dropout':
        this.show('BALL DEAD', '22 drop-out', 1.4, () => this.ourBall({ x: e.x, y: rng.range(FW * 0.25, FW * 0.75), kind: 'open' }));
        break;
    }
  }

  private onGoalKick(good: boolean, why = '') {
    const missed = why === 'charged' ? 'CHARGED DOWN' : why === 'short' ? 'DROPPED SHORT' : 'WIDE';
    this.sfx.push(good ? 'good' : 'bad');
    if (this.gkKind === 'conv') {
      if (good) this.score[0] += 2;
      this.show(good ? 'CONVERTED!' : missed, good ? '2 points' : '', 1.4, () => this.kickoff(0));
    } else if (good) {
      this.score[0] += 3;
      this.show('PENALTY GOAL!', '3 points', 1.6, () => this.kickoff(0));
    } else this.show(missed, '22 drop-out', 1.4, () => this.ourBall({ x: 48, y: MID, kind: 'open' }));
  }
}
