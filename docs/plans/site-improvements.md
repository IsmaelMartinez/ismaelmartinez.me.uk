# Site Improvements Plan

**Date:** 2026-02-12

A prioritised list of improvements identified during a site review. Grouped by impact and effort.

## Completed

- [x] Rewrite CONTRIBUTING.md (was still referencing Hugo)
- [x] Add `@astrojs/sitemap` for automatic sitemap generation
- [x] Add `robots.txt` pointing to sitemap
- [x] Add Open Graph and Twitter Card meta tags to all pages
- [x] Add canonical URLs to all pages
- [x] Remove stale Hugo theme reference from `renovate.json`
- [x] RSS Feed — per-language `rss.xml.ts` endpoints, `<link>` tag in head, RSS link in footer
- [x] Accessibility — skip-to-content link, `aria-label` on nav & language switcher, `aria-current="page"` on active nav links, Escape key to close Konami overlay, `role="dialog"` + `aria-modal` on Konami overlay
- [x] hreflang tags — `<link rel="alternate" hreflang="...">` for each locale + `x-default`
- [x] Custom 404 page — `src/pages/404.astro` with links to all three locales
- [x] View Transitions — Astro `<ViewTransitions />` for smooth page navigation, `astro:after-swap` for state persistence
- [x] Article Reading Time — `src/utils/reading-time.ts` utility (word count ÷ 200), displayed next to publish date in article header
- [x] Print Stylesheet — `@media print` block in `global.css` hiding nav/footer, clean typography, showing URLs after links
- [x] JSON-LD Structured Data — `Person` schema on all homepage locales, `Article` schema on article pages
- [x] Dark/Light Mode Toggle — manual toggle button in nav with `localStorage` persistence, `data-theme` attribute, FOUC prevention script
- [x] /uses Page — tech stack showcase at `/en/uses`, `/es/uses`, `/cat/uses` with categorised tools, hardware, and software

## Phase 3

- [x] Mobile Hamburger Menu — hamburger toggle on screens ≤600px, replacing wrapping nav links. Keyboard accessible (Escape to close), language switcher and theme toggle remain visible
- [x] Tag Pages — dynamic `/[lang]/tags/[tag]` routes listing articles by tag, `/[lang]/tags/` index with all tags and article counts, clickable tags in ArticleCard and ArticleLayout
- [x] Article Table of Contents — auto-generated from h2/h3 headings, sticky sidebar on desktop (≥1100px), collapsible section on mobile, anchor IDs and smooth scroll
- [x] Reading Progress Bar — fixed 3px bar at top of article pages filling as reader scrolls, themed via CSS custom properties, hidden on non-article pages
- [x] Related Articles — 2–3 related articles at bottom of each article based on shared tags, falls back to most recent, uses existing ArticleCard component
- [x] About Page — `/[lang]/about` pages with bio, career highlights, and interests. Added to main navigation between Home and Projects. Includes JSON-LD Person schema with extended properties (description, knowsAbout, alumniOf)

## Phase 4

- [x] Node.js 24 LTS — `.nvmrc` and CI workflows updated from Node 20 to Node 24
- [x] Security Hardening — CSP meta tag, SRI on analytics script, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, consistent `rel="noopener noreferrer"`, DOM API cleanup in quiz
- [x] Page Deduplication — replaced 39 per-locale page files with 13 dynamic `[lang]` routes using `getStaticPaths()`
- [x] Test Foundation — vitest 4, unit tests for reading-time and translations, build output integration tests
- [x] Improved Link Checker — verifies internal links resolve to actual files in dist/
- [x] Lighthouse CI — automated performance, accessibility, and best-practices audits in CI pipeline
- [x] Astro 6 + MDX 5 — migrated content collections to glob() loader, ViewTransitions → ClientRouter, Zod 4 compatibility, i18n redirectToDefaultLocale fix

## Phase 5

- [ ] TypeScript 6 — upgrade from TS 5.9 to 6.x once `@astrojs/check` adds TS 6 peer support (currently pinned to `^5.0.0`)
- [x] Zod 4 deprecation cleanup — replaced `.passthrough()` with `z.looseObject()` in `src/data/health.ts` (content.config.ts did not use it)
- [ ] Replace or remove `@lhci/cli` — Lighthouse CI pulls vulnerable transitive deps (`tmp`, `inquirer`, `yaml`); evaluate lighter alternatives (e.g. `unlighthouse`, native Lighthouse CLI) to clear the remaining 9 low/moderate vulnerabilities
- [ ] Publish draft articles — review and publish articles currently marked `draft: true` (e.g. AI-assisted open source maintenance)
- [ ] Triage issue #8 — "Blog is down" report from July 2025; confirm resolved or investigate deployment
