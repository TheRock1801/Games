import { Gfx, W } from '../engine/gfx';
import type { Game } from '../engine/game';
import { sfx } from '../engine/audio';

// Colours and fonts come from the theme (src/theme.ts).
import { C, PITCH } from '../theme';
export { C, PITCH };
export type Rect = [number, number, number, number];
export const inRect = (p: { x: number; y: number }, r: Rect) => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

function rgb(hex: string) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function lum(hex: string) { const [r, g, b] = rgb(hex); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; }
export const inkOn = (hex: string) => (lum(hex) > 0.6 ? C.dark : C.ink);
export function colourDist(a: string, b: string) { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }

// Game text is stored in capitals in places (commentary, season reports). This sets it in ordinary
// title case for reading, leaving short codes like AKL alone.
export function tc(s: string) {
  return s.replace(/[A-Z][A-Z']+/g, w => (w.length <= 3 && !/^(THE|AND|FOR|WON|TRY|OUT|OFF|YOU|TO|OF|IN|AT|BY|ON|A|IS|IT|NO|UP)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()));
}

// col: fill colour. primary: the one ochre call-to-action on a screen. size: label size.
export function button(game: Game, g: Gfx, x: number, y: number, w: number, h: number, label: string,
  o: { col?: string; off?: boolean; scale?: number; primary?: boolean; size?: number } = {}): boolean {
  const r: Rect = [x, y, w, h];
  const hot = !o.off && game.ptr.down && inRect(game.ptr, r);
  const fill = o.off ? C.panel : hot ? C.ink : o.primary ? C.gold : o.col ?? C.panel2;
  const size = o.size ?? (o.scale && o.scale >= 2 ? 11 : Math.min(8, h * 0.55));
  g.card(x, y + 1, w, h, C.dark, 0.35);
  g.card(x, y, w, h, fill);
  g.label(label, x + w / 2, y + (h - size) / 2 - size * 0.12, size, o.off ? C.dim : hot || o.primary ? C.dark : inkOn(fill), { align: 1, bold: true });
  if (!o.off && game.tap && inRect(game.tap, r)) { game.tap = null; sfx('ui'); return true; }
  return false;
}

export function topBar(g: Gfx, title: string, right = '', col = C.dark, col2 = C.gold) {
  g.rect(g.left, 0, g.vw, 18, col); g.rect(g.left, 18, g.vw, 1, col2);
  g.label(title, 8, 3, 11, inkOn(col), { display: true });
  if (right) g.label(right, W - 8, 5, 8, inkOn(col), { align: 2 });
}

export const starStr = (n: number) => '★'.repeat(n);

const SKIN = ['#f1c9a5', '#d9a066', '#a8703f', '#6f4a2a'];
const HAIR = ['#5a3d22', '#1a1a1a', '#1a1a1a', '#111111'];
const HAIR2 = ['#c9a25a', '#7a3b1d', '#3b2a1a', '#1a1a1a', '#8a8a8a'];

// ---- Match sprites: players built from pixel maps, so they stay rectangles all the way down. ----
// h hair, s skin, e eye, j jersey, J jersey in shade, k trim, p shorts, w socks, b boots
const HEAD = ['....hhhh....', '...hhhhhh...', '...hhssss...', '...hssses...', '....ssss....'];
const TORSO: Record<string, string[]> = {
  n: ['..jjjjjjjj..', '.jjjkkkkjjj.', '.sjjjjjjjjs.', '.s.jjjjjj.s.', '...JJJJJJ...'],
  a: ['..jjjjjjjj..', '.jjjkkkkjjj.', 'sj.jjjjjjjss', 's..jjjjjj..s', '...JJJJJJ...'],
  b: ['..jjjjjjjj..', 'sjjjkkkkjjj.', 's..jjjjjjjs.', '...jjjjjj.ss', '...JJJJJJ...'],
  pass: ['..jjjjjjjj..', '.jjjkkkkjjss', '...jjjjjjsss', '...jjjjjj...', '...JJJJJJ...'],
  fend: ['..jjjjjjjj..', '.jjjkkkkjjj.', '.s.jjjjjjsss', '.s.jjjjjj...', '...JJJJJJ...'],
};
const LEGS: Record<string, string[]> = {
  stand: ['...pppppp...', '...pp..pp...', '...ss..ss...', '...ww..ww...', '...ww..ww...', '..bbb..bbb..'],
  mid: ['...pppppp...', '....pppp....', '....ssss....', '....wwww....', '....wwww....', '....bbbbb...'],
  wide: ['...pppppp...', '..ppp..ppp..', '..ss....ss..', '.ww......ww.', '.ww......wwb', 'bb..........'],
  half: ['...pppppp...', '...ppp.ppp..', '...ss...ss..', '..ww....ww..', '..ww....wwb.', '.bb.........'],
};
// A flying tackle or a dive for the line: flat out, arms reaching.
const DIVE = ['...........hhh..', '....jjjjjjjsss.s', 'bwwpppjkkkjjsess', 'bwwpppjjjjjjss.s', '......JJJJJ.....'];
// Low and driving: a tackler hitting at the waist, or a forward bound into a ruck.
const WRAP = ['............', '.......hhh..', '..jjjjjhhss.', '.jjjkkjjsss.', '.jjjjjjjjsss', '.JJjjjj..ss.', '..pppp......', '..pp.pp.....', '.ss...ss....', '.ww...ww....', 'bb....bb....'];
// Going over backwards in the tackle.
const FALL = ['..hhh.........', '.hhsss........', '.hssse........', '..ssjjj.......', '...jjkjjj.....', '...sjjkjjj....', '....sjjjjpp...', '......JJppps..', '........ppssw.', '..........swwb', '...........wbb'];
// On the ground: a whole body, head at one end and boots at the other.
const LIE = ['.hh....s........', 'hhsjjjkjjjppsswb', 'hssjjjkjjjppswwb', '..s.JJJJJJ.pps.b'];
// Getting back up.
const KNEEL = ['....hhhh....', '...hhhhhh...', '...hhssss...', '...hssses...', '....ssss....', '..jjjjjjjj..', '.sjjkkkkjjs.', '.s.jjjjjj.s.', '...pppppp...', '...pps.pps..', '...ww..sww..', '..bbb...bb..'];

type Run = [number, number, number, string]; // x, y, width, palette key
interface Spr { runs: Run[]; w: number; h: number }
function compile(rows: string[]): Spr {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      runs.push([x, y, n, ch]);
      x += n - 1;
    }
  });
  return { runs, w: rows[0].length, h: rows.length };
}
const body = (t: string, l: string) => compile([...HEAD, ...TORSO[t], ...LEGS[l]]);
const RUN = [body('a', 'wide'), body('n', 'mid'), body('b', 'half'), body('n', 'mid')];
const SPR: Record<string, Spr> = {
  stand: body('n', 'stand'), pass: body('pass', 'half'), fend: body('fend', 'wide'),
  dive: compile(DIVE), wrap: compile(WRAP), fall: compile(FALL), lie: compile(LIE), kneel: compile(KNEEL),
};

