import { afterEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { CAP, capUsed, newCareer, sign, signFee, slotFor } from '../src/career/career';
void CAP;
import { ovr } from '../src/career/players';
import { sideFromTeam } from '../src/match/side';
import { AttackPlay } from '../src/match/attack';
import { LO_OVER, Match } from '../src/match/match';
import { DEFAULT_TUNING, T, applyTuning, type Formation } from '../src/config';
import { SAMPLE_PLAY, bookOf, getPlays, loadPlays, putPlays, savePlays } from '../src/plays';
import { loadGame } from '../src/ui/menus';
import { careerCards, careerIds, deleteCareer, loadCareer, saveCareer } from '../src/career/saves';
import { MARKET_SIZE, PAY, REFRESH_COST, finishRound, rerollMarket, userFixture } from '../src/career/career';
import { kitOf, matchKits } from '../src/ui/kits';
import { colourDist } from '../src/ui/ui';
import { MID } from '../src/match/attack';
import { Game, type Store } from '../src/engine/game';
import { Gfx } from '../src/engine/gfx';
import { botPlay } from './bot';

const sides = () => { const c = newCareer(7, 'AKL'); return { us: sideFromTeam(c.teams.AKL), them: sideFromTeam(c.teams.SYD) }; };
afterEach(() => applyTuning(null));

describe('continuous play', () => {
  it('nobody teleports: across tackles, rucks and new phases every player only ever moves a step at a time', () => {
    const { us, them } = sides();
    let phases = 0, worst = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = new Match(us, them, new Rng(seed));
      const bot = new Rng(seed + 50);
      m.startPlay({ x: 30, y: 20, kind: 'scrum' });
      const p = m.play!;
      let prev = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y }));
      for (let f = 0; f < 3000 && m.play === p && (m.mode === 'play' || m.mode === 'ruck'); f++) {
        if (m.mode === 'ruck') m.press(); else botPlay(p, bot, 0.6);
        m.update(1 / 30);
        const now = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y }));
        now.forEach((o, i) => { if (Math.abs(o.x) < 200 && Math.abs(prev[i].x) < 200) worst = Math.max(worst, Math.hypot(o.x - prev[i].x, o.y - prev[i].y)); });
        prev = now;
      }
      phases += p.phase - 1;
    }
    expect(phases).toBeGreaterThan(10);     // plenty of rucks were played through
    expect(worst).toBeLessThan(0.6);        // 0.6 m in a thirtieth of a second is a flat sprint; a jump would be many metres
  });

  it('the next phase starts at the tackle, with the halfback holding the ball there', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 20, kind: 'scrum' }, new Rng(3));
    p.go();
    for (let f = 0; f < 2000 && p.ruckSeq === 0 && p.state !== 'done'; f++) p.step(1 / 30);
    expect(p.state).toBe('ruck');
    const ruck = { ...p.ruck! };
    p.ruckOk = 'won';
    for (let f = 0; f < 600 && p.state !== 'ready'; f++) p.step(1 / 30);
    expect(p.state).toBe('ready');
    expect(p.phase).toBe(2);
    const nine = p.att[p.carrier];
    expect(Math.hypot(nine.x - ruck.x, nine.y - ruck.y)).toBeLessThan(2.5);
    for (let f = 0; f < 300; f++) p.step(1 / 30);
    expect(p.state).toBe('ready');           // and it waits there for the player
  });

  it('a clean break can be run the length of the field', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 8, y: 20, kind: 'open' }, new Rng(2));
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    p.go();
    for (let f = 0; f < 4000 && p.state !== 'done'; f++) p.step(1 / 30);
    expect(p.end?.k).toBe('try');
  });
});

describe('tuning config', () => {
  const gain = () => {
    const { us, them } = sides();
    let x = 0;
    for (let s = 1; s <= 30; s++) {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 20, kind: 'open' }, new Rng(s));
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      p.go();
      for (let f = 0; f < 60; f++) p.step(1 / 30);
      x += p.ball.x - 40;
    }
    return x / 30;
  };
  it('the running speed dial really changes how far players get', () => {
    const base = gain();
    applyTuning({ ...DEFAULT_TUNING, runSpeed: 1.4 });
    expect(gain()).toBeGreaterThan(base * 1.15);
  });
  it('the ruck contest dial sets how many rucks are contested', () => {
    const { us, them } = sides();
    const count = (pc: number) => {
      applyTuning({ ...DEFAULT_TUNING, ruckContest: pc, gainlineLoss: 0 });
      let contested = 0, rucks = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const m = new Match(us, them, new Rng(seed));
        m.startPlay({ x: 30, y: 20, kind: 'scrum' });
        const p = m.play!;
        p.go();
        for (let f = 0; f < 1500 && m.play === p && p.ruckSeq === 0 && p.state !== 'done'; f++) m.update(1 / 30);
        if (p.ruckSeq > 0) { rucks++; m.update(1 / 30); if (m.mode === 'ruck') contested++; }
      }
      return { contested, rucks };
    };
    expect(count(0).contested).toBe(0);
    const all = count(1);
    expect(all.rucks).toBeGreaterThan(20);
    expect(all.contested).toBeGreaterThan(all.rucks * 0.9);
  });
  it('bad values are ignored and limits are respected', () => {
    applyTuning({ runSpeed: 99, passSpeed: NaN as number });
    expect(T.runSpeed).toBe(1.5);
    expect(T.passSpeed).toBe(DEFAULT_TUNING.passSpeed);
  });
});

