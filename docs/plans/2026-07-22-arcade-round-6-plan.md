# Arcade Round 6 — Plan

Date: 2026-07-22
Status: **Gates decided 2026-07-23 — executing.** Owner sign-off (from the
mock-comparison artifact + question pass): **G1 = V3** (2× units, camera
unchanged), **G2 = B** (dark-but-lit + ad-screens), **G5 = V2** (arcane
battery — the fantasy language, built to the C&C *detail* bar), **G4 = acts
order** (as tabled below), **G7 = B** (Featured: Syndicate, Line Hold,
Critter Rescue, Pixel Park, Cascade; back catalogue: Microcity, Tank Duel,
Snake; nothing retired). Expands the owner's brief
(`2026-07-22-arcade-round-6-brief.md`) into executable goals. Each goal is
independently executable, ships as one commit, and carries its own eval; the
repo bar (`npm run lint && npm run typecheck && npm run build && npm test &&
npm run check-links`, plus screenshot pairs for draw changes and headless
proofs for balance/content claims) applies to every commit. Owner gates:
G1/G2/G5 art direction (mock variants), G4 level order, G7 shortlist.

## Execution order

Gated goals wait for sign-off; ungated goals run first so the round starts
moving immediately. Order also protects screenshot baselines: G6 (Line Hold
balance) lands before G5 (Line Hold art) so G5's before-captures are taken on
the final balance code, and G1's after-captures become G2's before-captures.

| # | Goal | Cabinet | Kind | Gate |
|---|------|---------|------|------|
| 1 | G3 missions 8–9 | Syndicate | Content (headless) | — |
| 2 | G4 level resequence | Critter Rescue | Content (headless) | Order sign-off |
| 3 | G6 difficulty rework | Line Hold | Balance (headless) | — |
| 4 | G1 big characters | Syndicate | Art (screenshots) | Direction mocks |
| 5 | G2 city mood | Syndicate | Art (screenshots) | Direction mocks |
| 6 | G5 tower art | Line Hold | Art (screenshots) | Direction mocks |
| 7 | G7 focus the floor | All | Decision + index change | **Required** |

One commit per goal, full verification bar after each, single PR for the
round. Execution notes accumulate at the foot of this doc.

---

## G3 — Syndicate: missions 8–9 (no gate)

**Intent.** Extend the campaign 7 → 9 using the existing objective moulds —
a heavier eliminate, then a second `secure` variant as the new finale — with
heavier rosters and rising rewards. No new mechanics, no new unit kinds.

**Changes (`src/games/syndicate/`):**
- `missions.ts`: append two `MissionSpec`s. Missions 1–7 unchanged (the
  objective-indexed tests stay valid).
  - **Mission 8 — eliminate, "the purge":** civilians 10, guards 7 (uzi),
    enemies 7 (minigun), reward 7000. The heaviest kill-count contract in the
    campaign — more minigun rivals than the mission-6 finale fielded.
  - **Mission 9 — secure, the new closer:** civilians 12, guards 8 (uzi),
    enemies 6 (minigun), `holdSeconds: 30`, reward 8000. The longest hold
    against the deepest LZ ring — the mould mission 7 introduced, escalated.
- `game.ts`: extend `missionNames`/`missionBriefs` to nine entries
  (`s('tMission8Name', …)` … `s('tMission9Brief', …)`). Counter and
  `endCampaign` already generalise over `MISSIONS.length`.
- `syndicate.astro`: `data-t-mission8-name/-brief`, `data-t-mission9-name/-brief`.
- `translations.ts` × 3 locales: `fun.syndicate.mission8Name/Brief`,
  `mission9Name/Brief`.

**Eval (testable statements, `tests/games/syndicate.test.ts`):**
1. `MISSIONS.length === 9`; the existing roster/spawn-integrity loop covers
   the new specs automatically (walkable spawns, correct counts).
2. Rewards strictly rise 7 → 8 → 9 (extend the escalating-rewards assertion).
3. Mission 8 is `eliminate`; mission 9 is `secure` with `holdSeconds > 0`
   and a guard ring on the LZ (the ring test generalises to every `secure`
   spec rather than hard-coding mission 7).
4. The per-objective winnability loop (`MISSIONS.slice(3)`) passes for both
   new specs unchanged in shape.
5. i18n keys resolve in all 3 locales.

**Risks.** Lowest of the round — pure data + i18n. The only care is not
touching missions 1–7 so index-pinned tests hold.

