// Development only. Opens the game straight into what the developer portal asked for:
//   ?scenario=<id>   a practice situation from src/scenarios.ts
//   ?screen=match    a full test match
//   ?screen=plays    the Training Ground
//   ?screen=defence  the same board, editing the defensive formation the portal has selected
import type { Game } from '../engine/game';
import { DEV_KEY, loadDev, useDev, type Formation } from '../config';
import { newCareer } from '../career/career';
import { NATION_IDS } from '../data/teams';
import { sideFromTeam } from '../match/side';
import { SCENARIOS } from '../scenarios';
import { MatchScene } from '../ui/matchscene';
import { TitleScene } from '../ui/menus';
import { TrainingScene } from '../ui/training';

const DEFAULT_DEFENCE: Formation = {
  name: 'Defence', side: 'defence',
  // ten defenders in team-sheet order; the second from the end is the sweeper, who stands deep
  spots: [{ x: 11, y: -19.2 }, { x: 11, y: -14.4 }, { x: 11, y: -9.6 }, { x: 11, y: -4.8 }, { x: 11, y: 0 }, { x: 11, y: 4.8 }, { x: 11, y: 9.6 }, { x: 11, y: 14.4 }, { x: 25, y: 0 }, { x: 11, y: 19.2 }],
};

export function launch(game: Game, q: URLSearchParams) {
  const c = newCareer(2026, 'AKL');
  const us = sideFromTeam(c.teams.AKL), them = sideFromTeam(c.teams[q.get('opp') && c.teams[q.get('opp')!] ? q.get('opp')! : 'SYD']);
  const seed = (Date.now() & 0xffff) + 3;
  const home = () => game.go(new TitleScene(game));
  const sc = SCENARIOS.find(s => s.id === q.get('scenario'));
  if (sc) { game.go(new MatchScene(game, us, them, false, seed, home, { title: sc.name, start: m => sc.start(m), onExit: home })); return; }
  const screen = q.get('screen');
  if (screen === 'international') {
    const id = q.get('team') ?? 'NZL';
    const country = NATION_IDS.includes(id) ? id : 'NZL';
    const wc = newCareer(2026, country, 'cup');
    const rival = country === 'RSA' ? 'NZL' : 'RSA';
    game.go(new MatchScene(game, sideFromTeam(wc.teams[country]), sideFromTeam(wc.teams[rival]), false, seed, home));
  }
  else if (screen === 'match') game.go(new MatchScene(game, us, them, false, seed, home));
  else if (screen === 'plays') game.go(new TrainingScene(game, () => new TitleScene(game)));
  else if (screen === 'defence') {
    const d = loadDev(k => game.store.get(k));
    const cur = d.formations.find(f => f.side === 'defence' && f.name === (q.get('name') ?? d.use.defence)) ?? { ...DEFAULT_DEFENCE, name: q.get('name') ?? 'Defence 1' };
    game.go(new TrainingScene(game, () => new TitleScene(game), {
      side: 'defence', edit: cur, title: 'Defensive formation',
      onSave: f => {
        const now = loadDev(k => game.store.get(k));
        now.formations = [...now.formations.filter(x => !(x.side === 'defence' && x.name === f.name)), { ...f, side: 'defence' }];
        now.use.defence = f.name;
        game.store.set(DEV_KEY, JSON.stringify(now));
        useDev(now);
      },
    }));
  }
}
