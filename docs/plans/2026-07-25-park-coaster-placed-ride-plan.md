# Pixel Park — coaster becomes a placed 2×2 ride (2026-07-25)

## Why

The roller coaster is the one attraction in Pixel Park that isn't just dropped on the map. Every other ride (carousel, Big Wheel, Pirate Ship, Haunted Manor, …) is a single tile you place; the coaster is a drag-to-build loop of individual `track` tiles governed by fiddly geometry rules: the station must sit on a straight run, a climb or drop needs a flat piece on either side, the loop has to close and pass a validator, and climb/drop pieces reshape the terrain under them tap by tap. The owner finds that friction annoying and wants the coaster to "just work": a bigger placed ride, roughly four squares, with no track laying and no up/down.

This replaces the track editor with a placed 2×2 coaster that behaves like any other `thrill` building. It deletes a large, intricate subsystem (the whole of `track.ts`, plus the drafting state machine, the `Coaster` runtime, and the rail/cart rendering in `game.ts`) and folds the coaster into the generic building path. The Pirate Ship stays the single-tile thrill option; the coaster is the premium, top-thrill one that costs more and takes more room.

## What the coaster becomes

A `coaster` `BuildingDef` with `satisfies: 'thrill'`, `boost: 100` (the best thrill in the park), a premium `price`, and a new `footprint: 2` (a 2×2 block). It is placed, used, breaks down, and is bulldozed through exactly the same code paths as every other building. There is no runtime object, no cart, no queue, no track geometry: a guest walks to a tile beside the ride, uses it for `useTime` seconds, pays `price`, and has its `thrill` need restored by `boost`, identical to how the Pirate Ship already works.

## The footprint concept (the one genuinely new idea)

The grid is single-tile everywhere today. A 2×2 ride needs the grid to understand that one building occupies four tiles. The minimal model: the top-left tile is the anchor and holds the building's `TileType` (`coaster`); the other three hold a new inert `rideannex` tile type that is not walkable, not buildable, and draws nothing on its own. From any of the four tiles the whole block is recoverable, so bulldozing any one clears all four, and guest routing considers every side of the block.

### grid.ts contract (frozen — tests and the UI are written against these exact signatures)

- `TileType` gains `'coaster'` and `'rideannex'`, and loses `'track'`.
- `Tool = Exclude<TileType, 'grass' | 'entrance' | 'rideannex'> | 'bulldoze' | 'raiseLand' | 'lowerLand' | 'digTunnel'` (annex is never a selectable tool; `track` is gone).
- `BuildingDef` gains `footprint?: number` (side length in tiles; absent means 1).
- `BUILDINGS.coaster = { cost: 800, price: 8, upkeep: 34, satisfies: 'thrill', useTime: 4.5, boost: 100, footprint: 2 }`, inserted right after `pirateship`.
- `SIMPLE_COSTS` loses its `track: 40` entry.
- `export const MAX_FOOTPRINT = 2` — the search bound for annex→anchor recovery.
- `export function footprintTiles(x, y, size): number[] | null` — the `size×size` tile indices anchored at top-left `(x, y)`, or `null` if the block falls off the grid. `size` 1 returns `[idx(x, y)]`.
- `export function footprintOf(tiles, i): number[]` — every tile of the multi-tile ride that tile `i` belongs to, whether `i` is the anchor or an annex; `[i]` for a single tile or bare ground.
- `canPlace` for a `footprint > 1` building requires: the whole block on-grid, every block tile `grass`, every block tile at the anchor's height (a flat pad, so the sprite never straddles a slope), at least one block tile touching a walkable tile outside the block, plus the usual `minHeight`/`needsWater` (evaluated across the block). For `footprint` 1 the logic is arithmetically identical to today, so single-tile placement is unchanged.
- `applyTool` for a `footprint > 1` building writes `rideannex` to the block then the anchor tile last; its `bulldoze` clears every tile of `footprintOf(i)`. Single-tile writes and single-tile bulldoze are unchanged.

### pathfind.ts

`adjacentWalkable(tiles, building)` returns the walkable tiles adjacent to any tile of `footprintOf(building)` (deduplicated, excluding the block itself). For a single-tile building this is exactly today's behaviour, so `nearestReachable` still returns the anchor as the building to stand beside, and a guest can approach a 2×2 coaster from whichever side has a path.

### mayhem.ts

`isRide('coaster')` is already true (it satisfies `thrill`), so the coaster joins the normal breakdown system for free. The coaster-stall flavour (`STALL_CHANCE`, `STALL_SECONDS`, `coasterStallChance`) is deleted — there is no cart to jam; a coaster now breaks down like any other ride.

## game.ts surgery

