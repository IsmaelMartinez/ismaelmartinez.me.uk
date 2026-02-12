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

## Up Next — High Impact

### RSS Feed (per-language)

The site follows POSSE but has no feed for subscribers.

- Install `@astrojs/rss`
- Create `src/pages/{en,es,cat}/rss.xml.ts` endpoints
- Add `<link rel="alternate" type="application/rss+xml">` to `Layout.astro`
- Add RSS link to footer or connect page

### Accessibility Fixes

Semantic HTML is solid, but WCAG 2.1 AA basics are missing.

- Skip-to-content link (visually hidden, shown on focus)
- `aria-label` on nav, language switcher
- `aria-current="page"` on active nav link
- Escape key handler to close Konami overlay
- `role="dialog"` + `aria-modal="true"` on Konami overlay

### hreflang Tags

Search engines need these to understand `/en/`, `/es/`, `/cat/` are translations of each other.

- Add `<link rel="alternate" hreflang="...">` for each locale in `Layout.astro`
- Add `hreflang="x-default"` pointing to English

### Custom 404 Page

Dead links currently show a generic page with no navigation back.

- Create `src/pages/404.astro` with links to all three locales

## Nice Touches — Lower Priority

### View Transitions

Astro has built-in support. Near zero-config, adds smooth page navigation.

### Article Reading Time

Utility function dividing word count by 200. Display next to publish date.

### Print Stylesheet

`@media print` block in `global.css` — hide nav/footer, clean typography, show URLs.

### JSON-LD Structured Data

`Person` schema on homepage, `Article` schema on article pages. Helps rich results in search.

### Dark/Light Mode Toggle

Currently system-preference only. Add a manual toggle stored in `localStorage`.

### /uses Page

Tools, hardware, software stack. Common on developer sites, good for SEO.
