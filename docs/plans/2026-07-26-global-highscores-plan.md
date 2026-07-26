# Global arcade high scores

Date: 2026-07-26
Status: proposed, for review. No code written yet.

Goal: every visitor sees the same top ten per cabinet, and the record of who
scored what is kept over time. Constraint from the owner: use the minimum
possible external service, ideally none.

Revision note: the first draft of this plan recommended a new Cloudflare account
and rejected Vercel on a concurrency argument. That argument was wrong on the
facts, and the recommendation is now Vercel. The correction is explained in full
under "Why the first draft was wrong" so the reasoning stays auditable.

## What exists today

Every cabinet already has a complete top-ten table, it is just private to the
browser that produced it. `src/games/engine/highscores.ts` keeps one
localStorage array per game under the `arcade-hs-` prefix, capped at
`MAX_ENTRIES` (10), with three-character initials filtered to `A-Z0-9`. The
ordering rule worth remembering is in `insertScore` at
`src/games/engine/highscores.ts:73`: the insert point is the first entry the
new score strictly beats, so a tie leaves the older entry higher, exactly like
the cabinets it imitates.

`src/games/engine/scoreboard.ts` wires that to the DOM panel rendered by
`src/components/HighScoreTable.astro`. Nine tables exist today, one per cabinet
plus `cascade-countdown` for Cascade's second mode, each declared as a `gameId`
prop in the nine pages under `src/pages/[lang]/fun/`.

Three details of the existing wiring shape the design that follows, and all
three are easy to get wrong if you only skim the module.

The first is that `commit()` at `src/games/engine/scoreboard.ts:160` is the one
and only place a finished entry is written. It guards on `pendingScore === null`,
so it runs at most once per run no matter how many times it is called. Anything
global should hang off that single point rather than off each game.

The second is that `commit()` is deliberately reachable from a `pagehide`
listener and an `astro:before-swap` listener (`scoreboard.ts:203-210`) so a
score is never lost when the tab closes. That means a global submission can fire
while the page is being torn down, where an ordinary `fetch()` is killed before
it leaves the machine. The submission has to use `fetch(..., { keepalive: true })`
(or `navigator.sendBeacon`) or it will silently drop exactly the scores players
care about most.

The third is that `stash()` at `scoreboard.ts:212` writes provisional entries
repeatedly during long runs, called from `bank()` on every point gain. It must
never touch the network. Only the final committed entry is submitted globally,
once.

## Why some external service is unavoidable

A shared leaderboard is shared mutable state, and the site is static files on
GitHub Pages. There is no origin that can accept a write. Reading shared state
is already solved and free (`src/data/health.ts:216` fetches JSON from
`raw.githubusercontent.com` at build time, and the health page refreshes it in
the browser), but nothing in the current stack can accept a POST.

Two options genuinely add no new service, and both were rejected on merit
rather than effort.

Umami is already deployed and already allowed through CSP, and custom events can
carry arbitrary properties, so scores could be posted as analytics events and a
scheduled workflow could aggregate them into a committed JSON file. This fails
on the audience: a personal site read mostly by developers has a high share of
visitors running content blockers, and `cloud.umami.is` is on every major
blocklist. Those players would enter their initials, see a confirmation, and
never appear on the board. A leaderboard that silently discards a chunk of its
players is worse than no leaderboard. The six hour aggregation latency and the
fact that it stores gameplay records in an analytics product with its own
retention policy are secondary problems.

The other zero-service option is submissions as GitHub issues, opened by a
prefilled `issues/new` link and harvested by an Action. It is auditable,
moderated by construction, and costs nothing, but it asks every player for a
GitHub account and a manual click. That is a fun easter egg, not a leaderboard.

So something has to accept the write. The good news, which the first draft
missed, is that it does not have to be anything new.

## Recommendation: a Vercel Function plus Blob, on the deployment that already exists

This repository already has a live Vercel project. It is not the leftover
`vercel.json` the CLAUDE.md describes: CI runs a real deployment on every PR,
and production is serving the site right now at `ismaelmartinezmeuk.vercel.app`
from the London region, even though the apex domain points at GitHub Pages. The
account, the project and the build pipeline all exist and are already
maintained.

