// Desktop-only character workbench. The game itself never imports this module.
import { newCareer } from '../career/career';
import { SLOTS } from '../career/types';
import { TEAMS } from '../data/teams';
import type { DevStore } from '../config';

const ATTR = [
  ['sta', 'Stamina'], ['hnd', 'Handling'], ['pas', 'Passing'],
  ['kck', 'Kicking'], ['tkl', 'Tackling'],
] as const;
let teamId = 'NZL', slot = 0;

export function buildCharacters(getStore: () => DevStore, save: () => void, preview: (url: string) => void) {
  const root = document.getElementById('rosters')!;
  root.innerHTML = `<h2>Character studio</h2>
    <p class="lead">All 24 World Cup squads have real rugby-player name placeholders. Edit any club or country character here. Players stay fixed within World Cup matches; no buying, trading or signing.</p>
    <div class="roster-toolbar">
      <select id="char-team" aria-label="Select team"></select>
      <button id="char-preview" class="primary">Play this country</button>
      <button id="char-publish">Publish character changes</button>
      <button id="char-reset" class="warn">Reset selected player</button>
    </div>
    <div id="char-msg" class="lead" role="status"></div>
    <div class="character-layout"><div id="char-list" class="character-list"></div><div id="char-edit" class="roster-card"></div></div>
    <p class="roster-footnote">Real names are provisional and do not imply current selection or official affiliation. Ages, skill ratings and looks are fictional. Draft edits autosave in this browser. Publish writes src/data/roster-overrides.json, which is included in your next app build. Existing saved careers are unchanged, so start a new World Cup to see roster updates.</p>`;
  const select = root.querySelector<HTMLSelectElement>('#char-team')!;
  for (const kind of ['nation', 'club'] as const) {
    const group = document.createElement('optgroup'); group.label = kind === 'nation' ? 'WORLD CUP COUNTRIES' : 'CLUBS';
    for (const team of TEAMS.filter(t => t.kind === kind)) {
      const option = document.createElement('option'); option.value = team.id; option.textContent = team.name;
      group.append(option);
    }
    select.append(group);
  }
  select.value = teamId;
  select.addEventListener('change', () => { teamId = select.value; slot = 0; buildCharacters(getStore, save, preview); });

  const roster = newCareer(2026, 'AKL').teams[teamId].roster;
  const team = TEAMS.find(t => t.id === teamId)!;
  const list = root.querySelector<HTMLElement>('#char-list')!;
  roster.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = `roster-item${i === slot ? ' on' : ''}`;
    b.textContent = `${i + 1}. ${p.pos}  ${p.name}`;
    b.addEventListener('click', () => { slot = i; buildCharacters(getStore, save, preview); });
    list.append(b);
  });
  const p = roster[slot], edit = root.querySelector<HTMLElement>('#char-edit')!;
  const caption = document.createElement('h3'); caption.textContent = `${team.name} / ${slot + 1} ${SLOTS[slot]}`;
  edit.append(caption);
  const add = (label: string, field: string, value: string, type: string, min?: number, max?: number) => {
    const wrap = document.createElement('label'); wrap.className = 'character-field'; wrap.textContent = label;
    const inp = document.createElement('input'); inp.type = type; inp.value = value;
    if (min !== undefined) inp.min = String(min);
    if (max !== undefined) inp.max = String(max);
    if (type === 'text') inp.maxLength = 70;
    if (type === 'number' || type === 'range') inp.step = '1';
    wrap.append(inp); edit.append(wrap);
    return inp;
  };
  const update = (key: string, val: string | number | boolean) => {
    const patch = (getStore().rosters[teamId] ??= {})[String(slot)] ??= {};
    (patch as Record<string, unknown>)[key] = val;
    save();
    const msg = root.querySelector<HTMLElement>('#char-msg')!;
    msg.textContent = 'Changes saved in your browser. Press Play this country to preview.';
  };
  const name = add('Full name', 'name', p.name, 'text');
  name.addEventListener('input', () => { if (name.value.trim()) update('name', name.value); });
  for (const [field, label, min, max] of [['age', 'Age', 16, 50], ['skin', 'Skin tone (0-3)', 0, 3]] as const) {
    const input = add(label, field, String(p[field]), 'number', min, max);
    input.addEventListener('change', () => { const n = Math.max(min, Math.min(max, Math.round(Number(input.value) || min))); input.value = String(n); update(field, n); });
  }
  const star = document.createElement('label'); star.className = 'character-field'; star.textContent = 'Featured player';
  const featured = document.createElement('input'); featured.type = 'checkbox'; featured.checked = !!p.star;
  featured.addEventListener('change', () => update('star', featured.checked)); star.append(featured); edit.append(star);
  for (const [field, label] of ATTR) {
    const input = add(`${label}: ${p[field]}`, field, String(p[field]), 'range', 1, 99);
    input.addEventListener('input', () => { input.parentElement!.firstChild!.textContent = `${label}: ${input.value}`; update(field, Number(input.value)); });
  }
  root.querySelector('#char-preview')!.addEventListener('click', () => {
    if (team.kind !== 'nation') { root.querySelector<HTMLElement>('#char-msg')!.textContent = 'Select a World Cup country for the international match preview.'; return; }
    preview(`?screen=international&team=${encodeURIComponent(team.id)}`);
    root.querySelector<HTMLElement>('#char-msg')!.textContent = `Playing a test match with ${team.name}.`;
  });
  root.querySelector('#char-reset')!.addEventListener('click', () => {
    if (!confirm(`Discard your browser changes to ${p.name}? Published defaults remain.`)) return;
    delete getStore().rosters[teamId]?.[String(slot)]; save(); buildCharacters(getStore, save, preview);
  });
  root.querySelector('#char-publish')!.addEventListener('click', async () => {
    try {
      const r = await fetch('./__dev/publish-rosters', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(getStore().rosters) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      root.querySelector<HTMLElement>('#char-msg')!.textContent = 'Published to src/data/roster-overrides.json. New games and future app builds will use these characters.';
      preview(`?screen=international&team=${team.kind === 'nation' ? team.id : 'NZL'}`);
    } catch { root.querySelector<HTMLElement>('#char-msg')!.textContent = 'Publish failed. Make sure the local Vite dev server is running.'; }
  });
}
