// Practice situations for the developer portal. Each one drops the real match engine into a set-up
// and lets it run: same players, same AI, same physics. When the passage ends it starts again.
import type { Match } from './match/match';
import { MID, type AttackPlay } from './match/attack';

export interface Scenario { id: string; name: string; help: string; start(m: Match): void }

// Takes every defender off the pitch except the ones listed.
const park = (p: AttackPlay, keep: number[]) => p.def.forEach((d, i) => { if (!keep.includes(i)) { d.stun = 1e9; d.x = 999; } });
const ball = (p: AttackPlay) => p.att[p.carrier];

export const SCENARIOS: Scenario[] = [
  { id: 'ruck5', name: 'Ruck five metres out', help: 'The halfback at the base of a ruck, five metres from their line.', start: m => m.startPlay({ x: 95, y: MID, kind: 'ruck' }) },
  { id: 'twoOnOne', name: 'Two on one', help: 'An attacking break with one defender left to beat and support alongside.', start: m => {
    m.startPlay({ x: 50, y: MID, kind: 'open' });
    const p = m.play!, d = p.def[3];
    park(p, [3]); d.x = ball(p).x + 14; d.y = MID; d.sweeper = true;
  } },
  { id: 'breakaway', name: 'Full-field breakaway', help: 'Through the line near your own posts with the whole defence chasing.', start: m => {
    m.startPlay({ x: 12, y: MID, kind: 'open' });
    const p = m.play!;
    p.def.forEach((d, i) => { if (d.stun < 1e8) { d.x = ball(p).x - 1 - (i % 3) * 1.5; d.y = 5 + i * 4.8; d.sweeper = false; } });
  } },
  { id: 'lineout', name: 'Five-player lineout', help: 'Your throw on halfway. Aim it, then play from the catch.', start: m => m.startLineout(55, 0) },
  { id: 'scrum', name: 'Scrum', help: 'Your feed in midfield. A good place to call a set play.', start: m => { m.spot = { x: 45, y: MID }; m.startScrum(); } },
  { id: 'boxkick', name: 'Box kick and chase', help: 'A ruck in your own half: aim upfield to box kick and see who wins the chase.', start: m => m.startPlay({ x: 30, y: MID - 7, kind: 'ruck' }) },
  { id: 'scramble', name: 'Defensive scramble', help: 'Broken play with defenders scattered all over the field.', start: m => {
    m.startPlay({ x: 45, y: MID, kind: 'open' });
    const p = m.play!;
    p.def.forEach(d => { if (d.stun < 1e8) { d.x = ball(p).x + m.rng.range(-3, 18); d.y = m.rng.range(3, MID * 2 - 3); } });
  } },
  { id: 'tackle', name: 'Open-field tackle', help: 'One defender, dead ahead. Step him, bump him or get tackled.', start: m => {
    m.startPlay({ x: 40, y: MID, kind: 'open' });
    const p = m.play!, d = p.def[2];
    park(p, [2]); d.x = ball(p).x + 10; d.y = MID;
  } },
  { id: 'knockon', name: 'Knock-on and restart', help: 'A dropped ball, shown as it happens, and the restart that follows.', start: m => { m.startPlay({ x: 40, y: MID, kind: 'scrum' }); m.play!.forceKnockOn(); } },
];
