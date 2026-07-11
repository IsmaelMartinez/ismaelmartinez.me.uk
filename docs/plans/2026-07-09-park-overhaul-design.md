# Pixel Park Overhaul: Terrain, Water, Tunnels & a Real Coaster Editor

Date: 2026-07-09
Status: Terrain elevation, water, tunnels, and theme zones shipped. The
coaster track editor is designed but not built.

## Context

Pixel Park (`/fun/park`, shipped in the arcade expansion, see
`2026-06-10-arcade-expansion-design.md`) is a flat 24×14 grid: every tile is
one of a handful of types, every building is a single flat-topped block, and
the only "height" in the game is the fixed decorative extrusion per building
type. The ask: make it read like a real theme park (Efteling-style) — land
that rises and falls, rides that climb and dive and burrow under hills, water
features, and distinct themed areas — not just a denser tile palette.

That's a large jump from the current model. Rather than attempt it all at
once, this pass ships the foundation every later piece depends on (a real
heightmap) plus two features built directly on it (water, tunnels), and
designs the two biggest remaining pieces — theme zones and a genuine
drag-to-build coaster track editor — for follow-up sessions, the same way
Critter Rescue was designed alongside Tank Duel rather than built immediately.

## Shipped this pass: terrain elevation

**Model.** A parallel `heights: number[]` array (one entry per tile, integers
0–4). `raiseLand` / `lowerLand` tools nudge a tile's height by 1. To keep
every tile's four side faces renderable as flat quads (no gaps, no floating
blocks), a tile's height may never differ from a walkable/buildable
neighbour's by more than 1 — `canPlace` enforces this and the tool no-ops
with a toast (`fun.park.tooSteep`) rather than silently clamping. Terraforming
is blocked under buildings, water, and the entrance (bulldoze first); it's
allowed under grass and path, so paths can be sculpted into ramps as the land
rises.

**Rendering.** `engine/iso.ts`'s `drawBlock` gained a `zOffset` parameter
(pixels to lift a block's base before drawing its own height on top). Terrain
itself doesn't use `zOffset` — a raised tile is one `drawBlock` call with
`height = heights[i] * TERRAIN_STEP` and `zOffset = 0`, so it draws as a
single extruded block from sea level up to the tile's height (a stepped hill,
not a smooth slope; consistent with the game's existing blocky-iso look and
far cheaper than true slope geometry). `zOffset` is for what sits *on* that
terrain: a building on a raised tile is drawn with its own height and
`zOffset = heights[i] * TERRAIN_STEP`, so its base starts at the hill's
surface instead of at sea level.

**Gameplay hook.** A new attraction, **Sky Tower** (🗼), requires the tile it
sits on to be at height ≥2 — the first building that rewards terraforming
instead of just tolerating it.

## Shipped this pass: water

New `water` tile type, buildable only on height-0 grass (lakes are flat).
Rendered as a flat blue diamond with a cheap animated ripple (per-tile phase
offset into a sine wave, no extra state). Bulldozable back to grass like any
other tile.

**Gameplay hook.** **Log Flume** (🪵) is the first building with a *water*
adjacency requirement instead of (well, in addition to) a path requirement —
it needs both a path tile and a water tile among its neighbours, so building
one means digging a small pond next to your path network.

## Shipped this pass: tunnels

A flat (height 0) path tile can be flagged via a parallel `tunnels: boolean[]`
array, set by the new `digTunnel` tool. It only applies where the smoothing
rule's mirror holds: at least one orthogonal neighbour must be at height ≥1
(you're cutting into a hillside, not digging a pit in flat ground) — raising
or lowering that tile's own land afterwards clears the flag again, since a
tunnel is only meaningful at height 0. Rendered as a dark arch cut into the
hill's face on the side(s) facing raised neighbours. Guests standing on (or
crossing into/out of) a tunnelled tile are faded out in `drawGuest` — they
visually vanish into the tunnel and reappear on the far side. This is a
rendering trick, not a real underground layer (pathfinding is unaffected,
same v1 simplification the base game already makes for ride capacity/queues)
— but combined with a hill it reads exactly like a coaster or path ducking
under the landscape.

## Shipped this pass: theme zones

**Model.** Three zones — Fairytale (unlocked from the start), Adventure/
Jungle (rating ≥60 & £3000 banked), and Pirate/Water (rating ≥75 & £6000) —
gated by park rating + cash thresholds, matching the existing `parkRating`
idle-at-50 curve and the pacing of a 10–15 minute run. `zoneUnlocked` in
`grid.ts` evaluates the thresholds live against current rating/cash, the same
way every other placement gate (water adjacency, minimum height) is checked,
rather than latching permanently once crossed.

