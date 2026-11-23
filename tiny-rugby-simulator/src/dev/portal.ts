// The developer portal page (dev.html). Plain DOM, no framework: sliders on the left, the real game
// in a frame on the right. Moving a slider writes the shared tuning to the browser's storage, and the
// game in the frame picks it up at once (see the DEV block in main.ts), so what you see is the real thing.
import { DEFAULT_TUNING, DEV_KEY, FACTORY_TUNING, TUNE_DEFS, loadDev, type DevStore, type Tuning } from '../config';
import { SCENARIOS } from '../scenarios';

const $ = <T extends HTMLElement>(html: string): T => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as T; };
let store: DevStore = loadDev(k => localStorage.getItem(k));
const write = () => localStorage.setItem(DEV_KEY, JSON.stringify(store));
const fmt = (v: number, step: number) => String(Number(v.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)));

const tuning = document.getElementById('tuning')!, stage = document.getElementById('stage')!;
let status: HTMLElement, frame: HTMLIFrameElement, hist: HTMLElement, current = '?screen=match';
const say = (s: string, kind = 'good') => { status.textContent = s; status.className = kind; };

function show(query: string) { current = query; frame.src = `./index.html${query}${query.includes('?') ? '&' : '?'}t=${Date.now()}`; }

// ---- left: the dials ----
function buildTuning() {
  tuning.innerHTML = '';
  tuning.append($(`<div><h2>Gameplay tuning</h2><p class="lead">Every slider is a real setting the game reads. Changes show up in the test match on the right straight away. <b>Save</b> keeps a restore point. <b>Publish</b> makes them the game's defaults everywhere, including on your phone.</p></div>`));
  const bar = $(`<div class="bar"><div class="row">
    <button class="primary" id="save">Save changes</button>
    <button id="undo">Undo to last save</button>
    <button id="publish">Publish to the game</button>
    <button class="warn" id="reset">Reset to default</button>
  </div><div id="status"></div></div>`);
  tuning.append(bar);
  status = bar.querySelector('#status')!;
  for (const group of [...new Set(TUNE_DEFS.map(d => d.group))]) {
    tuning.append($(`<h3>${group}</h3>`));
    for (const d of TUNE_DEFS.filter(x => x.group === group)) {
      const v = store.tuning[d.key] ?? d.def;
      const el = $(`<div class="card dial"><label for="r_${d.key}">${d.label}</label><span class="unit">${d.unit ?? ''} (default ${fmt(d.def, d.step)})</span>
        <div class="help">${d.help}</div>
        <input type="range" id="r_${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}">
        <input type="number" min="${d.min}" max="${d.max}" step="${d.step}" value="${fmt(v, d.step)}" aria-label="${d.label}"></div>`);
      const range = el.querySelector<HTMLInputElement>('input[type=range]')!, num = el.querySelector<HTMLInputElement>('input[type=number]')!;
      const mark = () => el.classList.toggle('changed', Math.abs((store.tuning[d.key] ?? d.def) - DEFAULT_TUNING[d.key]) > 1e-9);
      const set = (raw: string, from: HTMLInputElement) => {
        const n = Math.min(d.max, Math.max(d.min, Number(raw)));
        if (!isFinite(n)) return;
        store.tuning[d.key] = n;
        if (from !== range) range.value = String(n);
        if (from !== num) num.value = fmt(n, d.step);
        mark(); write(); say('Live in the test match. Not saved yet.', '');
      };
      range.addEventListener('input', () => set(range.value, range));
      num.addEventListener('change', () => set(num.value, num));
      mark();
      tuning.append(el);
    }
  }
  bar.querySelector('#save')!.addEventListener('click', () => {
    store.history.unshift({ at: new Date().toISOString(), note: '', tuning: { ...store.tuning } });
    store.history = store.history.slice(0, 30);
    write(); buildHistory(); say('Saved. A restore point has been added to the history.');
  });
  bar.querySelector('#undo')!.addEventListener('click', () => {
    const last = store.history[0];
    restore(last ? last.tuning : DEFAULT_TUNING, last ? 'Back to your last save.' : 'Nothing saved yet, so back to the game\'s defaults.');
  });
  bar.querySelector('#reset')!.addEventListener('click', () => { if (confirm('Put every slider back to the original design values? Your saved history is kept.')) restore(FACTORY_TUNING, 'All settings are back to the original defaults. Publish if you want the game itself reset too.'); });
  bar.querySelector('#publish')!.addEventListener('click', async () => {
    try {
      const r = await fetch('./__dev/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(store.tuning) });
      if (!r.ok) throw new Error(String(r.status));
      say('Published. These are now the game\'s defaults (src/tuned.json). Reload the game on your phone to get them.');
    } catch { say('Could not publish. Is the dev server running?', 'bad'); }
  });
}

function restore(t: Tuning, msg: string) { store.tuning = { ...FACTORY_TUNING, ...t }; write(); buildTuning(); say(msg); }

// ---- right: the game, scenarios, formations, history ----
function buildStage() {
  stage.innerHTML = '';
  stage.append($(`<div><h2>Test match</h2><p class="lead">This is the real game. Click in it and play with the mouse: drag on the left half to run, pull back on the right half to pass.</p></div>`));
  frame = $<HTMLIFrameElement>(`<iframe title="Tiny Rugby Simulator" allow="fullscreen"></iframe>`);
  stage.append(frame);
  const top = $(`<div class="row" style="margin:12px 0 4px">
    <button class="primary" data-q="?screen=match">Start test match</button>
    <button data-q="">Whole game from the title</button>
    <button id="again">Restart this</button>
    <button id="pop">Open in its own tab</button></div>`);
  stage.append(top);
  top.querySelectorAll<HTMLButtonElement>('[data-q]').forEach(b => b.addEventListener('click', () => show(b.dataset.q!)));
  top.querySelector('#again')!.addEventListener('click', () => show(current));
  top.querySelector('#pop')!.addEventListener('click', () => window.open(`./index.html${current}`, '_blank'));

  stage.append($(`<h3>Test scenarios</h3>`));
  const grid = $(`<div class="grid"></div>`);
  for (const s of SCENARIOS) {
    const b = $<HTMLButtonElement>(`<button class="scen">${s.name}<small>${s.help}</small></button>`);
    b.addEventListener('click', () => show(`?scenario=${s.id}`));
    grid.append(b);
  }
  stage.append(grid);

  stage.append($(`<h3>Play designer</h3>`));
  const defs = store.formations.filter(f => f.side === 'defence');
  const plays = $(`<div class="card"><p class="lead" style="margin-bottom:10px">Attacking plays are drawn on the Training Ground, the same board players get. Defensive formations are for testing only: pick one and every test match and scenario starts with the defence standing that way.</p>
    <div class="row">
      <button data-q="?screen=plays">Open the Training Ground</button>
      <button id="newdef">New defensive formation</button>
      <select id="usedef" aria-label="Defensive formation in use"><option value="">Defence: the game's own line</option>${defs.map(f => `<option ${store.use.defence === f.name ? 'selected' : ''}>${f.name}</option>`).join('')}</select>
      <button id="editdef">Edit selected</button>
    </div></div>`);
  stage.append(plays);
  plays.querySelector<HTMLButtonElement>('[data-q]')!.addEventListener('click', e => show((e.currentTarget as HTMLButtonElement).dataset.q!));
  const sel = plays.querySelector<HTMLSelectElement>('#usedef')!;
  sel.addEventListener('change', () => { store.use.defence = sel.value || null; write(); say(sel.value ? `Tests now use the "${sel.value}" defence.` : 'Tests use the game\'s own defensive line.'); });
  plays.querySelector('#newdef')!.addEventListener('click', () => { const n = prompt('Name for the new defensive formation', `Defence ${defs.length + 1}`); if (n) show(`?screen=defence&name=${encodeURIComponent(n.slice(0, 14))}`); });
  plays.querySelector('#editdef')!.addEventListener('click', () => { if (sel.value) show(`?screen=defence&name=${encodeURIComponent(sel.value)}`); else say('Pick a saved defensive formation first, or make a new one.', 'bad'); });

  stage.append($(`<h3>Saved versions</h3>`));
  hist = $(`<div class="card"></div>`);
  stage.append(hist);
  buildHistory();
  show(current);
}

function buildHistory() {
  hist.innerHTML = '';
  if (!store.history.length) { hist.append($(`<p class="lead" style="margin:0">Nothing saved yet. Each time you press Save changes, a version is kept here so you can go back to it.</p>`)); return; }
  const ul = $(`<ul class="hist"></ul>`);
  store.history.forEach((h, i) => {
    const diff = TUNE_DEFS.filter(d => Math.abs((h.tuning[d.key] ?? d.def) - d.def) > 1e-9).map(d => `${d.label} ${fmt(h.tuning[d.key], d.step)}`);
    const li = $(`<li><span><b>${new Date(h.at).toLocaleString()}</b><br><span style="color:var(--dim)">${diff.length ? diff.slice(0, 4).join(', ') + (diff.length > 4 ? ` and ${diff.length - 4} more` : '') : 'All defaults'}</span></span><button>Restore</button></li>`);
    li.querySelector('button')!.addEventListener('click', () => restore(store.history[i].tuning, 'Restored that version. It is live in the test match now.'));
    ul.append(li);
  });
  hist.append(ul);
}

// the Training Ground and the defence editor inside the frame write to the same storage: stay in step
window.addEventListener('storage', e => { if (e.key === DEV_KEY) { store = loadDev(k => localStorage.getItem(k)); buildStage(); } });

buildTuning();
buildStage();