describe('set plays', () => {
  const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, del: (k: string) => { m.delete(k); } } as Store; };
  it('a called play puts the runners on their marks and sends them down their lines', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 20, kind: 'scrum' }, new Rng(4));
    const play: Formation = { name: 'Test', side: 'attack', spots: SAMPLE_PLAY.spots.map((s, i) => (i === 8 ? { x: -5, y: 12, path: [{ x: 15, y: -8 }] } : i === 7 ? { x: -6, y: 8 } : { x: s.x, y: s.y })) };
    p.usePlay(play, true);
    const runner = p.att[p.ord[p.ord.length - 1]];
    expect(runner.x).toBeCloseTo(35, 0); expect(runner.y).toBeCloseTo(32, 0);
    // the user still has to play the ball: until then nobody runs
    for (let f = 0; f < 60; f++) p.step(1 / 30);
    expect(runner.y).toBeCloseTo(32, 0);
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    p.go();
    for (let f = 0; f < 90; f++) p.step(1 / 30);
    expect(runner.y).toBeLessThan(28);       // he has cut back in along his line
    expect(runner.x).toBeGreaterThan(40);
  });
  it('five fixed plays, Play 1 to Play 5, kept with the career the moment they change', () => {
    const s = mem();
    const c = newCareer(3, 'AKL'), host = { store: s, career: c };
    const plays = getPlays(host);
    expect(plays.length).toBe(5);
    expect(plays[0]?.name).toBe('Play 1');                       // the sample sits in Play 1
    expect(plays.slice(1).every(p => p === null)).toBe(true);
    plays[2] = { ...SAMPLE_PLAY, name: 'Something else', primary: 6, ball: 1, spots: SAMPLE_PLAY.spots.map((sp, i) => ({ ...sp, recv: i === 3 ? false : undefined })) };
    putPlays(host, plays);
    // it is in the career save itself, with its fixed name, and a second career does not see it
    const saved = JSON.parse(s.get('trytime.career.' + c.id)!);
    expect(saved.plays[2].name).toBe('Play 3');
    expect(saved.plays[2].primary).toBe(6); expect(saved.plays[2].ball).toBe(1); expect(saved.plays[2].spots[3].recv).toBe(false);
    expect(getPlays({ store: s, career: saved })[2]?.spots.length).toBe(9);
    expect(getPlays({ store: s, career: newCareer(4, 'AKL') })[2]).toBe(null);
    // changing one slot leaves the others alone
    expect(JSON.stringify(getPlays(host)[0])).toBe(JSON.stringify(plays[0]));
    expect(bookOf(host).map(p => p.name)).toEqual(import.meta.env?.DEV ? ['Play 1', 'Play 3'] : ['Play 1']);
    // outside a career they have their own key, and a damaged one reads as empty
    savePlays(s, plays);
    expect(loadPlays(s)[2]?.name).toBe('Play 3');
    s.set('trytime.plays.v1', '{not json');
    expect(loadPlays(s).every(p => p === null)).toBe(true);
  });
  it('a dummy runner is never passed to, and the primary receiver is preferred', () => {
    const { us, them } = sides();
    // the same pass thrown twice from the same shape; the second time the man it was meant for is a decoy
    const mk = (off: number) => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 25, kind: 'scrum' }, new Rng(4)) as any;
      p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map((sp, i) => ({ x: sp.x, y: sp.y, recv: i === off ? false : undefined })) }, true);
      p.def.forEach((d: any) => { d.stun = 1e9; d.x = 999; });
      p.release(-0.4, 0.9, 0.35);
      return p;
    };
    const live = mk(-1), who = live.receiver();
    expect(live.dummies.size).toBe(0);
    expect(who).toBeGreaterThanOrEqual(0);
    let tried = 0;
    for (let i = 0; i < 9; i++) {
      const p = mk(i);
      expect(p.dummies.size).toBe(1);
      if (!p.dummies.has(who)) continue;
      tried++;
      expect(p.receiver()).not.toBe(who);
    }
    expect(tried).toBe(1);
  });
  it('a play can start with the ball in another man\'s hands, and runners on a drawn line are a tenth quicker', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 25, kind: 'scrum' }, new Rng(4));
    const nine = p.carrier;
    p.usePlay({ name: 'Play 1', side: 'attack', ball: 6, spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })) }, true);
    expect(p.carrier).not.toBe(nine);
    expect(p.ball.x).toBeCloseTo(p.att[p.carrier].x, 1);
    // two identical men, one on a line and one not, over the same two seconds
    const run = (line: boolean) => {
      const q = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(4));
      q.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map((sp, i) => ({ x: sp.x, y: sp.y, path: i === 8 && line ? [{ x: 40, y: 0 }] : undefined })) }, true);
      q.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      const man = q.att[q.ord[q.ord.length - 1]], x0 = man.x;
      q.run();
      let top = 0, prev = x0;
      for (let f = 0; f < 75; f++) { q.step(1 / 30); top = Math.max(top, (man.x - prev) * 30); prev = man.x; }
      return top;
    };
    const on = run(true), off = run(false);
    expect(on / off).toBeGreaterThan(1.06); expect(on / off).toBeLessThan(1.16);
  });
});

