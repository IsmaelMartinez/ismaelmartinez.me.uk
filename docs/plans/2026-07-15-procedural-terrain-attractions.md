# Procedural Starting Terrain (Pixel Park & Microcity) + Attraction Polish

Date: 2026-07-15
Status: Shipped.

## Context

Both sims always started on a dead-flat board: every run felt identical, and
the terrain features shipped in the park overhaul
(`2026-07-09-park-overhaul-design.md`) — hills, water, tunnels, the Log
Flume's water gate, the Sky Tower's height gate — only mattered once the
player hand-built land for them. This pass makes every "New Park" / "New
City" roll a different starting map, and finishes the park's attraction
rendering pass (the flume and the stalls were still emoji on blocks).

## Pixel Park: generated terrain in `createPark()`

`createPark(random = Math.random)` in `src/games/park/grid.ts` is now the
generator — pure and seedable (pass a deterministic `random` for the same
map every time). `createFlatPark()` keeps the old blank board for tests.

**Rolls.** Water first: 35% a coastline along the top/left/right edge
(depth wandering 1–3), otherwise one or two ponds (random-growth blobs of
3–7 tiles) — natural Log Flume sites from day one. Then 1–3 hills: height
falls off one step per Chebyshev ring beyond a flat top, so a hill (and any
max-merge of overlapping hills) satisfies the one-step slope rule *by
construction* — no post-hoc smoothing pass. Peaks of 2–3 (65% of rolls per
hill) are free Sky Tower sites (`minHeight: 2`). Height-1 hills always get
a widened top (3×3/5×5 plateau): a lone raised tile reads like a rendering
glitch.

**Hard constraints.** Hill footprints must be all-grass (water only exists
at height 0, entrance/paths stay flat) and, like water, must clear
`ENTRANCE_CORE` — a 9×5 flat rectangle around the entrance and its starter
path — so the early game never fights the terrain. Ordering does the proof
work: water only lands on what is then all-flat grass, hills then refuse to
overlap water, so "water only at height 0" can't be violated.

**Tests** (`tests/games/park.test.ts`): across 60 spread seeds — slope rule
everywhere, heights within range with at least one hill, entrance + starter
path flat and intact, entrance core untouched, ≥150 flat grass tiles, water
count in range and all at height 0, same-seed determinism, cross-seed
variation. (Seeds are spread by a large prime: the test LCG's first draw
barely moves across small consecutive seeds, which would otherwise pin the
coast-vs-ponds roll.)

## Microcity: varied water styles

`generateTerrain` in `src/games/city/terrain.ts` now rolls a water style
and returns it (tests assert on it; the game ignores it): 55% river — now
horizontal *or* vertical, with the channel width wandering between one and
two tiles in stretches — 23% one or two blob lakes (`carveLakes`), else a
coastline flooding any one edge at depth 1–4 (`carveCoast`). Forests are
unchanged. Same invariant-testing approach in `tests/games/city.test.ts`:
per-style shape checks, water/buildable-land count ranges across seeds,
style variety, determinism.

## Park attractions: flume + stalls drawn, not emoji on blocks

Same play-feedback rationale as the 2026-07-14 "rides are drawn" amendment:

- **Log Flume** (`drawFlume` in `game.ts`): a low platform holding an oval
  water channel around an island, with a log running the circuit — faster
  with spray thrown off the front of the loop while guests ride, a slow
  drift when idle, frozen and dimmed when broken. A zone reskin's emoji
  (swan/croc/octopus) replaces the drawn log as the themed vehicle, the
  same slot the carousel gives its mounts.
- **Food & drink stalls** (`drawStall`): tiny buildings — a hut block, a
  striped awning sagging over the two viewer-facing sides, a pale counter
  band, and the product emoji as a hanging sign that bobs while a customer
  is served.

No new translation keys: both changes are generation + rendering only.
