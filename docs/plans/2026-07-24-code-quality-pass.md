# Code quality pass (2026-07-24)

## Why this exists

The site is public and the owner wants the code to read as principal-engineer quality: no dead code, no over-engineering, no silliness, and a public face (accessibility, localisation, SEO) that matches the care in the game logic. This document records a full-codebase review and the concrete, verifiable work that came out of it.

## How the review was run

Five independent read-only reviews ran in parallel, each on a disjoint slice, each told to respect the repo's anti-over-engineering philosophy (the goal is to remove complexity, never add clever abstractions) and to report nothing it could not confirm in the actual code. The slices were: simplification and over-engineering across the arcade engine and all eight games; correctness and resource-leak hunting across the same; public-site quality (accessibility, SEO, i18n integrity, CSS) on everything outside the game logic; conformance of the eight games to the documented shared-engine contracts; and the test suite, tooling, config, CI, and docs. Every finding below was re-verified against the code before being accepted.

## Headline verdict

The codebase is already strong. The correctness review found no bugs above its confidence bar; the audio split-mute, its one-time legacy migration, the `astro:before-swap` teardown, and the hi-DPI `toLogical()` pointer contract are all correct in every cabinet. The architecture audit found the eight games remarkably conformant to their documented contracts. The simplification sweep called the codebase exceptionally clean and its findings polish rather than silliness. So this is a polishing pass, not a rescue. The value is in removing the last dead code, deduplicating a few copied helpers, closing real localisation and accessibility gaps on the public pages, and correcting drifted documentation.

## Status

All tasks A through J were applied in this pass and are green on the full bar (lint, typecheck, build, test, check-links). Task J (the ESLint recommended ruleset) settled cleanly: enabling it surfaced exactly one issue, Astro's generated `src/env.d.ts` triple-slash reference, handled with a one-line scoped override, and the rest of the codebase already satisfies the ruleset. The items under "Flagged for the owner" were deliberately not applied and await a decision.

## Tasks to apply

These are low-risk, high-confidence changes. Each is covered by existing tests or a named verification. They are grouped by theme so the diff reads as a coherent sweep.

### A. Remove dead code from the arcade

`drawRamp` in `src/games/engine/iso.ts` is exported through the engine index and called by nothing (its own JSDoc admits it lost its call site). Three lemmings helpers are exported and unit-tested but never called by the game: `exitArrowVector` (`hud.ts`), `comboAlive` (`score.ts`), and `isLevelUnlocked` (`progress.ts`). `cascadeGravity` in `cascade/well.ts` is the instant-fixpoint form of a settle that the game only ever runs incrementally through `settleStep`; it is referenced only by its own test. Each of these is genuinely unused production surface, exactly the speculative API the repo philosophy forbids. Delete each function, its engine export where present, and its now-orphaned test.

Verify: `npm run typecheck && npm test` green with the deleted tests removed; `grep -rn` shows zero remaining references to each removed name.

### B. Deduplicate the copied `clamp`

The three-argument `clamp(value, min, max)` is copied byte-identically in five places (`city/simulation.ts`, `park/economy.ts`, `tanks/ai.ts`, `tanks/terrain.ts`, `tanks/game.ts`). The repo's own precedent (the comment on `hash01`) extracts a shared helper at the third copy; this is at five. Add one `clamp` to the engine alongside `hash01` in `canvas.ts`, export it, and import it at the five sites. The unrelated one-argument `clamp` in `lemmings/game.ts` (a fixed 0 to 255 channel clamp) is a different function and stays. Also fold the two three-times-repeated blocks in Syndicate into local closures: the guard-ring placement in `missions.ts` `spawnMission` and the auto-fire block in `sim.ts` `stepWorld`.

Verify: `npm test` green (existing game tests exercise all five clamp sites and the Syndicate sim/missions); behaviour is unchanged.

### C. Drop the superseded audio shim and harden the scheduler

