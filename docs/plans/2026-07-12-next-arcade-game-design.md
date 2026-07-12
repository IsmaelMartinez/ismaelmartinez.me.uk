# The Next Arcade Game: Candidates and a Recommendation

Date: 2026-07-12
Status: Proposed — design only, no code yet. This doc picks the arcade's next
game after the original four-game wish list (Tank Duel, Pixel Park, Microcity,
Critter Rescue) plus Syndicate all shipped.

## Context

The arcade (`/[lang]/fun/`) now holds seven playable cabinets on top of the
shared engine: Snake (arcade), Poo Poo Land / Dev Quiz (puzzle), Tank Duel
(artillery), Pixel Park (tycoon), Microcity (city sim), Syndicate (tactics),
and Critter Rescue (Lemmings-style puzzle). The wish list that drove the
2026-06 expansion (`2026-06-10-arcade-expansion-design.md`) is done.

The engine under `src/games/engine/` has matured across six of those games and
is now worth building the next game *around* rather than alongside. The bar for
the next cabinet:

1. **Reuse the shared engine** — don't grow a new foundation.
2. **Fill a genre gap** — every current game is a management sim (park, city,
   syndicate), a puzzle (poo, lemmings), an artillery duel, or classic snake.
   The moment-to-moment feel should be something the arcade doesn't have yet.
3. **Scope to one focused session** — pure logic modules + tests + one page,
   the same shape every game lands in.

This doc proposes three candidates, weighs them against the engine and the
existing roster, recommends one, and stops there. No game code ships with it.

## What the engine actually gives us

Grounding the proposals in the real APIs (not aspirations), a new game inherits:

| Module | Exports a new game can lean on |
|---|---|
| `engine/loop.ts` | `createGameLoop(update, render)` — fixed 60 Hz `update(dt)`, per-frame `render()`, and an `astro:before-swap` teardown so the loop retires with the DOM it draws on. Fixed timestep matters for anything with physics or gravity. |
| `engine/grid2d.ts` | `gridNeighbours(i, w, h)` (4-dir, edge-safe) and `chebyshev(a, b, w)` on a flat `y * w + x` grid. |
| `engine/iso.ts` | `IsoView`, `isoProject` / `isoTileFromPoint` (screen→tile picking), `fillTile`, `drawBlock` (extruded lit/shaded block with `zOffset`), `drawRamp`, `forEachTileBackToFront` (painter order), and view `rotateTile` / `rotatePoint`. Asset-free 2.5D. |
| `engine/scoreboard.ts` + `engine/highscores.ts` + `HighScoreTable.astro` | `initScoreboard(panel)` → `show(score)` / `stash(score)` / `top()`; per-device top-10 with three-initials entry, provisional stashing for long runs, and auto-commit on tab close / Astro swap. |
| `engine/audio.ts` | `createGameAudio({ melody, tempo, wave })` chiptune loop + `playSfx('blip'|'score'|'hit'|'explosion'|'gameover')`, all synthesised (no binaries), plus `wireSoundButton`. |

Beyond the engine, two games (Pixel Park and Syndicate) each carry a
near-identical **BFS over a flat walkable grid** (`syndicate/pathfind.ts`
header even notes "Same approach as Pixel Park's guest routing"; Microcity's
traffic is cosmetic and does no routing). That is the obvious next extraction
into the engine — the doc calls this out per candidate rather than assuming it.

Conventions every game follows and the next one must too: pure rules in
DOM-free modules taking an injectable `random: () => number`; only `game.ts`
touches the canvas; a single `init<Game>()` entry the page calls; static labels
rendered server-side with `useTranslations`, runtime-composed strings via
`data-t-*` on the game root; `fun.<game>.*` keys across all three locales;
tests under `tests/games/<game>.test.ts`; and a cabinet on
`src/pages/[lang]/fun/index.astro`.

## Candidate games

### A. Tower Defense — "Line Hold"

Enemies march along a fixed route across a grid from a spawn to a goal; the
player spends earned currency to place towers on the buildable tiles beside the
path; towers auto-fire at enemies in range; leaked enemies cost lives. Waves
escalate; score is waves cleared plus a running kill/interest bonus.

