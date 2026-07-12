# Arcade Expansion: Shared Engine + New Games

Date: 2026-06-10
Status: Tank Duel, Pixel Park, Microcity, and Critter Rescue (the Lemmings clone) all shipped. The original four-game wish list is complete.

## Context

The arcade (`/[lang]/fun/`) had three games — Snake, Dev Quiz, and Poo Poo Land —
each fully self-contained inside its `.astro` page with no shared code. The wish
list for this expansion was four games: a Lemmings clone, an artillery Tanks
game, a Theme Park sim, and a SimCity-lite. Building all four at once was out of
scope, so the decision was: build one end-to-end, design the rest, and make sure
whatever foundation the first one uses scales to the others (and can eventually
be adopted by the existing games).

## Framework decision: tiny in-house engine, no external library

Options considered:

| Option | Verdict |
|---|---|
| Phaser / Kaboom / Excalibur | Rejected. 200KB–1MB+ of JS per game page, version churn, and overkill for 2D canvas games. The site has zero runtime dependencies beyond Astro and is gated by Lighthouse CI. |
| Keep fully inline scripts (status quo) | Rejected. Every new game re-implements the loop, persistence, and input handling; sim games (Theme Park, SimCity) are too large to live comfortably inline in a page. |
| Small shared TypeScript engine under `src/games/` | **Chosen.** Plain modules bundled by Astro per page — only the code a game imports ships with it. Pure logic stays DOM-free and unit-testable with Vitest. |

### Engine layout

```
src/games/
  engine/           # shared across games
    loop.ts         # fixed-timestep rAF game loop (60Hz update, per-frame render)
    storage.ts      # guarded localStorage scores (loadScore/saveScore/recordHighScore)
    grid2d.ts       # flat-grid helpers (neighbours, chebyshev)
    iso.ts          # isometric projection/picking + diamond/block drawing
    index.ts
  tanks/            # one folder per game
    terrain.ts      # pure logic — unit tested
    physics.ts      # pure logic — unit tested
    ai.ts           # pure logic — unit tested
    game.ts         # DOM/canvas orchestration
    index.ts
```

Conventions every game follows:

- **Pure rules vs. presentation split.** Game rules live in DOM-free modules
  taking an injectable `random: () => number` so tests are deterministic.
  Only `game.ts` touches the canvas/DOM.
- **Page contract.** The `.astro` page under `src/pages/[lang]/fun/` owns all
  markup, styles, and i18n. Static labels are rendered server-side with
  `useTranslations(lang)`; strings composed at runtime are passed via
  `data-t-*` attributes on the game root element (same pattern as Poo Poo Land).
- **Entry point.** Each game exports a single `init<Game>()` that the page
  calls from a bundled `<script>`; it bails out silently if its root element
  is missing.
- **Persistence** via `engine/storage.ts` keys (`<game>-<metric>`).
- **Tests** under `tests/games/<game>.test.ts` covering the pure modules.

Engine modules to extract when the next game needs them (not speculatively
built now): an input mapper (keyboard + touch), an overlay/screen manager, and
a shared grid-sim core (see SimCity section). Snake could be migrated onto
`loop.ts`/`storage.ts` opportunistically.

## Shipped: Tank Duel (`/fun/tanks`)

Scorched Earth-style artillery. Two tanks on procedurally generated
destructible terrain; turns alternate setting angle/power with per-turn wind;
explosions carve craters (overhanging dirt collapses), deal linear-falloff
damage, and tanks take fall damage when the ground is blown out from under
them. Modes: vs CPU or 2-player hot-seat. First to 3 rounds wins the match;
matches won vs the CPU persist as `tanks-victories`.

The CPU gunner grid-searches angle/power with the same `simulateShot` physics
the live game uses, picks the closest impact, then adds noise scaled by
difficulty — so its accuracy is honest, tunable, and testable.

