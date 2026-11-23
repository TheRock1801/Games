import { it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { newCareer } from '../src/career/career';
import { sideFromTeam } from '../src/match/side';
import { AttackPlay } from '../src/match/attack';
import { botPlay } from './bot';

// Prints how far the first phase gets for each bot, to judge how hard the defence is. Not an assertion test.
it('phase gain report', () => {
  const c = newCareer(7, 'AKL');
  const us = sideFromTeam(c.teams.AKL), them = sideFromTeam(c.teams.SYD);
  for (const kind of ['ruck', 'open', 'scrum'] as const) {
    for (const skill of [0, 1]) {
      let gain = 0, tries = 0, lost = 0, time = 0; const why: Record<string, number> = {};
      const N = 400, x0 = kind === 'open' ? 25 : 40;
      for (let s = 1; s <= N; s++) {
        const rng = new Rng(s), bot = new Rng(s + 9);
        const p = new AttackPlay(us.runners, them.tacklers, { x: x0, y: 20, kind }, rng);
        let f = 0;
        while (p.state !== 'done' && p.ruckSeq === 0 && f++ < 4000) { botPlay(p, bot, skill); p.step(1 / 30); }
        const e = p.end;
        time += p.time;
        if (!e) gain += (p.ruck?.x ?? x0) - x0;
        else if (e.k === 'try') { tries++; gain += 100 - x0; }
        else { lost++; const w = e.k === 'turnover' ? e.why : e.k; why[w] = (why[w] ?? 0) + 1; }
      }
      console.log(`${kind} skill ${skill}: avg gain ${(gain / N).toFixed(1)}m, tries ${tries}/${N}, lost ${lost}/${N}, ${(time / N).toFixed(1)}s ${JSON.stringify(why)}`);
    }
  }
});
