# Release-Readiness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable finding from the 2026-07-28 parallel repository review (security, architecture, tests, performance, DX) so the site ships with CI-gated deploys, a hardened scores API, tested score submission, and an accurate public front door.

**Architecture:** Thirteen small, independent fixes grouped into four PRs by concern: deployment governance (the dashboard-cron deploy that bypasses CI, plus supply-chain hygiene), scores-API hardening and caching, test additions, and documentation. No game behaviour changes anywhere; the only runtime code changes are two lines in `api/scores.ts` and one JSON block in `vercel.json`.

**Tech Stack:** Astro 7 static site, Vitest 4, GitHub Actions, Vercel Functions + Blob, jsdom (new dev dependency, Task 9 only).

## Status

Shipped 2026-07-29. All thirteen tasks are merged: PR A as #223, PR B as #224, PR C as #226, PR D as #225. Two deviations were accepted during implementation, neither changing what the plan asked for. Task 7's `vercel.json` edit was placed by matching content rather than the line numbers quoted here, which had shifted. Task 9's suite needed an in-memory `localStorage` stand-in installed via `vi.stubGlobal`, following the existing convention in `tests/games/highscores.test.ts`, because Node's own experimental `localStorage` global shadows jsdom's and leaves the real one unreachable; every behavioural assertion in the plan passed unchanged against it, which also confirmed `scoreboard.ts`'s double-commit guard empirically.

The Deferred backlog at the end of this document is still open and is the natural source of the next round of work.

## Global Constraints

- CI's `validate` job (lint, typecheck, build, test, check-links) must stay green after every task; run the relevant commands before each commit.
- No behaviour changes to any game's logic or rendering. Byte-identical render output is not at stake here (no render code is touched), so the screenshot harness is not needed.
- Commit and PR messages stay concise (one or two sentences). Never merge; every PR waits for explicit owner review.
- Each PR group below is one branch and one draft PR. Tasks within a group are separate commits.
- The review's accepted-risk items are explicitly **not** in scope (see Deferred backlog at the end).

## Review findings → task map

| Finding (agent) | Task |
|---|---|
| Six-hourly cron deploys without CI gating (DX L1, "the dashboard fix") | 1 |
| `dependabot/fetch-metadata@v3` unpinned (Security 3) | 2 |
| Auto-merge ships unreviewed production deps (Security 3) | 3 |
| Renovate + Dependabot both configured (DX M2) | 4 |
| Unbounded nonce stored in public blob (Security 6) | 5 |
| `GET /api/scores` not CDN-cached (Perf M2, DX M4) | 6 |
| No immutable cache headers for hashed assets (Perf M1) | 7 |
| `output.test.ts` throws instead of skipping (Tests M) | 8 |
| `scoreboard.ts` `commit()` untested (Tests H) | 9 |
| README licence contradiction + staleness (DX H1, M3) | 10 |
| Dual-deploy story and `BLOB_READ_WRITE_TOKEN` undocumented (DX H2, H3) | 11 |
| CLAUDE.md understates Vercel (DX M1) | 12 |
| Dead `// Poo Poo Land` markers (Arch 2) | 13 |

---

## PR A — Deployment governance (branch `fix/deploy-governance`)

### Task 1: Gate the six-hourly dashboard-refresh deploy behind CI

The health dashboard's data is fetched at build time, so a six-hourly cron rebuild keeps it fresh. Today that cron lives in `gh-pages.yml` and deploys unconditionally, so a `main` whose CI is red still redeploys every six hours. Fix: move the cron to `ci.yml` so scheduled rebuilds run the full validate job, and let the existing deploy-on-green `workflow_run` trigger handle the deploy. Scheduled workflow runs execute on the default branch, so the `workflow_run` `branches: [main]` filter still matches.

**Files:**
- Modify: `.github/workflows/ci.yml:3-10`
- Modify: `.github/workflows/gh-pages.yml:1-21`

**Interfaces:**
- Produces: CI runs on `schedule`; `gh-pages.yml` fires only via `workflow_run` on CI success. Nothing else consumes these.

- [x] **Step 1: Add the schedule trigger to ci.yml**

