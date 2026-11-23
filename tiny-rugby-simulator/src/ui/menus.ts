import { Gfx, W, H } from '../engine/gfx';
import type { Game, Scene } from '../engine/game';
import { isMuted, setMuted } from '../engine/audio';
import { CLUB_IDS, COMP_NAMES, NATION_IDS, TEAMS, URC_IDS, WC_POOLS } from '../data/teams';
import type { Career, Comp, Team } from '../career/types';
import { MAX_CAREERS, careerCards, careerIds, compTitle, deleteCareer, loadCareer, position, saveCareer, seasonNo, type CareerCard } from '../career/saves';
import { kitOf, matchKits } from './kits';
import { genPlayer, ovr, salaryFor, stars, teamRatings } from '../career/players';
import { Rng } from '../engine/rng';
import { MarketScene } from './market';
import { leagueRounds, standings } from '../career/competition';
import {
  FAC_COST, activeComp, easeOf, activeTeamId, finishRound, isWcYear, newCareer, ordinal, pickWc, proceed,
  startNextYear, upgrade, userFixture,
} from '../career/career';
import { sideFromTeam } from '../match/side';
import { C, PITCH, button, drawMatchBall, drawPlayer, inRect, tc, topBar, type Kit, type Rect } from './ui';
import { MatchScene } from './matchscene';
import { SquadScene } from './squad';
import { TrainingScene } from './training';

// Every career has its own save slot; saving one never touches another.
export function saveGame(game: Game) { if (game.career) saveCareer(game.store, game.career); }

const STAGES: Record<string, string> = { R16: 'Last 16', QF: 'Quarter-final', SF: 'Semi-final', FINAL: 'Final' };
export const stageName = (s: string) => STAGES[s] ?? tc(s);

// Squads are 12, with two centres. For a while they were 10 without them: a save from then gets two
// centres added to every squad on load, so nothing else about it changes.
function migrate(c: Career) {
  const rng = new Rng((c.nextId * 2654435761) >>> 0);
  for (const t of Object.values(c.teams)) {
    const have = t.roster.filter(p => p.pos === 'CE').length;
    for (let n = have; n < 2; n++) {
      const p = genPlayer(rng, 'CE', t.base - (t.id === c.teamId && t.kind === 'club' ? 9 : 4), t.names, c.nextId++);
      if (t.kind === 'club') p.salary = Math.round(salaryFor(ovr(p)) * 0.9);
      t.roster.splice(Math.min(7 + n, t.roster.length), 0, p);
    }
  }
}

// Loads a saved career: the one asked for, or the most recent.
export function loadGame(game: Game, id?: string | boolean): boolean {
  const ids = careerIds(game.store);
  const c = loadCareer(game.store, typeof id === 'string' ? id : ids[ids.length - 1] ?? '');
  if (!c) return false;
  migrate(c);
  game.career = c;
  return true;
}

// Picks the screen that matches where the career is up to. My Career is home.
export function route(game: Game): Scene {
  const c = game.career!;
  if (c.stage === 'offseason') return new OffseasonScene(game);
  if (c.stage === 'wcpick') return new WcPickScene(game);
  return new MyCareerScene(game);
}

// After a round: the credits it paid, shown once, and then on to wherever the career goes next.
function afterRound(game: Game): Scene {
  const c = game.career!, next = () => (c.stage === 'season' || c.stage === 'worldcup' ? new MatchCentreScene(game) : route(game));
  return c.lastEarn ? new EarnScene(game, next) : next();
}

// Rating shown as five pips rather than a row of asterisks.
export function pips(g: Gfx, x: number, y: number, n: number, right = false) {
  for (let i = 0; i < 5; i++) g.card(right ? x - (5 - i) * 7 : x + i * 7, y, 5, 5, i < n ? C.gold : C.panel2);
}

function kitBadge(g: Gfx, x: number, y: number, t: { c1: string; c2: string; pat?: number; id?: string }, w = 10, h = 14) {
  const pat = t.pat ?? (t.id ? kitOf(t as { id: string; c1: string; c2: string }).pat : 0);
  g.card(x, y, w, h, t.c1);
  if (pat === 1) for (let yy = 2; yy < h - 1; yy += 4) g.rect(x, y + yy, w, 2, t.c2);
  else if (pat === 2) g.rect(x + Math.round(w * 0.3), y, Math.ceil(w * 0.4), 2, t.c2);
  else g.rect(x, y + Math.round(h * 0.42), w, Math.max(2, Math.round(h * 0.2)), t.c2);
}

// ---- the career frame: one header and one row of tabs on every career screen ----
export const TABS = ['My Career', 'Squad', 'Match Centre', 'Fixtures & Results', 'Open Market'] as const;
export const CONTENT_Y = 38;
const tabScene = (game: Game, i: number): Scene =>
  i === 0 ? new MyCareerScene(game) : i === 1 ? new SquadScene(game) : i === 2 ? new MatchCentreScene(game) : i === 3 ? new FixturesScene(game) : new MarketScene(game);