So the recommendation is a single Vercel Function in this repository that accepts
score submissions and keeps each game's top ten as a JSON blob in Vercel Blob,
which is Vercel's own first-party storage. No new account anywhere, no new
vendor relationship, no second deploy pipeline, and nothing to remember to renew.
That is what the owner asked for, and it turns out to be available.

Vercel's own documentation names this exact shape as a supported use of Blob,
describing a valid mutable-blob case as "a single JSON file that's updated every
5 minutes with a top list of sales or other regularly refreshed data". A
leaderboard is that file.

## Why the first draft was wrong

The first draft claimed Blob could only do an unguarded read-modify-write, so
two players finishing at the same moment could silently lose an entry, and it
recommended paying for that with a new Cloudflare account and a SQL database.

Vercel Blob supports conditional writes. `head()` or `get()` returns an ETag, and
`put()` accepts an `ifMatch` option that only succeeds if the blob has not
changed since that ETag was issued, throwing `BlobPreconditionFailedError`
otherwise. That is optimistic concurrency control, and a small retry loop around
it makes the read-modify-write correct. The lost-update problem the first draft
was built on does not exist.

It is worth being precise about why this matters beyond the one fact. The draft
used that supposed flaw to argue Blob was "the same class of problem" as the
Umami option it had already rejected. That comparison was not sound even on its
own terms. Umami would have dropped a large and systematic share of players, the
ones running content blockers, every single time. A lost update would have been
a rare random collision. Treating those as equivalent inflated a small risk into
a disqualifying one, and it happened to point at the more expensive answer.

Two smaller things also went the other way once checked. Reads do not need to
touch the Function at all, since a cached response is served by Vercel's CDN,
whereas on Cloudflare every single read would be a Worker invocation counting
against the free daily limit. And a custom subdomain is easy on Vercel, because
`scores.ismaelmartinez.me.uk` is just a CNAME record added at Route 53 where DNS
already lives, while a Cloudflare custom domain requires moving the whole zone to
Cloudflare. The draft listed that DNS friction as a downside and then recommended
the option that had it.

## What Cloudflare would still have bought

Being fair to the rejected option, since the point is a real comparison rather
than a reversal.

D1 is a SQL database, so the top ten is one indexed query and the growing history
of every submission is queryable without writing aggregation code. On free tier
limits it is generous: 100,000 Worker requests per day, 5 million D1 rows read
per day, 100,000 written, and 5GB of storage. And it has no cache propagation
delay, where Blob takes up to 60 seconds for an overwrite to reach every reader.

None of that outweighs a new account and a second deploy pipeline for a personal
arcade with nine tables. Keep this section so the decision can be revisited if
the board ever outgrows a JSON file.

Supabase was considered and dropped separately, because free projects pause after
a week of inactivity, which is a realistic traffic pattern here and would mean
the board is down precisely when a rare visitor arrives.

## Data model

One JSON blob per game, at a stable pathname such as `scores/snake.json`, holding
both the current top ten and the full submission history. History is what makes
"keep track of it" true over time, and at this volume it costs nothing to carry
in the same file.

```json
{
  "top": [{ "i": "IMR", "s": 4210, "t": 1785000000 }],
  "all": [{ "i": "IMR", "s": 4210, "t": 1785000000, "n": "<uuid>" }]
}
```

`top` is derived, not authoritative: it is recomputed from `all` on every write by
sorting on score descending and timestamp ascending, which reproduces the local
tie rule exactly so a table never reorders when a player compares the two views.
Sorting through the existing `insertScore` from `src/games/engine/highscores.ts`
rather than a reimplementation is the right move, since its ordering is already
covered by `tests/games/highscores.test.ts`.

`n` is a client-generated `crypto.randomUUID()`. The Function ignores a
submission whose nonce is already present, which makes a browser-level retry a
no-op instead of a duplicate row. That matters because duplicates on a ten-row
board are immediately visible.

If `all` ever grows large enough to make rewriting the file wasteful, the split is
obvious and can be deferred until it is actually needed: keep `top` in the hot
blob and roll history into per-month blobs.