Replace lines 3–10 of `.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main
  schedule:
    # Six-hourly rebuild: the health dashboard's data is fetched at build
    # time, so a scheduled run keeps it fresh. Deploy is not triggered here;
    # gh-pages.yml listens for this workflow's success, so a red scheduled
    # run refreshes nothing and blocks the deploy instead of shipping it.
    - cron: '0 */6 * * *'
```

- [x] **Step 2: Make gh-pages.yml workflow_run-only**

Replace lines 1–21 of `.github/workflows/gh-pages.yml` (the `steps:` of `build-deploy` and below are unchanged):

```yaml
# Deploys only after a green CI run on main. The six-hourly
# dashboard-refresh cron lives in ci.yml, so scheduled rebuilds pass the
# same lint/typecheck/test/link gates as pushes before anything ships.
name: Deploy Astro site to GitHub Pages

on:
  workflow_run:
    workflows: ["CI"]
    types:
      - completed
    branches:
      - main

permissions:
  contents: read

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

- [x] **Step 3: Verify both workflows parse**

Run: `node -e "const y=require('js-yaml'),f=require('fs');['.github/workflows/ci.yml','.github/workflows/gh-pages.yml'].forEach(p=>y.load(f.readFileSync(p,'utf8')));console.log('yaml ok')"`
Expected: `yaml ok`

- [x] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/gh-pages.yml
git commit -m "fix(ci): gate the six-hourly dashboard-refresh deploy behind CI"
```

> Note: this repo's `gh` token lacks the `workflow` scope, so the PR touching `.github/workflows/*` needs an admin/UI merge. That affects the merge step only, not PR creation.

### Task 2: Pin dependabot/fetch-metadata to a SHA

The only unpinned action in the repo. `v3` currently resolves to `v3.1.0` at commit `25dd0e34f4fe68f24cc83900b1fe3fe149efef98` (verified 2026-07-28 via `gh api repos/dependabot/fetch-metadata/git/ref/tags/v3`).

**Files:**
- Modify: `.github/workflows/dependabot-auto-merge.yml:16`

- [x] **Step 1: Pin the action**

Replace line 16:

```yaml
        uses: dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98 # v3.1.0
```

- [x] **Step 2: Commit**

```bash
git add .github/workflows/dependabot-auto-merge.yml
git commit -m "fix(ci): pin dependabot/fetch-metadata to a SHA"
```

### Task 3: Restrict Dependabot auto-merge to dev dependencies

Today any non-major update auto-merges on green CI and deploys, so a compromised patch release of a production dependency ships with no human review. Restrict auto-merge to devDependencies; production updates fall through to manual review. Caveat, deliberate: grouped PRs mixing production and dev dependencies report `direct:production` and will also wait for review, which is the safe direction.

**Files:**
- Modify: `.github/workflows/dependabot-auto-merge.yml:20-21`

- [x] **Step 1: Tighten the auto-merge condition**

Replace lines 20–21 (`- name: Enable auto-merge on non-major updates` and its `if:`):

```yaml
      - name: Enable auto-merge on non-major dev-dependency updates
        # Production dependencies always get a human review: a compromised
        # patch release must not ship itself. Grouped PRs that mix production
        # and dev dependencies fall through to manual review too.
        if: >-
          steps.metadata.outputs.update-type != 'version-update:semver-major' &&
          steps.metadata.outputs.dependency-type == 'direct:development'
```

- [x] **Step 2: Verify the workflow parses**

Run: `node -e "const y=require('js-yaml'),f=require('fs');y.load(f.readFileSync('.github/workflows/dependabot-auto-merge.yml','utf8'));console.log('yaml ok')"`
Expected: `yaml ok`

- [x] **Step 3: Commit**

```bash
git add .github/workflows/dependabot-auto-merge.yml
git commit -m "fix(ci): auto-merge only non-major dev-dependency updates"
```

### Task 4: Delete renovate.json

Dependabot is the active updater (`.github/dependabot.yml`, weekly npm + actions with grouped minor/patch; recent dep commits are Dependabot-style). `renovate.json` is dead or duplicate config either way.

**Files:**
- Delete: `renovate.json`