// Draws the frame. Returns true if a tab was tapped and the screen has changed.
export function chrome(game: Game, g: Gfx, active: number): boolean {
  const c = game.career!, team = c.teams[activeTeamId(c) || c.teamId];
  g.rect(g.left, 0, g.vw, H, C.bg);
  g.rect(g.left, 0, g.vw, 19, C.dark);
  kitBadge(g, 6, 3, team, 9, 13);
  g.label(tc(team.name), 20, 3.5, 11, C.ink, { display: true });
  g.label(`Credits: ${c.credits}`, W - 8, 5, 8.5, C.gold, { align: 2, bold: true });
  const tw = W / TABS.length;
  g.rect(g.left, 19, g.vw, 15, C.panel);
  for (let i = 0; i < TABS.length; i++) {
    const r: Rect = [i * tw, 19, tw, 15], on = i === active;
    if (on) { g.rect(r[0] + 2, 19, tw - 4, 15, C.bg); g.rect(r[0] + 2, 19, tw - 4, 2, C.gold); }
    g.label(TABS[i], r[0] + tw / 2, 22.8, 6.3, on ? C.gold : C.dim, { align: 1, bold: on });
    if (!on && game.tap && inRect(game.tap, r)) { game.tap = null; game.go(tabScene(game, i)); return true; }
  }
  return false;
}

export class TitleScene implements Scene {
  private t = 0; private count: number;
  constructor(private game: Game) { this.count = careerIds(game.store).length; }
  update(dt: number) { this.t += dt; }
  draw(g: Gfx) {
    const game = this.game, t = this.t;
    g.rect(g.left, 0, g.vw, H, C.bg);
    // A floodlit strip of pitch with a move running along it. The ball goes from the top runner back to
    // the bottom one and back again, always backwards: the man in support hangs deep, then accelerates
    // onto the pass, and the man who has just passed eases off to do the same on the other side.
    for (let i = -2; i < 10; i++) g.rect(i * 40, 84, 40, 44, i % 2 ? PITCH.b : PITCH.a);
    g.rect(g.left, 84, g.vw, 1, C.ink, 0.9); g.rect(g.left, 127, g.vw, 1, C.ink, 0.9);
    for (let i = -2; i < 12; i++) g.rect(i * 40 + 20, 84, 1, 44, C.ink, 0.3);
    const V = 34, HALF = 1.5, FLY = 0.38, DEPTH = 26, CATCH = 16;
    const span = g.vw + 180, x = g.left - 90 + ((t * V + 170) % span);
    const k = Math.floor(t / HALF), tau = t - k * HALF, tp = HALF - FLY;
    const ease = (a: number) => { a = Math.max(0, Math.min(1, a)); return a * a * (3 - 2 * a); };
    const carr = -CATCH * (1 - ease(tau / (HALF * 0.3)));
    const sup = tau < HALF * 0.55 ? -DEPTH * ease(tau / (HALF * 0.55)) : -DEPTH + (DEPTH - CATCH) * ease((tau - HALF * 0.55) / (HALF * 0.45));
    const upper = k % 2 === 0, yU = 100, yL = 119, kit = { c1: C.gold, c2: C.dark };
    const xU = x + (upper ? carr : sup), xL = x + (upper ? sup : carr);
    const passing = tau >= tp && tau < tp + 0.22;
    drawPlayer(g, x - 80, 110, { c1: C.red, c2: C.ink }, 2, 'run', t * 9 + 1, 1);       // the chaser, never quite there
    drawPlayer(g, x - 46, 93, kit, 0, 'run', t * 9 + 3, 1);                              // wider support, both sides
    drawPlayer(g, xU, yU, kit, 1, upper && passing ? 'pass' : 'run', t * (upper ? 9 : 8 + 3 * ease(tau / HALF)), 1);
    drawPlayer(g, xL, yL, kit, 3, !upper && passing ? 'pass' : 'run', t * (upper ? 8 + 3 * ease(tau / HALF) : 9) + 2, 1);
    drawPlayer(g, x - 52, 126, kit, 2, 'run', t * 9 + 1, 1);
    const cy = upper ? yU : yL, sy = upper ? yL : yU;
    if (tau < tp) drawMatchBall(g, x + carr + 4, cy - 7);
    else {
      // released where the carrier was, caught behind that point: it never travels forward
      const fl = (tau - tp) / FLY, from = x - V * (tau - tp), to = x + V * (HALF - tau) - CATCH;
      drawMatchBall(g, from + (to - from) * fl + 4, cy + (sy - cy) * fl - 7 - Math.sin(fl * Math.PI) * 4);
    }
    // TRS wordmark: tiny on the top-left, blocky yellow RUGBY, simulator bottom-right.
    // Calculate edges from measured text so it stays aligned across fonts and phone sizes.
    const word = 'RUGBY', font = 65, width = g.tw(word, font, { display: true });
    const left = Math.max(12, W / 2 - width / 2), right = Math.min(W - 12, W / 2 + width / 2);
    g.label('tiny', left, 5, 13, '#FFFFFF', { bold: true });
    for (const dx of [-1.1, 0, 1.1]) g.label(word, W / 2 + dx + 2, 16, font, C.dark, { align: 1, display: true });
    for (const dx of [-1.1, 0, 1.1]) g.label(word, W / 2 + dx, 14, font, C.gold, { align: 1, display: true });
    g.label('simulator', right, 72, 12, '#FFFFFF', { align: 2, bold: true });
    if (this.count) {
      if (button(game, g, W / 2 - 138, 136, 134, 30, 'CONTINUE CAREER', { primary: true, size: 11 })) { game.go(new CareersScene(game)); return; }
      if (button(game, g, W / 2 + 4, 136, 134, 30, 'NEW CAREER', { size: 11 })) { game.go(this.count >= MAX_CAREERS ? new CareersScene(game, true) : new CompetitionScene(game)); return; }
    } else if (button(game, g, W / 2 - 80, 136, 160, 30, 'NEW CAREER', { primary: true, size: 12 })) { game.go(new CompetitionScene(game)); return; }
    if (button(game, g, W - 60, 168, 54, 10, isMuted() ? 'Sound off' : 'Sound on', { size: 6 })) setMuted(!isMuted());
  }
}

