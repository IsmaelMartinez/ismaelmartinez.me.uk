# Arcade music, round 2: from loops to scores that play the game

Written 2026-09-26. The owner's verdict on the current music is that it is too short,
not engaging enough, and "not that great". This plan is the answer to that verdict. It
rests on four investigations run in parallel on the same day: two note-level audits of
all nine `music.ts` modules and the `game.ts` code that drives them, one research pass on
what makes game music hold attention (tonality, form, fatigue, adaptivity), and one on
genre references and chip-synth technique. Their findings are summarised below with
sources, and every item in the plan names the check that proves it done.

## Why round 13 did not fix it

Round 13 (#285) doubled every loop in beats, and ADR 003 then set the rule that should
have followed: loops of 30 seconds or more, measured at the fastest tempo, never closing
on a perfect cadence. None of the scores was touched after the ADR was accepted, so the
arcade today breaks its own conventions almost everywhere. Seven of the nine loops are
under 30 seconds (Cascade reaches 8.0 s from level 14, Tank Duel is 16.6 s, Pixel Park
18.5 s, CALCIO '90 18.9 s at the final, Critter Rescue and Line Hold 21.2 s, Microcity
27.7 s), and all nine close their loop on a V to I cadence into the tonic, including the
CALCIO '90 bass the ADR cites as its worked counter-example and the Snake score whose
docstring names the resolution as its aim.

Length is only the visible half. The audits found that no lead in any cabinet contains a
single syncopated onset; most leads are broken-chord arpeggios that repeat one bar rhythm
for the whole loop (Line Hold uses the same dotted cell in all twelve bars, Critter Rescue
in eleven of twelve, Pixel Park is thirteen bars of plain quarters); no pad ever plays a
chord, only a root; and there is no percussion anywhere, because the engine has no noise
source. The music is also deaf to the game. Tempo is the only runtime lever, two cabinets
use it, and every other state change the games already track (Snake's speed-up, Line
Hold's build and wave phases, Tank Duel's match point, Critter Rescue's level clock,
Microcity's disasters, CALCIO '90's goals and half-time) passes without a sound from the
score. Meanwhile sound effects play about 12 dB above the lead voice (0.6 x 0.6 against
0.8 x 0.9 x 0.12), and in Line Hold's late waves an out-of-key `hit` fires six or seven
times a second over it.

## What the research says

The fatigue literature explains the owner's reaction better than loop length does.
Chmiel and Schubert's 2017 review of 57 exposure studies (Psychology of Music) found 50 fit
an inverted U, with the mechanism that repetition lowers perceived complexity, so a piece
that starts simpler than the listener's optimum loses liking with every hearing and a
complex one gains it. A sparse two-voice arpeggio loop is the textbook below-optimum case,
which is why making it longer without making it richer would not have worked. McGowan's
2011 player survey (173 responses) found that 75% of players mute game music at least
sometimes and that the top reason given was "too repetitive, or there simply isn't enough
musical material". Sanders and Cairns (BCS HCI 2010) measured that disliked music lowered
immersion below silence while liked music raised it, so a score the player mutes is worse
than none. No source anywhere gives a repetition threshold in seconds or passes; that gap,
recorded in ADR 003, is still open.

Hunt's 2020 analysis of 21,391 game-music transcriptions (MuMe 2020) puts the share of
bars that exactly repeat an earlier bar at 62.8%, stable across hardware generations while
song length grew. Repetition is not the defect; unvaried rhythm and too little material
between repeats are. Jakubowski et al. (2016, 3,000 respondents) found memorable tunes
share a common arch contour with one unusual interval gesture, near the 120 bpm motor
tempo, which is a concrete brief for a hook.

On harmony, the well-sourced idiom is borrowing from the parallel mode and weakening the
cadence. Gradius Stage 1 loops thirteen bars through six borrowed major chords and hands
back to the top on Gsus4 to G, a half cadence (Zucareli 2023). Gervais's 2015 analysis of
Kondo finds the same pattern, a chromatic substitute such as bVII in the dominant slot and
a deliberately weakened close. Husain, Thompson and Schellenberg (2002) found mode moves
mood and tempo moves arousal independently, so a tempo ramp should never be used to
change mood and a key change should never be used to raise pace.

Adaptivity has measured value and a measured cost. Plut and Pasquier (IEEE CoG 2019)
found adaptive music raised reported tension and that players recognise and prefer it;
Sonotris (IEEE CoG 2020) found a tempo ramp synced to game speed made Tetris measurably
harder for novices, so a ramp is a difficulty lever and should be capped. The canonical
mechanisms are few and cheap. NES Tetris switches its 150 bpm tune to a separately written
225 bpm version when the stack nears the top and back on recovery (VGMPF). Super Mario
Bros. interrupts for a warning fanfare at 100 seconds left and resumes faster. Plants vs.
Zombies keeps its drum channels muted and unmutes them as the zombie waves intensify, with
a horde section for big waves; when the 2025 Replanted port shipped with drums on from the
first level, players complained until patch 1.3.0 restored the dynamic mix. Celeste and
Tetris Effect add layers at progress milestones and treat each as a reward. Minecraft's
C418: "the pause in between actually helps", which is the remedy for sessions that run
long. Lavengood and Williams (MTO 2023) found drums are conspicuously absent from music
meant to signal stillness, which makes percussion the marker of motion, the right layer to
withhold and then bring in.

The genre references line up with the cabinets. Tetris's tunes run one to two minutes
with authored fast variants, not fifteen seconds. Soyo Oka's brief for SNES SimCity was
one motif varied "from the simple to the grandiose" as the city grows, "without any
feeling of an ending". Worms keeps one long bed per arena and saves its one musical change
for Sudden Death. Lemmings rotated short public-domain arrangements as levels were beaten.
Kingdom Rush separates preparation from attack. 1990 football on home computers was mostly
crowd and silence in the match, with the tune on the title; console football used an
in-match theme with a separate final. And the small-budget JavaScript synths that solve
exactly this problem (ZzFXM, pl_synth, ZzFX) converge on the same minimal instrument: noise,
a filter, one LFO, an envelope and a delay, which is almost precisely what this engine
lacks.

Full source lists, with which were read directly and which only seen second-hand, go into
the ADR amendment in Phase 1 rather than here.

## Goals

The round succeeds when all six of these hold for every live cabinet.

G1, heard before merged. Every rescored cabinet has been auditioned by the owner through
the jukebox (Phase 0) against its previous version, and the PR records the owner's
approval. Nothing in this round is accepted on note data alone; ADR 003's closing
admission that its author could not hear the output is the reason.

G2, long enough to live with. The full cycle a player hears, excluding any once-only
intro, is at least 45 seconds for the long-session cabinets (Microcity, Line Hold, Critter
Rescue, CALCIO '90 across a run) and at least 30 seconds at the fastest reachable tempo for
the rest, with Snake's minimal exemption at 20 seconds. Asserted in `music.test.ts` in
seconds, not beats.

G3, varied inside the loop. Every lead uses at least three distinct bar rhythms and at
least one syncopated or tied onset per eight bars, and no loop closes with its lowest voice
on the pitch it opens with (the testable proxy for "no perfect cadence at the seam").
Asserted in `music.test.ts`.

G4, plays the game. Every live cabinet has at least one musical response to game state
beyond start and stop: a layer that enters, a danger switch, a stinger, or a section
change. Each is covered by a test on the game module that drives it.

G5, heard over the effects. No sound effect peaks more than 6 dB above the loudest music
voice, a repeated effect is rate-limited, and pitched effects sit in the score's key.

G6, no wiring bugs. The five audio wiring defects below are fixed with regression tests.

## Phase 0: listen first, fix what is plainly broken

0.1, the jukebox. A development-only page that plays any cabinet's score, lets the listener
switch sections, layers and danger states by hand, and renders a score to a WAV through
`OfflineAudioContext` for side-by-side comparison. It has to exist before any rescore,
because it is how G1 is met and how an engine feature is judged. Done when every score in
`src/games/*/music.ts` is playable there and the page is absent from the production build.

0.2, audio wiring bugs. Five defects found and confirmed by reading the code. Tank Duel
plays the descending `gameover` sting on every match end, including a human win
(`src/games/tanks/game.ts:454`). Syndicate does the same on campaign victory
(`src/games/syndicate/game.ts:330`). CALCIO '90's pause toggle accepts the shootout screen
and calls `audio.start()` on unpause, bringing the anthem back into a shootout that
deliberately silenced it (`src/games/football/game.ts:647-651` against `:956`). CALCIO '90's
attract mode routes demo goals through `handleMatchEvents`, so the AI's goals fire the
player-goal fanfare over silence. Snake's pause key and Microcity's speed-zero pause leave
the music running. Done when each has a regression test and a win never plays the loss
sting.

## Phase 1: the engine grows the instrument the scores need

Each engine item is additive: an existing score that uses none of it must play
identically, which the jukebox's WAV render can prove sample-for-sample.

1.1, percussion and timbre. A shared noise buffer and three drum instruments (kick as a
fast pitch-dropped triangle, snare as filtered noise over a short triangle, hat as
high-passed noise), written as a percussion track in the existing note format. NES-style
pulse duties (12.5%, 25%, 50%) as cached `PeriodicWave`s. Per-note delayed vibrato and a
slide to the next pitch. Done when a score can use each and a score that uses none renders
identically.

1.2, form. A score becomes an optional once-only intro followed by named sections played in
an authored order, with optional variant endings for the last bar of a pass, and an
optional rest of whole passes for long-session cabinets (C418's gap). Every voice in a
section still loops at the same length. Done when the equal-length and seconds invariants
check sections as well as whole scores.

1.3, adaptivity. Per-track gain ramps so a layer can enter and leave (`setLayer`), a
section jump that lands on the next bar line (`setSection`), a danger switch that swaps to
an authored fast variant rather than only scaling tempo, stingers that duck the music, play
a short phrase in key, and resume without restarting the pass, and a low-pass on the music
bus for pause and overlays instead of a hard stop. Done when each is unit-tested against
the scheduler's cursors and the stinger test proves the loop position survives.

1.4, mix. Sound effects rebalanced against the music to meet G5, a per-effect rate limit,
pitched effects retuned to the running score's key, and a short duck of the music under
significant effects. Done when a test computes every effect's peak against the loudest
voice and fails above 6 dB.

1.5, conventions. An amendment to ADR 003 that records this round's research and changes
the rules it overturns: layering and the intro move from "considered and not adopted" to
adopted; a percussion track is allowed beyond the pitched-voice limit, since the 2.789
average polyphony it rests on excludes the NES noise channel; the seam rule becomes "reach
the top through V, bVII or a half cadence, never V to I"; and the G2 and G3 checks become
tests. Done when the ADR is amended and the tests fail on today's scores, which is the
point: they are the bar the rescores clear.

## Phase 2: rescore the live floor

Ordered by how much listening each cabinet gets and how far it is from the goals. Each
rescore meets G1 to G5 and states its session length and cognitive load in its docstring,
as ADR 003 already requires.

2.1 Line Hold. The longest sessions on the floor (about 13.5 minutes, 38 passes of today's
loop) and the one with the clearest two-state structure. A build bed of drone and bass, a
wave layer of lead and march percussion entering on launch and leaving when the wave is
held, a horn stinger on launch, and a horde section for the finale, after Plants vs.
Zombies and Kingdom Rush.

2.2 Cascade. Keep Korobeiniki and its minor mode, restore its leading tone, extend it into
an A A' B form sized at the fastest tempo, and add a Tetris-style danger variant switched by
stack height and released on recovery, separate from the level ramp. Percussion enters at a
level milestone. A level-up stinger.

2.3 Critter Rescue. Four short scores, one per act, rotated as the player progresses after
Lemmings, so a new tune is a reward for getting further and a retry keeps its music (after
Celeste). A real tune in place of the arpeggio, a counter-line out of the lead's register,
and the last ten seconds of a timed level raise the stakes.

2.4 CALCIO '90. A title and team-select theme so the run's static screens are not silent,
an in-match theme with its final variant, stingers for kick-off, goal, half-time and the
final whistle, and a tension bed for the shootout in place of silence. A crowd layer from
filtered noise that swells on shots is in scope if the percussion work in 1.1 makes it
cheap, and out of scope otherwise.

2.5 Microcity. Follow Oka literally: one motif, varied from simple to grand as population
tiers are reached, slower harmonic rhythm, pads that finally play chords, no cadence
anywhere, and passes separated by rests so a forty-minute session is not forty minutes of
music. Disasters get a stinger rather than a new score.

2.6 Tank Duel. Replace the continuous march with a bed that leaves room for aiming, a
stinger for each round won or lost, and one Sudden Death change at match point, after Worms.

2.7 Snake. Stay minimal and short, as its exemption allows, but break the arpeggio template,
end off the tonic, and couple tempo to the snake's step interval with a cap, after Space
Invaders.

## Phase 3: the parked cabinets

Pixel Park and Syndicate are unrouted, and #268 and #269 already record what has to change
before either returns. Their scores are brought to the Phase 1 conventions only when one is
revived, so a revival stays a page rename plus a score that meets the same bar as the live
floor. Recorded in one issue so the work is not lost.

## What this plan does not do

It does not add audio files; every sound stays synthesised, as ADR 003 records. It does not
chase every adaptive idea in the research; each cabinet gets the one or two responses that
match what its players are doing. And it does not claim any musical judgement is settled by
arithmetic: G2, G3 and G5 are floors that stop regressions, and G1, the owner's ear, is the
only goal that says a score is good.

## Issues

Tracking issue: #TRACK.

| Item | Issue |
|---|---|
| 0.1 Jukebox and offline render | #J |
| 0.2 Audio wiring bugs | #B |
| 1.1 Percussion and timbre | #P |
| 1.2 Form: intro, sections, rests | #F |
| 1.3 Adaptivity: layers, sections, danger, stingers, pause filter | #A |
| 1.4 Mix: effects against music | #M |
| 1.5 ADR 003 amendment and test gates | #C |
| 2.1 Line Hold | #L1 |
| 2.2 Cascade | #L2 |
| 2.3 Critter Rescue | #L3 |
| 2.4 CALCIO '90 | #L4 |
| 2.5 Microcity | #L5 |
| 2.6 Tank Duel | #L6 |
| 2.7 Snake | #L7 |
| 3 Parked cabinets | #PK |
