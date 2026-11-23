// Regenerates public/icon-192.png and public/icon-512.png from the pixel grid below.
// Run: node tools/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// A tiny TRS monogram in the existing yellow, white, forest pitch palette.
const ART = (() => {
  const a = Array.from({ length: 16 }, () => Array(16).fill('.'));
  const glyphs = {
    T: ['GGGG', '.GG.', '.GG.', '.GG.', '.GG.'],
    R: ['GGG.', 'G..G', 'GGG.', 'G.G.', 'G..G'],
    S: ['.GGG', 'G...', '.GG.', '...G', 'GGG.'],
  };
  for (const [i, ch] of ['T', 'R', 'S'].entries()) {
    glyphs[ch].forEach((row, y) => [...row].forEach((px, x) => { if (px === 'G') a[5 + y][1 + i * 5 + x] = 'G'; }));
  }
  for (let x = 2; x < 14; x++) a[11][x] = 'W';
  for (let x = 0; x < 16; x++) { a[14][x] = x % 2 ? 'g' : 'h'; a[15][x] = x % 2 ? 'h' : 'g'; }
  return a.map(row => row.join(''));
})();
const COL = { '.': [15, 25, 35], G: [242, 193, 78], W: [244, 241, 222], g: [57, 128, 68], h: [63, 138, 75] };

function crc(buf) {
  let c = ~0;
  for (const v of buf) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

for (const size of [192, 512]) {
  const s = size / 16, raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(COL[ART[Math.floor(y / s)][Math.floor(x / s)]], y * (size * 3 + 1) + 1 + x * 3);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  const file = new URL('../public/icon-' + size + '.png', import.meta.url);
  writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
console.log('icons written');