Deleted outright: every import from `./track`; the `Coaster` interface; the `TRACK_RIDE_PRICE` / `LOAD_WAIT` / `QUEUE_CAP` constants; the `coasters`, `breakdowns`-adjacent track draft state (`trackDraft`, `trackClosed`, `trackKind`, `draftSteps`, `railCache`, `railCacheKey`); the track DOM refs and every `track*` / `coasterStall` string plus `TRACK_ERROR_MESSAGES`; `createCoaster` / `removeCoaster` / `updateCoaster`; the entire drafting block (`updateTrackStatus`, `toolHitsDraft`, `draftLockedTiles`, `trackTapValid`, `draftCost`, `planTrackTap`, `handleTrackTap`, `cancelTrackDraft`, `testTrack`, the `TrackTap` type); the rail rendering (`TrackGeom`, `computeTrackGeom`, `drawTrackGeom`) and the cart rendering (`railZ`, `cartPoint`, `cartTangent`, `drawTrainCar`, `drawCoaster`); the `selectedTool === 'track'` click branch and the special track-bulldoze branch; and the track-kind / close / test / cancel button wiring.

Kept but simplified: `terraformCharge`, `manualTerraformPlan` (it no longer threads a draft lock, so it is just `terraformPlan(tiles, heights, i, target)`), and `placementCost`. `chooseAction`'s thrill branch collapses into the generic building branch — thrill is now just another building need. `arrive` loses its coaster lookup. `invalidateGuests` loses the `=== 'track'` clause. `hasAnyBuilding` loses `|| coasters.length > 0`.

Added: `coaster` entries in `TILE_EMOJI`/`BUILDING_STYLE` (the latter carries the visual top height for floaters); a `drawCoasterRide(anchorTile, busy, broken)` that renders the 2×2 ride, called in a post-grid pass where `coasters.forEach(drawCoaster)` used to run (drawn after the tile loop so the four-tile sprite is never clipped by its own front tiles' ground); an exclusion so the anchor is skipped in the in-loop building draw (`BUILDINGS[tile] && tile !== 'coaster'`); and a footprint-aware hover highlight that strokes all four tiles when a `footprint > 1` tool is selected.

## UI + i18n (parallel, disjoint files)

`park.astro`: the `track` toolbar entry becomes `{ id: 'coaster', emoji: '🎢', label: t('fun.park.toolCoaster'), cost: 800 }`; the `trackKinds` array, the `#track-palette` block and its CSS, and every `data-t-track-*` and `data-t-coaster-stall` attribute are removed. `data-t-too-steep` stays (the raise/lower path still uses `fun.park.tooSteep`).

`translations.ts`: remove the ~22 track/coaster keys per locale (`toolTrack`, `trackKind*`, `trackClose/Test/Cancel`, every `track*` status/error, `coasterStall`), keep `tooSteep`, and add `fun.park.toolCoaster` ("Roller Coaster" / "Montaña Rusa" / "Muntanya Russa") in all three locales.

## Tests (parallel, disjoint file)

`park.test.ts`: delete the whole `coaster track` describe (it tests `track.ts`, which is gone). Update the catalogue test so "the only single-tile thrill satisfier" filters thrill AND `footprint === 1` (still `['pirateship']`; the coaster is thrill but 2×2). Update the mayhem test's `isRide('track')` to `isRide('coaster') === true` and drop the `coasterStallChance` assertions. Add coverage for the new surface: `footprintTiles` (four indices; null off-grid), `canPlace` for the coaster (2×2 grass + flat pad + adjacency; rejects a blocked tile, a non-uniform pad, an off-grid block, no adjacent path), `applyTool` writing anchor + three annexes, `footprintOf` from the anchor and from each annex, bulldozing any block tile clearing all four, the coaster counting once in `attractionCount`/`dailyUpkeep`, `adjacentWalkable` spanning the whole footprint, and a headless thrill-starved guest routing to and being satisfied by a placed 2×2 coaster.

## Verification

`npm run lint && npm run typecheck && npm run build && npm test && npm run check-links` all green. Manual: place a coaster (highlight shows the 2×2, it costs £800, drops with no track laying), watch thrill-seeking guests use it, bulldoze any of its four tiles to clear the whole ride, confirm it can break down.

## Status

Applied and green on the full bar: lint clean, typecheck 0 errors, build 158 pages, 578 tests, links verified. `track.ts` deleted; `game.ts` dropped from 3469 to ~2860 lines. The i18n/UI edits and the test rewrite were done in parallel subagents against this frozen contract; the grid/pathfind/mayhem/game core and the `drawCoasterRide` sprite were done in the main session. CLAUDE.md's stale `railCache` note was corrected and a Round 12 clause appended.