- [x] **Step 1: Delete and commit**

```bash
git rm renovate.json
git commit -m "chore: drop renovate.json, Dependabot is the active updater"
```

---

## PR B — Scores API hardening and caching (branch `fix/scores-api-hardening`)

### Task 5: Bound the nonce format

`api/scores.ts:261` accepts any non-empty string up to the 1024-char body cap and stores it verbatim in a world-readable blob: ~900 chars of free-text graffiti for anyone with curl. The client sends `crypto.randomUUID()` (`src/games/engine/globalScores.ts:103`). The existing test suite deliberately uses short readable nonces (`'nonce-1'`, `'fresh'`, `'mine'`), so validate against a UUID-sized safe alphabet rather than a strict UUID shape: same security outcome (no graffiti), zero test churn.

**Files:**
- Modify: `api/scores.ts:95` (add constant), `api/scores.ts:261`
- Test: `tests/api/scores.test.ts` (add one test near the existing nonce test at line 278)

**Interfaces:**
- Produces: `POST` rejects nonces longer than 64 chars or outside `[A-Za-z0-9-]` with the existing `400 'bad nonce'`.

- [x] **Step 1: Write the failing test**

Add after the `rejects a missing or empty nonce` test (`tests/api/scores.test.ts:278-283`):

```ts
  it('rejects an oversized or unsafe nonce', async () => {
    for (const nonce of ['x'.repeat(65), 'not a nonce!', '<script>alert(1)</script>']) {
      const response = await POST(postRequest(submission({ nonce })));
      expect(response.status).toBe(400);
    }
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/api/scores.test.ts -t "oversized or unsafe nonce"`
Expected: FAIL (current code accepts all three, responses are not 400)

- [x] **Step 3: Implement the bound**

In `api/scores.ts`, add below `const INITIALS = /^[A-Z0-9]{1,3}$/;` (line 95):

```ts
/**
 * Nonces exist only for replay dedupe, but they are stored verbatim in a
 * world-readable blob: bound them to a UUID-sized safe alphabet so the blob
 * cannot carry free-text graffiti. The client sends crypto.randomUUID().
 */
const NONCE = /^[A-Za-z0-9-]{1,64}$/;
```

Replace line 261:

```ts
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) return fail(400, 'bad nonce', cors);
```

- [x] **Step 4: Run the full API suite**

Run: `npx vitest run tests/api/scores.test.ts`
Expected: all pass (the existing short readable nonces all match the new pattern)

- [x] **Step 5: Commit**

```bash
git add api/scores.ts tests/api/scores.test.ts
git commit -m "fix(api): bound nonce to a UUID-sized safe alphabet"
```

### Task 6: Cache the scores GET at the CDN edge

`GET /api/scores` sends `public, max-age=30` only, so every first visitor to a cabinet's World tab invokes the function, which fans out nine Blob reads. Two review agents flagged it independently, and the implementation plan left it as "the owner's call": this task makes the call (cache it) and records it in ADR 002. `Vary: Origin` is already emitted and GETs carry no credentials, so edge caching is safe.

**Files:**
- Modify: `api/scores.ts:232`
- Test: `tests/api/scores.test.ts:207-209`
- Modify: `docs/adr/002-global-arcade-high-scores.md` (Consequences section)

- [x] **Step 1: Update the header test to the new value**

Replace the assertion at `tests/api/scores.test.ts:209`:

```ts
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=30, s-maxage=30, stale-while-revalidate=60'
    );
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/api/scores.test.ts -t "Cache-Control"`
Expected: FAIL (header is still `public, max-age=30`)

- [x] **Step 3: Implement**

Replace `api/scores.ts:232`:

```ts
      headers: { ...cors, 'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=60' }
```

- [x] **Step 4: Run the suite**

Run: `npx vitest run tests/api/scores.test.ts`
Expected: PASS

- [x] **Step 5: Record the decision in ADR 002**

Append as a new final paragraph of the `## Consequences` section of `docs/adr/002-global-arcade-high-scores.md` (before `## References`):

