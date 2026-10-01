# Arcade music, round 3: every cabinet sounds like its game

Written 2026-09-27, after round 2 (`docs/plans/2026-09-26-arcade-music-round-2-plan.md`, #382)
merged in #399 and its scene engine in #400. The owner has now listened. The verdict: the music is
longer and better than before, but it needs a revamp, because the seven cabinets "all sound the
same... just slightly different", and Line Hold's "jumps all over the place". The brief for this
round is to find what the music of each original game was and write something similar, close in
character but never a copy.

This plan rests on three investigations run in parallel on 2026-09-27: two on the music of the
classics the cabinets homage, and one note-level audit of why the shipped scores converge and what
the engine lacks to sound like each original platform. Sources are listed per cabinet, and anything
seen only in a search summary rather than read directly is marked second-hand.

## Why they sound the same

The audit measured all seven cabinets, CALCIO '90's scenes and Critter Rescue's four acts. The
sameness has four causes, and three of them are of our own making.

The engine offers one instrument. There are two envelopes, a pluck that decays across the whole note
and a pad that swells for at most a quarter second, with no sustain level, and one vibrato rate. So
every score chose from the same kit and landed on the same preset: a plucked triangle bass in the
same register in all ten, a detuned triangle or sawtooth pad in nine, a 25% pulse lead with 6 to 8
cents of vibrato in six. Five cabinets use the echo, and all five set it to about an eighth note.

The conventions made the harmony uniform. ADR 003's round 2 amendment made the borrowed bVI and bVII
"the house harmonic colour", and the seam gate in `tests/games/music-gates.ts` then requires every
loop to hand back through V or bVII. All sixteen passes measured put bVI or bVII on bass downbeats,
and every loop ends the same way.

The gates made the rhythm uniform. The syncopation gate is cheapest to pass with a note pushed over
the half bar, and one cell (dotted quarter, eighth, two quarters) now dominates CALCIO '90's match
and final and recurs in Cascade, Tank Duel and Line Hold. Cascade's drum groove and Line Hold's are
the same bar, and four cabinets built their danger variant the same way: faster, with an octave
eighths bass in every bar.

And the scores were copied from each other. Microcity, Tank Duel and Line Hold share the `a b a2`
skeleton and a `halves` pad helper copied with its docstring. The leads all sit between C5 and A5 on
average and top out between C6 and E6, and seven of the ten main passes run at 112 to 134 bpm.

The round 2 gates set floors on variety inside a score. Nothing measures difference between
cabinets, so nothing stopped them converging.

Line Hold's jumpiness is mostly wiring, not notes. Its lead is no leapier than the rest (a mean step
of 2.5 semitones, one leap over a fifth in 92 notes). But every wave, `waveLayer(true)` at
`src/games/towerdefense/game.ts:456` fades the lead in at once, wherever the form happens to be, so
the tune enters mid-phrase at a different bar each wave. The launch stinger fires at the same moment
with an E5 to A5 bugle in the lead's own timbre, over the lead's own call. From wave 18 the danger
switch changes tempo, section and register twice per wave cycle. And the pad re-swells every half
note, which is busy for a bed. The references below show what tower-defense music does instead.

## What the originals sounded like

Several originals had no music at all, so the reference is the version or descendant whose sound
defines the genre. The rule for all of it: arrange public-domain material freely; evoke copyrighted
music by its character (mode, tempo, timbre, form), never by its melody.

Tank Duel. Kee Games' Tank (1974) had only effects. The artillery games it plays like were nearly
silent while aiming: QBasic Gorillas (1991) has a short PC-speaker intro of stepwise quarter notes
and a fast 32nd-note victory flourish, and nothing during play; Worms (1995, Bjørn Lynne) has a
title theme and one long ambience bed per landscape. The signature is silence under the aim, a drone
per arena, and short square-wave jingles only at the edges of a round.

Snake. Blockade (1976) had beeps that ticked with the arrows and a crash; Nokia Snake (1998) had a
monophonic buzzer. The signature is one dry square voice, no harmony, no vibrato, no echo, short
ringtone-length phrases and a pulse locked to the snake's step. The Nokia tune is a registered sound
mark, so it is evoked, not quoted.