## API

Two routes on one Vercel Function, CORS restricted to the site origin, both
served from the existing deployment so only one host is involved.

`GET /api/scores` returns the top ten for every game in one response, shaped
`{ "snake": [{ "i": "IMR", "s": 4210 }, ...], ... }`, with a `Cache-Control`
header so the CDN serves repeat reads without re-invoking the Function. One
request serves a game page and, later, the arcade index.

`POST /api/scores` takes `{ game, initials, score, nonce }` and returns
`{ rank, table }`, where `rank` is the global position (0 if it did not chart)
and `table` is the new top ten, so the client renders the result without a second
round trip. This also neatly sidesteps the 60 second cache propagation delay for
the one person who cares most: the player who just submitted sees the
authoritative table in the response, while everyone else picks it up within the
minute.

The request body is sent as `text/plain` and parsed as JSON by the Function. This
is deliberate: it keeps the POST a CORS simple request, avoiding a preflight
round trip on a request that may be racing page unload, and it keeps the client
compatible with `sendBeacon` if `keepalive` ever proves unreliable.

The write path is `head()` for the ETag, read, merge, then `put()` with
`allowOverwrite: true` and `ifMatch`, retrying a small fixed number of times on
`BlobPreconditionFailedError`. A stale read is self-correcting under this scheme,
because a stale read carries a stale ETag and the conditional write simply fails
and retries.

Validation rejects anything where `game` is not in the allowlist, `initials` does
not match `/^[A-Z0-9]{1,3}$/`, or `score` is not a positive safe integer below a
generous ceiling. The allowlist should be a single exported array shared by the
Function and the site, so adding a tenth cabinet cannot leave the two
disagreeing.

## Integration with the existing scoreboard

The client change is small because the seam already exists. Inside `commit()`,
after the local write, submit the entry when a build-time endpoint constant is
configured. There are no per-game changes at all: all nine tables inherit the
behaviour, and a local checkout without the environment variable simply runs
with the global path disabled.

One decision worth making explicitly. `commit()` currently notifies
`options.onSave` only when the local rank is above zero. Gating global
submission the same way would mean a player whose device already holds ten
strong local scores could set a world-class run that is never submitted. The
recommendation is to submit every committed score above zero, independent of
local rank, and leave `onSave` untouched so Snake's existing HUD sync
(`src/games/snake/game.ts:122`) keeps its current meaning.

Failure must be invisible to gameplay. The health page is the precedent
(`src/data/health.ts` catches everything and falls back), and the same applies
here: a timeout, an offline device, or a blocked request leaves the local table
exactly as it is today and shows a quiet note in the global view. The game never
waits on the network.

## Interface

The panel gains two tabs inside `HighScoreTable.astro`, "This device" and
"World", which is one component change rather than nine page changes and fits
the cabinet aesthetic.

The recommended flow preserves today's behaviour completely. A run ends, the
device board appears and the initials form works exactly as it does now, because
that is the instant, offline-proof path. On commit, the entry is written locally
and submitted globally; if a global rank comes back the panel switches to the
World tab with the new row highlighted, and if it does not, the player stays on
their device board none the wiser. Whether the default tab should instead be
World is an open question below.

A later, optional phase can show the world number one on each cabinet in
`src/pages/[lang]/fun/index.astro`, which the single `GET` response already
supports.

## Supporting changes

New UI strings need entries in all three locales in `src/i18n/translations.ts`,
following the existing `fun.arcade.*` keys: the two tab labels, a loading state,
an unreachable-board note, and a world rank readout.

CSP needs the endpoint origin in `connect-src`, in both places it is declared:
the meta tag in `src/layouts/Layout.astro` and the header in `vercel.json:31`.
The comment already sitting above the meta tag, added after the Umami outage,
explains why these two must not drift apart, and this is exactly the kind of
change that causes the drift.

## Limits and failure modes

Writes are the metered dimension: one submission is one Blob advanced operation,
plus one simple operation for the `head()`. Hobby rate limits are 1,200 simple
and 900 advanced operations per minute, which this site will never approach.
The monthly included allowance is the number to confirm before building, since
Vercel's published pricing example cites 10,000 included advanced operations and
does not restate the figure in its Hobby section. Ten thousand writes a month is
roughly three hundred scores a day, far beyond realistic arcade traffic, but it
is worth checking rather than assuming.

