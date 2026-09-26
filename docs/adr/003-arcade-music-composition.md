# ADR 003: Arcade Music Composition

**Date:** 2026-08-15

**Status:** Accepted, amended 2026-09-26 (see "Amendment, 2026-09-26: round 2" at the end, which overrides the passages marked as superseded)

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

The voice counts, by contrast, are well matched and should not change. The NES Music Database, a corpus of 5,278 songs from 397 games, measures an average polyphony of 2.789 with the noise channel absent from most songs. Two to three sounding voices is what this music has always been. Nothing here needs a fourth. (Amended 2026-09-26: that figure counts pitched voices only, so a percussion track sits outside the limit.)

## What the Genre Asks For

The nine cabinets do not differ by genre in any way that matters musically. They differ along two axes that happen to correlate with genre: how long a session lasts, and how much of the player's attention the game is already spending. Where those two pull in opposite directions, attention wins.

The long, low-load end of the arcade is Microcity, and the historical answer for it is unusually well documented. Jerry Martin, who scored SimCity 3000 and The Sims after studying under the minimalist Terry Riley at Mills, describes the build-mode brief as a deliberate reduction of form rather than an increase in it: "If you put too much structure in the music, then it gets more repetitive if you listen to it over and over again." The same interview records the semi-improvisational jazz piano written with John R. Burr and Marc Russo for contemplative play, and Martin's blunt account of why any of it matters over a long session: "Just the repetition [of music in a game] is going to pound that stuff into your head." One correction to a common assumption, since it was believed in this repository until it was checked: SimCity 2000 itself was scored by Sue Kasper, Brian Conrad and Justin McCormick, and the jazz identity belongs to Martin's later entries. So the city-builder lesson is not "write jazz". It is that a forty minute session wants weak structure, low harmonic event density and no hooks, because a hook is a thing you notice, and noticing it forty times is the failure mode. Microcity's 27.7 second loop at 104 BPM is the closest cabinet to this and should keep drifting further towards it, not towards a tune.

The opposite pole is Cascade and Snake, where a run is ninety seconds and the music is not competing for attention so much as pacing it. Tetris is the reference and it is the one adaptive idea this arcade already owns. The Game Boy Type A theme is Hirokazu Tanaka's arrangement of Korobeiniki, a Russian folk song from a Nekrasov poem printed in 1861, and the reason it fits is that the folk original is itself famous for a slowly increasing tempo, which maps onto a difficulty curve without any adaptive machinery at all. Borrowing a folk tune also buys a minor mode and a melody that survives being played by two square waves. Cascade's tempo ramp is the correct instinct, and the decision above to size its loop at the ramped tempo rather than the base one is what keeps that instinct from eating itself.

Critter Rescue is the case where the arcade has diverged from its model without deciding to. Lemmings avoided rights problems by arranging classical and traditional public domain material, so its soundtrack carries "London Bridge Is Falling Down", "She'll Be Coming 'Round the Mountain", and a medley folding "Ten Green Bottles" into Chopin's Funeral March and Wagner's Bridal Chorus. The precision worth having is that the tracks are not authored per level; the game cycles through them as levels are beaten. That is a better fit for a puzzle game than per-level identity would be, because a player who restarts a level eight times keeps the same music through all eight attempts and hears something new only when they actually progress, which makes a music change a reward signal rather than a scene label. Critter Rescue plays one 21.2 second loop across all 25 levels and four acts, which is the arcade's clearest unexploited opportunity, and its four acts are the natural granularity.

Pixel Park and Syndicate sit at the two extremes of what a score is pretending to be. RollerCoaster Tycoon's fairground organ is not background music, it is the park making a noise: the Merry-Go-Round's music is band organ recordings of "The Blue Danube" and "Tales from the Vienna Woods" among others, taken in 1976 from a Voigt Model 35 at Bressingham Steam Museum, with Allister Brimble writing the fairground organ styles around them. Whether that music is spatialised to the ride's position on screen could not be confirmed from a primary source, so treat the diegetic reading as a description of intent rather than of implementation. Syndicate Wars goes the other way: Russell Shaw and Adrian Moore wrote a sparse, repetitive, ambient score of ominous synths and high wailing. What makes that read as menacing rather than merely dark is, as a judgement rather than a sourced claim, entirely structural and already permitted by the rules above: low register, slow tempo, wide open voicing, and a loop that never cadences, so the dread is the absence of resolution rather than the presence of a minor chord.