Cascade. The Tetris sound is Hirokazu Tanaka's Game Boy score (1989): three selectable tunes, Type A
Korobeiniki, Type B an original, Type C Bach's French Suite No. 3 Menuet, at about 150 bpm, on two
duty-cycle pulses, a 4-bit wavetable bass and a noise channel, in mono, with no pads. The signature
is folk-minor or Baroque material on two pulses in thirds, a bouncing wave-channel bass in octaves,
noise-channel ticks, and a speed-up tied to the stack.

Microcity. SNES SimCity (1991, Soyo Oka) has one track per city size, Village, Town, City, Capital,
Metropolis and Megalopolis, 1:19 to 2:37 each, rising in tempo, density and "mechanized" percussion
as the city grows, with a xylophone as the thread through most of them. Oka wanted music that would
not stress the player. The opening theme is transcribed in C major at 131 bpm in 3/4, with sevenths
and a borrowed minor iv. The signature is a mallet lead, bright major-seventh harmony, SPC-style
echo, and a separate track per tier.

CALCIO '90. Sega's Mega Drive World Cup Italia '90 had in-match music, three rotating themes plus
title and menu music on the YM2612 (six 4-operator FM channels, one able to play PCM drums) and the
SN76489 PSG; the Amiga line, Kick Off 2 at least, had no music in play. The anthems of the summer,
"Un'estate italiana" and "World in Motion", are copyrighted and point to a major key near 124 bpm,
dance-pop drums and a chanted hook. The signature is FM brass lead, a bright octave-bouncing FM
bass, punchy DAC drums with a loud snare, fast PSG arpeggios on held chords, and no long echo.

Critter Rescue. Lemmings' Amiga score (Brian Johnston, Tim Wright) was ProTracker modules on Paula's
four 8-bit channels, two hard left and two hard right, arranging public-domain pieces (the Can-Can
galop, Rondo alla Turca, Tchaikovsky's Reed Flutes and Little Swans, Pachelbel's Canon, London
Bridge, She'll Be Comin' Round the Mountain) in a bouncy music-hall manner with tracker drums. The
signature is hard stereo, a dry sampled-sounding texture, an arpeggiated chord channel instead of a
pad, and jaunty quotations of well-known classics.

Line Hold. Kingdom Rush (2011) pairs a sparse "Preparation" cue with a separate "Battle" cue per
region; Plants vs. Zombies (2009, Laura Shigihara) layers instruments onto a constant groove as the
waves intensify, with "marching band percussion and swing beats" and "lots of half steps". Nothing
could be sourced on Desktop Tower Defense's music. The signature is an ostinato that stays put while
the player thinks: a one- or two-bar riff in the middle register within about a sixth, over a pedal
or a two-chord vamp, with intensity coming from added layers and percussion rather than new melody,
and a distinct, suspended build cue.

## Goals

G1, heard. The owner auditions every rescore in the jukebox against its written reference brief
before it merges, and the PR records the verdict. Round 2 merged without this; round 3 does not.

G2, recognisably its game. Each cabinet's score follows its reference brief above (platform palette,
mode, tempo range, texture, form) and its docstring names the brief. Judged by G1, not by a test.

G3, unlike each other. No two cabinets share an instrument set, measured as the tuple of each voice's
wave, envelope and register band, plus echo on or off. A new test in `tests/games/music.test.ts`
fails when two cabinets' scores match. Critter Rescue's acts count as one cabinet.

G4, Line Hold's wiring fixed. The wave layer enters on a phrase boundary, the launch stinger does
not double the lead, and the late-game danger switch no longer flips twice per wave cycle. Each fix
has a regression test on the game module.

G5, round 2's floors stay where they still make sense. Loop length in seconds stays. The seam rule,
the syncopation gate and the bar-rhythm gate become per-cabinet choices in `MUSIC_PROFILE`, because
a Nokia buzzer tune or an artillery drone should not have to pass a pop-song syncopation test.

## Phase 0: fix Line Hold's wiring now

This does not wait for the rescore, because it is a bug the owner can already hear. `setLayer` gains
an option to take effect at the next section boundary (or bar line), which Line Hold's wave layer
uses; the launch stinger moves to a register and timbre the lead does not use; and the danger switch
holds for a whole wave cycle. Done when a DOM test proves the lead's first note on a wave is the
first note of a section.

## Phase 1: the instruments the references need