```markdown
The published GET is additionally cached at the CDN edge (`s-maxage=30,
stale-while-revalidate=60`, added 2026-07-28): a burst of first visits costs
one function invocation per edge region per half-minute rather than one per
visitor, and each invocation is what fans out nine blob reads. Submitters
still see their own write immediately because the POST response carries the
new table; the World tab may lag a write by up to the same 30 seconds the
browser cache already allowed.
```

- [x] **Step 6: Commit**

```bash
git add api/scores.ts tests/api/scores.test.ts docs/adr/002-global-arcade-high-scores.md
git commit -m "perf(api): cache the scores GET at the CDN edge"
```

### Task 7: Immutable cache headers for hashed assets on Vercel

Astro's `/_astro/*` files are content-hashed, but Vercel's default `max-age=0, must-revalidate` makes every repeat view revalidate them. GitHub Pages serves a fixed `max-age=600` that cannot be changed; this helps exactly the host the World-tab traffic lands on.

**Files:**
- Modify: `vercel.json:5-35` (append a second headers block)

- [x] **Step 1: Append the headers block**

In `vercel.json`, after the existing `"/(.*)"` object inside the `headers` array (insert a comma after its closing `}` on line 34):

```json
    {
      "source": "/_astro/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
```

- [x] **Step 2: Verify the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('json ok')"`
Expected: `json ok`

- [x] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "perf: immutable cache headers for hashed assets on Vercel"
```

---

## PR C — Test additions (branch `test/scoreboard-and-build-output`)

### Task 8: Make the build-output suite skip, not throw, without a dist

`tests/build/output.test.ts:5-9` throws from `beforeAll` when `dist/en/index.html` is missing, so a fresh clone's `npm test` goes red, contradicting CLAUDE.md's "skipped unless a build has been produced". CI is unaffected (it builds first) and keeps genuinely exercising the suite.

**Files:**
- Modify: `tests/build/output.test.ts:1-9`

- [x] **Step 1: Replace the throw with a skip**

Replace lines 1–9:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// Build tests assert on ./dist and skip when no build exists. CI always
// builds first, so there they always run; locally, `npm run build` first
// to include them (a stale dist means stale assertions).
const hasDist = existsSync('dist/en/index.html');

describe.skipIf(!hasDist)('build output', () => {
```

(The `beforeAll` import and block are removed; everything from `const locales` down is unchanged.)

- [x] **Step 2: Verify the skip path**

Run: `mv dist dist.bak && npm test; mv dist.bak dist`
Expected: all suites pass, `build output` reported as skipped, exit 0

- [x] **Step 3: Verify the run path**

Run: `npm test`
Expected: all pass including `build output` (dist restored)

- [x] **Step 4: Commit**

```bash
git add tests/build/output.test.ts
git commit -m "test: skip build-output suite when dist is absent"
```

### Task 9: Cover the scoreboard commit() path

`initScoreboard`'s `commit()` is the seam where all eight cabinets write the device table and offer the score to the world board; a regression there silently drops submissions on every cabinet while all existing tests stay green (only the pure `createRunRecord` is covered today). Add a jsdom suite that drives show → initials entry → commit and asserts both sinks.

**Files:**
- Modify: `package.json` (add jsdom devDependency)
- Create: `tests/games/scoreboard-dom.test.ts`

**Interfaces:**
- Consumes: `initScoreboard(panel, options)` from `src/games/engine/scoreboard.ts`; `tableKey(gameId)` from `src/games/engine/highscores.ts`; mocks `fetchGlobal`/`submitGlobal` from `src/games/engine/globalScores.ts`.

- [x] **Step 1: Install jsdom**

Run: `npm install --save-dev jsdom`
(Vitest 4 supports per-file environments via docblock pragma; no vitest.config.ts change needed, other suites stay on node.)

- [x] **Step 2: Write the suite**

