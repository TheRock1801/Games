import { Rng, clamp } from '../engine/rng';
import { TEAMS, CLUB_IDS, URC_IDS, NATION_IDS, WC_POOLS, COMP_NAMES } from '../data/teams';
import { SLOTS, type Attr, type Career, type Comp, type Fixture, type MatchResult, type Player, type Team } from './types';
import { ATTRIBUTES, genPlayer, ovr, salaryFor } from './players';
import { advance, newComp, record, simFixture, standings } from './competition';

// The salary cap, in thousands: $1M. Fictional money, like everything else in the market.
export const CAP = 1000, START_YEAR = 2026, SAVE_KEY = 'trytime.save.v1';
// A World Cup tournament is its own save, apart from the club career.
export const CUP_KEY = 'trytime.cup.v1';
export const FAC_COST = { train: [8, 14, 20, 28, 38, 50, 64, 80], med: [6, 10, 14, 20, 28, 38, 50, 65] };
// Credits: what a new market costs, what a training point costs, and what matches pay.
export const REFRESH_COST = 8, TRAIN_COST = 3, MARKET_SIZE = 10;
export const PAY = { played: 3, simmed: 1, win: 2, simWin: 1, draw: 1, title: 10, season: 5 };
// Facility boosts expand potential ceilings; players still need XP and training to reach them.
export const developmentCeiling = (c: Career, p: Player) => clamp(p.pot + c.fac.train + Math.floor(c.fac.med / 4), 0, 99);

function withRng<T>(c: Career, fn: (r: Rng) => T): T {
  const r = new Rng(1); r.s = c.rngS;
  const out = fn(r); c.rngS = r.s;
  return out;
}

export const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
export const prestige = (t: Team) => (t.base - 62) * 3.3;
export const isWcYear = (c: Career) => c.year % 4 === 3;
export const capUsed = (t: Team) => t.roster.reduce((s, p) => s + p.salary, 0);

// mode 'cup': skip straight to the World Cup with the chosen nation. The year is set to a World Cup year.
export function newCareer(seed: number, teamId: string, mode: 'career' | 'cup' = 'career'): Career {
  const rng = new Rng(seed);
  const teams: Record<string, Team> = {};
  let nextId = 1;
  for (const d of TEAMS) {
    // A new club career starts the way these things should: a squad of ordinary players and one who is
    // not. The featured man is a fullback, a wing or a first five, a clear cut above the rest. Everyone
    // else is there to be improved on through the market. Other clubs, and nations, have full squads.
    const mine = d.id === teamId && mode === 'career' && d.kind === 'club';
    const roster = SLOTS.map(pos => genPlayer(rng, pos, d.base - (mine ? 13 : 4), d.names, nextId++));
    if (mine) {
      const want = rng.pick(['FB', 'WG', 'FH']), at = SLOTS.findIndex(p => p === want);
      const hero = genPlayer(rng, want, d.base + 7, d.names, nextId++);
      hero.star = true; hero.age = rng.int(22, 25); hero.pot = clamp(ovr(hero) + rng.int(4, 9), 0, 99); hero.years = 3;
      roster[at] = hero;
    }
    // squad players come cheap; it is the featured men who cost
    if (d.kind === 'club') for (const p of roster) p.salary = Math.round(salaryFor(ovr(p)) * (mine && !p.star ? 0.66 : 0.9));
    teams[d.id] = { id: d.id, name: d.name, kind: d.kind, base: d.base, c1: d.c1, c2: d.c2, names: d.names, six: d.league === 'urc', roster };
  }
  const c: Career = {
    began: START_YEAR, v: 1, rngS: 1, year: START_YEAR, teamId, wcTeamId: null, stage: 'season',
    rep: 35, credits: 5, fac: { train: 0, med: 0 }, teams,
    comps: { south: null as unknown as Comp, north: null as unknown as Comp, world: null },
    market: [], nextId, trophies: [], report: [], offers: [], record: { w: 0, d: 0, l: 0 },
  };
  buildSeason(c, rng);
  refreshMarket(c, rng);
  if (mode === 'cup') { c.mode = 'cup'; c.year = 2027; buildWorld(c, rng); c.wcTeamId = teamId; c.stage = 'worldcup'; }
  c.rngS = rng.s;
  return c;
}

