# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production (output in ./dist)
npm run preview      # Preview production build
npm run lint         # ESLint across the repo
npm run typecheck    # Astro + TypeScript check
npm test             # Run Vitest suite (build tests require ./dist to exist)
npm run check-links  # Validate internal links in ./dist (run after build)
```

## Architecture

This is a multilingual Astro static site with three supported locales: English (en), Spanish (es), and Catalan (cat). The site uses file-based routing with locale prefixes (all pages live under `/en/`, `/es/`, `/cat/`).

### Internationalisation

The i18n system centres on `src/i18n/translations.ts`, which exports the `useTranslations(lang)` function used throughout components. Every UI string is keyed in this file across all three locales. The `getLangFromUrl()` and `getLocalizedPath()` helpers handle routing between language versions.

Pages are defined once under `src/pages/[lang]/…` as dynamic routes that use `getStaticPaths()` to emit `/en/`, `/es/`, and `/cat/` variants (see `docs/plans/2026-02-15-phase4-security-maintainability-design.md` for the deduplication rationale). The root `src/pages/index.astro` redirects to the default locale (`/en/`), and `src/pages/404.astro` is the shared 404.

### Content

Static data (projects, links, health, fun) lives in TypeScript files under `src/data/` with inline translations per object. Articles use Astro Content Collections in `src/content/articles/{locale}/` with MDX format. The schema is defined in `src/content.config.ts` (Astro 6's top-level content config location).

Articles follow POSSE (Publish Own Site, Syndicate Elsewhere) strategy per ADR 001 in `docs/adr/`. Frontmatter includes `originalUrl` and `originalPlatform` to link back to syndicated copies on Medium/Dev.to.

### Arcade games

Arcade pages live under `src/pages/[lang]/fun/`. Newer games (Tank Duel, Pixel Park, Microcity) split pure game logic into DOM-free TypeScript modules under `src/games/<game>/` (unit-tested in `tests/games/`) with a single `init<Game>()` entry the page calls; shared utilities (fixed-timestep loop, hi-DPI canvas setup (`canvas.ts` — DPR-scaled backing store with a logical-coordinate contract; pointer math must use its `toLogical()`, never `canvas.width`), per-device top-10 high-score tables with arcade initials entry (`highscores.ts` + `scoreboard.ts` + `src/components/HighScoreTable.astro`), grid helpers, isometric renderer) live in `src/games/engine/`. Render loops must not rebuild static full-canvas content (starfields, checkerboards, vignettes) per frame: bake it with `createStaticLayer` in `canvas.ts`, rebuilt via `setupHiDpiCanvas`'s `onApply` (its JSDoc carries the device-pixel alignment contract). The one exception is a full-canvas gradient fill that doubles as the frame clear (the sims' skies), which keeps a hoisted `CanvasGradient` instead. Static labels render server-side via `useTranslations`; runtime-composed strings pass through `data-t-*` attributes on the game root. New games register a cabinet in `src/pages/[lang]/fun/index.astro`. The design for the next game (Lemmings) is in `docs/plans/2026-06-10-arcade-expansion-design.md`.

Scoring conventions, applied across every cabinet: each game keeps a per-device top-10 through `initScoreboard`; games whose runs can be long (Microcity, Pixel Park, Syndicate, Critter Rescue, Poo Poo Land) `stash()` the run's best as it grows so a closed tab never loses a record; every point gain is announced on screen the moment it lands (canvas floaters/score popups); the number a finished run submits to the table is shown to the player rather than computed silently (e.g. Tank Duel's match score, Critter Rescue's bonus breakdown); and beating the device record mid-run earns a one-time toast in the sims.

### Layouts and Components

`src/layouts/Layout.astro` is the base layout with navigation, language switcher, and footer. `src/layouts/ArticleLayout.astro` handles article pages. Components in `src/components/` are shared across locales.

### Testing & CI

Vitest tests live under `tests/` (unit tests for i18n and reading-time, plus `tests/build/output.test.ts` which reads files from `./dist` and is skipped unless a build has been produced). The link checker in `scripts/check-links.js` walks built HTML in `./dist/` and verifies internal hrefs resolve to real files. CI (`.github/workflows/ci.yml`) runs lint, typecheck, build, tests, link check, and Lighthouse CI on pushes to `main`/`develop` and PRs to `main`.

### Deployment

The deploy workflow (`.github/workflows/gh-pages.yml`) runs after a successful CI on `main` (and on a daily cron) to build and publish to GitHub Pages. Output goes to `./dist`. A `vercel.json` also exists as a fallback/mirror configuration.

## Repo Butler

This repo is monitored by [Repo Butler](https://github.com/IsmaelMartinez/repo-butler), a portfolio health agent that observes repo health daily and generates dashboards, governance proposals, and tier classifications.

**Your report:** https://ismaelmartinez.github.io/repo-butler/ismaelmartinez.me.uk.html
**Portfolio dashboard:** https://ismaelmartinez.github.io/repo-butler/
**Consumer guide:** https://github.com/IsmaelMartinez/repo-butler/blob/main/docs/consumer-guide.md

### Querying Reginald (the butler MCP server)

To query your repo's health tier, governance findings, and portfolio data from any Claude Code session, add the MCP server once (adjust the path to your local repo-butler checkout):

```bash
claude mcp add repo-butler node /path/to/repo-butler/src/mcp.js
```

Available tools: `get_health_tier`, `get_campaign_status`, `query_portfolio`, `get_snapshot_diff`, `get_governance_findings`, `trigger_refresh`.

When working on health improvements, check the per-repo report for the current tier checklist and use the consumer guide for fix instructions.

If this repo deploys a page, set its GitHub repository Homepage URL (the Website field in the repo's About section — not `package.json`'s `homepage`) to the canonical URL. That's how repo-butler surfaces the deployed link in dashboards and agent cards.
