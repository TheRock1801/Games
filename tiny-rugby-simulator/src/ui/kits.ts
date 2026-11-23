// Home and away jerseys. A team's identity is its two colours; its jersey is those colours in one of a
// few simple designs (a chest band, hoops, or plain), fixed per team so it is always recognisably theirs.
// The away jersey turns the colours round. Kept as data so a fuller kit designer could replace it later.
import { colourDist, lum, type Kit } from './ui';

export const PATTERNS = ['Band', 'Hoops', 'Plain'];
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function kitOf(t: { id: string; c1: string; c2: string }, away = false): Kit {
  const pat = hash(t.id) % PATTERNS.length;
  if (!away) return { c1: t.c1, c2: t.c2, pat };
  // away: the second colour becomes the jersey; if the two are too alike, a clean white or charcoal one
  const main = colourDist(t.c1, t.c2) > 120 ? t.c2 : lum(t.c1) > 0.5 ? '#22252b' : '#f4f1de';
  return { c1: main, c2: t.c1, pat };
}

// The two jerseys for a match. We wear what we chose; they change if theirs would be too like ours.
export function matchKits(us: { id: string; c1: string; c2: string }, usAway: boolean, them: { id: string; c1: string; c2: string }): { us: Kit; them: Kit; changed: boolean } {
  const a = kitOf(us, usAway), home = kitOf(them, false), alt = kitOf(them, true);
  const clash = colourDist(a.c1, home.c1) < 110 && colourDist(a.c1, alt.c1) > colourDist(a.c1, home.c1);
  return { us: a, them: clash ? alt : home, changed: clash };
}
