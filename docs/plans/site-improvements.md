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
