# Arcade Candidates, Round 3: After Line Hold and Cascade

Date: 2026-07-18
Status: Proposed — design only, no code. This doc queues the arcade's next
cabinet now that both games built from `2026-07-12-next-arcade-game-design.md`
(Line Hold, then Cascade) have shipped.

## Context

The arcade (`/[lang]/fun/`) holds nine playable cabinets: Snake (arcade),
Poo Poo Land (puzzle), Tank Duel (artillery), Pixel Park (tycoon), Microcity
(city sim), Syndicate (tactics), Critter Rescue (Lemmings-style puzzle),
Line Hold (tower defense), and Cascade (falling-block puzzle).

The 2026-07-12 doc proposed three candidates and recommended Line Hold, which
shipped with the `engine/pathfind.ts` extraction it promised. Cascade — that
doc's candidate C — shipped next, bringing cascade-gravity chains, a pure
headlessly-playable run state machine (`src/games/cascade/run.ts`), and one
small engine win: `GameAudio.setTempo()`, so music can ramp with game pace.
Candidate B, **Gem Caverns**, was designed but never built; it carries over
here rather than being re-invented.

The bar is unchanged:

1. **Reuse the shared engine** — don't grow a new foundation.
2. **Fill a genre gap** — the moment-to-moment feel should be new.
3. **Scope to one focused session** — pure modules + tests + one page.

## What the engine offers now

| Module | Exports a new game can lean on |
|---|---|
| `engine/loop.ts` | Fixed 60 Hz `update(dt)` + per-frame `render()`, with `astro:before-swap` teardown. |
| `engine/canvas.ts` | Hi-DPI backing store with a logical-coordinate contract (`toLogical`), plus `createStaticLayer` for baked backdrops. |
| `engine/grid2d.ts` | Flat-grid neighbours, `chebyshev`, blob/edge terrain generators. |
| `engine/pathfind.ts` | Shared BFS (`bfsFrom` / `buildPath` / `findPath`) over a walkability predicate — Park, Syndicate, and Line Hold all route through it. |
| `engine/iso.ts` | Full asset-free 2.5D: projection, picking, lit blocks, ramps, painter order, view rotation. |
| `engine/scoreboard.ts` + `highscores.ts` | Per-device top-10 with initials entry, `stash()` for long runs, auto-commit on tab close. |
| `engine/audio.ts` | Synthesised chiptune loop + sfx, shared mute, and (new with Cascade) `setTempo(bpm)` for pace ramps. |

Cascade also leaves a design precedent worth copying: its whole game — gravity,
lock delay, clear timing, scoring — is a pure `run.ts` state machine that tests
drive through entire seeded games with a greedy bot. Any real-time candidate
below should land the same shape.

## Genre gaps

Across nine cabinets there is still no: direct-control action game (dig/run
under pressure), shoot-em-up, racing game, or breakout-style bat-and-ball.
Reflex-driven, single-avatar games are the arcade's thinnest shelf — the
roster leans heavily toward deliberate placement and puzzling.

## Candidates

### A. Gem Caverns — Boulder Dash-style dig (carried over)

Top-down cave of dirt, boulders, gems, and walls. Dig to a gem quota, then
reach the exit before time runs out; boulders fall when unsupported, roll off
rounded edges, and crush the careless. Full design rationale in the
2026-07-12 doc (candidate B) still holds.

- **Engine fit.** Fixed-timestep cellular physics is `loop.ts`'s poster child;
  flat `y * w + x` grid, `createStaticLayer` cave backdrop, string-authored
  levels like Critter Rescue's. `iso.ts` unused. Since then the flat-top-down
  toolkit has only gotten stronger (hi-DPI canvas contract, static layers) —
  the reuse story is better than when it was first proposed.
- **Novelty.** High: the arcade has no direct-control action-puzzle and no
  cellular physics. Distinct from Cascade (indirect stacking) and Critter
  Rescue (assign skills, no avatar).
- **Scope.** Medium: `grid.ts` (tiles + fall/roll sweep — richly unit-testable,
  and a headless "level is completable" test mirrors Cascade's bot), `player.ts`,
  `levels.ts`, `game.ts`.

### B. Vertical shoot-em-up — "Nova Patrol"

A single-screen wave shooter: the player's ship strafes the bottom, enemy
formations swoop in patterns, waves escalate to a boss every fifth. Score per
kill with a no-damage wave bonus.

- **Engine fit.** `loop.ts` for movement/bullets (interpolation-free at 60 Hz),
  `createStaticLayer` starfield (Cascade's backdrop, literally), scoreboard
  with `stash()` per wave, `setTempo()` rising as waves deepen. No grid, no
  iso, no pathfinding — the least engine reuse of the three; collision is new
  but trivial (circle vs circle). Pure modules: `waves.ts` (formation
  scripting, the interesting testable core), `ship.ts`, `bullets.ts`.
- **Novelty.** High: first shooter, first twitch-dodge game. Presentation-wise
  it shares Cascade's cosmos look.
- **Scope.** Medium — formation choreography is where the session goes.

### C. Top-down time-trial racer — "Micro GP"

A looping circuit viewed from above; beat the clock across three laps, ghost
car replay of the device's best run. Score = time converted to points.

- **Engine fit.** Weakest. `loop.ts` fits, but car physics (acceleration,
  drift, wall scrape) is a new foundation with no engine home, the scoreboard
  is time-based (lower-is-better inverts the top-10 contract), and track
  authoring needs new tooling. Ghost replay is genuinely novel tech the
  engine could keep.
- **Novelty.** High — nothing like it in the roster.
- **Scope.** Large in disguise: feel-tuning a car is open-ended in a way
  formations and falling boulders are not.

## Comparison

| | Engine reuse | Novelty of feel | Scope | Risk |
|---|---|---|---|---|
| **A. Gem Caverns** | High (loop + grid + static layers + levels pattern) | High | Medium | Low — designed once already |
| **B. Nova Patrol** | Medium (loop + layers + scoreboard + tempo) | High | Medium | Medium — formation tuning |
| **C. Micro GP** | Low (new physics, inverted scoring) | High | Large | High — feel is open-ended |

## Recommendation: A — Gem Caverns

It was the strongest runner-up last round and the reasons have only
strengthened: the flat top-down toolkit it needs is now the engine's
best-exercised path (Cascade), its cellular fall/roll sweep is exactly the
kind of pure, table-driven rule set this codebase tests well, and it fills
the arcade's clearest gap — a direct-control action game — without inventing
any new foundation. Build it Cascade-shaped: a pure per-tick sweep module a
headless test can drive to level completion, `game.ts` as the only DOM file.

**Nova Patrol** is the fallback if a second cosmos-flavoured cabinet right
after Cascade feels fresher than a return to earth tones; it costs a new
(small) collision helper but nothing structural. Micro GP should wait until
someone actively wants to build car feel — it is the least engine-shaped and
the most likely to blow the one-session budget.

## Suggested next steps

1. Ship **Gem Caverns** the way every game lands: pure modules +
   `tests/games/gemcaverns.test.ts` (fall/roll sweep cases, crush rules,
   quota/exit logic, and a seeded headless completion of each authored
   level), a page at `src/pages/[lang]/fun/gemcaverns.astro`,
   `fun.gemcaverns.*` + `fun.arcade.genre.gemcaverns` keys across all three
   locales, and a cabinet on the arcade index (move the "new" badge off
   Cascade).
2. Hold **Nova Patrol** and **Micro GP** as designed-but-unbuilt candidates
   for the round after, and update `CLAUDE.md`'s arcade section to point at
   whichever doc then holds the queue.