---

## G4 — Critter Rescue: resequence the 25 levels (gate: order sign-off)

**Intent.** Reorder `LEVELS` so perceived difficulty climbs smoothly in acts
with deliberate breathers. The gorge relay (old 10) and the grand tour
(old 13) move to the late game; the rule-twist teaching levels form a middle
act. Layouts are untouched — only order, hint keys, and tests change.

**Feasibility (verified in the brief and re-checked):** progress is a single
highest-level-cleared count (`progress.ts`) — order-independent. Hints travel
on the level object as position-named keys, so re-keying is a translations
re-mapping. The page auto-wires `data-t-hint<i>` from `LEVELS`.

**Proposed order (the gate).** Acts: I teaching (1–6, unchanged), II skill
chains (7–13), III rule twists (14–19), IV endgame (20–25). Old → new:

| New | Level (old #) | Rationale |
|-----|---------------|-----------|
| 7 | Hold the Line (7) | unchanged — first chained pair |
| 8 | Up and Over (8) | unchanged |
| 9 | Down the Shaft (9) | unchanged |
| 10 | Down and Up (11) | two skills, no timing pressure — the gorge's old slot |
| 11 | Wall and Step (23) | straightforward bash→build, belongs in the chain act |
| 12 | Into the Pit (12) | unchanged |
| 13 | Double Trouble (14) | hatch2 intro as the act-II closer/breather |
| 14 | Beat the Clock (15) | timer intro opens act III |
| 15 | Steel Floor (16) | steel intro |
| 16 | Over the Steel (18) | the other steel answer (ramp what you can't dig) |
| 17 | Two Streams (19) | light two-hatch mid-act breather |
| 18 | Steel Seam (22) | steel refresher, mirrored layout |
| 19 | Rush Hour (17) | hatch2 + timer combo — act III's peak |
| 20 | The Long Way Home (13) | the grand tour opens the endgame |
| 21 | Beat the Drop (24) | timed float-into-dig |
| 22 | Second Wind (21) | the deep breath before the last climb |
| 23 | Across the Gorge (10) | the two-builder relay spike, now a late set piece |
| 24 | The Gauntlet (20) | everything at once |
| 25 | Last Stand (25) | unchanged capstone |

Ordering invariants held: the first two-hatch level (13) precedes every other
two-hatch level (17, 19, 24, 25); the timer intro (14) precedes every timed
level (19, 21, 24, 25); the steel intro (15) precedes every steel level
(16, 18, 24, 25). Breathers: 13, 17, 22.

*Alternative offered at the gate:* minimal-move (only old 10 → 23 and
old 13 → 20, everything between shifts up). Same hint-renumbering churn —
any move renumbers — so the acts order is recommended.

**Changes:**
- `src/games/lemmings/levels.ts`: reorder `LEVELS`; renumber each level's
  `hint` key to its new position; rewrite the position-referencing header
  comment and per-level comments (numbers + any "like level N" references).
- `src/i18n/translations.ts` × 3 locales: re-map hint strings to the new
  position keys (text travels with its level; keys follow position).
- `tests/games/lemmings.test.ts`: renumber the playthrough test names and
  `LEVELS[i]` indices (strategies travel verbatim with their layouts);
  repoint the twin-hatch pin (`LEVELS[13]` → the new Double Trouble index,
  `LEVELS[12]`); add the difficulty-arc test.

**Eval (testable statements):**
1. Every level's headless `playLevel` solvability proof passes at its new
   index — the strategies move with their levels, so a green suite proves the
   reorder didn't mispair a strategy and a layout.
2. A new arc test pins the intended difficulty: an authored per-position tier
   array (in the test, documenting intent) is non-decreasing within each act,
   with breathers 13/17/22 explicitly exempted.
3. The hint guard (every level ≥7 has a key resolving in all 3 locales) and
   the 1–6-hint-free guard stay green.
4. Timed levels keep `timeLimit > par` (existing invariant, ranges over the
   array).

**Risks.** A mispaired strategy/layout would fail loudly (eval 1). The subtle
risk is hint-text/key drift — a level showing another level's hint; guarded
by re-mapping translations in the same commit and spot-checking two moved
levels' hints in the built output. Players mid-campaign will see a different
level at their current position — acceptable, one-time, noted in the PR.

---

## G6 — Line Hold: difficulty rework, no perfect runs (no gate)

**Intent.** The audit's finding stands: the reference layout clears all 18
waves at 20/20 lives. Retune so escalation is felt every run, per the brief's
four-point contract, provable through `playRun`.

**Levers (iterated against the harness; the eval is the contract):**
- `hpScale`: from linear `1 + 0.14w` to a late-ramping curve — starting point
  `1 + 0.14w + 0.02·max(0, w − 8)²` (wave 18: ×5.0 vs today's ×3.38). Waves
  1–6 keep today's feel (teaching arc intact, and the screenshot scenario's
  wave-1 capture stays comparable).
- Wave composition 7–18: densify the back half (earlier second warlord,
  tighter gaps, bigger brute walls) if hpScale alone doesn't produce the
  contract without making it unwinnable.
- Economy: hold as-is first; `INTEREST_CAP` 60 → 40 is the reserve lever if
  cash growth still trivialises the late game.
- Endless tail: `endlessWave` inherits the steeper `hpScale` automatically.

**Eval (testable statements, `tests/games/towerdefense.test.ts`):**
1. The strengthened reference plan survives all 18 authored waves **with
   lives lost**: `survived === true && eco.lives < START_LIVES && lives > 0`.
   (Honest scope: "best-known" means the best plan we can author against the
   harness; the test pins that even it bleeds.)
2. A decent static layout (a solid build bought early, never adapted, no
   late upgrades) dies before wave 18: `survived === false && waveIdx >= 12`.
3. A naive layout (few towers, no upgrades) dies by mid-campaign:
   `survived === false && waveIdx <= 10`, and later than the undefended
   line's wave < 4.
4. The reference plan still holds ≥ 2 waves into the endless tail
   (winnability + working handoff), and the endless escalation/determinism
   tests pass updated to the new `hpScale` — updated, not deleted.

**Risks.** The main one is over-tightening — an unwinnable campaign. The pure
harness makes iteration fast (the Round 1 loop); if no reasonable layout
survives with the target curve, back the quadratic term down and squeeze
composition instead. Scoreboard conventions untouched. No draw code changes,
so no screenshot pairs; the wave-1 scenario capture must remain byte-identical
(hpScale(w ≤ 6) unchanged guarantees it, verified with the harness).

---

## G1 — Syndicate: big characters (gate: direction mocks)

**Intent.** Units are ~13 px against 14–26 px buildings (tall band 30–50 px).
Redraw at 1.5–2× with Syndicate-Wars silhouettes — coat swing, stance,
carried weapon readable at a glance — and decide whether the camera steps up
with them. All render-side: `drawUnit` and its callers; no sim/logic change.

**Mock variants for the gate (prototype all, screenshot, compare):**
- **V1 — 1.6× units, camera unchanged** (`VIEW` 16/8). Cheapest; units grow
  to ~21 px, taller than a mid-rise building's 14 px minimum — figures
  dominate the way the owner asked, at the risk of crowding the tile grid.
- **V2 — 1.6× units + camera step to 20/10** (Line Hold's scale) with
  building heights ×1.25 in the draw (map data unchanged). Canvas grows
  832×498 → 1040×632 logical; the existing `#canvas-scroll` absorbs it.
  Proportions stay closest to today's city while everything reads bigger.
- **V3 — 2× units, camera unchanged.** The most figure-dominant, most
  Syndicate-Wars; the strongest crowding risk.

Each variant is prototyped as a scale pass on `drawUnit` (skeleton
coordinates through a scale factor), captured with the harness on the same
seeded moment, cropped, and presented side-by-side (published as a private
comparison artifact if a browser is available; ASCII proportion sketches in
the question otherwise). Owner picks; the full silhouette pass then builds on
the picked geometry: longer flared trench + visor band (agents), armoured
bulk + spikes (rivals), cap + baton (guards), slighter hashed-length coats
(civilians), crown + briefcase + pinstripe (target), and per-weapon hardware
scaled to stay readable.

**Changes:** `src/games/syndicate/game.ts` only — `drawUnit` (skeleton,
silhouettes, weapons, health bar/persuade-dot/crown offsets), contact shadow
and selection ellipse, decal radius; if V2 wins: `VIEW`, building-height
scale in `drawBlock` calls, `drawWindows`/`drawStorefront`/`drawNeonTrim`/
`drawRooftop` metrics, and the harness's `VIEWS.syndicate` entry
(halfW/halfH/originX/logical size). Pointer math stays on `hiDpi.toLogical` +
`isoTileFromPoint` — selection is tile-based, so no hit radii change; any
deliberate adjustment would be called out, none is planned.

**Eval:**
1. Before/after screenshot pairs from the harness (`syndicate-early`,
   `syndicate-mid`), plus close-up unit crops per kind.
2. Owner signed off the direction from the variants BEFORE the full pass.
3. All headless syndicate tests green untouched (no sim change).
4. Boot smoke against `dist`: mission starts, units render and move, console
   clean.

**Risks.** Craft risk (does 1.6–2× hold up against the building scale) is
what the gate de-risks. V2 additionally touches every building-metric helper
— mitigated by doing the camera step as its own verified stage (screenshot
the camera step, then layer the silhouettes). Frame cost: same draw-call
count per unit, slightly larger fills — spot-check the heaviest sweep.

---

## G2 — Syndicate: city mood pass (gate: direction, can pair with G1's ask)

**Intent.** Darken the palette toward the Blade-Runner reference and add
neon signage / ad-screen accents on tall buildings — the "huge glowing ad
screens" of Syndicate Wars — using the engine idioms (`blink`, `hash01`,
baked static content) with no per-frame rebuilt static content.

**Direction options for the gate (palette strips + one mocked crop):**
- **A — deep noir:** near-black facades (#20242f band), colder sky, dimmer
  windows, signage as the dominant light source. Highest drama, highest risk
  of losing unit readability (G1's new units must stay legible).
- **B — dark-but-lit (recommended):** facades one shade down from today,
  deeper sky/ground, windows dimmed ~20%, large animated ad-screens on the
  tall band + more frequent storefront neon. Keeps the current readability
  contract.

**Changes (`src/games/syndicate/game.ts`):**
- Palette constants: `FACADES`, sky gradient stops, ground-bake colours
  (roads/pavement/plaza — re-baked, still static), window/storefront alphas.
- **Ad-screens:** on buildings with `height ≥ 30` and `hash(i, 9) < 0.5`, a
  large `faceBandPath` billboard on the south/east face: neon fill from the
  `NEON` palette, slow alpha shimmer off `clock`, `blink`-gated highlight so
  screens read animated, not strobing. Batched per palette like
  `drawWindows`' passes; bounded count (tall band is ~20% of buildings).
- Rooftop holo-billboard variant gets a size step on the tall band so the
  skyline carries light.

**Eval:**
1. Before/after screenshot pairs (baseline = G1's after).
2. Frame-time spot-check on the already-heaviest sweep: headless CPU
   rasterization within noise of the G1 baseline (the art-definition round's
   method); no per-frame static rebuilds (ad-screens draw with their
   building in the sweep, palette work re-bakes once).
3. Owner sign-off on direction first.
4. Boot smoke clean.

**Risks.** Readability (units vs darker city) — mitigated by sequencing after
G1 (units are bigger before the city darkens) and by option B's contract.
Per-frame cost of screens — bounded by the tall-band hash gate and batching.

---

## G5 — Line Hold: tower art to the C&C bar (gate: direction mocks)

**Intent.** Towers are a plinth + coloured block + small topper. Rebuild as
structure-first turrets: distinct silhouettes per kind **and level**,
rotating/aiming heads where sensible, muzzle/recoil animation on fire,
grounded bases — engine idioms throughout (`blockFaceCorners`,
`faceBandPath`, baked static ground untouched).

**Tower-sheet mock variants for the gate (3 kinds × 3 levels each):**
- **V1 — military emplacement (closest to the C&C ask):** sandbagged/plated
  bases, metal turrets with rotating heads; bolt = tesla mast growing a coil
  array, blast = mortar pit → twin-barrel bunker → artillery piece, frost =
  cryo tank with vent stacks. Levels change structure, not just height.
- **V2 — arcane battery (keeps the keep's fantasy):** stone bases; bolt =
  storm spire, blast = bombard tower, frost = crystal obelisk; levels add
  storeys and ornament.
- **V3 — hybrid (stone base + mechanical head):** today's plinth language
  under V1-style heads — least visual break with the battlefield.

Mocked by prototyping the sheet in the real `drawTower` behind a variant
switch, capturing one scene per variant with all nine forms placed, cropping,
and comparing (artifact if browser available, else described options).

**Changes (`src/games/towerdefense/game.ts` only):**
- `drawTower`: per-(kind, level) structures on the chosen direction;
  `blockHeight` may become per-kind/level for silhouette (visual only —
  `towerTop` keeps shot origins consistent with it automatically).
- **Aim state (render-side):** a `Map<tile, angle>` updated where shot
  events are turned into `Shot`s in `update` (the event carries `from` and
  target coords); heads rotate toward the last target and hold. `Shot` gains
  a `from` tile so recoil/muzzle-flash animates off the live shots list
  (recoil = displacement decaying with `shot.life`).
- Enemy sprites: **flagged, deferred by default** — they had the Phase 4
  detail pass; the gate's mock review is the checkpoint (if the chosen tower
  sheet visually outclasses the marchers, a contrast touch-up joins the
  commit and its screenshot pairs).

**Eval:**
1. Before/after pairs (`linehold-build`, `linehold-wave`) captured after G6
   lands (balance first, so baselines are final), plus tower-sheet close-ups
   per kind/level.
2. Owner signed off the sheet direction from the variants first.
3. Headless tests untouched (no logic change; `towers.ts` untouched).
4. Boot smoke: towers build/upgrade/fire with heads tracking, console clean.

**Risks.** Per-frame cost (towers draw per frame): bounded per-tower op
count, colours precomputed, no per-frame allocation beyond the aim map's
bounded entries; frame-time spot-check. Crisp-at-1x discipline per the art
bar (half-pixel alignment on fine strokes).

---

## G7 — Focus the floor (gate: required, owner names the list)

**Audit summary for the decision (post-Rounds-1–5, this round in flight):**

| Cabinet | Depth | Polish | Distinctive | Note |
|---|---|---|---|---|
| Syndicate | 9 missions after G3 | art bar + G1/G2 | high | the owner's vision cabinet |
| Line Hold | 18 waves + endless, real difficulty after G6 | art bar + G5 | high | action-strategy flagship |
| Critter Rescue | 25 proven levels, resequenced arc | art bar | high | the content model |
| Pixel Park | objectives + coaster editor + uncapped score | art bar | med-high | deepest sim |
| Microcity | objectives, disasters, congestion | art bar | med | strong sim, less unique |
| Cascade | live cascade chains (R2) | strong flat art | high | signature mechanic works |
| Tank Duel | difficulty tiers + ramp (R2), drawn art (R4) | good | med | 2-player local is its card |
| Snake | one board, flat ramp | good (R4) | low | thinnest cabinet |

**Options to put to the owner (no cabinet moves without the named list):**
- **A — Round-6 trio featured:** front shelf = Syndicate, Line Hold, Critter
  Rescue; back catalogue = the other five. No retirement.
- **B — front five (recommended):** front = the trio + Pixel Park + Cascade;
  back catalogue = Microcity, Tank Duel, Snake. No retirement — Snake and
  Tank Duel are zero-maintenance and back-shelf costs nothing.
- **C — B plus retiring Snake** (Poo-Poo-Land style: page removed, localStorage
  data and key-migration preserved for a possible rebuild).

**Execution once decided (`src/pages/[lang]/fun/index.astro` + i18n):**
- Shelves become **Featured** (first, the named list in owner order) and
  **Back catalogue** (the rest, current genre grouping collapsed or kept as
  sub-labels — decide with the owner's pick); `fun.arcade.shelf.featured` /
  `.backCatalogue` keys × 3 locales; `arcadeGames` entries get the new shelf
  keys. If C: remove the page/route + index entry, keep data migration,
  update `check-links`-visible references.
- CLAUDE.md arcade section updated (shelf model, mission/level counts from
  G3/G4, G6 difficulty posture) in the same commit.

**Eval:** build + check-links green (no dangling hrefs); the index renders
the named grouping in all 3 locales; i18n parity test green; if C, the
retired game's localStorage note lands in CLAUDE.md exactly as Poo Poo
Land's did.

**Risks.** None technical; the decision is the deliverable, and it is the
owner's.

---

## Gate procedure (before executing gated goals)

1. Build the G1 (three scale variants), G2 (palette strips + option B crop),
   and G5 (three sheet variants) prototypes in the worktree; capture with
   `scripts/screenshot-games.js` against a fresh build (local Chromium; if
   unavailable, fall back to textual/ASCII option descriptions).
2. Publish one private comparison artifact with the crops per gate.
3. Ask the owner in one pass: G1 variant, G2 direction, G5 variant, G4 order
   (recommended acts table vs minimal-move), G7 list (A/B/C or named edits).
4. Execute in the order above, revisiting this doc's execution notes after
   each commit.

## Execution notes (2026-07-23)

All seven goals landed, one commit each, full bar after each
(`lint + typecheck + build + test + check-links`; 551 → 555 tests over the
round). The owner answered every gate in one pass from the mock-comparison
artifact (real seeded-harness captures of each variant): G1 = V3, G2 = B,
G5 = V2, G4 = acts order, G7 = option B.

- **G3 — Syndicate missions 8–9.** Pure data + i18n as planned: mission 8
  "Scorched Earth" (the heaviest eliminate, 7 minigun rivals) and the
  mission-9 finale "Total Control" (secure, 30-s hold behind an 8-guard LZ
  ring), rewards 7000/8000. The LZ-ring test generalised to every `secure`
  spec; the roster/winnability loops absorbed the new entries untouched.
- **G4 — Critter Rescue acts resequence.** The permutation was applied by
  script to `LEVELS`, the position-named hint keys (values permuted across
  fixed keys, ×3 locales, formatting preserved), and the playthrough tests
  (strategies travelled verbatim with their layouts — the whole suite passed
  at the new indices on the first run, proving no strategy/layout mispair).
  A new authored-tier test pins the arc (non-decreasing within acts,
  breathers 13/17/22 exempt; the endgame strictly harder than acts I–III).
  One trap found: the page wires hints by **0-based index**
  (`data-t-hint${i}`), so built-output spot-checks must read slot N−1.
- **G6 — Line Hold no-perfect-runs.** hp scaling alone — even ×7 at wave
  18 — could not break the reference corridor (its DPS annihilates a
  sequential stream mid-route; max route progress ~50%). The lever that bit
  was **concentration**: densified waves 15–18 plus `hpScale`'s quadratic
  term (`+0.05·max(0, w−8)²`, waves 1–9 identical to the old curve). The
  finale's warlord quartet is sized so the corridor kills three, never
  four: the reference plan **and** an adversarial reinforced plan (every
  affordable extra, purse emptied to 12) both finish 18 at 15/20 lives.
  Static-build death moved to wave 17, naive to wave 10, endless holdout
  intact — all encoded as playRun proofs. Line Hold captures byte-identical
  (`cmp`) — the retune is invisible until wave 10.
- **G1 — Syndicate 2× characters.** `drawUnit` redrawn at ~26 px (not a
  transform hack): flared trench + collar + belt (agents), armoured bulk +
  spikes (rivals), cross-strap + cap + baton (guards), pinstripes +
  briefcase (target), hashed hem lengths (civilians); per-weapon hardware;
  dark grounding outline + lit rim throughout. Tracers/bursts/decals/
  pickups rescaled to the new muzzle height. Pointer math untouched.
- **G2 — dark-but-lit mood.** Palette dropped one shade (facades, ground
  bake, sky), windows dimmed ~20%, half the tall band gained animated
  ad-screens with a blink-gated scan-line. **The blur lesson:** the
  shadowBlur glow variant measured +50% on the sweep's headless CPU cost
  (0.86 → 1.32 ms/frame local); replaced by a second low-alpha band —
  final cost 0.89 ms/frame, +3% over the pre-round baseline with both art
  passes included.
- **G5 — arcane batteries.** Owner picked V2 over the recommended military
  sheet — the C&C reference applies to *detail level*, not theme. Coursed
  stone bodies grow per level (lancet windows per tier), crowned by storm
  spire / traversing bombard / ice obelisk. Aim + recoil are render-side:
  shots carry their tower tile, `towerAim` remembers the last bearing, the
  tub sinks and the orb flares while a shot lives. `towerTop` now fires
  from each crown. Nine-form sheet captured via a temporary startRun patch.
- **G7 — the floor.** Option B: Featured shelf (Syndicate, Line Hold,
  Critter Rescue, Pixel Park, Cascade — owner order) over a Back-catalogue
  shelf (Microcity, Tank Duel, Snake). Genre shelves retired with their
  keys; nothing retired, no link fallout.

Process note for future rounds: uncommitted work and `git checkout <rev> --
<file>` don't mix — the G2 palette pass was briefly lost to the frame-time
probe's checkout dance and re-applied from its script. Commit before
measuring across revisions.
