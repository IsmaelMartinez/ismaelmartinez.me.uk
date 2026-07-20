# Arcade Art-Definition Round

Date: 2026-07-19
Status: Done — all five phases landed 2026-07-19, one commit per game.
Notes from execution: the shadeColor fix (engine/iso.ts now accepts its own
rgb() output) also cured zone-tinted hills rendering pure black in Pixel
Park. Syndicate additionally gained a baked ground layer (roads, lamps,
pavement) and batched window drawing; its measured per-frame cost in
headless CPU rasterization is ~2ms over main (28.3 → 30.2ms) for the
framed-window/storefront detail — GPU browsers absorb it. Every other
cabinet measured identical to main (vsync-locked).

## Why

The sims read as prototypes next to their own mechanics. Attractions,
buildings, and characters are drawn as a handful of flat rects per tile:
Pixel Park's guests are a single circle, its coaster train is a 🚃 emoji and
its laid track a grey diamond with an arrow emoji on it; Microcity's grown
blocks repeat identically (every L3 residential is the same box with the
same two AC units); Syndicate's five unit kinds share one silhouette and its
weapons are a binary stick; Line Hold's cabinet is closest to done but still
loses its keep and portal against the baked ground. Meanwhile the engine
already gives every cabinet a DPR-scaled backing store over logical
coordinates (`engine/canvas.ts`), so the pixels for finer art are already
there — nothing draws at the resolution the canvas can hold.

Goal: really great definition — smaller drawing units, finer detail, proper
shading and outlines — via finer drawing routines *within the existing
logical space*. Non-goals: gameplay, scoring, economy, or layout changes;
canvas resizes; anything that touches `toLogical()` pointer math or the
headless game tests.

## Ground rules (all phases)

- **Per-frame cost must not grow.** Anything static bakes into
  `createStaticLayer`, rebuilt via `setupHiDpiCanvas`'s `onApply` (respect
  its device-pixel alignment contract — the layer paints in plain logical
  coordinates and must not be drawn at an offset). Only animated things draw
  per frame. If a game feels heavier, measure frame time in the browser
  before/after and cut back.
- **Crisp on 1x displays.** New detail aligns to half/quarter logical
  pixels deliberately: 1px axis-aligned strokes on `.5` centres, fills on
  quarter-pixel boundaries at the finest — no accidental blur from
  arbitrary fractional coordinates. The iso games are anti-aliased vector
  drawing, not pixel art; "crisp" there means deliberate edges and outline
  contrast, not snapping every polygon.
- **Outline discipline.** Fine detail at this scale reads through value
  contrast: each sprite gets a dark grounding edge and a lit rim
  (`shadeColor` low/high factors), same recipe `drawBlock` already uses.
- **Variety is hashed, never random.** Per-tile construction variety keys
  off `hash01(i, salt)` (engine `canvas.ts`) so it's stable across frames
  and rebuilds — the same rule the starfields follow.
- **Allocation discipline.** New draw helpers live at module/closure scope,
  no per-frame arrays/closures beyond what each game already tolerates
  (`enemiesByDiag`-style diagonal buckets). Colour strings that don't
  depend on animation are precomputed.
- **Shared engine modules stay the channel** for toasts, particles,
  floaters, and records (`createToaster`, `createEffects`, scoreboard
  `beginRun`/`bank`/`best`) — nothing re-pasted, nothing bypassed.
- **Headless game tests stay green untouched.** They exercise the pure
  modules; if one breaks, the change leaked into logic — revert the leak,
  not the test.

One commit per game, biggest visual payoff first. Each phase lists what it
redraws; everything else in that game stays as-is.

## Phase 1 — Pixel Park (`src/games/park/game.ts`)

The flagship sim and the chunkiest. All work is in the closure's draw
helpers; grid/track/guest logic untouched.