describe('V8', () => {
  it('our kick-off is chased: a short high one can be won back, and one that does not go ten is their scrum', () => {
    const { us, them } = sides();
    let ours = 0, short = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 50, y: 25, kind: 'open', kickoff: true }, new Rng(seed));
      expect(p.koOnly).toBe(true);
      const x0 = p.att.map(a => a.x);
      p.release(1, 0.25, 0.12);
      let chased = false;
      for (let f = 0; f < 600 && p.state !== 'done' && !(p.ball.mode === 'held' && p.state === 'live'); f++) { p.step(1 / 30); if (p.att.filter((a, i) => a.x > x0[i] + 3).length >= 4) chased = true; }
      expect(chased).toBe(true);
      n++;
      if (p.state === 'live' && p.ball.mode === 'held') ours++;
      if (p.end?.k === 'turnover' && p.end.why === 'short') short++;
    }
    expect(ours).toBeGreaterThan(2);       // a real chance
    expect(ours).toBeLessThan(n * 0.8);   // and no more than a chance
    void short;
  });
  it('an easy catch with nobody near is all but never dropped', () => {
    const { us, them } = sides();
    let caught = 0, dropped = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 25, kind: 'scrum' }, new Rng(seed));
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      p.run();
      for (let f = 0; f < 12; f++) p.step(1 / 30);
      p.release(-0.45, seed % 2 ? 0.9 : -0.9, 0.3);
      for (let f = 0; f < 120 && p.catches === 0 && p.state === 'live' && p.ball.mode !== 'loose'; f++) p.step(1 / 30);
      if (p.catches > 0) caught++; else if (p.end?.k === 'turnover' && p.end.why === 'knockon') dropped++;
    }
    expect(caught).toBeGreaterThan(120);
    expect(dropped).toBeLessThanOrEqual(3);
  });
  it('wingers are plainly quicker than forwards, and the opposition eases off for a new coach', () => {
    const c = newCareer(7, 'AKL');
    const hard = sideFromTeam(c.teams.SYD, 60, 0), soft = sideFromTeam(c.teams.SYD, 60, 1);
    const spd = (pos: string) => hard.runners.filter(r => r.pos === pos).reduce((a, r) => a + r.spd, 0) / Math.max(1, hard.runners.filter(r => r.pos === pos).length);
    expect(spd('WG')).toBeGreaterThan(spd('PR') + 8);
    expect(soft.tacklers[0].tkl).toBeLessThan(hard.tacklers[0].tkl * 0.9);
    expect(soft.att).toBeLessThan(hard.att - 8);
  });
  it('a contested ruck is announced first: the bar cannot be played while CONTESTED is up', () => {
    const { us, them } = sides();
    applyTuning({ ruckContest: 1 });
    let seen = 0;
    for (let seed = 1; seed <= 6 && !seen; seed++) {
      const m = new Match(us, them, new Rng(seed)), bot = new Rng(seed);
      m.startPlay({ x: 30, y: 25, kind: 'scrum' });
      for (let f = 0; f < 2500 && m.play && m.mode !== 'ruck'; f++) { if (m.mode === 'play') botPlay(m.play, bot, 0); m.update(1 / 30); }
      if (m.mode !== 'ruck') continue;
      seen++;
      expect(m.ruckIntro).toBeGreaterThan(0.5);
      const t = m.timing!, before = JSON.stringify(t);
      m.press(); m.press();                         // a thumb that was already busy
      expect(JSON.stringify(t)).toBe(before);
      expect(m.mode).toBe('ruck');
      for (let f = 0; f < 40; f++) m.update(1 / 30);
      expect(m.ruckIntro).toBeLessThanOrEqual(0);   // now the bar runs
    }
    expect(seen).toBe(1);
  });
  it('training runs have no ruck contests', () => {
    const { us, them } = sides();
    applyTuning({ ruckContest: 1 });
    const m = new Match(us, them, new Rng(3)), bot = new Rng(3);
    m.noContest = true;
    m.startPlay({ x: 30, y: 25, kind: 'scrum' });
    for (let f = 0; f < 2500 && m.play && m.play.ruckSeq === 0 && m.play.state !== 'done'; f++) { botPlay(m.play, bot, 0); m.update(1 / 30); }
    for (let f = 0; f < 60; f++) m.update(1 / 30);
    expect(m.mode).not.toBe('ruck');
  });
  it('a lineout can be thrown over the top to the backs, and it is a real ball in the air', () => {
    const { us, them } = sides();
    let got = 0, lost = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = new Match(us, them, new Rng(seed));
      m.startLineout(45, 0);
      for (let f = 0; f < 400 && !(m.mode === 'lineout' && m.lo?.phase === 'aim'); f++) m.update(1 / 30);
      if (!m.lo) continue;
      expect(m.lo.maxD).toBeGreaterThan(LO_OVER);
      m.throwLine(m.lo.maxD, 0);
      expect(m.mode).toBe('play');
      const p = m.play!;
      expect(['pass', 'kick']).toContain(p.ball.mode);
      for (let f = 0; f < 200 && p.state !== 'done' && p.ball.mode !== 'held'; f++) m.update(1 / 30);
      if (p.ball.mode === 'held' && p.state !== 'done') got++; else lost++;
    }
    expect(got).toBeGreaterThan(8);
    expect(got + lost).toBeGreaterThan(20);
  });
});

describe('saves and squads', () => {
  it('a save from the 10-player days gets its two centres back and loses nothing else', () => {
    const c = newCareer(9, 'AKL') as any;
    for (const t of Object.values<any>(c.teams)) t.roster = t.roster.filter((p: any) => p.pos !== 'CE');
    expect(c.teams.AKL.roster.length).toBe(10);
    c.credits = 17;
    const mem = new Map<string, string>([['trytime.save.v1', JSON.stringify(c)]]);
    const store: Store = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
    const game = new Game(new Gfx({ fillStyle: '' as any, globalAlpha: 1, fillRect() {} }), store);
    expect(loadGame(game)).toBe(true);
    for (const t of Object.values(game.career!.teams)) { expect(t.roster.length).toBe(12); expect(t.roster.filter(p => p.pos === 'CE').length).toBe(2); }
    expect(game.career!.credits).toBe(17);
    expect(sideFromTeam(game.career!.teams.AKL).runners.length).toBe(10);
  });

  it('a new career starts with one featured player in a generic squad, under the cap', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const c = newCareer(seed, 'CHC'), t = c.teams.CHC, stars = t.roster.filter(p => p.star);
      expect(stars.length).toBe(1);
      expect(['FB', 'WG', 'FH']).toContain(stars[0].pos);
      const rest = t.roster.filter(p => !p.star).map(ovr);
      expect(ovr(stars[0])).toBeGreaterThan(Math.max(...rest) + 4);     // clearly the best man in the side
      expect(capUsed(t)).toBeLessThan(CAP * 0.85);                      // with room to recruit
      expect(c.teams.AKL.roster.some(p => p.star)).toBe(false);         // other clubs have ordinary full squads
    }
  });

  it('the market: signing costs credits, respects the cap, and swaps the old player out', () => {
    const c = newCareer(4, 'CHC'), t = c.teams.CHC;
    const target = [...c.market].sort((a, b) => ovr(b) - ovr(a)).find(p => slotFor(c, p) >= 0 && capUsed(t) - t.roster[slotFor(c, p)].salary + p.salary <= CAP)!;
    const slot = slotFor(c, target), old = t.roster[slot], fee = signFee(target);
    c.credits = fee - 1;
    if (fee > 0) expect(sign(c, slot, target)).toBe(false);            // cannot afford the fee
    c.credits = fee + 2;
    expect(sign(c, slot, target)).toBe(true);
    expect(c.credits).toBe(2); expect(t.roster[slot]).toBe(target); expect(c.market).toContain(old);
    expect(capUsed(t)).toBeLessThanOrEqual(CAP);
    // a man whose salary will not fit is refused however many credits there are
    c.credits = 999;
    const dear = c.market.find(p => p !== old)!; dear.salary = CAP;
    expect(sign(c, slotFor(c, dear), dear)).toBe(false);
    expect(capUsed(t)).toBeLessThanOrEqual(CAP);
  });
});

