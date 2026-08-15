# ADR 003: Arcade Music Composition

**Date:** 2026-08-15

**Status:** Accepted

## Context

The arcade has nine cabinets, and every one of them plays procedurally generated music: there is not a single audio asset in the repository. `src/games/engine/audio.ts` builds Web Audio oscillators and gain envelopes at runtime from note data held in TypeScript, so the "soundtrack" is a few hundred lines of numbers rather than a folder of files. That was a deliberate early choice and it is not in question here. What was in question is everything downstream of it: how long a loop should be, how many voices it should have, how those voices should be arranged, and what a cabinet's music is actually for.

Until 2026-08-14 those questions had never been answered on purpose. Scores were written inline in each cabinet's `game.ts`, at whatever length felt right while the game was being built, which produced loops of 8 to 24 beats. The owner listened to the result and asked for the tracks to be at least twice as long with "more feeling", which is a judgement about the output rather than a specification, so the round that followed set the lengths at 32 or 48 beats and moved every score into a `src/games/<game>/music.ts` module. That fixed the immediate complaint. It did not establish what the right answer is, or why, and it left the arcade with conventions that were asserted rather than reasoned. This decision record exists to close that gap: to write down what music for this kind of game has historically been, to measure what this arcade actually does against it, and to fix the conventions that follow.

The research behind it covered the sound hardware of the arcade and 8/16-bit console era, the compositional idioms that hardware produced, and the measured loop lengths of the shipped corpus. Where a claim below is sourced it is attributed; where it is an inference from the numbers it says so; and the things that could not be verified are listed at the end rather than quietly rounded up into confidence.

## What the Hardware Forced, and Why It Still Matters

Every idiom that reads as "chiptune" today is a workaround for a specific limit, and knowing which limit produces which idiom is what makes it possible to borrow the idiom deliberately rather than by imitation.

The binding constraint was almost always voice count. The Namco WSG in Pac-Man had three wavetable voices and, crucially, no envelope generator at all, so any attack or decay shape had to be drawn by the CPU writing volume registers on a timer. The C64's SID had three voices with real per-voice ADSR but a single filter shared across the whole chip. The NES 2A03 had two pulse channels, one triangle with no volume control whatsoever, one noise channel and a sample channel. The SN76489 in the Master System is the purest case of all: three tone channels producing fixed 50 percent square waves with no duty control, no envelope and no filter, leaving pitch and level as the entire palette.

Three consequences followed, and all three are still the right technique on a synth that has no such limits.

The first is the arpeggio standing in for a chord. Rob Hubbard's C64 player ran at the PAL frame rate and his arpeggio was a single bit in an eight-byte instrument record: play the note for one fiftieth of a second, then the note plus twelve semitones, then back. Because the rate was tied to the video frame rather than to musical tempo, chip arpeggios have a fixed shimmer regardless of the song's speed. His entire music driver was 900 to 1000 bytes.

The second is voice multiplexing rather than fixed assignment. Hubbard again: "Most of it was simply done by multiplexing the three channels. If the lead line has two beats rest, put a fill or some effect in there." Koji Kondo describes the same trick on the Famicom: "The Famicom only has three channels for sound, but using this technique, I was able to make it sound more like 5."

The third is the most useful thing found in the whole search, because it is a positive compositional rule rather than a workaround. Kondo, on writing for square waves: "with the Famicom, open voicing (ie. wider intervals between the notes in a chord) sounds much clearer." Square and sawtooth waves are harmonically dense, so close voicings turn to mud in a way they would not with sampled instruments. He frames his whole aesthetic subtractively: "I aim to achieve the maximum expression with a minimal amount of sounds. I try to evoke something in the silence, in the absence of sound. Rest notes are very important to me, and the connecting space between sounds."

Two further idioms are worth naming because this codebase has already reinvented one of them. Echo was originally written into the note data: the same melody on two pulse channels, one offset and detuned and quieter, or in tracker practice a dotted-eighth delay, which is three rows in FamiTracker. Uematsu's Final Fantasy Prelude is the canonical case, two pulse channels with one deliberately an eighth late, faking a harp out of an arpeggio. That stayed the technique until the SNES, whose S-DSP gave a hardware echo of up to 224 ms with an eight-tap FIR filter, at which point echo stopped being note data and became a send. This engine has a feedback-delay send on the music bus, so it sits on the SNES side of that line, and writing delay by hand into a melody here would be reinventing a workaround for a constraint that does not apply.

Detuned twins for thickness are the other. On the NES this was two pulses a few cents apart; on FM hardware it was a per-operator chip feature; Martin Galway's documented signature was "fast arpeggios, and chorusing/echoes". This engine exposes it directly as a per-track `detune` in cents, and every cabinet uses it.

## What the Shipped Corpus Actually Did

Loop length is the question the owner's brief was really about, and it is the one where hard numbers exist. VGMRips publishes, per track, both the total length of one pass and the length of the repeating portion, derived from logs of the original hardware, so the difference between the two is the intro.