// Every saved career, as a card. Tap one to carry on with it. Deleting is a separate, deliberate thing.
export class CareersScene implements Scene {
  private cards: CareerCard[]; private del = '';
  constructor(private game: Game, private full = false) { this.cards = careerCards(game.store); }
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    g.rect(g.left, 0, g.vw, H, C.bg);
    topBar(g, 'Your careers', this.full ? 'Six is the limit: delete one to start another' : '');
    if (button(game, g, W - 52, 3, 46, 13, 'Back', { size: 7 })) { game.go(new TitleScene(game)); return; }
    if (!this.cards.length) g.label('No careers yet', W / 2, 80, 10, C.dim, { align: 1 });
    this.cards.slice(0, MAX_CAREERS).forEach((cd, i) => {
      const x = 8 + (i % 2) * 154, y = 24 + Math.floor(i / 2) * 46, r: Rect = [x, y, 150, 42], asking = this.del === cd.id;
      const hot = !asking && game.ptr.down && inRect(game.ptr, r);
      g.card(x, y, 150, 42, hot ? C.panel2 : C.panel); g.rect(x + 1, y, 148, 2, cd.c1);
      if (asking) {
        g.label(`Delete ${tc(cd.team)}?`, x + 75, y + 6, 9, C.ink, { align: 1, bold: true });
        g.label('It cannot be brought back', x + 75, y + 17, 6, C.dim, { align: 1 });
        if (button(game, g, x + 8, y + 26, 62, 13, 'Delete it', { col: C.red, size: 7 })) { deleteCareer(game.store, cd.id); this.cards = careerCards(game.store); this.del = ''; this.full = false; return; }
        if (button(game, g, x + 80, y + 26, 62, 13, 'Keep it', { primary: true, size: 7 })) this.del = '';
        return;
      }
      kitBadge(g, x + 6, y + 8, { ...cd, id: cd.team }, 14, 22);
      g.label(tc(cd.team).toUpperCase(), x + 26, y + 5, 10, C.ink, { display: true });
      g.label(cd.comp, x + 26, y + 17, 6.5, C.dim);
      g.label(cd.line, x + 26, y + 25.5, 6.5, C.gold, { bold: true });
      g.label(cd.record, x + 26, y + 33.5, 5.5, C.dim);
      // off to one side and small: deleting should never be a slip of the thumb
      if (button(game, g, x + 112, y + 28, 34, 11, 'Delete', { size: 5.5 })) { this.del = cd.id; return; }
      if (game.tap && inRect(game.tap, r)) { game.tap = null; if (loadGame(game, cd.id)) { saveGame(game); game.go(route(game)); } }
    });
    if (this.cards.length < MAX_CAREERS && button(game, g, W / 2 - 60, 162, 120, 15, 'NEW CAREER', { size: 8 })) game.go(new CompetitionScene(game));
  }
}

// What a match paid. Shown once, after playing or simulating it.
export class EarnScene implements Scene {
  constructor(private game: Game, private next: () => Scene) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game, c = game.career!, e = c.lastEarn;
    g.rect(g.left, 0, g.vw, H, C.bg);
    if (!e) { game.go(this.next()); return; }
    g.card(W / 2 - 110, 14, 220, 152, C.panel); g.rect(W / 2 - 109, 14, 218, 3, C.gold);
    g.label('MATCH COMPLETE', W / 2, 22, 16, C.gold, { align: 1, display: true });
    g.label(`${e.us > e.them ? 'Won' : e.us === e.them ? 'Drew' : 'Lost'} ${e.us} - ${e.them} against ${tc(e.opp)}${e.played ? '' : ' (simulated)'}`, W / 2, 43, 8, C.ink, { align: 1 });
    const rows: [string, number][] = [[e.played ? 'Match credits' : 'Match credits (simulated)', e.match]];
    if (e.win) rows.push([e.us > e.them ? 'Win bonus' : 'Draw bonus', e.win]);
    if (e.extra) rows.push(['Title won', e.extra]);
    rows.forEach(([a, n], i) => { g.label(a, W / 2 - 80, 62 + i * 13, 9, C.ink); g.label(`+${n}`, W / 2 + 80, 62 + i * 13, 9, C.ink, { align: 2, bold: true }); });
    const y = 66 + rows.length * 13;
    g.rect(W / 2 - 80, y, 160, 1, C.dim);
    g.label('Total earned', W / 2 - 80, y + 5, 10, C.gold, { bold: true }); g.label(`+${e.total}`, W / 2 + 80, y + 4, 12, C.gold, { align: 2, display: true });
    g.label(`You now have ${c.credits} credits for the Open Market`, W / 2, y + 24, 7, C.dim, { align: 1 });
    if (button(game, g, W / 2 - 60, 138, 120, 22, 'Continue', { primary: true, size: 11 })) { c.lastEarn = null; saveGame(game); game.go(this.next()); }
  }
}