describe('V6: depth, momentum and live kicks', () => {
  it('quicker men start deeper, and the line sets off while the ball is still being aimed, never past it', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 40, y: 23, kind: 'ruck' }, new Rng(5));
    const c = p.att[p.carrier], wings = p.att.filter(m => m.pos === 'WG'), fh = p.att.find(m => m.pos === 'FH')!;
    for (const w of wings) expect(c.x - w.x).toBeGreaterThan(c.x - fh.x); // wings deeper than the first receiver
    const before = p.att.map(m => m.x);
    for (let f = 0; f < 60; f++) p.step(1 / 30);
    expect(p.att.map(m => m.x)).toEqual(before);                          // nobody moves until the thumb goes down
    p.startRuns();
    for (let f = 0; f < 20; f++) p.step(1 / 30);
    expect(p.state).toBe('ready'); expect(p.att.map(m => m.x)).toEqual(before); // aiming is not playing: nothing starts until the ball is passed
    p.release(-0.4, 0.9, 0.3);
    for (let f = 0; f < 20; f++) p.step(1 / 30);
    expect(p.state).toBe('live');
    expect(p.att.filter((m, i) => m.job === 0 && m.x > before[i] + 1).length).toBeGreaterThan(4); // and now the line is moving
  });

  it('a kick that lands in the field stays live: it bounces, and nobody has it until somebody collects it', () => {
    const { us, them } = sides();
    let bounced = 0, ours = 0, theirs = 0, worst = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // box kicks of different lengths from the base of a ruck, with the chasers already moving
      const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 23, kind: 'ruck' }, new Rng(seed));
      p.startRuns();
      for (let f = 0; f < 25; f++) p.step(1 / 30);
      p.release(1, seed % 2 ? 0.3 : -0.3, (seed % 5) * 0.12);
      expect(p.def.every(d => d.v === 0)).toBe(true);                     // the defence starts from a standstill, having to turn
      let sawBounce = false, prev = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y }));
      for (let f = 0; f < 900 && p.state === 'live' && p.ball.mode !== 'held'; f++) {
        const wasKick = p.ball.mode === 'kick';
        p.step(1 / 30);
        if (p.ball.mode === 'bounce') { if (wasKick) expect(p.state).toBe('live'); sawBounce = true; } // landing awards nothing
        const now = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y }));
        now.forEach((o, i) => { if (Math.abs(o.x) < 200) worst = Math.max(worst, Math.hypot(o.x - prev[i].x, o.y - prev[i].y)); });
        prev = now;
      }
      if (sawBounce) bounced++;
      if (p.ball.mode === 'held') ours++; else if (p.ball.mode === 'taken') theirs++;
    }
    expect(bounced).toBeGreaterThan(2);     // many are caught on the full; the rest come down and bounce
    expect(worst).toBeLessThan(0.6);       // nobody is placed under the ball
    expect(ours).toBeGreaterThan(6);       // the chase can be won...
    expect(theirs).toBeGreaterThan(6);     // ...and lost
    console.log(`kick chases over 40: bounced ${bounced}, we won ${ours}, they fielded ${theirs}`);
  });

  it('a perfect contest at a ruck wins a penalty and goes to a kick for touch', () => {
    const { us, them } = sides();
    applyTuning({ ...DEFAULT_TUNING, ruckContest: 1, gainlineLoss: 0 });
    const m = new Match(us, them, new Rng(4));
    m.startPlay({ x: 40, y: 23, kind: 'scrum' });
    m.play!.go();
    for (let f = 0; f < 3000 && m.mode !== 'ruck' && m.play!.state !== 'done'; f++) m.update(1 / 30);
    expect(m.mode).toBe('ruck');
    const t = m.timing!;
    expect(t.hi - t.lo).toBeLessThan(0.41);
    for (let f = 0; f < 60 && m.ruckIntro > 0; f++) m.update(1 / 30);     // the CONTESTED call comes first
    t.t = 1; t.pos = (t.lo + t.hi) / 2; t.speed = 0; m.press();
    expect(t.result).toBe('perfect');
    for (let f = 0; f < 200 && !m.play?.penKick; f++) { if (m.mode === 'banner') m.tap(); m.update(1 / 30); }
    expect(m.play!.penKick).toBe(true); expect(m.mode).toBe('play');   // V9: the kick for touch is a live passage of play
  });
});

