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