// The career's home: who you coach, how it is going, what is next, and the way in to the club's other rooms.
export class MyCareerScene implements Scene {
  private history = false;
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 0)) return;
    const c = game.career!, uid = activeTeamId(c) || c.teamId, team = c.teams[uid], comp = activeComp(c), f = userFixture(c);
    const past = c.history ?? [], pos = position(c), gi = comp.groups.findIndex(gr => gr.includes(uid));
    const all = past.reduce((a, h) => ({ w: a.w + h.w, d: a.d + h.d, l: a.l + h.l }), { ...c.record });
    const titles = c.trophies.length;
    g.card(8, CONTENT_Y, 198, 118, C.panel); g.rect(9, CONTENT_Y, 196, 2, team.c1);
    if (this.history) {
      g.label('Career history', 14, CONTENT_Y + 5, 10, C.gold, { display: true });
      if (!past.length) g.label('Your first season is still being played', 14, CONTENT_Y + 22, 7, C.dim);
      past.slice(-7).forEach((h, i) => {
        const y = CONTENT_Y + 21 + i * 11;
        g.label(String(h.year), 14, y, 7, C.dim); g.label(tc(h.team), 38, y, 7, C.ink, { bold: true });
        g.label(`${ordinal(h.pos).toLowerCase()} of ${h.of}`, 120, y, 7, h.champ ? C.gold : C.ink);
        g.label(`${h.w}-${h.d}-${h.l}`, 200, y, 7, C.dim, { align: 2 });
      });
      g.label(`Seasons finished ${past.length}   Titles ${titles}   All matches ${all.w} won, ${all.d} drawn, ${all.l} lost`, 14, CONTENT_Y + 104, 5.5, C.dim);
    } else {
      g.label('MY CAREER', 14, CONTENT_Y + 5, 7, C.gold, { bold: true });
      g.label(tc(team.name).toUpperCase(), 14, CONTENT_Y + 14, 15, C.ink, { display: true });
      g.label(c.mode === 'cup' ? `${compTitle(c)}  ·  ${c.year} World Cup` : `${tc(comp.name)}  ·  Season ${seasonNo(c)} (${c.year})`, 14, CONTENT_Y + 33, 7.5, C.dim);
      const rows: [string, string][] = [
        ['This season', `Wins: ${c.record.w}  |  Draws: ${c.record.d}  |  Losses: ${c.record.l}`],
        [comp.groups.length > 1 ? 'Pool position' : 'League position', pos ? `${ordinal(pos).toLowerCase()} of ${comp.groups[Math.max(0, gi)].length}` : 'Not in the table'],
        ['Seasons coached', String(seasonNo(c))],
        ['Achievements', titles ? `${titles} title${titles === 1 ? '' : 's'}: ${tc(c.trophies[c.trophies.length - 1])}` : 'No titles yet'],
        ['Next match', f ? `${tc(c.teams[f.h].name)} v ${tc(c.teams[f.a].name)}` : comp.done ? 'Season complete' : 'No fixture this week'],
      ];
      rows.forEach(([a, b], i) => { const y = CONTENT_Y + 47 + i * 12; g.label(a, 14, y, 6.5, C.dim); g.label(b, 80, y - 0.5, 7.5, i === 4 ? C.gold : C.ink, { bold: true }); });
      if (f && button(game, g, 14, CONTENT_Y + 108 - 3, 90, 11, 'Go to Match Centre', { primary: true, size: 6.5 })) { game.go(new MatchCentreScene(game)); return; }
    }
    // the club's other rooms
    const bx = 212, bw = 100;
    if (button(game, g, bx, CONTENT_Y, bw, 20, 'Training Ground', { col: C.panel2, size: 8 })) { game.go(new TrainingScene(game, () => new MyCareerScene(game))); return; }
    if (button(game, g, bx, CONTENT_Y + 24, bw, 20, 'Facilities', { col: C.panel2, size: 8 })) { game.go(new ClubScene(game)); return; }
    if (button(game, g, bx, CONTENT_Y + 48, bw, 20, this.history ? 'Back to summary' : 'Career history', { col: C.panel2, size: 8 })) this.history = !this.history;
    if (button(game, g, bx, CONTENT_Y + 72, bw, 20, isMuted() ? 'Sound: off' : 'Sound: on', { col: C.panel2, size: 8 })) setMuted(!isMuted());
    if (button(game, g, bx, CONTENT_Y + 98, bw, 20, 'Save and quit', { size: 8 })) { saveGame(game); game.go(new TitleScene(game)); }
    g.label(`Reputation ${Math.round(c.rep)}   Every match earns credits; a win earns more`, 8, 164, 6.5, C.dim);
  }
}

// What to play: a club career in one of two leagues, or a World Cup with a nation.
const COMPS: { id: 'super' | 'urc' | 'world'; title: string; kind: string; lines: string[] }[] = [
  { id: 'super', title: COMP_NAMES.super, kind: 'Club career', lines: ['11 teams from New Zealand,', 'Australia and the Pacific.', 'A season, then the top four.'] },
  { id: 'urc', title: 'Northern Hemisphere', kind: 'Club career', lines: [COMP_NAMES.urc + ':', '16 teams from five countries.', 'A season, then the top eight.'] },
  { id: 'world', title: 'International Rugby', kind: 'Tournament', lines: ['The 2027 World Cup:', '24 nations in six pools.', 'Saved apart from your career.'] },
];

export class CompetitionScene implements Scene {
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    g.rect(g.left, 0, g.vw, H, C.bg);
    topBar(g, 'Choose a competition');
    if (button(game, g, W - 52, 3, 46, 13, 'Back', { size: 7 })) { game.go(new TitleScene(game)); return; }
    COMPS.forEach((cp, i) => {
      const x = 8 + i * 103, r: Rect = [x, 28, 98, 142], hot = game.ptr.down && inRect(game.ptr, r);
      g.card(x, 28, 98, 142, hot ? C.panel2 : C.panel); g.rect(x + 1, 28, 96, 3, i === 2 ? C.red : C.gold);
      g.label(cp.kind, x + 49, 37, 7, C.dim, { align: 1 });
      const words = cp.title.split(' '), half = Math.ceil(words.length / 2);
      g.label(words.slice(0, half).join(' '), x + 49, 49, 12, C.ink, { align: 1, display: true });
      g.label(words.slice(half).join(' '), x + 49, 63, 12, C.ink, { align: 1, display: true });
      // a row of the kits in it
      const ids = cp.id === 'super' ? CLUB_IDS : cp.id === 'urc' ? URC_IDS : NATION_IDS;
      ids.slice(0, 8).forEach((id, n) => { const t = TEAMS.find(q => q.id === id)!; kitBadge(g, x + 9 + n * 10.2, 84, t, 8, 11); });
      cp.lines.forEach((l, n) => g.label(l, x + 49, 104 + n * 10, 7, C.dim, { align: 1 }));
      g.card(x + 14, 142, 70, 18, i === 0 ? C.gold : C.panel2); g.label('Choose', x + 49, 146, 9, i === 0 ? C.dark : C.ink, { align: 1, bold: true });
      if (game.tap && inRect(game.tap, r)) { game.tap = null; game.go(new TeamSelectScene(game, cp.id)); }
    });
  }
}