Tank Duel and CALCIO '90 are the two where the honest answer is thin. A turn-based artillery duel has long dead intervals in which nothing happens and the player is aiming, which argues for a pad-led score with structural rests in Kondo's sense rather than a melody that keeps arriving during a held breath. For football, Sensible Soccer's Mega Drive version had separate title, menu and in-game music by Matt Furniss and Richard Joseph, but no design writing on what tournament football music is for could be found, and the obvious idea, distinct music per knockout stage, is horizontal resequencing, which this engine cannot do. Nothing usable was found on tower defense music design, so Line Hold is not claimed here at all.

That engine constraint decides the general rule. Winifred Phillips separates horizontal resequencing, which stops one track and starts another, from vertical layering, where compatible stems play simultaneously and fade in and out, and is explicit that neither is correct in the abstract: "interactive music design is highly contextual. The circumstances dictate our choices." Her argument for layering is that it "can instill a sense of progression and variety without needing to fragment the composition", which is exactly what a three voice synth with a fixed arrangement would want. This engine supports neither, and tempo remains its only runtime lever. (Superseded 2026-09-26: the engine now supports both, see the amendment.) So genre here is expressed entirely in the fixed score, and the practical consequence is that a cabinet earns its identity from register, tempo, voicing density and rest, not from adaptivity. The one general claim worth making across all nine, again a judgement rather than a citation, is that cognitive load sets the ceiling on melodic activity while session length sets the floor on loop duration, and no cabinet should be scored without stating both numbers first.

## Decision

The conventions below are now fixed. The first four were established by the 2026-08-14 round and are restated here with their reasoning; the rest are new and follow from the research above.

A cabinet's score lives in `src/games/<game>/music.ts` and is exported as a `GameAudioOptions`. This is the required channel and a score inline in `game.ts` is a defect. The reason is not tidiness: the note data is larger than the game code that plays it, it is the part worth reading on its own, and, decisively, `tests/games/music.test.ts` discovers modules through `import.meta.glob` and can therefore only protect scores that adopt the channel. CALCIO '90 proved the point by staying outside it for months while carrying a real defect no test could see.

Every voice in a cabinet loops at the same number of beats. Voices advance on independent cursors, so unequal lengths do not drift and recover, they slide permanently, and the tune's downbeat lands on a different bass note every time round.

Notes are written as scientific pitch names through `p()` from `src/games/engine/pitch.ts`, never as raw Hz. Be precise about what enforces this, because the cost of a typo is high: the scores are module-level constants, so a bad name throws at import time inside the cabinet's client bundle and the visitor gets a dead page rather than one wrong note. The build does not catch it because it bundles these modules without executing them, and typecheck cannot see inside a string literal. The test suite is the only gate.

Per-note `gain` is attenuation only, clamped to 0.05 through 1. A line is shaped by ducking its weak beats, not by boosting its strong ones, so every voice's ceiling stays at the level the mix was balanced at.

**Loop length is set in seconds, not in beats, and the target is 30 seconds or longer for any cabinet whose runs last more than about a minute.** This is the one substantive change. The 25 to 50 second band is where the shipped corpus sits, and a cabinet is written to a duration and then converted to beats at its tempo, rather than the reverse. Two exemptions are deliberate and both must be justified in the module's doc comment. Snake stays short and minimal, at two voices with no pad and no echo, because that terseness is its identity and a test pins it. A cabinet whose sessions are genuinely brief may sit lower, on the same logic that gave Super Mario Bros an 8 second castle theme. (Superseded in part 2026-09-26: the floor is now set per session, 45 s long, 30 s standard, 20 s minimal, and asserted by a test.)

**A cabinet whose tempo ramps sizes its loop at the fastest tempo it can reach, not at its base tempo.** Cascade currently fails this and is the reason the rule exists. This does not mean lengthening every ramping score to the maximum; it means the number that gets checked against the 30 second target is the compressed one.