The failure mode on exceeding Hobby limits is worth knowing because it is
sharper than a rate limit: Vercel does not bill for overage on Hobby, it disables
Blob access until thirty days have passed. Given the headroom this is a remote
risk, but it argues for the client degrading silently to the local board rather
than surfacing an error, which is what this plan specifies anyway.

Reads should be verified during the first phase. The intent is that a cached
`GET` costs no Function invocation, which needs confirming against the real
`Cache-Control` behaviour before relying on it.

## Abuse, moderation and privacy

Any score a browser sends can be forged by anyone with developer tools open.
That is a property of the architecture, not a bug to be engineered away, and the
plan should not pretend otherwise. Server-side validation raises the cost of
cheating rather than preventing it.

The proportionate measures are a generous per-submission ceiling and integer
validation, a light rate limit per address, and a small blocklist for the handful
of offensive three-character combinations that `A-Z0-9` permits. Moderation is
editing the JSON blob, which needs no admin endpoint and therefore no admin
secret.

Replay validation, submitting the run's inputs and re-simulating them
server-side against the DOM-free game modules, is genuinely possible for the
deterministic cabinets and is the only real anti-cheat option. It is
disproportionate for a personal site and is explicitly rejected here.

Initials are not personal data. If rate limiting stores anything derived from an
address it should be a salted hash with a short TTL rather than the address
itself, which keeps this clear of anything needing a policy page. Worth a
sentence if a privacy page is ever added, since the site does not currently have
one.

## Testing

The ordering rules are already proven in `tests/games/highscores.test.ts`, and
the Function should reuse `insertScore` rather than reimplement it, which makes
that coverage do double duty. The Function's validation and shaping logic should
be pure functions unit-tested by the existing Vitest suite. The conditional-write
retry loop deserves a test with a stubbed Blob client that fails the first
`put()` with `BlobPreconditionFailedError`, since that path is the one that only
runs under a race and will otherwise never be exercised before it matters.

The client side needs a test that a failed submission leaves the local table
untouched, since that is the guarantee protecting gameplay.

## Rollout

Four phases, each independently reviewable, with user-visible risk arriving only
in the third.

The first adds the Function and the Blob store with no site changes at all,
verified with curl, including confirming the read-caching behaviour and the
conditional-write retry under a deliberately forced conflict. The second adds
the read path, the World tab, the i18n keys and the CSP entry, so the board is
visible but empty. The third turns on submission from `commit()` and the rank
readout. The fourth, optional, puts the world record on the arcade index
cabinets.

There is no separate deploy pipeline to build, which is most of the reason this
option wins: the Function ships with the site on the existing Vercel deployment,
and the only new secret is the Blob read-write token, which Vercel injects as an
environment variable when the store is linked to the project.

The global board starts empty. Existing local scores are not migrated, because
they carry no attribution and cannot be verified.

## Open decisions

1. Hostname: use the existing `ismaelmartinezmeuk.vercel.app` deployment, or add
   `scores.ismaelmartinez.me.uk` as a CNAME at Route 53 pointing at Vercel.
   Recommendation: start on the existing hostname, add the subdomain later if the
   vercel.app origin in CSP bothers you.
2. Default tab when the panel opens: This device, or World. Recommendation: This
   device during the entry flow, switching to World once a rank returns.
3. Submit every committed score above zero, or only ones that chart locally.
   Recommendation: every score above zero.
4. Keep every submission in `all`, or only the current top ten. Recommendation:
   keep everything, it is what makes the history real and costs nothing now.
5. Whether the site's canonical host should move to Vercel entirely. Out of scope
   for this plan and deliberately not proposed, but worth noting that once the
   arcade depends on a Vercel Function, the site is running on two hosts.

## Out of scope

No accounts, no login, no cross-device identity. No live-updating boards. No
per-week or per-month tables. No anti-cheat beyond plausibility checks. No
change to how any individual game computes its score.
