# Arcade Consolidation & Quality Round

Date: 2026-07-19
Status: Proposed — approved direction ("quality over quantity"), not yet started.
Supersedes (parks) the candidates queue in `2026-07-18-arcade-candidates-3.md`:
the next arcade session is this consolidation, not a tenth cabinet.

## Why

The arcade holds nine cabinets. Eight are healthy — pure DOM-free modules,
real test suites, shared engine, consistent conventions. The review of the
Cascade PR (#174) surfaced the actual cost of growth, and it is not the number
of games; it is that every cabinet re-pastes the same support code. Measured
today (grep, exact):

| Duplicated helper | Copies | Where |
|---|---|---|
| `showToast` (DOM toast, 3-cap, 2.4s) | 5 | cascade, city, park, syndicate, towerdefense |
| Particle system (`interface Particle` + burst + update/draw) | 6 | cascade, lemmings, snake, syndicate, tanks, towerdefense |
| Floaters (score popups) | 7 | cascade, city, park, snake, syndicate, tanks, towerdefense |
| Record-toast state machine (`record`/`runStartRecord`/`recordCelebrated`) | 5 | cascade, city, park, syndicate, towerdefense |
| `board.top()?.score ?? 0` record dance | 8 | those five + lemmings, snake, poo-poo-land |

Each copy has already diverged in constants; every fix or tuning change must
be found and re-applied per game, and every new cabinet re-implements the
CLAUDE.md scoring conventions by paste. Separately, one cabinet — Poo Poo
Land — predates the architecture entirely: 1,394 lines of game logic inline
in its `.astro` page, no pure modules, no tests.

Goals: shrink every game by moving the copied support code into the engine;
make the arcade floor feel curated instead of crowded; resolve the one
below-standard cabinet. Non-goals: new games, gameplay changes, visual
redesigns of individual games.

## Phase 1 — Engine extractions

One extraction per commit, in this order (smallest first), with the full
verification bar (below) between each. Migrate a game only when the module is
a genuine drop-in; a game that needs different behaviour keeps its local copy
and gets a code comment naming the divergence — do not force-fit.

### 1a. `engine/toast.ts`

`createToaster(area: HTMLElement | null)` → `{ show(text: string): void }`.
Behaviour identical to the five copies: prepend-safe append, cap of 3 visible
(`firstElementChild?.remove()`), 2.4s auto-remove, no-op on a null area.
Clear pending removal timers on `astro:before-swap` so a swap can't leak
callbacks into a dead DOM (this fixes latent behaviour the copies share).
Migrate all five games. Like `soundButton.ts`, this is thin DOM glue — a
smoke check in the browser stands in for unit tests.

### 1b. Scoreboard owns the record (`engine/scoreboard.ts`)

Extend `initScoreboard` with run-record tracking so games stop hand-rolling
it:

- `beginRun(): void` — snapshot the current best as the run's baseline,
  reset the one-time-celebration flag. Called from each game's `startRun`.
- `bank(score): { best: number; newRecord: boolean }` — `stash(score)`, fold
  the score into the tracked best, and report whether this run just beat its
  baseline for the first time (`newRecord` is true exactly once per run).
  Games call it on every score gain; the return value drives the HUD "Best"
  readout and the one-time record toast.
- `best(): number` — stash-aware current best, for init-time HUD seeding.

This deletes the `record`/`runStartRecord`/`recordCelebrated` trio and the
`Math.max` bookkeeping from five games and the `board.top()?.score ?? 0`
dance from all eight call sites. Unit-test the new surface in
`tests/games/highscores.test.ts`'s style (pure logic, fake panel), including:
`newRecord` fires once per run, not for runs starting at zero baseline, and
`beginRun` re-arms it.

### 1c. `engine/effects.ts` — particles + floaters

The largest and riskiest extraction; do it last. One module owning both
(they always travel together):

`createEffects(defaults?)` → `{ burst(x, y, count, color, opts?), floater(x,
y, text, color, opts?), update(dt), draw(ctx), clear() }`.

The six particle copies differ only in numeric defaults (speed, gravity
scale, vy squash, glow radius) — express every divergence as an option with
the current per-game value passed at construction, so no game's feel changes.
Floaters take `{ size?, rise?, life? }` (Cascade's big chain popups and the
sims' small `+n` floaters are the same mechanism). `update` is pure math over
an internal array — unit-test it (ageing, gravity, culling, floater rise) in
`tests/games/effects.test.ts`; `draw` needs only a smoke check.

Migrate cascade, towerdefense, and syndicate first (near-identical copies);
then snake, tanks, lemmings, city, park one at a time, comparing a before /
after screenshot of each game's burst moments. Any game whose copy resists
the options surface stays local — note it and move on.

### 1d. (Optional, low priority) `engine/padButtons.ts`

Promote Cascade's `wireHoldButton` (pointer hold-to-repeat + keyboard/AT
`click detail === 0` fallback) next to `wireSoundButton` for the next cabinet
that needs hold inputs. Skip if time is short — only one consumer today.

## Phase 2 — Group the arcade floor

`src/pages/[lang]/fun/index.astro` currently renders nine cabinets in one
flex-wrapped row. Group them into three labelled shelves:

- **Action** — Snake, Tank Duel, Line Hold
- **Puzzle** — Poo Poo Land (until Phase 3 removes it), Critter Rescue, Cascade
- **Simulation** — Pixel Park, Microcity, Syndicate

Implementation: add a `shelf` key to each entry in the `arcadeGames` array,
render one `cabinets-row` per shelf under a small neon shelf heading (same
aesthetic family as the main sign, much smaller — think aisle signage, dark
and light theme both). New i18n keys `fun.arcade.shelf.action` /
`.puzzle` / `.simulation` in en/es/cat. Keep the best-scores fill script and
the NEW badge exactly as they are. Shelves stack naturally on mobile; check
the 480px breakpoint.

## Phase 3 — Poo Poo Land: retire (default) or rebuild

**Default: retire.** It is the only cabinet outside the architecture (inline
logic, no tests), and its genre shelf is already covered by Critter Rescue
and Cascade.

- Delete `src/pages/[lang]/fun/poo-poo-land.astro` and the cabinet entry.
- Remove the `fun.pooLand.*` keys from all three locales (typecheck will
  catch stragglers).
- Leave its localStorage high-score data alone (harmless, and it revives the
  table if the game ever returns).
- Grep for internal links to `/fun/poo-poo-land` (`check-links` will verify
  after build). External deep links will 404 — acceptable for an arcade toy;
  do not add redirect machinery for it.
- Note the retirement in CLAUDE.md's arcade section.

**Alternative (only on explicit owner request): rebuild** to standard — pure
`src/games/poo/` modules (grid, mine-count logic, bonus round), tests, hi-DPI
canvas or keep DOM tiles, graphics pass. This is a full session on its own;
do not fold it into this round.

## Phase 4 — Docs & bookkeeping

- CLAUDE.md arcade section: document `createToaster`, `createEffects`, and
  the scoreboard's `beginRun`/`bank`/`best` as the required channel for
  toasts, particles/popups, and record handling (new games must not re-paste
  them); describe the shelf grouping; record Poo Poo Land's retirement; point
  the queue at this plan until it completes, then back at the parked
  `2026-07-18-arcade-candidates-3.md`.
- Update this plan's Status line as phases land (`Phase 1a done — <date>` …).

## Verification bar (after every commit)

1. `npm run lint` && `npm run typecheck` && `npm test` — all green.
2. `npm run build` && `npm run check-links`.
3. Browser smoke of every game touched by the commit (serve `dist`,
   Playwright with the pre-installed Chromium): the page boots with a clean
   console (ignore the sandbox-blocked analytics request), a run starts, and
   the migrated behaviour visibly fires — a toast appears, a burst renders on
   a score event, the record toast shows exactly once when the device best is
   beaten, HUD "Best" matches the high-score table.
4. For Phase 2: screenshot the arcade floor (desktop + 390px mobile, light +
   dark) and eyeball the shelves.
5. Phase 1 commits must not change behaviour: before/after screenshots of one
   representative effect moment per migrated game should be visually
   identical (allowing particle randomness).

## Sequencing & risk

- Order: 1a → 1b → 1c → 2 → 3 → 4, one commit each (1c may be several
  commits, one per migrated game). Nothing here blocks on anything external.
- Branch: start from `main` after PR #174 merges (the extractions touch the
  same files Cascade's PR does — rebasing this work over it is worse than
  waiting). Single PR for the round is fine; the per-commit history carries
  the review story.
- Biggest risk is 1c changing game feel through a missed constant — the
  options-with-current-values rule and before/after screenshots are the
  guard. Second risk is shelf layout regressions on mobile — screenshot the
  breakpoints.
- If the round runs long, 1a + 1b + Phase 3 are the highest value-per-hour;
  1c and Phase 2 can land in a follow-up without leaving anything broken.
