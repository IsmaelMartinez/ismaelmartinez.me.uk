# Arcade Round 10 — Plan

Date: 2026-07-24
Status: **Executing.** Round 9 (PR #197) is merged. The owner asked for the
Tank Duel follow-on the Round 9 review flagged as the highest-leverage work
left: the two runner-up ideas from that round's audit, built together because
they interlock. No fresh audit is needed; this round is scoped to one cabinet by
the owner's direct request. After this round the owner has asked to move to the
Dependabot alerts, so this is expected to be the last arcade feature round for
now.

The repo bar applies to every commit: `npm run lint && npm run typecheck &&
npm run build && npm test && npm run check-links`, plus a browser smoke for the
new draw and physics, headless proofs for the balance and content claims, i18n
keys across all three locales, and execution notes at the foot of this doc.

Baseline at branch point (`fe5ea19`): 585 tests, 20 files.

## The two goals

Round 9 gave Tank Duel four arena silhouettes but explicitly deferred the
tactically richest option, an indestructible obstacle, because it needed a new
terrain concept (a column the crater cannot cut) and its own draw code. Round 9
also left the arsenal at three weapons, the audit's second finding. The owner's
call was to build both, because they interlock: cover only matters if some shots
can be denied by it, and a skipping shot is exactly the shot cover should stop.

| # | Goal | Kind | Interlock |
|---|------|------|-----------|
| 1 | G1 the bunker arena (indestructible central pillar) | Content + terrain model + art (headless + screenshots) | the cover |
| 2 | G2 the Skipper (a bouncing fourth weapon) | Weapon + physics (headless + smoke) | the shot cover stops |

Execution runs G1 then G2, so the weapon is tuned against the cover it has to
respect. One commit per goal, full bar after each, single PR.

## G1 — Tank Duel: the bunker arena

**The change.**

- `src/games/tanks/terrain.ts`: add `'bunker'` to `ArenaType`. In `reshapeArena`,
  handle bunker as an early special case: a tall flat-topped pillar (near the
  `0.3h` ceiling) spanning a narrow central band, with the rolling base terrain
  everywhere else. Add a shared `bunkerColumns(width)` helper (the pillar's
  column range) and a new export `arenaSolid(arena, width): boolean[]` that marks
  those columns for `'bunker'` and returns an all-false mask for every other
  arena. Give `carveCrater` a new optional `solid: boolean[] = []` parameter and
  have it skip any column where `solid[x]` is true, so the pillar cannot be dug
  away.
- `src/games/tanks/game.ts`: track a module-scoped `solid: boolean[]` beside
  `ground`, set from `arenaSolid(arena, WIDTH)` wherever the terrain is rolled
  (a small `rollTerrain()` helper keeps the three call sites in step). Pass
  `solid` to `carveCrater` in `impactAt`. In `paintTerrain`, overlay the solid
  columns in a stone fill distinct from the carveable dirt, so cover reads as
  cover. Add a fifth `.arena-btn` for bunker.
- `src/pages/[lang]/fun/tanks.astro`: a fifth arena button (`data-arena="bunker"`).
- `src/i18n/translations.ts`: `fun.tanks.arenaBunker` across en, es, cat.

**Eval criteria (headless in `tests/games/tanks.test.ts`, plus a capture).**

- `arenaSolid('bunker', W)` marks a contiguous central band and nothing else;
  every non-bunker arena returns an all-false mask.
- The bunker heightmap keeps every column in `[0.3h, 0.92h]`, and the pillar
  columns are genuinely tall (well above the surrounding base).
- `carveCrater` with a solid mask leaves solid columns untouched while still
  carving their non-solid neighbours (the load-bearing proof the pillar is
  indestructible).
- **Winnability**: the bunker arena joins the existing winnability sweep, so the
  CPU's grid search is proven to arc over the pillar and land on the far tank at
  both spawn separations, across seeds. This is the guard that a central pillar
  never makes a round unwinnable.
- Screenshot: a `tanks-bunker` capture for the PR showing the stone pillar.

**Risk.** A pillar too tall or too wide could be unwinnable at the CPU's grid
resolution. The winnability test is the guard; if it fails, lower or narrow the
pillar until every seed passes.

## G2 — Tank Duel: the Skipper (bouncing weapon)

**The change.**

- `src/games/tanks/weapons.ts`: add `'bounce'` to `WeaponId`, a `bounces?: number`
  field to `WeaponDef`, a `WEAPONS.bounce` entry (moderate radius/damage, a few
  shots per round, `bounces: 2`), extend `WEAPON_IDS` and `freshAmmo`.
- `src/games/tanks/physics.ts`: a pure `bounceOffSurface(p, surfaceY, restitution)`
  that lifts the projectile clear of the surface, flips its vertical velocity
  upward and bleeds both components by `restitution`. This is the unit-testable
  core of the mechanic.
- `src/games/tanks/game.ts`: add `bounces: number` to the `Shot` interface, set
  from the weapon in `fire()` (and `0` on MIRV split parts). In `stepShot`, on a
  ground impact, if the shot has bounces left **and** the impact column is not
  solid **and** it is not a direct tank hit, call `bounceOffSurface`, decrement,
  and keep flying; otherwise detonate as now. A bounce shot that reaches the
  bunker pillar (a solid column) therefore detonates against it rather than
  skipping past, which is the interlock. Add a `drawShell` case and wire the new
  weapon key (`4`).
- `src/pages/[lang]/fun/tanks.astro`: the fourth weapon in the data-driven
  `weapons` array (auto-creates the button); update the keys hint to `1-4`.
- `src/i18n/translations.ts`: `fun.tanks.weaponBounce` and the updated `keys`
  string across en, es, cat.
- The CPU is left on its three weapons: `cpuPickWeapon` never returns `bounce`,
  because the CPU aims through the non-bouncing `simulateShot` and could not aim
  a skip. This is a deliberate, documented asymmetry (the Skipper is a
  player's-hands tactical option), not an oversight.

**Eval criteria (headless in `tests/games/tanks.test.ts`, plus a smoke).**

- `WEAPONS.bounce`, `WEAPON_IDS` and `freshAmmo` include the new weapon with the
  expected ammo.
- `bounceOffSurface` flips `vy` upward, scales both `|vy|` and `vx` by
  `restitution`, and lifts `y` above the surface (the pure math proof).
- Browser smoke: pick the Skipper on the bunker arena, fire a low shot, and
  confirm it skips off the dirt but detonates against the pillar, with no
  runtime error.

**Risk.** A skipping shot can trivialise cover if it can bounce around a pillar.
The solid-column check is the guard: the pillar stops a skip dead, so cover holds
against the very shot designed to defeat open ground. Balance the ammo and
restitution so the Skipper rewards a read of the terrain without dominating the
plain missile.

## Execution notes (2026-07-24)

Both goals landed, order G1 then G2, one commit each, full bar after each
(`lint + typecheck + build + test + check-links`; 585 to 590 tests over the
round). Both features are additive behind the new arena and weapon, so the four
Round 9 arenas and the three original weapons are untouched. The two interlock
as planned.

- **G1 — the bunker arena.** The fifth arena. `reshapeArena` handles bunker as
  an early special case (a flat pillar top at `0.34h` over the rolling base) and
  returns before the canyon/mesa/ridges blend, so nothing about the other
  arenas or the byte-identical hills path changed. The load-bearing new concept
  is a per-column solid mask: `arenaSolid` marks the pillar columns (and returns
  an all-false mask for every other arena), `bunkerColumns` is the single source
  both it and the reshape read so they cannot disagree, and `carveCrater` gained
  a `solid` parameter and skips those columns. `game.ts` rolls the mask beside
  the heightmap through one `rollTerrain` helper (the three roll sites all go
  through it, so `solid` never lags `ground`), passes it to `carveCrater`, and
  paints the solid columns in stone. Tests 585 to 588: the mask is exactly the
  central band, the pillar is a flat tall top with the base unchanged,
  `carveCrater` leaves a solid column standing while digging its neighbours, and
  the bunker joins the winnability sweep and passes (the CPU arcs over the
  pillar within 80px at both spawn separations). Browser smoke confirmed the
  stone pillar renders.
- **G2 — the Skipper.** A bouncing fourth weapon, tuned against the cover it has
  to respect. `bounceOffSurface` in `physics.ts` is the pure, unit-tested core
  (reflect the vertical velocity upward, bleed both components by a restitution,
  lift clear of the surface). In `stepShot` a ground impact bounces only when
  the shell has bounces left and the column is not solid; a solid column (the
  pillar) detonates it instead, which is the interlock, so the very shot built
  to skip around open ground is denied by cover. Bounces are bounded (two, each
  decrementing) so there is no runaway. The CPU is left on its three weapons
  because it aims through the non-bouncing `simulateShot`; `cpuPickWeapon` never
  returns bounce, a deliberate player's-hands asymmetry. The weapon is
  data-driven, so the button, the `1-4` number key and the ammo readout came for
  free. Tests 588 to 590: the bounce maths and the Skipper's arsenal entry
  (in `WEAPON_IDS` and `freshAmmo`, `bounces > 0`, lighter than the missile). A
  browser smoke fired a Skipper on the bunker arena end to end: it flew, bounced
  and detonated with no runtime error, and the four-weapon rack renders.

A subagent review confirmed every load-bearing invariant sound under static
analysis (pillar indestructibility, the arena/solid-mask agreement through the
shared `bunkerColumns`, the terrain/solid sync through the single `rollTerrain`,
the bounded two-bounce count, the pillar-stops-the-Skipper interlock, and the
untouched three original weapons and four original arenas) and found nothing to
block on. It raised one coverage note worth acting on: the interlock decision
lived entirely in `game.ts`'s `stepShot`, which the headless suite never
imports, so a future edit to that exact line would only be caught by a manual
replay. The fiddly half of it, the clamp-and-lookup into the solid mask, is now
a pure `isSolidColumn(solid, x, width)` in `terrain.ts` (rounding and clamping
exactly as `surfaceYAt` does, so the collision sample and the cover test can
never disagree at the pillar edge), and it is unit-tested: the pillar reads as
cover, open dirt does not, and an out-of-range x clamps into the field. Tests
590 to 591. The other note, that winnability is proven at the two spawn extremes
rather than exhaustively over the continuous range, the reviewer independently
judged a comfortable margin (max-power apex clears the `0.34h` pillar by
hundreds of pixels), so it stands as the deliberate sampled guard the plan
describes. Full bar green after the fix.