- **Engine fit — the tightest of the three.** It is an iso grid game, so it
  reuses `iso.ts` wholesale: `forEachTileBackToFront` for draw order, `drawBlock`
  for towers of increasing height per level, `isoTileFromPoint` for
  tap-to-place, and optional view `rotation` for free. Tower range is
  `chebyshev` from `grid2d.ts`. The real-time `loop.ts` drives enemy movement,
  tower cooldowns, and projectile flight at a fixed tick (interpolate render
  between ticks, exactly as Pixel Park does for guests). Enemy routing is the
  same BFS the three sims already run — the natural moment to lift it into
  `engine/pathfind.ts`. Score is a clean fit for the top-10 scoreboard, with
  `stash()` after each wave so a long defence can't be lost to a tab close.
- **Novelty vs the roster.** New *feel* — real-time active defence, twitch
  target-priority decisions — but it is visually and structurally another iso
  grid game, of which the arcade already has three. The freshness is in the
  combat loop, not the presentation.
- **Scope.** Medium. Pure modules: `path.ts` (route + BFS), `waves.ts`
  (spawn tables), `towers.ts` (types, range, damage, cooldown, targeting),
  `enemies.ts` (hp, speed, armour), `economy.ts` (currency, interest, lives).
  `game.ts` owns canvas + placement UI. Three or four tower types and a dozen
  hand-authored waves is a shippable v1.

### B. Boulder Dash-style dig — "Gem Caverns"

Top-down cave of dirt, boulders, gems, and walls. Dig through dirt to collect a
quota of gems, then reach the exit before time runs out. Boulders and gems fall
when unsupported and roll off rounded surfaces; a boulder falling on the player
is fatal, and the player can nudge boulders sideways. Optional wandering
critters add danger.

- **Engine fit — good, but skips the iso layer.** Cellular falling physics is
  the poster child for a **fixed-timestep** `loop.ts` (deterministic gravity,
  no frame-rate coupling). It is a flat `y * w + x` tile grid, so `gridNeighbours`
  applies, but rendering is a plain top-down tile blit — `iso.ts` goes unused,
  so this reuses *less* engine than Tower Defense. The falling/rolling ruleset
  is pure and richly unit-testable (a cellular-automaton sweep per tick), close
  in spirit to Critter Rescue's `bitmap.ts` but tile-based instead of per-pixel.
  Score (gems + time bonus) maps straight onto the scoreboard.
- **Novelty vs the roster.** High on presentation — the arcade has no top-down
  action-puzzle and no cellular-physics arcade game; distinct from Critter
  Rescue's assign-a-skill puzzling because this is direct real-time control of
  one avatar.