function buildSeason(c: Career, rng: Rng) {
  // Both club competitions run every season: the user's own, and the other one in the background.
  // (An older save keeps the teams and competitions it was started with.)
  const have = (ids: string[]) => ids.filter(id => c.teams[id]);
  c.comps.south = newComp('south', COMP_NAMES.super, [have(CLUB_IDS)], 4, rng);
  c.comps.north = newComp('north', COMP_NAMES.urc, [have(URC_IDS)], 8, rng);
  c.comps.world = null;
  c.stage = 'season';
  c.record = { w: 0, d: 0, l: 0 };
}

function buildWorld(c: Career, rng: Rng) {
  // 24 nations in the six pools as drawn; the top two of each and the four best thirds reach the last 16.
  if (WC_POOLS.flat().every(id => c.teams[id])) { c.comps.world = newComp('world', COMP_NAMES.world, WC_POOLS.map(p => [...p]), 16, rng); return; }
  // an older save with 20 nations: four seeded pools of five, as it always was
  const ids = NATION_IDS.filter(id => c.teams[id]).concat(Object.keys(c.teams).filter(id => c.teams[id].kind === 'nation' && !NATION_IDS.includes(id))).sort((a, b) => c.teams[b].base - c.teams[a].base).slice(0, 20);
  const pools: string[][] = [[], [], [], []];
  for (let band = 0; band < 5; band++) rng.shuffle(ids.slice(band * 4, band * 4 + 4)).forEach((id, i) => pools[i].push(id));
  c.comps.world = newComp('world', 'WORLD CUP OF NATIONS', pools, 8, rng);
}

// Ten players, one for every position: mostly men a club can afford, a few good ones, and now and then
// somebody special. Nobody elite turns up in a first season; that is something to save for.
function refreshMarket(c: Career, rng: Rng) {
  const team = c.teams[c.teamId];
  c.market = [];
  const types = rng.shuffle([...new Set(SLOTS)]);
  if (team.kind !== 'club' || c.mode === 'cup') return;
  const first = c.year === (c.began ?? START_YEAR);
  for (let i = 0; i < MARKET_SIZE; i++) {
    const roll = rng.next();
    const level = i < 5 ? rng.int(64, 72) : i < 8 ? rng.int(72, 79) : first ? rng.int(77, 82) : roll < 0.3 ? rng.int(88, 93) : rng.int(79, 86);
    const young = i % 3 === 0;
    const p = genPlayer(rng, types[i % types.length], level, rng.pick([team.names, team.names, 'NZL', 'AUS', 'PAC', 'IRE', 'RSA']), c.nextId++, young);
    // a young one is not the finished article: that is the reason to sign him
    // position leanings can lift a man well above the level asked for: in a first season nobody is that good
    if (first) while (ovr(p) > 84) for (const a of ATTRIBUTES) p[a] = Math.max(25, p[a] - 1);
    p.pot = Math.max(p.pot, ovr(p));
    if (young) p.pot = clamp(ovr(p) + rng.int(8, 16), 0, 99);
    p.salary = Math.round(salaryFor(ovr(p)) * 1.1); p.years = rng.int(2, 3); p.star = true;
    c.market.push(p);
  }
}

// Pays for a new market: ten different players. Nothing else refreshes it during a season.
export function rerollMarket(c: Career): boolean {
  if (c.credits < REFRESH_COST || c.teams[c.teamId].kind !== 'club' || c.mode === 'cup') return false;
  c.credits -= REFRESH_COST;
  withRng(c, rng => refreshMarket(c, rng));
  return true;
}

// How easy the opposition is on the pitch: very in a first season, less each year, normal from the fourth.
// A World Cup tournament is played straight.
export const easeOf = (c: Career) => (c.mode === 'cup' ? 0 : [1, 0.65, 0.3][c.year - (c.began ?? START_YEAR)] ?? 0);

export function activeTeamId(c: Career): string { return c.stage === 'worldcup' ? c.wcTeamId ?? '' : c.teamId; }

export function activeComp(c: Career): Comp {
  if (c.stage === 'worldcup' && c.comps.world) return c.comps.world;
  // whichever league the user's team is in
  return c.comps.north.groups.some(g => g.includes(c.teamId)) ? c.comps.north : c.comps.south;
}

