# Arcade Improvement, Round 1 — Audit, Ranking, and the First Round

Date: 2026-07-21
Status: **Rounds 1-5 all shipped — the ranked plan is closed.** Round 1
(**Refill the finite rosters**), Round 2 (**Twitch-game gameplay & clarity**),
Round 3 (**Sim stakes & goals** — Pixel Park + Microcity), Round 4
(**Flat-canvas art pass** — Snake + Tank Duel), and Round 5 (**More authored
content** — Critter Rescue levels + a new Syndicate objective kind) are all
planned and shipped. See "Execution notes" at the foot of each round. Round 5
held to two cabinets; **Pixel Park's attraction art was deferred** (the one item
that pulls in real iso draw code + a screenshot sub-pass) and is the obvious
first candidate of the **fresh audit** the arcade now needs — after Round 5,
further arcade work starts from a new inspection of the nine cabinets, not this
doc's ranking.

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

### Commit B — Cascade: gradual-settle gravity (the real fix)

**Intent.** The cascade-chain is the cabinet's signature and biggest
multiplier, but `maxChain` never exceeds ×2 (audit's Cascade HIGH).

**The discovery that reshaped this commit.** Investigating with the pure module
turned up that ×3+ is not merely *rare* — it is **structurally impossible**
under the current rule. `cascadeGravity` fully compacts every column in a
single settle, so `resolveClears` can only ever reveal one new full-row block
after the first compaction: **over 500k random boards it never exceeds 2
links.** So the ×3-×5 lamps and the `base×level×chain` multiplier beyond ×2 can
*never* fire, whatever garbage is seeded. This invalidated the original
"chain-primed garbage" plan (garbage can't produce deep chains if the gravity
rule caps them at 2) and moved the fix from *seeding around the rule* to
*changing the rule*.

**Chosen direction (of three weighed — accept the ×2 ceiling + polish it,
rising-garbage survival, and this): gradual-settle gravity.** After a clear,
the landslide falls **one row per step**, re-checking for full rows after every
drop — so a plug tumbling past a gap completes a row *mid-fall*, at a height the
instant full-compaction skipped straight past. That is exactly how a cascade
chains beyond ×2, and it makes the name mean something.

**Changes (`src/games/cascade/`):**
- `well.ts` (pure): add `settleStep()` — one row of gravity per call. Rewrite
  `resolveClears` to clear full rows, then `settleStep` one row at a time,
  re-checking between drops. Iterated to a fixpoint it equals the old
  `cascadeGravity` (kept as the instant form), so **final resting positions and
  every existing invariant are unchanged** — only the intermediate reveals
  differ.
- `run.ts` (pure state machine): the interactive clearing phase becomes flash →
  settle-one-row → re-check, via a new `'settling'` phase, so the live game
  shows and scores the rippling cascade. Scoring path untouched
  (`base×level×chain` already there).
- `game.ts`: **no draw primitive changed** — `render`/`drawTile`/
  `drawChainLamps`/backdrop are byte-identical; the sole edit keeps the chain
  lamps lit through the settle. The new ripple is emergent from the state
  machine, not a rendering change, so the screenshot obligation ("if you touch
  their draw code") isn't triggered and a static capture would be byte-
  identical anyway.

**Garbage seeding: considered and dropped.** With gradual settle the greedy
headless bot already hits ×3-×9 chains (was capped at ×2), so deep chains are
reachable and rewarding without seeding. Rising garbage would add an
unrequested difficulty change (a rising stack on top of the speed ramp) and
top-out risk the audit never asked for, so it was cut to keep the commit clean
and the balance intact.

**Verification (`tests/games/cascade.test.ts`):**
- `settleStep`: drops each floating cell exactly one row; iterated it settles
  to the same rest as the instant compaction.
- `resolveClears` now yields ≥3 links on a hand-primed overhang (was capped at
  2 for any board).
- Through `run.ts`: a primed overhang plugged by a vertical I detonates a ×3
  cascade scored per link (100 → 600 → 300 — the rising multiplier), self-
  clearing with no unfired rows; score stays the exact sum of link points; the
  greedy playthrough still ends in a legal state.

### Sequencing & risk (Round 2)
- Order: doc → Tank Duel → Cascade. One commit each, full verification after
  each, single PR for the round.
- Tank Duel is low risk: pure-parameter change through an already-plumbed AI,
  DOM-only picker, no draw-code touched (keeps Round 4 clean).
- Cascade is the real design change: it alters the core settle *feel* (cascades
  now visibly ripple), but the risk is contained because the final board is
  provably identical to the old rule (gradual settle iterated = full
  compaction), so existing invariants hold; the deep-chain behaviour is pinned
  by headless tests through the pure module.

## Round 2 execution notes (2026-07-21)

Both commits landed and passed the full bar (lint, typecheck, build, tests,
check-links) plus a real-browser boot smoke of both cabinets (no JS errors; the
Tank Duel picker reports `aria-pressed` correctly, Cascade starts and takes
input). Test count 526 → 529 net of the round (+9 Tank Duel, +3 Cascade, with
the two Cascade timing tests rewritten for the new settling phase).

- **Tank Duel** (commit "difficulty picker + per-round CPU accuracy ramp").
  The fixed `CPU_DIFFICULTY = 0.72` became a selected tier
  (`rookie`/`gunner`/`veteran` = 0.45/0.7/0.9, gunner ≈ the old value) plus a
  `cpuDifficulty(tier, roundsDecided)` ramp (+0.06/round, capped at 1) so a
  best-of-5 escalates. `cpuPickWeapon` went tactical (heavy on high-armour
  targets, MIRV at long range, else missile). Start-overlay segmented picker +
  i18n ×3 locales; no draw code touched (Round 4 stays clean). Empirically
  verified: over 50 seeded shots a veteran's mean miss and grouping are strictly
  tighter than a rookie's.

- **Cascade** (commit "gradual-settle gravity so cascade chains reach past ×2").
  The headline finding — ×3+ was *structurally impossible* under full-compaction
  gravity (≤2 links across 500k random boards) — turned this from a garbage-
  seeding job into a settle-rule change. `settleStep()` drops one row per call;
  `resolveClears` and the new `'settling'` run phase re-check for full rows
  between drops, so a plug completes rows mid-fall. Deep chains now reachable and
  occurring: the greedy bot reaches ×3-×9 (was ×2), and a primed overhang
  detonates a headless ×3 (100 → 600 → 300). Final resting positions are
  unchanged (gradual iterated = the retained instant `cascadeGravity`), so the
  render code and every invariant held; garbage seeding was considered and cut
  as unnecessary and difficulty-distorting.

Neither commit changed a game's render primitives, so no screenshot pairs were
needed (Tank Duel: no draw change; Cascade: draw code byte-identical, the ripple
is state-driven). Round 3 (sim stakes & goals — Pixel Park + Microcity) is next
when the arcade is revisited.

---

## Round 3 plan — Sim stakes & goals

Goal: the two big iso sims stop being solved economies with no finish line.
Both flagged HIGH for the **same root flaw** — per-unit revenue (a guest's
spend, a resident's tax) is pure profit above a *flat* cost floor, so once the
crowd/population arrives `money<0` can never fire again and the only lose
condition dies. Park is additionally **score-capped**: it banks `peakGuests`
and `maxGuests` tops out at 120 (`mayhem.ts`), so the leaderboard number can't
grow past ~day 17. Each game ships as **one commit** and passes the full bar
after it (`npm run lint && npm run typecheck && npm run build && npm test &&
npm run check-links`).

### The shared spine (three levers, applied to both)

1. **Late-game failure pressure = running costs that scale with size and ramp
   with age.** A static build slides into deficit, re-arming `money<0` as a
   live threat. (Weighed against: per-guest/per-capita-only costs — still a
   flat margin at scale; and making mayhem/disasters economically punishing —
   swingier to tune. Rising, size-scaled costs are the cleanest testable lever
   and the one both sims share.)
2. **Objectives with teeth = a milestone chain with cash rewards + a final
   "established" prestige win that continues endless** (mirrors Round 1's Line
   Hold campaign-cleared handoff; the run still only *ends* on bankruptcy, so
   the score chase is preserved).
3. **An honest, uncapped score.** Park's is the one that's broken; Microcity's
   `peakPop` is already unbounded.

All new economy/objective logic goes into **pure, DOM-free modules** so the
balance is pinned by headless tests. The objective/goal readouts are **DOM HUD
elements**, and the screenshot harness (`scripts/screenshot-games.js`) captures
**raw canvas pixels only** (`snap()` → `toDataURL`, immune to DOM overlays), so
Park — whose economy is pure and whose objective UI is DOM — changes **no
canvas draw code** and needs no screenshot pair. Microcity's traffic rework
touches car rendering, so it ships before/after captures.

### Commit A — Pixel Park: rising wages, objectives, lifetime-guests score

**Intent.** Reintroduce late failure pressure, add a paced objective chain,
and lift the 120-guest score cap.

**1. Rising staff wages (`economy.ts`, pure).** Attractions accrue a per-head
staff wage that ramps with park age, so a park that stops growing its takings
slides into the red.
- `WAGE_GRACE_DAYS = 5` (a learning window with no wages), `WAGE_RAMP = 1.4`.
- `wagePerAttraction(day) = max(0, day − WAGE_GRACE_DAYS) · WAGE_RAMP` — linear
  and **unbounded**.
- `attractionCount(tiles)` = placed `BUILDINGS` entries (rides + stalls).
- `operatingCost(tiles, day) = dailyUpkeep(tiles) + round(attractionCount ·
  wagePerAttraction(day))`.
- `maxAttractionDailyRevenue()` = `max` over `BUILDINGS` of
  `(DAY_SECONDS / useTime) · price` — the throughput-capped daily takings
  ceiling of a single attraction (a stall serves one guest per `useTime`).
  Export `DAY_SECONDS = 24` here as the single source (game.ts's `DAY_LENGTH`
  imports it) so the wage/revenue maths share one constant.
- `game.ts`: the day tick charges `operatingCost(tiles, day)` instead of
  `dailyUpkeep(tiles)`; toast and any HUD reflect it. Day-end `money<0` check
  unchanged.

**Intended effect (tested):** `operatingCost` is ≥ `dailyUpkeep`, equal during
grace, monotonic non-decreasing in `day`, and linear in attraction count; and
`wagePerAttraction(day)` **crosses `maxAttractionDailyRevenue()`** at a finite
day — beyond which every attraction is net-negative regardless of park size, so
the run is guaranteed to end (bankruptcy re-armed). The in-practice crossover
(real crowds never max throughput) lands earlier and is skill/size-dependent.

**2. Objective chain + established win (`objectives.ts`, pure; DOM readout).**
An ordered `PARK_OBJECTIVES`, each `{ metric, target, reward, labelKey }` over a
compact `ParkProgress` snapshot `{ welcomed, peak, rating }`:
  1. `welcomed ≥ 10` → £250 · "Welcome {n} guests"
  2. `rating ≥ 60` → £500 · "Reach a {n}% rating"
  3. `peak ≥ 45` → £700 · "Draw a crowd of {n}"
  4. `welcomed ≥ 400` → £900 · "Welcome {n} guests"
  5. `peak ≥ 90` → **★ established** (win; endless) · "Draw a crowd of {n}"
- `objectiveMet(obj, progress)` pure predicate; rewards inject capital that
  offsets the rising wage bill (the intended economic loop).
- `game.ts`: track the current objective index; on the relevant ticks, if met,
  pay the reward, toast "Goal complete +£{n}", advance; the last one fires a
  one-time "Park established! Endless." toast and marks the goal strip done.
  Play continues; the run still ends only on bankruptcy.
- DOM: a `#objective` goal strip in `park.astro` between header and canvas,
  fed localized templates via `data-t-*`. No canvas draw change.

**3. Lifetime-guests score.** `guestsWelcomed++` in `spawnGuest()` (the single
admission hook); `board.bank(guestsWelcomed)` replaces `board.bank(peakGuests)`;
the record readout and the over-screen show **guests welcomed** (unbounded,
still crowd-driven). `peakGuests` stays tracked (objective metric + a secondary
"peak crowd" stat). Over-screen: "Days open · Guests welcomed".

**Verification (`tests/games/park.test.ts`):** economy — `operatingCost`
monotonic/≥upkeep/linear-in-attractions, wage-vs-revenue crossover exists;
objectives — targets non-decreasing within a metric, rewards positive, `≥`
boundary correctness, exactly one terminal `win`. No canvas draw change (note
byte-identical; not required to capture). Boot smoke against `dist`.

### Commit B — Microcity: per-capita costs, milestone grants + win, live traffic

**Intent.** Make a developed city bankruptable by shocks, give the pop
milestones teeth and a finish, and turn the dead traffic mechanic into a real
late-game planning constraint.

**1. Per-capita running costs (`budget.ts`, pure).** Services cost more the
bigger the city they serve, so income no longer runs away from a flat upkeep.
- `SERVICE_COST_PER_CAPITA = 0.9`, `SERVICE_FREE_ALLOWANCE = 150`.
- `monthlyExpenses(tiles, stats?)` — adds `round(max(0, pop + jobs −
  SERVICE_FREE_ALLOWANCE) · SERVICE_COST_PER_CAPITA)` **when `stats` is
  supplied**; the existing no-stats signature (and its tests) stay valid.
  `game.ts` passes live `stats`.
- **The free allowance was a balance-iteration fix**, not in the first cut: a
  flat per-capita bill from resident #1 death-spiralled *small* cities (a
  browser probe bankrupted a stuck-at-72 city by month ~94, before it ever
  reached the first grant). The allowance makes the squeeze a genuine
  *late-game* one — a small/growing city pays nothing extra, but past ~150
  people a developed city runs only a **thin surplus**, so sprawl,
  over-servicing, political fines, or a quake razing a district (lost income
  while costs lag + rebuild spend) can drain the treasury to `money<0`.
  (Weighed against power-load/brownouts — more sim + draw; and time-based
  inflation — more arbitrary. Per-capita is a one-line pure change that
  directly closes the runaway-income gap.)

**2. Milestone grants + metropolis win.** `MILESTONE_GRANTS = [400, 900, 1800,
4000, 8000]` parallel to `MILESTONES = [100, 250, 500, 1000, 2000]`: crossing a
pop milestone pays the grant (toast "Population {n} +£{g}"), funding growth
against the tighter economy. The final (2000) fires a one-time "Metropolis!
Endless." win toast and marks the goal strip done; play continues, `peakPop`
still banks. DOM `#objective` strip shows the next milestone + progress.

**3. Traffic that matters — congestion (`traffic.ts` pure + growth coupling +
car rendering).** (Weighed against retiring the cosmetic cars — lower risk but
the opposite of deepening; chosen: make it matter, scoped to the late game so
it never blocks the early milestones.)
- `computeCongestion(tiles): number[]` — per road tile, `load = Σ level of
  developed zone tiles within Chebyshev ≤ 1`; `congested = load >
  CONGESTION_THRESHOLD (6)`. A road hemmed by dense zones with no parallel
  relief route saturates.
- Growth coupling: `growthStep` takes optional `congested: boolean[]`; a zone
  **all of whose adjacent roads are congested** grows at reduced probability and
  is **barred from `DENSE_LEVEL`**. One uncongested frontage relieves it — so a
  dense district needs a road *grid*, not a single spine. Scoped to the late
  game (only bites at high zone levels), so early milestones are unaffected.
- Visual: cars slow on congested tiles (speed scaled down), so traffic visibly
  clots at chokepoints — the mechanic is legible. This is the canvas-visible
  change → before/after captures.

**Verification (`tests/games/city.test.ts`):** budget — per-capita term scales
with pop+jobs, no-stats path unchanged; congestion — `computeCongestion`
thresholds, a choked zone won't densify while a relieved one will, growthStep
back-compat (no `congested` arg = today's behaviour); milestone grants array
parity + rising. Screenshots: extend the `city` scenario with a denser cluster
so the after-capture shows clotting; ship before/after (this is an intended
visual change, not a byte-identical refactor). Boot smoke against `dist`.

### Sequencing & risk (Round 3)
- Order: this doc → Pixel Park → Microcity. One commit each, full bar after
  each, single PR for the round.
- **Balance is the real risk.** Park's revenue is emergent from the guest sim
  (not cleanly headless), so the economy's *cost* side is pinned by pure tests
  and the crossover guarantee, while the felt balance (when a good vs sloppy
  park dies) is validated by a real-browser playtest and conservative constants;
  if wages bite too hard, `WAGE_RAMP`/`WAGE_GRACE_DAYS` dial it in a fast loop.
- Microcity's per-capita rate and congestion threshold are tuned so a
  well-planned city still thrives (milestones stay reachable) but a careless or
  unlucky one can fail — validated through the budget/simulation pure modules.
- Congestion is the one mechanic with new gameplay coupling; it's gated to the
  late game and threaded as an *optional* growthStep input so every existing
  simulation test holds unchanged.

## Round 3 execution notes (2026-07-21)

Both commits landed and passed the full bar (lint, typecheck, build, tests,
check-links) plus real-browser boot smokes. Test count 529 → 543 (+8 Park, +6
Microcity). The design forks were resolved to the recommended spine: rising
wages; lifetime-guests score; per-capita running costs; make traffic matter.

- **Pixel Park** (commit "staff wages, objective ladder, lifetime-guests
  score"). `operatingCost(tiles, day)` = flat upkeep + an unbounded per-head
  wage bill (`wagePerAttraction`, grace of 5 days then `+1.4/attraction/day`),
  charged at the day tick — so a park that stops growing its takings slides
  back into `money<0`. The re-arm is proven, not hoped: `wagePerAttraction`
  provably crosses `maxAttractionDailyRevenue()` (a stall's throughput-capped
  daily ceiling), beyond which every attraction is net-negative regardless of
  size. A five-rung `PARK_OBJECTIVES` ladder (welcomed/rating/peak) pays cash
  rewards that offset the wage bill and ends in an "established" endless win;
  the banked score switched from `peakGuests` (hard-capped at 120) to lifetime
  `guestsWelcomed` (uncapped, still crowd-driven). Objective/score UI is DOM
  (a goal strip), the economy is pure — **no canvas draw code changed**, so
  the pixel-diff harness sees nothing. Boot smoke confirmed objectives fire and
  pay out with no JS errors.

- **Microcity** (commit "per-capita economy, milestone grants + win, live
  traffic"). Three levers. (1) `monthlyExpenses(tiles, stats?)` gained a
  per-capita service bill on population past a **free allowance** — the
  allowance was a real balance-iteration fix (a browser probe showed a flat
  per-capita bill death-spiralled small cities), moving the squeeze to the late
  game: a small city pays nothing, a developed one runs a thin surplus that a
  disaster can drain. (2) `MILESTONE_GRANTS` pay cash on each pop milestone,
  the last being an endless "metropolis" win; a DOM goal strip shows progress.
  (3) `computeCongestion` scores each road by the developed-zone level it serves
  (**orthogonal neighbours** — matching `roadAdjacent` semantics, a small
  refinement from the plan's Chebyshev sketch); `growthStep` gained an optional
  `congested` input that throttles and dedensifies choked zones, and cars crawl
  over congested tiles. The congestion mechanic is proven end-to-end by unit
  tests (detection + the densify-choke); the car-slow rendering is inert until a
  district actually congests, so the seeded starter screenshot scenarios came
  out **byte-identical before/after** (verified with `screenshot-games.js` —
  the required no-regression check), and a bespoke congesting capture was judged
  not worth the deterministic-scenario engineering given the logic-level proof.

Both games gained a DOM goal strip (goal + progress, or an "established"
banner) between the header and the canvas — server-rendered label, runtime
templates via `data-t-*`, invisible to the canvas screenshot harness. The
candidates queue stays parked. Next up is Round 4 (flat-canvas art pass —
Snake + Tank Duel) when the arcade is revisited.

---

## Round 4 plan — Flat-canvas art pass

Goal: the two flat-canvas cabinets — Snake and Tank Duel, the only playable
ones **not** in the PR #176 art-definition round — reach the art bar the five
iso sims already meet (finer drawing units, shading, outline discipline,
hashed variety, baked static layers; see `2026-07-19-arcade-art-definition.md`
"Ground rules"). This is a **draw-code** round: unlike Rounds 1–3 the render
output changes on purpose, so **screenshots are the primary verification** and
each commit ships **before/after pairs**. Neither game is in
`scripts/screenshot-games.js` yet (it covers only the iso cabinets), so the
round's first job is extending the harness. Each game ships as **one commit**
and passes the full bar after it (`npm run lint && npm run typecheck &&
npm run build && npm test && npm run check-links`).

Non-goals (same as PR #176): no gameplay, scoring, or layout changes; no
canvas resize; nothing touching pointer math (`toLogical`) or the headless
pure-module tests. All work is in the games' closure draw helpers.

### Harness extension (folded into the doc/first commit)

`scripts/screenshot-games.js` gains two flat-canvas scenarios. Both games are
DOM-input driven (buttons/keys), not iso tile-clicks, so they don't need the
`VIEWS`/`clickTile` machinery — they drive the same seeded clock:

- **Snake** (`/en/fun/snake/`): `#start-btn`, then feed a fixed key script
  (`window`-dispatched `keydown`s) and step the clock so the snake grows to a
  known length with an apple and — by eating to the 5th apple — a bonus apple
  on the board. Two snaps: `snake-play` (mid-length body + apple) and
  `snake-bonus` (bonus apple visible with its timer ring). The seeded
  `Math.random` fixes apple/bonus placement, so captures are deterministic.
- **Tank Duel** (`/en/fun/tanks/`): click `#vs-cpu-btn` (seeded terrain +
  fixed start), snap `tanks-aim` (both tanks on the seeded terrain, wind
  indicator, aim guide). Then script one human shot (set the angle/power
  sliders, `#fire-btn`) and step until the shell lands and the dust settles,
  snap `tanks-impact` (a crater in the terrain — exercises the bake-on-crater
  path — plus a drawn shell mid-flight in a second snap `tanks-fly`). Snaps
  are taken on **settled, shake==0** frames so the seeded `Math.random` shake
  jitter can't leak in.

The harness note (header comment + the `game` list in the usage line) is
updated to list `snake` and `tanks`.

### Commit A — Snake: shading, outline discipline, hashed variety

**Intent.** Snake is the stronger flat cabinet but still short of the bar: the
body is two flat greens with no grounding outline or lit rim, and nothing is
hashed — every segment and every apple is byte-identical. The board already
bakes (`createStaticLayer`/`paintBoard`) and the pieces are real vector
primitives, so this is a **shading/outline/variety pass, not a rebuild**.

**Changes (`src/games/snake/game.ts` draw helpers only):**
- **Body outline + shading ramp (`drawSnake`).** The current two-stroke tube
  (base `#15803d` + lit `#22c55e`) gains a **dark grounding outline** as the
  widest stroke and a **lit top rim** so the body reads with value contrast:
  outline `#052e16` (width `CELL-1`) → mid `#166534` (width `CELL-3`) → lit
  core `#22c55e` (width `CELL-8`). The dying-flash palette keeps its existing
  red ramp.
- **Hashed scale variety (`drawSnake`).** The flat chevron dots become
  **hashed-shade scale marks**: each dot's darkness keyed off `hash01(i, salt)`
  (engine `canvas.ts`) on the segment's head-distance index `i`, so the scales
  vary segment-to-segment but stay stable per body position (anchored to
  head-distance, not crawling). Still `i += 2`, still skipped on the flash
  frames.
- **Head rim (`drawSnake`).** The head dome gets the same dark outline ring +
  a small lit highlight so it grounds against the body; eyes unchanged.
- **Apple variety (`drawApple`).** Keyed on the apple's board cell
  (`hash01(food.x * COLS + food.y, salt)`): leaf angle/side, a hashed count of
  1–2 shine specks, and a subtle body-tone pick from a 2–3 red palette — so
  consecutive apples aren't identical. Pulse/shadow unchanged. A dark rim arc
  grounds the fruit.
- **Bonus variety (`drawBonus`).** Hashed sparkle-speck positions on the golden
  body; timer ring + pulse unchanged.

**Intended visual effect:** the snake reads as a rounded, outlined, scaled
serpent instead of a flat two-tone tube; apples and the bonus each look
slightly different rather than stamped copies — hashed, so stable across frames
and DPR rebuilds. No motion, timing, or hitbox change.

**Verification:** full bar (draw-only, so the headless `snake.test.ts` stays
green untouched); **before/after** `snake-play` + `snake-bonus` pairs from the
extended harness; browser boot smoke (run starts, console clean).

### Commit B — Tank Duel: terrain bake + tank/weapon art

Two changes in one game commit — a **byte-identical perf refactor** (terrain
bake) plus the **intended art changes** (tanks + shells). The bake is verified
first, in isolation, as byte-identical (`cmp`) before the art goes on top.

**1. Terrain bake-on-crater (pure perf, byte-identical).** `render()`
re-tessellates the dirt polygon every frame (~800 `lineTo` for the fill +
~800 for the surface stroke) though `ground` only changes on `carveCrater`.
Bake it:
- A `terrainLayer = createStaticLayer(WIDTH, HEIGHT, paintTerrain)` where
  `paintTerrain` draws the exact same dirt gradient fill + green surface
  stroke from the current `ground` (guarded `if (!ground.length) return`).
- Rebuild the layer only when `ground` changes: after `generateTerrain` in
  `newRound` and the idle init, and after `carveCrater` in `impactAt`. Chain
  `terrainLayer.rebuild` into `setupHiDpiCanvas`'s `onApply` beside
  `backdrop.rebuild` so a DPR change re-bakes both.
- `render()` blits `terrainLayer.draw(ctx)` in place of the per-frame
  tessellation, at the same point in the draw order (after the backdrop blit,
  before the tanks), so compositing is identical. Under screen shake it gets
  the same whole-pixel translate as the backdrop.
- **Proof:** capture the harness scenarios on the pre-bake render, apply the
  bake **alone** (no art yet), re-capture, and `cmp` byte-for-byte. The bake
  removes no `Math.random` calls, so the seeded shake sequence is preserved;
  snaps are taken on settled frames regardless.

**2. Tank art — turret, tread, shading ramp, outline (`drawTank`).** Today a
`roundRect` hull + a flat 5px tread strip + a single stroked barrel line, no
turret/wheels/shading/outline. Bring it to the bar with value contrast:
- **Hull:** grounding dark outline (`shadeColor(color, low)`) + lit top rim
  (`shadeColor(color, high)`) over the body fill — the same low/high recipe
  `drawBlock` uses. (Engine `shadeColor` from `iso.ts`.)
- **Tread:** a rounded track band with **road-wheel dots** showing through
  (hashed nothing — fixed count, both tanks identical is fine; the variety
  bar is per-*tile* construction, and there's one tank sprite), a drive
  sprocket hint at each end.
- **Turret:** a small rounded turret dome seated on the hull, the barrel
  emerging from it (barrel keeps its live `angle`); a muzzle lip at the tip.
- Destroyed/flash palettes preserved; HP bar, name, active marker unchanged.
- The specific turret/tread silhouette is a **craft choice → confirm the
  direction (2–3 variants) before building.**
- **Cost:** the tank is drawn per frame today and stays per frame (it moves /
  aims / flashes); the added detail is a handful of arcs/rects per tank, well
  within the two-sprite budget. No new per-frame allocation (helpers at
  closure scope, colours precomputed where animation-independent).
- **Contract note:** `TANK_W`/`TANK_H`/`BARREL_LEN` and `barrelTip` (used by
  `fire()` and the aim guide) are **unchanged**, so shot origin and pointer
  aim math are untouched — the new art draws within the existing footprint.

**3. Weapon projectile shapes (`render` shot loop).** Today every shell is an
identical yellow circle (heavy just a larger radius). Give each `WeaponId` a
distinct drawn shell, oriented to its velocity: **missile** a pointed
nose-cone shell, **heavy** a bigger dark finned bomb, **mirv** a segmented
cluster shell. Trail unchanged. (The DOM weapon-bar **emoji stay** — they're
off-canvas UI chips, the arcade's accepted glyph channel, like Pixel Park's
mount emoji; the screenshot harness captures canvas pixels only, so they never
appear in a pair regardless.) Shell shapes are a **craft choice → confirm
before building.**

**Intended visual effect:** tanks read as armoured vehicles (turret, wheeled
tread, shaded hull with a grounding edge) instead of a rounded bar with a
line; in-flight shells are distinguishable by weapon. Terrain is pixel-for-
pixel unchanged (the bake) except where a crater is carved by play.

**Verification:** the byte-identical `cmp` on the bake (stage 1) reported
explicitly; then full bar; **before/after** `tanks-aim` + `tanks-fly` +
`tanks-impact` pairs (after-art differs by design; the crater in
`tanks-impact` also demonstrates the bake-on-crater rebuild); browser boot
smoke (match starts, a shot fires, console clean).

### Sequencing & risk (Round 4)
- Order: this doc + harness extension → Snake → Tank Duel. One commit per
  game, full bar after each, single PR for the round.
- **Screenshots are the deliverable-grade check** this round (draw code
  changes), so the harness extension lands first and every commit carries its
  pairs. The one hard invariant is the terrain bake: it must `cmp`
  byte-identical before any art is layered — if it doesn't, the bake leaked a
  render difference and gets fixed before proceeding.
- Craft risk (does the finer tank/snake art actually look better at this
  scale) is handled the PR #176 way: half/quarter-pixel alignment for 1px
  detail, value-contrast outlines, and direction confirmed with the owner on
  the non-obvious levers (turret/tread silhouette, shell shapes, snake
  shading/variety scheme) before building.
- No per-frame cost creep: the terrain bake *removes* ~1,600 path ops/frame;
  the tank detail is a bounded addition to an already per-frame sprite. Frame
  time is spot-checked in the browser if either game feels heavier.

## Round 4 execution notes (2026-07-22)

All three commits landed and passed the full bar (lint, typecheck, build, 543
tests unchanged, check-links). The three non-obvious craft levers were
confirmed with the owner up front and all built to the recommended option:
scaled-serpent snake, turret + road-wheels tank, distinct drawn shells.

- **Harness extension** (commit "plan the flat-canvas art pass + extend the
  screenshot harness"). Both flat cabinets are now in
  `scripts/screenshot-games.js`. The Tank Duel scenario was straightforward
  (seeded terrain + a scripted heavy shot). Snake fought back: the game renders
  with **interpolated** (sliding) motion, so a naive fixed-dt or green-pixel
  poll drifts against the pixels, and the body's dark scale-dots defeat
  eye-based head detection. The landing design is a small greedy bot that reads
  only the apple/bonus (solid red/gold discs) off the canvas and tracks the
  head/body logically through a **drift-free** move primitive — it steps
  exactly the current (shrinking) move interval each call, carrying the
  sub-step remainder, so cumulative stepped time tracks cumulative intervals
  and exactly one move fires. It reliably grows the snake and reaches the timed
  bonus. Output dirs (before/after/shots) are gitignored.

- **Snake** (commit "outline discipline, shading ramp, and hashed variety").
  Draw-only, headless tests untouched. The two-flat-green tube gained a
  dark→mid→lit width ramp and a dark head ring + crown highlight; the flat
  chevron scale dots took a shade hashed off the head-distance index; apples
  gained a hashed red/leaf/shine + dark belly rim (keyed on board cell) and the
  bonus a dark rim + hashed sparkles. Before/after crops confirmed the head now
  sits proud of the body and the fruit reads with depth.

- **Tank Duel** (commit "bake the terrain, and give tanks a turret/tread +
  drawn shells"). The terrain bake was the round's one hard invariant. First
  cut used a separate transparent terrain layer and `cmp` flagged **339 pixels,
  max delta 1 LSB, confined to the 2 rightmost anti-aliased columns** — the
  classic loss from compositing an AA edge through a transparent buffer.
  Resolved by baking the terrain **onto the opaque backdrop** in one scene
  layer, so the finished opaque blit reproduces the old draw order exactly:
  `cmp` then reported **IDENTICAL** on all three scenarios. The art then went on
  top: hull value ramp + rounded turret dome + wheeled tread band +
  muzzle-lipped barrel (footprint/`barrelTip` unchanged, so aim math is
  untouched), and per-weapon drawn shells oriented to velocity (missile
  nose-cone, heavy finned bomb, MIRV cluster) replacing the identical yellow
  circle. Before/after crops confirmed the tank now reads as an armoured
  vehicle and the heavy shell as a bomb.

The candidates queue stays parked. Round 5 (more authored content) is planned
in full below.

---

## Round 5 plan — More authored content

Goal: refill the two remaining hand-authored rosters whose depth is a finite
list, following the Critter Rescue content model — **every unit empirically
proven by a headless completability suite**. This is a **content/data** round,
not an art one: no economy or existing-render changes, so no screenshot pairs;
the proof is passing headless tests. Each cabinet ships as **one commit** and
passes the full bar after it (`npm run lint && npm run typecheck &&
npm run build && npm test && npm run check-links`).

### Scope decision — two of the three, Park deferred

The ranked sketch listed three cabinets (Critter Rescue levels, a new Syndicate
objective kind, Pixel Park attractions). Given a one-session budget with full
verification after each commit, this round ships the **two that fit the
content/data + headless-proof methodology cleanly**:

- **Critter Rescue** — pure content (new levels), the model the round imitates.
- **Syndicate** — the "expensive path" the sketch called out: one *new
  objective kind*, wired into a new mission, proven winnable headlessly.

**Pixel Park is deferred.** New attraction *types* need drawn iso art to the
PR #176 bar (`grid.ts`'s `BUILDINGS` catalogue backs real `drawBuilding`
geometry), which turns that item into a **draw-code art sub-pass with
before/after screenshots** — the opposite of this round's "no draw code"
framing, and the heaviest single item on the budget. Since Round 5 closes the
ranked plan and the doc already says the next arcade work needs a fresh audit,
**Park's attraction expansion is the natural first candidate of that fresh
audit** rather than a rushed third commit here. (Flagged per the brief: yes, it
pulls in real draw code, so it is a mini-art-pass, not a data-only change.)

### Commit A — Critter Rescue: five new levels (21–25)

**Intent.** Extend the hand-authored set from 20 → **25**, continuing the
deliberate curve past the level-20 gauntlet with a **breather** and **fresh
combinations of the back-half rule twists** (steel, timers, two hatches). The
level *design* is the work; the headless `playLevel` harness
(`lemmings.test.ts:543-611`) is the guarantee — each new level ships with a
solvable playthrough test in the same style as levels 1–20, so "it's beatable"
is a passing test, not a claim. No draw/logic change to the game itself — this
is pure `levels.ts` data + i18n + tests.

**The five (intents; exact layouts iterated against the harness):**
- **21 — breather.** After the everything-at-once gauntlet, a calm
  single-skill level (a build-ramp or dig-down) with generous stock and no
  clock — deliberately resets tension, the same way 14 ("Double Trouble")
  breathes after the 13-level grand tour.
- **22 — steel twist.** A dig or bash level where **steel** gates the obvious
  route, forcing the skill onto the one earth seam (reuses the proven L16/L18
  steel-strip strategy windows so solvability transfers).
- **23 — two-skill chain.** A **bash-then-build** (or build-then-bash) two-stage
  route over a wall + step, reusing L8's proven windows.
- **24 — timed combo.** A **float-into-a-pit-then-dig-out** route against a
  hard `timeLimit`, combining L9/L12's umbrella-drop with a clock; par sits
  strictly inside the limit (the levels-invariant test enforces this).
- **25 — grand finale.** Beyond the gauntlet: **two hatches + timer + steel +
  the full skill set** over a longer, multi-stage trek — the new capstone.

**Fixed per-level overhead (the content model):**
- Bump the length assertion `expect(LEVELS).toHaveLength(20)` → `25`
  (`lemmings.test.ts:385`); the invariant loop and the ramp/hatch/exit bounds
  checks already range over `LEVELS` so they cover the new entries for free.
- Each new level (all ≥7) carries a `hint` key. The page auto-wires
  `data-t-hint<index>` from `LEVELS` (`lemmings.astro:29-30`), so the only new
  wiring is the translation keys: `fun.lemmings.hint21` … `hint25` **× 3
  locales** (the locale-parity guard at `lemmings.test.ts:436-449` — which
  ranges over `LEVELS.length` — enforces this).
- Each new level gets a **solvable playthrough test** appended to the
  `levels — solvable playthroughs` describe, asserting `saved ≥ needed` via a
  `strategy` callback (and at interval 80 / `TRICKLE` for timed levels, so the
  clock guarantee holds at the shipped release-slider default).

**Verification.** Full bar; the new playthrough tests are the completability
proofs. No render change (note byte-identical; no screenshot pair).

### Commit B — Syndicate: a new "secure" objective kind (hold the LZ)

**Intent.** Add the campaign's first **new objective mould** since launch — a
*hold-an-area* contract — and wire it into a new **mission 7** finale, so the
roster gains a genuinely new win condition rather than another reskin of
eliminate/persuade/assassinate. Proven winnable headlessly through
`missionStatus`, exactly like the other three.

**Why hold-an-area (of the three sketched — sabotage / hold / escort).** It is
the one new kind that needs **no new unit kind and no new sim AI**: the control
point is the **existing extraction tile** (reused, not a new prop), ringed by
guards with the same `spreadTargets` lair-ring the assassinate branch already
uses, and the win is a **persuade-style scalar progress** counter. Escort would
need a new VIP unit + follow behaviour + a new lose branch; sabotage is
mechanically just assassinate-with-many-targets (low novelty). Hold reuses the
most and tests the cleanest.

**Changes (`src/games/syndicate/`, content/logic — no art):**
- `units.ts`: no change (no new unit kind).
- `missions.ts`:
  - `Objective` gains `'secure'`; `MissionSpec` gains optional
    `holdSeconds?: number` (seconds the squad must control the LZ; unset/0 for
    the other moulds, so specs 1–6 are untouched).
  - `spawnMission`: a `secure` branch that **rings the extraction tile with
    guards** (mirroring the assassinate lair ring) so the LZ is contested;
    enemies patrol as before. No `target` unit, no new setup field — the hold
    zone *is* `setup.extraction`.
  - `missionStatus` gains a 5th **optional** `holdProgress = 0` arg (back-
    compatible with every existing 4-arg call) and a `case 'secure':` →
    `holdProgress >= (spec.holdSeconds ?? 0) ? 'won' : 'ongoing'`.
  - Append **mission 7**: `objective: 'secure'`, the deepest guard ring the
    campaign fields, top-tier hostile chrome, `holdSeconds` ≈ 20, `reward`
    6000 (> mission 6's 5000) — the new campaign closer.
- `game.ts`:
  - `holdProgress` state, reset per mission load; accumulated in `update` while
    `agentAtExtraction()` is true for a `secure` mission (cumulative occupied-
    time — clearly winnable, forgiving of a brief step-out). Passed as the new
    `missionStatus` arg.
  - `strings.objectiveSecure` (`s('tObjectiveSecure', 'Hold the landing
    zone')`) and a 7th `missionNames`/`missionBriefs` entry.
  - Objective HUD: a `secure` branch showing `Hold the LZ (⌊hold⌋/N s)`.
  - The extraction-pad marker draw (today gated to `persuade`,
    `game.ts:939`) is **generalized to also show for `secure`** — the one
    small render touch, reusing the existing pad-draw rather than adding new
    art (no screenshot pair; it is a functional objective marker, like
    persuade's, not an art-bar change to existing pixels).
- `syndicate.astro`: add `data-t-objective-secure` and
  `data-t-mission7-name/-brief`.
- `translations.ts` (× 3 locales): `fun.syndicate.objectiveSecure`,
  `mission7Name`, `mission7Brief`.

**Verification (`tests/games/syndicate.test.ts`):**
- Update the roster test: `MISSIONS.length === 6` → `7`; the objective-set
  assertion gains `'secure'`; mission 7 is `secure` with a reward above
  mission 6; the `slice(3)` guard-weapon assertion still holds (mission 7's
  guards carry uzis).
- The winnability test (`for (const spec of MISSIONS.slice(3))`) gains a
  `secure` branch: `missionStatus(spec, units, 0, false, 0)` is `'ongoing'` and
  `missionStatus(spec, units, 0, false, spec.holdSeconds)` is `'won'` (mirrors
  the persuade quota probe).
- A spawn-integrity assertion that the `secure` mission rings the extraction
  with its guards on walkable tiles (the existing `for (const spec of MISSIONS)`
  spawn test already covers agent/civilian/enemy counts and walkability).
- Confirm the new i18n keys resolve in all 3 locales.

### Sequencing & risk (Round 5)
- Order: this doc → Critter Rescue → Syndicate. One commit each, full bar after
  each, single PR for the round.
- **Critter Rescue's risk is the level layouts** — a hand-designed level that
  the harness can't beat. Mitigated the same way the original 20 were: iterate
  each layout against `playLevel` until its test passes (the test *is* the
  completability proof). If a level proves stubborn, simplify it or drop to
  four new levels and say so — the pure harness makes that a fast loop.
- **Syndicate's risk is low**: the `secure` objective reuses the extraction
  tile and the assassinate guard-ring, adds one optional `missionStatus` arg
  (so every existing call and test stays valid), and its winnability is a
  scalar-threshold check identical in shape to persuade's. The only render
  touch is generalizing an existing marker.

### Closing the ranked plan
After Round 5, **the ranked plan (`2026-07-21` audit) is exhausted.** Further
arcade work needs a **fresh audit** of the nine cabinets. The obvious first
candidate for that audit is the item deferred here — **Pixel Park's attraction
catalogue** (new ride/stall types with drawn iso art to the PR #176 bar) — plus
anything the next inspection surfaces. The tenth-cabinet candidates queue
(`2026-07-18-arcade-candidates-3.md`) stays **parked** throughout.

## Round 5 execution notes (2026-07-22)

Both cabinet commits landed and passed the full bar (lint, typecheck, build,
tests, check-links); Syndicate also cleared a real-browser boot smoke. Scope
held to the recommended two cabinets — Pixel Park deferred to the fresh audit.
Test count over the round: 543 (Round 4's close) → **550** (+6 Critter Rescue,
+1 Syndicate). No draw code changed on either cabinet beyond one small
functional marker in Syndicate, so no screenshot pairs were needed.

- **Critter Rescue** (commit "five new hand-authored levels (21-25)"). Pure
  `levels.ts` data + hints + tests; no game logic or render change. The set grew
  20 → 25, continuing the curve past the gauntlet: 21 a valley-crossing build
  breather, 22 a steel-seam dig (with a counterfactual test proving the steel
  half saves no one, echoing L16/L18), 23 a bash-then-build march, 24 a timed
  umbrella-drop-into-dig, 25 a two-hatch timed steel finale. The one design
  subtlety was the builder-overshoot rule — a build-onto-ledge climb must be
  exactly 12 px (`BUILD_BRICKS`) so the builder exhausts its treads at the rim
  rather than climbing past it — so 21/23's ledges were sized to a full
  staircase and 25 reused level 20's proven bash/build strategy windows
  verbatim. Every layout passed its headless `playLevel` proof on the first run
  (the design is the work, the test is the guarantee). Five hint keys × 3
  locales, auto-wired by the page from `LEVELS`; length assertion bumped to 25.
  +6 tests.

- **Syndicate** (commit "a new secure objective kind — hold the landing zone
  (mission 7)"). The campaign's first new objective mould since launch, wired
  into a mission-7 finale. It reuses the extraction tile as the hold zone (no
  new prop), rings it with guards via the same `spreadTargets` lair-ring the
  assassinate branch uses (the guards land ~3 tiles off the LZ — proven), and
  threads win state through an **optional** `holdProgress` arg on
  `missionStatus` (default 0, so every existing 4-arg call and test stayed
  valid) plus a `secure` case. `game.ts` banks the seconds a living agent stands
  on the LZ, shows a Hold-the-LZ HUD readout, and reuses the persuade
  extraction-pad marker (lit green while held) — the one small render touch, a
  functional objective marker rather than new art; no new unit kind and no new
  sim AI. Mission 7 "Hold the Line" (20-s hold, deepest guard ring, top-tier
  hostiles, reward 6000 > mission 6) + name/brief + objective label × 3 locales.
  Tests: the seven-mission roster now spans all four objective moulds,
  per-objective winnability gained a `secure` branch (ongoing below the hold,
  won at it), the spawn test now checks guard counts, and a focused test proves
  the guards ring the LZ and a squad wipe still loses. +1 test. The boot smoke
  confirmed the mission counter reads **1/7** and the objective HUD updates with
  no game JS errors (the only console noise was the offline preview failing to
  fetch the external analytics script).

**This closes the ranked plan.** Rounds 1–5 of the 2026-07-21 audit are all
shipped. Further arcade work needs a **fresh audit** of the nine cabinets; its
obvious first candidate is the item deferred here — **Pixel Park's attraction
catalogue** (new ride/stall types with drawn iso art to the PR #176 bar, a
screenshotted mini-art-pass). The tenth-cabinet candidates queue stays parked.

*Follow-up (2026-07-22): the owner has set the next direction directly — see
`2026-07-22-arcade-round-6-brief.md` (Syndicate Wars-style look + more
missions, Critter Rescue curve resequencing, Line Hold tower art + a real
difficulty ramp, and a focus-the-floor decision). That brief supersedes the
generic fresh-audit call above as the entry point for Round 6.*