The stage-music numbers cluster tightly and they cluster across platforms, not within them. On the MSX with the Konami SCC, Nemesis 2's stage themes run 20 to 52 seconds, most with loop equal to total, meaning no intro at all. On the NES, Mega Man 2's Robot Master stages sit at 26 to 46 seconds, with the Wily stages deliberately longer at 75 to 77 as the climax. On the Mega Drive, Sonic's zone themes are 35 to 43 seconds. In the arcade, Bubble Bobble's main theme is a 45 second loop behind a 9 second intro.

The 16-bit generation did not make loops meaningfully longer. Sonic's 39 second Green Hill loop and Mega Man 2's 39 second Metal Man loop are the same length on hardware five years and a full generation apart. What did change loop length was genre: Streets of Rage 2, where Koshiro was writing Detroit-derived techno and house, jumps to 45 to 129 seconds, because dance music needs a longer form to breathe. That is the single most useful fact in the corpus, and it is the one this ADR turns into a rule.

The spread within one game is just as instructive. Super Mario Bros runs an 86 second overworld loop, a 13 second underground theme and an 8 second castle theme. Short loops were not a platform limit, they were a deliberate match to how long the player would be standing in that room.

Underneath the assembled form sits a smaller unit. Structural analyses with bar counts put Gradius Stage 1 at 13 bars of 4/4 at 134 BPM, which is 23 seconds, and Mega Man 2's title at an 8 bar motif at 180 BPM, about 10 seconds. Karen Collins's terminology for the hierarchy, microloop inside mesoloop inside macroloop, is the standard reference for it, though the full text was paywalled and those specifics reached us second hand.

Two harmonic details recur and both are directly applicable. Gradius Stage 1 loops without a perfect cadence, which is the structural trick that stops a loop sounding like it stopped and restarted. And the harmonic colour across these pieces comes overwhelmingly from parallel-mode borrowing and modal inflection rather than from functional cadences, for the same reason: a loop must not resolve.

Finally, the reason the loops were short at all is documented and it is prosaic. Hip Tanaka: "In the era when ROM capacities were only 1K or 2K, you had to create all the tools by yourself." The entire Super Mario Bros ROM image is 40,976 bytes. Hubbard's driver was under a kilobyte. Kondo has said memory pressure is why the original SMB ending theme has no complete AABA structure. None of that applies to a TypeScript module in a static site build, which means short loops here are a choice inherited from an aesthetic, not a constraint.

## Where This Arcade Actually Sits

Measured against that corpus, after the round that was supposed to make the tracks long enough:

| Cabinet | Beats | BPM | Loop | Voices |
|---|---|---|---|---|
| Snake | 32 | 134 | 14.3 s | 2 |
| Cascade | 32 | 126 base, 240 max | 15.2 s falling to 8.0 s | 3 |
| Tank Duel | 32 | 116 | 16.6 s | 3 |
| Pixel Park | 48 | 156 | 18.5 s | 3 |
| Critter Rescue | 48 | 136 | 21.2 s | 3 |
| Line Hold | 48 | 136 | 21.2 s | 3 |
| CALCIO '90 | 48 | 132 base, 152 final | 21.8 s falling to 18.9 s | 3 |
| Microcity | 48 | 104 | 27.7 s | 3 |
| Syndicate | 48 | 88 | 32.7 s | 3 |

Only Syndicate and Microcity land inside the 25 to 50 second band the shipped corpus occupies. Everything else is below it, and three cabinets sit at roughly half. Doubling the beat counts was the right direction and it was not sufficient, because beats are not time: Pixel Park's 48 beats at 156 BPM is a shorter loop than Microcity's 48 beats at 104. Reasoning in beats while the brief was about duration is how eight cabinets were lengthened without six of them reaching the historical floor.

The sharpest case is Cascade. Its tempo ramps with the level, from 126 up to a ceiling of 240 reached at level 14, which compresses its 32 beat loop from 15.2 seconds to exactly 8.0. A player good enough to reach level 14 is by construction the player who has been listening longest, and they are the one who gets the shortest loop in the arcade. That is backwards, and it was invisible while the length was recorded in beats.

The voice counts, by contrast, are well matched and should not change. The NES Music Database, a corpus of 5,278 songs from 397 games, measures an average polyphony of 2.789 with the noise channel absent from most songs. Two to three sounding voices is what this music has always been. Nothing here needs a fourth.

## Decision

The conventions below are now fixed. The first four were established by the 2026-08-14 round and are restated here with their reasoning; the rest are new and follow from the research above.

A cabinet's score lives in `src/games/<game>/music.ts` and is exported as a `GameAudioOptions`. This is the required channel and a score inline in `game.ts` is a defect. The reason is not tidiness: the note data is larger than the game code that plays it, it is the part worth reading on its own, and, decisively, `tests/games/music.test.ts` discovers modules through `import.meta.glob` and can therefore only protect scores that adopt the channel. CALCIO '90 proved the point by staying outside it for months while carrying a real defect no test could see.