const activeCompOf = (c: Career) => (c.comps.north.groups.some(g => g.includes(c.teamId)) ? c.comps.north : c.comps.south);

export function userFixture(c: Career): Fixture | null {
  if (c.stage !== 'season' && c.stage !== 'worldcup') return null;
  const comp = activeComp(c), id = activeTeamId(c);
  if (comp.done || !id) return null;
  return comp.rounds[comp.r].find(f => !f.played && (f.h === id || f.a === id)) ?? null;
}

function userAfter(c: Career, f: Fixture, rng: Rng, played: boolean) {
  const id = activeTeamId(c), home = f.h === id;
  const us = home ? f.hs : f.as, them = home ? f.as : f.hs;
  if (us > them) { c.record.w++; c.rep = clamp(c.rep + 1.2, 0, 100); }
  else if (us === them) c.record.d++;
  else { c.record.l++; c.rep = clamp(c.rep - 0.6, 0, 100); }
  if (f.stage !== '') c.rep = clamp(c.rep + 1, 0, 100);
  // Every match pays something, win or lose; playing it yourself pays more than simulating it.
  const match = played ? PAY.played : PAY.simmed, win = us > them ? (played ? PAY.win : PAY.simWin) : us === them ? PAY.draw : 0;
  c.credits += match + win;
  c.lastEarn = { played, us, them, opp: c.teams[home ? f.a : f.h].name, match, win, extra: 0, total: match + win };
  for (const p of c.teams[id].roster) {
    p.cond = clamp(Math.round(p.cond - rng.int(10, 20) * (1.3 - p.sta / 200)), 20, 100);
    if (p.inj === 0 && rng.chance(0.035 * (1 - 0.07 * c.fac.med))) p.inj = rng.int(1, 4);
    if (p.star && p.inj === 0 && ovr(p) < developmentCeiling(c, p)) {
      p.xp = (p.xp ?? 0) + Math.round((played ? 18 : 10) * (1 + 0.05 * c.fac.train));
      while (p.xp >= 80) { p.xp -= 80; p.points = (p.points ?? 0) + 1; }
    }
  }
}

// Plays out the current round. Pass the user's own result if they played it; otherwise it is simulated.
export function finishRound(c: Career, res?: MatchResult) {
  withRng(c, rng => {
    const comps = c.stage === 'worldcup' ? [c.comps.world!] : [c.comps.south, c.comps.north];
    const uid = activeTeamId(c), ac = activeComp(c);
    for (const comp of comps) {
      if (comp.done) continue;
      for (const f of comp.rounds[comp.r]) {
        if (f.played) continue;
        const mine = comp === ac && (f.h === uid || f.a === uid);
        if (mine && res) {
          const home = f.h === uid;
          record(comp, f, home ? res.us : res.them, home ? res.them : res.us, home ? res.ust : res.themt, home ? res.themt : res.ust);
        } else simFixture(comp, f, c.teams, rng);
        if (mine) userAfter(c, f, rng, !!res);
      }
      advance(comp);
      if (comp.done && !comp.awarded) {
        comp.awarded = true;
        if (comp === ac && comp.champion === uid) {
          c.trophies.push(`${c.year} ${comp.name}`);
          c.rep = clamp(c.rep + (comp.id === 'world' ? 25 : 12), 0, 100);
          c.credits += PAY.title;
          if (c.lastEarn) { c.lastEarn.extra += PAY.title; c.lastEarn.total += PAY.title; }
        }
      }
    }
    for (const id of new Set([c.teamId, c.wcTeamId ?? c.teamId])) {
      for (const p of c.teams[id].roster) {
        p.cond = clamp(p.cond + 9 + 4 * c.fac.med, 0, 100);
        if (p.inj > 0) p.inj = Math.max(0, p.inj - 1 - (c.fac.med >= 8 ? 1 : c.fac.med >= 4 && rng.chance(0.5) ? 1 : 0));
      }
    }
  });
}

