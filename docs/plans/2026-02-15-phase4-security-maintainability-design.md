# Phase 4 Design: Security, Maintainability, Testing & CI

**Date:** 2026-02-15

## Context

A multi-persona site review identified four areas of improvement focused on security hardening, maintainability (page deduplication), test coverage, and CI/DX quality. All four are included in this phase.

## A. Page Deduplication via Dynamic `[lang]` Routes

Every page under `src/pages/` exists three times (en/es/cat) with the only difference being `const lang = '...'`. This creates ~26 duplicate files.

Replace per-locale page files with dynamic `[lang]` routes using `getStaticPaths()`. A single `src/pages/[lang]/connect.astro` generates all three locale variants, extracting `lang` from `Astro.params`. This pattern already exists in the codebase for tags and articles.

Pages to consolidate (3 files to 1 each): `index`, `about`, `connect`, `projects`, `writing`, `uses`, `fun/index`, `fun/quiz`, `fun/snake`, `tags/index`, `tags/[tag]`, `articles/[...slug]`, `rss.xml.ts`.

## B. Security Hardening

### Content Security Policy (CSP)

Add a `<meta http-equiv="Content-Security-Policy">` tag in Layout.astro `<head>` with:
- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://cloud.umami.is` (unsafe-inline required for the FOUC-prevention `is:inline` script and Astro's view transitions)
- `style-src 'self' 'unsafe-inline'` (Astro scoped styles inject inline)
- `img-src 'self' data:`
- `connect-src 'self' https://cloud.umami.is`
- `frame-ancestors 'none'`

### Subresource Integrity (SRI)

Add an `integrity` attribute to the Umami analytics `<script>` tag so the browser verifies the script hash before executing.

### Additional Meta Tags

- `<meta name="referrer" content="strict-origin-when-cross-origin">`
- `<meta http-equiv="X-Content-Type-Options" content="nosniff">`
- `<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()">`

### innerHTML Cleanup

Replace `innerHTML` usage in `quiz.astro` with DOM API calls (`createElement`, `textContent`, `appendChild`) to eliminate the XSS vector pattern.

### Consistent External Link Attributes

Ensure all `target="_blank"` links use `rel="noopener noreferrer"` consistently.

## C. Test Foundation

### Setup

Add `vitest` 4.x as a dev dependency. Add `npm run test` script. Minimal vitest config in `vitest.config.ts`.

### Unit Tests

- `src/utils/reading-time.ts` — word count logic, edge cases (empty string, very short text)
- `src/i18n/translations.ts` — `useTranslations()` returns correct keys for all locales, `getLangFromUrl()` extracts locale from URL, `getLocalizedPath()` builds correct paths

### Build Integration Test

Verify the `dist/` output after build:
- Expected HTML files exist for all three locales
- HTML output includes required meta tags (CSP, canonical, hreflang)
- RSS endpoints generate valid XML for each locale

### CI Integration

Add `npm run test` to the CI pipeline after lint and typecheck steps.

## D. CI and DX Improvements

### Node.js Version Pinning

Add `.nvmrc` with `24` (current LTS). Update both CI workflows (`ci.yml` and `gh-pages.yml`) from `node-version: '20'` to `node-version: '24'`.

### Improved Link Checker

Enhance `scripts/check-links.js` to verify that internal `href` values actually resolve to files in `dist/` rather than just pattern-matching for suspicious links.

### Lighthouse CI

Add a Lighthouse CI step to the GitHub Actions CI workflow that audits the built site and fails if performance, accessibility, or best-practices scores drop below 90.
