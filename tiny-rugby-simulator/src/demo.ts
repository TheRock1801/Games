// Development aid only: open /?demo=NAME on the dev server to jump straight to a screen.
// Names: select, squad, player, matchcentre, table, fixtures, club, training, offseason, wcpick,
//        ready, play, step, tackle, ruckform, ruck, scrum, lineout, penalty, goalkick, oppsim, fulltime
import type { Game, Scene } from './engine/game';
import { finishRound, newCareer, proceed, startNextYear, userFixture } from './career/career';
import { sideFromTeam } from './match/side';
import { MID } from './match/attack';
import type { Mode } from './match/match';
import { ClubScene, CompetitionScene, FixturesScene, MatchCentreScene, OffseasonScene, TableScene, TeamSelectScene, WcPickScene } from './ui/menus';
import { PlayerScene, SquadScene } from './ui/squad';
import { TrainingScene } from './ui/training';
import { MarketPlayerScene, MarketScene } from './ui/market';
import { CareersScene, EarnScene, MyCareerScene, saveGame } from './ui/menus';
import { MatchScene } from './ui/matchscene';

export function demo(game: Game, name: string): boolean {
  const c = newCareer(2026, 'AKL');
  game.career = c;
  const hub = (): Scene => new MatchCentreScene(game);
  const simTo = (stage: string) => {
    let guard = 0;
    while (c.stage !== stage && guard++ < 2000) {
      if (c.stage === 'offseason') startNextYear(c); else if (userFixture(c)) finishRound(c); else proceed(c);
    }
  };
  switch (name) {
    case 'compete': game.go(new CompetitionScene(game)); return true;
    case 'lineouttop': { const sc2 = new MatchScene(game, sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), false, 5, () => {}, { title: 'Lineout', start: mm => mm.startLineout(55, 0), onExit: () => {} }); game.go(sc2); return true; }
    case 'goalkick': case 'goalaim': case 'goalfly': {
      // a conversion from out wide: waiting, being aimed with their man charging, and in the air
      const sc3 = new MatchScene(game, sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), false, 5, () => {});
      sc3.m.startGoalKick('conv', 79, MID + 9); sc3.snapCam(); game.go(sc3);
      if (name !== 'goalkick') { game.push({ t: 'down', id: 9, x: 250, y: 100 }); game.push({ t: 'move', id: 9, x: 214, y: 109 }); for (let i = 0; i < 28; i++) game.frame(1 / 30); }
      if (name === 'goalfly') { game.push({ t: 'up', id: 9, x: 214, y: 109 }); for (let i = 0; i < 26; i++) game.frame(1 / 30); }
      return true;
    }
    case 'lochoice': {
      c.plays = [null, { name: 'Play 2', side: 'attack', from: 'lineout', spots: [{ x: -9, y: 1 }, { x: -4, y: 5 }, { x: -6, y: 10 }, { x: -8, y: 15 }, { x: -10, y: 21 }], passes: [{ t: 0.3, to: 1 }] }, null, null, null];
      const sc4 = new MatchScene(game, sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), false, 5, () => {});
      sc4.m.startLineout(55, 0); sc4.snapCam(); game.go(sc4); return true;
    }
    case 'select': game.go(new TeamSelectScene(game, 'urc')); return true;
    case 'nations': game.go(new TeamSelectScene(game, 'world')); return true;
    case 'cup': { const k = newCareer(2027, 'FIJ', 'cup'); game.career = k; for (let i = 0; i < 4; i++) { if (userFixture(k)) finishRound(k); else proceed(k); } game.go(new TableScene(game)); return true; }
    case 'hub': case 'matchcentre': finishRound(c); finishRound(c); while (!userFixture(c)) proceed(c); c.lastEarn = null; game.go(hub()); return true;
    case 'squad': c.teams.AKL.roster[3].inj = 2; c.teams.AKL.roster[6].cond = 55; game.go(new SquadScene(game)); return true;
    case 'player': c.credits = 4; game.go(new PlayerScene(game, 'AKL', 6)); return true;
    case 'table': for (let i = 0; i < 5; i++) finishRound(c); game.go(new TableScene(game)); return true;
    case 'fixtures': for (let i = 0; i < 5; i++) finishRound(c); game.go(new FixturesScene(game)); return true;
    case 'market': c.credits = 32; game.go(new MarketScene(game)); return true;
    case 'marketplayer': c.credits = 32; game.go(new MarketPlayerScene(game, [...c.market].sort((a, b) => b.pot - a.pot)[0])); return true;
    case 'mycareer': for (let i = 0; i < 5; i++) finishRound(c); c.lastEarn = null; game.go(new MyCareerScene(game)); return true;
    case 'careers': { saveGame(game); const k2 = newCareer(2027, 'NZL', 'cup'); game.career = k2; saveGame(game); game.career = c; game.go(new CareersScene(game)); return true; }
    case 'earn': finishRound(c, { us: 24, them: 10, ust: 3, themt: 1 }); game.go(new EarnScene(game, hub)); return true;
    case 'standings': for (let i = 0; i < 5; i++) finishRound(c); game.go(new FixturesScene(game, 2)); return true;
    case 'club': c.credits = 9; game.go(new ClubScene(game)); return true;
    case 'training': game.go(new TrainingScene(game, () => new ClubScene(game))); return true;
    case 'trainingsel': { game.go(new TrainingScene(game, () => new ClubScene(game))); game.frame(1 / 30); game.push({ t: 'down', id: 5, x: 91, y: 97 }); game.push({ t: 'up', id: 5, x: 91, y: 97 }); game.frame(1 / 30); return true; }
    case 'trainingturn': {
      game.go(new TrainingScene(game, () => new ClubScene(game))); game.frame(1 / 30);
      game.push({ t: 'down', id: 5, x: 62, y: 166 }); game.push({ t: 'up', id: 5, x: 62, y: 166 }); game.frame(1 / 30);
      game.push({ t: 'down', id: 5, x: 135, y: 82 }); game.push({ t: 'up', id: 5, x: 135, y: 82 }); game.frame(1 / 30);
      game.push({ t: 'down', id: 5, x: 120, y: 60 }); game.push({ t: 'move', id: 5, x: 170, y: 84 }); game.push({ t: 'up', id: 5, x: 170, y: 84 }); game.frame(1 / 30);
      return true;
    }
    case 'traininglo': { game.go(new TrainingScene(game, () => new ClubScene(game))); game.push({ t: 'down', id: 5, x: 297, y: 77 }); game.push({ t: 'up', id: 5, x: 297, y: 77 }); game.frame(1 / 30); game.frame(1 / 30); return true; }
    case 'trainingtime': { game.go(new TrainingScene(game, () => new ClubScene(game))); game.push({ t: 'down', id: 5, x: 62, y: 166 }); game.push({ t: 'up', id: 5, x: 62, y: 166 }); game.frame(1 / 30); return true; }
    case 'offseason': simTo('offseason'); game.go(new OffseasonScene(game)); return true;
    case 'wcpick': simTo('wcpick'); game.go(new WcPickScene(game)); return true;
  }
  // ready = the halfback at the base of a ruck that formed in play. play = a pass in flight.
  // step = a sidestep beating a tackler. tackle = a tackle half made. ruckform = bodies arriving.
  // kick = a kicked ball on its first bounce. runs = the line on the move while the ball is still at the ruck.
  const inPlay = ['kickoff', 'touchkick', 'maul', 'ready', 'play', 'step', 'tackle', 'tackle1', 'tackle3', 'ruckform', 'kick', 'runs'].includes(name);
  const target = (inPlay ? 'play' : name) as Mode;
  const scene = new MatchScene(game, sideFromTeam(c.teams.AKL), sideFromTeam(c.teams.SYD), false, 11, () => game.go(hub()));
  const m = scene.m;
  let live = 0, stepped = 0;
  for (let i = 0; i < 300000; i++) {
    if (m.mode === target && !inPlay && (target !== 'ruck' || m.timing)) break;
    if (m.mode === 'play') {
      const p = m.play!;
      if (p.state === 'maul') { if (name === 'maul' && p.maulT > 1.2) break; if (name !== 'maul') p.playMaul(); }
      if (p.penKick && p.koOnly) { if (name === 'touchkick') break; p.release(0.55, -1, 0.7); }
      else if (p.koOnly) { if (name === 'kickoff') break; p.release(1, 0.2, 0.6); }
      if (name === 'ready' && p.phase > 1 && p.state === 'ready') { for (let k = 0; k < 40; k++) m.update(1 / 30); break; }
      if (name === 'runs' && p.phase > 1 && p.state === 'ready') { for (let k = 0; k < 40; k++) m.update(1 / 30); p.startRuns(); for (let k = 0; k < 22; k++) m.update(1 / 30); break; }
      if (name === 'kick' && p.phase > 1 && p.state === 'ready') { for (let k = 0; k < 30; k++) m.update(1 / 30); p.startRuns(); for (let k = 0; k < 12; k++) m.update(1 / 30); p.release(1, 0.3, 0.5); for (let k = 0; k < 400 && p.ball.mode === 'kick'; k++) m.update(1 / 30); for (let k = 0; k < 4; k++) m.update(1 / 30); break; }
      if (name.startsWith('tackle') && p.tk && p.state === 'tackle' && p.tk.t > p.tk.dur * (name === 'tackle1' ? 0.12 : name === 'tackle3' ? 0.85 : 0.45)) break;
      if (name === 'ruckform' && p.state === 'ruck' && p.ruckOk !== 'wait') { for (let k = 0; k < 12; k++) m.update(1 / 30); break; }
      if (p.phase > 1 && p.state === 'live' && (name === 'play' || name === 'step')) {
        live++;
        if (name === 'play') { if (live === 2) p.release(-0.25, 1, 0.45); if (live > 9) break; }
        if (name === 'step') {
          const cr = p.att[p.carrier];
          if (!stepped && p.def.some(d => d.x > cr.x && Math.hypot(d.x - cr.x, d.y - cr.y) < 4.6)) { p.sidestep(1); stepped = live; }
          if (stepped && live > stepped + 7) break;
        }
      }
      p.go();
    } else if (m.mode === 'banner' || m.mode === 'oppsim') m.tap();
    else if (m.mode === 'ruck') { const t = m.timing; if (t && t.pos > t.lo && t.pos < t.hi) m.press(); }
    else if (m.mode === 'lineout') m.throwLine(10, 0);
    else if (m.mode === 'touchkick') m.kickTouch(1, m.spot.y < MID ? -1.1 : 1.1, 0.7);
    else if (m.mode === 'penalty') m.choose(name === 'lineout' || name === 'touchkick' || name === 'maul' ? 1 : m.options[0] ? 0 : 2);
    else if (m.mode === 'goalkick' && m.pk?.phase === 'wait') { const k = m.pk; m.startAim(); m.kickGoal(106 - k.from.x, MID - k.from.y, 0.6); }
    m.update(1 / 30);
  }
  if (target === 'oppsim') m.simT = 1.7;
  scene.snapCam();
  game.go(scene);
  return true;
}
