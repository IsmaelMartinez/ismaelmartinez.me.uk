# Arcade backlog: clearing the open issues

Written 2026-08-26, after the audit sweep that closed #265, #266, #271, #272, #300,
#301 and covered #260's last two cabinets. Twelve issues remain open. This plan
orders them by how determinate they are, not by how interesting they are, and
states a verifiable goal for each so "done" is a measurement rather than an opinion.

## The rule this plan follows

Every item below names the check that proves it. Where a fix changes a measured
quantity, the goal is the number. Where a fix is a decision, the item says so and
does not pretend a measurement will settle it. Nothing here is allowed to reach
green by moving a ceiling or relaxing a bound; if an item cannot be closed
honestly, it gets split and the residue is filed.

## Tier 1: determinate, no decision needed

These have one right answer that a measurement can confirm.

### 1.1 #312, `keeperPlane` withholds the desperation floor

`inFrame` reads the ball's lateral position at the keeper's plane rather than at
the goal line, so `SAVE_FLOOR` is withheld from a ball that is going in. #300
already projects the same coordinate for height, so the fix is to reuse that
projection for the lateral test.

Goal: every cell that currently reads exactly `1.0000` reads exactly `0.9800`,
which is `1 - SAVE_FLOOR`. The census is already printed by
`tests/games/football-keeper-rig.test.ts` and is currently unasserted on purpose.
Done means that census is asserted and goes red without the fix.

### 1.2 Documentation drift opened by this batch

Three stale claims in CLAUDE.md, all introduced by merged work.

