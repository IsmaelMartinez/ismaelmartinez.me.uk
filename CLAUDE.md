# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Architecture

This is a multilingual Astro static site with three supported locales: English (en), Spanish (es), and Catalan (cat). The site uses file-based routing with locale prefixes (all pages live under `/en/`, `/es/`, `/cat/`).

### Internationalisation

The i18n system centres on `src/i18n/translations.ts`, which exports the `useTranslations(lang)` function used throughout components. Every UI string is keyed in this file across all three locales. The `getLangFromUrl()` and `getLocalizedPath()` helpers handle routing between language versions.

Page routes mirror each locale directory: `src/pages/en/index.astro`, `src/pages/es/index.astro`, etc. The root `src/pages/index.astro` redirects to the default locale (`/en/`).

### Content

Static data (projects, links) lives in TypeScript files under `src/data/` with inline translations per object. Articles use Astro Content Collections in `src/content/articles/{locale}/` with MDX format. The schema is defined in `src/content/config.ts`.

Articles follow POSSE (Publish Own Site, Syndicate Elsewhere) strategy per ADR 001 in `docs/adr/`. Frontmatter includes `originalUrl` and `originalPlatform` to link back to syndicated copies on Medium/Dev.to.

### Layouts and Components

`src/layouts/Layout.astro` is the base layout with navigation, language switcher, and footer. `src/layouts/ArticleLayout.astro` handles article pages. Components in `src/components/` are shared across locales.

### Deployment

GitHub Actions workflow (`.github/workflows/gh-pages.yml`) builds and deploys to GitHub Pages on push to main. Output goes to `./dist`.

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
