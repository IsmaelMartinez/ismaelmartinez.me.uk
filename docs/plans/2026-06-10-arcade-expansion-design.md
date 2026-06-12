# Arcade Expansion: Shared Engine + New Games

Date: 2026-06-10
Status: Tank Duel, Pixel Park, and Microcity shipped; Lemmings designed but not built.

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

## Designed: Lemmings clone — "Critter Rescue"

**Goal.** Guide a stream of mindless walkers from a spawn hatch to the exit by
assigning skills to individuals. Save the quota to win the level.

**Terrain.** Unlike Tanks' heightmap, Lemmings needs overhangs and tunnels, so
terrain is a per-pixel solidity bitmap: an offscreen canvas where alpha > 0 is
solid. Diggers/bashers erase pixels (`destination-out`), builders draw bridge
pixels. Collision queries read a cached `ImageData`; invalidate the cache on
any terrain edit (edits are rare relative to queries). Levels are authored as
simple vector descriptions (rects/ramps + hatch/exit positions) rendered onto
the bitmap at load — no level image assets needed.

**Critters.** Each critter is a small FSM:
`walker → faller → splatter` (fall > threshold), plus skill states. Walkers
advance 1px/tick, climb slopes ≤ 4px, reverse on walls. Launch set of skills
(8 in the original; 5 keeps the UI manageable on mobile):

| Skill | Behaviour |
|---|---|
| Blocker | Stands still; other walkers reverse on contact |
| Digger | Erases a column straight down until air |
| Basher | Erases horizontally until air |
| Builder | Lays a 45° staircase of N bridge pixels, then resumes walking |
| Floater | Umbrella — immune to fall damage |

**Interaction.** Tap/click a critter to assign the currently selected skill
(limited stock per level, shown as toolbar buttons). Spawn rate slider and a
"nuke" button to end a level early. This is pointer-driven, so it works the
same on mobile and desktop.

**Structure.** `src/games/lemmings/{bitmap.ts, critter.ts, levels.ts, game.ts}`.
`bitmap.ts` (solidity queries, erase/draw ops) and `critter.ts` (FSM
transitions against a fake bitmap interface) are the unit-tested pure modules.
Reuses `engine/loop.ts` (fixed timestep matters here — critter movement is
per-tick) and `engine/storage.ts` (highest level reached).

**Scope estimate.** The hardest of the three remaining games: FSM + bitmap
terrain + ~6 hand-tuned levels. Roughly 2× the Tanks effort.

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
4. Critter Rescue — biggest standalone effort; needs level design time

Each game lands the same way Tanks did: pure modules + tests, page under
`[lang]/fun/`, `fun.<game>.*` translation keys in all three locales, and a
cabinet entry on the arcade index.
