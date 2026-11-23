import { Rng, clamp } from '../engine/rng';
import { FW } from './attack';

// The other team's possessions are simulated. x is metres from OUR try line; they attack towards 0.
export interface OppStart { x: number; kind: 'kickoff' | 'turnover' | 'kick' | 'penalty' | 'lineout' | 'scrum' }
export type Next =
  | { k: 'scrum' | 'lineout' | 'penalty' | 'open' | 'ruck'; x: number; y: number }
  | { k: 'kickoffThem' };
export interface OppResult { lines: string[]; track: number[]; pts: number; tries: number; clock: number; next: Next; card?: 'us' | 'them' }

export function where(x: number): string {
  return x < 5 ? 'YOUR LINE' : x < 22 ? 'YOUR 22' : x < 42 ? 'YOUR HALF' : x < 58 ? 'HALFWAY' : x < 78 ? 'THEIR HALF' : 'THEIR 22';
}

export function simOpp(st: OppStart, o: { name: string; att: number; def: number; kick: number; cardUs?: boolean; cardThem?: boolean }, rng: Rng): OppResult {
  const lines: string[] = [], track: number[] = [];
  let x = clamp(st.x, 1, 99), clock = 0, pts = 0, tries = 0, phases = 0;
  let adv = o.att - o.def; // their attack against our defence
  let card: 'us' | 'them' | undefined;
  const say = (s: string) => { lines.push(s); track.push(clamp(x, 0, 100)); };
  const out = (next: Next): OppResult => ({ lines, track, pts, tries, clock, next, card });
  const y = () => rng.range(6, FW - 6);
  const goalP = () => clamp(0.92 - x / 70 + (o.kick - 75) / 150, 0.15, 0.95);

  say(`${o.name} BALL - ${where(x)}`);
  if (st.kind === 'penalty') {
    clock += 50;
    if (x <= 42) {
      if (rng.chance(goalP())) { pts += 3; say('PENALTY GOAL. 3 POINTS'); return out({ k: 'kickoffThem' }); }
      x = 52; say('PENALTY KICK MISSED');
    } else { x -= 25; say(`THEY KICK TO TOUCH - ${where(x)}`); }
  }

  for (let step = 0; step < 12; step++) {
    if ((x > 68 && rng.chance(0.5)) || step >= 9) {
      const nx = clamp(x - rng.range(30, 48), 6, 62);
      clock += 25; x = nx;
      if (rng.chance(0.25)) { say('THEY KICK OUT. YOUR LINEOUT'); return out({ k: 'lineout', x: nx, y: rng.chance(0.5) ? 0 : FW }); }
      say('THEY KICK LONG. YOU FIELD IT'); return out({ k: 'open', x: nx, y: y() });
    }
    x -= Math.max(-4, rng.norm(7.2 + adv / 8, 6));
    clock += rng.range(22, 38); phases++;
    if (x <= 0) {
      x = 0; pts += 5; tries++;
      const conv = rng.chance(clamp(0.68 + (o.kick - 75) / 120, 0.3, 0.95));
      if (conv) pts += 2;
      say(`TRY TO ${o.name} AFTER ${phases} PHASES`);
      say(conv ? 'CONVERTED' : 'CONVERSION MISSED');
      clock += 80;
      return out({ k: 'kickoffThem' });
    }
    x = clamp(x, 1, 99);
    const r = rng.next(), pTO = clamp(0.12 - adv / 500 + (x < 22 ? 0.04 : 0), 0.07, 0.32);
    if (r < pTO) {
      const t = rng.next();
      if (t < 0.4) { say(`KNOCK ON! YOUR SCRUM - ${where(x)}`); return out({ k: 'scrum', x: Math.max(5, x), y: y() }); }
      if (t < 0.7) { say(`TURNOVER! YOU WIN THE RUCK - ${where(x)}`); return out({ k: 'ruck', x, y: y() }); }
      say(`PENALTY TO YOU - ${where(x)}`);
      if (o.cardThem && rng.chance(0.06)) { card = 'them'; say('YELLOW CARD! THEY ARE DOWN TO 14'); }
      return out({ k: 'penalty', x, y: y() });
    }
    if (r < pTO + 0.06) {
      clock += 40;
      if (o.cardUs && !card && rng.chance(x < 25 ? 0.28 : 0.05)) { card = 'us'; adv += 7; say('YELLOW CARD! YOU ARE DOWN TO 14'); }
      if (x <= 42 && rng.chance(0.7)) {
        if (rng.chance(goalP())) { pts += 3; say('YOU ARE PENALISED. THEY KICK 3'); return out({ k: 'kickoffThem' }); }
        x = 52; say('THEIR PENALTY KICK MISSES');
      } else { x = Math.max(4, x - 22); say(`PENALTY. THEY KICK TO ${where(x)}`); }
      continue;
    }
    if (x < 32 && rng.chance(0.03)) {
      clock += 20;
      if (rng.chance(0.5)) { pts += 3; say('DROP GOAL. 3 POINTS'); return out({ k: 'kickoffThem' }); }
      say('DROP GOAL MISSED. YOU RESTART'); x = 48; return out({ k: 'open', x: 48, y: y() });
    }
    if (phases % 3 === 0) say(`${phases} PHASES - ${where(x)}`);
  }
  say('THEY KICK IT AWAY');
  return out({ k: 'open', x: clamp(x - 30, 6, 60), y: y() });
}