// The Hub's CONTINUE button when the user has no fixture to play.
export function proceed(c: Career) {
  if (c.stage === 'season') {
    if (!activeComp(c).done) { finishRound(c); return; }
    let guard = 0;
    while (!(c.comps.south.done && c.comps.north.done) && guard++ < 60) finishRound(c);
    if (!isWcYear(c)) { runOffseason(c); return; }
    withRng(c, rng => buildWorld(c, rng));
    if (c.teams[c.teamId].kind === 'nation') { c.wcTeamId = c.teamId; c.stage = 'worldcup'; return; }
    const nations = Object.values(c.teams).filter(t => t.kind === 'nation').sort((a, b) => b.base - a.base);
    let offers = nations.filter(t => c.rep >= prestige(t) - 15).slice(0, 3);
    if (offers.length < 3) offers = nations.slice(-3 - offers.length).slice(0, 3 - offers.length).concat(offers).sort((a, b) => b.base - a.base);
    c.offers = offers.map(t => t.id);
    c.stage = 'wcpick';
  } else if (c.stage === 'worldcup') {
    const w = c.comps.world!;
    if (c.mode === 'cup' && w.done) return; // the tournament is over; there is no season to go back to
    if (!w.done && c.wcTeamId) { finishRound(c); return; }
    let guard = 0;
    while (!w.done && guard++ < 60) finishRound(c);
    runOffseason(c);
  }
}

export function pickWc(c: Career, id: string | null) {
  c.wcTeamId = id; c.offers = []; c.stage = 'worldcup';
  if (!id) proceed(c);
}

function youth(c: Career, t: Team, pos: string, rng: Rng): Player {
  const p = genPlayer(rng, pos, t.base - 4 - rng.int(3, 8), t.names, c.nextId++, true);
  p.pot = clamp(ovr(p) + rng.int(6, 14), 0, 99);
  if (t.kind === 'club') { p.salary = salaryFor(ovr(p)); p.years = 3; }
  return p;
}

function evolveTeam(c: Career, t: Team, rng: Rng, rep: string[] | null) {
  const user = rep !== null;
  const notes: string[] = [];
  t.roster.forEach((p, i) => {
    const before = ovr(p);
    p.age++; p.inj = 0; p.cond = 100;
    let d = p.age <= 23 ? rng.int(0, 3) : p.age <= 28 ? rng.int(-1, 1) : p.age <= 31 ? rng.int(-2, 0) : rng.int(-4, -1);
    if (user ? rng.chance(Math.min(0.55, c.fac.train * 0.07)) : rng.chance(0.2)) d++;
    const attrs: Attr[] = [...ATTRIBUTES];
    for (let k = 0; k < Math.abs(d); k++) {
      if (d > 0 && ovr(p) >= (user ? developmentCeiling(c, p) : Math.max(p.pot, before))) break;
      const a: Attr = d < 0 && rng.chance(0.5) ? 'sta' : rng.pick(attrs);
      p[a] = clamp(p[a] + (d > 0 ? 2 : -2), 25, 99);
    }
    const now = ovr(p);
    if (p.age >= 35 || (p.age >= 33 && rng.chance(0.4))) {
      const y = youth(c, t, p.pos, rng);
      t.roster[i] = y;
      notes.push(`${p.name} RETIRED. ${y.name} (${y.age}) STEPS UP`);
      return;
    }
    if (now - before >= 2) notes.push(`${p.name} IMPROVED TO ${now}`);
    if (now - before <= -2) notes.push(`${p.name} DROPPED TO ${now}`);
    if (t.kind !== 'club') return;
    p.years--;
    if (p.years > 0) return;
    const ns = salaryFor(now);
    if (!user || capUsed(t) - p.salary + ns <= CAP) {
      p.salary = ns; p.years = rng.int(2, 3);
      notes.push(`RE-SIGNED ${p.name} AT $${ns}K`);
    } else {
      const y = youth(c, t, p.pos, rng);
      t.roster[i] = y;
      notes.push(`${p.name} LEFT (SALARY CAP). ${y.name} PROMOTED`);
    }
  });
  if (rep) rep.push(...notes);
}

