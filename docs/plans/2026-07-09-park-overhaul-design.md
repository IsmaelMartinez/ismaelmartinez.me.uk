# Pixel Park Overhaul: Terrain, Water, Tunnels & a Real Coaster Editor

Date: 2026-07-09
Status: Terrain elevation, water, tunnels, theme zones, and the coaster
track editor are all shipped.

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

## Shipped this pass: drag-to-build coaster track editor

This was the biggest remaining piece — a genuinely different interaction
model from every other tool in the game (single-tile stamp).

**Data model.** A track is an ordered list of segments,
`{ tile: number; dir: 0|1|2|3; kind: 'flat' | 'up' | 'down' | 'turnL' |
'turnR' | 'tunnelIn' | 'tunnelOut' | 'station' }`, forming a loop. `dir` is
recorded empirically — the direction from this segment's tile to the next
one, i.e. whichever neighbour the player tapped next — rather than derived
from `kind`; `kind` is validated against the observed `dir`/height sequence
afterwards, not the other way round. The pure `track.ts` module's
`validateTrack` checks minimum length (`MIN_TRACK_LENGTH = 6` — the smallest
rectangle that can fit a straight, station-eligible segment; a 2×2 loop is
all corners), no revisited tiles, exactly one `station` segment, loop
closure (each segment's `dir` must actually reach the next tile, and must
match what its `kind` implies — a turn rotates the incoming direction, a
straight piece continues it), each segment's height delta matching its kind
(`up`/`down` against the real terrain `heights[]`, everything else flat),
and "steepness" (no two consecutive `up`/`down` segments without a flat
between them). `rotateToStation` then rotates a validated loop so the
station is always index 0, so the runtime cart's progress `u ∈
[0, segments.length)` has the station fixed at `u = 0` — "wrapped past 0"
directly means "back at the station". All of this is fully unit-tested
against plain segment arrays built by a small geometric `rectLoop` test
helper, no canvas involved, in `tests/games/park.test.ts`.

**Build interaction.** A dedicated "Track" tool switches the canvas into
track-laying mode (bypassing the touch arm-then-confirm pattern every other
tool uses, since drafting is already its own tap-by-tap flow): tap a tile
adjacent to the current draft head to extend it with the selected piece
type from an 8-button sub-palette, tap the head's own tile again to undo the
last piece, tap back at the start tile to close the loop (once it's at
least `MIN_TRACK_LENGTH`), then "Test Track" runs `validateTrack` +
`canPlaceTrack` (every segment tile still grass) and either commits the
loop (`£40`/tile, deducted in one lump sum) and opens the coaster, or
toasts why it failed. This lives entirely in `game.ts` as a small state
machine (`trackDraft: Segment[] | null`, `trackClosed: boolean`) rather than
reusing the existing select-tool → click-tile flow; the sub-palette,
status line, and Close Loop/Test Track/Cancel controls are new markup in
`park.astro`.

**Cart & guests.** A cart is a single entity per open `Coaster`, cycling
`loading` (boarding up to `CAR_CAPACITY` queued guests, paying
`TRACK_RIDE_PRICE` per boarding) → `running` (progress `u` advances each
tick via `advanceU`, `speed` updated via `nextCartSpeed` — accelerate
downhill, decelerate but never stall uphill, drag toward cruise speed on
flats/turns/tunnels/the station; a simplified energy model, not real
physics, same spirit as Tank Duel's `simulateShot`) → back to `loading` once
`u` wraps past the station. Guests get a new `thrill` need (decaying slower
than the other four, since a coaster is a much bigger build than any single
stall) driving them to queue at a coaster's station via `chooseAction`;
riding guests aren't drawn individually — the cart stands in for them, with
a rider-count badge — and disembarking pays out `thrillBoost(segments,
heights)`, scaled by total height drop and loop length, so taller hills and
longer tracks make an objectively better coaster. Bulldozing any one tile of
a built coaster tears down the whole loop and cart, returning queued/riding
guests to idle.

**Rendering.** `engine/iso.ts` gained `drawRamp`, generalizing `drawBlock`'s
one-uniform-height-per-tile corner math to four independently-liftable
corners, used for `up`/`down` segments bridging two different terrain
heights; every other segment kind renders as a flat rail-coloured diamond
with a small directional/kind icon on top. The in-progress draft renders
live at reduced opacity so a player can see exactly what they're laying
before committing it.

## Build order (all shipped)

1. ~~Terrain elevation (heights, raise/lower, slope rendering)~~
2. ~~Water tiles + Log Flume~~
3. ~~Tunnels (dig, hidden-underground guests) + Sky Tower~~
4. ~~Theme zones (gates, ground tint, cosmetic reskins, native-attraction discount)~~
5. ~~Coaster track editor (data model, build UI, cart entity, `thrill` need)~~

Each landed the same way the base game did: pure modules + tests in
`tests/games/park.test.ts`, translation keys across en/es/cat, no new
runtime dependencies. This closes out the overhaul described in this
document; further Pixel Park work should start a new design doc.

## Amendment (2026-07-14): terrain cascades, track lays itself, drawn rides

Play-feedback pass revising three of the systems above; the code comments in
`grid.ts` / `track.ts` / `game.ts` are the source of truth for details.

**Terraforming cascades.** `raiseLand`/`lowerLand` no longer refuse when a
change would breach the one-step slope rule — `terraformPlan` (grid.ts)
pushes the offending neighbours along, recursively, so hills can climb past
height 1 without hand-building pyramids (the Sky Tower's `minHeight: 2` is
now reachable in two taps). The push refuses only when it would have to move
something immovable (water, buildings, track, the entrance). Cost scales
with the total height steps moved (`terraformSteps × £20`), so the flat
toolbar price is just the one-tile case.

**Track drafting simplified.** The 8-piece sub-palette shrank to 4
(station/flat/climb/drop; `tunnelIn`/`tunnelOut` dropped from `SegmentKind`
entirely). Corners are derived from where the player taps (`turnKind` in
track.ts) instead of being picked; a climb/drop piece *pushes the terrain
under the new tile to fit* (same `terraformPlan`, draft tiles locked as
anchors) rather than demanding pre-shaped land; undo/cancel restore the
pushed heights exactly, and the shaping is charged with the track itself at
Test Track. The closing tap derives the final piece from the height gap back
to the start, and the station re-homes to the first level straight if the
start turned out to be a corner (or was never placed at all) — so "draft a
loop, close it, test it" works with no piece bookkeeping. `validateTrack` is
unchanged and stays as the safety net (manual terraforming under a draft can
still invalidate it).

**Rides are drawn, not spun emoji.** The old `ctx.rotate` on the ride glyph
left the carousel horse upside down half the time. The carousel is now a
platform + striped canopy with three upright mounts orbiting the pole
(glyph still themed by zone reskin), the Big Wheel is an actual spoked wheel
on A-frame legs with upright gondolas, the Sky Tower has an observation ring
that rides its (slimmer) shaft while in use, and the flume log bobs. Broken
rides freeze and dim as before.