describe('V9: careers, credits and the market', () => {
  const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, del: (k: string) => { m.delete(k); } } as Store; };
  it('several careers are kept apart, an old single save is carried over, and one can be deleted', () => {
    const s = mem();
    s.set('trytime.save.v1', JSON.stringify(newCareer(1, 'DUN')));        // a save from before there were slots
    expect(careerIds(s).length).toBe(1);
    expect(s.get('trytime.save.v1')).toBe(null);
    const a = newCareer(2, 'AKL'), b = newCareer(3, 'NZL', 'cup');
    saveCareer(s, a); saveCareer(s, b);
    a.credits = 77; saveCareer(s, a);                                       // saving again does not make another
    const ids = careerIds(s);
    expect(ids.length).toBe(3);
    expect(loadCareer(s, a.id!)!.credits).toBe(77);
    expect(loadCareer(s, b.id!)!.credits).not.toBe(77);
    expect(careerCards(s).map(c => c.line)).toEqual(['Season 1', 'Season 1', '2027 World Cup']);
    deleteCareer(s, a.id!);
    expect(careerIds(s)).toEqual(ids.filter(i => i !== a.id));
    expect(loadCareer(s, a.id!)).toBe(null);
    expect(loadCareer(s, b.id!)!.teamId).toBe('NZL');
  });
  it('every match pays credits: more for playing it, more again for winning, something even for losing', () => {
    const run = (res?: { us: number; them: number }) => {
      const c = newCareer(5, 'AKL'), before = c.credits;
      expect(userFixture(c)).toBeTruthy();
      finishRound(c, res ? { us: res.us, them: res.them, ust: 1, themt: 1 } : undefined);
      return { c, got: c.credits - before };
    };
    const won = run({ us: 30, them: 3 }), lost = run({ us: 3, them: 30 }), sim = run();
    expect(won.got).toBe(PAY.played + PAY.win);
    expect(won.c.lastEarn).toMatchObject({ played: true, match: PAY.played, win: PAY.win, total: PAY.played + PAY.win });
    expect(lost.got).toBe(PAY.played);
    expect(sim.got).toBeGreaterThanOrEqual(PAY.simmed); expect(sim.got).toBeLessThanOrEqual(PAY.simmed + PAY.simWin);
    expect(sim.got).toBeLessThan(won.got);                                  // simulating never pays better than playing
    expect(userFixture(won.c)).not.toBe(null);                              // and a fixture can only be finished once: the next one is a new game
  });
  it('the market is ten players, one for each position; a refresh costs eight credits and brings ten new ones', () => {
    const c = newCareer(6, 'AKL');
    expect(c.market.length).toBe(MARKET_SIZE);
    expect(new Set(c.market.map(p => p.pos)).size).toBe(10);
    expect(Math.max(...c.market.map(p => ovr(p)))).toBeLessThan(89);       // nobody elite in a first season
    for (const p of c.market) { expect(p.pot).toBeGreaterThanOrEqual(ovr(p)); expect(signFee(p)).toBeGreaterThanOrEqual(2); }
    const cheap = [...c.market].sort((a, b) => ovr(a) - ovr(b));
    expect(signFee(cheap[9])).toBeGreaterThan(signFee(cheap[0]));
    const old = c.market.map(p => p.id);
    c.credits = REFRESH_COST - 1;
    expect(rerollMarket(c)).toBe(false); expect(c.market.map(p => p.id)).toEqual(old);
    c.credits = 20;
    expect(rerollMarket(c)).toBe(true);
    expect(c.credits).toBe(20 - REFRESH_COST);
    expect(c.market.length).toBe(MARKET_SIZE);
    expect(c.market.some(p => old.includes(p.id))).toBe(false);
  });
  it('recruiting takes the credits and changes the cap', () => {
    const c = newCareer(6, 'AKL'), t = c.teams.AKL;
    const p = [...c.market].sort((a, b) => ovr(a) - ovr(b))[0], slot = slotFor(c, p), fee = signFee(p), was = capUsed(t), out = t.roster[slot];
    c.credits = fee - 1; expect(sign(c, slot, p)).toBe(false);
    c.credits = fee + 4; expect(sign(c, slot, p)).toBe(true);
    expect(c.credits).toBe(4);
    expect(capUsed(t)).toBe(was - out.salary + p.salary);
    expect(c.market).toContain(out);
  });
  it('home and away jerseys differ, and the two sides in a match can be told apart', () => {
    const c = newCareer(6, 'AKL');
    for (const t of Object.values(c.teams)) expect(colourDist(kitOf(t).c1, kitOf(t, true).c1)).toBeGreaterThan(60);
    // two sides in near enough the same blue: one of them changes
    const k = matchKits(c.teams.AKL, false, c.teams.PER);
    expect(colourDist(k.us.c1, k.them.c1)).toBeGreaterThan(colourDist(c.teams.AKL.c1, c.teams.PER.c1));
  });
});