Create `tests/games/scoreboard-dom.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initScoreboard } from '../../src/games/engine/scoreboard';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { tableKey } from '../../src/games/engine/highscores';

vi.mock('../../src/games/engine/globalScores', () => ({
  fetchGlobal: vi.fn(async () => null),
  submitGlobal: vi.fn(async () => null)
}));

/**
 * The runtime skeleton of HighScoreTable.astro's panel markup. Static test
 * fixture, parsed rather than assigned so no live node ever renders it.
 */
const PANEL_HTML = `
  <div class="hs-panel" id="highscores" data-hs-game="snake" hidden
       data-t-world-loading="Loading world board"
       data-t-world-unavailable="World board unavailable"
       data-t-world-rank="World rank #{rank}">
    <form class="hs-entry" hidden>
      <input class="hs-input" type="text" maxlength="3" />
      <button type="submit" class="hs-ok">OK</button>
    </form>
    <div class="hs-tabs">
      <button type="button" class="hs-tab" data-hs-scope="device" aria-selected="true">This device</button>
      <button type="button" class="hs-tab" data-hs-scope="world" aria-selected="false">World</button>
    </div>
    <ol class="hs-list"></ol>
    <p class="hs-empty" hidden></p>
    <p class="hs-note" hidden></p>
  </div>`;

function buildPanel(): HTMLElement {
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  return document.getElementById('highscores')!;
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // jsdom does not implement scrollIntoView; commit(true) calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('initScoreboard commit()', () => {
  it('writes the device table and offers the shown score to the world board', async () => {
    const onSave = vi.fn();
    const board = initScoreboard(buildPanel(), { onSave });
    board.show(4210);

    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    const input = document.querySelector<HTMLInputElement>('.hs-input')!;
    expect(form.hidden).toBe(false);

    input.value = 'IMR';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toEqual([
      { initials: 'IMR', score: 4210 }
    ]);
    expect(onSave).toHaveBeenCalledWith({ initials: 'IMR', score: 4210 }, 1);
    // The number submitted globally is exactly the number shown to the player.
    expect(submitGlobal).toHaveBeenCalledWith('snake', 'IMR', 4210);
    const row = document.querySelector('.hs-current');
    expect(row?.querySelector('.hs-score')?.textContent).toBe('004210');
    expect(row?.querySelector('.hs-initials')?.textContent?.trim()).toBe('IMR');
  });

  it('auto-commits a pending entry on pagehide with the last-used initials', async () => {
    localStorage.setItem('arcade-initials', 'ZZZ');
    const board = initScoreboard(buildPanel());
    board.show(900);
    window.dispatchEvent(new Event('pagehide'));
    await flush();

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toEqual([
      { initials: 'ZZZ', score: 900 }
    ]);
    expect(submitGlobal).toHaveBeenCalledWith('snake', 'ZZZ', 900);
  });

  it('commits at most once per shown score', async () => {
    const board = initScoreboard(buildPanel());
    board.show(500);
    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    window.dispatchEvent(new Event('pagehide'));
    board.hide();
    await flush();

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toHaveLength(1);
    expect(submitGlobal).toHaveBeenCalledTimes(1);
  });

  it('fetches the world board lazily on the first World-tab visit', async () => {
    initScoreboard(buildPanel());
    expect(fetchGlobal).not.toHaveBeenCalled();

    const worldTab = document.querySelector<HTMLButtonElement>('[data-hs-scope="world"]')!;
    worldTab.click();
    expect(fetchGlobal).toHaveBeenCalledTimes(1);
    await flush();
    // The mock resolves null: the panel must say unavailable, not show an
    // empty board.
    const note = document.querySelector<HTMLElement>('.hs-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('World board unavailable');
  });

  it('renders world rows from a fetched board', async () => {
    vi.mocked(fetchGlobal).mockResolvedValueOnce({
      snake: [
        { initials: 'AAA', score: 9000 },
        { initials: 'BBB', score: 100 }
      ]
    });
    initScoreboard(buildPanel());
    document.querySelector<HTMLButtonElement>('[data-hs-scope="world"]')!.click();
    await flush();

    const rows = [...document.querySelectorAll('.hs-row .hs-initials')].map(
      el => el.textContent?.trim()
    );
    expect(rows).toEqual(['AAA', 'BBB']);
  });

  it('degrades to inert no-ops without a panel', () => {
    const board = initScoreboard(null);
    expect(() => {
      board.show(100);
      board.hide();
      board.stash(50);
      board.beginRun();
      board.bank(10);
    }).not.toThrow();
    expect(board.top()).toBeNull();
    expect(submitGlobal).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 3: Run the suite**

Run: `npx vitest run tests/games/scoreboard-dom.test.ts`
Expected: PASS (6 tests). If `commits at most once` fails on the double-commit guard, that is a real finding, not a test bug: `commit()` nulls `pendingScore` first, so a second commit must no-op.

- [x] **Step 4: Run everything**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all green

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/games/scoreboard-dom.test.ts
git commit -m "test: cover scoreboard commit() through the DOM seam"
```

