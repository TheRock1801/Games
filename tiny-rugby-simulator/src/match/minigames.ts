import { Rng, clamp } from '../engine/rng';

// The one timing game left: a contested ruck. A marker sweeps back and forth; tap while it is inside
// the zone. Dead centre (the sweet spot, a small part of the zone) is a perfect contest.
export class Timing {
  pos = 0; dir = 1; t = 0; done = false;
  result: 'perfect' | 'good' | 'miss' | null = null;
  lo: number; hi: number;
  // sweet: the share of the zone, in its middle, that counts as perfect
  constructor(public speed: number, zoneW: number, rng: Rng, public timeout = 5, public sweet = 0.3) {
    const w = clamp(zoneW, 0.06, 0.6), mid = rng.range(0.25 + w / 2, 0.95 - w / 2);
    this.lo = mid - w / 2; this.hi = mid + w / 2;
  }
  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 1) { this.pos = 2 - this.pos; this.dir = -1; }
    if (this.pos < 0) { this.pos = -this.pos; this.dir = 1; }
    if (this.t > this.timeout) { this.done = true; this.result = 'miss'; }
  }
  tap() {
    if (this.done || this.t < 0.15) return;
    this.done = true;
    const mid = (this.lo + this.hi) / 2, half = (this.hi - this.lo) / 2, off = Math.abs(this.pos - mid);
    this.result = off <= half * this.sweet ? 'perfect' : off <= half ? 'good' : 'miss';
  }
}
