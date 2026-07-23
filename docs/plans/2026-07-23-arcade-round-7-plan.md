# Arcade Round 7 — Plan

Date: 2026-07-23
Status: **Planned — gates pending.** Round 6 (PR #194) is merged; this round
follows the owner's standing direction — deepen the shipped cabinets, tenth-
cabinet queue parked — seeded with the two carried-over candidates named at
Round 6's close: Pixel Park's attraction catalogue (the Round 5 audit's first
candidate) and Line Hold's marcher contrast touch-up (deferred from Round 6
G5). The repo bar applies to every commit: `npm run lint && npm run typecheck
&& npm run build && npm test && npm run check-links`, plus screenshot
before/after pairs for draw changes, headless proofs for balance/content
claims, i18n keys ×3 locales, and execution notes at the foot of this doc.
Round 6 process note carried forward: commit before measuring across
revisions.

## Fresh audit (the eight cabinets, post-Round 6)

| Cabinet | State after Round 6 | Gap found | Round 7 call |
|---|---|---|---|
| Syndicate | 9 missions, 4 objective moulds, 2× Wars-scale units, dark-but-lit ad-screen city | none pressing; the honest next depth step is a 5th objective mould (escort), rejected in Round 5 for its AI cost | rest (escort listed as stretch) |
| Line Hold | 18 waves + endless, proven no-perfect-runs contract, arcane-battery towers | the marchers carry Phase-4 detail but sit a full art generation behind the new coursed-stone batteries | **G2** |
| Critter Rescue | 25 proven levels in four acts, pinned difficulty arc | none — deepened in Rounds 5 and 6 | rest |
| Pixel Park | deepest sim: objectives, coaster editor, zones, mayhem — but 4 rides + 3 stalls | catalogue thin for a park sim; `thrill` is satisfied **only** by the coaster; the pirate zone's native ride is a re-used ferris | **G1** |
| Cascade | cascade-chain marathon, pure `run.ts` state machine, flat art strong | single mode; a sprint/daily variant collides with the higher-is-better top-10 model | rest (stretch) |
| Microcity | objectives, disasters, congestion | — | rest (back catalogue) |
| Tank Duel | tiers + ramp, drawn art | — | rest (back catalogue) |
| Snake | one board, flat ramp, drawn art | — | rest (back catalogue) |

Two audit facts sharpen G1 beyond "more content". First, `thrill` is a real
hole in the need economy: guests spawn with thrill 70–100 decaying at 0.6/s
(`guests.ts`), so in a park without a coaster every guest goes thrill-urgent
after roughly two minutes, `chooseAction` finds no candidates (its thrill
branch only scans `coasters`), and the unmet want feeds the 30% leave chance —
coasterless parks bleed guests with no counter the player can build short of
the editor's big commitment. Second, the pirate zone's `native` discount
points at the ferris (`grid.ts` `ZONES`) because no pirate-themed ride exists
— the zone has no thematic anchor. Both are fixed by the right catalogue picks
rather than by new systems.

Cross-cutting checks came back clean: all eight cabinets share the engine
audio module (chiptune + sfx, shared mute), the scoring conventions hold
everywhere, and no cabinet re-pastes the toast/effects/scoreboard channels.

## Ranked goals and execution order