const shadeMemo = new Map<string, string>();
function shade(hex: string, k = 0.7) {
  const key = hex + k;
  let v = shadeMemo.get(key);
  if (!v) { v = '#' + rgb(hex).map(c => Math.round(c * k).toString(16).padStart(2, '0')).join(''); shadeMemo.set(key, v); }
  return v;
}

export type SpritePose = 'stand' | 'run' | 'pass' | 'fend' | 'dive' | 'wrap' | 'fall' | 'lie' | 'kneel';
// pat: 0 a band across the chest, 1 hoops, 2 plain
export interface Kit { c1: string; c2: string; pat?: number }

// Draws a player with his feet at (fx, fy). face 1 looks right, -1 looks left. k scales the sprite.
export function drawPlayer(g: Gfx, fx: number, fy: number, kit: Kit, skin: number, pose: SpritePose = 'stand', anim = 0, face = 1, k = 1) {
  const frame = Math.floor(anim) & 3;
  const sp = pose === 'run' ? RUN[frame] : SPR[pose];
  const flat = pose === 'dive' || pose === 'lie';
  const bob = pose === 'run' && (frame & 1) ? -1 : 0;
  const lift = pose === 'dive' ? 3 : 0;
  const x0 = Math.round(fx) - (sp.w / 2) * k, y0 = Math.round(fy) + (1 - sp.h + bob - lift) * k;
  const sk = SKIN[skin & 3];
  const shorts = colourDist(kit.c2, kit.c1) > 90 ? kit.c2 : lum(kit.c1) > 0.5 ? '#22252b' : '#f4f1de';
  const pal: Record<string, string> = {
    h: HAIR[skin & 3], s: sk, e: '#1a1a1a', j: kit.c1, J: shade(kit.c1), k: kit.c2, p: shorts, w: kit.c1, b: '#16181c',
  };
  g.rect(Math.round(fx) - (flat ? 7 : 4) * k, Math.round(fy) + (flat ? 0 : 1) * k, (flat ? 14 : 8) * k, 2 * k, '#000', 0.22);
  const pat = kit.pat ?? 0, hoop: Record<string, string> = { j: kit.c2, J: shade(kit.c2) };
  for (const [x, y, n, ch] of sp.runs) {
    const col = pat === 1 && (y & 1) && hoop[ch] ? hoop[ch] : pat === 2 && ch === 'k' ? kit.c1 : pal[ch];
    g.rect(face > 0 ? x0 + x * k : x0 + (sp.w - x - n) * k, y0 + y * k, n * k, k, col);
  }
}

