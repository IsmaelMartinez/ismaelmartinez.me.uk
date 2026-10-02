# Roadmap

The live queue of work in progress, kept so that "continue with what we were doing" is enough to
resume in a fresh session. Each entry says where the work stands, where it lives, and the next steps
in order. Finished work moves to "Done" with its merge.

## Now: nothing in flight (2026-10-02)

Two small candidates the round 3 follow-ups turned up, not yet filed as issues:

- The jukebox renders one voice at a time only to dodge summation drift, which #445 removed for
  whole-score renders too; dropping that workaround shifts existing WAV renders by a few
  least-significant bits, so it wants its own PR.
- CLAUDE.md points at "the `performance.now()` clock trap described under Testing", but the
  Testing section never describes it; #447 found the trap's real form (a fractional start for the
  hand-driven clock in `tests/games/dom-helpers.ts`) and that belongs there.

## Waiting on a decision

- #328 CALCIO '90's `expert` win-rate floor has less slack than its own sampling error: give it
  headroom, deepen the sample, or keep it as it is.
- #325 Line Hold's mid-campaign waves carry no consequence: decide whether that is a flaw before
  spending a balance round on it.
- #268, #269 Syndicate's and Pixel Park's gameplay rebuilds, only when either cabinet is revived.

## Done

- 2026-10-02 round 3 follow-ups: #443 a near-copy-aware instrument-difference test (closes #437),
  #444 Microcity's intro and endings in 3/4 (closes #438), #446 Critter Rescue's Act II level
  (closes #439), #447 measured timeouts and two flaky tests fixed at the root (closes #440), #445
  a ten-second noise buffer and bit-identical renders (closes #441).
- 2026-10-01 #435 arcade music round 3: seven rescores, intros and endings through `playEnding`,
  Syndicate and Pixel Park, and CALCIO '90's match sound (closes #381, #402 to #417).
- 2026-09-27 #400 engine scenes (`setScene`), CALCIO '90 moved onto them (closes #398).
- 2026-09-26 #399 arcade music round 2 (closes #367 to #380).
