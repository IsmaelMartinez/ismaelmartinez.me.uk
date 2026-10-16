# PRIME TIME: a twin-stick arena shooter after Smash TV

Written 2026-10-16. The owner asked for "yet another game based on Super Smash
TV", built as a replica for the arcade floor, slotted into the unlock chain at
the right point in the timeline, and iterated with review agents until it is a
game the owner would want to play. This plan sets the goals, the loop that
closes them, and what "done" means, and its Progress section is the log of the
rounds.

The reference is Williams' Smash TV (1990, Eugene Jarvis and Mark Turmell) and
its SNES port, Super Smash TV (1991): a game show in 1999 where contestants
fight through a studio of single-screen rooms against hundreds of club-wielding
grunts, floating orbs, walking bombs, tanks and snakes, collect cash and prizes
("Big money! Big prizes! I love it!"), choose a door into the next room from a
map between rooms, and meet a boss at the end of each circuit. The genre is the
twin-stick shooter Jarvis invented with Robotron (1982); Smash TV is its
game-show reskin and the cabinet most people remember it by. It arrived in
arcades in April 1990, so it stands beside CALCIO '90 at the chain's 1990 slot,
after it (CALCIO was there first) and before Critter Rescue (1991).

## What the cabinet is

**PRIME TIME** (`primetime`, `/fun/primetime`, 📺, hot pink `#ec4899`): one
contestant, three studios, one sitting. Each studio is a small grid of rooms
walked from the entrance to the boss room, with branching so a run has
choices; each room pours enemies in through its four doors from an authored
wave script; a cleared room opens its doors toward unvisited neighbours and the
contestant walks through one; a map screen slides the token to the next room
between fights. Touching anything kills; three lives, a respawn shockwave so a
death never chains into another, extra lives as rare prizes. Weapons are the
machine gun always and three timed pickups (spread, grenades, rockets), beside a
shield, speed boots and a smart bomb. Prizes are cash. The run ends on the
third boss, through a bonus prize room when enough keys were collected, or when
the lives run out; either way the cash total goes to the one shared board.

It follows every convention in CLAUDE.md for a cabinet: pure DOM-free modules
under `src/games/primetime/` with a single `initPrimeTimeGame()` entry; the
engine's required channels (`mountCabinet`, `createGameLoop`, `setupHiDpiCanvas`
with a baked static layer, `createEffects`, `createToaster` + `ToastArea.astro`,
`listenUntilSwap`, `wireSoundToggles`, `initScoreboard` with `beginRun`/`bank`);
`arcade.css`; server-side labels through `useTranslations` with runtime strings
on `data-t-*`; a `music.ts` exporting a `GameAudioOptions` and a `MUSIC_PROFILE`
written to a brief after the reference's own sound; a DOM readout for the score;
a seeded run (`seededRng`) so tests play whole games headlessly; and at least one
test that plays the cabinet to completion and asserts a player-visible outcome.

## Goals

Each goal has a check that can go red. The loop below runs until every check
is green and the review rounds stop finding anything the owner would notice.

- **G1 The twin-stick feel.** Eight-way movement and independent eight-way fire,
  from a keyboard (WASD moves, arrows fire), a gamepad (two sticks), a mouse
  (WASD moves, hold to fire toward the pointer) and touch (two floating sticks
  on the canvas). Fire is held, not tapped. Check: the input module's pure
  part is unit-tested for the eight-way snap and the dead zone, and the DOM
  suite drives a run from keyboard events.
- **G2 The crowd.** Rooms are about numbers: forty-five grunts in a
  first-studio room, a hundred and forty in the third, in overlapping streams
  from the doors, with orbs, mines, shrapnel men, tanks and snakes layered in
  as the studios go on. Check: a test asserts every room's script is finite
  and that enemy counts rise across the three studios; the playthroughs run
  studio 3's rooms at full speed in the harness, which is the budget check.
- **G3 A run with a shape.** Three studios, a map with choices, a boss at the
  end of each, a bonus prize room gated on keys, an ending in both directions.
  Check: a competent scripted player (`tests/games/primetime-policies.ts`)
  clears the first studio on most seeds and the whole run terminates (won or
  over) inside a literal tick guard on every seed; a passive player dies in
  the first room within thirty seconds.
