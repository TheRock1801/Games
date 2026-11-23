import { Rng } from '../src/engine/rng';
import { newCareer } from '../src/career/career';
import { sideFromTeam } from '../src/match/side';
import { Match, WIND_PUSH } from '../src/match/match';
import { AttackPlay, MID } from '../src/match/attack';
import { clamp } from '../src/engine/rng';

// A stand-in for a human: skill 0 runs straight, skill 1 dodges, steps and passes into space.
export function botPlay(p: AttackPlay, rng: Rng, skill: number) {
  if (p.state === 'maul') { if (p.maulT > 1 + 2.5 * rng.next()) p.playMaul(); return; }
  if (p.penKick && p.koOnly) { p.release(0.55, p.att[p.carrier].y < 25 ? -1 : 1, 0.7); return; }
  if (p.koOnly) { p.release(1, rng.range(-0.5, 0.5), 0.3 + 0.4 * rng.next()); return; }
  p.run();
  p.drift = 0;
  if (p.ball.mode !== 'held') return;
  const c = p.att[p.carrier];
  if (skill <= 0) return;
  let nd = 1e9, ndy = 20;
  for (const d of p.def) {
    if (d.stun > 0 || d.st === 'miss' || d.x < c.x - 1) continue;
    const q = Math.hypot(d.x - c.x, d.y - c.y);
    if (q < nd) { nd = q; ndy = d.y; }
  }
  if (nd > 9) return;
  let best = -1, space = 0;
  p.att.forEach((m, i) => {
    if (i === p.carrier || m.down > 0 || m.x > c.x + 0.3) return;
    const s = Math.min(...p.def.filter(d => d.stun <= 0 && d.st !== 'miss').map(d => Math.hypot(d.x - m.x, d.y - m.y)));
    if (s > space) { space = s; best = i; }
  });
  let away = c.y > ndy ? 1 : -1;
  if (c.y < 3) away = 1;
  if (c.y > 37) away = -1;
  // A swipe "just before contact": the better the bot, the more often it lands in the window.
  if (nd < 5 && nd > 2.8) { if (rng.chance(0.3 * skill)) p.sidestep(away); return; }
  if (best >= 0 && nd > 5.5 && space > nd + 3 && rng.chance(0.12 * skill)) {
    // Aim where the man will be when the ball gets there, as a player leading his receiver would.
    const m = p.att[best], d0 = Math.hypot(m.x - c.x, m.y - c.y), lead = m.v * (0.08 + d0 / 17) * 0.8;
    const ax = m.x + lead - c.x, ay = m.y - c.y, d = Math.hypot(ax, ay);
    if (ax / d <= 0.3) { p.release(ax, ay, (d - 3) / 21); return; }
  }
  p.drift = away * 0.5 * skill;
}

export function playMatch(seed: number, skill: number, a = 'AKL', b = 'SYD') {
  const c = newCareer(seed, a);
  const m = new Match(sideFromTeam(c.teams[a]), sideFromTeam(c.teams[b]), new Rng(seed), false);
  const bot = new Rng(seed + 1);
  let frames = 0, plan = true;
  while (!m.done && frames++ < 400000) {
    switch (m.mode) {
      case 'banner': case 'oppsim': m.tap(); break;
      case 'play': botPlay(m.play!, bot, skill); break;
      case 'lineout': {
        // a careless bot throws anywhere; a careful one avoids the jumper they are marking
        const lo = m.lo!;
        if (lo.phase !== 'aim') break;
        const zones = [0, 1, 2].filter(z => !bot.chance(skill) || z !== lo.marked);
        m.throwLine([6, 10, 14][bot.pick(zones)] + (1 - skill) * bot.range(-2, 2), (1 - skill) * bot.range(-0.2, 0.2));
        break;
      }
      case 'ruck': {
        botPlay(m.play!, bot, skill);
        const t = m.timing;
        if (!t) break;
        if (t.t < 0.05) plan = bot.chance(0.6 + 0.3 * skill);
        if (!t.done && t.t > 0.2 && (plan ? t.pos > t.lo && t.pos < t.hi : true)) m.press();
        break;
      }
      case 'touchkick': if (m.tkick!.phase === 'aim') m.kickTouch(1, m.spot.y < MID ? -1.1 : 1.1, 0.5 + 0.3 * skill); break;
      case 'penalty': m.choose(m.options[0] ? 0 : bot.chance(0.5) ? 1 : 2); break;
      case 'goalkick': {
        // aims at the middle of the posts; the better the bot, the more of the wind it allows for
        const k = m.pk!;
        if (k.phase !== 'wait') break;
        const d = Math.hypot(100 - k.from.x, MID - k.from.y), range = d + 9, dur = 0.9 + range / 26, f = d / range;
        const off = dur * WIND_PUSH * f * f * skill; // how far the wind will have moved it by the posts
        m.startAim();
        m.kickGoal(100 - k.from.x - m.wind.x * off, MID - k.from.y - m.wind.y * off, clamp((range / (0.75 + m.us.kick / 400) - 16) / 42, 0, 1));
        break;
      }
    }
    m.update(1 / 30);
  }
  return { m, frames };
}
