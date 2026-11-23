// Every team in the game. This file is the one place names, colours and strengths live, so they can
// be swapped before release.
//
// The names here are real-world team and competition names used as development placeholders. They are
// trademarks of their owners: before the game is sold they need a licence or need replacing with
// original names. No logos or official artwork are used anywhere; kits are two flat colours.
//
// `base` is overall strength. `names` picks the pool player names are generated from.
// `league` is the club competition a team plays in; nations have none.
export interface TeamDef {
  id: string; name: string; kind: 'club' | 'nation'; base: number;
  c1: string; c2: string; names: string; league?: 'super' | 'urc'; six?: boolean;
}

export const COMP_NAMES = { super: 'Super Rugby Pacific', urc: 'United Rugby Championship', world: 'Rugby World Cup' };

export const TEAMS: TeamDef[] = [
  // Super Rugby Pacific, the 11 teams of 2026
  { id: 'AKL', name: 'Blues', kind: 'club', league: 'super', base: 83, c1: '#2b59c3', c2: '#f4f1de', names: 'NZL' },
  { id: 'HAM', name: 'Chiefs', kind: 'club', league: 'super', base: 85, c1: '#22252b', c2: '#f2c14e', names: 'NZL' },
  { id: 'WLG', name: 'Hurricanes', kind: 'club', league: 'super', base: 83, c1: '#f6c62d', c2: '#22252b', names: 'NZL' },
  { id: 'CHC', name: 'Crusaders', kind: 'club', league: 'super', base: 85, c1: '#c1272d', c2: '#22252b', names: 'NZL' },
  { id: 'DUN', name: 'Highlanders', kind: 'club', league: 'super', base: 77, c1: '#1d3557', c2: '#e9c46a', names: 'NZL' },
  { id: 'SYD', name: 'NSW Waratahs', kind: 'club', league: 'super', base: 78, c1: '#7fc8f8', c2: '#1d3557', names: 'AUS' },
  { id: 'BNE', name: 'Queensland Reds', kind: 'club', league: 'super', base: 81, c1: '#7b1e3a', c2: '#f4f1de', names: 'AUS' },
  { id: 'CBR', name: 'Brumbies', kind: 'club', league: 'super', base: 83, c1: '#f4f1de', c2: '#1d3557', names: 'AUS' },
  { id: 'PER', name: 'Western Force', kind: 'club', league: 'super', base: 75, c1: '#12509e', c2: '#22252b', names: 'AUS' },
  { id: 'SUV', name: 'Fijian Drua', kind: 'club', league: 'super', base: 77, c1: '#3fa34d', c2: '#f4f1de', names: 'PAC' },
  { id: 'API', name: 'Moana Pasifika', kind: 'club', league: 'super', base: 73, c1: '#274690', c2: '#e05a47', names: 'PAC' },
  // United Rugby Championship: Ireland, Scotland, Wales, Italy and South Africa
  { id: 'LEI', name: 'Leinster', kind: 'club', league: 'urc', base: 88, c1: '#1f5bc4', c2: '#f2c14e', names: 'IRE' },
  { id: 'MUN', name: 'Munster', kind: 'club', league: 'urc', base: 84, c1: '#c1272d', c2: '#1d3557', names: 'IRE' },
  { id: 'ULS', name: 'Ulster', kind: 'club', league: 'urc', base: 80, c1: '#f4f1de', c2: '#c1272d', names: 'IRE' },
  { id: 'CON', name: 'Connacht', kind: 'club', league: 'urc', base: 78, c1: '#2f9e44', c2: '#22252b', names: 'IRE' },
  { id: 'EDI', name: 'Edinburgh', kind: 'club', league: 'urc', base: 79, c1: '#1d3557', c2: '#e76f38', names: 'SCO' },
  { id: 'GLA', name: 'Glasgow Warriors', kind: 'club', league: 'urc', base: 85, c1: '#1a1c20', c2: '#7fc8f8', names: 'SCO' },
  { id: 'CAR', name: 'Cardiff', kind: 'club', league: 'urc', base: 77, c1: '#7fc8f8', c2: '#1d3557', names: 'WAL' },
  { id: 'DRA', name: 'Dragons', kind: 'club', league: 'urc', base: 68, c1: '#22252b', c2: '#d9a441', names: 'WAL' },
  { id: 'OSP', name: 'Ospreys', kind: 'club', league: 'urc', base: 76, c1: '#3a3f47', c2: '#e8e8e8', names: 'WAL' },
  { id: 'SCA', name: 'Scarlets', kind: 'club', league: 'urc', base: 77, c1: '#b3122a', c2: '#f4f1de', names: 'WAL' },
  { id: 'BEN', name: 'Benetton', kind: 'club', league: 'urc', base: 78, c1: '#1b6b3a', c2: '#f4f1de', names: 'ITA' },
  { id: 'ZEB', name: 'Zebre Parma', kind: 'club', league: 'urc', base: 70, c1: '#f4f1de', c2: '#22252b', names: 'ITA' },
  { id: 'BUL', name: 'Bulls', kind: 'club', league: 'urc', base: 86, c1: '#5aa9e6', c2: '#1d3557', names: 'RSA' },
  { id: 'LIO', name: 'Lions', kind: 'club', league: 'urc', base: 78, c1: '#d62839', c2: '#f4f1de', names: 'RSA' },
  { id: 'SHA', name: 'Sharks', kind: 'club', league: 'urc', base: 82, c1: '#22252b', c2: '#f4f1de', names: 'RSA' },
  { id: 'STO', name: 'Stormers', kind: 'club', league: 'urc', base: 83, c1: '#1d3557', c2: '#f4f1de', names: 'RSA' },
  // The 24 nations of the 2027 World Cup
  { id: 'NZL', name: 'New Zealand', kind: 'nation', base: 90, c1: '#1a1c20', c2: '#e8e8e8', names: 'NZL' },
  { id: 'AUS', name: 'Australia', kind: 'nation', base: 82, c1: '#f2c14e', c2: '#1b6b3a', names: 'AUS' },
  { id: 'CHI', name: 'Chile', kind: 'nation', base: 66, c1: '#d52b1e', c2: '#0039a6', names: 'ARG' },
  { id: 'HKG', name: 'Hong Kong China', kind: 'nation', base: 58, c1: '#de2910', c2: '#f4f1de', names: 'ENG' },
  { id: 'RSA', name: 'South Africa', kind: 'nation', base: 91, c1: '#1b6b3a', c2: '#f2c14e', names: 'RSA' },
  { id: 'ITA', name: 'Italy', kind: 'nation', base: 79, c1: '#4d9de0', c2: '#f4f1de', names: 'ITA' },
  { id: 'GEO', name: 'Georgia', kind: 'nation', base: 75, c1: '#8a1c2b', c2: '#f4f1de', names: 'GEO' },
  { id: 'ROU', name: 'Romania', kind: 'nation', base: 65, c1: '#f2c14e', c2: '#274690', names: 'ROU' },
  { id: 'ARG', name: 'Argentina', kind: 'nation', base: 84, c1: '#8ecae6', c2: '#f4f1de', names: 'ARG' },
  { id: 'FIJ', name: 'Fiji', kind: 'nation', base: 80, c1: '#f4f1de', c2: '#22252b', names: 'PAC' },
  { id: 'ESP', name: 'Spain', kind: 'nation', base: 66, c1: '#aa151b', c2: '#f1bf00', names: 'POR' },
  { id: 'CAN', name: 'Canada', kind: 'nation', base: 64, c1: '#d62839', c2: '#22252b', names: 'NAM' },
  { id: 'IRE', name: 'Ireland', kind: 'nation', base: 89, c1: '#2f9e44', c2: '#f4f1de', names: 'IRE' },
  { id: 'SCO', name: 'Scotland', kind: 'nation', base: 83, c1: '#1d3557', c2: '#f4f1de', names: 'SCO' },
  { id: 'URU', name: 'Uruguay', kind: 'nation', base: 68, c1: '#8ecae6', c2: '#22252b', names: 'ARG' },
  { id: 'POR', name: 'Portugal', kind: 'nation', base: 68, c1: '#a4161a', c2: '#1b6b3a', names: 'POR' },
  { id: 'FRA', name: 'France', kind: 'nation', base: 89, c1: '#2b59c3', c2: '#f4f1de', names: 'FRA' },
  { id: 'JPN', name: 'Japan', kind: 'nation', base: 76, c1: '#d62839', c2: '#f4f1de', names: 'JPN' },
  { id: 'USA', name: 'USA', kind: 'nation', base: 69, c1: '#1d3557', c2: '#e05a47', names: 'NAM' },
  { id: 'SAM', name: 'Samoa', kind: 'nation', base: 73, c1: '#274690', c2: '#f4f1de', names: 'PAC' },
  { id: 'ENG', name: 'England', kind: 'nation', base: 86, c1: '#f4f1de', c2: '#c1272d', names: 'ENG' },
  { id: 'WAL', name: 'Wales', kind: 'nation', base: 79, c1: '#c1272d', c2: '#f4f1de', names: 'WAL' },
  { id: 'TON', name: 'Tonga', kind: 'nation', base: 72, c1: '#d62839', c2: '#f4f1de', names: 'PAC' },
  { id: 'ZIM', name: 'Zimbabwe', kind: 'nation', base: 60, c1: '#2e8b3d', c2: '#f6c62d', names: 'RSA' },
];

// The six World Cup pools, as drawn.
export const WC_POOLS = [
  ['NZL', 'AUS', 'CHI', 'HKG'], ['RSA', 'ITA', 'GEO', 'ROU'], ['ARG', 'FIJ', 'ESP', 'CAN'],
  ['IRE', 'SCO', 'URU', 'POR'], ['FRA', 'JPN', 'USA', 'SAM'], ['ENG', 'WAL', 'TON', 'ZIM'],
];

export const CLUB_IDS = TEAMS.filter(t => t.league === 'super').map(t => t.id);
export const URC_IDS = TEAMS.filter(t => t.league === 'urc').map(t => t.id);
export const NATION_IDS = TEAMS.filter(t => t.kind === 'nation').map(t => t.id);
