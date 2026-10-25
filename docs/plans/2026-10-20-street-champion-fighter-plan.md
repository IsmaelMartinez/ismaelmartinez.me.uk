# STREET CHAMPION: a one-on-one fighter after Street Fighter II

Written 2026-10-20. The owner asked for the same treatment PRIME TIME got
(`docs/plans/2026-10-16-prime-time-arena-shooter-plan.md`), this time for
Street Fighter II: find the arcade game, its instructions and its phases, and
build it to the quality it had when it appeared. This plan records what the
reference is, what the cabinet takes from it, the decisions, and the rounds.

## The reference

Capcom's Street Fighter II: The World Warrior (CPS-1, February 1991; Akira
Nishitani and Akira Yasuda). The cabinet's instruction card and the game's
attract mode teach the whole of it:

- **Controls.** An eight-way stick and six buttons: jab, strong and fierce
  punch over short, forward and roundhouse kick. Hold away from the opponent
  to block, down-away to block low. Close up, forward or back with a strong or
  fierce punch throws.
- **Special moves** by stick motion and button: quarter circles (the
  fireball, the hurricane kick), the dragon punch's forward-down-down-forward,
  charges (hold back, then forward; hold down, then up), button mashing (the
  hundred hand slap, lightning legs, electricity) and the 360 (the spinning
  pile driver). A special cancels the recovery of a normal that hits, which is
  the combo system the genre grew from.
- **A match** is best of three rounds on a 99 count; a round ends by KO or on
  time, with a draw possible. A fourth "final round" settles draws, and a tie
  after it is a draw game. Hits build an invisible dizzy meter; a full one
  leaves the fighter seeing stars.
- **The phases.** Attract mode (a demo fight), the player select over a world
  map with a timer, the plane flying the route to the next opponent's
  country, the VS screen, the fight on the opponent's home stage, the
  winner's quote, a bonus stage after the third, sixth and ninth wins (the
  car, the barrels, the oil drums), the four Grand Masters after the seven
  other world warriors, the ending, and on a loss the continue countdown with
  the beaten portrait. A second player can join for versus.
- **Scoring.** Points for every hit, a time bonus and a vitality bonus for
  every round won, a perfect bonus, and the bonus stages.
- **The sound.** A YM2151 FM score with a theme per fighter's country, which
  speeds up when a fighter is close to defeat, OKI ADPCM samples for the hits
  and the announcer ("Round one... fight!", "K.O.", "You win", "Perfect").

## What the cabinet is

**STREET CHAMPION** (`fighter`, `/fun/fighter`, 🥊, red `#ef4444`), at the
chain's 1991 slot after PRIME TIME and before Critter Rescue (Lemmings shipped
on 14 February 1991, a week after Street Fighter II's Japanese release). It is
every phase above, with original characters on the archetypes a 1991 player
would recognise, and it follows the cabinet conventions in CLAUDE.md: pure
DOM-free modules under `src/games/fighter/` (`motion.ts`, `roster.ts`,
`fight.ts`, `ai.ts`, `arcade.ts`, `poses.ts`, `figure.ts`), a framebuffer
renderer (`render.ts`, `stages.ts`, `pix.ts`), `input.ts`, `music.ts`,
`sound.ts`, `announcer.ts`, and `game.ts` wiring them to the page.

| Fighter | Home | Archetype | Specials |
|---|---|---|---|
| KENJI | Japan, castle rooftop | the karate wanderer | Spirit Wave (↓↘→P), Rising Dragon (→↓↘P), Whirlwind Kick (↓↙←K) |
| ACE | USA, harbour | his rival | the same three, a hotter dragon |
| MEI | China, market | the kicking heroine | Lightning Legs (mash K), Spinning Bird Kick (charge ↓↑K) |
| BORIS | USSR, factory | the wrestler | Siberian Suplex (→↘↓↙←P, a command grab), Iron Lariat (PPP) |
| RAJ | India, palace | the stretching yogi | Fire Orb (↓↘→P), Dragon Breath (↓↙←P), long limbs |
| TORA | Japan, bathhouse | the sumo | Hundred Slaps (mash P), Sumo Torpedo (charge ←→P) |
| RIO | Brazil, river | the jungle beast | Thunder Hide (mash P), Rolling Cannon (charge ←→P) |
| DUKE | USA, air base | the soldier | Sonic Cutter (charge ←→P), Flash Kick (charge ↓↑K) |
| ROCKO | Las Vegas | boss: the boxer, every button a punch | Dash Straight, Dash Upper |
| VARGA | Spain, the cage | boss: the masked claw | Rolling Claw, Flip Kick |
| SAKDA | Thailand, ruins | boss: the muay thai giant | Tiger Shot high and low, Tiger Uppercut |
| ZAR | the final temple | boss: the dictator | Psycho Charge, Scissor Kicks |