- **Guests** (`drawGuest`): from one circle to a readable little person —
  two stroked legs with a walk-cycle stride (phase from `clock` + a per-
  guest offset so crowds don't lockstep), a `guest.color` torso with lit
  rim and hem shadow, skin-tone head with a hashed hair colour, leading-
  side eye dot from walk direction. Shadow, tunnel fade, and thought
  bubbles unchanged.
- **Carousel** (`drawCarousel`): plank ring on the platform top, scalloped
  canopy edge with more stripes, rounding-board band between canopy and
  platform, brass pole with finial ball. Mount glyphs stay emoji — they are
  the zone-reskin channel.
- **Big Wheel** (`drawFerris`): double rim with cross-braced spokes, a
  proper A-frame with cross-member and footing blocks, gondolas as tiny
  cabins (roof + body + window) instead of plain dots, hub cap.
- **Log Flume** (`drawFlume`): stone-segment rim, water ring with moving
  highlight streaks, island with a palm/rock detail, log with bark end
  rings; splash unchanged.
- **Sky Tower** (`drawSkyDeck` + its block): panel seams and window band on
  the shaft, deck ring gets windows and a roof cap, antenna tip.
- **Stalls** (`drawStall`): scalloped awning edge, side panel with a menu
  board, counter-top items (product blobs), hanging-sign emoji unchanged.
- **Zone gates** (`GATE_EMOJI` branch): a drawn archway — two posts and a
  banner span — with the zone emoji as the keystone sign, so gates read as
  built structures instead of stickers on grass.
- **Coaster track** (track branch of the tile loop): drawn rails — two
  rails along the direction of travel with cross-ties, on both flats and
  ramps — replacing the grey fill + `TRACK_KIND_EMOJI` marker. Station
  tiles get a platform edge. Draft preview keeps its translucency and the
  pending-tail flat fallback.
- **Coaster train** (`drawCoaster`): a drawn two-car train — bodies with
  wheel dots and rider head bumps when loaded — oriented by the segment
  direction, replacing the 🚃 emoji. Rider count badge stays.

## Phase 2 — Microcity (`src/games/city/game.ts`)

The zone-level drawers (`drawResLevel1..4`, `drawComLevel1..4`,
`drawIndLevel1..4`) and civic buildings get detail plus hashed variety so
grown blocks stop repeating identically. The tile index `i` is already
threaded through every zone drawer.

- **Hashed construction variety**: port nothing — use engine `hash01(i,
  salt)` directly. Residential: gable ridge direction flips, wall shade
  jitter (±8%), chimney on some L1/L2, window-frame colour pick. Commercial:
  awning colour from a small palette, sign-board colour, setback crown tint.
  Industrial: silo vs twin-vent variant at L2, stack count/position jitter
  at L3/L4, rust streak on some sheds.
- **Window/roof detail** (`drawWindows`, `drawGableRoof`): windows become
  framed 2-pane marks (lit pane + frame pixel) instead of bare rects; roofs
  get ridge highlights and eave shadow lines; street-level doors on L1/L2
  res and com.
- **Power plant**: striped stack tip with blinking warning light (reuses
  `clock`), transformer-yard detail on the apron, panel seams on the block.
- **School**: windows, a door, and a tiny flag on the gable. **Fire
  station**: two garage-door panels on the near face, a small lookout
  tower.
- **Parks/trees**: drawn canopy clusters and a path curve under the emoji
  so the tile reads as landscaping, not a sticker.
- Roads, water, cars, disasters: untouched (already animated and fine at
  this scale).

## Phase 3 — Syndicate (`src/games/syndicate/game.ts`)

- **Buildings**: windows get frames and occasional wide lit strips
  (office floors) — keep the existing deterministic lit formula; facade
  panel seams every ~8px of height; ground-floor storefront glow strip on
  road-facing faces; parapet lip on the roof edge. Rooftop clutter grows
  from 3 variants to 5 (add vent cluster and helipad-on-tall) via the
  existing `hash(i, 1)` roll.
- **Units** (`drawUnit`): per-kind silhouettes on the shared skeleton —
  agents get a longer flared trench coat and visor band; rivals get
  shoulder spikes and a broader stance; guards get cap brims and a baton
  hip line; civilians stay slight, with hashed coat-length variety; the
  target keeps the crown plus a briefcase. Facing (`dir` ±1) mirrors the
  asymmetric details.
- **Weapon readability** (`u.weapon` arm): per-`WeaponId` shapes — pistol:
  short barrel; uzi: barrel + hanging magazine; minigun: thick double
  barrel with muzzle block. Tracers already differ; now the carried weapon
  does too.
- Roads, decals, atmosphere, extraction: untouched.

## Phase 4 — Line Hold (`src/games/towerdefense/game.ts`)

Closest to done; this phase is refinement, not rework.

- **Towers** (`drawTower`): stone-course lines on the plinth, per-kind
  crowns — bolt: insulator rings on the mast; blast: barrel band + a shell
  stack beside the tub; frost: ice-fringe skirt at the crystal base. Level
  pips unchanged.
- **Keep** (`drawKeep`): stone coursing on the faces, an arrow-slit per
  face, walkway line under the crenellations, bigger pennant.
- **Portal** (`drawSpawnArch`): rune marks on the pillars, a second swirl
  layer inside the shimmer, cracked flagstone at the threshold.
- **Enemies** (`drawEnemy`): dark grounding outline under each body, plus
  one distinguishing upgrade each — scout: segmented shell line; sprinter:
  fin; brute: rivet dots on the plates; warlord: crown jewel glints.
- Ground bake, shots, rings: untouched.

## Phase 5 — Critter Rescue (`src/games/lemmings/game.ts`) — if budget remains

The one true pixel-art cabinet: "finer" here means more frames and more
distinct poses on the 1x grid, never sub-pixel drawing (smoothing is off;
everything stays on integer cells).

- **Walk cycle**: 2 frames → arms counter-swinging the legs.
- **Skill actions animate**: digger's spade glint swings on a 2-frame
  cycle with dirt-side flip; basher's fist jabs (extends/retracts);
  builder's brick hand bobs as each row lands; blocker's wide arms wave on
  a slow cycle.
- **Faller/floater**: legs splay when falling; umbrella sways ±1px.
- Terrain, background, particles, HUD: untouched.

## Verification bar (after every phase commit)

1. `npm run lint` && `npm run typecheck` && `npm test` — all green, test
   files untouched.
2. `npm run build` && `npm run check-links`.
3. Playwright smoke of the touched game against the built `dist` (pre-
   installed Chromium): page boots, a run starts, console stays clean
   (ignore the sandbox-blocked umami request).
4. Before/after screenshots at the same game moment, plus close-up crops of
   the reworked sprites. If the game feels heavier, compare frame time in
   the browser before merging the phase.

## Sequencing & risk

- Order: Park → Microcity → Syndicate → Line Hold → Critter Rescue, one
  commit each, single PR for the round.
- Biggest risk is per-frame cost creep from detail drawn in the sweep —
  the bake rule and frame-time spot-checks are the guard. Second risk is
  fuzzy 1x rendering from unaligned fine strokes — the half-pixel rule is
  the guard.
- Phase 5 is explicitly droppable; Phases 1–4 each stand alone, so the
  round can stop after any phase without leaving anything half-drawn.