- **Scope.** Medium. `grid.ts` (tiles + the fall/roll sweep), `player.ts`
  (movement, push, death), `levels.ts` (vector- or string-authored caves like
  Critter Rescue's `levels.ts`). Enemies are an optional stretch. The
  fall-sweep needs care to match the classic's rolling rules but is small and
  testable.

### C. Falling-block puzzle — "Cascade"

A Columns/Tetris-family stacker: pieces fall on a fixed grid, the player
shifts/rotates them, full lines (or colour matches) clear and score. Speed ramps
with level.

- **Engine fit — clean but shallow.** `loop.ts` gravity, `grid2d.ts` for the
  well, scoreboard for score, `audio.ts` for line-clear stings — a textbook fit,
  and the smallest build. But like Gem Caverns it is flat, so `iso.ts` is unused.
- **Novelty vs the roster.** The arcade has no falling-block puzzle, so it fills
  a real gap, but the genre is the most over-familiar of the three and adds the
  least that feels bespoke to this site.
- **Scope.** Small. `well.ts` (grid + line/match clears), `piece.ts` (shapes,
  rotation, collision) — both trivially unit-tested; `game.ts` for input and
  render. Could ship in well under a session.

## Comparison

| | Engine reuse | Novelty of feel | Fresh presentation | Scope | New extraction earned |
|---|---|---|---|---|---|
| **A. Tower Defense** | Highest (iso + grid + loop + BFS + scoreboard) | High (real-time defence) | Low (4th iso grid game) | Medium | Shared `engine/pathfind.ts` |
| **B. Gem Caverns** | Medium (grid + loop, no iso) | Medium–High | High (top-down cellular action) | Medium | none required |
| **C. Cascade** | Medium (grid + loop, no iso) | Low (well-worn genre) | Medium | none required |

## Recommendation: A — Tower Defense ("Line Hold")

It reuses the most of the engine we have actually hardened, and the piece it
does *not* yet have — enemy pathfinding — is a BFS two existing games already
carry, so building it lands a genuine engine win (`engine/pathfind.ts`) that
retroactively simplifies Park and Syndicate. That "extract when the next
game needs it" move is exactly the ethos the expansion doc set out.

Its one real weakness is presentation overlap: it would be the arcade's fourth
iso grid game. Two things mitigate that. First, the *interaction* is new — the
current iso games are all deliberate, low-pressure placement (build a park,
zone a city, order a squad); a defence that fires in real time against
escalating waves reads and plays nothing like them. Second, the iso layer's
`rotation` support and `drawBlock` height levels give towers and enemy ranks a
distinct silhouette from the sims for free.

If avoiding a fourth iso game is weighted more heavily than engine reuse in
review, **B (Gem Caverns)** is the fallback: it brings a brand-new top-down
look and a new physics genre at comparable scope, trading away the iso reuse and
the pathfinding extraction. C is the safe, small choice but adds the least
that feels particular to this arcade.

### Line Hold — proposed shape

```
src/games/towerdefense/
  path.ts        # route generation + BFS from goal (pure, tested)
  waves.ts       # per-wave spawn tables and pacing (pure, tested)
  towers.ts      # tower types: range (chebyshev), damage, cooldown, targeting (pure, tested)
  enemies.ts     # enemy types: hp, speed, armour, bounty (pure, tested)
  economy.ts     # currency, wave interest, lives, score (pure, tested)
  game.ts        # canvas + iso render + placement/upgrade UI (DOM)
  index.ts
```

- **World.** A modest iso grid (≈ Microcity's footprint). One authored path per
  map for v1; buildable tiles are the non-path grass beside it. Rendered with
  `forEachTileBackToFront` + `fillTile` (ground) and `drawBlock` (towers, taller
  per upgrade level).
- **Enemies** advance along the path at a fixed per-tick speed; render
  interpolates position between ticks. Routing precomputes a BFS distance field
  from the goal once per map (reused from the shared extraction), so enemies
  always step downhill toward the exit and a future maze-building mode drops in
  without new pathfinding.
- **Towers** are placed by tapping a buildable tile (`isoTileFromPoint`),
  acquire the in-range enemy (`chebyshev`) with the highest path-progress, and
  fire on a cooldown; a projectile or hitscan applies damage with
  `playSfx('hit')`. Three to four types (single-target, splash, slow) is enough.
- **Economy & score.** Kills pay bounty, each cleared wave pays interest; leaks
  cost lives, zero lives ends the run. Score = waves cleared × base + kill
  bonus, presented through `initScoreboard`, with `stash()` called at each wave
  boundary so a long defence survives a tab close (same guarantee the sims rely
  on).
- **Audio.** A driving chiptune loop via `createGameAudio`; `blip` on placement,
  `hit`/`explosion` on kills, `gameover` on the last leak.
- **v1 simplifications** (room to grow, in the spirit of Pixel Park's list):
  one fixed path per map (no player-built mazes yet), no tower selling, flat
  projectile visuals, and a fixed wave script rather than endless scaling.

## Suggested next steps

1. Ship **Line Hold** the way every game lands: pure modules + `tests/games/
   towerdefense.test.ts` (route reachability, targeting, wave/economy math, and
   a headless "survives all waves with a known layout" playthrough, mirroring
   Critter Rescue's solvability tests), a page at
   `src/pages/[lang]/fun/towerdefense.astro`, `fun.towerdefense.*` keys and a
   `fun.arcade.genre.towerdefense` label across all three locales, and a cabinet
   on the arcade index.
2. As part of it, extract `engine/pathfind.ts` (the shared BFS) and migrate
   Park / Syndicate onto it opportunistically — the deduplication the two
   copies have been waiting for.
3. Hold **Gem Caverns** and **Cascade** as designed-but-unbuilt candidates for
   the session after, the same way the wish-list games were queued behind
   Tank Duel.
