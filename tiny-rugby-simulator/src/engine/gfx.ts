// Shapes are filled rectangles on a 320x180 logical screen, scaled to the device. Text is real type.
export const W = 320, H = 180;
const MAX_EX = 50;

export interface Ctx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  // Real text. Missing in the bare test harness, where the pixel font stands in.
  font?: string; textBaseline?: string; textAlign?: string;
  fillText?(s: string, x: number, y: number): void;
  measureText?(s: string): { width: number };
}

// Both faces ship with the game (public/fonts, open licences) so it looks the same on every phone.
import { FONTS } from '../theme';
export interface LabelOpts { align?: 0 | 1 | 2; bold?: boolean; display?: boolean; a?: number }

// 3x5 pixel font, five rows of three bits per glyph. Used for things painted on the pitch.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '111111101101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101101111111', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  '-': '000000111000000', '+': '000010111010000', ':': '000010000010000', '/': '001001010100100',
  "'": '010010000000000', '%': '101001010100101', '$': '011110010011110', '(': '001010010010001',
  ')': '100010010010100', '>': '100010001010100', '<': '001010100010001', '*': '000101010101000',
  '#': '101111101111101', '=': '000111000111000', '_': '000000000000111',
};

export class Gfx {
  s = 1; ox = 0; oy = 0; pw = W; ph = H;
  // Phones are wider than 16:9. ex is how many extra logical pixels are visible past each side of the
  // 320-wide screen. Menus stay inside 0..W; the match draws from -ex to W + ex.
  ex = 0;
  constructor(public ctx: Ctx) {}

  resize(pw: number, ph: number) {
    this.pw = pw; this.ph = ph;
    this.s = Math.min(pw / W, ph / H);
    this.ox = Math.floor((pw - W * this.s) / 2);
    this.oy = Math.floor((ph - H * this.s) / 2);
    this.ex = Math.max(0, Math.min(MAX_EX, Math.floor(this.ox / this.s)));
  }

  get left() { return -this.ex; }
  get vw() { return W + 2 * this.ex; }

  rect(x: number, y: number, w: number, h: number, c: string, a = 1) {
    const s = this.s;
    const x0 = Math.round(x * s), y0 = Math.round(y * s);
    const x1 = Math.round((x + w) * s), y1 = Math.round((y + h) * s);
    if (x1 <= x0 || y1 <= y0) return;
    const ctx = this.ctx;
    ctx.fillStyle = c;
    if (a !== 1) ctx.globalAlpha = a;
    ctx.fillRect(this.ox + x0, this.oy + y0, x1 - x0, y1 - y0);
    if (a !== 1) ctx.globalAlpha = 1;
  }

  frame(x: number, y: number, w: number, h: number, c: string) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
  }

  // A panel with its corners knocked off, the house shape for cards and buttons.
  card(x: number, y: number, w: number, h: number, c: string, a = 1) {
    this.rect(x + 1, y, w - 2, h, c, a); this.rect(x, y + 1, 1, h - 2, c, a); this.rect(x + w - 1, y + 1, 1, h - 2, c, a);
  }

  static textW(str: string, scale = 1) { return str.length ? str.length * 4 * scale - scale : 0; }

  private fontOf(size: number, o: LabelOpts) {
    return o.display ? `${FONTS.display.startsWith('TTBlock') ? '700 ' : ''}${size * this.s}px ${FONTS.display}` : `${o.bold ? 700 : 600} ${size * this.s}px ${FONTS.sans}`;
  }

  // Width of a label in logical pixels.
  tw(str: string, size: number, o: LabelOpts = {}) {
    const ctx = this.ctx;
    if (!ctx.measureText) return Gfx.textW(str, size / 6.5);
    ctx.font = this.fontOf(size, o);
    return ctx.measureText(str).width / this.s;
  }

  // Proper type: sans for reading, the display face for headings. size is the font size in logical
  // pixels and (x, y) the top of the text. align: 0 left, 1 centre, 2 right.
  label(str: string, x: number, y: number, size: number, c: string, o: LabelOpts = {}) {
    const ctx = this.ctx;
    if (!ctx.fillText) { this.pix(str, x, y + size * 0.12, c, size / 6.5, o.align ?? 0); return; }
    ctx.font = this.fontOf(size, o);
    ctx.textBaseline = 'top'; ctx.textAlign = o.align === 1 ? 'center' : o.align === 2 ? 'right' : 'left';
    ctx.fillStyle = c;
    if (o.a !== undefined) ctx.globalAlpha = o.a;
    ctx.fillText(str, this.ox + x * this.s, this.oy + (y + size * 0.1) * this.s);
    if (o.a !== undefined) ctx.globalAlpha = 1;
  }

  // Older call sites give a pixel-font scale. They get the sans face at a matching size.
  text(str: string, x: number, y: number, c: string, scale = 1, align: 0 | 1 | 2 = 0) {
    const size = scale >= 5 ? scale * 5 : scale >= 3 ? 16 : scale >= 2 ? 11 : scale > 1 ? 8.5 : 6.5;
    this.label(str, x, y - size * 0.16, size, c, { align, bold: scale >= 2, display: scale >= 3 });
  }

  // The pixel font. align: 0 left, 1 centre, 2 right
  pix(str: string, x: number, y: number, c: string, scale = 1, align: 0 | 1 | 2 = 0, a = 1) {
    str = str.toUpperCase();
    const w = Gfx.textW(str, scale);
    let cx = align === 1 ? x - w / 2 : align === 2 ? x - w : x;
    if (align === 1) cx = Math.round(cx);
    for (const ch of str) {
      const gl = FONT[ch];
      if (gl) {
        for (let r = 0; r < 5; r++) {
          for (let k = 0; k < 3; k++) {
            if (gl[r * 3 + k] !== '1') continue;
            let run = 1;
            while (k + run < 3 && gl[r * 3 + k + run] === '1') run++;
            this.rect(cx + k * scale, y + r * scale, run * scale, scale, c, a);
            k += run - 1;
          }
        }
      }
      cx += 4 * scale;
    }
  }

  // Black out the letterbox so sprites drawn past the edge never show.
  bars() {
    const c = this.ctx;
    c.fillStyle = '#000';
    const bar = this.ox - Math.round(this.ex * this.s);
    if (bar > 0) { c.fillRect(0, 0, bar, this.ph); c.fillRect(this.pw - bar - 1, 0, bar + 1, this.ph); }
    if (this.oy > 0) { c.fillRect(0, 0, this.pw, this.oy); c.fillRect(0, this.ph - this.oy - 1, this.pw, this.oy + 1); }
  }
}
