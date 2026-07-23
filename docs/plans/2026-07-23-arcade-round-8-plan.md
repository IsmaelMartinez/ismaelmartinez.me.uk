# Arcade Round 8 — Plan

Date: 2026-07-23
Status: **Gates decided 2026-07-23 — executing.** Owner sign-off, one pass,
all three recommendations taken: G1's escort lands as mission 10 with the asset
shootable only once collected, G2 builds the 120-second countdown (no engine
change), and G3 ships the five-arena ladder every 8 apples with the closing-in
pending rule. Round 7 (PR #195) is merged. This round
follows the owner's standing direction: deepen the shipped cabinets, tenth-
cabinet queue parked. It is seeded with the two candidates Round 7 listed and
declined (Syndicate's escort mould, a second way to play Cascade) plus one
back-catalogue deepening the fresh audit says has earned it. The repo bar
applies to every commit: `npm run lint && npm run typecheck && npm run build
&& npm test && npm run check-links`, plus screenshot before/after pairs for
draw changes, headless proofs for balance and content claims, i18n keys across
all three locales, and execution notes at the foot of this doc. Round 6's
process note stands: commit before measuring across revisions.

Baseline at branch point (`68fe503`): 559 tests, 20 files.

## Fresh audit (the eight cabinets, post-Round 7)

| Cabinet | State after Round 7 | Gap found | Round 8 call |
|---|---|---|---|
| Syndicate | 9 missions, 4 objective moulds, 2× Wars-scale units, dark-but-lit city | still 4 moulds; the escort mould is the one depth step the campaign has never taken | **G1** |
| Line Hold | 18 waves + endless, no-perfect-runs contract, arcane batteries, contrast-matched marchers | none pressing; art and balance both current | rest |
| Critter Rescue | 25 levels in four acts, pinned arc | none, deepened in Rounds 5 and 6 | rest |
| Pixel Park | 8 attractions, coaster editor, zones, mayhem, objectives; thrill hole closed | none pressing; the catalogue round just landed | rest |
| Cascade | cascade-chain marathon, pure `run.ts`, flat art strong | one mode only, and a run has no ending other than topping out | **G2** |
| Microcity | objectives, disasters, congestion, budget, 3 zones × 4 levels with hashed variety | structurally the deepest back-catalogue cabinet | rest |
| Tank Duel | tiers, ramp, wind, destructible terrain with collapse and tank falls, 3 weapons | arsenal is narrow but the cabinet is structurally complete | rest |
| Snake | one 20×20 empty board for the whole run, linear ramp, one bonus type | **nothing new ever happens after roughly two minutes**: `stepInterval` floors at 0.07 s by the 23rd apple and the board never changes | **G3** |

Four code-level facts sharpen the ranking beyond "what feels thin", and each
changes what a goal costs:

**The escort mould is cheaper than Round 5 feared, but has exactly one
load-bearing change.** `follow(world, unit, agents)` in `sim.ts` is already a
generic follow-the-nearest-agent routine (persuaded followers use it), so a
VIP reuses it wholesale rather than needing new AI. The genuinely new surface
is *vulnerability*: hostiles pick prey from `armedPlayers`, which filters
`faction === 'player' && u.weapon`. An unarmed escortee is therefore literally
unshootable today, which would make a VIP-death lose branch dead code. The
mould stands or falls on widening that prey list, and that is the change the
proofs must pin.

**Cascade's second-mode cost lives entirely in the metric's direction, not in
the mode.** `initScoreboard` keys its table off `panel.dataset.hsGame`, so a
second board is one more `<HighScoreTable gameId="…">` and nothing else. But
every ordering primitive in `highscores.ts` is hard-coded higher-is-better
(`sort((a, b) => b.score - a.score)`, `qualifies` against the tail,
`formatScore` as a six-digit pad) and so is `createRunRecord`'s `score > best`.
A timed sprint (lower is better) needs all of that made order-aware, in engine
code shared by all eight cabinets. A fixed-time mode scored in points needs
none of it. That difference is the gate.

**Snake earns the back-catalogue slot; Tank Duel and Microcity do not.** Tank
Duel already has wind (`stepProjectile` takes it as horizontal acceleration),
destructible terrain with column collapse, gravity falls for tanks knocked off
their ledge, three weapons and a tier ramp. Microcity has objectives,
disasters, congestion, a budget and twelve grown building levels with hashed
variety. Snake has one empty board, a speed ramp that reaches its floor after
22 apples, and a single bonus type. It is the only cabinet where a good player
runs out of new things to meet.

**Snake's board is already bakeable.** It paints through
`createStaticLayer(WIDTH, HEIGHT, paintBoard)` with `rebuild()` wired to
`setupHiDpiCanvas`'s `onApply`, so arena walls cost nothing per frame: they
bake into the same layer and the layer rebuilds when the arena changes.

Cross-cutting checks came back clean: the engine channels (toast, effects,
scoreboard run-record, static layers, shared BFS) are still the only
implementations, the scoring conventions hold on all eight cabinets, and the
two-shelf floor from Round 6 needs no reordering (this round changes no
cabinet's standing).

## Ranked goals and execution order

| # | Goal | Cabinet | Kind | Gate |
|---|------|---------|------|------|
| 1 | G1 escort objective mould | Syndicate | Content + sim (headless) | **Mission placement + VIP vulnerability rule** |
| 2 | G2 a second way to play | Cascade | Mode (headless) | **Which mode shape** |
| 3 | G3 the arena ladder | Snake | Content + art (headless + screenshots) | **Ladder shape** |

Execution runs G3, G1, G2. G3 goes first because it is the most self-contained
(one pure module, one draw pass, no shared engine surface) and gets the round
moving while the gates are answered; G1 is the round's headline and the
heaviest; G2 lands last because its cost depends most on the gate answer. The
three cabinets do not share code, so screenshot baselines and test files never
interact. One commit per goal, full bar after each, single PR for the round.

---

## G1 — Syndicate: the escort mould (gate: placement + vulnerability rule)

**Intent.** A fifth objective, and the first that makes the squad protect
something instead of destroying, converting or standing on it. The campaign's
arc becomes: wipe, persuade, assassinate, hold, escort. Every prior mould
proved itself through `missionStatus` shape tests plus targeted sim tests, and
this one does the same, with one extra proof for the vulnerability change.

**The shape.** The asset spawns pinned down at a remote tile behind a guard
ring (the ring `spawnMission` already builds for the executive's lair and the
contested LZ). It is neutral and inert until an agent reaches it, exactly like
a civilian, so hostiles ignore it while it is pinned. Walking an agent inside
`PERSUADE_RADIUS` collects it: it turns `player` faction and follows the
nearest agent through the existing `follow` routine. From that moment it is a
valid target for hostile fire. The mission is won when the asset is alive and
at the extraction pad, and lost the moment it dies. Collecting the asset is
what starts the danger, which is the tension the mould is for.

**Exact changes.**

`src/games/syndicate/units.ts`
- `UnitKind` gains `'vip'`; `UNIT_HP.vip = 70`, `UNIT_SPEED.vip = 3.2` (agent
  speed, so a collected asset keeps up with an unboosted squad and visibly
  lags a boosted one).
- `createUnit`'s faction map: `vip` starts `neutral`, like a civilian.
- `persuadeRequirement('vip')` returns `Infinity` (the Persuadertron does not
  recruit the asset; collecting it is its own interaction).

`src/games/syndicate/sim.ts`
- Hostile prey selection widens from `armedPlayers` to armed player units *or*
  a collected VIP, with a comment naming why: an unarmed escortee has to be
  shootable or the lose branch can never fire. Scoped on `kind === 'vip'`, so
  no mission without a VIP changes behaviour at all.
- A collected VIP routes through the existing `follow(world, unit, agents)`
  branch. The `persuaded` speed override stays untouched; the VIP gets agent
  speed from `UNIT_SPEED`.
- New event `{ type: 'vipSecured'; x: number; y: number }` fired on collection,
  so game.ts can toast and burst without polling.

`src/games/syndicate/missions.ts`
- `Objective` gains `'escort'`.
- `spawnMission`: an `escort` spec places the VIP at `remoteTile(…, 18, …)`
  and rings it with `spec.guards` (the assassinate branch's exact shape,
  target kind swapped).
- `missionStatus` gains a sixth parameter `vipAtExtraction = false` and an
  `escort` case: lost if a VIP in the roster is dead, won when a living VIP is
  at extraction, ongoing otherwise. It never auto-wins a roster with no VIP,
  mirroring the guard `secure` got for a missing `holdSeconds`.
- Mission 10 spec: `escort`, 12 civilians, 7 guards, 6 enemies, uzi guards,
  minigun rivals, reward 9000.

`src/games/syndicate/game.ts`
- Two new strings: `objectiveReachAsset` and `objectiveEscort`, switched on
  whether the asset has been collected (the persuade branch's two-phase HUD is
  the model).
- `vipAtExtraction` computed with the same distance math `atExtraction`
  already uses, passed into `missionStatus`.
- The extraction pad's `marked` flag extends to `escort`.
- `drawUnit` gains a `vip` silhouette at the Round 6 2× scale: a slighter
  civilian frame in a pale coat with a shoulder satchel, a dark grounding
  outline and lit rim like every other kind, plus a soft status ring under the
  feet once collected so the player can find it in a crowd.
- A `vipSecured` toast and particle burst through the existing channels.

`src/i18n/translations.ts`: mission 10 name and brief, `objectiveReachAsset`,
`objectiveEscort`, and the secured toast, across en/es/cat.

**Eval criteria (all headless, in `tests/games/syndicate.test.ts`).**
1. `missionStatus` on the escort spec: ongoing with the asset alive and away
   from extraction; won with it alive and at extraction; lost with it dead;
   and lost is checked *before* the win so a dead asset standing on the pad
   cannot win.
2. An escort roster with no VIP never returns `won`, whatever the extraction
   flag says.
3. `spawnMission` rings every escort spec's VIP with that spec's guard count,
   and places the VIP at least 18 tiles from the squad spawn.
4. The existing winnability loop absorbs mission 10 through a new `escort`
   branch, and the roster test's strictly-increasing reward assertion covers
   the 9000.
5. Vulnerability, the load-bearing proof: a hostile with line of sight and an
   unarmed VIP in range does **not** fire while the VIP is neutral, and
   **does** fire once the VIP is collected. Both halves in one test.
6. Follow behaviour: a collected VIP more than 1.6 tiles from its agent gains
   a path toward it and closes the distance over a stepped run.
7. Every existing Syndicate test passes untouched, which is the proof that the
   widened prey list did not leak into the other four moulds.

**Risks.**
- *The prey widening leaking.* Mitigated by the `kind === 'vip'` scope and by
  eval 7; a VIP cannot exist outside an escort mission because only
  `spawnMission`'s escort branch creates one.
- *An asset that cannot die.* If the escort turns out to be trivially safe the
  mould is decoration. Eval 5 proves it is shootable; if a stepped
  playthrough shows hostiles never get line of sight in practice, the answer
  is a lower `UNIT_HP.vip`, not a new mechanic, and the change is recorded in
  the execution notes.
- *Signature creep.* `missionStatus` reaching six positional parameters is the
  ugliest part of this goal. It stays positional to match the four existing
  call shapes; if a seventh is ever wanted, that is the moment to move to an
  options object, not this one.

---

## G2 — Cascade: a second way to play (gate: which mode shape)

**Intent.** Cascade has one mode and a run only ends by topping out, so a
session has no natural length. A second mode gives the cabinet a short-form
way to play with its own table.

**The three shapes, with their real costs.**

| Option | What it is | Engine cost | Recommendation |
|---|---|---|---|
| **A. Countdown** | A fixed 120-second run; score is points scored when the clock runs out | **None.** Natively higher-is-better, so a second `<HighScoreTable gameId="cascade-countdown">` is the whole scoreboard change | **Recommended** |
| B. Sprint | Clear 40 lines as fast as possible; score is elapsed time | **High.** `highscores.ts` sort, `qualifies`, `insertScore` and `formatScore`, plus `createRunRecord`'s `score > best` and `stash`'s comparison, all become order-aware. Shared by all eight cabinets | Only if the owner specifically wants a race |
| C. Daily seed | The marathon rules with a date-derived seed | Low, but the date input is a determinism hazard for tests and the screenshot harness, both of which depend on seeded reproducibility | Not recommended |

**Exact changes (option A).**

`src/games/cascade/run.ts`
- `createRun(random, timeLimit = 0)`; `CascadeRun` gains `timeLimit` and
  `timeLeft`.
- `tickRun` decrements `timeLeft` at the top, before the phase branches, so
  the clock keeps running through `clearing` and `settling` (a long cascade
  must not buy free time). Reaching zero sets `phase = 'over'` and pushes
  `{ type: 'timeUp' }`. A run with `timeLimit === 0` is untouched, which is
  what keeps every existing Cascade test valid.

`src/games/cascade/game.ts`
- Mode choice on the start screen; the chosen mode selects which scoreboard
  panel the run reports to and whether the HUD shows a clock.
- `timeUp` handled alongside `topOut` in the run-end path, so banking, the
  record toast and the game-over screen are one code path.

`src/pages/[lang]/fun/cascade.astro`: mode buttons, a second
`<HighScoreTable gameId="cascade-countdown">` shown with its mode, and the new
`data-t-*` strings.

`src/i18n/translations.ts`: mode names, the clock label and the time-up
message, across en/es/cat.

**Eval criteria (headless, in `tests/games/cascade.test.ts`).**
1. A countdown run ticked past its limit ends in `over` having emitted exactly
   one `timeUp` and no `topOut`.
2. The clock runs during `clearing` and `settling`: a run driven into a
   cascade and ticked through it loses the same wall time it would have lost
   falling.
3. A countdown run that tops out before the clock ends with `topOut`, not
   `timeUp`, and emits no `timeUp` afterwards.
4. `timeLimit === 0` behaves exactly as today, proven by every existing
   Cascade test passing untouched.
5. Two tables do not collide: entries written under `cascade` and
   `cascade-countdown` are independent (a `highscores.test.ts` case).

**Risks.**
- *Mode creep into the pure module.* `run.ts` gains one number and one event,
  nothing mode-aware beyond that; the mode itself lives in `game.ts`. If a
  change wants a branch inside `run.ts` on "which mode", that is the signal
  the design went wrong.
- *A second table diluting the cabinet.* Two boards on one page is new for
  this arcade. The mitigation is that only the active mode's table is shown,
  so the page never presents two rankings at once.
- *Option B's blast radius*, if chosen: order-aware high scores touch code
  every cabinet depends on. It would ship with `highscores.test.ts` coverage
  for both directions and an explicit check that all eight existing game ids
  still sort higher-is-better.

---

## G3 — Snake: the arena ladder (gate: ladder shape)

**Intent.** Give a Snake run something to meet. The speed ramp reaches its
floor after 22 apples and then the game is static forever; the board should
start changing at roughly the point the speed stops.

**The shape.** Five arenas. Arena 1 is today's empty board, so the opening of
every run is exactly the game that exists now. Every `ARENA_EVERY` apples the
next arena's walls arrive, up to arena 5, after which the board holds. Walls
kill on contact like the edges.

The one real design problem is installing walls under a live snake. The rule:
on advance, wall cells that are currently free solidify immediately, and cells
occupied by the snake (or by an apple) go to a `pending` set and solidify the
moment they are vacated. The player sees the walls closing in over the next
few steps and is never killed by geometry that appeared underneath them. This
is eight lines of pure logic and it is also the most interesting thing about
the mechanic.

**Exact changes.**

`src/games/snake/logic.ts`
- `ARENAS: readonly (readonly number[])[]` — five hand-authored wall sets as
  flat cell indices, arena 1 empty.
- `ARENA_EVERY = 8` apples (so arena 2 lands at 8, arena 5 at 32, comfortably
  past the speed floor at 22).
- `SnakeState` gains `arena`, `walls: Set<number>` and `pendingWalls:
  Set<number>`.
- `step`: a head on a wall cell dies alongside the edge and self checks;
  pending cells that are now free move into `walls` at the end of each step;
  crossing an `ARENA_EVERY` boundary advances the arena and splits the new
  wall set into immediate and pending.
- `occupied`/`freeCell` treat walls and pending walls as taken, so no apple or
  bonus ever spawns where a wall is or is about to be.

`src/games/snake/game.ts`
- Walls bake into the existing board layer: `paintBoard` draws them, and an
  arena advance calls `boardLayer.rebuild()`. Per-frame cost does not move.
- Pending walls draw per frame as a translucent ghost of the same block, so
  the closing-in is legible.
- Wall art to the PR #176 bar: a dark grounding edge and a lit top rim off
  `shadeColor`, hashed shade jitter per cell via `hash01(i, salt)` so a run of
  wall never reads as one flat bar.
- An arena-advance toast and effects burst through the engine channels, plus
  an arena readout in the HUD.

`src/i18n/translations.ts`: the arena label and the advance toast, across
en/es/cat.

**Eval criteria (headless, in `tests/games/snake.test.ts`).**
1. Connectivity, the authoring proof: for every arena, all non-wall cells are
   mutually reachable, checked with the engine's `bfsFrom` over the flat
   20×20 grid. No arena can seal the board or strand an apple.
2. A head stepping into a wall dies.
3. A wall cell under the snake does not kill it: after an advance, the cell is
   `pending`, the snake survives crossing it, and the cell becomes solid on
   the step it is vacated.
4. Apples and bonuses never spawn on a wall or a pending wall, over a driven
   run that consumes several arenas.
5. The ladder advances at the right apple counts and stops at the last arena
   rather than running off the end.
6. Every existing Snake test passes untouched, which is the proof that arena 1
   is the game that shipped.
7. Screenshots: a `snake-arena` pair. The harness drives Snake with its own
   copy of the movement rules and a most-exits autopilot that knows nothing
   about walls, so the capture uses the Round 6 and 7 precedent: a temporary
   start-arena patch applied to a scratch copy, committed code untouched.

**Risks.**
- *An arena that strands the apple.* Eval 1 is the guard, and it runs over the
  authored data rather than a sampled run, so a bad arena cannot slip through.
- *Difficulty spike.* Five arenas arriving every 8 apples on top of a speed
  ramp could make good runs shorter, not longer. The arenas are authored
  light (a few short bars, not mazes) and the wall count per arena is recorded
  in the execution notes so a later round can retune from data.
- *The screenshot harness.* Its autopilot will die on walls if it ever reaches
  one during a normal capture. Since the harness's window is short and arena 1
  is empty, the existing `snake` captures should stay byte-identical; if they
  do not, that is a signal the ladder starts too early and `ARENA_EVERY`
  moves up.

---

## Gate procedure

One ask before G1 and G2 execute (G3 runs meanwhile under the recommended
shape, since its gate is a shaping question rather than a fork). Three
questions:

1. **G1 placement and vulnerability.** Mission 10 as a new campaign closer, or
   the escort inserted earlier in the ladder? And is the asset shootable only
   once collected (recommended, and what makes collecting it the moment the
   mission turns) or from the start?
2. **G2 mode shape.** Countdown (recommended, no engine change), sprint (a
   race, at the cost of order-aware high scores across the engine), or daily
   seed (not recommended).
3. **G3 ladder shape.** Five arenas every 8 apples with the closing-in pending
   rule (recommended), or a lighter version: three arenas every 12 apples.

No visual mocks are pre-built for this gate. As in Round 7, the candidates
differ in *what they are* rather than in competing renderings of one thing;
each has its art direction written above, and the built result gets close-up
crops in the PR. If the owner wants crops before committing, the mocks get
built first.

## Execution notes (2026-07-23)

All three goals landed, order G3, G1, G2, one commit each, full bar after each
(`lint + typecheck + build + test + check-links`; 559 → 575 tests over the
round). The owner answered all three gates in one pass and took every
recommendation. No cabinet's standing changed, so the two-shelf floor is
untouched.

- **G3 — Snake arena ladder.** Five rungs as planned, cumulative, arriving
  every 8 apples with the last at 32. The closing-in rule works as designed:
  `advanceArena` splits each rung into cells that are free (solid at once) and
  cells something is standing on (`pendingWalls`), and `settleWalls` promotes
  them as they are vacated, so a wall never lands under the snake. The claim
  runs *before* the apple respawns inside the same step, which is what keeps a
  fresh apple or bonus off a cell that is about to be wall. Tests 559 → 565:
  connectivity over every rung via the engine's `bfsFrom` (no rung strands a
  cell), death on a wall, the pending-cell sequence proved step by step, the
  ladder's rung counts and its stop at the top, and a 15-apple driven run on
  the full 44-wall board asserting nothing ever spawns on a claimed cell.
  One trap: `paintBoard` now reads `state.walls`, and `setupHiDpiCanvas`
  paints the bake during setup, so the `state` declaration had to move above
  the board layer — otherwise the built bundle throws a temporal-dead-zone
  error on load (caught by the screenshot harness, not by any test).
  `snake-play` and `snake-bonus` are byte-identical to `68fe503` (`cmp`),
  which is the proof that rung 0 is the game that shipped. The full-arena
  crop needed two scratch patches, committed code untouched: a start-arena
  seed in `createSnakeState` and one extra `snap()` in the harness, because
  the harness's autopilot knows nothing about walls and dies before either of
  its own snap conditions fires.
- **G1 — Syndicate escort mould.** Mission 10 "Safe Passage" fields the
  campaign's fifth objective and its only lose condition that is not the
  squad dying. The audit's read held up: `follow` carried the escort
  behaviour with no new AI, and the whole cost was vulnerability. Hostiles
  used to pick marks from armed player units only, so an unarmed asset was
  literally unshootable; the filter now also admits a collected VIP, scoped
  on `kind === 'vip'` so no mission without one changes at all. Two rules
  fell out of that and both earned their keep: a pinned asset stays neutral
  and is ignored (reaching it is what turns the contract dangerous), and
  adrenaline is excluded for the asset, so a boosted squad outruns the thing
  it is escorting. Tests 565 → 570: the vulnerability proof runs the same
  scenario twice and asserts a pinned asset takes no damage while a collected
  one does (this test fails outright on the old prey filter, which is what
  makes it load-bearing); collection fires `vipSecured`, does not count as a
  persuasion, and the asset then closes on a walked-away agent; an
  uncollected asset never wanders; the spawn test pins the ring and the
  18-tile distance; and the win/lose shape is proved through `missionStatus`,
  including that an agent alone on the pad does *not* win and that an
  assetless roster never auto-wins. `missionStatus` now takes six positional
  parameters, which is the ugliest part of the change and the point at which
  a seventh should become an options object. Syndicate captures are
  byte-identical to `b387b35` (`cmp`) — missions 1 to 9 are untouched — and
  the escort board was captured through a scratch mission-index patch plus a
  temporary crop snap in the harness, committed code untouched.
- **G2 — Cascade countdown mode.** The recommended shape, and the audit's
  cost read was exact: `run.ts` gained one number (`timeLimit`), one derived
  field (`timeLeft`) and one event (`timeUp`), and `highscores.ts` was not
  touched at all. The clock is decremented at the very top of `tickRun`,
  before the phase branches, so it burns through `clearing` and `settling`
  too — a long cascade is worth points, never extra seconds. `timeLimit === 0`
  is the marathon and every existing Cascade test passed untouched, which is
  the proof. One component change was needed: `HighScoreTable.astro`
  hard-coded `id="highscores"`, so it gained an optional `panelId` for the
  only cabinet that fields two tables; the game keys a `Record<Mode,
  Scoreboard>` off it and only the finished run's own board is ever shown.
  Both endings get their own server-rendered headline block toggled by
  `hidden`, rather than runtime strings, keeping the copy on the
  `useTranslations` path. Tests 570 → 575: the marathon emits no `timeUp`
  over 200 seconds of ticks; a countdown ends `over` with exactly one
  `timeUp` and nothing after it; the clock provably burns during a cascade
  (the first version of this test passed trivially because it never entered
  `clearing` — it now hard-drops onto two full rows first); a well that fills
  before the deadline reports `topOut` with time still on the clock; and the
  two table ids are proved independent in `highscores.test.ts`. Browser smoke
  confirmed both modes end to end, including the time-up overlay and that
  only the countdown table appears after a countdown run. One false alarm
  worth recording: reading `getComputedStyle` immediately after clicking a
  mode button reports the *old* background, because `.mode-btn` carries a
  0.2 s `transition: all` — the state was correct all along, the probe was
  sampling mid-transition.

Round-wide regression proof: all fourteen harness captures across the six
cabinets the script drives (Line Hold, Syndicate, Microcity, Pixel Park,
Snake, Tank Duel) are byte-identical (`cmp`) between the round's base commit
`68fe503` and its head. Every change this round is additive — a new mission
behind an untouched mission 1, a new mode behind the default one, and a new
ladder rung behind the empty board a run still opens on.