export class TeamSelectScene implements Scene {
  private sel = '';
  constructor(private game: Game, private comp: 'super' | 'urc' | 'world' = 'super') {}
  update() {}
  draw(g: Gfx) {
    const game = this.game, comp = this.comp;
    g.rect(g.left, 0, g.vw, H, C.bg);
    topBar(g, comp === 'world' ? 'Pick your nation' : 'Pick your club', comp === 'world' ? '' : COMP_NAMES[comp]);
    const ids = comp === 'super' ? CLUB_IDS : comp === 'urc' ? URC_IDS : WC_POOLS.flat();
    const list = ids.map(id => TEAMS.find(t => t.id === id)!);
    const cols = comp === 'super' ? 2 : comp === 'urc' ? 2 : 3, rows = Math.ceil(list.length / cols);
    const cw = Math.floor(304 / cols), rh = Math.min(20, Math.floor(126 / rows));
    list.forEach((t, i) => {
      // nations are listed pool by pool, down the columns
      const col = comp === 'world' ? Math.floor(i / rows) : i % cols, row = comp === 'world' ? i % rows : Math.floor(i / cols);
      const x = 8 + col * cw, y = 24 + row * rh, on = this.sel === t.id, r: Rect = [x, y, cw - 4, rh - 2];
      g.card(x, y, cw - 4, rh - 2, on ? C.panel2 : C.panel); if (on) g.rect(x + 1, y, cw - 6, 1.5, C.gold);
      kitBadge(g, x + 3, y + 2, t, 7, rh - 6);
      const size = Math.min(8, rh - 6);
      g.label(tc(t.name), x + 14, y + (rh - 2 - size) / 2 - 1, size, C.ink, { bold: on });
      if (comp === 'world') g.label('ABCDEF'[Math.floor(i / 4)], x + cw - 8, y + (rh - 2 - 6.5) / 2 - 1, 6.5, C.dim, { align: 2 });
      else pips(g, x + cw - 8, y + (rh - 7) / 2, stars(t.base), true);
      if (game.tap && inRect(game.tap, r)) this.sel = t.id;
    });
    g.label(comp === 'world' ? 'The letter is the pool. Top two of each pool and the four best thirds go through' : 'More pips means a stronger squad. There is a World Cup every fourth year', 8, 156, 6.5, C.dim);
    if (button(game, g, 8, 164, 50, 13, 'Back', { size: 7 })) { game.go(new CompetitionScene(game)); return; }
    if (button(game, g, 222, 152, 90, 24, this.sel ? 'Start' : comp === 'world' ? 'Pick a nation' : 'Pick a club', { off: !this.sel, primary: true, size: this.sel ? 11 : 8 })) {
      game.career = newCareer((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, this.sel, comp === 'world' ? 'cup' : 'career');
      saveGame(game);
      game.go(route(game));
    }
  }
}

// The next game, and the one big button that plays it.
export class MatchCentreScene implements Scene {
  private t = 0;
  constructor(private game: Game) {}
  update(dt: number) { this.t += dt; }
  private side(g: Gfx, x: number, t: Team, kit: Kit, tag: string, face: number) {
    // each side gets a block of its own colour, its kit, and a player in it
    g.card(x - 62, CONTENT_Y + 16, 124, 54, t.c1, 0.22);
    kitBadge(g, x - 46 * face - 9, CONTENT_Y + 24, kit, 18, 26);
    drawPlayer(g, x + 30 * face, CONTENT_Y + 50, kit, t.roster[5]?.skin ?? 1, 'stand', 0, face);
    g.label(tc(t.name), x, CONTENT_Y + 54, t.name.length > 13 ? 8.5 : 11, C.ink, { align: 1, display: true });
    pips(g, x - 17, CONTENT_Y + 74, stars(teamRatings(t).ovr));
    g.label(tag, x, CONTENT_Y + 82, 6.5, C.dim, { align: 1 });
  }
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 2)) return;
    const c = game.career!, uid = activeTeamId(c) || c.teamId, team = c.teams[uid], comp = activeComp(c), f = userFixture(c);
    const gi = comp.groups.findIndex(gr => gr.includes(uid));
    const pos = gi >= 0 ? standings(comp, gi).findIndex(s => s.id === uid) + 1 : 0;
    const round = f ? (f.stage ? stageName(f.stage) : `Round ${comp.r + 1} of ${leagueRounds(comp)}`) : comp.done ? 'Complete' : 'No game this week';
    g.card(8, CONTENT_Y, 304, 92, C.panel);
    // a strip of pitch across the card, with the halfway line down the middle
    g.rect(9, CONTENT_Y + 16, 302, 54, PITCH.a, 0.5); g.rect(W / 2, CONTENT_Y + 16, 1, 54, C.ink, 0.5);
    g.label(`${tc(comp.name)}  ·  ${round}`, W / 2, CONTENT_Y + 4, 8, C.gold, { align: 1, bold: true });
    if (isWcYear(c) && c.stage === 'season') g.label('World Cup year', 304, CONTENT_Y + 4, 6.5, C.red, { align: 2 });
    const record = `Won ${c.record.w}  Drew ${c.record.d}  Lost ${c.record.l}${pos ? `   ${ordinal(pos).toLowerCase()}${comp.groups.length > 1 ? ' in pool ' + 'ABCDEF'[gi] : ''}` : ''}`;
    if (f) {
      const home = f.h === uid, opp = c.teams[home ? f.a : f.h];
      const kits = matchKits(team, !!c.away, opp);
      this.side(g, 78, team, kits.us, f.stage ? 'Knockout' : home ? 'At home' : `Away at ${tc(opp.name)}`, 1);
      this.side(g, 242, opp, kits.them, kits.changed ? 'In their change kit' : home ? 'Visitors' : 'At home', -1);
      // home or away jersey: tap to change, and the player beside it changes with it
      if (button(game, g, 82, CONTENT_Y + 18, 50, 10, c.away ? 'Kit: away' : 'Kit: home', { col: C.dark, size: 6 })) { c.away = !c.away; saveGame(game); }
      g.card(W / 2 - 11, CONTENT_Y + 33, 22, 18, C.dark); g.label('v', W / 2, CONTENT_Y + 34, 13, C.gold, { align: 1, display: true });
      g.label(record, W / 2, CONTENT_Y + 82, 6.5, C.dim, { align: 1 });
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      g.card(6, 134, 204, 40, C.gold, 0.25 + 0.2 * pulse);
      if (button(game, g, 8, 136, 200, 36, 'KICK OFF', { primary: true, size: 16 })) {
        const us = { ...sideFromTeam(team, c.rep), ...kits.us }, them = { ...sideFromTeam(opp, 60, easeOf(c)), ...kits.them };
        game.go(new MatchScene(game, us, them, f.stage !== '', (c.rngS ^ (c.year * 7919 + comp.r * 104729)) >>> 0, res => {
          finishRound(c, res); saveGame(game);
          game.go(afterRound(game));
        }));
        return;
      }
      drawMatchBall(g, 30, 154, 2);
      if (button(game, g, 214, 136, 98, 36, 'SIM GAME', { size: 10 })) { finishRound(c); saveGame(game); game.go(afterRound(game)); return; }
    } else {
      const champ = comp.done && comp.champion === uid;
      const msg = comp.done ? `${tc(comp.name)} won by ${tc(c.teams[comp.champion].name)}`
        : c.stage === 'worldcup' && !c.wcTeamId ? 'Watching from home' : gi >= 0 && comp.rounds[comp.r][0].stage ? 'You are out. The knockouts go on without you' : 'No fixture this week';
      if (champ) g.label('Champions!', W / 2, CONTENT_Y + 24, 22, C.gold, { align: 1, display: true });
      g.label(msg, W / 2, CONTENT_Y + (champ ? 54 : 36), 9, C.ink, { align: 1 });
      g.label(record, W / 2, CONTENT_Y + 78, 7, C.dim, { align: 1 });
      if (c.mode === 'cup' && comp.done) {
        // the tournament is over: its save is cleared and it is back to the title
        if (button(game, g, 8, 136, 304, 36, 'Finish tournament', { primary: true, size: 13 })) { if (c.id) deleteCareer(game.store, c.id); game.career = null; game.go(new TitleScene(game)); return; }
      } else if (button(game, g, 8, 136, 304, 36, 'Continue', { primary: true, size: 13 })) { proceed(c); saveGame(game); game.go(c.stage === 'season' || c.stage === 'worldcup' ? new MatchCentreScene(game) : route(game)); return; }
    }
  }
}

