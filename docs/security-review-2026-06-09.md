# Security Review — 2026-06-09

Full-repository security review of the Astro static site. Overall posture: **good**.
The findings below were either fixed in the accompanying commit or accepted with rationale.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| GitHub Actions — SHA pinning | ✅ Fixed | `ci.yml`/`gh-pages.yml` were already pinned; `codeql.yml` used floating tags — now pinned |
| GitHub Actions — permissions | ✅ Good | Least-privilege `permissions:` blocks on every workflow |
| Workflow injection | ✅ Good | No `pull_request_target`, no untrusted `${{ }}` interpolation in `run:` steps |
| Security headers (Vercel) | ✅ Fixed | `vercel.json` had no headers — HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy added |
| Content Security Policy | ✅ Hardened | Added `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests` |
| `set:html` usage | ✅ Safe | Both instances are `JSON.stringify` output into non-executable script types; JSON-LD additionally escapes `<` |
| `innerHTML` / `eval` / `Function()` | ✅ Absent | None in `src/` |
| External links | ✅ Good | All `target="_blank"` links carry `rel="noopener noreferrer"` |
| Secrets | ✅ Clean | No credentials committed; the Umami `data-website-id` is a public analytics identifier, not a secret |
| Dependencies | ✅ Good | Four runtime deps, all Astro-official; Dependabot weekly with grouped updates |
| `scripts/check-links.js` | ✅ Safe | Pure `fs` operations, no shell execution, external URLs skipped |
| localStorage | ✅ Safe | Theme preference and game high scores only |
| MDX content | ✅ Safe | No embedded scripts, iframes, or objects in articles |

## Fixes applied in this review

1. **Pinned CodeQL workflow actions to commit SHAs** (`.github/workflows/codeql.yml`).
   Floating tags (`@v4`, `@v6`) can be retargeted upstream — a supply-chain risk.
   Now pinned to `actions/checkout` v6.0.2 and `github/codeql-action` v4.36.2,
   matching the convention already used in `ci.yml` and `gh-pages.yml`. Dependabot
   keeps pinned SHAs updated.

2. **Added HTTP security headers to `vercel.json`**: `Strict-Transport-Security`,
   `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, and
   `Permissions-Policy`. These apply to the Vercel mirror; see "accepted risks"
   for the GitHub Pages caveat.

3. **Hardened the meta CSP** in `src/layouts/Layout.astro` with
   `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and
   `upgrade-insecure-requests`.

## Accepted risks / known limitations

- **`'unsafe-inline'` in `script-src` and `style-src`**: required by Astro's
  architecture — the theme FOUC guard, `ClientRouter`, scoped component styles,
  and the game pages all rely on inline scripts/styles. Risk is mitigated by the
  site being fully static with no user-generated content reflected into pages.
  Revisit if Astro gains first-class nonce/hash support for static output.
- **No clickjacking protection on GitHub Pages**: `frame-ancestors` is ignored in
  meta CSP and `X-Frame-Options` cannot be set as a meta tag. GitHub Pages does
  not allow custom response headers. The Vercel deployment is protected; the
  primary GH Pages deployment accepts this residual risk (low impact for a
  static portfolio with no authenticated actions).
- **HSTS on GitHub Pages**: not configurable; GitHub serves HTTPS with
  enforce-HTTPS enabled, and the meta CSP now includes
  `upgrade-insecure-requests` as a partial mitigation.

## Re-review triggers

Re-run a review when any of the following change: new third-party scripts are
added, forms or user input are introduced, the hosting platform changes, or a
non-static rendering mode (SSR/actions) is adopted.
