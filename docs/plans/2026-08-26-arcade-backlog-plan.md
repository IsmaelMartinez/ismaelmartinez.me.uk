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

## Tier 3: needs an owner decision before code

These are not blocked on skill. They are blocked on taste, and guessing wastes
the work. Each names the options and a recommendation.

### 3.1 #314, two score presentations

Football draws its HUD inside the framebuffer; every other cabinet uses DOM
outside the canvas. Deliberate, because the pixel contract forbids `fillText`.
Recommendation: document the divergence, change no code.

### 3.2 #308, the near-post header aim clears the ceiling

Measured at 4.06 air goals a match against a 4.0 ceiling, and the keeper cannot
close it: five keeper models all sit inside each other's noise, because a header
met 20 px out arrives in 0.07 s, or three pixels of dive. Options are to nerf the
cross or to move `AIR_GOALS_CEILING`. Recommendation: nerf the cross, because the
ceiling is the thing that has been catching real defects all week.

### 3.3 #280, eight levels strand a critter

Re-author the terrain on eight levels, or accept stragglers and rework the perfect
bonus. Note the bonus is dead on ten levels, not eight, since 7 and 23 also pay
zero by spending a blocker. Recommendation: rework the bonus, because re-authoring
eight authored levels risks breaking solutions that currently pass.

### 3.4 #267, level 25 duplicates 24

A deep compare finds only the hint key, `par` and `timeLimit` differ, and a test
asserts a tier gradient the data does not contain. Options are to fold 25 into 24
or to differentiate it. Recommendation: differentiate, because dropping to 24
levels is a visible product change.

### 3.5 #264, Line Hold is fully deterministic

Confirmed harder than filed: `Math.random` appears once in the cabinet and only
for a shot's visual zigzag; a full 27-wave run completes with the function
poisoned. Options are to add seeded per-run variation or to accept determinism as
a property. Recommendation: add a seeded spawn-gap jitter with a visible seed,
since the endless generator is already a pure function of the wave index.

### 3.6 #263, Line Hold's waves and towers

Rescope first: the wave-consequence and warlords-only findings hold exactly, but
blast is not a trap (removing it costs 10 lives) and the bolt-outscores-the-mix
claim died with #275. The determinate half is surfacing tower damage and splash,
which nothing shows today. The taste half is raising non-warlord threat.

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
