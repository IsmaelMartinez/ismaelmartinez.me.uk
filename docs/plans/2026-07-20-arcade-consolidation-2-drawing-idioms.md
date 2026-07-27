# Arcade Consolidation Round 2 — Drawing Idioms & Render Baking

Date: 2026-07-20
Status: Done — all four extractions and both baking wins landed 2026-07-20,
one commit each, every commit verified byte-identical against the
pre-round baseline by the deterministic screenshot harness (seeded PRNG +
manually stepped rAF; nine captures across Line Hold, Syndicate, Microcity,
and Pixel Park, covering drafting, a committed coaster, and a rotated
view). Zone levels the captures can't reach deterministically (res/com L4)
are covered by preserved float-expression shapes plus unit tests.
Queue returns to `2026-07-18-arcade-candidates-3.md`.
Follows `2026-07-19-arcade-consolidation-plan.md` (support-code round) and
`2026-07-19-arcade-art-definition.md` (the art round whose new detail work
created most of these copies). The cabinet queue at
`2026-07-18-arcade-candidates-3.md` stays parked until this lands.

## Why

The art-definition round (PR #176) gave every iso cabinet real architecture —
coursed stone, glazed shopfronts, striped awnings, blinking rooftop beacons.
It did so by hand in each game, and four drawing idioms now exist as 3–5
separately maintained copies. Measured today (grep, exact):

| Idiom | Copies | Where |
|---|---|---|
| Inset block corner projection (`isoProject` × 3–4 at `x + inset` …) | 6 sites / 4 games | Line Hold plinth + keep, Microcity power plant, Pixel Park sky tower + stalls, Syndicate windows/storefront/neon |
| Face seam (W→S→E polyline at height *z*) | 4 | Line Hold plinth, Line Hold keep, Microcity power plant, Pixel Park sky-tower floors |
| Face band (quad interpolated along projected edges) | 5 | Syndicate storefront glow + late-shift strips, Microcity shopfront glass, Pixel Park awning strips + counter bands |
| Beacon blink (`Math.floor(clock * 1.5 [+ i]) % 2 === 0`) | 4 | Microcity com L4 + power plant, Syndicate rooftop antenna, Pixel Park sky tower |
| Rooftop mast / flagpole (6-line `#cbd5e1` stroke) | 3 (one game) | Microcity res L4, com L4, school |

Same failure mode the last round fixed for toasts/effects: a tuning change
(seam alpha, band inset, blink cadence) must be found and re-applied per game,
and each copy has already drifted in small ways that are accidents, not
choices.

Two per-frame cost items also fell out of the art round and were deferred:

- **Pixel Park rail geometry**: `drawTrackTile` runs ~15 `projectWorld`
  calls plus miter/curve math for every committed *and* drafted track tile,
  every frame — and the `trackByTile` map is reassembled per frame too. None
  of it changes except on track edit, terraform, or view rotation.
- **Microcity tile variety**: every zone building re-rolls `hash01` (up to
  ~8 calls) and rebuilds `shadeColor(...)` strings every frame for values
  that are fixed the moment the tile is built or grows. Park/tree
  landscaping re-rolls ~12 hashes per tile per frame the same way.

Goals: move the four idioms into shared helpers and migrate **every** copy;
land the two baking wins. Non-goals: any visual or gameplay change — every
commit must render pixel-identical frames; no new games; no new art.

## New engine surface

### `engine/iso.ts`

```ts
export interface BlockCorners {
  n: { x: number; y: number };
  e: { x: number; y: number };
  s: { x: number; y: number };
  w: { x: number; y: number };
}

/** Projected corners of the inset footprint on tile (x, y) — the four
 *  points drawBlock extrudes between. The idiom every face-detail pass
 *  (seams, windows, storefronts, awnings) re-derived by hand. */
export function blockFaceCorners(
  view: IsoView, x: number, y: number, inset = 0.08
): BlockCorners;

/** Appends the W→S→E face seam polyline at pixel height z to the current
 *  path. Callers batch several seams (and any bespoke joints) into one
 *  beginPath/stroke, exactly as the copies do today. */
export function blockSeamPath(
  ctx: CanvasRenderingContext2D, c: BlockCorners, z: number
): void;

/** Appends the quad spanning fraction t0–t1 along a projected edge a→b at
 *  lift `lift0`, closing along `aFar→bFar` (default: the same edge) at
 *  `lift1`. Path-append (not fill) so batched callers — Syndicate fills
 *  every late-shift strip in one path — keep their draw-call budget. */
export function faceBandPath(
  ctx: CanvasRenderingContext2D,
  a: Pt, b: Pt, t0: number, t1: number,
  lift0: number, lift1: number,
  aFar = a, bFar = b
): void;
```

`drawBlock` and `drawRamp` re-derive the same corner math internally; they
switch to `blockFaceCorners` so the engine has exactly one copy of it.
Vertex order matches the existing copies (t0 → t1 on the near edge, t1 → t0
on the far edge); all quads are convex so fill output is order-insensitive
anyway.

### `engine/canvas.ts` (beside `hash01`)

```ts
/** The arcade's beacon cadence: on/off half-phases of a ~1.33 s cycle.
 *  `phase` offsets the cycle so a skyline of beacons doesn't blink in
 *  lockstep (games pass the tile index). */
export function blink(clock: number, phase = 0): boolean {
  return Math.floor(clock * 1.5 + phase) % 2 === 0;
}
```

The rate stays hard-coded: all four copies use 1.5, and the whole point is
that the cadence is one shared decision. (Microcity's `clock * 2` warning
flash and `clock * 6` fire flicker are different idioms — alarm strobes, not
beacons — and stay put.)

Both new iso helpers and `blink` export through `engine/index.ts`.

## Migrations (every copy, no exceptions)

**blockFaceCorners + blockSeamPath**

- Line Hold `drawTower`: plinth `pw/ps/pe` → `blockFaceCorners(VIEW, x, y, 0.1)`;
  seam at z=2 via `blockSeamPath`; the two mortar joints keep their bespoke
  midpoint strokes off the shared corners.
- Line Hold `drawKeep`: `kw/ks/ke` → corners at inset 0.1; the three courses
  `[6, 11, 16]` via `blockSeamPath` in the existing single path; staggered
  joints and arrow slits read off the shared corners.
- Microcity power plant: `pw/ps/pe` → corners at 0.08; seams `[8, 15]`.
- Pixel Park `drawSkyDeck`: `w/s/e` → corners at 0.22; floor seams at
  `liftPx + towerH·r/4`; the window columns reuse the corners.
- Pixel Park `drawStall`: `e/s/w` → corners at 0.18 (the awning's outer
  overhang points stay bespoke — they're outside the footprint).
- Syndicate `drawWindows` / `drawStorefront` / `drawNeonTrim`: each derives
  its `w/sCorner/e` (+ `n` for neon) from one `blockFaceCorners` call at 0.08.

**faceBandPath**

- Syndicate storefront glow band (t 0.15–0.85, lifts 0.5→4).
- Syndicate late-shift office strips (t 0.18–0.82, lifts `sy±1.5`), staying
  inside the one batched path per building.
- Microcity shopfront glass (t 0.12–0.88, lifts 0.8→3.6).
- Pixel Park `drawAwningFace` strips (two edges: rim a→b at `rimLift`, outer
  aOut→bOut at `outerLift`) — the module-scope helper stays as the striping
  loop, delegating each quad.
- Pixel Park `drawCounterFace` (t 0–1, lifts `liftPx+6`→`liftPx+3.5`).

Microcity's `drawWindows`/`drawDoor`/`drawLedges`/garage doors interpolate
along edges but draw screen-axis `fillRect`s, not face quads — different
idiom, not migrated.

**blink** — the four beacons: Microcity com L4 (`blink(clock, i)` as a
colour ternary), Microcity power stack, Syndicate rooftop antenna
(`blink(clock, i)`), Pixel Park sky tower.

**Microcity mast drawer** — local helper in `city/game.ts` (three copies,
one game; not engine material until a second game wants it):

```ts
/** Thin rooftop mast/flagpole: one #cbd5e1 stroke from yBase up to yTop. */
function drawMast(x: number, yBase: number, yTop: number, width = 0.75): void;
```

Call sites: res L4 (`0.75`, −30.5→−35), com L4 (`1`, −31→−37, beacon stays
at the call site), school (`0.75`, −20→−27, flag stays at the call site).
Line Hold's keep banner pole and Pixel Park's sky-tower mast use different
colours/widths in different files — out of scope by the task's own framing
("in Microcity").

## Baking win 1 — Pixel Park rail geometry cache

Split `drawTrackTile` into:

- `computeTrackGeom(i, seg, prevDir, pending)` — all the current projection
  work (`e0/x0/c0`, per-sleeper points + z, the six mitred rail points,
  `zE/zX/zM`, the station platform quad, or just the pad centre for pending
  tiles), returned as a plain record.
- `drawTrackGeom(geom)` — the existing stroke/fill sequence reading the
  record. Draft translucency stays where it is (globalAlpha around the call).

Cache: `railCache: Map<tile, Geom>` plus the draft/committed flags that
`trackByTile` carries today — the per-frame map assembly folds into the same
cache. Validity key: `` `${worldVersion}:${rotation}` ``. Every mutation
that can move rails already bumps `worldVersion` (track taps, undo, cancel,
commit via cancel, bulldoze, terraform); the two gaps are view rotation
(covered by the key) and `resetPark`, which regenerates terrain without
bumping — `resetPark` gains a `bumpWorldVersion()` (also makes the hover
cache honest across resets; no behavioural change otherwise).

## Baking win 2 — Microcity per-tile variety

The zone drawers' `hash01` rolls and the `shadeColor` strings they feed are
pure in (tile index, type, level) — they only *change* when a tile is built,
grows, or decays. Add a per-tile cache:

```ts
interface TileVariety { key: string; /* type:level */ ... }
const variety: (TileVariety | null)[]  // indexed by tile
```

`varietyFor(i, tile)` compares `key` and recomputes on mismatch — build,
growth, decay, fire, tornado, quake, bulldoze all change `type`/`level`, so
self-invalidation by key needs no hooks into the sim. Cached per level:
wall-tint strings (the `shadeColor` results), gable/hip picks, door
positions, chimney/AC/mast presence, accent/sign colour picks, stack
jitter/heights, rust streak positions + length fractions, and the park/tree
canopy blob layout + flower roll. `drawWindows`' lit pattern is modular
arithmetic with no allocation — left alone.

## Commit plan

One commit per extraction, full verification between each:

1. this design doc;
2. `blockFaceCorners` + `blockSeamPath` + engine-internal reuse + all six
   call-site migrations + unit tests;
3. `faceBandPath` + five call-site migrations + unit tests;
4. `blink` + four call sites + unit test;
5. Microcity `drawMast` + three call sites;
6. Pixel Park rail cache;
7. Microcity variety cache;
8. CLAUDE.md arcade-section update + plan status flips.

## Verification bar (after every commit)

1. `npm run lint` && `npm run typecheck` && `npm test` — green.
2. `npm run build` && `npm run check-links` — green.
3. **Pixel-identical screenshots.** The idioms are deterministic geometry,
   so this round can hold a harder line than the effects round's "visually
   identical": a Playwright harness (pre-installed Chromium) seeds
   `Math.random` and drives `requestAnimationFrame` manually with fixed
   timestamps (the engine loop consumes the rAF timestamp, so stepped frames
   are fully deterministic), plays each touched game to a representative
   moment — Microcity with grown zones + power plant, Pixel Park with a
   stall/sky tower/coaster, Syndicate mission 1, Line Hold with towers —
   and captures the canvas. Before-images are taken once from the
   pre-round commit; after each commit the same script must reproduce them
   byte-for-byte (fall back to a pixel-diff report only if the browser
   itself introduces nondeterminism). The harness shipped with the round
   as `scripts/screenshot-games.js` (usage in its header) so future render
   refactors inherit the same bar.

## Risk

- Biggest: a migrated call site subtly reordering path verts or batching
  differently. Guard: path-append helper semantics (callers keep their own
  beginPath/fill/stroke batching) plus the pixel-identical screenshot bar.
- The two caches risk stale renders on a missed invalidation. Guards: the
  rail cache key covers every mutation route (audited above); the variety
  cache self-invalidates by key comparison per frame, so it cannot go stale.
- If the harness can't reach a game moment deterministically, fall back to
  the previous round's bar (visually identical before/after) for that game
  only, and say so in the PR.
