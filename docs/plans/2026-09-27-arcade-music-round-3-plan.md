# Arcade music, round 3: from one good loop to a session's worth of music

Written 2026-09-27, the day after round 2 (`docs/plans/2026-09-26-arcade-music-round-2-plan.md`,
tracked in #382) merged in #399 and the scene engine it left open merged in #400. Round 2 fixed
the loop: every live score now clears ADR 003's round 2 gates, with passes of 31 to 72 seconds,
syncopated leads, borrowed-chord seams and at least one response to the game. This plan starts
from what round 2 did not measure, and from the one goal it did not meet.

## Where round 2 left the floor

The goal round 2 missed is its first. G1 said every rescore would be auditioned by the owner in
the jukebox before it merged, and the batch merged through #399 without that listening pass. So
nothing yet says the new scores are good, only that they clear the floors, and round 2's own plan
is explicit that the floors cannot say it.

The gap round 2 did not measure is the session. Its gates read one pass of one loop, and every
long-session cabinet still plays one tune for the whole of a session. A throwaway probe over the
shipped `music.ts` modules on 2026-09-27 gives the material each cabinet has and, against the
session length its own docstring states, roughly how many times a player hears it:

| Cabinet | Session (docstring) | Distinct music | Hearings per session (estimate) |
| --- | --- | --- | --- |
| Microcity | 40 min, music two passes in three | one 64 s tune, re-voiced by tier | about 25 |
| Cascade | 10 to 15 min | one 32-bar tune, 61 s to 39 s as it ramps, plus `rush` | about 14 |
| Line Hold | 13.5 min | one 48 s tune plus the horde | about 13 |
| Critter Rescue | 30 min over four acts | one 46 to 51 s tune per act | about 9 per act |
| Tank Duel | a few minutes a match | one 72 s bed plus Sudden Death | about 7 |
| CALCIO '90 | a tournament | four scenes, 159 s in all | about 6 |
| Snake | a minute or two | one 29 s tune | about 4 |

The estimates are arithmetic on docstrings and will be replaced by the computed figure in Phase
1; they are here to show the shape. The three cabinets players stay with longest hear the same
passage thirteen to twenty-five times a session, which is the owner's "too short" at the scale a
player lives at, even though no single loop is short any more.

Two smaller findings from the same probe. The intro that round 2 added to the engine (`form.intro`)
is used by no cabinet, so no run has a beginning. And runs end without music: Cascade and Snake
play the shared descending `gameover` effect, which is not in their key, and the rest simply stop.

## What the research adds

Round 2's research is the base and is not repeated here; ADR 003's amendment holds it. Three of
its findings carry this round. McGowan's survey put "too repetitive, or there simply isn't enough
musical material" as the top reason players mute, which names material, not loop length. Hunt's
corpus puts exact bar repetition at about 63% while song length grew across hardware generations,
so the answer to repetition is more music between repeats, not less repetition inside a tune (the
shipped leads repeat 0 to 38% of their bars, well under that). And the genre references already
show the three cheap ways a game gets more material without a longer loop. Tetris shipped three
tunes, not one (the A, B and C types). Lemmings rotated short tunes as levels were beaten, so a new
tune was a reward. Soyo Oka's SimCity brief was one motif varied "from the simple to the grandiose"
as the city grows. C418's rests are the fourth, and the only one that reduces music rather than
adding it.

One honest limit carries over unchanged. No source gives a repetition threshold in hearings or in
seconds; ADR 003 records the search. The hearings-per-session target below is therefore an
editorial anchor, taken from the corpus rather than from a psychoacoustic finding: a Tetris tune
of one to two minutes under a ten to fifteen minute game is heard about seven or eight times, and
eight is the figure used here. The ADR amendment will say so in those words.

## Goals

G1, heard, including round 2. The owner has auditioned every live cabinet's round 2 score and
recorded a verdict (keep, revise or rescore) before any Phase 2 work starts, and every round 3
change is auditioned the same way before it merges, its PR recording the approval.

G2, enough music for the session. For each live cabinet, the music a player hears in a typical
session divided by the seconds of distinct material they can reach is at most eight. Distinct
material is every section reachable through `order`, `scenes`, `danger` and `intro`, counted once,
at the tempo the profile names. The session length is declared in `MUSIC_PROFILE` and a rest
counts as silence. Asserted in `music.test.ts`, with `gatePending` for cabinets awaiting their work.

G3, progress is heard. Each long-session cabinet (Microcity, Line Hold, Cascade, Critter Rescue)
changes its material, not only its arrangement, at a milestone the game already tracks, so a new
tune is a reward for getting further. Each is covered by a test on the game module that drives it.

G4, every run has a beginning and an end. Every live cabinet opens a run with a once-only intro
and closes it on a phrase written in the score's key, in place of the shared `gameover` effect.

G5, nothing regresses. Round 2's gates keep passing on every order and scene, and the wiring
tests from round 2 stay green.

## Phase 0: listen

0.1, a session render. The jukebox renders one loop; a player hears a session. Add a render that
plays a scripted timeline, a list of timed calls (`setScene`, `setSection`, `setLayer`, `setDanger`,
`playStinger`, `setTempo`) against the same scheduler, so the owner can hear ten minutes of Line
Hold's waves or Microcity's growth without playing them. Each cabinet's `music.ts` exports one
representative timeline beside its profile. Done when every live cabinet's timeline renders
deterministically through `scripts/render-music.js` and the page stays out of the production build.

0.2, the listening pass. The owner listens to every live cabinet in the jukebox, one loop and one
session render each, against the round 13 score where one is kept (Cascade, Tank Duel, Snake), and
records one verdict and one line per cabinet in a single tracking issue. Those verdicts re-rank
Phase 2 and can add a rescore to it. This is round 2's missing G1, and nothing in Phase 2 starts
before it.

## Phase 1: measure the session

1.1, the G2 gate. `MusicProfile` gains the typical session length in minutes, and
`tests/games/music-gates.ts` gains the hearings-per-session figure, computed from the form as
G2 defines it. The figures in the table above are replaced by computed ones in this plan when it
lands, and the cabinets that fail carry `gatePending` naming the Phase 2 item that clears them.
ADR 003 gains a short amendment recording the target and that it is editorial. Done when the gate
fails on today's Microcity, Cascade and Line Hold and passes on the rest.

1.2, rests inside a scene. A scene loops without the form's rest today (#400), which is why
Microcity kept layers instead of scenes. `FormScene` gains an optional `rest` with the same meaning
as the form's, so a cabinet can move between scenes and keep C418's gaps. Done when a scene with a
rest leaves exactly that silence every N passes, a scene without one plays as it does now, and the
jukebox's session render includes it.

## Phase 2: more music where players stay longest

Ordered by the hearings table, largest first. Each item keeps its cabinet's identity from round 2
and clears G2 to G5.

2.1 Microcity, Oka literally. Each population tier plays its own variation of the one motif as a
scene with rests (needs 1.2): the village a sparse statement, the town a fuller one in a new
section order, the metropolis a grand one with the horn, so the tune grows rather than only gaining
instruments. Layers stay for the instruments within a tier. The target is eight or fewer hearings
over forty minutes, which the rests help with as much as the new material does.

2.2 Cascade, the A, B and C types. Two further tunes beside Korobeiniki, original and in the
cabinet's minor-mode character, rotated by level band so reaching a new band is heard, with the
danger variant and the level-up stinger kept per tune. Whether the player may also pick a tune (or
none) on the start screen, as Tetris allowed, is a decision for the owner below.

2.3 Line Hold, a tune per arc of waves. `waves.ts` already writes its eighteen authored waves as
three arcs of six (the teaching arc, the pressure building, the escalation), and each gets its own
build and wave material as scenes in one form (the instruments and key stay, which is what makes
scenes the right tool here, unlike Critter Rescue's acts), with the horde finale kept as the danger
variant and the endless assault after wave 18 staying on the third arc's material.

2.4 Critter Rescue, second-time variation. Each act's tune gains a varied second pass through the
existing `order` (a new verse, a re-voiced chorus), so an act of six or seven levels is not nine
hearings of one pass. No engine work.

2.5 Beginnings. A once-only intro of two to four bars for every live cabinet, the cabinet
switching on, written in the score's key and style. CALCIO '90's menu and Snake's short runs need
it shortest.

2.6 Endings. A game-over phrase and, where a run can be won or retired, a victory phrase, as
stingers in the score's key that the game plays instead of the shared `gameover` effect before the
music stops. Cascade and Snake first, since they play that effect today.

## Phase 3: the parked cabinets

Unchanged from round 2: Pixel Park and Syndicate are brought to the conventions only when one is
revived, recorded in #381, which will gain a line saying round 3's G2 and G4 apply too.

## Decisions for the owner

Three choices change the work and are the owner's rather than the plan's.

Whether Cascade offers a music select (A, B, C or off) on its start screen as well as rotating by
level. It is the most recognisable music feature in the genre, and it costs a control and a stored
preference on a cabinet whose start screen is already busy.

Whether to measure muting. McGowan's mute rate is the one direct measure of music failing, and the
arcade could count it anonymously per cabinet alongside the score submission it already makes
(ADR 002). It would be the first data the site collects beyond scores, so it is out of scope unless
the owner wants it.

Whether Tank Duel and CALCIO '90, both under the G2 target already, should get anything this round
beyond intros and endings. The plan assumes not.

## What this plan does not do

It does not add audio files or sampled sound, as ADR 003 records. It does not rescore a cabinet the
listening pass keeps. And it does not treat the hearings target as a finding: it is a floor chosen
from the corpus to stop a long-session cabinet from shipping one tune again, and the owner's ear
remains the only goal that says a score is good.

## Issues

To be filed once the owner has approved this plan, one per numbered item, under a new tracking
issue, with 0.2 blocking every Phase 2 item.