Every cabinet now passes `tracks:` to `createGameAudio`. The legacy single-voice `melody`/`wave` options on `GameAudioOptions` and their fallback in `normalizeTracks` are exercised only by the audio test. Remove them and update the test to build a one-element `tracks` array. Separately, `scheduleAhead` already guards a zero or non-finite tempo but not a per-note `beats: 0`, which would make a cursor never advance and spin the lookahead loop; add the one-line `dur <= 0` guard so the file's careful defensiveness is complete. No track data hits this today, so it is hardening, not a live fix.

Verify: `npm test` (audio suite) green; the multi-voice, mute, migration, teardown, and tempo-clamp tests still pass.

### D. Close the localisation gaps on the public pages

Several strings break the trilingual promise. The Writing page hardcodes two English blurbs that render untranslated on the Spanish and Catalan pages. `ProjectCard` hardcodes "View on GitHub" even though a `common.viewOnGithub` key already exists in all three locales. The index, connect, projects, and writing pages pass English literal `<title>`s and no `description`, so their tab titles and social meta read English on es and cat while the visible heading is localised; the about, health, and tags pages already do this correctly and are the model. The three non-brand game pages (Snake, Tank Duel, Critter Rescue) pass an English `<Layout title>` that mismatches their localised heading. Fix each to route through `useTranslations`, adding the two writing-blurb keys. Then delete the fourteen translation-key families that are referenced nowhere in code (two retired mini-games, `fun.excuse.*` and `fun.trivia.*`, plus stragglers like `hero.greeting`, `common.readMore`, `article.noArticles`, `fun.title`, `fun.subtitle`, `fun.lemmings.needed`, and five `health.*` keys), keeping `common.viewOnGithub` since it is now used.

Verify: `npm test` (i18n parity test) green with equal key counts across the three locales; `grep` confirms the removed keys have zero code references and the newly-used keys resolve; a build renders es/cat Writing and card pages with no English leak.

### E. Fix the accessibility gaps on the arcade shell

The arcade landing page opens with an `<h2>` shelf sign and no `<h1>` (the neon "ISMAEL'S ARCADE" sign is two spans); every other page has a proper first heading. Promote the neon sign to an `<h1>` with no visual change. The arcade's continuous neon flicker, grid scroll, blink, and marquee animations run with no reduced-motion guard, which is a photosensitivity and vestibular concern on the flagship page, and global smooth-scroll is likewise ungated. Add one authoritative `@media (prefers-reduced-motion: reduce)` reset to `global.css` that neutralises animation, transition, and scroll-behaviour site-wide; this matches the repo's existing motion-gating idiom and closes both the arcade-animation and scroll-behaviour findings in one place.

Verify: `npm run build && npm run check-links` green; the arcade page has exactly one `<h1>`; with reduced-motion set, the flicker and blink stop.

### F. Correct small SEO and config facts

The RSS feed emits `<language>cat</language>` for Catalan, which is not the ISO code readers expect (`ca`); map it. The sitemap integration is called with no options, so it omits the alternate-language annotations the site's hreflang tags already declare; pass the i18n config. And `@typescript-eslint/parser` is a redundant direct devDependency (provided transitively by `typescript-eslint`); remove it.

Verify: `npm run build` green; the generated Catalan feed shows `ca`; the sitemap carries alternate links; `npm run lint` still resolves after the dep removal.

### G. Delete two unused files

`src/components/Sparkline.astro` is imported nowhere. `src/data/fun.ts` (`funActivities`, a single snake entry) is imported nowhere; the arcade catalogue lives inline in `fun/index.astro`. Delete both and drop the `data/fun` mention from the CLAUDE.md Content section.

Verify: `npm run build && npm test` green; `grep` shows zero references to either.

### H. Correct drifted documentation

The CLAUDE.md Testing and CI section claims a Lighthouse CI step that does not exist and undersells the test suite; the Deployment section calls the deploy cron daily when it runs every six hours; and the scoring-conventions paragraph says the `bank()`-driven record toast is "applied across every cabinet" and lists Critter Rescue among the `bank()` games, when only five cabinets fire it and Critter Rescue uses `stash()`. Correct these three statements to match the code.