- **G4 Fair deaths.** A respawn gives 2.5 s of invulnerability and a shockwave
  that clears the floor around the contestant; nothing spawns within reach of
  a live player; the arena's doors are the only way in. Check: unit tests on
  the spawn rule and the shockwave, and a playthrough assertion that no life
  is lost inside the invulnerability window.
- **G5 Cash on screen.** Every dollar lands with a floater where it was earned,
  prizes announce themselves (a car is a fanfare), the run banks as it grows,
  and the personal best is shown live. Check: the run's events carry a
  position for every cash gain; the DOM suite sees `bank` called on gains and
  `show` on the ending.
- **G6 A 1990 Williams sound.** A score after the arcade's YM2151-and-samples
  palette and game-show brashness, with an intro fanfare, a boss scene, a
  last-life danger variant, stingers for a cleared room, a prize, a death and
  an extra life, and endings for both results; effects on the effects bus
  from the cabinet's own `sound.ts`. Check: `music.test.ts` passes every gate
  on every scene and the difference test against the live floor.
- **G7 Wired into the arcade.** Chain slot, cabinet art, scores API board,
  three locales, release-phases table, CLAUDE.md, the screenshot harness.
  Check: lint, typecheck, the full Vitest suite, build, link check; the chain
  test's year ordering; `releasedChain` and the floor island carry it in a
  preview build.

## The loop

1. Build the pure modules and their unit tests (arena, weapons, enemies, rooms,
   bosses, run), then the policies and the playthrough harness.
2. Tune against the harness until G3's checks hold: a competent bot clears
   studio 1 on most seeds and the whole run terminates; record the numbers.
3. Build the page, the renderer, input, music and sound; run the DOM suite.
4. Build the site as a preview and screenshot the cabinet with Playwright at a
   few moments (title, mid-room, map, boss, game over) and look at the frames.
5. Review rounds with fresh agents: a code review of the diff against CLAUDE.md's
   conventions, and a playtest round that reads the harness numbers and the
   frames and says what a player would complain about. Fix, re-run 2 to 4.
6. Stop when a round finds nothing that would change the owner's first five
   minutes with it.

## Decisions worth recording