export function runOffseason(c: Career) {
  withRng(c, rng => {
    const team = c.teams[c.teamId];
    const comp = activeCompOf(c), other = comp === c.comps.south ? c.comps.north : c.comps.south;
    const table = standings(comp, 0), pos = table.findIndex(s => s.id === team.id) + 1;
    const rep: string[] = [`${c.year} SEASON REVIEW`, ''];
    rep.push(`${team.name} FINISHED ${ordinal(pos)} OF ${table.length}`);
    rep.push(`${comp.name}: ${c.teams[comp.champion].name}`);
    rep.push(`${other.name}: ${c.teams[other.champion].name}`);
    if (c.comps.world?.done) rep.push(`WORLD CUP OF NATIONS: ${c.teams[c.comps.world.champion].name}`);
    if (pos <= Math.ceil(table.length / 3)) c.rep = clamp(c.rep + 4, 0, 100);
    if (pos > (table.length * 2) / 3) c.rep = clamp(c.rep - 3, 0, 100);
    rep.push(`RECORD W${c.record.w} D${c.record.d} L${c.record.l}   REPUTATION ${Math.round(c.rep)}`, '');
    c.credits += PAY.season;
    rep.push(`SEASON COMPLETE: ${PAY.season} CREDITS EARNED`, '');
    (c.history ??= []).push({ year: c.year, team: team.name, comp: comp.name, w: c.record.w, d: c.record.d, l: c.record.l, pos, of: table.length, champ: comp.champion === team.id });
    for (const t of Object.values(c.teams)) evolveTeam(c, t, rng, t.id === c.teamId ? rep : null);
    const cands = rng.shuffle(Object.values(c.teams).filter(t => (c.comps.south.groups[0].includes(t.id) || c.comps.north.groups[0].includes(t.id)) && t.id !== c.teamId && c.rep >= prestige(t) - 10));
    c.offers = cands.slice(0, 3).sort((a, b) => b.base - a.base).map(t => t.id);
    c.report = rep;
    c.wcTeamId = null;
    c.stage = 'offseason';
  });
}

export function startNextYear(c: Career, newTeamId?: string) {
  withRng(c, rng => {
    if (newTeamId && c.teams[newTeamId]) { c.teamId = newTeamId; }
    c.year++; c.wcTeamId = null; c.report = []; c.offers = [];
    buildSeason(c, rng);
    refreshMarket(c, rng);
  });
}

// ---- squad management ----
export function candidates(c: Career, slot: number): Player[] {
  const pos = c.teams[c.teamId].roster[slot].pos;
  return c.market.filter(p => p.pos === pos);
}

// What it costs to sign a player, in coaching credits, on top of his salary. Better players cost more.
// Ordinary players are a couple of matches' worth; the best are most of a season's.
export const signFee = (p: Player) => Math.max(2, Math.round(Math.max(0, ovr(p) - 60) ** 1.6 / 10));

// The place a market player would take: the weakest man you have in his position.
export function slotFor(c: Career, p: Player): number {
  const r = c.teams[c.teamId].roster;
  let best = -1;
  r.forEach((q, i) => { if (q.pos === p.pos && (best < 0 || ovr(q) < ovr(r[best]))) best = i; });
  return best;
}

export function canSign(c: Career, slot: number, p: Player): boolean {
  const t = c.teams[c.teamId];
  return t.kind === 'nation' || capUsed(t) - t.roster[slot].salary + p.salary <= CAP;
}

export function sign(c: Career, slot: number, p: Player): boolean {
  const t = c.teams[c.teamId];
  if (!canSign(c, slot, p) || t.roster[slot].pos !== p.pos) return false;
  const i = c.market.indexOf(p);
  if (i < 0) return false;
  const fee = t.kind === 'club' ? signFee(p) : 0;
  if (c.credits < fee) return false;
  c.credits -= fee; p.star = true;
  c.market[i] = t.roster[slot];
  t.roster[slot] = p;
  return true;
}

export function train(c: Career, slot: number, a: Attr): boolean {
  const p = c.teams[c.teamId].roster[slot];
  if (p[a] >= 99 || ovr(p) >= developmentCeiling(c, p)) return false;
  const point = (p.points ?? 0) > 0;
  if (!point && c.credits < TRAIN_COST) return false;
  p[a]++;
  if (ovr(p) > developmentCeiling(c, p)) { p[a]--; return false; }
  if (point) p.points!--; else c.credits -= TRAIN_COST;
  return true;
}

export function upgrade(c: Career, f: 'train' | 'med'): boolean {
  const lvl = c.fac[f];
  if (lvl >= FAC_COST[f].length || c.credits < FAC_COST[f][lvl]) return false;
  c.credits -= FAC_COST[f][lvl]; c.fac[f]++;
  return true;
}
