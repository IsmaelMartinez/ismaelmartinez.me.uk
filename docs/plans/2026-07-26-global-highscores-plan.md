# Global arcade high scores

Date: 2026-07-26
Status: proposed, for review. No code written yet.

Goal: every visitor sees the same top ten per cabinet, and the record of who
scored what is kept over time. Constraint from the owner: use the minimum
possible external service, ideally none.

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

So: one small service. The rest of this plan picks the smallest one and keeps
everything else in the repository.

## Recommendation: a single Cloudflare Worker with D1

One Worker, one D1 database, one free Cloudflare account, roughly a hundred
lines of code living in this repository. Free tier limits are 100,000 Worker
requests per day with 10ms CPU per invocation, and for D1 five million rows read
per day, 100,000 rows written per day, and 5GB of storage. This site's arcade
traffic is orders of magnitude below all of those.

D1 rather than KV because the top ten is one indexed query with a tie-break that
matches the existing rule exactly, and because concurrent submissions are
transactional. The KV alternative would be a read-modify-write on a JSON blob,
which is eventually consistent and can lose an entry when two players finish at
the same moment.

One fact from checking the domain: `ismaelmartinez.me.uk` is on Route 53 and its
apex points at GitHub Pages. Cloudflare custom domains require the zone to be on
Cloudflare, so `scores.ismaelmartinez.me.uk` would mean moving DNS. That is a
bigger change than this feature deserves, so the plan assumes the free
`*.workers.dev` hostname and treats a custom subdomain as a later cosmetic
choice.

Supabase was considered and dropped because free projects pause after a week of
inactivity, which is a realistic traffic pattern here and would mean the board
is down precisely when a rare visitor arrives. Vercel was considered because
`vercel.json` already exists as a mirror config, but Vercel's storage is now
provisioned through marketplace partners, so it means a third-party account
anyway and loses on the "minimum service" test.

## Data model

A single table, keeping every submission rather than only the current top ten,
which is what makes "keep track of it" true over time and costs nothing at this
volume.

```sql
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY,
  game       TEXT    NOT NULL,
  initials   TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  nonce      TEXT    NOT NULL
);
CREATE INDEX idx_game_rank ON scores (game, score DESC, created_at ASC);
CREATE UNIQUE INDEX idx_nonce ON scores (nonce);
```

`ORDER BY score DESC, created_at ASC` reproduces the local tie rule, so a table
never reorders when a player compares the two views. The `nonce` is a client
generated `crypto.randomUUID()`; its unique index makes a browser-level retry a
no-op instead of a duplicate row, which matters because duplicates on a
ten-row board are immediately visible.

## API

Two routes on the Worker, CORS restricted to the site origin.

`GET /scores` returns the top ten for every game in one response, shaped
`{ "snake": [{ "i": "IMR", "s": 4210 }, ...], ... }`, with a short
`Cache-Control: public, max-age=30`. One request serves a game page and, later,
the arcade index.

`POST /scores` takes `{ game, initials, score, nonce }` and returns
`{ rank, table }`, where `rank` is the global position (0 if it did not chart)
and `table` is the new top ten, so the client renders the result without a
second round trip.

The request body is sent as `text/plain` and parsed as JSON by the Worker. This
is deliberate: it keeps the POST a CORS simple request, avoiding a preflight
round trip on a request that may be racing page unload, and it keeps the client
compatible with `sendBeacon` if `keepalive` ever proves unreliable.

Validation in the Worker rejects anything where `game` is not in the allowlist,
`initials` does not match `/^[A-Z0-9]{1,3}$/`, or `score` is not a positive
safe integer below a generous ceiling. The allowlist should be a single exported
array shared by the Worker and the site, so adding a tenth cabinet cannot leave
the two disagreeing.

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
World is the main open question below.

A later, optional phase can show the world number one on each cabinet in
`src/pages/[lang]/fun/index.astro`, which the single `GET /scores` response
already supports.

## Supporting changes

New UI strings need entries in all three locales in `src/i18n/translations.ts`,
following the existing `fun.arcade.*` keys: the two tab labels, a loading state,
an unreachable-board note, and a world rank readout.

CSP needs the Worker origin in `connect-src`, in both places it is declared: the
meta tag in `src/layouts/Layout.astro` and the header in `vercel.json:31`. The
comment already sitting above the meta tag, added after the Umami outage,
explains why these two must not drift apart, and this is exactly the kind of
change that causes the drift.

## Abuse, moderation and privacy

Any score a browser sends can be forged by anyone with developer tools open.
That is a property of the architecture, not a bug to be engineered away, and the
plan should not pretend otherwise. Server-side validation raises the cost of
cheating rather than preventing it.

The proportionate measures are a generous per-submission ceiling and integer
validation, a rate limit per address using Cloudflare's rate limiting binding
(which needs no stored data, so no IP addresses are retained), and a small
blocklist for the handful of offensive three-character combinations that
`A-Z0-9` permits. Moderation is a `wrangler d1 execute` delete from the command
line, which needs no admin endpoint and therefore no admin secret.

Replay validation, submitting the run's inputs and re-simulating them
server-side against the DOM-free game modules, is genuinely possible for the
deterministic cabinets and is the only real anti-cheat option. It is
disproportionate for a personal site and is explicitly rejected here.

Initials are not personal data, and with the rate limiting binding no addresses
are stored, so this adds no new processing worth a policy page. Worth a sentence
if a privacy page is ever added, since the site does not currently have one.

## Testing

The ordering rules are already proven in `tests/games/highscores.test.ts`, and
the Worker's SQL must mirror them; a test asserting that the SQL ordering and
`insertScore` agree on a tie is the one that catches a real regression. The
Worker's validation and shaping logic should be pure functions unit-tested by
the existing Vitest suite. Integration testing is manual against `wrangler dev`,
rather than adding the Workers test pool and its CI cost for two routes.

The client side needs a test that a failed submission leaves the local table
untouched, since that is the guarantee protecting gameplay.

## Rollout

Four phases, each independently reviewable, with user-visible risk arriving only
in the third.

The first stands the Worker and database up in `workers/scores/` with no site
changes at all, verified with curl. The second adds the read path, the World tab,
the i18n keys and the CSP entries, so the board is visible but empty. The third
turns on submission from `commit()` and the rank readout. The fourth, optional,
puts the world record on the arcade index cabinets.

Deployment of the Worker is a GitHub Action on changes under `workers/**` using
a `CLOUDFLARE_API_TOKEN` repository secret. Note for whoever opens that PR: the
`gh` CLI token in use does not carry the `workflow` scope, so a PR adding a
workflow file needs an admin or UI merge.

The global board starts empty. Existing local scores are not migrated, because
they carry no attribution and cannot be verified.

## Open decisions

1. Hostname: accept `*.workers.dev` now, or move DNS from Route 53 to Cloudflare
   for `scores.ismaelmartinez.me.uk`. Recommendation: workers.dev, revisit later.
2. Default tab when the panel opens: This device, or World. Recommendation: This
   device during the entry flow, switching to World once a rank returns.
3. Submit every committed score above zero, or only ones that chart locally.
   Recommendation: every score above zero.
4. Keep every submission row, or only the current top ten. Recommendation: keep
   everything, it is what makes the history real and costs nothing.
5. Optional arcade touch: Cloudflare exposes a country code per request for free,
   so rows could show a flag beside the initials. Coarse and non-identifying, but
   it is an addition rather than a requirement.

## Out of scope

No accounts, no login, no cross-device identity. No live-updating boards. No
per-week or per-month tables. No anti-cheat beyond plausibility checks. No
change to how any individual game computes its score.
