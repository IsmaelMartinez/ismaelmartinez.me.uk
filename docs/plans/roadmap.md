# Roadmap

The live queue of work in progress, kept so that "continue with what we were doing" is enough to
resume in a fresh session. Each entry says where the work stands, where it lives, and the next steps
in order. Finished work moves to "Done" with its merge.

## Now: arcade music round 3 (2026-09-30: everything built, awaiting the owner's audition)

Goal: every live cabinet sounds like the music of the classic it homages (Game Boy Tetris, SNES
SimCity, Amiga Lemmings, Mega Drive Italia '90, artillery near-silence, the Nokia buzzer, Kingdom
Rush), after the owner's verdict that the round 2 scores "all sound the same". Plan:
`docs/plans/2026-09-27-arcade-music-round-3-plan.md`. Tracking issue: #402, whose body lists every
item with its PR. Rules every agent follows are in the plan and in ADR 003's round 3 amendment.

### Where the work lives

Nothing is merged to `main`. All of the round's work is on one audition branch,
`integration/arcade-music-round-3` (draft PR #435 to `main`, green), which is `round3/base` (the
engine stack #418 and #421 to #424, plus #419 and #420) with the seven rescore PRs #425 to #431
merged in locally. #417 sits on top of it as PR #436 (`feat/audio-ending-417`, base
`integration/arcade-music-round-3`): the engine's new `playEnding` plus an intro and ending phrases
for all seven cabinets, full suite green locally (1518 tests). The individual PRs #418 to #431 stay
open as the record of each piece; they close when #435 merges.

- [x] #403 to #409 engine, conventions and wiring (#418 to #424, #419, #420), in #435.
- [x] #410 to #416 the seven rescores (#425 to #431), in #435. Snake's PR also fixed stinger
  overlap in the engine (c883005a), which every cabinet's stingers now follow.
- [x] #417 intros and endings, PR #436 into #435. Endings go through `playEnding`, with the old
  effect-plus-stop kept as the muted fallback.
- [ ] Owner audition of every cabinet (goal G1).
- [ ] Merge #436 into #435, then #435 to `main` (closes #402 to #417).
- [ ] #401 this plan, the agent brief and this roadmap: merge first, so a fresh session finds them
  on `main`.

### Next steps, in order

1. The owner merges #401 (`gh pr ready 401`, then `gh pr merge 401 --squash --delete-branch`).
2. The owner auditions each cabinet on #436's branch in the jukebox (`npm run dev`, then
   `/en/dev/jukebox`, with the Scene, Danger and voice controls; `scripts/render-music.js` writes
   WAVs), and plays each cabinet to its ending once to hear the intro and ending phrases in place.
   Things to listen for, recorded by the agents: Critter Rescue's Act II is 3 to 4 dB quieter by
   RMS than the other acts; Tank Duel's match endings sit about 16 dB under the match-point bed
   they cut; Critter Rescue's failed quota now ends the music, so a retry restarts from the act's
   intro rather than carrying on (a reversal of a #414 behaviour, the owner's call).
3. Fix whatever the audition turns up on #436's branch (or a rescore's section of #435).
4. Merge #436 into `integration/arcade-music-round-3` first (a leaf, so `--delete-branch` is safe),
   then #435 to `main`. Both merges are the owner's call, per PR.

Known follow-ups recorded by the agents: the difference test is coarse (it only catches straight
copies); Microcity is in 4/4 where SNES SimCity's theme is in 3/4 (the engine has one metre per
score); the engine's noise buffer is one second and loops; `scripts/render-music.js`'s repeat-render check
occasionally differs by one or two samples at about -90 dBFS (seen on Tank Duel's ridges and
Critter Rescue's Act III danger), inaudible but worth knowing before comparing renders byte for
byte; `lemmings-dom`'s clock-billing test and the heavy football simulations fail on timing when
several full suites share the machine, and pass alone (the performance.now() trap in CLAUDE.md's
Testing section).

## Next: parked

- #381 Pixel Park and Syndicate music, only when either cabinet is revived.

## Done

- 2026-09-27 #400 engine scenes (`setScene`), CALCIO '90 moved onto them (closes #398).
- 2026-09-26 #399 arcade music round 2 (closes #367 to #380).