Each engine feature is additive: a score that uses none of it renders byte-identically, which the
jukebox's WAV render proves. Ordered by distinctiveness bought per unit of work, as the audit ranked
them.

1.1, stereo. A pan per track and a stereo render. Amiga hard panning is the cheapest authentic
signature in the arcade, and it serves the Game Boy and Mega Drive palettes too.

1.2, envelopes and filters. An ADSR with a sustain level in place of the two fixed envelopes, and a
per-voice low-pass with its own envelope. This alone breaks the one pluck shape every lead shares,
and it gives SNES softness, orchestral brass and strings, and filtered basses.

1.3, wavetables and noise. Custom single-cycle wavetables with optional 4-bit quantisation (reusing
the pulse-wave cache), and a short-period noise mode beside the white noise, with a sustained noise
voice. This is the Game Boy wave-channel bass and metallic hats, a mallet or e-piano colour for
Microcity, and the crowd CALCIO '90 had to drop.

1.4, FM and pitch envelopes. Two-operator FM with an index envelope, and a pitch envelope per note.
FM is what makes the Mega Drive sound like itself (brass, slap bass); the pitch envelope gives punchy
DAC-style kicks, timpani and pitch sweeps.

1.5, arpeggio. A fast chord-arpeggio per note, the tracker and PSG way of implying chords with one
voice, for Critter Rescue's chord channel, CALCIO '90's PSG and Snake's single buzzer.

