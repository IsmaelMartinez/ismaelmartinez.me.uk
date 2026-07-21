# Arcade Improvement, Round 1 — Audit, Ranking, and the First Round

Date: 2026-07-21
Status: **Rounds 1-2 done.** Round 1 (**Refill the finite rosters**) and
Round 2 (**Twitch-game gameplay & clarity**) are both planned and shipped.
See "Execution notes" at the foot of this doc. Rounds 3-5 remain queued.

## Why this doc

With nine cabinets shipped and the two consolidation rounds landed
(`2026-07-19-arcade-consolidation-plan.md`, `2026-07-20-arcade-consolidation-2-drawing-idioms.md`),
the owner has chosen **deepening the existing cabinets over building new
ones**. The candidates queue at `2026-07-18-arcade-candidates-3.md` (Gem
Caverns, Nova Patrol, Micro GP) stays **parked indefinitely** — no tenth
cabinet until the deepening work is exhausted.

This doc audits every playable cabinet along three axes, ranks the findings
into rounds of one-session scope, and plans the top round.

The eight cabinets audited: **Snake, Tank Duel, Pixel Park, Microcity,
Syndicate, Critter Rescue, Line Hold, Cascade** (Poo Poo Land was retired in
the 2026-07-19 round). Each was inspected through its pure modules and
headless tests; balance and completability claims were checked empirically
where a pure module allowed it (Line Hold's `playRun` harness, Critter
Rescue's per-level solvability suite, Cascade's `run.ts` bot, Syndicate's
`missionStatus`, Tank Duel's AI grid-search).

## The three axes

1. **Content depth** — authored content that runs out: Critter Rescue's
   level set, Line Hold's wave/map roster, Tank Duel's arenas, Syndicate's
   three-mission campaign, Pixel Park's attraction catalogue.
2. **Visual quality** — measured against the art-definition bar set by
   PR #176 (`2026-07-19-arcade-art-definition.md`): finer drawing units,
   shading, outline discipline, hashed variety, baked static layers. The
   five iso sims met it; the flat-canvas cabinets (Snake, Tank Duel) and
   Cascade were not in that round.
3. **Gameplay** — difficulty curve, balance, dead mechanics, first-minute
   clarity.

---

## Per-cabinet inventory

### Snake (flat-canvas, action)
- **Content — thin (med).** One fixed 20×20 board (`logic.ts:7-8`), no
  levels/modes/obstacle layouts. The only authored event is the bonus apple
  every 5 apples (`logic.ts:13,138-141`). Runs are mechanically identical
  start to death.
- **Visual — the stronger flat cabinet (low).** Board bakes via
  `createStaticLayer`/`paintBoard` (`game.ts:90-91,235-253`); pieces are real
  vector primitives (apple arc+leaf+shine, chevron-banded snake with eyes,
  `game.ts:264-365`). Gaps vs the bar: no outline/rim discipline on the body
  (two flat greens), no hashed variety — every segment and apple byte-identical.
- **Gameplay — flatlines (med).** Speed ramp 0.16s→0.07s floors at ~22.5
  apples (`logic.ts:18-20`, tested `snake.test.ts:191-196`); an expert run has
  no pressure curve past that. Wall death, buffered turns, no dead mechanics —
  it is simply thin.

### Tank Duel (flat-canvas, action, 2-player)
- **Content — thin (med).** Terrain is procedural (3 summed sine waves,
  `terrain.ts:12-34`) — infinite variation but no authored/curved arenas or
  cover. One hardcoded night backdrop (`game.ts:127-196`). Three weapons, of
  which the two specials empty in 3 shots per round (`weapons.ts:22-26`).
  Match structure is real (best-of-5, `game.ts:39,436`).
- **Visual — crude vs the bar (med).** Tanks are a `roundRect` hull + 5px
  tread strip + a single stroked barrel line (`game.ts:584-627`): no turret,
  wheels, shading ramp, or outline. Weapons are emoji (`weapons.ts:23-25`).
  Terrain is re-tessellated **every frame** (~1,600 `lineTo` calls,
  `game.ts:649-667`) though it only changes on impact — it violates the "don't
  rebuild static content per frame" rule and could bake-on-crater.
- **Gameplay — fixed CPU, no ramp (HIGH, effort S).** `CPU_DIFFICULTY` is a
  hardcoded `0.72` (`game.ts:41`), passed unchanged every turn (`game.ts:558`);
  no selector, no round-over-round ramp. The AI does a real `simulateShot`
  grid-search + `±30·(1−difficulty)` scatter (`ai.ts:32-49`) — a consistently
  sharp opponent that never gets harder or easier. The `difficulty` parameter
  is already plumbed. CPU weapon choice is pure random (`game.ts:354-358`),
  ignoring range/terrain/HP. MIRV/heavy are novelties (3 shots total). Fall
  damage works but is never taught.

### Pixel Park (iso sim — art bar met)
- **Content — score-capped (HIGH).** 7 attraction/stall types
  (`grid.ts:61-69`), 3 theme zones (`grid.ts:104-126`), **no goal/win/milestone
  system** (only terminal state is `money<0` at day end, `game.ts:1266`). Banked
  score = `peakGuests` but the guest cap maxes at **120** (`mayhem.ts:104-106`)
  and mayhem saturates at day 17 (`mayhem.ts:16-19`): the leaderboard number
  literally cannot grow past ~day 17. The coaster track editor (`track.ts`) is
  the real, unbounded depth.
- **Visual — meets the bar (low).** Theme zones read thin (ground tint + gate
  prop only).
- **Gameplay — economy trivialises (HIGH).** A busy stall nets ~£45/day vs
  flat upkeep; once crowds arrive `money<0` never fires again — no late failure
  pressure. Mayhem is near-consequence-free (breakdowns cost 14s, no cash;
  surges *raise* spawn rate). Tutorial is one dense paragraph
  (`translations.ts:192`), no staged objective.

### Microcity (iso sim — art bar met)
- **Content — modest, hollow milestones (med).** ~9 buildable tools
  (`tiles.ts:14-51`); zone levels 1-3 plus a strict level-4 density gate (pop
  ≥600 & demand ≥20, `simulation.ts:16-18,102-104`) many runs never trigger.
  5 population milestones fire a toast only, no reward (`game.ts:451-454`); no
  win condition. Richer chaos than Park (fire/tornado/quake + 5 political
  events, `disasters.ts:302-308`), and disaster intensity genuinely ramps with
  age and size (`disasters.ts:141-146`).
- **Visual — meets the bar (low).**
- **Gameplay — economy trivialises late (HIGH); RCI model is the strength.**
  Income `pop×1.5 + jobs×1` (`budget.ts:19-21`) outscales fixed per-tile upkeep,
  so a developed city can't go bankrupt — disasters cost rebuild time, not
  survival. **Traffic is an explicitly dead mechanic** (cosmetic random-walk
  cars, zero effect, `traffic.ts:2-4`). Political events are underpowered vs a
  thousands-strong treasury. Fire is the best-tuned threat.

### Syndicate (iso tactics — art bar met)
- **Content — three missions (HIGH, but cheap to extend).** `MISSIONS` is a
  3-element array (`missions.ts:26-60`): eliminate / persuade+extract /
  assassinate. Maps are procedural (`generateCity`), so the only authored
  content is the 3 specs + names/briefs. Finishing mission 3 hits a "campaign
  complete" wall → replay the same 3 on fresh cities. **Adding a mission that
  reuses an existing objective type is data-driven and cheap**: push a
  `MissionSpec`, add name/brief i18n × 3 locales, extend the `missionNames`/
  `missionBriefs` arrays (`game.ts:125-126`). A *new objective kind* is the
  expensive path (new `missionStatus`/`spawnMission` branches).
- **Visual — meets the bar (low).** Heaviest sweep (+2ms/frame headless);
  GPU-absorbed.
- **Gameplay — back-loaded roster (med).** The minigun and the `target` unit
  appear **only in mission 3** — one-mission mechanics. Guard/enemy persuasion
  (`units.ts:80-85`) is flavour almost no run exercises. Completability/balance
  invariants are tested and hold (`syndicate.test.ts`).

### Critter Rescue (pixel-art puzzle — the content model to follow)
- **Content — healthy (low priority).** 20 hand-authored levels
  (`levels.ts:120-482`, asserted `lemmings.test.ts:366`), deliberate smooth
  progression with breathers, every skill necessary somewhere, rule twists
  (second hatch, time limits, steel) in the back half. **Every level is
  empirically proven solvable** by a headless playthrough suite
  (`lemmings.test.ts:593-950`) — the strongest completability evidence of any
  cabinet. Adding a level carries fixed overhead: bump the length assertion,
  add a `hintN` key × 3 locales for level ≥7, and hand-design a solvable layout
  (the real cost, M each).
- **Visual — meets the bar (low).** The one true pixel-art cabinet; Phase 5
  (the droppable one) shipped.
- **Gameplay — smooth, no unbeatable levels.** Anti-cheese guards tested
  (steel floor/wall). Only real headroom is a *new* mechanic (6th skill, moving
  hazards) — an L-effort FSM change.

### Line Hold (iso tower defense — art bar met)
- **Content — 12 waves, one path, victory wall (HIGH).** `WAVES` is 12
  hand-authored entries (`waves.ts:17-49`); clearing wave 12 hits a hard
  victory screen (`game.ts:424-426`), no loop or endless scaling. Difficulty
  is HP-only: `hpScale = 1 + waveIndex·0.14` (`waves.ts:52-54`), a flat linear
  ramp capping at ×2.54. Four enemy types, and the warlord appears **once**
  (`waves.ts:46`). Single authored path (`path.ts:27-34`); `buildRoute()` has
  an alternates hook nothing calls. Comments flag all this as deliberate v1
  limits.
- **Visual — meets the bar (low).** Phase 4; nothing needed.
- **Gameplay — comfortable once solved (med).** The reference winning layout
  takes **zero leaks across all 12 waves, finishing 20/20 lives**
  (`towerdefense.test.ts:414-445`): the challenge is entirely first-time
  placement discovery, with no late spike. A thin defence leaks wave 3, dies
  wave 6 — the curve is gentle and forgiving, no unfair spike (the "wave 8 is
  unbeatable" claim is false; W8 is 14 scouts). Economy is tight but never
  punishing (interest capped at 60). Frost is a support-only pick (6 dmg).

### Cascade (flat 2D puzzle — mislabelled "iso" in CLAUDE.md)
- **Content — speed-only ramp (med).** Standard 7-bag, 7 tetrominoes; the
  only thing the level ramp changes is gravity (`run.ts:44-46`). No garbage,
  well-width change, or special pieces — mechanical variety plateaus at once.
- **Visual — well-finished flat 2D (low).** **Cascade is flat, not
  isometric** (`game.ts:327-330`, flat grid, no `isoProject`) — CLAUDE.md
  mislabels it. It was not in the PR #176 round but already clears the bar's
  core rules within a top-down idiom: baked deep-space backdrop
  (`game.ts:126-266`), per-tile bevel + gloss + outline (`drawTile`
  `game.ts:622-654`, `CELL_LIT/DARK` precomputed).
- **Gameplay — the signature mechanic is dormant (HIGH).** The greedy bot
  always tops out (seed variance 47→645 pieces) — dies from placement, not the
  ramp. But `maxChain` **never exceeds ×2** across all seeds: the chain-lamp UI
  advertises ×2-×5 (`game.ts:252-265`) and scoring pays `base×level×chain`
  (`run.ts:49-53`), yet ×3+ essentially never fires in natural play. **The
  game's most distinctive feature and biggest score multiplier are effectively
  decorative.** Scoring collapses to "clear fast at high level." Anti-stall is
  correctly handled and tested.

---

## Ranking into rounds

Two cross-cutting themes emerged. **Content that runs out** clusters on the
authored-roster cabinets (Line Hold's 12 waves, Syndicate's 3 missions — both
cheap to extend and testable in the Cascade style). **A self-defeating
economy** clusters on the two big sims (Park and Microcity both let income
outpace costs, killing the only lose condition). The flat-canvas art gap and
Cascade's dormant chains are each strong single-cabinet items.

Ranked, one round ≈ one session (each item is one commit + full verification):

| Round | Theme | Cabinets | Why here |
|---|---|---|---|
| **1** | **Refill the finite rosters** | **Line Hold, Syndicate** | Highest-value content depth; both extend via pure data + headless completability tests; no art or economy risk; directly matches the brief's content-depth targets. |
| 2 | Twitch-game gameplay & clarity | Tank Duel (difficulty selector + ramp), Cascade (make chains reachable/rewarding) | Two HIGH gameplay findings, each self-contained; Tank Duel's fix is S (plumbing exists), Cascade's is a targeted M design change. |
| 3 | Sim stakes & goals | Pixel Park, Microcity | Shared economy rebalance + real objectives/milestones + lift Park's 120-guest score cap; higher design risk, needs balance iteration — deserves its own session. |
| 4 | Flat-canvas art pass | Snake, Tank Duel | Bring the two flat cabinets to the art bar (rim/outline, hashed variety, tank turret/tread, weapon shapes, terrain bake-on-crater). Requires extending `scripts/screenshot-games.js` to cover them (before/after pairs). |
| 5 | More authored content | Critter Rescue (levels 21+), Syndicate objective types, Park attractions | Lower urgency; Critter Rescue is already healthy, so this is polish/expansion once the structural gaps above are closed. |

Later rounds are sketches; each will get its own detailed plan when it comes
up. The candidates queue stays parked throughout.

---

## Round 1 plan — Refill the finite rosters

Goal: the two most content-starved cabinets stop dead-ending. Each ships as
**one commit** with new **headless completability tests in the Cascade/Critter
Rescue style**, and passes the full bar after each commit:
`npm run lint && npm run typecheck && npm run build && npm test && npm run check-links`.
No draw-code changes in either game (both already meet the art bar), so no
screenshot pairs are required this round — the render output is untouched.

### Commit A — Line Hold: escalating campaign + endless survival

**Intent.** Remove the wave-12 victory wall (audit's #1 Line Hold
opportunity), make the back half escalate in *kind* not just HP, and give
score-chasers an unbounded tail — consistent with the arcade's
bank-as-you-go scoreboard convention.

**Changes (content/logic only, `src/games/towerdefense/`):**
- `waves.ts`:
  - Extend `WAVES` from 12 → **18** authored entries. The new waves 13-18
    escalate in composition using the existing four enemy kinds: earlier and
    **multiple** warlords, armoured brute packs, dense sprinter+scout mixes,
    and a wave-18 finale (two warlords + a brute wall + a sprinter chaser).
    No new enemy type (that would touch art/`drawEnemy`).
  - Add a pure, deterministic `endlessWave(waveIndex)` generator: past the
    authored roster it produces escalating waves (rotating compositions, counts
    rising with the index, a warlord cadence), a pure function of the index so
    tests are exact.
  - Add `waveDef(waveIndex)` returning `WAVES[i]` within range else
    `endlessWave(i)`, and `AUTHORED_WAVES = WAVES.length`. `hpScale` already
    extends to any index.
- `game.ts`: replace every `WAVES[...]` index (init `spawner`, `launchWave`,
  `update`'s `stepSpawner`, the `spawnerDone` check, the HUD) with
  `waveDef(...)`. Replace the `waveIdx >= WAVES.length` victory wall in
  `waveCleared()` with a **one-time "campaign cleared — endless assault"
  milestone toast** at the boundary; the run now ends only on `lives ≤ 0`
  (`endRun(false)`). HUD wave readout shows `N/18` through the campaign, then
  `18+` (or just `N`) in the endless tail.
- `translations.ts` (× 3 locales): reword the instructions ("survive all 12
  waves" → hold the line / endless), and add a `campaignCleared` milestone
  string. The `victory`/`victoryDesc` keys become the milestone copy.

**Verification (headless, `tests/games/towerdefense.test.ts`):**
- Update the `waves` describe: `WAVES` length 18; generalise the "finale
  brings the warlord" assertion; `hpScale` monotonic across the new length.
- Add `endlessWave`/`waveDef` cases: valid entries, deterministic, and
  monotonically harder (total enemy HP-equivalent rises with index).
- Extend `playRun` to iterate `AUTHORED_WAVES` and provide a **strengthened
  reference layout that provably survives all 18 authored waves** (iterate the
  plan against the harness until it clears — this is the completability
  proof). Add a probe that a strong layout reaches into the endless tail
  (survives past `AUTHORED_WAVES`), confirming the boundary and generator work.

### Commit B — Syndicate: six-mission campaign

**Intent.** Double the campaign (3 → 6 missions) reusing the three existing
objective types, and spread the weapon/enemy tiers across the campaign so the
minigun and the executive `target` aren't a mission-3-only reveal (audit's
Syndicate opportunity #3).

**Changes (content/data only, `src/games/syndicate/`):**
- `missions.ts`: append missions 4-6 to `MISSIONS`, reusing
  eliminate/persuade/assassinate with escalating rosters and re-tiered
  weapons — e.g. uzi guards and a first minigun enemy mid-campaign, a persuade
  contract with a stiffer guard presence, and a mission-6 assassinate finale
  with a heavier guard ring. Keep missions 1-3 as-is so the existing
  objective-indexed tests (`MISSIONS[0]` eliminate, `[1]` persuade, `[2]`
  assassinate) stay valid.
- `game.ts:125-126`: extend the `missionNames`/`missionBriefs` arrays to six
  entries via `s('tMission4Name', …)` … `s('tMission6Brief', …)`. Mission
  counter (`N/MISSIONS.length`) and `endCampaign` (fires at
  `missionIdx+1 >= MISSIONS.length`) already generalise.
- `syndicate.astro`: add `data-t-mission4-name/-brief` … `mission6` attributes.
- `translations.ts` (× 3 locales): add `fun.syndicate.mission4Name/Brief` …
  `mission6Name/Brief`.

**Verification (headless, `tests/games/syndicate.test.ts`):**
- The roster test (`for (const spec of MISSIONS)`) already covers the new
  specs' spawn integrity automatically. Add: `MISSIONS.length === 6`; each new
  spec has a sane roster and reward greater than its predecessor; a
  `missionStatus` reachability assertion for each new mission's objective
  (win state is achievable). Confirm the i18n keys resolve in all 3 locales
  (mirrors the pattern the i18n test already uses for other keys).

### Housekeeping (folded into the doc commit)
- `CLAUDE.md` arcade section: note the candidates queue is **parked
  indefinitely** (deepening over new cabinets), and clarify that Cascade
  renders flat 2D (it is grouped with the newer games but does not use the
  engine's isometric renderer).
- `2026-07-18-arcade-candidates-3.md` Status line: mark **parked
  indefinitely**, pointing here.

## Sequencing & risk
- Order: doc + housekeeping → Line Hold → Syndicate. One commit each, full
  verification after each, single PR for the round.
- Biggest risk is the Line Hold reference layout not surviving the harder
  18-wave campaign — mitigated by iterating the plan against the headless
  harness until it clears (the test *is* the completability guarantee). If a
  fair 18-wave campaign proves unbeatable by any reasonable layout, dial the
  new waves back — the pure harness makes that a fast loop.
- Syndicate is pure data + i18n with no logic branches added, so its risk is
  low; the main care is keeping missions 1-3 objective-indexed for the
  existing tests.

## Execution notes (2026-07-21)

Both commits landed as planned; no draw code changed, so the render output is
untouched and no screenshot pairs were needed. Each game passed the full bar
(lint, typecheck, build, tests, check-links) and a boot smoke against `dist`.

- **Line Hold** (commit "18-wave escalating campaign + endless assault").
  `WAVES` grew 12 → 18; the wave-12 `endRun(true)` victory wall was replaced
  by a `clearedCampaign` handoff into a deterministic `endlessWave(waveIndex)`
  generator, with `waveDef(waveIndex)` fronting both. `game.ts` now routes
  every wave lookup through `waveDef`; the run ends only on `lives ≤ 0`, and
  clearing all 18 waves earns a one-time trophy toast plus a distinct
  campaign-cleared over-screen (the repurposed `victory`/`victoryDesc`
  strings, reworded across all three locales; instructions updated off "12
  waves"). The reference completability layout was strengthened to a 41-step
  plan and iterated against the headless `playRun` harness until it cleared all
  18 authored waves and held three waves into the endless tail — no wave in the
  authored campaign proved unbeatable, so no roster dial-back was needed. New
  tests cover `endlessWave`/`waveDef` (deterministic, strictly escalating,
  rising warlord tally) alongside the two completability proofs. +5 tests.
- **Syndicate** (commit "extend the campaign from three missions to six").
  `MISSIONS` grew 3 → 6, pure data reusing the existing objective moulds;
  missions 1-3 unchanged so the objective-indexed tests held. Weapon tiers were
  re-spread (uzi guards in the back half, minigun rivals in mission 5) so the
  minigun/target land at the mid-campaign assassinate. Six name/brief keys per
  locale + `data-t` wiring; the `missionNames`/`missionBriefs` arrays extended
  to six. New tests assert the six-mission roster, rising rewards, the weapon
  re-tiering, and per-objective winnability. +2 tests.

Nothing in the round changed a game's rendering, economy, or existing pure-
module contracts, so the risk called out above did not materialise. Next up is
Round 2 (Tank Duel difficulty + Cascade chains) when the arcade is revisited.

---

## Round 2 plan — Twitch-game gameplay & clarity

Goal: fix the two HIGH gameplay findings that leave a signature mechanic
effectively dead. Each ships as **one commit** with the full bar after it
(`npm run lint && npm run typecheck && npm run build && npm test &&
npm run check-links`). Both fixes are verified **empirically through the pure
module** — Tank Duel's `ai.ts` grid-search and Cascade's `run.ts` state
machine — so the "it actually works now" claim is a passing test, not a hope.

### Commit A — Tank Duel: difficulty picker + per-round ramp (+ tactical CPU weapons)

**Intent.** The CPU is a fixed-sharpness opponent: `CPU_DIFFICULTY = 0.72`
passed unchanged every turn (audit's Tank Duel HIGH). Give the player a
**start-screen difficulty picker** and make the CPU **tighten round-over-round
within a match**, so a best-of-5 escalates. The `difficulty` parameter is
already plumbed through the pure AI (`ai.ts` — grid-search + `±30·(1−difficulty)`
scatter on angle and power), so the whole fix is choosing the number that goes
in. Secondary: replace the CPU's **pure-random weapon pick** with a tactical
one (range + target HP aware).

**Intended effect (empirically stated & tested):** a higher difficulty value
produces **measurably tighter shots** — smaller mean miss distance and smaller
spread from the ideal grid-search solution. The per-round ramp raises the
effective difficulty monotonically as rounds are decided, capped at 1.

**Changes (`src/games/tanks/`):**
- `ai.ts` (pure — the whole testable core):
  - `export type Difficulty = 'rookie' | 'gunner' | 'veteran'` with
    `DIFFICULTY_BASE = { rookie: 0.45, gunner: 0.7, veteran: 0.9 }` (gunner ≈
    today's 0.72) and `DIFFICULTY_RAMP = 0.06`.
  - `cpuDifficulty(tier, roundsDecided)` = `min(1, base[tier] + roundsDecided ·
    RAMP)` — a pure function so the ramp is exact under test.
  - `cpuPickWeapon(ammo, range, targetHp, random)` — tactical: prefer **heavy**
    when the target still has real armour and a heavy is stocked (the 72-radius/
    85-dmg finisher earns its scarce ammo), prefer **MIRV** at long range where
    the horizontal fan covers aim error, else the unlimited **missile**. Keeps a
    little randomness so it isn't robotic, but the bias is range/HP driven.
- `game.ts` (wiring only — **no draw-code change**, so Round 4's art pass stays
  untouched and no screenshot pairs are needed):
  - Replace the `CPU_DIFFICULTY` constant with a selected `difficulty: Difficulty`
    (default `'gunner'`) and a `roundsDecided` counter reset in `startMatch`,
    incremented in `finishRound`.
  - The CPU turn passes `cpuDifficulty(difficulty, roundsDecided)` into
    `chooseAiShot`, and `cpuPickWeapon(...)` chooses the shell using the live
    range/HP.
  - Wire three start-overlay difficulty buttons (segmented, middle active by
    default); the pick only matters for `vs CPU`.
- `tanks.astro`: add the difficulty selector markup to the start overlay + the
  `data-t-*` label attributes; 2-player mode ignores it.
- `translations.ts` (×3 locales): `fun.tanks.difficulty` label +
  `difficultyRookie/Gunner/Veteran` names.

**Verification (`tests/games/tanks.test.ts`):**
- `cpuDifficulty`: gunner base ≈ 0.7; monotonic in `roundsDecided`; clamped at 1.
- **Empirical tightness**: over N seeded shots on flat terrain, veteran's mean
  |impact − target| and spread are strictly smaller than rookie's (the "tighter
  shots" proof), and both stay within the legal slider ranges.
- `cpuPickWeapon`: high-HP target + heavy stocked → heavy; long range + mirv
  stocked → mirv; empty specials → missile; deterministic under a fake random.

### Commit B — Cascade: chain-primed garbage at level-up

**Intent.** The cascade-chain is the cabinet's signature and biggest multiplier,
but `maxChain` never exceeds ×2 in natural play (audit's Cascade HIGH): cascade-
gravity flattens the stack, so the overhang structures a ×3+ chain needs never
occur. Chosen direction (of three considered — telegraph+payout, rising-garbage
survival, and this): **seed a chain-primed garbage structure at each level-up.**
On level-up, inject a small pre-authored block at the well floor that is already
primed — near-full rows with a single **feeder column** and staggered **plugs**
above the gaps — so that dropping one piece into the feeder detonates a **×3+
cascade that clears the whole block**. This makes deep chains *reachable* (the
structure is baked, one feed triggers it), *rewarding* (the existing
`base×level×chain` finally pays, lamps light), and *not punishing* (it is
self-clearing — detonating it lowers the stack), while adding the per-level
variety the audit also flagged (Cascade's "speed-only ramp"). The only pressure
is to feed the column before your own stacking buries it.

**Why this is safe to seed:** the garbage is authored so `resolveClears` on
"feeder filled" yields a chain of length ≥3 that consumes every seeded cell —
proven headlessly, so a level-up can never wall the player in.

**Changes (`src/games/cascade/`):**
- `well.ts` or a new `garbage.ts` (pure): a `primedGarbage(level)` /
  `seedGarbage(well, rows)` helper that returns/stamps the chain-primed layer
  (rows chosen so the feeder-column fill cascades clean). Keep it a pure grid
  transform so tests drive it exactly.
- `run.ts` (pure state machine): on `levelUp`, if there is room, stamp the
  primed garbage at the floor (shifting the existing stack up by the layer
  height; if that would top the stack out, skip the seed rather than kill the
  run). Emit a `garbage` event so the view can flash it. The scoring path is
  unchanged — chains already pay `base×level×chain`.
- `game.ts`: handle the `garbage` event (a rim flourish / toast); the chain
  lamps and popups already exist and will finally fire. **This touches the draw
  path** (a new flash + the seeded rows render), so per the methodology add a
  Cascade scenario to `scripts/screenshot-games.js` and ship before/after
  shots (the change is intentional-visual, not a byte-identical refactor).
- `translations.ts` (×3 locales): a `fun.cascade.primed` / garbage toast string
  if one is surfaced.

**Verification (`tests/games/cascade.test.ts`):**
- `primedGarbage`: deterministic; the layer is a legal grid; filling the feeder
  column resolves to a chain of length ≥3 that clears every seeded cell.
- Through `run.ts`: force a level-up, assert the garbage is seeded (and skipped
  when it would top out), then drive the feeder drop and assert a ×3+ `clear`
  chain fires and the score reflects the rising multiplier. Re-confirm the
  headless greedy playthrough still reaches an illegal-state-free end and that
  seeding never leaves an unresolved full row between pieces.

### Sequencing & risk (Round 2)
- Order: doc → Tank Duel → Cascade. One commit each, full verification after
  each, single PR for the round.
- Tank Duel is low risk: pure-parameter change through an already-plumbed AI,
  DOM-only picker, no draw-code touched (keeps Round 4 clean).
- Cascade is the real design risk: the seeded garbage must be provably self-
  clearing (headless chain-length assertion is the guarantee) and must never
  force a top-out — mitigated by skipping the seed when there's no room and by
  authoring the layer against the `resolveClears` harness until it detonates
  clean. It touches draw code, so it carries the screenshot obligation.