// A match ball seen from the side, centred on (x, y).
export function drawMatchBall(g: Gfx, x: number, y: number, k = 1) {
  x = Math.round(x) - 2 * k; y = Math.round(y) - k;
  const o = '#2b1d12';
  g.rect(x + k, y - k, 3 * k, k, o); g.rect(x + k, y + 3 * k, 3 * k, k, o); g.rect(x - k, y + k, k, k, o); g.rect(x + 5 * k, y + k, k, k, o);
  g.rect(x, y, k, k, o); g.rect(x + 4 * k, y, k, k, o); g.rect(x, y + 2 * k, k, k, o); g.rect(x + 4 * k, y + 2 * k, k, k, o);
  g.rect(x + k, y, 3 * k, 3 * k, '#fffdf2'); g.rect(x, y + k, 5 * k, k, '#fffdf2');
  g.rect(x + 2 * k, y, k, 3 * k, C.red);
}

// Exaggerated height in the overhead match camera: a high bomb looks several times larger.
// The shadow remains at the ball's projected position, so a conversion stays aligned with the posts.
export function airborneBallScale(z: number): number { return 1 + Math.min(2.65, Math.max(0, z) * 0.2); }
export function drawAirborneBall(g: Gfx, x: number, y: number, z: number, k = 1) {
  const q = k * airborneBallScale(z), shadow = k * (6 + Math.min(11, Math.max(0, z) * 0.9));
  g.rect(x - shadow / 2, y + 1, shadow, Math.max(2, k * 2), '#000', 0.28);
  if (z > 2.5) g.frame(x - shadow / 2 - 2, y - 2, shadow + 4, 6, '#000');
  drawMatchBall(g, x, y - 5 * k, q);
}

// Small ball for menus and the place-kick screen.
export function drawBall(g: Gfx, x: number, y: number) { drawMatchBall(g, x + 1, y + 1); }

// A little head-and-shoulders portrait. Every player gets his own from his id: hair, cut and skin.
export function drawFace(g: Gfx, x: number, y: number, size: number, p: { id: number; skin: number }, kit: Kit) {
  const u = size / 10, sk = SKIN[p.skin & 3], style = p.id % 5, hair = HAIR2[(p.id * 7 + p.skin) % (p.skin >= 2 ? 2 : 5) + (p.skin >= 2 ? 3 : 0)] ?? '#1a1a1a';
  const r = (cx: number, cy: number, w: number, h: number, c: string) => g.rect(x + cx * u, y + cy * u, w * u, h * u, c);
  g.card(x, y, size, size, C.blue);
  r(1, 7.5, 8, 2.5, kit.c1); r(4, 7.5, 2, 1, kit.c2);            // shoulders and collar
  r(4, 6.5, 2, 1.5, shade(sk, 0.85));                             // neck
  r(3, 2.5, 4, 4.5, sk); r(2.5, 4, 0.5, 1.5, sk); r(7, 4, 0.5, 1.5, sk); // head and ears
  if (style === 0) { r(3, 1.5, 4, 1.5, hair); }
  else if (style === 1) { r(2.5, 1.2, 5, 2, hair); r(2.5, 3, 0.5, 1, hair); r(7, 3, 0.5, 1, hair); }
  else if (style === 2) { r(3, 1.8, 4, 1, hair); r(3, 5.8, 4, 1.2, hair); r(4, 5.8, 2, 0.5, sk); }
  else if (style === 3) { r(3, 2.2, 4, 0.6, hair); }
  else { r(2.6, 1, 4.8, 2.2, hair); r(2.6, 3, 0.6, 2.4, hair); r(6.8, 3, 0.6, 2.4, hair); }
  r(3.7, 4.2, 0.8, 0.8, '#1a1a1a'); r(5.5, 4.2, 0.8, 0.8, '#1a1a1a'); // eyes
  r(4.2, 5.9, 1.6, 0.4, shade(sk, 0.6));                           // mouth
}

// Kept for older screens: a small standing player with his top-left corner at (x, y).
export function drawMan(g: Gfx, x: number, y: number, c1: string, c2: string, skin: number, anim: number, down = false) {
  drawPlayer(g, x + 4, y + 9, { c1, c2 }, skin, down ? 'lie' : anim ? 'run' : 'stand', anim, 1);
}