1.6, conventions. An ADR 003 amendment that replaces the house harmony with a per-cabinet brief:
the bVI/bVII colour stays where the reference uses it (the football anthems, Oka's borrowed iv) and
goes where it does not. It records each cabinet's platform palette, moves the seam, syncopation and
bar-rhythm gates into `MUSIC_PROFILE` as per-cabinet choices, adds the G3 difference test, and lets
Line Hold's orchestral texture exceed the pitched-voice limit if its rescore needs it.

## Phase 2: rescore each cabinet to its reference

Every item starts from a written brief (in its issue) drawn from the section above, is auditioned
under G1, and removes shared helpers in favour of the cabinet's own. The session-length ideas from
the earlier draft of this plan survive where the reference supports them.

2.1 Line Hold, preparation and battle. A sparse, suspended build cue and a separate battle cue built
on a mid-register ostinato over a pedal, with percussion and a counter-riff as the layers that grow
with the wave, after Kingdom Rush and Plants vs. Zombies. The three arcs of waves that `waves.ts`
already writes (teaching, pressure, escalation) each get their own pair, as Kingdom Rush gives each
region its own.

2.2 Microcity, Oka's tiers. A mallet lead over bright seventh chords with SNES echo, and a separate
piece per population tier that rises in tempo and gains mechanical percussion as the city grows,
in place of one tune gaining layers.

2.3 Cascade, the Game Boy palette. Two pulses and a 4-bit wave bass with noise ticks, no pad and no
echo, and more than one tune in the manner of the A, B and C types, rotated by level band. Which
tunes depends on the owner's decision on Korobeiniki below; a Bach minuet is public domain either
way.

2.4 CALCIO '90, the Mega Drive palette. FM brass and bass, DAC-style drums, PSG arpeggios, the long
echo removed, and a crowd layer from sustained noise. The scene structure from #400 stays.

2.5 Critter Rescue, the Amiga palette. Hard-panned four-channel texture, a light tracker kit, an
arpeggiated chord channel in place of the pad counter-line, a dry mix, and the owner's choice of
whether one or more acts switch to the Lemmings canon (the Can-Can, Rondo alla Turca, Tchaikovsky).

2.6 Tank Duel, artillery. Near-silence while aiming: a quiet drone per arena (the five arenas each get
their own), short square-wave jingles for the round start, round won and round lost, and the melody
kept for match point only.

2.7 Snake, the buzzer. One dry square voice, no vibrato, no echo, ringtone-length phrases, and its
step-locked tempo kept. Optionally a sparse second voice; the reference argues for none.

2.8 Beginnings and endings. Once the palettes exist, each cabinet gets a short intro and a game-over
or victory phrase in its own style, in place of the shared `gameover` effect Cascade and Snake play.

## Phase 3: the parked cabinets

Unchanged: Pixel Park and Syndicate follow the same process only when revived (#381).

## Decisions for the owner

The owner approved the plan on 2026-09-27 without choosing among these, so each is settled by the
default below, recorded here so it can be reversed.

Korobeiniki. The tune is public domain, but a search summary (not read directly) reports that Tetris
Holding registered a US sound mark on an electronic Korobeiniki in video games (reg. 3517007) and
has sent takedowns to clones. Default: Cascade moves to Bach's French Suite No. 3 Menuet and original
folk-minor tunes, which keep the Game Boy sound without the tune and fit the owner's "similar, not
the same" brief.

Critter Rescue's tunes. Default: the acts move to public-domain pieces the original Lemmings used,
such as the Can-Can galop, Rondo alla Turca and Tchaikovsky, in the Amiga style.

Line Hold's size. Default: allowed. Line Hold may use up to four pitched voices plus drums if its
battle cue needs the weight.

Cascade's music select. Default: not this round; the tunes rotate by level band only.

## What this plan does not do

It does not add audio files or samples; every sound stays synthesised, which the new envelopes,
filters, wavetables and FM make far less limiting. It does not copy a copyrighted melody. And it does
not accept a score on its test results alone: the owner's ear, against the written brief, is the
gate.

## Sources

Read directly unless marked second-hand (seen only in a search summary because the page refused the
fetch).

Tank Duel: https://en.wikipedia.org/wiki/Tank_(video_game);
https://gist.github.com/paulera/2525813cc3e5314c5932e1212a1d811b (Gorillas source);
https://www.vgmpf.com/Wiki/index.php?title=Introduction_-_QBasic_Gorillas_%28DOS%29;
https://drawesome.bandcamp.com/album/worms-original-game-soundtrack. Snake:
https://en.wikipedia.org/wiki/Blockade_(video_game); https://en.wikipedia.org/wiki/Snake_(1998_video_game);
https://en.wikipedia.org/wiki/Nokia_tune. Cascade: https://en.wikipedia.org/wiki/Tetris_(Game_Boy_video_game);
https://www.vgmpf.com/Wiki/index.php?title=Tetris_%28GB%29; https://www.vgmpf.com/Wiki/index.php?title=Korobeiniki;
https://gbdev.io/pandocs/Audio.html; the sound mark, second-hand: https://uspto.report/TM/90746082 and
https://itch.io/takedowns/2073998. Microcity: https://www.vgmpf.com/Wiki/index.php/SimCity_(SNES);
https://www.timeextension.com/features/interview-super-mario-kart-and-simcity-composer-soyo-oka-on-her-most-iconic-nintendo-soundtracks;
https://www.hooktheory.com/theorytab/view/soyo-oka/simcity-snes-opening-screen-theme; https://snes.nesdev.org/wiki/S-DSP.
CALCIO '90: https://en.wikipedia.org/wiki/World_Cup_Italia_'90; https://www.sega-16.com/2012/04/world-cup-italia-90/;
https://en.wikipedia.org/wiki/Yamaha_YM2612; https://en.wikipedia.org/wiki/Un%27estate_italiana;
https://en.wikipedia.org/wiki/World_in_Motion; Kick Off 2 having no music, second-hand:
https://www.lemonamiga.com/review/kick-off-2/270. Critter Rescue: https://en.wikipedia.org/wiki/Lemmings_(video_game);
https://archive.org/details/06-tim-1; https://coldstorage.bandcamp.com/album/lemmings-the-original-amiga-game-audio;
https://en.wikipedia.org/wiki/Original_Chip_Set. Line Hold: https://archive.org/details/kingdom-rush-series-ost;
https://www.gamedeveloper.com/game-platforms/interview-the-terrifying-true-story-of-the-i-plants-vs-zombies-i-soundtrack;
https://en.wikipedia.org/wiki/Desktop_Tower_Defense.

## Issues

Tracking issue #402. Phase 0: #403. Phase 1: #404 (stereo), #405 (ADSR and filter), #406
(wavetables and noise), #407 (FM and pitch envelope), #408 (arpeggio), #409 (conventions and the
difference test). Phase 2: #410 (Line Hold), #411 (Microcity), #412 (Cascade), #413 (CALCIO '90),
#414 (Critter Rescue), #415 (Tank Duel), #416 (Snake), #417 (beginnings and endings). Phase 3: #381.
