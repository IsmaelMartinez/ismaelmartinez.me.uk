# ADR 002: Global Arcade High Scores

**Date:** 2026-07-26

**Status:** Accepted

## Context

Every arcade cabinet has kept a complete top-ten table since the high-score system shipped, but each table lives only in the browser that produced it: `src/games/engine/highscores.ts` stores one localStorage array per game under the `arcade-hs-` prefix, so no two visitors ever see the same board. The owner asked for a leaderboard every visitor shares, with the record kept over time, and set one constraint on the solution: use the minimum possible external service, ideally none.

A shared leaderboard is shared mutable state, and this site is static files served from GitHub Pages. There is no origin on that path that can accept a write. Reading shared state is already solved cheaply elsewhere in the codebase (`src/data/health.ts` fetches JSON from `raw.githubusercontent.com` at build time and refreshes it in the browser), but nothing in the current stack can take a POST. Some external service is unavoidable no matter how the requirement is phrased; the question this decision answers is which one.

## Decision

The decision is a Vercel Function at `api/scores.ts` plus one Vercel Blob JSON file per game, running on the Vercel deployment this repo already has and already depends on: six files already read `import.meta.env.VERCEL_ENV === 'preview'` to surface draft articles. No new account, no new vendor, no second pipeline.

Concretely, CI already deploys this repository to Vercel on every pull request, and production already serves the site from the London region at `ismaelmartinezmeuk.vercel.app`, even though the apex domain points at GitHub Pages for the static build itself. Adding one Function and Vercel's own first-party Blob storage reuses infrastructure that is already paid for, already maintained, and already load-bearing for the preview-draft feature, rather than opening a second account and a second deploy pipeline for a personal arcade with eight cabinets. Each game keeps its top ten and its submission history in a single JSON blob at `scores/<gameId>.json`. The exact blob shape, the HTTP surface of `api/scores.ts`, and the client seam (`src/games/engine/globalScores.ts`, wired into `scoreboard.ts`'s `commit()`) are frozen in `docs/plans/2026-07-26-global-highscores-implementation.md`, which this ADR does not restate.

## Options Considered

Two options that added no new service at all were weighed first, and both were rejected on merit rather than on effort. The first was posting scores as Umami analytics events, aggregated into a committed JSON file by a scheduled workflow; Umami is already deployed on this site and already allowed through CSP. This fails on the audience: a personal site read mostly by developers has a high share of visitors running content blockers, and `cloud.umami.is` sits on every major blocklist. That loss is not random, it is structural: those players would enter their initials, see a confirmation, and never appear on the board, which is worse than not having a leaderboard at all. The second was submissions as GitHub issues, opened through a prefilled `issues/new` link and harvested by an Action. It is auditable and moderated by construction, but it requires every player to hold a GitHub account and make a manual click, which makes it a fun easter egg rather than a leaderboard.

Once some external write target was accepted as necessary, the first recommendation was a new Cloudflare account, using Workers for the Function and D1 as the store. That recommendation was reversed before any code was written, and the reversal is the most important fact this decision carries forward.

## Why the First Recommendation Was Reversed

The Cloudflare recommendation rested on a load-bearing technical claim: that Vercel Blob could only perform an unguarded read-modify-write, so two players finishing at the same moment could silently lose an entry. That claim was wrong. Vercel Blob supports conditional writes: `head()` or `get()` returns an ETag, and `put()` accepts an `ifMatch` option that only succeeds if the blob is unchanged since that ETag was issued, raising `BlobPreconditionFailedError` otherwise. That is optimistic concurrency control, exactly the primitive a shared top-ten needs, and a small retry loop around it makes the read-modify-write correct. The lost-update problem the Cloudflare recommendation was built on does not exist.

Two further checks went the same way once verified rather than assumed. Reads never need to reach the Function at all, because a cached response is served from Vercel's CDN, whereas every read on Cloudflare would be a Worker invocation counting against the daily request cap. And a custom subdomain on Vercel is a single CNAME record added to the Route 53 zone that already hosts this domain's DNS, while a Cloudflare custom domain would require moving the whole zone to Cloudflare. Both of those had been listed as costs of the Vercel path in the original comparison, when in fact they cut the other way.

## What Cloudflare Would Still Have Bought

The comparison should stay honest rather than read as revisionism. D1 is a SQL database, so the top ten is one indexed query and the full submission history is queryable without hand-written aggregation code. Its free tier is generous: 100,000 Worker requests per day, 5 million D1 rows read per day, 100,000 written, and 5GB of storage, with no cache propagation delay, where Blob can take up to sixty seconds for an overwrite to reach every reader. None of that outweighs opening a new account and a second deploy pipeline for a personal arcade with eight tables, but the trade should be revisited if the board ever outgrows a JSON file.

## Consequences

Choosing Vercel means the arcade's leaderboard, not only the draft-article preview flow, now depends on Vercel staying up and staying affordable. The sharpest failure mode on the Hobby plan is not a rate limit but an outright cutoff: exceeding the included Blob allowance disables Blob access for thirty days rather than billing for the overage. The mitigation is a hard per-game daily write cap, enforced in `api/scores.ts` and failing closed, so the worst case is one game's board frozen for a day rather than every cabinet's global board going dark for a month.

Scores are also unauthenticated, and that is a property of the architecture rather than a gap left to close later. Any request to `POST /api/scores` can be forged by anyone with developer tools open, and CORS gates who can read a response, not who can post one: a browser enforces the origin check before handing a response back to page script, but a direct `curl` never goes through a browser and reaches the Function regardless. The only defences available are server-side validation (an initials pattern, a score ceiling, a blocklist) and the write budgets described above. Replay-validating submitted runs against the deterministic game modules would be the real anti-cheat option, and it is deliberately out of scope for a personal site.

## References

The reasoning that led here originated in `docs/plans/2026-07-26-global-highscores-plan.md`, since retired; its content is fully absorbed by this ADR. The frozen data model, HTTP surface, and lane breakdown that implement this decision live in `docs/plans/2026-07-26-global-highscores-implementation.md`.
