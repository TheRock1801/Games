import { defineConfig } from 'vitest/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { TEAMS } from './src/data/teams';

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
    // Local development only: turn browser character drafts into a source-controlled
    // roster override file. The same /__dev/ network restriction protects this endpoint.
    server.middlewares.use('/__dev/publish-rosters', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      let body = '', size = 0;
      req.on('data', c => { size += c.length; if (size > 250_000) { req.destroy(); return; } body += c; });
      req.on('end', () => {
        try {
          const raw = JSON.parse(body) as Record<string, unknown>;
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid roster');
          const valid = new Set(TEAMS.map(t => t.id));
          const out: Record<string, Record<string, Record<string, string | number | boolean>>> = {};
          for (const [id, players] of Object.entries(raw)) {
            if (!valid.has(id) || !players || typeof players !== 'object' || Array.isArray(players)) throw new Error('Invalid team');
            const slots: Record<string, Record<string, string | number | boolean>> = {};
            for (const [slot, patch] of Object.entries(players)) {
              if (!/^(?:[0-9]|1[01])$/.test(slot) || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid slot');
              const changes: Record<string, string | number | boolean> = {};
              for (const [key, value] of Object.entries(patch)) {
                if (key === 'name' && typeof value === 'string' && value.trim().length > 0 && value.length <= 70) changes.name = value.trim();
                else if (key === 'star' && typeof value === 'boolean') changes.star = value;
                else if (['age','sta','hnd','pas','kck','tkl','skin'].includes(key) && typeof value === 'number' && Number.isInteger(value)) {
                  const lo = key === 'age' ? 16 : key === 'skin' ? 0 : 1, hi = key === 'age' ? 50 : key === 'skin' ? 3 : 99;
                  if (value < lo || value > hi) throw new Error('Out of range');
                  changes[key] = value;
                } else throw new Error('Invalid property');
              }
              if (Object.keys(changes).length) slots[slot] = changes;
            }
            if (Object.keys(slots).length) out[id] = slots;
          }
          writeFileSync(resolve(__dirname, 'src/data/roster-overrides.json'), JSON.stringify(out, null, 2) + '\n');
          res.setHeader('content-type', 'application/json'); res.end('{"ok":true}');
        } catch { res.statusCode = 400; res.end('{"ok":false}'); }
      });
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
