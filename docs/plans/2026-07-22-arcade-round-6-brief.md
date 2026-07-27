# Arcade Round 6 — Owner's Brief (input to a planning session)

Date: 2026-07-22
Status: **Brief — not yet planned.** The 2026-07-21 ranked plan closed with
Round 5 and called for a fresh audit before further arcade work. This brief
**is** that next step, owner-directed rather than audit-directed: three
cabinets the owner has played and found short of the vision, plus one
cross-cutting decision. A fresh planning session turns this into the Round 6
plan; execution is then delegated goal-by-goal.

## How to use this document

This is the **input prompt** for a planning session, structured so the work
can be split across sessions/agents afterwards:

1. **Plan first.** Read this brief end-to-end, then the referenced code and
   docs (`CLAUDE.md` arcade section; `docs/plans/2026-07-21-arcade-improvement-round-1.md`
   for the audit + how Rounds 1–5 ran; `docs/plans/2026-07-19-arcade-art-definition.md`
   for the art bar). Write the Round 6 plan into a new
   `docs/plans/2026-07-XX-arcade-round-6-plan.md`, expanding each goal below
   into concrete changes, keeping each goal **independently executable**.
2. **Goals carry their evals.** Every goal ships with its evaluation criteria
   (below, refined in the plan). An execution session picks up ONE goal, meets
   its eval, passes the repo bar, and stops. That is the delegation contract.
3. **Confirm before building where flagged.** Art direction (G1, G2, G5) and
   the trimming shortlist (G7) are owner-taste calls: present options/mocks
   and get sign-off before the expensive work.
