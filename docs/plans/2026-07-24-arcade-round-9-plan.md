# Arcade Round 9 — Plan

Date: 2026-07-24
Status: **Gates decided by the delegate, executing.** Round 8 (PR #196) is
merged. The owner's standing direction holds: deepen the shipped cabinets, the
tenth-cabinet queue stays parked. Round 8 built both of Round 7's declined
stretch candidates, so this round carries no leftover backlog. Its two goals
come from a fresh audit that ranked the two cabinets which have gone coldest,
Microcity (last touched Round 3, five rounds ago) and Tank Duel (Round 4, four
rounds ago), and took the single highest-leverage deepening each one has left.
Because this round was commissioned to run autonomously through subagents, the
per-goal gates are decided here by the delegate on the recommended option and
marked as such, rather than held open for an owner pass; each choice is noted so
the owner can redirect.

The repo bar applies to every commit: `npm run lint && npm run typecheck &&
npm run build && npm test && npm run check-links`, plus screenshot before/after
pairs for draw changes, headless proofs for balance and content claims, i18n
keys across all three locales, and execution notes at the foot of this doc.
Round 6's process note stands: commit before measuring across revisions.

Baseline at branch point (`9050e71`): 575 tests, 20 files.

## Fresh audit (the eight cabinets, post-Round 8)

| Cabinet | State after Round 8 | Gap found | Round 9 call |
|---|---|---|---|
| Syndicate | 10 missions, 5 objective moulds, 2× Wars-scale units | none pressing; the escort mould just landed | rest |
| Line Hold | 18 waves + endless, no-perfect-runs contract, arcane batteries, contrast marchers | none pressing; art and balance both current | rest |
| Critter Rescue | 25 levels in four acts, pinned arc | none, deepened in Rounds 5 and 6 | rest |
| Pixel Park | 8 attractions, coaster editor, zones, objectives; thrill hole closed | none pressing; catalogue round landed in Round 7 | rest |
| Cascade | marathon + 120s countdown, two tables, pure `run.ts` | none pressing; the second mode just landed | rest |
| Snake | arena ladder (five rungs), speed ramp, one bonus | none pressing; the ladder just landed | rest |
| Microcity | power/fire/school coverage, disasters, congestion, budget, 12 zone variants | one civic axis never taken: safety. Two coverage systems exist (fire, school), a third (police/crime) is the one obvious missing pillar | **G2** |
| Tank Duel | tiers + ramp, wind, destructible terrain, 3 weapons, best-of-3 | every round is the *same kind* of arena: one rolling-hills silhouette. The oldest unaddressed content finding in the arcade | **G1** |

Three code-level facts sharpen the ranking, and each changes what a goal costs.

**Microcity's coverage-and-gate architecture is proven twice, so a third
pillar is cheap in mechanism and dear only in tuning.** `computePowered` and
`computeFireCover` (`simulation.ts:33-41`) both delegate to one generic helper,
`coverage(tiles, sourceType, radius)` (`simulation.ts:24-30`), and `growthStep`
already gates residential top levels on `hasSchoolNearby` (`simulation.ts:156`)
exactly the way it gates on power and roads. A police source type is a third
call to the same helper. The genuinely new surface is not the coverage, it is
*what absent coverage does*: the load-bearing choice is making crime a
late-game decay pressure on developed zones rather than a fourth growth gate, so
it reads as "hold your districts" rather than a repeat of school's "build near
everything to grow". That is the one design decision the proofs must pin.

**Tank Duel's arena work lands entirely inside one pure, tested module and
needs no physics or AI change.** `generateTerrain` (`terrain.ts:12-34`) is the
only shape source, and `chooseAiShot` (`ai.ts:66-98`) grid-searches the real
heightmap through `simulateShot`, so any new silhouette is playable by the CPU
for free: it will arc over a canyon or onto a mesa without a line of AI code
changing. The load-bearing constraint is completability, an arena whose geometry
leaves one spawn unable to reach the other at the CPU's 5-degree grid resolution
would be a broken round; that is what the winnability proof must cover, the way
Critter Rescue's solvability suite covers its levels.

**The default arena must stay byte-identical to today.** `generateTerrain`'s
current three-wave sum is what the six-cabinet screenshot harness captured for
`tanks-*`, and the existing terrain tests assert its bounds and determinism. The
`hills` arena keeps the exact wave construction and the exact `random()` call
order, and the new silhouettes branch only *after* it, so the round's regression
proof is that `tanks-*` captures are byte-identical between the branch base and
head and every existing terrain test passes untouched.

Cross-cutting checks came back clean: the engine channels (toast, effects,
scoreboard run-record, static layers, shared BFS) are still the only
implementations on both cabinets, the scoring conventions hold, and the
two-shelf floor from Round 6 needs no reordering (this round changes no
cabinet's standing; both targets stay in the Back catalogue).

## Ranked goals and execution order

| # | Goal | Cabinet | Kind | Gate (decided) |
|---|------|---------|------|------|
| 1 | G1 arena variety | Tank Duel | Content + art (headless + screenshots) | **Four arenas via a picker, no indestructible-obstacle entity this round** |
| 2 | G2 police / crime coverage | Microcity | System + sim (headless) | **Crime as late-game decay on developed un-policed zones** |

Execution runs G1 then G2. G1 goes first because it is the most self-contained
(one pure module reshaped, one picker wired, one draw path already handling
arbitrary heightmaps) and lands the arcade's oldest open content finding; G2 is
the heavier change (a new tile type, tool, building, upkeep line and a decay
term in the sim core) and its whole risk is balance, so it goes second with the
round already moving. The two cabinets share no game code, so screenshot
baselines and test files never interact. One commit per goal, full bar after
each, single PR for the round.

---

## G1 — Tank Duel: arena variety (gate: four arenas, no obstacle entity)

**The gap.** Every round is the same rolling-hills silhouette. `generateTerrain`
sums three randomised sine waves over a fixed base, so no two rounds are
identical yet every round is the same *kind* of battlefield. This was flagged in
the Round 1 audit (`docs/plans/2026-07-21-arcade-improvement-round-1.md:69-71`)
and is the one content finding neither the difficulty-ramp round nor the
terrain-bake round touched.

**The change.**

- `src/games/tanks/terrain.ts`: add `export type ArenaType = 'hills' | 'canyon'
  | 'mesa' | 'ridges'` and a fourth parameter `arena: ArenaType = 'hills'` to
  `generateTerrain`. Keep the current three-wave construction and its exact
  `random()` call order; for `'hills'` return that ground unchanged (byte
  identical). For the other three, apply a deterministic reshape pass over the
  built ground: `canyon` carves a deep central gorge (raise the two rims, push a
  narrow central band down toward the `0.92h` floor); `mesa` flattens a central
  plateau near the `0.3h` ceiling with cliff shoulders; `ridges` raises two
  peaks with a valley between. Every column stays inside the existing
  `[0.3h, 0.92h]` clamp so the physics and bake are unaffected.
- `src/games/tanks/game.ts`: add an `arena: ArenaType` selection variable
  (default `'hills'`), read from an `.arena-btn` picker mirroring the existing
  `.difficulty-btn` wiring (`game.ts:115-117, 1026-1032`), and pass it to both
  `generateTerrain(WIDTH, HEIGHT, Math.random, arena)` call sites
  (`game.ts:353, 1053`). No physics, AI, or bake change; `scene.rebuild()`
  already repaints whatever heightmap it is handed.
- `src/pages/[lang]/fun/tanks.astro`: add an arena picker group next to the
  difficulty picker in the start overlay (`tanks.astro:69-76`), following the
  same `role="group"` + `.arena-btn` + `data-arena` markup and reusing the
  difficulty-button styles.
- `src/i18n/translations.ts`: add `fun.tanks.arena` (picker label) and
  `fun.tanks.arenaHills / arenaCanyon / arenaMesa / arenaRidges` across en, es
  and cat.

**No indestructible-obstacle entity this round.** The audit floated an
indestructible column that `carveCrater` cannot cut below a floor. It is the
tactically richest option but it adds a new terrain concept (a per-column height
floor the carve must respect) and its own draw code, and it risks the
byte-identical proof for `hills`. The four silhouettes already deliver real
variety and distinct play, so this round ships them alone and leaves the
obstacle as a Round 10 seed.

**Eval criteria (all headless in `tests/games/tanks.test.ts`, plus a capture
pair).**

- `generateTerrain(w, h, seededRandom, 'hills')` is bitwise equal to
  `generateTerrain(w, h, seededRandom)` for several seeds (the default is
  untouched).
- For each of the four arena types, over many seeds, every column stays within
  `[0.3h, 0.92h]` and the array length is `width` (bounds and shape hold).
- The three new silhouettes are actually distinct from `hills`: for a fixed
  seed, `canyon`/`mesa`/`ridges` each differ from `hills` in a meaningful number
  of columns (the reshape did something).
- **Winnability**: for each arena type, over many seeds, place the two tanks at
  the standard near-edge spawns and assert `chooseAiShot` from each side finds a
  shot landing within a hittable radius of the opponent (the arena is never a
  geometry the CPU's grid search cannot solve). This is the load-bearing proof.
- Screenshot: a new `tanks-canyon` (or one capture per new arena) crop for the
  PR, and `tanks-play` / any existing `tanks-*` capture byte-identical to the
  branch base (proof `hills` is the game that shipped).

**Risk.** A poorly-shaped canyon or mesa could be unwinnable at the grid
resolution or at max power. The winnability test is the guard; if a reshape
fails it, soften the extreme (shallower gorge, lower cliffs) until every seed
passes.

---

## G2 — Microcity: police / crime coverage (gate: crime as late-game decay)

**The gap.** Microcity has power coverage, fire coverage and school coverage,
but no public-safety axis. Safety is the one obvious civic pillar a city-builder
of this depth is missing, and the coverage-and-gate machinery to add it already
exists and is proven twice.

**The change.**

- `src/games/city/tiles.ts`: add `'police'` to `CityTileType` and `CityTool`,
  a `TOOL_COSTS.police` entry (275, between firehouse 250 and school 300), and
  let it place on empty land like the other civic buildings (no `canBuild`
  special case needed beyond the default `empty` rule).
- `src/games/city/budget.ts`: add `police: 14` to `UPKEEP` (between firehouse 12
  and school 15), so a third civic building competes for the same tight
  late-game per-capita budget.
- `src/games/city/simulation.ts`: add `export const POLICE_RADIUS = 6` and
  `export function computePoliceCover(tiles)` delegating to the existing
  `coverage(tiles, 'police', POLICE_RADIUS)`. In `growthStep`, add a crime-decay
  term: a *serviced, developed* zone (`tile.level >= 2`) that is **not**
  police-covered, in a city past a `CRIME_ONSET_POP` threshold (250), has a
  small chance (`CRIME_DECAY_CHANCE`, 0.05) to lose a level. This runs in the
  serviced branch before the growth roll and pushes the tile to `decayed`. It is
  deliberately *not* a growth gate: an un-policed district still grows, it just
  bleeds if left unprotected once the city is large, which is a "hold what you
  built" pressure distinct from school's "build near everything to grow".
- `src/games/city/game.ts`: add a `police` tool button wiring (mirroring the
  firehouse/school tool), a `drawPolice` render branch reusing the exact
  `drawBlock` + window + roof idioms the firehouse and school use
  (`game.ts:1385-1426`), and route crime decay through the same floater/toast
  feedback existing decay uses.
- `src/pages/[lang]/fun/microcity.astro`: add the police tool button to the
  toolbar following the firehouse/school markup.
- `src/i18n/translations.ts`: add `fun.microcity.toolPolice` (and a crime alert
  string if the decay surfaces a toast) across en, es and cat.

**Eval criteria (all headless in `tests/games/city.test.ts`).**

- `TOOL_COSTS.police` and `UPKEEP.police` are the expected values, and a placed
  police station adds its upkeep to `monthlyExpenses` (parallel to the existing
  firehouse/school expense test at `city.test.ts:621-625`).
- `computePoliceCover` marks tiles within `POLICE_RADIUS` of a station and no
  others (parallel to the `computeFireCover` test at `city.test.ts:544-549`).
- **Crime decay is real and bounded**: a developed (`level >= 2`) serviced zone
  with no police nearby, in a large city (population past `CRIME_ONSET_POP`),
  decays over many `growthStep` ticks with a seeded random; the *same* zone
  inside police coverage does not; and a *small* city (population below onset)
  with no police does not decay from crime. This three-way proof is the
  load-bearing test that the mechanic is late-game, coverage-relieved, and not a
  blanket decay.
- Existing growth/decay tests pass untouched (crime decay is additive and gated,
  so no prior scenario, all small or policed by construction, changes).
- Screenshot: a `city-*` capture showing a police station on the map for the
  PR; existing `city-*` captures need not be byte-identical (the sim seed and
  content are unchanged, but confirm no unrelated visual drift).

**Risk.** Balance. Too weak and the tool is ignored; too strong and it becomes a
mandatory third "must build near everything", worsening the very tension the
per-capita bill already creates. The onset threshold and decay chance are tuned
so a small or still-growing city is never bled, matching the budget squeeze's
late-game-only philosophy; if playtest-by-headless-sim shows the decay dominates
before the city is genuinely large, raise `CRIME_ONSET_POP` or lower
`CRIME_DECAY_CHANCE` until it bites only a developed, sprawling city.

---

## Execution notes (2026-07-24)

_(filled in as goals land)_
