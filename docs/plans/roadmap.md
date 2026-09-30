# Roadmap

The live queue of work in progress, kept so that "continue with what we were doing" is enough to
resume in a fresh session. Each entry says where the work stands, where it lives, and the next steps
in order. Finished work moves to "Done" with its merge.

## Now: arcade music round 3 (resumed 2026-09-30, all seven rescores ready)

Goal: every live cabinet sounds like the music of the classic it homages (Game Boy Tetris, SNES
SimCity, Amiga Lemmings, Mega Drive Italia '90, artillery near-silence, the Nokia buzzer, Kingdom
Rush), after the owner's verdict that the round 2 scores "all sound the same". Plan:
`docs/plans/2026-09-27-arcade-music-round-3-plan.md`. Tracking issue: #402, whose body lists every
item with its PR. Rules every agent follows are in the plan and in ADR 003's round 3 amendment.

### Where the work lives

Nothing is merged. The engine, conventions and wiring work sits in PRs against `main`; the cabinet
rescores target the integration branch `round3/base`, which is the engine stack tip (#424) with
#419 and #420 merged in locally (commit eb4bcf72).

- [ ] #403 Line Hold wiring (lead enters on a section, stinger off the lead): PR #420, green.
- [ ] #404 to #408 engine instruments, stacked in order: #418 stereo, #421 ADSR and filter, #422
  wavetables and noise, #423 FM and pitch envelope, #424 arpeggio. All green.
- [ ] #409 per-cabinet gates, the difference test, ADR 003 round 3 amendment: PR #419, green.
- [ ] #410 Line Hold rescore: PR #427, green.
- [ ] #411 Microcity rescore (adds `FormScene.rest`): PR #428, green.
- [ ] #412 Cascade rescore (Game Boy palette, Bach menuet plus two originals): PR #425, green
  apart from a last CLAUDE.md commit (75df8ef9) whose CI was still running at the pause.
- [ ] #413 CALCIO '90 rescore: PR #426, green.
- [ ] #414 Critter Rescue rescore (Amiga palette, Lemmings public-domain canon): PR #431, ready and
  green, Copilot found nothing. Act II renders about 3 to 4 dB quieter by RMS than the other acts,
  within the mix gates; listen for it at the audition.
- [ ] #415 Tank Duel rescore (artillery beds per arena, beeper jingles): PR #430, ready and green,
  Copilot found nothing. Beds render about -43 dBFS RMS, match point -36.
- [ ] #416 Snake rescore (one dry buzzer voice): PR #429, ready and green. Copilot's finding was
  real and is fixed in c883005a: `playStinger` now gates each stinger so a new one (or `stop()`)
  cuts the previous one off. That is an engine change affecting every cabinet's stingers, and it
  must come along into the integration branch.
- [ ] #417 beginnings and endings (intro and ending phrase per cabinet): not started.
- [ ] Owner audition of every rescore (goal G1).
- [ ] One integration PR to `main`.
- [ ] #401 this plan, the agent brief and this roadmap: merge first, so a fresh session finds them
  on `main`.

### Next steps, in order

Every agent works to `docs/plans/2026-09-27-arcade-music-round-3-agent-brief.md` (process rules,
the rescore brief and the engine API), plus its cabinet's issue and section of the plan.

1. Done 2026-09-30: the three draft rescores (#429, #430, #431) are finished, ready and green.
   Before building the integration branch, merge the plan PR #401 so this roadmap is on `main`.
2. #417 beginnings and endings, once all seven rescores exist. Snake's PR already replaces its
   game-over effect with a buzzer phrase.
3. Build `integration/arcade-music-round-3` from `round3/base` with every rescore PR merged in
   locally (expect small conflicts in `tests/games/audio-mix.test.ts`'s fake context, which several
   rescores stubbed, and in the `palettePending` lines), run the full suite, and open one PR to `main`
   that closes #402 to #417.
4. The owner auditions each cabinet in the jukebox (`npm run dev`, then `/en/dev/jukebox`, with the
   Scene, Danger and voice controls; `scripts/render-music.js` writes WAVs) before that PR merges.
   Merging is the owner's call, per PR.

Known follow-ups recorded by the agents: the difference test is coarse (it only catches straight
copies); Microcity is in 4/4 where SNES SimCity's theme is in 3/4 (the engine has one metre per
score); the engine's noise buffer is one second and loops; `scripts/render-music.js`'s repeat-render check
occasionally differs by one or two samples at about -90 dBFS (seen on Tank Duel's ridges and
Critter Rescue's Act III danger), inaudible but worth knowing before comparing renders byte for
byte.

## Next: parked

- #381 Pixel Park and Syndicate music, only when either cabinet is revived.

## Done

- 2026-09-27 #400 engine scenes (`setScene`), CALCIO '90 moved onto them (closes #398).
- 2026-09-26 #399 arcade music round 2 (closes #367 to #380).
