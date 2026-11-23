import { defineConfig } from 'vitest/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// The developer portal (dev.html) exists only on the dev server. A production build has one page,
// index.html, so the portal and its save endpoint are simply not in what players get.
//
// "Publish to the game" in the portal posts the tuning here, and it is written to src/tuned.json.
// That file is part of the game, so published settings apply on every device and in the built app.
const devPortal = (): Plugin => ({
  name: 'trs-dev-portal',
  apply: 'serve',
  configureServer(server) {
    // The dev server is opened to the local network so a phone can load the game. The portal is not for
    // the network: it and its save endpoint answer only to this computer.
    const local = (a?: string) => !!a && (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1');
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? '';
      if ((url.startsWith('/dev.html') || url.startsWith('/__dev/') || url.startsWith('/src/dev/')) && !local(req.socket.remoteAddress)) {
        res.statusCode = 403; res.end('The developer portal only opens on the computer running the dev server.');
        return;
      }
      next();
    });
    server.middlewares.use('/__dev/publish', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      let body = '';
      req.on('data', c => { body += c; if (body.length > 100000) req.destroy(); });
      req.on('end', () => {
        try {
          const o = JSON.parse(body) as Record<string, unknown>, out: Record<string, number> = {};
          for (const [k, v] of Object.entries(o)) if (/^[a-zA-Z]+$/.test(k) && typeof v === 'number' && isFinite(v)) out[k] = v;
          writeFileSync(resolve(__dirname, 'src/tuned.json'), JSON.stringify(out, null, 2) + '\n');
          res.setHeader('content-type', 'application/json'); res.end('{"ok":true}');
        } catch { res.statusCode = 400; res.end('{"ok":false}'); }
      });
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [devPortal()],
  test: { testTimeout: 120000 },
});
