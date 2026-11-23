// Twelve in a squad: five forwards and seven backs, with two centres now the pitch is wide enough for them.
export const SLOTS = ['PR', 'HK', 'LK', 'FL', 'N8', 'HB', 'FH', 'CE', 'CE', 'WG', 'WG', 'FB'] as const;
export type Attr = 'sta' | 'hnd' | 'pas' | 'kck' | 'tkl';

export interface Player {
  id: number; name: string; pos: string; age: number;
  sta: number; hnd: number; pas: number; kck: number; tkl: number;
  pot: number; salary: number; years: number; inj: number; cond: number; skin: number;
  xp?: number; points?: number; // featured players earn XP and spend earned attribute points
  star?: boolean; // a featured player, recruited or developed, rather than one of the generic squad
}

export interface Team {
  id: string; name: string; kind: 'club' | 'nation'; base: number;
  c1: string; c2: string; names: string; six: boolean; roster: Player[];
}

export interface Fixture {
  h: string; a: string; hs: number; as: number; ht: number; at: number;
  played: boolean; stage: string; // '' for league or pool games, else QF / SF / FINAL
}

export interface Row { p: number; w: number; d: number; l: number; pf: number; pa: number; bp: number; pts: number }

export interface Comp {
  id: 'south' | 'north' | 'world'; name: string;
  groups: string[][]; rounds: Fixture[][]; r: number;
  table: Record<string, Row>;
  ko: number; // teams that go through to knockouts (0 = table decides the title)
  done: boolean; champion: string; awarded: boolean;
}

export interface Career {
  v: 1; rngS: number; year: number;
  teamId: string; wcTeamId: string | null;
  stage: 'season' | 'wcpick' | 'worldcup' | 'offseason';
  rep: number; credits: number;
  fac: { train: number; med: number };
  teams: Record<string, Team>;
  comps: { south: Comp; north: Comp; world: Comp | null };
  market: Player[]; nextId: number;
  trophies: string[]; report: string[]; offers: string[];
  record: { w: number; d: number; l: number };
  event?: { id: string; opp: string } | null; lastEvent?: string;
  mode?: 'cup';
  id?: string;      // which save slot this career lives in
  away?: boolean;   // wearing the away kit
  history?: Season[]; // one line for every season finished
  lastEarn?: Earned | null; // what the last match paid, shown once
  began?: number; // the year this career started, for easing a new coach in
  plays?: (import('../config').Formation | null)[]; // the five set plays, kept with the career // a stand-alone World Cup tournament rather than a club career
}

export interface Season { year: number; team: string; comp: string; w: number; d: number; l: number; pos: number; of: number; champ: boolean }
// Credits from one match: for finishing it, for the result, and for anything it won.
export interface Earned { played: boolean; us: number; them: number; opp: string; match: number; win: number; extra: number; total: number }

export interface MatchResult { us: number; them: number; ust: number; themt: number; inj?: number[] } // inj: ids of players hurt in the match