The bonus stages are the car after the third and ninth wins and the stacked
oil drums after the sixth; the attract mode is a CPU-against-CPU demo running
behind the start screen.

## Decisions worth recording

- **One skeleton, rasterised, instead of sprite sheets.** The arcade had a few
  thousand hand-painted cels per fighter. Here every fighter is one jointed
  figure (`poses.ts` holds the joint angles, a page per move list) dressed
  and shaded by a software rasteriser (`figure.ts`): tapered capsules and
  ellipses filled pixel by pixel, four tones per material from one key light
  with a checker dither, a dark rim where a front part crosses a back one,
  and a one-pixel outline. Canvas paths are not used for bodies because they
  anti-alias. Poses are **held keyframes**, not tweens, which is what makes it
  read as sprite animation. Portraits are a separate frontal painter on the
  same raster.
- **A 384 x 224 framebuffer at a whole scale**, the CPS-1's resolution, as
  CALCIO '90 does with the Mega Drive's: the canvas box is sized in device
  pixels by `game.ts`, so the HUD (health bars, clock, names, score) is drawn
  inside the framebuffer in the 5x7 bitmap font. That is the framebuffer
  exception CLAUDE.md allows for the score readout.
- **The CPU plays through the stick.** `ai.ts` returns a `FrameInput` per
  frame and performs its specials as motions through the same command reader
  a player uses, so nothing is granted to it that the rules refuse a player.
  Its difficulty ramps up the ladder (`levelFor`).
- **Scoring is per credit.** A lost match ends the credit and posts it to the
  board; continuing is a new credit at zero against the same opponent, so the
  board holds one credit's work and infinite continues cannot farm it. Versus
  never posts, as Tank Duel's two-player never does.
- **The calls stay English in every locale**, as the arcade's did and as the
  announcer speaks them; the select screen, the bonus tally, the quotes, the
  endings and the page are translated.
- **The announcer is one English voice** (Piper `en_US-joe-medium`, CC0, run
  through a 1991 sample-chip treatment by `scripts/fighter-announcer-voice.mts`).

## Checks

- `tests/games/fighter.test.ts`: the command reader; guarding, lows,
  overheads, chip, throws, sweeps, cancels, dizzy, time-over; every special of
  every fighter comes out and lands; the bonus stages clear and time out; a
  **whole tour played to the ending** with a CPU in the player's seat, the
  bonus stages after wins 3, 6 and 9 and the board handed the winning
  credit's score; a passive player loses; continue resets the score; the
  attract demo never scores; versus goes round; every pairing of CPU against
  CPU finishes and keeps the world warriors between 20% and 80% wins; every
  state has a pose; every on-screen word has a glyph in all three locales.
- `tests/games/fighter-announcer.test.ts`, and the music gates in
  `tests/games/music.test.ts`.

## Progress

- 2026-10-20: built. Round 1 against the harness: jump-ins sailed over a
  crouching opponent (the jump was too tall for its reach, now 7.8/0.4 and air
  kicks reaching below the feet), and the CPU-against-CPU grid was lopsided
  (Duke 86%, Boris 7%): chargers guarded for free while sitting on their
  charge, so every CPU now guards between moves at a rate set by its level,
  the grappler closes in and grabs, rushes became a long punishable recovery
  with the sumo bouncing off, and the soldier's numbers came down. Settled at
  30% to 70% for the eight and 45% to 73% for the bosses.
