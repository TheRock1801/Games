// Enlarges part of a PNG so small sprites can be checked by eye.
// node tools/zoom.mjs in.png out.png x y w h [scale]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
const [src, out, x, y, w, h, k = '4'] = process.argv.slice(2);
const img = await loadImage(src), s = Number(k), c = createCanvas(Number(w) * s, Number(h) * s), g = c.getContext('2d');
g.imageSmoothingEnabled = false;
g.drawImage(img, Number(x), Number(y), Number(w), Number(h), 0, 0, Number(w) * s, Number(h) * s);
writeFileSync(out, c.toBuffer('image/png'));
