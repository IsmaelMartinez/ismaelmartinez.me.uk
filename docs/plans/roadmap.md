# Roadmap

The live queue of work in progress, kept so that "continue with what we were doing" is enough to
resume in a fresh session. Each entry says where the work stands, where it lives, and the next steps
in order. Finished work moves to "Done" with its merge.

## Now: round 3 follow-ups (2026-10-02)

The loose ends arcade music round 3 recorded, each its own issue, independent of the others so
each can be investigated and fixed by a separate agent on its own branch and PR.

- [ ] #437 tighten the instrument-difference test beyond straight copies.
- [ ] #438 Microcity in 3/4 like SNES SimCity, or a metre per scene.
- [ ] #439 Critter Rescue's Act II sits 3 to 4 dB under the other acts.
- [ ] #440 heavy playthrough tests time out at 5 s on a busy machine.
- [ ] #441 the engine's one-second looping noise buffer and render repeat drift.

### Next steps, in order

1. One agent per issue, each in its own worktree, opening a PR that closes its issue.
2. Address review comments on each PR; every merge is the owner's call, per PR.

## Waiting on a decision

- #328 CALCIO '90's `expert` win-rate floor has less slack than its own sampling error: give it
  headroom, deepen the sample, or keep it as it is.
- #325 Line Hold's mid-campaign waves carry no consequence: decide whether that is a flaw before
  spending a balance round on it.
- #268, #269 Syndicate's and Pixel Park's gameplay rebuilds, only when either cabinet is revived.

## Done

- 2026-10-01 #435 arcade music round 3: seven rescores, intros and endings through `playEnding`,
  Syndicate and Pixel Park, and CALCIO '90's match sound (closes #381, #402 to #417).
- 2026-09-27 #400 engine scenes (`setScene`), CALCIO '90 moved onto them (closes #398).
- 2026-09-26 #399 arcade music round 2 (closes #367 to #380).
