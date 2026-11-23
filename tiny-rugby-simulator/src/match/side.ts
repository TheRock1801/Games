import type { Team } from '../career/types';
import { fit, paceFor, shortName, teamRatings } from '../career/players';
import type { Side } from './match';

// The ten who take the field in open play, as roster slots in pitch order from the top touchline:
// WG CE FH FL N8 HB LK CE FB WG. The prop and hooker do their work in the scrum and lineout.
// The fullback is second from the end: the defence uses that man as its sweeper.
const ORDER = [9, 7, 6, 3, 4, 5, 2, 8, 11, 10];

// ease (0..1) softens a side as an opponent: slower, weaker tacklers and a blunter attack. A new coach
// meets easy opposition, and it tightens up over the first few seasons.
export function sideFromTeam(t: Team, reputation = 60, ease = 0): Side {
  const mod = (reputation - 60) / 1000;
  const r = teamRatings(t, mod);
  const men = ORDER.map(i => t.roster[i]);
  return {
    id: t.id, name: t.name, c1: t.c1, c2: t.c2, ease,
    runners: men.map(p => {
      const f = fit(p) * (1 + mod);
      return { id: p.id, risk: p.cond < 60 ? 2.5 : p.cond < 80 ? 1.5 : 1, name: shortName(p), num: 0, pos: p.pos, spd: paceFor(p) * f, str: (p.tkl * 0.9 + p.sta * 0.1) * f, hnd: p.hnd * f, pas: p.pas * f, kck: p.kck * f, sta: p.sta, skin: p.skin, star: !!p.star };
    }),
    tacklers: men.map(p => ({ spd: paceFor(p) * fit(p) * (1 - 0.08 * ease), tkl: p.tkl * fit(p) * (1 - 0.14 * ease), sta: p.sta, skin: p.skin })),
    pack: r.pack - 5 * ease, att: r.att - 12 * ease, def: r.def - 6 * ease, kick: r.kick,
  };
}