Every voice in a cabinet loops at the same number of beats. Voices advance on independent cursors, so unequal lengths do not drift and recover, they slide permanently, and the tune's downbeat lands on a different bass note every time round.

Notes are written as scientific pitch names through `p()` from `src/games/engine/pitch.ts`, never as raw Hz. Be precise about what enforces this, because the cost of a typo is high: the scores are module-level constants, so a bad name throws at import time inside the cabinet's client bundle and the visitor gets a dead page rather than one wrong note. The build does not catch it because it bundles these modules without executing them, and typecheck cannot see inside a string literal. The test suite is the only gate.

Per-note `gain` is attenuation only, clamped to 0.05 through 1. A line is shaped by ducking its weak beats, not by boosting its strong ones, so every voice's ceiling stays at the level the mix was balanced at.

**Loop length is set in seconds, not in beats, and the target is 30 seconds or longer for any cabinet whose runs last more than about a minute.** This is the one substantive change. The 25 to 50 second band is where the shipped corpus sits, and a cabinet is written to a duration and then converted to beats at its tempo, rather than the reverse. Two exemptions are deliberate and both must be justified in the module's doc comment. Snake stays short and minimal, at two voices with no pad and no echo, because that terseness is its identity and a test pins it. A cabinet whose sessions are genuinely brief may sit lower, on the same logic that gave Super Mario Bros an 8 second castle theme.

**A cabinet whose tempo ramps sizes its loop at the fastest tempo it can reach, not at its base tempo.** Cascade currently fails this and is the reason the rule exists. This does not mean lengthening every ramping score to the maximum; it means the number that gets checked against the 30 second target is the compressed one.

**A loop must not close on a perfect cadence.** End on the leading tone, an inversion, a borrowed chord or an unresolved seventh, so the seam hands back to the top instead of stopping and restarting. Harmonic colour comes from parallel-mode borrowing and modal inflection for the same reason. CALCIO '90's bass, which ends its twelfth bar on C sharp under a D major tune, is the worked example.

**Voicing stays open.** Wide intervals between simultaneous notes, following Kondo's rule, because sawtooth and square voices are harmonically dense and close voicings turn to mud. Rests are structural, not filler.

**Two to three voices per cabinet.** Three is the norm for the larger cabinets and two is a deliberate minimalism. A fourth voice needs an argument, not just a spare slot, and the historical average polyphony of 2.789 is the argument against it.

**Echo is a bus send, not note data.** The engine has a feedback delay on the music mix, so hand-writing an offset copy of a melody to fake delay is reinventing a workaround for a constraint this engine does not have.

## What Was Considered and Not Adopted

An intro that plays once before the loop begins, the macroloop structure behind Bubble Bobble's 9 seconds over 45 and Mega Man 2's Flash Man at 38 over 26, is the most attractive thing in the research that this engine cannot currently express. `createGameAudio` fixes its voices at construction and every cursor wraps to index 0, so there is no concept of a non-repeating head. It would be a genuine improvement, particularly for the cabinets with a title screen, and it is not being adopted now because it is an engine change rather than a scoring convention and it should be decided on its own merits rather than smuggled in here. It is recorded as the obvious next step.

Adaptive music by vertical layering, adding and removing voices as intensity rises, was considered and rejected for now on the same grounds. The architecture forecloses it by construction: `createGameAudio` owns its context and fixes its arrangement, so there is no API to mutate voices mid-run. Tempo is the only runtime lever, and two cabinets use it. Adding layering would be a larger change than anything the owner's brief asked for.

Raising every cabinet to four or more voices was considered and rejected. It is available, since nothing here has three-channel hardware behind it, but the corpus average of 2.789 and Kondo's subtractive framing both argue that the density is the aesthetic rather than the limitation, and the one place this arcade has already heard the difference is that adding sustained pad voices in Round 13 exposed three latent bugs in the scheduler.

## What Could Not Be Verified

There is no sourced figure anywhere for a perceived-repetition threshold in game music, in seconds or in repeat count, and the search for one was specific. The nearest real literature, Margulis's *On Repeat*, covers the mere-exposure effect but gives no loop-duration guidance. Any claim of the form "a loop becomes fatiguing after N repeats" would be editorial judgement dressed as a fact. The 30 second target above therefore rests on what the shipped corpus did, which is a defensible empirical anchor, and not on a psychoacoustic threshold, which does not appear to exist.

The full text of Collins 2007 was paywalled, so the macroloop and mesoloop specifics are second hand. No corpus statistic on major versus minor distribution in the era could be found. The claim that Aeolian and Dorian are the characteristic modes of arcade music is asserted in secondary sources with no quantitative backing and is treated here as received wisdom rather than fact.

One limit is worth stating plainly because it applies to every judgement in this document that is not a number. This ADR was researched and written by an agent that cannot hear the output. The loop lengths, voice counts, note data and structural claims are all verifiable by reading and arithmetic, and they were. Whether any of it sounds good is not, and mix density in particular, meaning whether three voices plus an echo send is too much for a given cabinet, is exactly the kind of question that should be settled by listening and not by this document.