- 2026-10-21, round 2 (the art, from the owner's "the graphics are pretty bad,
  you can do much much better"): the figures became swept muscle profiles
  with hands, feet, cloth folds, a profile face cut in under the hairline and
  a five-tone hue-shifted ramp with a shine and a rim light; the fourteen
  stages were repainted with dense props, 27 px spectators and textured
  floors; the sparks, projectiles, HUD, calls, screens and the bonus car and
  drums were redrawn (`effects-art.ts`, `props-art.ts`, `display.ts`, a
  display font with accents, `pixbuf.ts`). A human-speed keyboard test found
  that a stick released a beat before the button turned specials into
  normals, and that a walk forward into a fireball read as a dragon punch;
  both fixed in `motion.ts`. Fighter sprites are now cached per pose, since a
  figure costs about a millisecond to rasterise and poses are held keyframes.
- 2026-10-21, round 3 (the bodies and the movement, from the owner's "the
  movements are far too simple and the characters not realistic enough"):
  the flat swept-profile figure was replaced by a 3D body (`body.ts`): a
  posed 3D skeleton whose chest turns three quarters to the viewer and twists
  into punches, every muscle mass an ellipsoid and every bone a tapered
  capsule through a depth buffer, inner outlines drawn from depth, clothes
  as clipped shells, a face placed in the head's frame. Fighters were drawn
  10% larger. `poses.ts` was rewritten so a move is a sequence (wind-up,
  chamber, contact, follow-through, recoil, an in-between home) mapped onto
  its frame data, with an eight-frame walk that bobs and counter-turns,
  jumps that gather and reach, hit reactions that snap the head before the
  body, knockdowns, get-ups, throws, per-fighter wins, and the spins (the
  whirlwind kick, the lariat, the bird kick) as real turns of the body. On
  the owner's "the legs and arms are far too fat" the limbs came down to
  about three quarters of the flat figure's radii.
- 2026-10-21, round 4 (the sprites, from the owner's "still pretty poor, look
  and see if you can find the original sprites"): the arcade's sheets exist
  as ROM reconstructions (Fabien Sanglard's CPSS) and as fan rips, but they
  are Capcom's art, so they were studied and not shipped; the owner chose a
  CC0 pack instead. Every fighter is now a sprite sheet cut from puffolotti's
  Mustermenschen bodies (78 to 86 px tall, the arcade's scale, hundreds of
  cels each), recoloured per fighter with a second colourway, by
  `scripts/fighter-sprites.py`; the 3D body stays as the stand-in while a
  sheet loads.
- 2026-10-21, round 5 (closer to the arcade, from the owner's "I do want them
  looking closer to the original"): the arcade's sheets were studied as
  reference (Ryu stands about 100 px, heroic bulk, warm hue-shifted ramps,
  edges in each material's darkest tone, no black outline) and the cast was
  rebuilt to match from puffolotti's 171 px CC0 karate model, downscaled to
  each fighter's height with that finish applied; MEI stays on the 78 px
  body. No Capcom pixel is used or traced.
- 2026-10-21, round 6 (a sumo and a beast, at the owner's request): no CC0
  pack offers either body with a fighting move set (puffolotti's "sumo" and
  "savage" builds are fighting styles on the slim mannequin, and the free
  monsters only walk), so the karate model is reshaped instead: each row of
  an upright frame widened about its own centre by a height profile
  (`SHAPES`), with a mawashi grown from the belt and a topknot for TORA and a
  mane for RIO.

- 2026-10-25, round 7 (from the owner's "the sumo still moves like a karate
  guy", "it does get smaller body sometimes", "the kick… looks like it broke
  a leg" and "the characters image on the presentation is nothing like the
  original"):
  - **TORA moves as a sumo.** A `sumo` move list over the karate one names a
    wide squat stance and waddle, palm thrusts, a shiko win, and cels of its
    own for the Hundred Slaps and the Torpedo, all from the model's frames.
  - **The build is pose-independent.** Row widening by a height profile was
    gentle on any frame not upright (the shrinking) and dragged a kicking leg
    sideways off its hip (the broken leg). Now the torso is scaled about the
    body's own axis and the limbs thicken outward, the same on every frame.
  - **Cleaner bodies.** Bare skin is relit as rounded forms, because the
    model's light there was a cloth's creases. The model's grey shoes, which
    were sharing the vest's colour, and its blue cuffs, which were sharing the
    belt's, are told apart by connected region, and that took stray feet out of
    every fighter.
  - **Portraits rebuilt.** `portrait.ts` sculpts a three-quarter head in 3D
    with per-fighter proportions (`FACES`), replacing the frontal 2D painter.
  - **Still not the arcade's sprites.** The owner suggested its sprites are
    out of copyright as a 1991 game; they are not (a corporate work's
    copyright runs for decades yet, and Capcom still licenses them), so
    they remain reference only.
