# ADR 002: Site Improvements Plan

**Date:** 2026-02-12

**Status:** Proposed

## Context

After a thorough review of the site, several improvements were identified across SEO, accessibility, user experience, and personal touches. Tier 1 (broken/stale items) has been implemented. This ADR documents the plan for the remaining improvements.

## Tier 2 — Meaningful Improvements

### 2.1 RSS Feed (per-language)

**Why:** The site follows POSSE but has no feed. Readers can't subscribe.

**How:**
- Install `@astrojs/rss`
- Create `src/pages/en/rss.xml.ts`, `src/pages/es/rss.xml.ts`, `src/pages/cat/rss.xml.ts`
- Each endpoint queries its locale's articles from the content collection, sorted by `publishedDate` descending
- Add `<link rel="alternate" type="application/rss+xml">` to `Layout.astro` `<head>` pointing to the current locale's feed
- Add RSS link to the footer or connect page

**Effort:** Small

### 2.2 Accessibility Fixes

**Why:** The site uses semantic HTML but misses several WCAG 2.1 AA basics.

**How:**
- Add a skip-to-content link as the first focusable element in `Layout.astro` (visually hidden, shown on focus)
- Add `aria-label="Main navigation"` to the `<nav>` element
- Add `aria-label="Language switcher"` to the `.lang-switcher` div
- Add `aria-current="page"` to the active nav link by comparing `currentPath`
- Add `role="dialog"` and `aria-modal="true"` to the Konami overlay
- Add escape key handler to close the Konami overlay
- Add `aria-label` to the language version links in `ArticleLayout.astro`

**Effort:** Small

### 2.3 Article Reading Time

**Why:** Sets reader expectations. Standard on developer blogs.

**How:**
- Create a utility function `getReadingTime(content: string)` that divides word count by 200 (average reading speed)
- Call it in the article `[...slug].astro` pages, passing the raw MDX body
- Display in `ArticleLayout.astro` next to the publish date (e.g. "5 min read")
- Add translation keys for the reading time label

**Effort:** Small

### 2.4 Custom 404 Page

**Why:** Dead links currently show a generic page with no navigation.

**How:**
- Create `src/pages/404.astro` that uses the base `Layout` component
- Show a friendly message with links back to the homepage in all three languages
- Lean into the site's personality (maybe a playful message or tie-in with the arcade theme)

**Effort:** Small

### 2.5 Canonical URLs for Language Alternates

**Why:** Search engines need `hreflang` tags to understand the relationship between `/en/projects`, `/es/projects`, and `/cat/projects`.

**How:**
- In `Layout.astro`, add `<link rel="alternate" hreflang="en" href="...">` for each locale variant of the current page
- Use `getLocalizedPath()` to generate the URLs
- Add `hreflang="x-default"` pointing to the English version

**Effort:** Small

## Tier 3 — Nice Personal Touches

### 3.1 View Transitions

**Why:** Smooth page-to-page animations complement the site's personality (easter eggs, arcade). Makes it feel like an app rather than a set of static pages.

**How:**
- Import `ViewTransitions` from `astro:transitions` in `Layout.astro`
- Add `<ViewTransitions />` to the `<head>`
- Optionally add `transition:name` attributes to elements that should animate between pages (e.g. the nav logo, article titles)
- Test that the Konami code and localStorage state still work correctly with client-side navigation

**Effort:** Small (Astro makes this nearly zero-config)

### 3.2 Print Stylesheet

**Why:** Articles should look clean when printed or saved as PDF.

**How:**
- Add a `@media print` block to `global.css`
- Hide nav, footer, language switcher, Konami overlay
- Set background to white, text to black
- Remove decorative borders and shadows
- Show URLs next to links (`a[href]::after { content: " (" attr(href) ")"; }`)

**Effort:** Tiny

### 3.3 JSON-LD Structured Data

**Why:** Helps search engines display rich results (author cards, article snippets with dates).

**How:**
- Add a `Person` JSON-LD block to the homepage (`type: "Person"`, name, url, sameAs with GitHub/LinkedIn/Medium/Dev.to links)
- Add an `Article` JSON-LD block to article pages (`type: "Article"`, headline, datePublished, author, description)
- Render as `<script type="application/ld+json">` in the `<head>`

**Effort:** Small

### 3.4 Dark/Light Mode Toggle

**Why:** Currently system-preference only. A manual toggle lets users override, useful when presenting or in unusual lighting.

**How:**
- Add a toggle button in the nav (sun/moon icon, no emoji)
- Store preference in `localStorage`
- On load: check localStorage first, fall back to `prefers-color-scheme`
- Apply via a `data-theme="light"` or `data-theme="dark"` attribute on `<html>`
- Update CSS to use `[data-theme="light"]` and `[data-theme="dark"]` selectors alongside the existing `@media` query

**Effort:** Medium (CSS refactor + JS logic + all three locale pages need no changes since it's in Layout)

### 3.5 /uses Page

**Why:** Common on developer sites, good for SEO ("what tools does X use"), fits the personal nature.

**How:**
- Create `src/pages/en/uses.astro`, `src/pages/es/uses.astro`, `src/pages/cat/uses.astro`
- Content: Hardware, editor/IDE, terminal, browser, dev tools, services
- Add to navigation (visible, not hidden like arcade)
- Add translation keys
- Keep it simple — a single page with sections, no complex components needed

**Effort:** Medium (content creation across 3 languages)

## Recommended Implementation Order

1. **RSS Feed** — Quick win, high value for POSSE strategy
2. **Accessibility Fixes** — Small effort, big impact on quality
3. **View Transitions** — Near zero-config, immediate feel improvement
4. **Print Stylesheet** — 5 minutes of CSS
5. **hreflang Tags** — Quick SEO win
6. **Custom 404** — Small but polished
7. **Article Reading Time** — Nice touch for the writing section
8. **JSON-LD** — SEO enhancement
9. **Dark/Light Toggle** — Medium effort, nice feature
10. **/uses Page** — Content-heavy, do when inspired

## Decision

Implement in the order above, grouped into logical commits. Each item is independent and can be shipped separately.
