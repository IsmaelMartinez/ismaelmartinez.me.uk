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

Applied and green on the full bar: lint clean, typecheck 0 errors, build 158 pages, 637 tests
(up from 578), links verified. All seven lanes landed against the frozen contracts, six as
parallel subagents and the `scoreboard.ts` surgery in the main session.

Two contract notes came out of the build and neither was changed unilaterally.

The write path reads through `get(path, { access: 'public', useCache: false })` rather than the
contract's literal `head()`. This is a deliberate deviation and it is a correctness fix, not a
convenience: a blob's `cacheControlMaxAge` defaults to a month and cannot go below a minute, and
blob URLs are served through the CDN, so a `head()` ETag paired with a separately fetched body
can disagree by up to the cache age. The conditional write would then succeed against a current
ETag while merging into a stale board, silently dropping everyone else's scores, which is the
exact failure `ifMatch` exists to prevent. A single `get()` with the cache bypassed returns the
bytes and the ETag that provably belong to them, and returns `null` for a missing blob, which
also handles the first write without catching an error.

`Cache-Control: public, max-age=30` is implemented exactly as frozen and does what the research
assumed. This section previously claimed the opposite, that Vercel's CDN caches a function
response only on `s-maxage` and that plain `max-age` is a browser-only directive, and recommended
adding `s-maxage=30`. Measuring the deployed endpoint on 2026-07-27 disproved that: repeated
requests return `x-vercel-cache: HIT` with `age` climbing to 25 and then resetting to `0` with a
`MISS` at the thirty-second boundary, so the edge is caching the response and honouring the TTL.
Reads therefore do not reach the function once a region is warm, and writes rather than reads are
what consume the Blob quota, as originally intended. No header change is needed.

Known and accepted: the 1KB body check counts UTF-16 units rather than bytes, which is bounded
and harmless behind the same cap.

The first-write race was recorded here as dropping at most one score once per board ever. That
was wrong, and production proved it: two submissions half a second apart on the same board left
only the second, because a read that trails a just-created blob is indistinguishable from a board
that does not exist, and `put` has no conditional-create to separate them. Believing that absence
sends a write with no ETag, which replaces the board rather than adding to it, and the condition
recurs rather than firing once. Absence is now only accepted on the final write attempt, after
backoffs give storage time to settle, and every other write stays conditional. See the "Blob write
race" section below.

### Adversarial review

An Opus review against these contracts raised five findings. Three were fixed.

The blocklist the rejection list calls for had simply not been built: the Function only tested the
`/^[A-Z0-9]{1,3}$/` pattern, so a slur could reach a public board with no admin endpoint to
remove it. There is now a `BLOCKED_INITIALS` set rejected alongside the pattern, with a test that
asserts the blocked triples pass the pattern first, so it proves the block is doing the work.

A global submit could outlive the run that made it. The POST allows five seconds and a short run
takes less, so a slow reply from the previous run could land after `show()` had reset state and
pin the wrong world rank onto the current run, with the out-of-order case leaving it wrong until
a third run. `commit()` now captures a `runToken` and the reply drops its rank if the token moved
on. The board in that reply is never stale, so it is still applied.

The device and world tabs disagreed on ties within the same second. Timestamps have one-second
resolution and `all` is stored newest-first, so a stable sort on it put the LATER of two equal
scores on top: the inverse of the arcade rule, and most likely to be seen exactly under
contention, since contending writes retry within a second of each other. `sortByRank` now
reverses to oldest-first before sorting, and a test feeds the array in real storage order to
prove the earlier entry wins.