**A loop must not close on a perfect cadence.** End on the leading tone, an inversion, a borrowed chord or an unresolved seventh, so the seam hands back to the top instead of stopping and restarting. Harmonic colour comes from parallel-mode borrowing and modal inflection for the same reason. CALCIO '90's bass, which ends its twelfth bar on C sharp under a D major tune, is the worked example. (Superseded 2026-09-26: that example does not hold, since the bass's twelfth bar arrives on D before the C sharp; the rule is restated in the amendment as reaching the top through V, bVII or a half cadence.)

**Voicing stays open.** Wide intervals between simultaneous notes, following Kondo's rule, because sawtooth and square voices are harmonically dense and close voicings turn to mud. Rests are structural, not filler.

**Two to three voices per cabinet.** Three is the norm for the larger cabinets and two is a deliberate minimalism. A fourth voice needs an argument, not just a spare slot, and the historical average polyphony of 2.789 is the argument against it. (Amended 2026-09-26: the limit is on pitched voices; a percussion track may be added beyond it.)

**Echo is a bus send, not note data.** The engine has a feedback delay on the music mix, so hand-writing an offset copy of a melody to fake delay is reinventing a workaround for a constraint this engine does not have.

## What Was Considered and Not Adopted

An intro that plays once before the loop begins, the macroloop structure behind Bubble Bobble's 9 seconds over 45 and Mega Man 2's Flash Man at 38 over 26, is the most attractive thing in the research that this engine cannot currently express. `createGameAudio` fixes its voices at construction and every cursor wraps to index 0, so there is no concept of a non-repeating head. It would be a genuine improvement, particularly for the cabinets with a title screen, and it is not being adopted now because it is an engine change rather than a scoring convention and it should be decided on its own merits rather than smuggled in here. It is recorded as the obvious next step. (Superseded 2026-09-26: adopted, with named sections and rest passes, as `ScoreForm`.)

Adaptive music by vertical layering, adding and removing voices as intensity rises, was considered and rejected for now on the same grounds. The architecture forecloses it by construction: `createGameAudio` owns its context and fixes its arrangement, so there is no API to mutate voices mid-run. Tempo is the only runtime lever, and two cabinets use it. Adding layering would be a larger change than anything the owner's brief asked for. (Superseded 2026-09-26: adopted as `setLayer`, alongside `setSection`, `setDanger`, `playStinger` and `setPaused`.)

Raising every cabinet to four or more voices was considered and rejected. It is available, since nothing here has three-channel hardware behind it, but the corpus average of 2.789 and Kondo's subtractive framing both argue that the density is the aesthetic rather than the limitation, and the one place this arcade has already heard the difference is that adding sustained pad voices in Round 13 exposed three latent bugs in the scheduler. (Still rejected for pitched voices; amended 2026-09-26 to allow a percussion track beyond them.)

## What Could Not Be Verified

There is no sourced figure anywhere for a perceived-repetition threshold in game music, in seconds or in repeat count, and the search for one was specific. The nearest real literature, Margulis's *On Repeat*, covers the mere-exposure effect but gives no loop-duration guidance. Any claim of the form "a loop becomes fatiguing after N repeats" would be editorial judgement dressed as a fact. The 30 second target above therefore rests on what the shipped corpus did, which is a defensible empirical anchor, and not on a psychoacoustic threshold, which does not appear to exist.

The full text of Collins 2007 was paywalled, so the macroloop and mesoloop specifics are second hand. No corpus statistic on major versus minor distribution in the era could be found. The claim that Aeolian and Dorian are the characteristic modes of arcade music is asserted in secondary sources with no quantitative backing and is treated here as received wisdom rather than fact.

From the genre section: whether RollerCoaster Tycoon's ride music is spatialised to the ride's position on screen could not be confirmed from a primary source, so the diegetic reading is intent rather than implementation. What makes a Syndicate-style score read as menacing rather than merely dark is stated there as a structural judgement and has no citation behind it. No design writing on what tournament football music is for was found, and nothing usable at all was found on tower defense music design, which is why Line Hold is the one cabinet the genre section makes no claim about. A general search for game-audio literature tying music to cognitive load returned only pop science and unrelated EEG work; the Phillips material on layering versus resequencing was the only rigorous source that survived, so the cognitive-load claim closing that section is a judgement rather than a finding.

One limit is worth stating plainly because it applies to every judgement in this document that is not a number. This ADR was researched and written by an agent that cannot hear the output. The loop lengths, voice counts, note data and structural claims are all verifiable by reading and arithmetic, and they were. Whether any of it sounds good is not, and mix density in particular, meaning whether three voices plus an echo send is too much for a given cabinet, is exactly the kind of question that should be settled by listening and not by this document.

## Amendment, 2026-09-26: round 2

This section is added rather than folded into the text above, so the original decision stays readable as it was accepted. Where the two disagree, this section wins, and the passages it overrides carry a short note saying so. It records the research behind the second music round (`docs/plans/2026-09-26-arcade-music-round-2-plan.md`, tracked in #382), the rules that research changes, and the tests that now hold every score to them.

### The rules were never applied

The decision above was accepted on 2026-08-15 and no score was touched afterwards, so the arcade went on breaking its own conventions almost everywhere. Seven of the nine loops are under 30 seconds: Cascade reaches 8.0 s from level 14, Tank Duel is 16.6 s, Pixel Park 18.5 s, CALCIO '90 18.9 s at the final, Critter Rescue and Line Hold 21.2 s each, and Microcity 27.7 s. All nine close their loop on a V to I cadence into the tonic. That includes the CALCIO '90 bass the decision cites as its worked counter-example, whose twelfth bar sits on D for its first three beats after an A7 bar and only reaches C sharp on the fourth, and the Snake score, whose docstring names the resolution as its aim. A rule that is written down and not checked is a suggestion, which is why this amendment ends in tests rather than prose.

Length was only the visible half. The round 2 audits found that the leads were mostly broken-chord arpeggios repeating one bar rhythm for the whole loop, that no pad played a chord rather than a root, that there was no percussion because the engine had no noise source, and that the music was deaf to the game: tempo was its only runtime lever, two cabinets used it, and every other state change the games already track passed without a sound from the score.

### What round 2's research says

The fatigue literature explains the owner's verdict ("too short, not engaging enough") better than loop length does. Chmiel and Schubert's review of 57 exposure studies found 50 fit an inverted U, with repetition lowering perceived complexity, so a piece that starts simpler than the listener's optimum loses liking on every hearing. A sparse two-voice arpeggio loop is the textbook below-optimum case, which is why lengthening it without making it richer would not have worked. McGowan's player survey found three quarters of players mute game music at least sometimes, with "too repetitive, or there simply isn't enough musical material" the top reason, and Sanders and Cairns measured disliked music lowering immersion below silence. So a score the player mutes is worse than none. The gap the decision above recorded is still open: no source gives a repetition threshold in seconds or in passes.

Repetition itself is not the defect. Hunt's analysis of 21,391 game-music transcriptions puts the share of bars that exactly repeat an earlier bar at 62.8%, stable across hardware generations while songs grew longer. What separates a loop that wears from one that lasts is unvaried rhythm and too little material between repeats. Jakubowski and colleagues found memorable tunes share an arch contour with one unusual interval gesture, near a 120 bpm motor tempo, which is a usable brief for a hook.

On harmony the well-sourced idiom is borrowing from the parallel mode and weakening the close. Zucareli's analysis of Gradius Stage 1 has it loop thirteen bars through six borrowed major chords and hand back to the top on Gsus4 to G, a half cadence, and Gervais's analysis of Kondo finds bVII in the dominant slot and a deliberately weakened close. Husain, Thompson and Schellenberg found that mode moves mood and tempo moves arousal independently, so a tempo ramp should not be used to change mood and a key change should not be used to raise pace.

Adaptivity has a measured value and a measured cost. Plut and Pasquier found adaptive music raised reported tension and that players recognise and prefer it; the Sonotris study found a tempo ramp synced to game speed made Tetris measurably harder for novices, so a ramp is a difficulty lever and should be capped. The canonical mechanisms are few and cheap: NES Tetris swaps its tune for a separately written faster version near the top of the well and back on recovery; Super Mario Bros. interrupts for a warning at 100 seconds left and resumes faster; Plants vs. Zombies holds its drums back and brings them in as the waves build, and when the 2025 Replanted port shipped with drums on from the first level, players complained until a patch restored the dynamic mix; Celeste and Tetris Effect add layers at progress milestones as a reward. C418 on Minecraft's gaps: "the pause in between actually helps". Lavengood and Williams found drums conspicuously absent from music meant to signal stillness, which makes percussion the marker of motion and so the right layer to withhold and then bring in.

The genre references line up with the cabinets. Tetris's tunes run one to two minutes with authored fast variants. Soyo Oka's brief for SNES SimCity was one motif varied "from the simple to the grandiose" as the city grows, "without any feeling of an ending". Worms keeps one long bed per arena and saves its one musical change for Sudden Death. Kingdom Rush separates preparation from attack. And the small-budget JavaScript synths that solve this exact problem, ZzFXM, pl_synth and ZzFX, converge on noise, a filter, one LFO, an envelope and a delay, which is close to precisely what this engine lacked before round 2.

The round's research notes did not keep a record of which texts were opened in full, so the labels in the table are assigned by what each claim rests on rather than by a reading log. "Direct" means the claim is the source's own finding in its own publication; "second-hand" means it reaches this document through someone else's report, a wiki, a press quote or player reports, and should be re-checked before anything load-bearing is built on it. None was re-read for this amendment.

| Source | Claim used | Label |
|---|---|---|
| Chmiel and Schubert (2017), Psychology of Music, review of 57 exposure studies | inverted-U liking under repetition | direct |
| McGowan (2011), survey of 173 players | 75% mute sometimes, repetition the top reason | direct |
| Sanders and Cairns (2010), BCS HCI | disliked music lowers immersion below silence | direct |
| Hunt (2020), MuMe, 21,391 transcriptions | 62.8% of bars repeat an earlier bar | direct |
| Jakubowski et al. (2016), 3,000 respondents | memorable-tune contour and tempo | direct |
| Zucareli (2023), analysis of Gradius Stage 1 | borrowed chords, half cadence at the seam | direct |
| Gervais (2015), analysis of Kondo | bVII in the dominant slot, weakened close | direct |
| Husain, Thompson and Schellenberg (2002) | mode and tempo act independently | direct |
| Plut and Pasquier (2019), IEEE CoG | adaptive music raises tension, players prefer it | direct |
| Sonotris (2020), IEEE CoG | a synced tempo ramp makes Tetris harder | direct |
| Lavengood and Williams (2023), Music Theory Online | drums absent from music signalling stillness | direct |
| VGMPF, NES Tetris | 150 to 225 bpm danger variant | second-hand |
| Super Mario Bros. timer warning | interrupt then resume faster | second-hand |
| Plants vs. Zombies and the 2025 Replanted patch | drums withheld until waves build | second-hand |
| Celeste, Tetris Effect | layers added as progress rewards | second-hand |
| C418 interview quote | the pause between pieces helps | second-hand |
| Soyo Oka interview quote, SNES SimCity | one motif, simple to grandiose, no ending | second-hand |
| Worms, Kingdom Rush, Lemmings genre notes | one change for Sudden Death, prepare against attack, tunes rotated as levels are beaten | second-hand |
| ZzFXM, pl_synth, ZzFX | the minimal synth these tools converge on | direct |

### What changes

Layering, the intro and sections move from "considered and not adopted" to adopted. The engine that forced the refusal changed in the same round. `src/games/engine/audio.ts` now takes an optional `form` on `GameAudioOptions` (`ScoreForm`: a once-only `intro`, named `sections` in a looping `order` with first- and second-time endings as repeated names, a `rest` after every N passes, `beatsPerBar`, and an authored `danger` variant with its own order and tempo), and the running `GameAudio` answers the game through `setLayer` (a named voice fades in or out, and `Track.startsMuted` holds one back until then), `setSection` and `setDanger` (both land on the next bar line with every voice together), `playStinger` (a short phrase from `GameAudioOptions.stingers` over ducked music, the loop keeping its place) and `setPaused`. A cabinet's identity no longer has to come from the fixed score alone.

A percussion track is allowed beyond the two-to-three voice limit. The 2.789 average polyphony that limit rests on is measured with the NES noise channel absent from most songs, so it describes pitched voices and says nothing against a drum part. The limit now reads as two to three pitched voices, plus at most one percussion track written with `Note.drum`.

Drums belong to action cabinets, and even there they are a layer rather than a given. A cabinet where the player is acting against the clock earns percussion, and should bring it in at a moment that means something (a wave launching, a level milestone) rather than from the first bar, which is the Plants vs. Zombies lesson in both directions. A calm cabinet, Microcity first among them, withholds it, because by Lavengood and Williams's finding percussion is the sound of motion.

The seam rule is restated so it can be checked. A pass reaches the top through V, bVII or a half cadence, and never through V to I: the lowest pitched voice does not arrive back on the pitch class it opens with on a strong beat of the last bar. Borrowed chords from the parallel mode, bVI and bVII above all, are the house harmonic colour, after Gradius and Kondo, because they give a loop somewhere to go without resolving it.

Long-session cabinets rest. A cabinet whose sessions run to many minutes separates its passes with a `form.rest`, after C418, so a forty minute city is not forty minutes of music. The rest is excluded from the length floor below, which measures the music a player actually hears.

Cabinets pause with `setPaused`, never with `stop()` and `start()`. A pause muffles the score behind a low-pass and keeps its place; stopping and starting replays the intro and restarts the pass. Round 2's audit found both halves of the problem: CALCIO '90 calling `start()` on unpause and bringing the anthem back into a shootout that had silenced it, and Snake and Microcity leaving the music running untouched through a pause.

Stingers are music. They play only while music is playing and unmuted, and their duck is its own gain, so a stinger never lifts a mute or a stop. A player who mutes the music has muted the stingers with it; a sound that must survive a music mute is a sound effect and goes through `playSfx`.

### The gates

Each `src/games/<game>/music.ts` now exports a `MUSIC_PROFILE` (`MusicProfile` in `audio.ts`) beside its score: its `session` ('long', 'standard' or 'minimal'), the `fastestTempo` its game ramps to when it ramps at all, and an optional `gatePending` reason. The ramp ceilings moved next to the scores for the same reason `BASE_TEMPO` did: Cascade's `MAX_TEMPO` (240) and CALCIO '90's `FINAL_TEMPO` (152) are what the loop is sized against, so the game imports them from `music.ts` and the profile reads the same constant.

`tests/games/music.test.ts` holds every discovered score to four floors, defined in `tests/games/music-gates.ts` so a rescore can probe a draft against them. One pass of the loop, with any intro and rest left out and measured at `fastestTempo` or else the score's own tempo, lasts at least 45 seconds for a long session (Microcity, Critter Rescue, Line Hold, CALCIO '90), 30 for a standard one, and 20 for Snake's minimal exemption. The lead (the track named 'lead', otherwise track 0) uses at least three distinct bar rhythms in a pass, a bar's rhythm being where its notes start and stop with pitch ignored. Every eight bars of the lead hold at least one syncopation, meaning a note held through a metrically stronger position than the one it started on (an off-beat push carried over the beat, a tie over the half bar or the bar line); straight eighths and dotted figures that land back on the beat do not count. And the seam rule above, with the lowest voice chosen by mean register, drums excluded. A formless score is read in 4/4, so a waltz declares its metre through `form.beatsPerBar`.

The gates are there to fail on today's scores, and they do: every cabinet fails at least one. So every profile carries `gatePending: 'awaiting round 2 rescore (#374-#381)'`, and while that is set the test asserts the opposite, that at least one gate still fails, so a flag left behind by a rescore that cleared every gate goes red. A rescore removes its own cabinet's `gatePending`, and from then on all four gates are asserted for it. The parked cabinets are held to the standard floor rather than exempted, so a revival (#381) brings a score that meets the live floor's bar.

These are floors that stop a regression, not a judgement that a score is good. The owner's ear, through the jukebox, is still the only gate that says that, and the closing admission of the original decision, that its author could not hear the output, applies to this amendment unchanged.