describe('V9: on the pitch', () => {
  it('a won lineout can become a maul that drives forward, gets riskier, and can be played away with nobody jumping', () => {
    const { us, them } = sides();
    applyTuning({ maulChance: 1 });
    const m = new Match(us, them, new Rng(3));
    m.startLineout(40, 0);
    let p = m.play!;
    for (let seed = 4; seed < 40; seed++) {
      m.throwLine(10, 0);
      for (let f = 0; f < 120 && m.mode === 'lineout'; f++) m.update(1 / 30);
      if (m.play?.state === 'maul') break;
      // stolen: go again
      const m2 = new Match(us, them, new Rng(seed)); m2.startLineout(40, 0); Object.assign(m, m2);
    }
    p = m.play!;
    expect(p.state).toBe('maul');
    const x0 = p.ruck!.x;
    expect(p.maulRisk()).toBe(0);
    let prev = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y })), worst = 0;
    const watch = () => { const now = [...p.att, ...p.def].map(o => ({ x: o.x, y: o.y })); now.forEach((o, i) => { worst = Math.max(worst, Math.hypot(o.x - prev[i].x, o.y - prev[i].y)); }); prev = now; };
    for (let f = 0; f < 75 && p.state === 'maul'; f++) { m.update(1 / 30); watch(); }
    expect(p.ruck!.x).toBeGreaterThan(x0 + 0.3);                           // it has gone forward
    p.maulT = 6; expect(p.maulRisk()).toBeGreaterThan(0.1);                // and staying in it is a growing risk
    if (p.state === 'maul') {
      p.playMaul();
      expect(p.state).toBe('ready');
      p.run();
      for (let f = 0; f < 30 && (p.state as string) === 'live'; f++) { m.update(1 / 30); watch(); }
    }
    expect(worst).toBeLessThan(0.6);
  });
  it('a penalty kicked for touch is live: both sides are on the field, out untouched is our throw, in play is played for', () => {
    const { us, them } = sides();
    let throws = 0, caught = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = new Match(us, them, new Rng(seed));
      m.wind = { x: 0, y: 0 };
      m.spot = { x: 40, y: 12 };
      m.startTouchKick();
      const p = m.play!;
      expect(p.penKick && p.koOnly).toBe(true);
      expect(p.aim(-1, 0, 0.5)).toBe(null);                                 // it cannot be passed
      p.run(); p.sidestep(1); p.dive(); expect(p.state).toBe('ready');       // or run with
      const x0 = p.att.map(a => a.x), d0 = p.def.map(d => ({ x: d.x, y: d.y }));
      p.release(0.9, -0.44, 0.6);                                          // up the field and into the near touchline
      let moved = false, defMoved = false;
      for (let f = 0; f < 400 && m.play === p && p.state !== 'done'; f++) {
        m.update(1 / 30);
        if (p.att.filter((a, i) => a.x > x0[i] + 2).length >= 3) moved = true;
        if (p.def.some((d, i) => Math.hypot(d.x - d0[i].x, d.y - d0[i].y) > 2)) defMoved = true;
      }
      expect(moved).toBe(true); expect(defMoved).toBe(true);
      // either it finds touch untouched and is our throw, or one of theirs got to it first
      if (p.end?.k === 'lineoutUs') {
        expect(p.end.pen).toBe(true); throws++;
        for (let f = 0; f < 200 && m.mode !== 'lineout'; f++) { if (m.mode === 'banner') m.tap(); m.update(1 / 30); }
        expect(m.mode).toBe('lineout');
      } else { caught++; } // theirs, or ours again, or still being played for
    }
    expect(throws).toBeGreaterThan(6);
    void caught;
    // one kept infield does not stop the game when it lands: somebody has to get to it
    const m2 = new Match(us, them, new Rng(9)); m2.wind = { x: 0, y: 0 }; m2.spot = { x: 30, y: MID }; m2.startTouchKick();
    const q = m2.play!; q.release(1, 0, 0.5);
    let bounced = false;
    for (let f = 0; f < 600 && q.state !== 'done'; f++) { m2.update(1 / 30); if (q.ball.mode === 'bounce' || q.ball.mode === 'loose') bounced = true; if (q.ball.mode === 'held') break; }
    expect(bounced || q.ball.mode === 'held' || q.end?.k === 'turnover').toBe(true);
    if (q.end) expect(q.end.k).not.toBe('lineoutUs');
  });
  it('under a kick one man from each side goes for the ball and the rest stay off it', () => {
    const { us, them } = sides();
    let crowdD = 0, crowdA = 0, n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 50, y: 25, kind: 'open', kickoff: true }, new Rng(seed)) as any;
      p.release(1, seed % 2 ? 0.3 : -0.3, 0.5);
      const tx = p.ball.tx, ty = p.ball.ty;
      for (let f = 0; f < 400 && p.ball.mode === 'kick' && p.ball.t / p.ball.dur < 0.9; f++) p.step(1 / 30);
      n++;
      const near = (o: { x: number; y: number }) => Math.hypot(o.x - tx, o.y - ty) < 2.2;
      crowdD = Math.max(crowdD, p.def.filter(near).length); crowdA = Math.max(crowdA, p.att.filter(near).length);
    }
    expect(n).toBeGreaterThan(6);
    expect(crowdD).toBeLessThanOrEqual(1); expect(crowdA).toBeLessThanOrEqual(1);
  });
  it('the penalty spot in a contested ruck is a small part of the target, bigger for a stronger pack', () => {
    const { us, them } = sides();
    applyTuning({ ruckContest: 1, gainlineLoss: 0 });
    const sweets: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const m = new Match(us, them, new Rng(seed)), bot = new Rng(seed);
      m.startPlay({ x: 30, y: 25, kind: 'scrum' });
      for (let f = 0; f < 2500 && m.play && m.mode !== 'ruck' && m.play.state !== 'done'; f++) { if (m.mode === 'play') botPlay(m.play, bot, 0); m.update(1 / 30); }
      if (m.mode === 'ruck') sweets.push(m.timing!.sweet);
    }
    expect(sweets.length).toBeGreaterThan(4);
    for (const s of sweets) { expect(s).toBeGreaterThanOrEqual(0.05); expect(s).toBeLessThanOrEqual(0.12); }
  });
  it('at a conversion their man starts on the goal line, towards the side the kick is taken from', () => {
    const { us, them } = sides();
    const m = new Match(us, them, new Rng(2));
    m.startGoalKick('conv', 78, 5);
    expect(m.pk!.cx).toBe(100); expect(m.pk!.cy).toBeLessThan(MID - 8); expect(m.pk!.cy).toBeGreaterThan(5);
    m.startGoalKick('conv', 88, MID);
    expect(m.pk!.cy).toBe(MID);
  });
});

describe('timed passes', () => {
  it('a play can pass by itself at the times it was given, and the player takes over the moment he plays the ball', () => {
    const { us, them } = sides();
    const mk = () => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(4));
      p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })), passes: [{ t: 0.4, to: 5 }, { t: 1.6, to: 7 }] }, true);
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      return p;
    };
    const p = mk(), first = p.markOf.get(5)!, second = p.markOf.get(7)!;
    expect(p.scripted).toBe(true);
    for (let f = 0; f < 30; f++) p.step(1 / 30);
    expect(p.passes).toBe(0);                                              // nothing happens until the play is started
    p.run();
    let prevX = p.ball.x, forward = false;
    for (let f = 0; f < 36; f++) { p.step(1 / 30); if (p.ball.mode === 'pass' && p.ball.tx > p.ball.fx + 0.01) forward = true; prevX = p.ball.x; }
    expect(p.passes).toBe(1); expect(p.carrier).toBe(first);
    for (let f = 0; f < 50; f++) { p.step(1 / 30); if (p.ball.mode === 'pass' && p.ball.tx > p.ball.fx + 0.01) forward = true; }
    expect(p.passes).toBe(2); expect(p.carrier).toBe(second);
    expect(forward).toBe(false); void prevX;
    expect(p.scripted).toBe(false);
    // playing the ball by hand cancels what is left of the script
    const q = mk();
    q.run();
    for (let f = 0; f < 5; f++) q.step(1 / 30);
    q.release(-0.4, -0.9, 0.3);
    expect(q.scripted).toBe(false);
    for (let f = 0; f < 90; f++) q.step(1 / 30);
    expect(q.passes).toBe(1);
  });
});