Rather than a painted zone overlay (extra per-tile state + UI), a zone is
"claimed" by placing a **Zone Gate** decoration (`gateFairytale` /
`gateAdventure` / `gatePirate`, buildable like any other grass decoration
once unlocked). `zoneAt(tiles, i)` finds the nearest placed gate by
Chebyshev distance (reusing `engine/grid2d.ts`'s `chebyshev`) and returns
its zone, or `null` if no gate exists yet — a pure Voronoi partition with no
influence radius, so a single gate anywhere claims the whole map until a
second gate splits it. This determines a tile's theme for rendering purposes
only (guest pathing and building rules are unaffected):

- Ground tint on grass tiles (Fairytale → mossy green, Adventure → jungle
  green, Pirate → sandy tan), blended with the existing checkerboard shading.
- Reskinned emoji + block colour for existing buildings when built inside a
  zone's influence (e.g. a carousel inside Fairytale renders pastel-pink,
  the same `carousel` tile inside Pirate renders as a cannon-deck spin ride)
  — purely cosmetic (`ZONE_BUILDING_STYLE` in `game.ts`), so `BUILDINGS`
  economics don't fork per zone.
- A 10% price/upkeep discount (`zoneDiscountFactor` in `grid.ts`) for placing
  a zone's native attraction (Fairytale → Carousel, Adventure → Log Flume,
  Pirate → Big Wheel) inside its own influence, additive to
  `toolCost`/`dailyUpkeep` rather than a new pricing table.

Pure logic (`zoneUnlocked`, `zoneAt`, `zoneDiscountFactor`, the discounted
`toolCost`/`dailyUpkeep`) is unit-tested in `tests/games/park.test.ts`
exactly like terrain/water/tunnels; rendering lives in `game.ts`; toolbar
entries and strings (locked-zone toast, gate labels) are in `park.astro` and
`translations.ts` across en/es/cat.

## Designed, not built: drag-to-build coaster track editor

This is the biggest remaining piece — comparable to or larger than Critter
Rescue's bitmap-terrain FSM effort — because it's a genuinely different
interaction model from every other tool in the game (single-tile stamp).

**Data model.** A track is an ordered list of segments,
`{ tile: number; dir: 0|1|2|3; kind: 'flat' | 'up' | 'down' | 'turnL' |
'turnR' | 'tunnelIn' | 'tunnelOut' | 'station' }`, forming a loop: each
segment's exit must match the next segment's entry tile/direction, and
exactly one `station` segment must exist (the load/unload point). A pure
`track.ts` module validates loop closure, minimum length, and max
"steepness" (no two consecutive `up`/`down` segments without a `flat` between
them — keeps the cart's speed model sane) — fully unit-testable against a
plain segment array, no canvas involved, mirroring how `bitmap.ts` /
`critter.ts` stay DOM-free for Critter Rescue.

**Build interaction.** A dedicated "Track" tool switches the canvas into
track-laying mode: tap a tile adjacent to the current track head to extend
it with the currently selected piece type (a small sub-palette of the 7 kinds
above appears above the toolbar), tap the head again to undo the last piece,
"Close Loop" once back at the start, then "Test Track" runs validation and
either opens the coaster (spawns a cart) or reports why it failed
(`needsStation`, `notClosed`, `tooSteep`). This is pointer-only, consistent
with every other tool, but it's stateful across multiple taps instead of one
tap = one placement, so it needs its own small UI state machine in `game.ts`
(`trackDraft: Segment[] | null`) rather than reusing the existing
select-tool → click-tile flow.

**Cart & guests.** A cart is a single entity per open coaster with a
progress `u ∈ [0, loopLength)` and a `speed` derived each tick from the local
segment's `kind` (accelerate downhill, decelerate uphill, small constant drag
on flats/turns) — a simplified energy model, not real physics, same spirit as
Tank Duel's `simulateShot`. Guests queue at the station tile (a new `queue:
number[]` per coaster, capped), board when the cart is at the station and
empty, ride the full loop, then satisfy a new `thrill` need scaled by the
coaster's total height drop and loop length — meaning taller hills and longer
tracks make objectively better coasters, which is the payoff for the terrain
system this pass ships.

**Rendering.** Track segments need angled connector art (not just flat
diamonds/blocks) — the `up`/`down` pieces in particular need to visually
bridge two different terrain heights, which is new geometry in `iso.ts`
(a "ramp quad" helper, generalizing `drawBlock`'s corner math to unequal
corner heights) reusable by nothing else in the game today.

**Scope estimate.** New pure module (`track.ts`, unit tested), new renderer
geometry (ramp quads), new stateful build-UI, new entity type (cart) with its
own tick, new guest need (`thrill`) threaded through `guests.ts` and
`chooseAction`. Roughly on par with Critter Rescue — plan it as its own
session rather than folding it into a broader pass.

## Suggested build order

1. ~~Terrain elevation (heights, raise/lower, slope rendering)~~ (shipped)
2. ~~Water tiles + Log Flume~~ (shipped)
3. ~~Tunnels (dig, hidden-underground guests) + Sky Tower~~ (shipped)
4. ~~Theme zones (gates, ground tint, cosmetic reskins, native-attraction discount)~~ (shipped)
5. Coaster track editor (biggest remaining effort — new data model, build UI,
   cart entity, `thrill` need)

Each lands the same way the base game did: pure modules + tests in
`tests/games/park.test.ts`, translation keys across en/es/cat, no new runtime
dependencies.