Verify: each corrected statement matches `ci.yml`, `gh-pages.yml`, and the actual per-cabinet scoreboard calls.

### I. Extract the duplicated sound-toggle markup

The fourteen-line music and effects toggle block is byte-identical in all eight game page headers, the same shared-markup pattern the repo already factors out into `HighScoreTable` and `ArcadeCabinet`. Extract a `SoundToggles.astro` component taking `lang`, render it in each header, and add the one missing `type="button"` while consolidating. The `.sound-btn` CSS and `wireChannelButton` wiring (which already sets `aria-pressed` and `aria-label`) are unchanged.

Verify: `npm run build && npm test` green; all eight pages still expose `#music-btn` and `#sfx-btn`; the eight headers now render one component.

### J. ESLint recommended ruleset (measure first, then decide)

`eslint.config.js` spreads `tseslint.configs.recommended[0]`, which is only the parser and plugin base; none of the typescript-eslint recommended rules actually run, so lint reads stricter than it executes. The fix is to spread the whole `tseslint.configs.recommended` array. This may surface real lint errors (the tests use non-null assertions heavily, which `no-non-null-assertion` would flag). Apply the config change in isolation, run `npm run lint`, and measure the fallout: if it is a small number of clear fixes, make them; if a rule fights this codebase's deliberate style at scale, disable that specific rule with a one-line documented rationale rather than churning many files. Only land this if it settles cleanly; otherwise leave it flagged below.

Verify: `npm run lint` green with the full recommended set applied (or with named, justified rule overrides).

## Flagged for the owner (not applied)

These need a decision or carry enough risk or subjectivity that applying them unilaterally would be wrong.

The article canonical link points at the external syndicated copy (`canonical={originalUrl}` in `ArticleLayout.astro`), which tells search engines the Medium or Dev.to copy is authoritative and cedes ranking authority away from this site. The POSSE strategy in the docs says this site is primary, which contradicts the code. If POSSE-first is intended, canonical should default to the self URL and the "originally published on" line stays as a visible credit only. This materially affects SEO, so it is the owner's call, not a blind flip.

The `fun.tanks.weaponBounce` label is "Skipper" in English but still "Rebote" / "Rebot" (literally "bounce") in Spanish and Catalan after the Round 10 rename. Whether "Skipper" is a proper name to keep across locales or a descriptive term to localise consistently is a naming decision.

Critter Rescue is the one long-run cabinet that persists its score through `stash()` rather than the `beginRun()`/`bank()` run-record API, so it cannot surface the mid-run "new record" toast the other five fire; it has no toaster area at all. Either route it through the run-record API and add a toaster (a small user-facing behaviour change, better consistency) or keep the overlay-driven UX and document the exception in code the way Snake documents its own. Tank Duel similarly never surfaces the device best in a HUD during play; being match-based, a running best is less natural, so either add a small best readout or document the omission.

The tsconfig extends `astro/tsconfigs/strict` rather than `strictest` and omits `noUncheckedIndexedAccess`, which is exactly the guard that catches flat-array indexing bugs (`grid[y*w+x]`), of which this codebase has many. Enabling it would surface a large number of new errors across the game modules and is a real time cost; reasonable to accept as-is for a personal site, but flagged as the one place stricter typing would genuinely add safety.

The CLAUDE.md arcade section has grown into a single ~9,400-character run-on paragraph accreted round by round. Every fact in it is correct and load-bearing, but it is no longer readable or maintainable. Restructuring it into a few prose subsections (engine contracts, render and caching rules, the cabinet inventory, and a compact round history) without dropping any information would be a real maintainability win, but it edits the owner's own instructions file, so it should be done only with a nod.

## End-to-end verification

`npm run lint && npm run typecheck && npm run build && npm test && npm run check-links` all green, plus a manual pass confirming the es and cat pages carry no English leak and the reduced-motion preference stops the arcade animations.
