import type { Player } from '../career/types';
import { ovr } from '../career/players';
import publishedOverrides from './roster-overrides.json';
import { INTERNATIONAL_NAMES } from './international-names';

// A team's twelve fixed squad slots; development patches are separate from gameplay transfers.
export type RosterPatch = Partial<Pick<Player, 'name' | 'age' | 'sta' | 'hnd' | 'pas' | 'kck' | 'tkl' | 'skin' | 'star'>>;
export type RosterOverrides = Record<string, Record<string, RosterPatch>>;
let draftOverrides: RosterOverrides = {};

// The desktop development portal stores drafts in the browser. Published edits are source files.
export function setDevelopmentRosters(next: RosterOverrides) {
  draftOverrides = next && typeof next === 'object' ? next : {};
}

export function populateRoster(teamId: string, roster: Player[]): void {
  const names = INTERNATIONAL_NAMES[teamId];
  const published = (publishedOverrides as RosterOverrides)[teamId] ?? {};
  const draft = import.meta.env?.DEV ? draftOverrides[teamId] ?? {} : {};
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    if (names?.[i]) p.name = names[i];
    for (const patch of [published[String(i)], draft[String(i)]]) {
      if (!patch || typeof patch !== 'object') continue;
      if (typeof patch.name === 'string' && patch.name.trim() && patch.name.length <= 70) p.name = patch.name.trim();
      if (typeof patch.star === 'boolean') p.star = patch.star;
      for (const key of ['age', 'sta', 'hnd', 'pas', 'kck', 'tkl', 'skin'] as const) {
        const n = patch[key];
        const lo = key === 'age' ? 16 : key === 'skin' ? 0 : 1;
        const hi = key === 'age' ? 50 : key === 'skin' ? 3 : 99;
        if (typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi) p[key] = n;
      }
    }
    p.pot = Math.max(p.pot, ovr(p));
  }
}