Files: `src/games/tanks/*`, `src/pages/[lang]/fun/tanks.astro`,
`fun.tanks.*` keys in `src/i18n/translations.ts`, cabinet entry in
`src/pages/[lang]/fun/index.astro`, tests in `tests/games/tanks.test.ts`.

## Shipped: Critter Rescue (`/fun/lemmings`)

A pocket Lemmings. Guide a stream of mindless walkers from a spawn hatch to the
exit by assigning skills to individuals; rescue the level's quota to advance.
The highest level reached persists through the shared scoreboard.

**Terrain — per-pixel solidity bitmap.** Unlike Tanks' heightmap, a
Lemmings-style level needs overhangs and tunnels, so terrain is a solidity grid
where every cell is `AIR`, `EARTH`, or a builder `BRIDGE`. It landed as a
DOM-free `Uint8Array` (`bitmap.ts`) rather than an offscreen canvas's
`ImageData` — the array *is* the cached solidity map, so it unit-tests without a
canvas, and a `version` counter bumped on every edit tells the renderer when to
rebuild its offscreen image. Diggers/bashers erase cells; builders lay `BRIDGE`
cells; the nuke erases discs. Levels are authored as pure vector descriptions
(axis-aligned rects and ramps plus a hatch and exit) rasterised onto a fresh
bitmap at load — no level image assets (`levels.ts`).

**Critters — the FSM plus five skills.** Each critter's feet sit at `(x, y)`
and run a small FSM: the base cycle is `walker → faller → splatter` (a fall
longer than `SPLAT_DIST` is fatal unless the critter is a floater). Walkers
advance 1px/tick, climb slopes ≤ 4px, and reverse on tall walls or blockers. On
top of that sit the five assignable skills (8 in the original; 5 keeps the
toolbar manageable on mobile):

| Skill | Behaviour |
|---|---|
| Blocker | Stands still; other walkers reverse on contact |
| Digger | Chews a column straight down until it breaks into air |
| Basher | Erases a body-height swathe horizontally through a wall |
| Builder | Lays a 45° staircase of bridge treads, then resumes walking |
| Floater | Umbrella — immune to fall damage, drifts down slowly |

`critter.ts` runs every rule against a `CritterWorld` interface (solidity
queries, terrain edits, blocker lookup), so the whole FSM is unit-tested against
a fake world with no DOM.

**Levels — nine vector-authored puzzles.** Shipped with six hand-tuned levels,
each making one skill the natural tool (walk-only, basher, builder, digger,
floater) and a finale that chains three, then expanded to nine that chain skills
in fresh ways: a blocker-gated dig (a blocker turns the crowd back off a
bottomless cliff while a digger opens the floor), a builder-then-basher climb
(build up onto a shelf, then bash through the wall capping it), and a
floater-drop-into-dig route (float down a lethal drop onto a walled shelf, then
dig through to the exit chamber below). Each level carries its spawn count,
rescue quota, and per-skill stock.

**Interaction.** Tap/click a critter to assign the selected skill (limited stock
per level, shown as toolbar buttons with live counts). A release-rate slider
controls the spawn cadence and a "nuke" button ends a level early by detonating
the crowd one at a time. Pointer-driven throughout, so it plays the same on
mobile and desktop.

**Structure.** `src/games/lemmings/{bitmap.ts, critter.ts, levels.ts, game.ts}`;
`bitmap.ts` and `critter.ts` are the DOM-free unit-tested modules, `game.ts`
owns the canvas/DOM and the simulation loop. Reuses `engine/loop.ts` (the fixed
timestep matters — critter movement is per-tick) and the shared scoreboard
(backed by `engine/storage.ts`) for the highest level reached. Page at
`src/pages/[lang]/fun/lemmings.astro`, `fun.lemmings.*` keys across all three
locales in `src/i18n/translations.ts`, cabinet on
`src/pages/[lang]/fun/index.astro`, and tests in `tests/games/lemmings.test.ts`
— including headless solvability playthroughs that beat every level with the
intended skills.

