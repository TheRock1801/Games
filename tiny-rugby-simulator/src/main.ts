import { Gfx } from './engine/gfx';
import { Game, type Store } from './engine/game';
import { unlockAudio } from './engine/audio';
import { TitleScene } from './ui/menus';
import { DEV_KEY, loadDev, useDev } from './config';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

const store: Store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const game = new Game(new Gfx(ctx), store);
game.go(new TitleScene(game));
// Development only: pick up whatever the developer portal (/dev.html) has set, live, and open the
// screen it asked for. None of this is in a production build.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const dev = () => useDev(loadDev(store.get));
  dev();
  window.addEventListener('storage', e => { if (e.key === DEV_KEY) dev(); });
  const d = q.get('demo');
  if (d) import('./demo').then(x => x.demo(game, d));
  else if (q.get('scenario') || q.get('screen')) import('./dev/launch').then(x => x.launch(game, q));
}

// Notches and rounded corners: the #safe element carries the browser's safe-area insets as padding.
const probe = document.getElementById('safe');
function insets() {
  if (!probe) return { l: 0, t: 0, r: 0, b: 0 };
  const s = getComputedStyle(probe), n = (v: string) => parseFloat(v) || 0;
  return { l: n(s.paddingLeft), t: n(s.paddingTop), r: n(s.paddingRight), b: n(s.paddingBottom) };
}

// The game is always landscape. Held upright, the canvas is rotated a quarter turn.
// The canvas covers only the safe part of the screen, so nothing sits under a notch or the browser's bars.
let rot = false, dpr = 1, ax = 0, ay = 0, aw = 0;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const vv = window.visualViewport;
  const vw = Math.round(vv ? vv.width : window.innerWidth), vh = Math.round(vv ? vv.height : window.innerHeight);
  const i = insets();
  ax = i.l; ay = i.t; aw = Math.max(1, vw - i.l - i.r);
  const ah = Math.max(1, vh - i.t - i.b);
  rot = ah > aw;
  const cw = rot ? ah : aw, ch = rot ? aw : ah;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.style.transformOrigin = '0 0';
  canvas.style.transform = rot ? `translate(${ax + aw}px, ${ay}px) rotate(90deg)` : `translate(${ax}px, ${ay}px)`;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  game.g.resize(canvas.width, canvas.height);
}
// Canvas text only uses a web font once it has loaded, so ask for them up front.
for (const f of ['20px TTDisplay', '600 12px TTSans', '700 12px TTSans', '600 12px TTBlock', '700 12px TTBlock']) document.fonts?.load(f).catch(() => {});
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
window.visualViewport?.addEventListener('resize', resize);
resize();

function send(t: 'down' | 'move' | 'up', e: PointerEvent) {
  const cx = rot ? e.clientY - ay : e.clientX - ax, cy = rot ? ax + aw - e.clientX : e.clientY - ay;
  const g = game.g;
  game.push({ t, id: e.pointerId, x: (cx * dpr - g.ox) / g.s, y: (cy * dpr - g.oy) / g.s, ts: e.timeStamp / 1000 });
}

// On a phone, the first touch asks the browser for full screen so its bars stop eating the pitch.
// Browsers that refuse (iPhone Safari) simply carry on as they were.
let askedFull = false;
function goFull() {
  if (askedFull || !matchMedia('(pointer: coarse)').matches) return;
  askedFull = true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), null);
    p?.then(() => (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {})).catch(() => {});
  } catch { /* not allowed here */ }
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); unlockAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  send('down', e);
});
canvas.addEventListener('pointermove', e => {
  e.preventDefault();
  // Fast swipes arrive bundled; unpack them so no part of the gesture is lost.
  const all = e.getCoalescedEvents?.() ?? [];
  if (all.length > 1) for (const c of all) send('move', c); else send('move', e);
});
canvas.addEventListener('pointerup', e => { e.preventDefault(); send('up', e); goFull(); });
canvas.addEventListener('pointercancel', e => send('up', e));
canvas.addEventListener('contextmenu', e => e.preventDefault());
// Stop the page itself reacting to touches: no scrolling, pull-to-refresh, pinch or double-tap zoom.
for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick', 'selectstart']) {
  document.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
