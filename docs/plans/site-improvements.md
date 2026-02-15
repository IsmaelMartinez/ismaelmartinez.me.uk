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