| # | Goal | Cabinet | Kind | Gate |
|---|------|---------|------|------|
| 1 | G2 marcher contrast pass | Line Hold | Art (screenshots) | — (seeded, direction fixed by Round 6's checkpoint) |
| 2 | G1 attraction catalogue | Pixel Park | Content + art (headless + screenshots) | **Shortlist + pirate-native swap** |
| S1 | Syndicate escort mould | Syndicate | Content (headless) | stretch — owner opt-in |
| S2 | Cascade sprint/daily mode | Cascade | Mode (headless) | stretch — owner opt-in |

G2 runs first: it is small, carries no gate, and starts the round moving while
the G1 gate is answered (the Round 6 pattern). The goals touch different
cabinets, so screenshot baselines don't interact. One commit per goal, full
bar after each, single PR for the round.

---

## G1 — Pixel Park: the attraction catalogue (gate: shortlist + native swap)

**Intent.** Grow the catalogue with new ride/stall types drawn to the PR #176
bar (structure-first iso art with busy/broken states, hashed variety, clock
animation — the `drawCarousel`/`drawFerris` standard), picked to also close
the two audit gaps: a static `thrill` satisfier, and a pirate-zone anchor.

**Candidates for the gate** (owner picks 2–4; recommendation: the first
three):

| Candidate | Need | Cost/price/upkeep | Zone fit | Art concept |
|---|---|---|---|---|
| **Pirate Ship** (swinging galleon) | **thrill** (boost 70, useTime 4.5) | 500 / 7 / 26 | pirate — proposed new native | hull swinging on an A-frame, chain arcs, pendulum phase off `clock`, rider heads when busy, jolly-roger pennant |
| **Haunted Manor** (dark ride) | fun (boost 90, useTime 4) | 450 / 6 / 24 | fairytale-adjacent | gabled manor with a crooked turret, `blink`-gated lit window, drifting ghost wisp at low alpha |
| **Bumper Cars** (pavilion) | fun (boost 60, useTime 3) | 300 / 4 / 16 | any | open-sided pavilion roof on posts, checker floor, three hashed-colour cars sliding on offset `clock` phases, pole sparks |
| Helter Skelter | fun (boost 75, useTime 3.5) | 350 / 5 / 18 | adventure-adjacent | striped conical tower with a spiral slide ribbon, mat rider on the last turn |
| Ice-Cream Stall | hunger (boost 70, useTime 2) | 130 / 4 / 10 | any | weakest candidate — overlaps the food stall; listed for completeness |

The Pirate Ship is the load-bearing pick: it is the first thrill source a
player can place as a single tile, giving coasterless parks a survival valve
while keeping the coaster strictly superior (a good coaster's `thrillBoost`
approaches 100 and serves a queue). Numbers above are starting points, tuned
against the headless guest tests.

**Native-swap sub-decision (same gate):** `ZONES.pirate.native`: 'ferris' →
'pirateship', giving the pirate zone its themed anchor. The ferris loses its
native discount (it is a mid-game staple that doesn't need one); fairytale/
carousel and adventure/flume are untouched. Alternative: keep ferris native
and the Pirate Ship joins no zone.

**Changes:**
- `src/games/park/grid.ts`: new `TileType` members; `BUILDINGS` entries
  (the `Tool` union and placement plumbing extend automatically); the
  pirate `native` swap if approved.
- `src/games/park/game.ts`: generalise `chooseAction`'s thrill branch — the
  candidate set becomes the union of coaster station tiles and buildings with
  `satisfies === 'thrill'` (the generic scan already handles any need); on
  arrival, a coaster station joins the queue, a building begins use.
  One draw function per new attraction to the #176 bar (module-scope
  helpers, precomputed colours, `hash01` variety, busy/broken states), wired
  into the tile-draw dispatch beside `drawCarousel`/`drawFerris`;
  `TILE_EMOJI` entries for thought bubbles/signs.
- `src/games/park/mayhem.ts`: `isRide` widens to `satisfies === 'fun' ||
  satisfies === 'thrill'` so the new rides break down like the rest.
- `src/pages/[lang]/fun/park.astro`: toolbar entries (emoji, label, cost —
  costs must match `BUILDINGS`).
- `src/i18n/translations.ts` ×3 locales: `fun.park.tool<Name>` keys.
- `tests/games/park.test.ts`: `BUILDINGS` integrity over the new entries; a
  thrill-starved guest with no coaster pathfinds to and uses the thrill ride
  (the audit gap, encoded); new rides appear in `isRide`/breakdown coverage;
  the native-swap discount if approved; existing 90 tests green.

**Eval (testable statements):**
1. Headless: the thrill-gap test passes — a guest whose `thrill` is below
   `URGENT_THRESHOLD` in a coasterless park walks to the placed Pirate Ship
   and `beginUsing` restores the need. Existing park suite green.
2. Every new attraction is placeable, charges its price, pays upkeep, and can
   break down (tests over `BUILDINGS`/`isRide`).
3. Screenshot pairs on the park scenarios plus close-up crops per new
   attraction, idle and busy; frame-cost spot-check within noise of the
   pre-round baseline (attractions draw per frame — bounded op count,
   hoisted colours).
4. i18n keys resolve ×3 locales; build + check-links green.

**Risks.** The art is the expensive part — each attraction is a
`drawFerris`-scale build (the gate keeps the count owner-sized). The
`chooseAction` change touches guest AI: the headless suite plus the new
thrill test guard it, and the generic branch already proves the shape works
for the other four needs. Zone-native swap shifts the pirate-zone economy
slightly — covered by the discount test. Frame cost is the standing risk of
per-frame attraction draws; same bar and spot-check as Round 6's art goals.

---

## G2 — Line Hold: marcher contrast pass (no gate)

**Intent.** The Round 6 G5 checkpoint flagged it: the arcane batteries now
visually outclass the enemies they shoot at. Bring the four marcher kinds up
one value-contrast generation — the batteries' own recipe (dark grounding
edge, lit rim, precomputed shades) — without touching geometry, size, or any
logic. A touch-up, not a redraw: the Phase-4 silhouettes (beetle scout,
finned sprinter, riveted brute, crowned warlord) stay.

