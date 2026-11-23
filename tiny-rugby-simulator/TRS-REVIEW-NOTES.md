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
- Full perspective/visual redesign of goalposts so the on-screen posts and scoring feel unmistakably aligned. Scoring precision was improved, but this still needs actual mobile visual QA.
- Manual gameplay tuning of speed, scoring, tackling and set-play balance after the new ratings model.
- Ensure all official team and competition names are appropriately licensed or replaced before a commercial release.

## GitHub

The ZIP is ready for source control. Upload only to a personally controlled account. Ignore `node_modules`, `dist`, `.env`, secrets and local `.git` artifacts. The repository `TheRock1801/Games` was accessible for reading, but the connected GitHub identity at review time was `HarrowsMarketing`, with **no permission to push**. Connect `TheRock1801` before publishing to that repository. Do not commit to a Harrows repository.