export class TableScene implements Scene {
  private ci: number; private gi = 0; private finals = false;
  constructor(private game: Game) {
    const c = game.career!, comps = this.comps(), ac = activeComp(c);
    this.ci = Math.max(0, comps.indexOf(ac));
    const uid = activeTeamId(c);
    this.gi = Math.max(0, ac.groups.findIndex(gr => gr.includes(uid)));
  }
  // a World Cup tournament has only the World Cup to show
  private comps(): Comp[] { return [activeComp(this.game.career!)]; }
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 3)) return;
    this.body(g, CONTENT_Y);
  }
  // The table (or pools) and the finals of the competition this career is in, and no other.
  body(g: Gfx, y: number) {
    const game = this.game;
    const c = game.career!, comps = this.comps(), comp = comps[Math.min(this.ci, comps.length - 1)], uid = activeTeamId(c) || c.teamId;
    if (comp.ko > 0) {
      const tabs = comp.groups.length > 1 ? comp.groups.map((_, i) => (comp.groups.length > 4 ? '' : 'Pool ') + 'ABCDEF'[i]) : ['Table'];
      tabs.push('Finals');
      const w2 = Math.floor(304 / tabs.length);
      tabs.forEach((t, i) => {
        const isF = i === tabs.length - 1, on = isF ? this.finals : !this.finals && this.gi === i;
        if (button(game, g, 8 + i * w2, y, w2 - 3, 11, t, { col: on ? C.blue : C.panel, size: 7 })) { this.finals = isF; if (!isF) this.gi = i; }
      });
      y += 14;
    }
    if (this.finals) {
      const ko = comp.rounds.flat().filter(f => f.stage);
      if (!ko.length) g.label('The finals start after the last round', 8, y + 4, 8, C.dim);
      // a long knockout list (a World Cup has 15 ties) goes in two columns
      const two = ko.length > 9, per = two ? Math.ceil(ko.length / 2) : ko.length, kh = Math.min(11, Math.floor((H - y - 16) / Math.max(1, per)));
      ko.forEach((f, i) => {
        const x0 = two && i >= per ? 160 : 0, yy = y + 2 + (two && i >= per ? i - per : i) * kh, mine = f.h === uid || f.a === uid, size = Math.min(two ? 6.5 : 8, kh - 2.5);
        const mid = x0 + (two ? 96 : 162);
        g.label(two ? f.stage : stageName(f.stage), x0 + 8, yy, size - 0.5, C.dim);
        g.label(tc(c.teams[f.h].name), mid - 12, yy, size, mine ? C.gold : C.ink, { align: 2 });
        g.label(f.played ? `${f.hs} - ${f.as}` : 'v', mid, yy, size, C.ink, { align: 1, bold: true });
        g.label(tc(c.teams[f.a].name), mid + 12, yy, size, mine ? C.gold : C.ink);
      });
      if (comp.done) g.label(`Champions: ${tc(c.teams[comp.champion].name)}`, W / 2, H - 13, 10, C.gold, { align: 1, display: true });
      return;
    }
    const rows = standings(comp, Math.min(this.gi, comp.groups.length - 1));
    const rh = Math.min(11, Math.floor((H - y - 12) / rows.length));
    const xs = [150, 172, 194, 216, 250, 278, 308];
    ['P', 'W', 'D', 'L', 'For', 'Agst', 'Pts'].forEach((h, i) => g.label(h, xs[i], y, 6.5, C.dim, { align: 2 }));
    rows.forEach((s, i) => {
      const yy = y + 9 + i * rh, r = s.row, me = s.id === uid;
      if (me) g.card(6, yy - 1, 308, rh, C.panel2); else if (i % 2) g.card(6, yy - 1, 308, rh, C.panel);
      if (comp.ko && i === comp.ko / comp.groups.length) g.rect(8, yy - 2, 304, 1, C.gold, 0.6);
      const size = Math.min(8, rh - 2.5);
      g.label(String(i + 1), 16, yy, size, C.dim, { align: 2 });
      g.label(tc(c.teams[s.id].name), 22, yy, size, me ? C.gold : C.ink, { bold: me });
      [r.p, r.w, r.d, r.l, r.pf, r.pa, r.pts].forEach((v, k) => g.label(String(v), xs[k], yy, size, k === 6 ? C.gold : C.ink, { align: 2, bold: k === 6 }));
    });
  }
}

