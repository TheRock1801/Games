# Tiny Rugby Simulator (TRS): reviewed source update

This is an edited copy of the user's TRY TIME project. The original ZIP was not modified.

## Implemented

- Rebranded opening title as **tiny** (small white, top left), **RUGBY** (large blocky yellow), and **simulator** (small white, lower right). PWA title, icon and developer portal use TRS.
- Five stored player attributes: **Stamina, Handling, Passing, Kicking, Tackling**. Removed stored Speed and Strength. Player pace is calculated from position, overall rating and stamina; wingers remain visibly faster. Tackling now governs tackling and breakdown performance. Passing independently controls pass accuracy.
- Added position-weighted overall ratings, career-save migration from the previous fields, updated Squad and Open Market profiles, and updated the existing career tests.
- Kept old `trytime.*` localStorage keys intentionally so existing saved careers are still found after rebranding.
- Fixed the Training Ground resetting receivers, dummy runners, the main receiver and starting ball carrier on edit/save/reopen. Route colours now follow eligibility. Fixed the frame/tenth-second comparison that sometimes hid a new arrow until the slider moved.
- Added eight Training Centre and eight Medical Room upgrades, with an XP bonus, expanded potential ceiling, XP points for featured players, reduced injury risk and faster recovery. Reputation is the only team-wide performance rating; morale is removed.
- Improved scoring precision at conversions by checking the exact goal-line crossing, and made both goalpost uprights the same width.
- Added regression tests for ratings, pace, migration and facilities.

## Tested in this environment

- TypeScript source type-check using a review-only ambient definition (the npm install could not complete).
- A compiled Node runtime smoke test: team creation, five attribute schema, winger-vs-prop pace, eight Training Centre levels, save migration, team-to-match data transfer, and a straightforward conversion.

**Not verified here:** the full Vitest suite, a production Vite build, rendered screens on an actual phone or in-browser touch handling. Before running the project on Windows, use `npm ci`, `npm test` and `npm run build`.

## Still to do

- A full live, playable defensive phase after opposition turnovers. The engine currently uses a text-based opposition simulator in parts of match flow; this deserves dedicated implementation and tests.
- Visually verify the newly overhead goalposts on an actual phone during conversions, alongside scoring accuracy.
- Manual gameplay tuning of speed, scoring, tackling and set-play balance after the new ratings model.
- Ensure all official team and competition names are appropriately licensed or replaced before a commercial release.

## GitHub

The reviewed source is stored in the user's personal repository `TheRock1801/Games`. Do not commit to any Harrows repository. Ignore `node_modules`, `dist`, `.env`, secrets and local `.git` artifacts.

## Mobile playtest update, 24 November 2026

- Moved **tiny** tighter to the left edge of RUGBY and overlapped **simulator** with the bottom of the wordmark.
- Made **conversion goalposts genuinely top-down**: two aligned overhead post pads and one overhead crossbar, precisely at the world coordinates used to score kicks.
- Kicks now swell to up to **3.65 times** their ground-level ball size at maximum height, with their shadow kept on the projected flight line. This applies to open-play kicks, penalties for touch and conversions.
- Removed persistent text from live match play. Controls appear in the **first career match only**, not after prior career results or in training drills. Simplified the opponent-possession sequence into an animated field marker.
- Training Ground: tap empty grass to deselect a player; drag it to create a run.
- Defensive AI now prioritises running for kicked balls over holding its normal line, including when a defender starts behind the landing spot.
- Kicks aimed into touch visually travel **2.4 m past** the sideline before the game awards touch. Official touch/lineout outcomes still use the actual crossing.
- Increased on-field visibility of featured players via animated gold marking.
- Added regression tests in `tests/ux.test.ts`; locally ran eight standalone Node runtime smoke checks and a source-level TypeScript check.

**Validation limit:** The full npm install and Vitest suite could not run inside this restricted execution environment. On Windows, run `npm ci`, `npm test`, and `npm run build` before wider sharing. Phone touch and conversion visuals still deserve manual QA.
## World Cup squad and Character Studio update, 24 November 2026

- The 24 international teams each start with twelve named real-player placeholders; sources mix 2023-2026 seasons and are **not confirmed 2027 World Cup squads**.
- The name array follows the game's twelve game-sheet slots. Generated ages, appearances, ability ratings and team strength are fictional.
- World Cup mode has fixed players. Buying, replacing, rerolling the market, training attribute purchases and club facility upgrades are blocked; the market tab and credit prompts are hidden.
- Club career mode retains its existing transfer market, development and upgrade systems.
- The desktop developer site at `http://localhost:5173/dev.html` now has a Character studio below the existing test match. Select any team and each of its twelve characters, then edit name, age, skin-tone palette, featured flag and Stamina/Handling/Passing/Kicking/Tackling.
- Edits autosave as browser drafts; **Play this country** reloads an international test match using the draft; **Publish character changes** updates the local source file `src/data/roster-overrides.json`. Commit and push that JSON to share your edits with other devices or future builds.
- Existing saved careers retain their previous player data. Start a **new World Cup** to see the new names and published character changes.
- International names and team references need review for current eligibility, likeness, trademark, and other applicable commercial permissions before an app-store launch.
- Source TypeScript checked and offline Node runtime tests passed for 24 / 288 names, the World Cup transfer lock, continued club market and developer roster edits. Run the full Vitest suite, Vite production build and desktop/phone visual QA before release.
