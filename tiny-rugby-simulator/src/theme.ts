// The look of the game: colours and typefaces, as swappable themes.
// Which one is in use is the `theme` setting in the tuning config, so it can be tried live in the
// developer portal and published like any other setting.
import { T } from './config';

export interface Palette {
  bg: string;      // screen background
  panel: string;   // cards
  panel2: string;  // raised or pressed cards, secondary buttons
  ink: string;     // main text
  dim: string;     // secondary text
  gold: string;    // the thing to press, and headline highlights
  red: string;     // bad news only: injuries, defeats, risky throws
  green: string;   // good news
  blue: string;    // selected tabs, quiet accents
  dark: string;    // header bars and overlays
}
export interface Theme { name: string; c: Palette; pitch: { a: string; b: string; goal: string; edge: string }; sans: string; display: string }

const SANS_INTER = 'TTSans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SANS_BLOCK = 'TTBlock, TTSans, system-ui, sans-serif';
const SLAB = 'TTDisplay, Georgia, serif';

export const THEMES: Theme[] = [
  { // 0: the V4 identity
    name: 'Forest and ochre', sans: SANS_INTER, display: SLAB,
    c: { bg: '#183B35', panel: '#21504A', panel2: '#2C645C', ink: '#F4F0E6', dim: '#A9BDB0', gold: '#E8B65C', red: '#D47B59', green: '#43865B', blue: '#506E82', dark: '#0F2823' },
    pitch: { a: '#43865B', b: '#3D7C54', goal: '#356E49', edge: '#2C5B3E' },
  },
  { // 1: teal carries the screens, yellow is the action, orange the accent
    // One type family throughout: Chakra Petch, bold for headings and numbers, so the game has one voice.
    name: 'Teal and orange', sans: SANS_BLOCK, display: 'TTBlock, TTDisplay, sans-serif',
    c: { bg: '#176B70', panel: '#125A5E', panel2: '#22868C', ink: '#F7F1E4', dim: '#B9DAD6', gold: '#F4BE46', red: '#E76F38', green: '#7BC47F', blue: '#0E474B', dark: '#25333A' },
    // a fresh, bright green, still with the mown stripes
    pitch: { a: '#58BE6B', b: '#4FB262', goal: '#44A057', edge: '#2F7A45' },
  },
  { // 2: dark ink background, orange is the action, yellow the highlight
    name: 'Ink and orange', sans: SANS_BLOCK, display: 'TTBlock, TTDisplay, sans-serif',
    c: { bg: '#25333A', panel: '#2F424B', panel2: '#3D5661', ink: '#F7F1E4', dim: '#A9B8BE', gold: '#F4BE46', red: '#E76F38', green: '#5FB878', blue: '#176B70', dark: '#182227' },
    pitch: { a: '#4FA868', b: '#479C5F', goal: '#3C8A52', edge: '#2F6E42' },
  },
  { // 3: loud: burnt orange everywhere, teal for cards, yellow to press
    name: 'Orange crush', sans: SANS_BLOCK, display: SLAB,
    c: { bg: '#E76F38', panel: '#176B70', panel2: '#22868C', ink: '#F7F1E4', dim: '#FBE3C8', gold: '#F4BE46', red: '#25333A', green: '#7BC47F', blue: '#0E474B', dark: '#25333A' },
    pitch: { a: '#4FA868', b: '#479C5F', goal: '#3C8A52', edge: '#2F6E42' },
  },
];

// The live colours and fonts. Code reads C.gold and so on; switching theme rewrites them in place.
// Starts on the game's chosen theme: teal and orange (Rocky's pick, 2026-11-23).
const START = 1;
export const C: Palette = { ...THEMES[START].c };
export const PITCH = { ...THEMES[START].pitch };
export const FONTS = { sans: THEMES[START].sans, display: THEMES[START].display };

let current = START;
// Called once a frame: picks up a change of theme.
export function syncTheme() {
  const want = Math.max(0, Math.min(THEMES.length - 1, Math.round(T.theme ?? 0)));
  if (want === current) return;
  current = want;
  const t = THEMES[want];
  Object.assign(C, t.c); Object.assign(PITCH, t.pitch); FONTS.sans = t.sans; FONTS.display = t.display;
}