Two findings were deliberately not restructured. The per-address hourly limit is per address per
game rather than global, because `recent` lives in each game's blob, so one address can spend it
on each of the nine boards. Making it global needs a tenth shared blob and a second
read-modify-write on every submission, which is not worth it when the per-game daily cap is what
actually bounds the quota. The code comments now say this plainly rather than implying a global
limit. Separately, `all` capped at 500 newest is exactly as frozen, but it means an all-time
record is evicted once 500 later scores arrive on that game, which at the daily cap is about
seventeen days and in practice much longer. That is contract-compliant and the goal of "keeping
the record over time" is not, so it is the owner's call: keeping the current top ten out of the
cap would be a few lines.

The review also confirmed clean: every pre-existing `scoreboard.ts` invariant, the absence of any
secret in `src/` or `dist/`, CSP parity against the literal endpoint origin, the `data-t-*` and
class-name seams between lanes, all five i18n keys in all three locales, the nine client gameIds
matching the server allowlist exactly, and both Cascade panels loading and submitting
independently.

### Blob write race (found in production, 2026-07-26)

The Vercel Blob store was created after the merge, which finally allowed the write path to run
for the first time anywhere. Two faults surfaced immediately, neither reachable before the store
existed.

Two submissions to the same board half a second apart left only the second one. The first created
`scores/cascade.json` holding one entry; the second read the board as absent, took the
first-write branch, and wrote unconditionally, replacing it. The read had simply not caught up
with a blob created moments earlier. Nothing distinguishes that from a game nobody has played,
and `put` offers `ifMatch` but no `ifNoneMatch`, so there is no conditional create to lean on.
The fix is to stop believing an absent read on sight: `record` now retries, with a backoff, and
only accepts absence on its final attempt, by which point storage has had time to settle. A
genuine first write pays those attempts once per game. Every other write remains conditional, so
no write that saw an existing board can clobber it.

The second fault shared the cause. Rapid successive writes returned 503 "board busy" because the
three conditional attempts ran back to back within a few milliseconds, each re-reading the same
stale view and failing its precondition. The retries now pause between attempts, which is what
makes a re-read worth doing at all.

Both are covered by tests that fail without the fix: one drives a rival write in between the read
and the write to prove the board is merged rather than replaced, and one proves a genuinely
absent board is still created. The cost is about six seconds on the suite, since those retries
sleep for real rather than against a faked clock.

### World board freshness (2026-07-26 and 2026-07-27)

A score could vanish from the World tab moments after being posted. `loadWorld` applied its reply
unconditionally, so a fetch issued before a submission and answered after it (reads are cached for
half a minute, which is ample) put the pre-submission board back on screen, taking the player's own
entry off it in front of them.

The panel now tracks one generation number, `worldGen`, for the newest board that has landed. Only
a submission's own reply bumps it, because that is the one answer guaranteed to contain the score
just written; a fetch is served from whatever the CDN holds and can be older than the moment it was
issued, so issue order alone is not a freshness order. Both paths note the generation when they
start and stand down if it moved while they were out. That covers a fetch overtaken by a submission
and, equally, an older submission's reply arriving after a newer one, which the first version of
this guard let through: it dropped the stale rank but still applied the stale table, so a board
missing the newest run could sit in memory until something else replaced it.

Separately, the board only ever loaded once. `loadWorld` was gated on `!world`, so a session that
opened the World tab kept that one snapshot until the page was reloaded, and nobody else's runs
appeared. Worse, a submission populates `world` on its own, so a player who finished a run before
ever opening the tab never fetched at all and spent the session on a board frozen at their own
submission. Every switch to the World tab now refetches, which is what a player has instead of a
refresh button: tapping across from the device board is the gesture. Flipping tabs repeatedly is
free because the response's `max-age` answers the repeats from the browser cache, and a refresh
that fails keeps the board already on screen rather than downgrading it to "unavailable".

None of it is covered by a test. `scoreboard.ts` is DOM-wired and the suite has no jsdom, which is
a repo-wide decision left open. The refresh and the failed-refresh fallback were instead checked in
a real browser against the dev server, which reads the production board over CORS and cannot write
to it, confirming one request per switch to the tab and a retained board when `fetch` rejects.