## Shipped: Pixel Park (`/fun/park`)

RollerCoaster Tycoon-flavoured management on a small grid: place
rides, stalls, and paths; keep guests happy; don't go broke.

**World.** 24×14 tile grid rendered isometrically via `engine/iso.ts`
(diamond ground tiles, extruded emoji-topped blocks — still asset-free).
Tile types: grass, path, entrance, ride, food/drink stall, toilet, decoration.

**Guests.** Spawn at the entrance at a rate driven by park reputation. Each
guest has needs (fun, hunger, thirst, bladder, energy) that decay per tick;
they pathfind (BFS over path tiles — the grid is small enough) to the nearest
building satisfying their most urgent need, queue, pay, consume. Guests with
unmet needs lose happiness and eventually leave; average happiness feeds
reputation.

**Economy.** Starting cash; rides/stalls have build cost, running cost per
tick, and a price the player can set. Income vs. upkeep with a monthly summary
toast. Lose condition: bankruptcy. No win condition — it's a sandbox with a
"park value" high score (persisted via `engine/storage.ts`).

**Simulation tick.** Game-time tick every 0.5s of real time on top of
`engine/loop.ts`; rendering interpolates guest movement between ticks.

**UI.** Build palette (tap tool, tap tile), inspect panel on tap, pause/1×/3×
speed. Pointer-first design, no keyboard required.

**Structure.** `src/games/park/{grid.ts, pathfind.ts, guests.ts, economy.ts,
game.ts}` — everything except `game.ts` pure and unit-tested
(`tests/games/park.test.ts`).

**v1 simplifications** (room to grow): rides occupy a single tile, no queues
or ride capacity (guests use buildings concurrently), prices are fixed per
building, and there is no inspect panel — feedback comes from toasts and the
HUD. Bulldozing a path is blocked while a guest is standing on it; any guest
routes invalidated by a grid edit are recomputed.

## Shipped: Microcity (`/fun/city`)

Classic RCI zoning: lay roads, zone residential/commercial/industrial,
manage the budget, watch the city grow.

**Shared base with Pixel Park.** Both are grid-placement sims. Rather than the
full `grid-sim` extraction originally sketched, the genuinely shared pieces
moved into the engine — `grid2d.ts` (`gridNeighbours`, `chebyshev`) and
`iso.ts` (isometric projection, screen→tile picking, diamond/extruded-block
drawing, back-to-front traversal) — and both games consume them; tick
scheduling and game-specific drawing stayed per-game because the two sims
diverged more than expected (agents vs. cellular growth). Revisit a deeper
extraction if a third grid sim appears.

**Mechanics as shipped.**
- Zones develop (3 levels, rendered as iso blocks that grow taller with
  level) only when powered (within Chebyshev radius 7 of a plant) and
  road-adjacent; unserviced developed zones decay with a ⚠️ flash.
- Coupled RCI demand: jobs attract residents, population drives shop and
  industry demand; shown as R/C/I meter bars. A +16 base residential demand
  bootstraps new cities.
- Top-level residential additionally requires a park within radius 3
  (the land-value gate, simplified).
- Budget: monthly taxes (per resident + per job) minus upkeep (roads, power,
  parks); treasury below zero ends the game.
- Score: peak population, persisted live as `city-record-pop`.

**Structure.** `src/games/city/{tiles.ts, simulation.ts, budget.ts, game.ts}`
— everything except `game.ts` pure and unit-tested (`tests/games/city.test.ts`).

## Suggested build order

1. ~~Tank Duel~~ (shipped)
2. ~~Pixel Park~~ (shipped)
3. ~~Microcity~~ (shipped)
4. ~~Critter Rescue~~ (shipped)

Each game lands the same way Tanks did: pure modules + tests, page under
`[lang]/fun/`, `fun.<game>.*` translation keys in all three locales, and a
cabinet entry on the arcade index.
