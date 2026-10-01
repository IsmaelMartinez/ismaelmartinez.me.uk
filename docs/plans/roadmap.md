# Roadmap

The live queue of work in progress, kept so that "continue with what we were doing" is enough to
resume in a fresh session. Each entry says where the work stands, where it lives, and the next steps
in order. Finished work moves to "Done" with its merge.

## Now: arcade music round 3 (2026-10-01: auditioned and approved, #436 merged, #435 to merge)

Goal: every live cabinet sounds like the music of the classic it homages (Game Boy Tetris, SNES
SimCity, Amiga Lemmings, Mega Drive Italia '90, Gorillas and Worms, the Nokia buzzer, Kingdom
Rush), after the owner's verdict that the round 2 scores "all sound the same". Plan:
`docs/plans/2026-09-27-arcade-music-round-3-plan.md`. Tracking issue: #402, whose body lists every
item with its PR. Rules every agent follows are in the plan and in ADR 003's round 3 amendment.

### Where the work lives

All of the round is on `integration/arcade-music-round-3` (PR #435 to `main`): `round3/base` (the
engine stack #418 and #421 to #424, plus #419 and #420), the seven rescore PRs #425 to #431 merged
in locally, and #436 (`feat/audio-ending-417`, merged into it on 2026-10-01). The individual PRs
#418 to #431 stay open as the record of each piece; they close as superseded when #435 merges.

- [x] #403 to #409 engine, conventions and wiring (#418 to #424, #419, #420).
- [x] #410 to #416 the seven rescores (#425 to #431).
- [x] #417 intros and endings through the engine's new `playEnding`, with the old effect-plus-stop
  kept as the muted fallback (#436).
- [x] Owner audition (goal G1). It sent back two cabinets, both rescored on #436 from research into
  the originals: Tank Duel as a PC-speaker field march after Gorillas and Worms, with a once-only
  match intro and endings at the loop's level; Line Hold's preparation, battle and horde scenes
  after Kingdom Rush's preparation and battle pairs, all in D.
- [x] Parked cabinets (#381), done ahead of revival at the owner's request: Syndicate rescored
  after Blade Runner and Russell Shaw, Pixel Park softened into a 126 bpm band-organ waltz.
- [x] CALCIO '90 match sound, at the owner's request: a crowd bed and per-strike, save, post and
  whistle sounds on the effects channel (`src/games/football/sound.ts`); the score's crowd voice
  now rests outside its stingers.
- [ ] Merge #435 to `main` (the owner's call), then close #418 to #431 as superseded and #402.

### Next steps, in order

1. The owner merges #435 (`gh pr merge 435 --squash`).
2. Close #418 to #431 with a one-line "superseded by #435" note, and close #402 with links.
3. Move this entry to "Done".

Known follow-ups recorded by the agents: the difference test is coarse (it only catches straight
copies); Microcity is in 4/4 where SNES SimCity's theme is in 3/4 (the engine has one metre per
score); the engine's noise buffer is one second and loops; `scripts/render-music.js`'s repeat-render check
occasionally differs by one or two samples at about -90 dBFS, inaudible but worth knowing before
comparing renders byte for byte; Critter Rescue's Act II is 3 to 4 dB quieter by RMS than the other
acts; the heavy playthrough and simulation tests (Tank Duel, Line Hold, CALCIO '90's air test,
`lemmings-dom`'s clock billing) time out at 5 s when several full suites share the machine, and
pass alone (the performance.now() trap in CLAUDE.md's Testing section).

## Done

- 2026-09-27 #400 engine scenes (`setScene`), CALCIO '90 moved onto them (closes #398).
- 2026-09-26 #399 arcade music round 2 (closes #367 to #380).