export class FixturesScene implements Scene {
  private view = 0; private table: TableScene;
  constructor(private game: Game, view = 0) { this.view = view; this.table = new TableScene(game); }
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 3)) return;
    const c = game.career!, comp = activeComp(c), uid = activeTeamId(c) || c.teamId;
    // one page, three views
    ['Fixtures', 'Results', 'Standings'].forEach((name, i) => {
      if (button(game, g, 8 + i * 68, CONTENT_Y, 65, 13, name, { col: this.view === i ? C.gold : C.panel, primary: this.view === i, size: 7.5 })) this.view = i;
    });
    g.label(tc(comp.name), 312, CONTENT_Y + 3, 7.5, C.dim, { align: 2 });
    const y0 = CONTENT_Y + 17;
    if (this.view === 2) { this.table.body(g, y0); return; }
    const mine = comp.rounds.map((round, ri) => ({ f: round.find(x => x.h === uid || x.a === uid), ri })).filter(o => o.f && (this.view === 1) === o.f.played);
    if (!mine.length) g.label(this.view === 1 ? 'No results yet' : comp.done ? 'The season is over' : 'No more fixtures drawn yet', 8, y0 + 6, 8, C.dim);
    const rh = Math.min(12, (H - y0 - 4) / Math.max(1, mine.length));
    mine.forEach((o, n) => {
      const f = o.f!, y = y0 + 2 + n * rh, home = f.h === uid, opp = c.teams[home ? f.a : f.h];
      const us = home ? f.hs : f.as, th = home ? f.as : f.hs, next = o.ri === comp.r && !f.played, size = Math.min(8, rh - 3);
      if (next) g.card(6, y - 1.5, 308, rh, C.panel2); else if (n % 2) g.card(6, y - 1.5, 308, rh, C.panel);
      g.label(f.stage ? stageName(f.stage) : `Round ${o.ri + 1}`, 10, y, size, C.dim);
      kitBadge(g, 62, y, opp, 6, size);
      g.label(tc(opp.name), 72, y, size, next ? C.gold : C.ink, { bold: next });
      g.label(home ? 'Home' : 'Away', 190, y, size, C.dim);
      if (f.played) g.label(`${us > th ? 'Won' : us === th ? 'Drew' : 'Lost'} ${us}-${th}`, 308, y, size, us > th ? C.gold : us === th ? C.ink : C.red, { align: 2, bold: true });
      else if (next) g.label('Next', 308, y, size, C.gold, { align: 2, bold: true });
    });
  }
}

