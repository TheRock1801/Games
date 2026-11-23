import { Gfx } from './gfx';
import type { Career } from '../career/types';
import { C, syncTheme } from '../theme';

// ts: when the browser saw the touch, in seconds. Finer than the frame clock, so swipe speed can be measured.
export interface PEv { t: 'down' | 'move' | 'up'; id: number; x: number; y: number; ts?: number }
export interface Scene { update(dt: number): void; draw(g: Gfx): void; onEv?(e: PEv): void }
export interface Store { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void }

export class Game {
  scene!: Scene;
  tap: { x: number; y: number } | null = null;
  ptr = { x: 0, y: 0, down: false };
  time = 0;
  career: Career | null = null;
  private q: PEv[] = [];
  private d0 = { x: 0, y: 0, t: 0, id: -1 };

  constructor(public g: Gfx, public store: Store) {}

  push(e: PEv) { this.q.push(e); }

  go(s: Scene) { this.scene = s; this.tap = null; }

  frame(dt: number) {
    this.time += dt;
    this.tap = null;
    const q = this.q; this.q = [];
    for (const e of q) {
      if (e.t === 'down') {
        this.d0 = { x: e.x, y: e.y, t: this.time, id: e.id };
        this.ptr = { x: e.x, y: e.y, down: true };
      } else if (e.t === 'move') {
        this.ptr.x = e.x; this.ptr.y = e.y;
      } else {
        this.ptr.down = false;
        if (e.id === this.d0.id && Math.hypot(e.x - this.d0.x, e.y - this.d0.y) < 10 && this.time - this.d0.t < 0.6) {
          this.tap = { x: e.x, y: e.y };
        }
      }
      this.scene.onEv?.(e);
    }
    syncTheme();
    this.scene.update(dt);
    // Paint the strips either side of the 320-wide screen, for scenes that do not draw out there.
    if (this.g.ex > 0) this.g.rect(this.g.left, 0, this.g.vw, 180, C.bg);
    this.scene.draw(this.g);
    this.g.bars();
  }
}