4. **The repo bar applies to every commit** (unchanged from Rounds 1–5):
   `npm run lint && npm run typecheck && npm run build && npm test && npm run check-links`,
   plus: screenshot before/after pairs for any draw-code change
   (`scripts/screenshot-games.js`), headless proofs for any balance/content
   claim, i18n keys ×3 locales, tracking-doc execution notes, one PR per
   round (or per goal if sessions run separately — planner's call).

## The vision, per cabinet

### Syndicate — make it feel like Syndicate Wars

**Owner's words (distilled):** the characters should be much bigger — "almost
3D, but as a 2D game that looks 3D". The reference is **Syndicate Wars**
(Bullfrog, 1996). And the campaign needs more levels.

**Reference research** (for the art-direction conversation):
- Syndicate Wars renders gritty cyberpunk cities in the Blade Runner mould:
  dark, oppressive building textures with **huge glowing ad screens/signage**;
  soft techno mood; rotatable pseudo-3D views.
- Agents are **large, distinct figures in trench coats** — silhouette-first
  design: coat swing, stance, and carried weapon readable at a glance.
- Sources: [Wikipedia — Syndicate Wars](https://en.wikipedia.org/wiki/Syndicate_Wars),
  [Bullfrog wiki — Syndicate series](https://bullfrogproductions.fandom.com/wiki/Syndicate_(Series)),
  [GamesNostalgia — Syndicate Wars](https://gamesnostalgia.com/game/syndicate-wars).

**Where the cabinet is today:** units are ~10 px figures (`drawUnit`,
`src/games/syndicate/game.ts:640` — 1.6 px leg strokes, 4.5 px shadow); the
city is mid-grey blocks with window dots. The scale gap, not the idiom, is
the problem — the iso engine already gives the 2.5D look.

- **G1 — Big characters (art pass, screenshot-verified).** Redraw units at
  roughly **1.5–2× current scale** with Syndicate-Wars silhouettes: coat,
  stance, visible weapon; agents/enemies/guards/civilians/target each
  readable by shape, not just tint. Consider whether the camera (`VIEW` tile
  size) also steps up — a taller unit on the same tiny tile may look wrong;
  prototype both and screenshot-compare. Pointer/selection math must stay on
  `toLogical` + existing hit radii (adjusted deliberately, not incidentally).
  - **Eval:** before/after screenshot pairs (extend `screenshot-games.js`
    with a syndicate scenario if not present); owner signs off the direction
    from 2–3 mock variants BEFORE the full pass; all existing headless tests
    green (no sim/logic change); boot smoke with no JS errors.
- **G2 — City mood pass (art, screenshot-verified).** Darken the palette
  toward the Blade-Runner reference and add **neon signage / ad-screen
  accents** on tall buildings (blink/hash idioms from the engine — `blink`,
  `hash01` — not per-frame rebuilt content; static parts baked via
  `createStaticLayer`).
  - **Eval:** screenshot pairs; frame-time spot-check (no regression on the
    already-heaviest sweep); owner sign-off on direction first.
- **G3 — More missions.** Extend the campaign past 7 (suggest 9–10), using
  all four objective moulds (including Round 5's `secure`); consider a second
  `secure` variant and heavier rosters rather than new mechanics.
  - **Eval:** the existing pattern — roster/spawn-integrity tests extend
    automatically; add per-mission winnability probes (`missionStatus`
    reachability) and rising-reward assertions; i18n ×3.

### Critter Rescue — fix the difficulty curve's ordering

**Owner's words (distilled):** early cadence is right, but around **level 10
the difficulty spikes to near-impossible**; that level belongs near the end.

**Where the cabinet is today:** level 10 "Across the Gorge"
(`src/games/lemmings/levels.ts`) demands a two-builder bridge relay — the
second builder must take over at the first bridge's tip, a timing-sensitive
trick — while levels 14 and 19 later in the set are deliberate breathers.
The *content* is good; the *sequence* is wrong.

- **G4 — Resequence the 25 levels.** Re-order `LEVELS` so perceived
  difficulty climbs smoothly with deliberate breathers; the gorge relay (and
  any other timing-sensitive spikes the planner identifies — candidates: 13's
  grand tour) move into the late game. Renumber hint keys to match new
  positions (`hint7`…`hint25` are position-named), keep hints on levels ≥7
  only, and update the index-pinned tests.
  - **Feasibility (verified):** progress storage is a single
    highest-level-cleared count (`progress.ts`) — order-independent, no
    migration needed. Hints travel with the level object; the page
    auto-generates `data-t-hint<i>` from `LEVELS`.
  - **Eval:** every level's headless `playLevel` solvability proof passes in
    the new order (strategies move with their levels); a new test pins the
    intended difficulty arc (e.g. an authored `difficultyRank` or the
    planner's chosen proxy — stock tightness × mechanics count — is
    non-decreasing within acts, breathers exempted); locale-parity guard
    still green. The plan states the full old→new order with a one-line
    rationale per move.

### Line Hold — tower art and a real difficulty ramp

**Owner's words (distilled):** tower detail is "not that great" — aim for
**Command & Conquer-level** sprite detail. And it isn't hard enough: the
difficulty dynamics are off; it should get properly harder.

**Where the cabinet is today:** towers are a stone plinth + coloured block +
small topper (`drawTower`, `src/games/towerdefense/game.ts:552`); the audit
itself proved the difficulty flatline — the reference layout clears **all 18
waves at 20/20 lives, zero leaks** (`towerdefense.test.ts`), and `hpScale` is
a gentle linear `1 + 0.14·wave`.

- **G5 — Tower art to the C&C bar (art pass, screenshot-verified).**
  Structure-first turrets: distinct silhouettes per kind and level (bolt /
  blast / frost × upgrade tiers), rotating/aiming heads where sensible,
  muzzle/recoil animation on fire, grounded bases — within the engine's
  existing idioms (baked static layers, `blockFaceCorners`/`faceBandPath`
  where they fit). Enemy sprites may join the pass if the contrast with new
  towers demands it (planner's call — flag it).
  - **Eval:** before/after pairs from the harness (add a Line Hold scenario
    if missing); owner signs off direction from 2–3 tower-sheet mocks first;
    headless tests untouched (no logic change); boot smoke clean.
- **G6 — Difficulty rework: no perfect runs.** Retune waves/economy/enemy
  scaling so escalation is felt every run. Target state, provable through the
  existing `playRun` harness:
  1. the **best-known layout finishes the 18-wave campaign with lives lost**
     (never 20/20);
  2. a **decent static layout** (build once, never adapt) **dies before wave
     18**;
  3. a **naive layout dies by mid-campaign**;
  4. the campaign stays **winnable** (criterion 1's layout survives), and the
     endless tail keeps escalating past it.
  - Levers are the planner's choice (steeper/nonlinear `hpScale`, wave
    composition, spawn pacing, bounty/interest tightening, leak pressure) —
    but the eval above is the contract. Iterate against the harness exactly
    as Round 1 did.
  - **Eval:** all four criteria encoded as headless tests; existing
    endless-tail determinism tests updated, not deleted; scoreboard
    conventions untouched.

## Cross-cutting

- **G7 — Focus the floor (decision item, owner approves).** The owner is
  open to "trimming down" the nine cabinets to focus on a few. The planner
  audits play-worthiness (depth, polish, distinctiveness — the Round 1 audit
  is the baseline) and proposes a shortlist: which cabinets get featured
  (front shelf), which move to a back-catalogue shelf, which (if any) retire
  Poo-Poo-Land-style (data preserved). **No cabinet is demoted or retired
  without explicit owner sign-off on the named list.** Execution (index-page
  regrouping, i18n, link-check fallout) is cheap once decided.

## Suggested goal → session mapping

| Goal | Cabinet | Kind | Owner gate | Est. sessions |
|---|---|---|---|---|
| G1 big characters | Syndicate | Art (screenshots) | Direction mocks | 1 |
| G2 city mood | Syndicate | Art (screenshots) | Direction mocks | 1 (can pair with G1) |
| G3 more missions | Syndicate | Content (headless) | — | 0.5 |
| G4 level resequence | Critter Rescue | Content (headless) | Order sign-off in plan | 0.5–1 |
| G5 tower art | Line Hold | Art (screenshots) | Direction mocks | 1 |
| G6 difficulty | Line Hold | Balance (headless) | — | 1 |
| G7 focus shortlist | All | Decision + small change | **Required** | 0.5 |

Planner may re-bundle (e.g. G1+G2 one session, G3 folded into G1's PR), but
each goal's eval stays separately checkable so parallel delegation works.

## Kickoff prompt (paste into the fresh planning session)

> Arcade Round 6 — planning. Read `docs/plans/2026-07-22-arcade-round-6-brief.md`
> and the docs/code it references. Produce `docs/plans/<today>-arcade-round-6-plan.md`
> turning the brief's goals G1–G7 into a concrete plan: per goal, the exact
> changes (files, approach), the eval criteria as testable statements, risks,
> and a session-by-session execution order. Where the brief flags an owner
> gate (G1/G2/G5 art direction, G4 level order, G7 shortlist), prepare the
> options/mocks needed for sign-off and ask before building. Then execute the
> goals in the agreed order — one commit per goal, full verification bar after
> each, screenshot pairs for draw changes, headless proofs for balance/content
> — updating the plan's execution notes as you go. Open a PR when the round
> (or the agreed slice of it) is complete.