// Facilities, the Training Ground and the trophy cabinet.
export class ClubScene implements Scene {
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game;
    if (chrome(game, g, 0)) return;
    const c = game.career!;
    const fac: ['train' | 'med', string, string][] = [
      ['train', 'Training centre', 'XP +5% / level, potential +1 / level'],
      ['med', 'Medical room', 'Recovery improved, potential +1 / 4 levels'],
    ];
    fac.forEach(([k, name, blurb], i) => {
      const y = CONTENT_Y + i * 30, lvl = c.fac[k];
      g.card(8, y, 196, 27, C.panel);
      g.label(name, 14, y + 3, 9, C.ink, { bold: true });
      g.label(blurb, 14, y + 15, 6.5, C.dim);
      for (let n = 0; n < 8; n++) g.card(105 + n * 5, y + 5, 4, 6, n < lvl ? C.gold : C.panel2);
      if (lvl >= FAC_COST[k].length) g.label('Maxed', 172, y + 4, 7.5, C.gold, { align: 1, bold: true });
      else if (button(game, g, 142, y + 3, 58, 13, `Upgrade: ${FAC_COST[k][lvl]}`, { off: c.credits < FAC_COST[k][lvl], primary: true, size: 7 })) { upgrade(c, k); saveGame(game); }
    });
    // the Training Ground: the coaching board for set plays
    g.card(8, CONTENT_Y + 60, 196, 34, C.panel);
    g.label('Training Ground', 14, CONTENT_Y + 63, 10, C.gold, { display: true });
    g.label('Draw set plays and call them in a match', 14, CONTENT_Y + 77, 6.5, C.dim);
    if (button(game, g, 146, CONTENT_Y + 65, 52, 22, 'Open', { primary: true, size: 9 })) { game.go(new TrainingScene(game, () => new ClubScene(game))); return; }
    if (button(game, g, 120, 156, 80, 16, 'Back', { primary: true, size: 7.5 })) { game.go(new MyCareerScene(game)); return; }
    g.card(210, CONTENT_Y, 102, 94, C.panel);
    g.label('Trophy cabinet', 216, CONTENT_Y + 3, 8, C.gold, { bold: true });
    if (!c.trophies.length) g.label('Empty for now', 216, CONTENT_Y + 16, 7, C.dim);
    c.trophies.slice(-7).forEach((tr, i) => g.label(tc(tr).replace(' Of Nations', ''), 216, CONTENT_Y + 16 + i * 10, 6.5, C.ink));
    g.label(`Reputation ${Math.round(c.rep)}   Every match earns credits`, 8, 140, 7, C.dim);
    if (button(game, g, 8, 156, 80, 16, isMuted() ? 'Sound off' : 'Sound on', { size: 7.5 })) setMuted(!isMuted());
    if (button(game, g, 232, 156, 80, 16, 'Save and quit', { size: 7.5 })) { saveGame(game); game.go(new TitleScene(game)); }
  }
}

function offerCard(g: Gfx, y: number, t: Team, sub: string) {
  g.card(8, y, 304, 26, C.panel);
  kitBadge(g, 14, y + 4, t, 12, 18);
  g.label(tc(t.name), 32, y + 3, 10, C.ink, { display: true });
  g.label(sub, 32, y + 16, 6.5, C.dim);
  pips(g, 224, y + 10, stars(teamRatings(t).ovr), true);
}

export class WcPickScene implements Scene {
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game, c = game.career!;
    g.rect(g.left, 0, g.vw, H, C.bg);
    topBar(g, 'World Cup of Nations', String(c.year));
    g.label('National unions want you for the tournament. Your club job is safe.', 8, 24, 8, C.ink);
    g.label('Pick a team to take to the Cup.', 8, 34, 7.5, C.dim);
    c.offers.forEach((id, i) => {
      const t = c.teams[id], y = 48 + i * 30;
      offerCard(g, y, t, 'National team');
      if (button(game, g, 232, y + 4, 74, 18, 'Take the job', { primary: true, size: 8 })) { pickWc(c, id); saveGame(game); game.go(new MatchCentreScene(game)); }
    });
    if (button(game, g, 8, 152, 160, 20, 'Watch from home (simulate)', { size: 8 })) { pickWc(c, null); saveGame(game); game.go(route(game)); }
  }
}

export class OffseasonScene implements Scene {
  private page = 0; private offers = false;
  constructor(private game: Game) {}
  update() {}
  draw(g: Gfx) {
    const game = this.game, c = game.career!, per = 10;
    g.rect(g.left, 0, g.vw, H, C.bg);
    topBar(g, 'Off-season', String(c.year));
    if (!this.offers) {
      const lines = c.report.slice(this.page * per, this.page * per + per);
      lines.forEach((l, i) => g.label(tc(l), 10, 25 + i * 12.5, i === 0 && this.page === 0 ? 10 : 8,
        i === 0 && this.page === 0 ? C.gold : /RETIRED|LEFT|DROPPED/.test(l) ? C.red : /IMPROVED|RE-SIGNED/.test(l) ? C.gold : C.ink, { bold: i === 0 && this.page === 0 }));
      const more = (this.page + 1) * per < c.report.length;
      if (button(game, g, 212, 154, 100, 20, more ? 'More' : 'Job offers', { primary: true, size: 9 })) { if (more) this.page++; else this.offers = true; }
      return;
    }
    const cur = c.teams[c.teamId];
    g.label(c.offers.length ? 'Other teams have noticed your work:' : 'No offers this year. Keep building your reputation.', 8, 25, 8.5, C.ink);
    c.offers.forEach((id, i) => {
      const t = c.teams[id], y = 40 + i * 30;
      offerCard(g, y, t, c.comps.north.groups[0].includes(t.id) ? tc(c.comps.north.name) : tc(c.comps.south.name));
      if (button(game, g, 232, y + 4, 74, 18, 'Accept', { col: C.blue, size: 8 })) { startNextYear(c, id); saveGame(game); game.go(route(game)); }
    });
    if (button(game, g, 8, 150, 304, 24, `Stay with ${tc(cur.name)}`, { primary: true, size: 11 })) { startNextYear(c); saveGame(game); game.go(route(game)); }
  }
}