- **Eight-way fire, even from an analogue stick.** Smash TV fires in eight
  directions and so does this cabinet, from every input. It is part of the feel
  (the spread gun's fan is designed around it), and it keeps the shared board
  fair between a keyboard and a stick.
- **Touching kills, and the respawn protects.** The genre's one-hit rule is
  kept, because its tension is the game. What makes it fair here is the
  respawn: a shockwave that kills every ordinary enemy within reach and 2.5 s
  of invulnerability, so a death is a lost life and never a lost run on its
  own.
- **Rooms are authored scripts, the run is seeded.** A room's enemies, counts,
  doors and timing are a table in `rooms.ts`; the seed moves only which door
  and where along it an enemy appears, a grunt's speed jitter and where a
  prize lands, so two players on different seeds fight the same room, as Line
  Hold's seed moves only the spawn jitter. The seed is the harness's handle
  and is not shown: unlike Line Hold's, what it moves is cosmetic.
- **The bonus room is the only place keys matter**, and it pays in cash the
  board can hold: `MAX_SCORE` is ten million and a perfect run is well under one.
- **No voluntary door to the board.** A run is bounded (three bosses) and the
  genre's terminal state is death, as Cascade's marathon is a top-out; the
  convention from #261 is for runs with no end.
- **Hot pink.** No cabinet on the floor is pink, and the show's palette is neon
  on black.

## Progress

- 2026-10-16: plan written; build started.
- 2026-10-16, round 1 (the harness): the pure modules and the competent bot.
  Three findings before any page existed. An orb that overshot the contestant
  sailed out through the wall and circled the studio where no shot could
  reach it, stalling a room for good (enemies are now kept inside once they
  have entered). A room waited on its last mine, which an eight-way gun
  cannot be sure of hitting from where the contestant stands (mines no longer
  gate a clear; they stay as hazards). And a boss camped the respawn point,
  so the second life went the way of the first when the grace ran out (a
  respawn now sends the boss back to its entrance for a beat). Mutoid Man's
  fan went from 5 and 7 shots at 50 degrees to 4 and 6 at 40 and 50, and
  Cobra Death from 165 px/s to 118 (the contestant runs at 172): at 130 the
  bot lost every fight, at 118 it wins them all, so the final boss is a chase
  with a thin margin rather than a wall. Report over ten seeds: 8 of 10
  competent runs clear studio 1, the rest die to Mutoid Man; runs last 2.5 to
  5 minutes and end at $41k to $129k.
- 2026-10-16, round 2 (the reviews): a playtest critic and a code reviewer
  read the harness, the frames and the diff. The critic's census of 38 bot
  deaths found orb shots (10) and Mutoid's fan (8) on top, then mine blasts
  (6), and measured the crowd as a trickle: an average of two grunts on the
  floor and a third of every fight an empty room, because the three streams
  ran one after another with gaps. Changes: the streams overlap and every
  grunt count is 1.6x (28 to 144 a room); a mine's blast kills the contestant
  only inside `MINE_PLAYER_BLAST` (30) while clearing the crowd at 64, and a
  mine set off by the smart bomb or the shockwave is harmless (the reviewer's
  probe showed a bomb taken beside a mine was a death); orbs hold fire inside
  120 px and flare before a shot; Mutoid's fans are 3 and 5 shots (the
  stage-1 fan had gaps narrower than the contestant), Scarface has 160 hp and
  a longer breath between charges, Cobra Death runs at 124 with faster bursts
  and the bosses pay 25k/50k/100k; `resetBoss` resets a pushed-back boss's
  charge, heading and clocks, not only its position; the last-life music is
  re-asserted after every scene change, which was dropping it in boss rooms;
  the room clear waits for the last hostile shot; the map and the open doors
  show what the room beyond holds; flak is hot orange, mines are lit, a pause
  button serves touch, a blur releases held keys, the dev handle is gated on
  `#dev`. The bot itself gained hysteresis on its dodge (its facing breaks a
  fan's centre-line tie), without which it jittered in place and died to
  every fan whatever the fan's shape, which is what a week of tuning against
  it would have been measuring. Report after: 8 of 10 clear studio 1, most
  reach studio 2's second half, 1 reaches studio 3; a twelve-life studio-3
  play wins on 7 or more seeds and reaches the dome on some. The two figures
  still to judge by hand are the first boss (one life a run for the bot) and
  the pace of studio 3 at 144 grunts a room.
- 2026-10-16, round 3 (the owner's look): the contestant and the bosses drawn
  from primitives were "nothing like the original". They are authored
  bitmaps now (`sprites.ts`): the contestant from the belt up in Smash TV's
  above-and-in-front view (dark hair, red headband, blue tank top, bare
  shoulders) over scissoring legs and a two-handed gun that turns with the
  aim; the clubbers as bald blue bruisers in orange vests with clubs, two
  frames; Mutoid Man as a pink cyborg torso with a chrome visor face and
  steel shoulders on rolling treads, cannons slung under the shoulders and
  turned to the contestant; Scarface as a grey-green head with a riveted
  plate over one eye, the scar and a grimace, with an open-mouthed frame for
  the wind-up and charge; Cobra Death as a hooded head with eye-spots and a
  forked tongue turned along its heading, over a chain of scaled segments.
  Checked in close-up on the preview at two device pixels per pixel. The
  owner then asked for the grunts and orbs to get the same treatment, so the
  whole crowd is bitmaps now: three-frame clubbers with the club over the
  shoulder, chrome orbs with a lens that is cyan when harmless, red when armed
  and white in the charge before a shot, a spiked mine with a hazard stripe,
  Mr Shrapnel as a red barrel on legs with a lit fuse, a tank hull with a
  turned turret, and a snake head and segments turned along their heading.
  A third pass, at "you can do even better": the contestant has three bodies
  (front, back, side) chosen by his aim, with the gun passing behind him when
  he fires upward, and a fallen frame for the death under a bursting ring;
  an enemy flashes white as its own silhouette when hit and tumbles along
  the blow and fades when killed (`kill` events now carry the blow's
  direction, `hit` events the enemy's id); blasts, deaths, boss stages and
  the bomb shake the frame; clubbers wear a different kit per studio and
  orbs spin a highlight round the sphere; Mutoid Man tears to the steel
  under half health; and the studio floor has chevrons pointing at each
  door, the show's logo ring, scuffs, and two spotlights sweeping from the
  top corners.