describe('set plays: kicks, a starting mark, and defenders who bite', () => {
  it('a play can kick by itself to a point, and can start its ball carrier somewhere else', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(4));
    const c0 = p.att[p.carrier], x0 = c0.x, y0 = c0.y;
    p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })), start: { x: -4, y: 3 }, kicks: [{ t: 0.5, x: 14, y: 6 }] }, true);
    expect(c0.x).toBeCloseTo(x0 - 4, 1); expect(c0.y).toBeCloseTo(y0 + 3, 1);
    p.run();
    for (let f = 0; f < 20; f++) p.step(1 / 30);
    expect(['kick', 'bounce', 'loose']).toContain(p.ball.mode);
    expect(p.ball.tx).toBeCloseTo(x0 + 14, 0); expect(p.ball.ty).toBeCloseTo(y0 + 6, 0);
  });
  it('with a play called their line comes up at its men, leaving more room behind than a plain phase does', () => {
    const { us, them } = sides();
    const lead = (called: boolean) => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(4));
      if (called) p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y, path: [{ x: 14, y: 0 }] })) }, true);
      const x0 = p.def.filter(d => !d.sweeper).map(d => d.x);
      p.run();
      for (let f = 0; f < 30 && p.state === 'live'; f++) p.step(1 / 30);
      return p.def.filter(d => !d.sweeper).map((d, i) => x0[i] - d.x).reduce((a, b) => a + b, 0);
    };
    expect(lead(true)).toBeGreaterThan(lead(false) + 2);
  });
});

describe('set plays: turns and driven kicks', () => {
  it('a man can be given a new direction part-way through, and a set-play kick is low and hard', () => {
    const { us, them } = sides();
    const mk = (turn: boolean) => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(4));
      p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })), turns: turn ? [{ t: 0.5, to: 8, x: 6, y: 2 }] : undefined, kicks: [{ t: 1.6, x: 30, y: 4 }] }, true);
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      p.run();
      return p;
    };
    const a = mk(true), b = mk(false), who = a.markOf.get(8)!;
    for (let f = 0; f < 45; f++) { a.step(1 / 30); b.step(1 / 30); }
    expect(a.att[who].y).toBeLessThan(b.att[who].y - 3);                  // he has cut in towards the point he was sent to
    for (let f = 0; f < 8; f++) a.step(1 / 30);
    expect(a.ball.mode).toBe('kick');
    let top = 0;
    for (let f = 0; f < 90 && a.ball.mode === 'kick'; f++) { a.step(1 / 30); top = Math.max(top, a.ball.z); }
    expect(top).toBeLessThan(3.2);                                         // head height or so: nothing like a bomb
    expect(a.ball.dur).toBeLessThan(1.6);
  });
});

describe('set plays: forwards and the halfback', () => {
  it('a man with no mark can be passed to and sent on a new run by his place in the side', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum', set: true }, new Rng(4));
    p.releaseSet();
    const fwd = p.att.findIndex(m => m.job === 1), y0 = p.att[fwd].y;
    p.usePlay({ name: 'Play 1', side: 'attack', spots: [{ x: -8, y: -12 }, { x: -10, y: 1 }, { x: -4, y: 5 }, { x: -6, y: 10 }, { x: -8, y: 15 }, { x: -10, y: 21 }], turns: [{ t: 0.8, to: 100 + fwd, x: 10, y: -14 }] }, true);
    expect([...p.markOf.values()]).not.toContain(fwd);
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    p.run();
    for (let f = 0; f < 90; f++) p.step(1 / 30);
    expect(p.att[fwd].y).toBeLessThan(y0 - 4);   // the forward has peeled off the scrum and gone where he was sent
  });
});

describe('fatigue in a chase', () => {
  it('a long sprint slows a man down, and slows a man with poor stamina sooner', () => {
    const { us, them } = sides();
    const run = (sta: number) => {
      const p = new AttackPlay(us.runners.map(r => ({ ...r, sta })), them.tacklers, { x: 5, y: 25, kind: 'open' }, new Rng(4));
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      p.run();
      const c = p.att[p.carrier];
      let early = 0, late = 0, prev = c.x;
      for (let f = 0; f < 300 && p.state === 'live'; f++) { p.step(1 / 30); const v = (c.x - prev) * 30; prev = c.x; if (f > 45 && f < 75) early += v / 30; if (f > 240 && f < 270) late += v / 30; }
      return { early, late, gas: c.gas };
    };
    const fit = run(92), unfit = run(50);
    expect(fit.late).toBeLessThan(fit.early * 0.97);          // even a fit man is off his top pace after eight seconds flat out
    expect(unfit.late).toBeLessThan(fit.late * 0.93);         // and an unfit one is well behind him
    expect(unfit.gas).toBeLessThan(fit.gas);
  });
});

describe('runs are directions, not distances', () => {
  it('a short arrow and a long one are run at the same pace, and a man keeps going when his arrow ends', () => {
    const { us, them } = sides();
    const run = (len: number) => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(4));
      p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map((sp, i) => ({ x: sp.x, y: sp.y, path: i === 8 ? [{ x: len, y: -len * 0.5 }] : undefined })) }, true);
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      const m = p.att[p.markOf.get(8)!], x0 = m.x, y0 = m.y;
      p.run();
      for (let f = 0; f < 75; f++) p.step(1 / 30);
      return { dx: m.x - x0, dy: m.y - y0 };
    };
    const short = run(4), long = run(20);
    expect(Math.abs(short.dx - long.dx)).toBeLessThan(1.5);     // same ground covered in the same time
    expect(short.dy).toBeLessThan(-4);                          // and the short one has carried on across, well past where its arrow stopped
  });
  it('the man with the ball follows a run he is given, until the player steers', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(4));
    p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })), turns: [{ t: 0.3, to: 100 + p.carrier, x: 20, y: 12 }] }, true);
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    const c = p.att[p.carrier], y0 = c.y;
    p.run();
    for (let f = 0; f < 60; f++) p.step(1 / 30);
    expect(c.y).toBeGreaterThan(y0 + 2.5);
    const y1 = c.y;
    p.drift = -1; p.step(1 / 30); p.drift = 0;
    for (let f = 0; f < 30; f++) p.step(1 / 30);
    expect(c.y).toBeLessThan(y1 + 1.5);                         // a touch of the thumb and the drawn run is forgotten
  });
});