**Open decision to surface in the PR description (no code change here):** the comment at `src/games/engine/scoreboard.ts:261-264` says a score that misses the device top ten is still offered to the world board, but `show()` only arms `pendingScore` when the score qualifies for the device table, so a run that misses a full local top ten is never submitted globally. Comment and behaviour disagree; the owner should pick one (fix the gating, or fix the comment) as a follow-up.

---

## PR D — Documentation front door (branch `docs/front-door-refresh`)

### Task 10: README refresh (licence, features, deployment, badge)

Fixes the MIT-vs-"personal use" contradiction (the one item flagged as fix-before-next-public-push), adds the arcade and dual-deploy story, syncs commands by linking CONTRIBUTING (whose table is already correct), and adds the CI badge.

**Files:**
- Modify: `README.md` (full rewrite, content below)

- [x] **Step 1: Verify the badge slug**

Run: `gh repo view --json nameWithOwner -q .nameWithOwner`
Expected: `IsmaelMartinez/ismaelmartinez.me.uk` (if different, substitute in the badge URLs below)

- [x] **Step 2: Replace README.md wholesale**

````markdown
# ismaelmartinez.me.uk

[![CI](https://github.com/IsmaelMartinez/ismaelmartinez.me.uk/actions/workflows/ci.yml/badge.svg)](https://github.com/IsmaelMartinez/ismaelmartinez.me.uk/actions/workflows/ci.yml)

Personal portfolio website showcasing my open source projects, writing, and professional links.

Built with [Astro](https://astro.build/) for fast, modern static site generation.

## Features

- Multi-language support (English, Spanish, Catalan)
- Showcase of open source projects
- Articles as MDX content collections, syndicated to Medium and Dev.to, with per-locale RSS feeds
- A retro arcade of eight canvas games with per-device and global high-score boards
- Open-source portfolio health dashboard, rebuilt on a six-hourly schedule
- Professional and social links
- Dark/light mode support (via system preference)
- Responsive design

## Development

```bash
npm install
npm run dev
```

The full command list (build, lint, typecheck, tests, link check) is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

The site ships twice from `main`:

- **GitHub Pages** serves [https://ismaelmartinez.me.uk/](https://ismaelmartinez.me.uk/)
  via `.github/workflows/gh-pages.yml`, which deploys only after a green CI run.
- **Vercel** mirrors the site and is the production host for the arcade's
  global high-score API (`api/scores.ts`, backed by Vercel Blob). The
  reasoning is recorded in [ADR 002](docs/adr/002-global-arcade-high-scores.md).

## License

[MIT](LICENSE)
````

- [x] **Step 3: Verify the licence file matches**

Run: `head -3 LICENSE`
Expected: MIT licence header (it is; this step guards against the README and LICENSE diverging again)

- [x] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: fix licence statement, document the arcade and dual deployment"
```

### Task 11: CONTRIBUTING catch-up (structure tree, local scores note)

**Files:**
- Modify: `CONTRIBUTING.md:20-21` (insert section), `CONTRIBUTING.md:60-80` (structure tree)

- [x] **Step 1: Add the local-dev scores note**

Insert after step 3 of "Running the Project Locally" (after line 20's browser instruction):

```markdown
### The global arcade leaderboard in local dev

The world high-score board is served by a Vercel Function (`api/scores.ts`)
that is not part of the Astro dev server. A local `npm run dev` reads the
real world board from production and never writes to it: only production
hostnames may submit (see `SUBMIT_HOSTS` in `src/games/engine/globalScores.ts`),
so local experiments cannot pollute the shared board. The function's
`BLOB_READ_WRITE_TOKEN` secret is provisioned on Vercel and is never needed
for normal site work; to exercise the function itself, use `vercel dev` after
`vercel env pull`.
```

- [x] **Step 2: Add the missing directories to the structure tree**

In the Project Structure block, insert between the `data/` and `i18n/` lines:

```
├── games/              # Arcade cabinets: DOM-free game logic + shared engine/
```

and insert above the `tests/` line:

```
api/                    # Vercel Function: global arcade scores (deployed by Vercel, not Astro)
```

- [x] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: document the scores API and arcade in CONTRIBUTING"
```

### Task 12: CLAUDE.md deployment wording

**Files:**
- Modify: `CLAUDE.md:49`

- [x] **Step 1: Reword the Vercel sentence**

In `CLAUDE.md` line 49, replace the final sentence ``A `vercel.json` also exists as a fallback/mirror configuration.`` with:

```markdown
The Vercel deployment (configured by `vercel.json`) mirrors the site and is the production host for the global-scores Function at `api/scores.ts` (see ADR 002).
```

- [x] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md deployment section names Vercel's production role"
```

### Task 13: Remove the dead Poo Poo Land section markers

Three empty `// Poo Poo Land` comment headers survive in `src/i18n/translations.ts` (lines 457, 955, 1453); the keys were removed at retirement. The `'poo-poo-land'` entry in `src/games/engine/highscores.ts:32` is deliberate legacy-key migration and stays.

**Files:**
- Modify: `src/i18n/translations.ts:457,955,1453`

- [x] **Step 1: Delete the three markers**

Each locale block ends its Cascade section the same way. Apply this edit three times, once per locale (the `'fun.backToFun'` values differ per locale, which keeps each edit unique). English, before:

```
    'fun.backToFun': 'Back to Fun Stuff',

    // Poo Poo Land

    // Mobile Menu
```

after:

```
    'fun.backToFun': 'Back to Fun Stuff',

    // Mobile Menu
```

Spanish: the same around `'fun.backToFun': 'Volver a Diversión',`. Catalan: the same around `'fun.backToFun': 'Tornar a Diversió',`.

- [x] **Step 2: Verify nothing else changed**

Run: `git diff --stat && npm test && npm run typecheck`
Expected: `src/i18n/translations.ts | 6 ------`, all tests pass (the key-parity test in `tests/i18n/translations.test.ts` guards the locales)

- [x] **Step 3: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "chore(i18n): drop empty Poo Poo Land section markers"
```

---

## Deferred backlog (reviewed, deliberately not in this plan)

Accepted risks and lower-value items from the review, recorded so they are findable rather than lost. None blocks release.

- Leaderboard abuse economics (Security 1, 2): unauthenticated by design per ADR 002. If defacement starts: per-game score ceilings, a manual blob-rewrite recovery script, Vercel WAF rules.
- CSP `'unsafe-inline'` for scripts (Security 4): move to Astro's hashed inline scripts / `experimental.csp` in a dedicated change.
- `park/game.ts` at 2703 lines (Arch 1): extract a read-only `render.ts` next time the file is touched; verify byte-identical with `scripts/screenshot-games.js`.
- Engine test gaps (Tests M/low): `loop.ts` fixed-timestep, `toast.ts` cap/timer contract, direct `pathfind.ts` `buildPath`/`findPath` cases.
- Test hygiene one-liners: `vi.useRealTimers()` in `tests/games/audio.test.ts`'s `afterEach`; stub `Date.now` in `tests/data/health.test.ts`.
- `"engines": { "node": ">=24" }` in package.json to match `.nvmrc` and CI.
- Plan-hygiene sweep: one-line "Superseded by" headers on pre-July design docs; fix "nine shipped cabinets" in `docs/plans/2026-07-18-arcade-candidates-3.md:4`.
- The `scoreboard.ts` world-submission gating discrepancy surfaced by Task 9 (comment says non-charting scores are offered globally; `show()` gating means they are not).
- Rate-limit salt fallback and `x-forwarded-for` trust notes (Security 7, 8): one-line comments/guards in `api/scores.ts` whenever it is next edited.