- The Tank Duel section still places the turn state machine inside `game.ts`.
  `src/games/tanks/match.ts` (#311) now owns it and is a required channel in the
  same sense `music.ts` is.
- The per-cabinet test coverage description predates #310, #311 and #304.
- The keeper section should cross-reference #312 and #308 so the next reader does
  not re-derive them.

Goal: a reader following CLAUDE.md alone reaches the right file for Tank Duel's
match flow, and no sentence in it contradicts the tree. Verified by reading, not
by a test, which is why it is small and goes early.

### 1.3 Test timeout hardening

`tests/games/cascade.test.ts`'s survivability test and Snake's wall-grace test
both blew vitest's default 5000 ms under load during this batch, while passing in
about 1.5 s idle. Neither carries an explicit timeout; the football suites do.

Goal: both carry an explicit timeout in the repo's existing idiom, and a run under
artificial load no longer fails them. Pre-existing flake, not introduced by the
batch, and worth removing before the loop below adds more concurrent load.

### 1.4 Close #260

All seven live-floor cabinets now have a play-to-completion test asserting a
player-visible outcome: football, cascade, towerdefense and lemmings from the
original batch, microcity from #304, snake from #310, tanks from #311. Only the
two parked cabinets lack one and neither is routed.

Goal: #260 closed with the parked exception stated, so a future reader does not
read the gap as an oversight.

## Tier 2: determinate, but needs measurement to size

### 2.1 #309, Microcity's treasury runs away

Since #306 unstuck growth, a saturated 400-month run ends around GBP 530,000, so
money stops constraining anything past the mid game. This is `budget.ts` tuning,
not the demand model.

Goal: a competent saturated run ends with a treasury that is still a constraint,
and a badly run city still fails. Concretely, state the target band before
touching a constant, then show the before and after distribution over the same
seeds. Do not retune the milestone ladder again in the same change; #304 and #306
already moved it twice and a third move needs its own justification.

### 2.2 #273's remaining half of finding 4

The double-figure cap now reads the scanned grid, but the air-goals ceiling is
still measured against the two pinned `WING_REPS`. Promoting a scanned station
properly needs depth the 16-pair scan cannot give, at roughly 300 matches a flank.

Goal: the air-goals ceiling is measured against a station the scan chose, not a
station a human pinned, without regressing CI shard time past the #287 budget.
If that proves impossible inside the budget, say so with the numbers and close
finding 4 as won't-do rather than leaving it half-open.

Done, promoted rather than closed as won't-do. `airGoalsOverCeiling` in
`tests/games/football-wing-sweep.ts` scans all thirty stations a flank at the
one rung the ceiling binds at, then confirms the three hottest at 300 matches on
fresh seeds, and only the confirm is compared with the ceiling. The size that
matters is the scan's: the ladder scan's own 16 matches a station cannot rank an
air-goal rate at all, since the same cell reads 1.50 to 4.50 across eight blocks
of 16 against a true 3.5, and a nomination made off them misses the hottest
station on the left flank outright. At 64 it picks it first. Both flanks pass,
the hottest cell at 3.39 against 4.0, and the right flank's winner `(120, 30)`
is not one of the pinned `WING_REPS` and confirms hotter than the one that is.
Cost is +25 s a flank standalone and +7 s and +15 s on the two local shards,
which lands on the two shards that were already 120 s of CI clear of the longest
one, so the validate wall is unchanged.

## Tier 3: decided, and now determinate

The owner took all six of these on 2026-08-27, delegating the calls rather than
answering them one by one, which turns each recommendation below into the
decision. What was blocked on taste is now blocked only on measurement, so every
item states the number or the observation that closes it. The rejected option is
kept beside the chosen one, because the reason a thing was not done is the part
that gets lost first.

Two orderings are forced by the code rather than by preference. #267 raises
`BASH_PATIENCE`, which widens every basher's reach on every level, so it can move
the stranding list #280 is measured against: #267 lands first and #280 re-measures
after it. And #263 and #264 both touch Line Hold's wave loop, so they go in
sequence rather than in parallel.

### 3.1 #314, two score presentations — document, no code change

Chosen: write the rule down. Rejected: converging the other cabinets on in-canvas
HUDs (large, and it fights `HighScoreTable.astro` and the `data-t-*` convention),
and converging football on DOM (breaks the pixel contract, the option to argue
against).

Goal: a reader deciding where a new cabinet's readout goes gets an answer from
CLAUDE.md without opening either cabinet, and the answer says why football is
allowed to differ in terms of the framebuffer rather than in terms of taste.
Verified by reading. This is the only tier 3 item with no test, on purpose.

### 3.2 #308, the near-post header aim clears the ceiling — nerf the cross

Chosen: nerf the cross. Rejected: moving `AIR_GOALS_CEILING`, because the ceiling
is the thing that has been catching real defects all week and a bound that moves
whenever it binds is not a bound. The keeper is not an option at all: five models
sit inside each other's sampling noise, because a header met 20 px out arrives in
0.07 s, which is three pixels of dive.

Goal, at the pinned station `(-1, 90, 30)` and 300 matches a rung on fresh seeds:
near-aim air goals a match falls under `AIR_GOALS_CEILING` (4.0) from 4.06, and
its ladder margin against `competent` falls under `LADDER_CEILING` from +0.727.
Two guards on the nerf, so it reshapes rather than flattens: the four aims keep
their present order (near > away > centre > far), and the shipped `away` aim stays
a live threat rather than collapsing towards `far`. Then the aim axis is gated in
`stationsOutPointingAHuman` so nothing can reintroduce it silently. If gating the
full axis costs more than the #287 CI budget allows, gate the confirm stage only
and record the measured cost.

### 3.3 #280, the perfect bonus is dead on ten levels — rework the bonus

Chosen: rework the bonus. Rejected: re-authoring terrain on eight authored
levels, which risks breaking solutions that currently pass and buys nothing the
bonus rework does not.

Goal: the perfect bonus is *obtainable* on all 25 levels, measured by the
playthrough harness reporting the bonus paid per level under the shipped
solutions, where ten currently pay zero. The second half of the goal is what stops
this being achieved by making the bonus free: under a deliberately wasteful policy
the bonus must still fail to pay on at least one level, so the measurement has
both a floor and a ceiling.

### 3.4 #267, level 25 duplicates 24 and the arc is not monotone — three fixes

Chosen: differentiate 25, narrow the hint-free rule, widen the click corridor.
Rejected: folding 25 into 24, because dropping to 24 levels is a visible product
change for a problem that is an authoring slip.

Goals, one per claim:

- Levels 24 and 25 differ structurally, not only in `par` and `timeLimit`, and the
  measured sloppy-click clear rate of 25 sits below 24's by more than the noise,
  so the tier gradient `tests/games/lemmings.test.ts` pins is one the data
  contains. Today a structural compare finds them identical and the test asserts a
  gradient anyway.
- Level 6 stops being the least-signposted hard level: the hint-free rule narrows
  to levels 1-5, and 6 carries a hint in all three locales.
- No level demands a click corridor under about 12 px, measured as the minimum
  corridor across all 25, up from 6 px on level 19. `BASH_PATIENCE` (6) is the
  mechanism. Every authored solution must still clear afterwards, which is the
  check that keeps this from being a free win.

### 3.5 #264, Line Hold is fully deterministic — seeded spawn-gap jitter

Chosen: seeded per-run variation with a visible seed. Rejected: leaning into
determinism and framing the board as a puzzle solve, because the cabinet already
posts to a shared score board rather than a solve time, and a board where the
best play is a memorised tile list is the failure this ticket describes.

Goal: two runs of an identical build plan under different seeds differ in a
player-visible way; the same seed reproduces byte-identically; the seed is shown
to the player and is carried on the run. The load-bearing constraint is what the
jitter is *not* allowed to touch: wave composition and total wave HP stay a pure
function of the wave index, so a seed changes the shape of a wave's arrival and
never its difficulty, and the shared board stays comparable across seeds. The
existing playthrough test passes unchanged.

### 3.6 #263, Line Hold's waves and towers — rescope, then two halves

Rescoped first, because two of the ticket's claims did not survive re-measurement:
blast is not a trap (removing it costs 10 lives) and the bolt-outscores-the-mix
claim died with #275. What holds exactly is the wave-consequence finding and the
warlords-only finding.

Split into two PRs, determinate half first.

- **Readability.** Nothing in the UI shows range, DPS or splash, so the frost
  choice is uninformed. Goal: each tower control surfaces its damage, rate, range
  and splash, derived from the `TOWERS` table rather than restated in markup, with
  a test that the rendered strings follow the data, so a later balance change
  cannot leave the UI lying. Range is shown on the field at placement time.
- **Stakes.** Goal: on a competent build across the full campaign, at least two
  non-warlord kinds leak, against today's instrumented
  `{scout: 0, sprinter: 0, brute: 0, warlord: 2}`, while the reference plan still
  survives all 18 waves. Raise non-warlord threat rather than adding warlords, per
  the ticket's own suggested direction.

## Tier 3 outcomes, 2026-08-27

All six were worked. Five landed as code; one is recorded rather than fixed, and
one of the five turned out to be two-thirds stale before any code was written.
The pattern worth keeping from the round is that three of the six moved because
a measurement contradicted the ticket, not because the ticket was wrong to file.

- **#314** — PR #320. CLAUDE.md now states the rule and why CALCIO '90 is the one
  framebuffer exception. No code, as decided.
- **#267** — PR #321. Level 25 was 24 with a kinder clock; it now gives the right
  crowd a second wall behind the ramp, one fewer builder and a tighter clock, and
  24's two assignments no longer clear it. Level 6 gains a hint. **Claim 3 was
  already fixed**: `BASH_PATIENCE` is 12, not the 6 the ticket measured, since
  PR #302 — which also removed the ordering constraint against #280.
- **#280** — PR #322. The perfect bonus now asks that the *level* killed nobody
  rather than that everyone came home, so it is obtainable on all 25 rather than
  15. Level 23 moved too: its reference solution spent a critter to the gorge and
  did not have to, since the level deals five builders for a bridge two can reach
  across. Worth knowing, because it is the obvious thing to try: the slowest
  release rate the slider offers does *not* save that critter.
- **#264** — PR #323. A run rolls a six-digit seed, shown in the HUD, and one
  stream feeds every wave's spawner; the jitter touches only the gap inside an
  entry, so the shared board stays comparable. The measurement that shaped the
  test: the seed barely moves the 18-wave campaign (5,164 or 5,284 across five
  seeds) and separates properly at 27 (7,210 to 8,398), so the test asserts a
  spread over five seeds rather than a difference between two.
- **#263** — PR #324. The readability half is fixed and guarded by a build-output
  test that recomputes every figure from `TOWERS`. The stakes half is **recorded
  rather than fixed** and filed as **#325**: the campaign holds a near-uniform 2x
  margin on every wave (deepest marcher 21-52 per cent of the route on waves 1-17,
  100 on wave 18), difficulty is a step rather than a slope because every marcher
  of a kind in a wave is identical, and standard-bearers move how hard the finale
  hits without moving which waves hurt.
- **#308** — PR #326, documentation only, and **the one item where the decision
  did not survive measurement**. "Nerf the cross" has no lever that can be spent.
  `HEADER_SPREAD` 6 to 10 clears both of #308's bounds and costs `expert` its 7.2
  win-rate floor, which had five matches in three hundred of slack against a nerf
  costing six to ten. Header aim authority is non-monotone inside the noise, cross
  delivery error moves the rate the wrong way, and `CROSS_STRIKE_R` is the human's
  volley window. What the sweeps found instead is that `ai.ts` has **no off-ball
  marking at all**, so the man arriving in the box is never tracked. #308 stays
  open and should be re-scoped to that.

### What this round would tell the next one

Three of the six tickets carried at least one claim that measurement contradicted
(#267's corridors, #263's blast and range findings, #308's whole prescribed fix).
Re-measuring before implementing cost far less than the work it saved, and it is
the reason two of these PRs are smaller than the tickets asked for.

Two mechanical notes. CI in this repo runs on PRs **targeting main**, so a stacked
PR gets no CI until its base merges and GitHub retargets it — #322 and #324 both
sat on five Vercel-only checks until then, which reads exactly like a green run.
And an assertion that compares two noisy cells can be green or red by luck: the
first version of #264's seed test compared two seeds that happen to agree, and the
first version of #267's ordering test passed under mutation for the wrong reason.

## Tier 4: no action

#268 and #269 are parked cabinets. Neither is routed, sitemapped, in `CABINETS`
or in `UNLOCK_CHAIN`. They stay open as revival blockers and are not work.

## Order

Tier 1 first, smallest first, because each one shortens the feedback loop for
everything after it. Then tier 2. Tier 3 waits on answers and is not started
speculatively. One PR per item, each merged only on a green CI whose head SHA
matches the PR head, which is the specific mistake this batch already made once.

## What gets filed rather than fixed

Anything found along the way that is not the item in hand becomes an issue with
its measurement attached, in the shape #308 and #312 already use. That habit is
what turned three vague audit claims into checkable tickets this week, and it is
cheaper than widening a PR.