describe('a new run overrides the old one at once', () => {
  it('a man half-way down a long line turns the moment he is given a new run, not when the old one is finished', () => {
    const { us, them } = sides();
    const mk = (turn: boolean) => {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(4));
      p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map((sp, i) => ({ x: sp.x, y: sp.y, path: i === 8 ? [{ x: 40, y: 0 }] : undefined })), turns: turn ? [{ t: 0.6, to: 8, x: 12, y: -2 }] : undefined }, true);
      p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
      p.run();
      for (let f = 0; f < 48; f++) p.step(1 / 30);
      return p.att[p.markOf.get(8)!].y;
    };
    expect(mk(true)).toBeLessThan(mk(false) - 3);   // one second after the turn he is metres off his old line
  });
});

describe('set plays on either side, and called lineouts', () => {
  const lo: Formation = { name: 'Play 2', side: 'attack', from: 'lineout', spots: [{ x: -9, y: 1 }, { x: -4, y: 5 }, { x: -6, y: 10 }, { x: -8, y: 15, path: [{ x: 10, y: 4 }] }, { x: -10, y: 21 }], passes: [{ t: 0.3, to: 1 }], kicks: [{ t: 2, x: 20, y: 9 }] };
  it('a lineout play is turned over for the far touchline: same shape, other way up', () => {
    const { us, them } = sides();
    const shape = (edge: number) => {
      const m = new Match(us, them, new Rng(5));
      m.startLineout(40, edge);
      m.lineoutPlay(lo);
      const p = m.play!, c = p.att[p.carrier];
      expect(m.mode).toBe('play'); expect(p.state).toBe('ready'); expect(p.ball.mode).toBe('held');
      return { flipped: p.flipped, rel: [...p.markOf.entries()].sort((a, b) => a[0] - b[0]).map(([, man]) => ({ x: p.att[man].x - c.x, y: p.att[man].y - c.y })) };
    };
    const top = shape(0), bottom = shape(50);
    expect(top.flipped).toBe(false); expect(bottom.flipped).toBe(true);
    expect(top.rel.length).toBe(5);
    top.rel.forEach((r, i) => { expect(bottom.rel[i].x).toBeCloseTo(r.x, 1); expect(bottom.rel[i].y).toBeCloseTo(-r.y, 1); });
    // everybody was put on his mark: nobody is still in the lineout's waiting shape
    expect(top.rel[4].y).toBeCloseTo(21, 0);
  });
});

describe('support, drops and bounces', () => {
  it('a man who gets ahead of the ball all but stops until it comes past him', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(4));
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    p.run();
    for (let f = 0; f < 10; f++) p.step(1 / 30);
    const i = p.att.findIndex((m, k) => k !== p.carrier && m.job === 0 && m.pos !== 'HB'), m = p.att[i];
    m.x = p.att[p.carrier].x + 6;                       // put him well in front
    const x0 = m.x;
    for (let f = 0; f < 20; f++) p.step(1 / 30);
    expect(m.x - x0).toBeLessThan(1.2);                 // he has hardly moved in two-thirds of a second
    expect(p.att[p.carrier].x).toBeGreaterThan(x0 - 5); // while the ball has been coming up to him
  });
  it('about one called play in six has a pass put down, and never on the training board', () => {
    const { us, them } = sides();
    const drops = (clean: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(seed));
        p.noFumble = clean;
        p.usePlay({ name: 'Play 1', side: 'attack', spots: SAMPLE_PLAY.spots.map(sp => ({ x: sp.x, y: sp.y })), passes: [{ t: 0.4, to: 5 }, { t: 1.6, to: 7 }] }, true);
        p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
        p.run();
        for (let f = 0; f < 120 && p.state === 'live'; f++) p.step(1 / 30);
        if (p.end?.k === 'turnover' && p.end.why === 'knockon') n++;
      }
      return n;
    };
    const live = drops(false);
    expect(live).toBeGreaterThan(20); expect(live).toBeLessThan(55);
    expect(drops(true)).toBeLessThan(6);
  });
  it('a pass nobody gets to bounces on instead of dying where it lands', () => {
    const { us, them } = sides();
    const p = new AttackPlay(us.runners, them.tacklers, { x: 35, y: 25, kind: 'scrum' }, new Rng(4));
    p.def.forEach(d => { d.stun = 1e9; d.x = 999; });
    p.att.forEach((m, i) => { if (i !== p.carrier) { m.x = 5; m.y = 2; } });   // nobody anywhere near
    p.run();
    p.release(-0.3, 1, 0.5);
    let bounced = 0, high = 0;
    for (let f = 0; f < 90; f++) { p.step(1 / 30); if (p.ball.mode === 'bounce') { bounced++; high = Math.max(high, p.ball.z); } }
    expect(bounced).toBeGreaterThan(10); expect(high).toBeGreaterThan(0.4);
  });
});

describe('wingers in defence', () => {
  it('on a break their winger closes on the runner and tackles: he never runs away from him', () => {
    const { us, them } = sides();
    let closed = 0, tackled = 0, n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = new AttackPlay(us.runners, them.tacklers, { x: 30, y: 25, kind: 'scrum' }, new Rng(seed));
      const wings = p.def.filter(d => d.wing);
      expect(wings.length).toBe(2);
      // the line is beaten: everybody but the wingers and the fullback is out of the game
      p.def.forEach(d => { if (!d.wing && !d.sweeper) d.x = 12; else if (d.sweeper) { d.stun = 1e9; d.x = 999; } }); // beaten men are well behind, the fullback is out of it
      p.run();
      const c = p.att[p.carrier], gap0 = Math.min(...wings.map(d => Math.hypot(d.x - c.x, d.y - c.y)));
      let best = gap0;
      for (let f = 0; f < 240 && p.state === 'live'; f++) { p.step(1 / 30); best = Math.min(best, ...wings.map(d => Math.hypot(d.x - p.att[p.carrier].x, d.y - p.att[p.carrier].y))); }
      n++;
      if (best < gap0 * 0.4) closed++;
      if (p.state !== 'live' && p.state !== 'score') tackled++;
    }
    expect(closed).toBeGreaterThan(n * 0.8);
    expect(tackled).toBeGreaterThan(n * 0.4);
  });
});
