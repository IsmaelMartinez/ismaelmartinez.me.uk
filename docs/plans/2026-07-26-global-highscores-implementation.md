# Global arcade high scores: implementation (2026-07-26)

## Why

The nine arcade tables are per-device: `src/games/engine/highscores.ts` keeps each one in localStorage, so nobody ever sees anybody else's score. The owner wants a board every visitor shares, with the record kept over time, using the minimum external service.

The research behind this (options weighed, why Umami and GitHub-issue submissions were rejected, why the first draft's Cloudflare recommendation was wrong) lives in `docs/plans/2026-07-26-global-highscores-plan.md`. That document is deleted by this work and its reasoning is carried into `docs/adr/002-global-arcade-high-scores.md`, which becomes the permanent record.

Decision in one line: a Vercel Function at `api/scores.ts` plus a Vercel Blob JSON file per game, on the deployment this repo already has and already depends on (six files read `import.meta.env.VERCEL_ENV === 'preview'` to surface draft articles). No new account, no new vendor, no second pipeline.

## Review findings folded in

Four review agents checked the research plan before this one was written. What they changed:

Vercel's Node runtime honours `tsconfig.json` except path mappings, so the Function must import the shared logic relatively (`../src/games/engine/highscores`), never via the `@/*` alias. The Function must live in a root `api/` directory; under `src/pages/api/` it would be prerendered to a static file, because there is no `@astrojs/vercel` adapter and `output` is the default `static`. Both confirmed against Vercel's docs.

`npm run build` is plain `astro build` and never invokes Vercel's function bundler, so a packaging error surfaces only on deploy, never in CI. The Vercel preview check on the PR is therefore part of the verification bar, not a nicety.

The tie rule only survives globally if the timestamp is monotonic with write order, so `t` is assigned by the server at write time and a client-supplied time is ignored. And the existing `tests/games/highscores.test.ts` does not cover a from-scratch sort of a history array, so that needs its own test rather than the assumed free coverage.

CORS gates who can read the response, not who can POST. Anyone can `curl` the endpoint, so every abuse defence lives in validation and budgets. The sharp failure mode is Hobby overage disabling Blob for thirty days, which a per-address rate limit alone does not prevent.

There are eight game pages, not nine; Cascade declares two tables on one page.

## Frozen contracts

Everything below is written against these exact shapes. Lanes must not renegotiate them.

### Storage: one blob per game at `scores/<gameId>.json`

```json
{
  "top":    [{ "i": "IMR", "s": 4210, "t": 1785000000 }],
  "all":    [{ "i": "IMR", "s": 4210, "t": 1785000000, "n": "<uuid>" }],
  "recent": [{ "h": "<salted-ip-hash>", "t": 1785000000 }]
}
```

`top` is derived on every write, never trusted from storage: sort `all` by score descending then `t` ascending, take 10. `t` is always server-assigned. `all` is capped at 500 newest. `recent` is capped at 50 and exists only for rate limiting. All abuse state lives in this one object so it costs no extra Blob operations beyond the read-modify-write already happening.

### HTTP: `api/scores.ts`

- `GET /api/scores` → `{ "<gameId>": [{ "i", "s" }, …], … }` for all games, `Cache-Control: public, max-age=30`.
- `POST /api/scores`, body `text/plain` containing JSON `{ game, initials, score, nonce }` → `{ rank, table }`. `rank` is the 1-based global position or 0. `table` is the new top ten.
- `OPTIONS` → 204 with the CORS headers.
- CORS: allowlist `https://ismaelmartinez.me.uk`, `https://ismaelmartinezmeuk.vercel.app`, `http://localhost:4321`. Echo the request's `Origin` back in `Access-Control-Allow-Origin` only when it matches; the header takes one value, not a list. Set CORS in the Function, never in `vercel.json`.
- Rejects: body over 1KB (before `JSON.parse`), `game` not in the allowlist, `initials` failing `/^[A-Z0-9]{1,3}$/`, `score` not a positive safe integer under 10,000,000, a `nonce` already present in `all` (idempotent no-op returning the current table), a blocked initials triple, more than 5 accepted writes for the same IP hash in the last hour, or more than 30 accepted writes for this game in the last 24 hours. The last is the cost cap: worst case is one game's board frozen for a day, never the store disabled for thirty.
- Write path: `head()` for the ETag, read, merge, `put()` with `allowOverwrite: true` and `ifMatch`, retrying up to 3 times on `BlobPreconditionFailedError`. A stale read self-corrects because it carries a stale ETag.
- `BLOB_READ_WRITE_TOKEN` is read from `process.env` only. It must never be referenced anywhere under `src/`, and never with a `PUBLIC_` prefix.

### Client: `src/games/engine/globalScores.ts`

- `export const SCORES_ENDPOINT` is a hardcoded constant, not an env var. The URL is not a secret, and hardcoding removes a build-config failure mode and avoids touching `.github/workflows/gh-pages.yml` (which would otherwise need the `workflow` token scope to merge).
- `fetchGlobal(): Promise<Record<string, ScoreEntry[]> | null>`, which resolves `null` on any failure, never throws, `AbortSignal.timeout(5000)`, following the `src/data/health.ts` precedent.
- `submitGlobal(gameId, initials, score): Promise<{ rank, table } | null>`, which POSTs with `keepalive: true` and `Content-Type: text/plain`, resolves `null` on any failure, never throws. Submits only when `location.hostname` is a production host, so local dev reads the real board but never writes to it.

### DOM: between `scoreboard.ts` and `HighScoreTable.astro`

One list, not two. The tabs switch which data `renderTable` draws.

- `.hs-tabs` containing two `<button class="hs-tab" data-hs-scope="device">` / `data-hs-scope="world"`, with `aria-selected` reflecting state.
- Existing `.hs-list` and `.hs-empty` keep their meaning and their coupling to `form.hidden`.
- New `.hs-note`, hidden by default, for the world tab's loading and unreachable messages.

## Lanes

Each lane owns its files exclusively. No two lanes touch the same file, which is what makes the fan-out safe.

**Lane 1: Function. Opus subagent.** Goal: a correct, abuse-resistant `api/scores.ts`. Owns `api/**`, `tests/api/scores.test.ts`, and the `@vercel/blob` dependency in `package.json`. Opus because the conditional-write retry, the budget logic, and the CORS echo are where silent data loss or a thirty-day store outage come from, and it is a self-contained new file with no existing invariants to break.

**Lane 2: Engine. Main session.** Goal: wire submission into `commit()` and render the world tab. Owns `src/games/engine/globalScores.ts` (new) and `src/games/engine/scoreboard.ts`. Kept in the main session because this module carries the densest invariants: the single-commit guard, the `pagehide` auto-commit, the rule that `stash()` never touches the network, and the `hs-empty`/`form.hidden` coupling. Submit every committed score above zero, independent of local rank; leave `onSave` alone so Snake's HUD sync (`src/games/snake/game.ts:123`) is unchanged.

**Lane 3: Component. Sonnet subagent.** Goal: tabs and their styling against the frozen DOM contract. Owns `src/components/HighScoreTable.astro` only. Styles are `is:global` under `.hs-panel` and shared by every cabinet, so they must not disturb existing rows.

**Lane 4: i18n. Sonnet subagent.** Goal: the new keys in all three locales. Owns `src/i18n/translations.ts` only. Keys: `fun.arcade.tabDevice`, `fun.arcade.tabWorld`, `fun.arcade.worldLoading`, `fun.arcade.worldUnavailable`, `fun.arcade.worldRank`. Sonnet not Haiku: inserting keys is mechanical but the Spanish and Catalan wording is user-visible and sits beside carefully written neighbours.

**Lane 5: CSP. Haiku subagent.** Goal: add `https://ismaelmartinezmeuk.vercel.app` to `connect-src` in both declarations. Owns `src/layouts/Layout.astro` (meta tag, line 46) and `vercel.json` (header, line 31). Haiku because it is a two-string edit with a mechanical acceptance test: both policies must come out byte-identical in their `connect-src` list.

**Lane 6: ADR and docs. Sonnet subagent.** Goal: make the ADR the permanent record and retire the research doc. Owns `docs/adr/002-global-arcade-high-scores.md` (new), `docs/plans/2026-07-26-global-highscores-plan.md` (deleted), and `CLAUDE.md`. Follow ADR 001's format exactly: `# ADR 002: …`, `**Date:**`, `**Status:**`, `## Context`, `## Decision`. The ADR must carry the rejected options and the reason the first recommendation was reversed, because the document holding that reasoning is being deleted in the same change. In CLAUDE.md, lines 35 and 37 both describe the tables as per-device and both need updating.

**Lane 7: Engine tests. Sonnet subagent.** Goal: prove the client contract. Owns `tests/games/globalscores.test.ts` (new). Must include the case the existing suite does not cover: that sorting a history array by score descending then `t` ascending produces the same order as sequential `insertScore` calls, including ties.

## Verification

Full bar, all green: `npm run lint && npm run typecheck && npm run build && npm test && npm run check-links`.

Then, because `astro build` never exercises Vercel's function bundler, confirm on the PR's Vercel preview deployment that `GET /api/scores` returns 200 and that a `POST` round-trips. A green GitHub Actions run does not prove the Function deploys.

Then an adversarial review pass against these frozen contracts, and fix what it confirms.

## Out of scope

No accounts or login. No live-updating boards. No per-week tables. No anti-cheat beyond validation and budgets. No change to how any game computes its score. No migration of existing local scores, which carry no attribution.

## Status

Not started. Contracts frozen by review on 2026-07-26.