**Changes (`src/games/towerdefense/game.ts`, `drawEnemy` only):**
- Deepen each kind's grounding outline to the batteries' value (the
  `shadeColor(color, 0.35)`-class dark edge Syndicate's units standardised).
- Add a lit rim on the sun side per kind (scout shell crescent, sprinter nose
  edge-light, brute plate tops, warlord crown + jewel glints brightened).
- Strengthen the per-kind accent one notch: scout carapace glint, sprinter
  dust kick contrast, brute rivet highlights, warlord banner/jewel.
- The chilled (`slow > 0`) tint keeps its readability — rims dim with it.

**Eval:**
1. Before/after pairs (`linehold-build`, `linehold-wave`) plus close-up crops
   per kind including a chilled variant.
2. Headless towerdefense suite untouched and green (render-only change).
3. Frame-cost spot-check within noise (same op-count class, no allocation).
4. Boot smoke: waves run, console clean.

**Risks.** Lowest of the round. The one craft trap is over-darkening the
outlines until the chilled tint stops reading — the crop set includes chilled
enemies to check exactly that.

---

## Stretch candidates (owner opt-in at the gate, default out)

**S1 — Syndicate: an escort objective mould.** The honest next depth step for
the vision cabinet, and the one Round 5 deliberately rejected: a VIP unit
kind, follow behaviour, and a VIP-death lose branch are all new sim surface
(compare `secure`, which reused the extraction tile and guard ring wholesale).
Medium-high cost, real novelty. If opted in, it lands as its own goal with
`missionStatus` winnability proofs like every mould before it.

**S2 — Cascade: sprint/daily mode.** A 40-line sprint or a daily-seeded run
is cheap in `run.ts` (the state machine is pure and the bag is seedable), but
the scoreboard model is a higher-is-better top-10 — a timed sprint needs an
inverted or separate board, which is new scoreboard surface. Medium cost;
parked unless the owner wants a second way to play Cascade.

---

## Gate procedure

One ask, before G1 executes (G2 needs none and runs meanwhile): the G1
shortlist (which attractions, 2–4), the pirate-native swap (yes/no), and
stretch opt-ins (S1/S2, default out). Visual mocks are deliberately not
pre-built for this gate — the candidates differ in *what they are*, not in
competing renderings of the same thing (Round 6's case); each concept is a
one-line art direction above, and the picked set gets its close-up crops in
the PR. If the owner wants mock crops before committing to a pick, that is a
fine answer and the mocks get built first.

## Execution notes

*(accumulated as goals land)*
