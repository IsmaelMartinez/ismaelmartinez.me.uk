/**
 * Renders every arcade score to a WAV through the dev-only jukebox (#367), so
 * a rescore can be heard side by side with the version before it.
 *
 * Drives /en/dev/jukebox headlessly: for each score it clicks Render WAV (two
 * full loops at the score's own tempo, the page's default) and saves the
 * download to music-renders/<label>/<cabinet>.wav, which is gitignored. It
 * then renders the first cabinet a second time and fails unless the two files
 * are byte-identical, since an A/B between branches only means something when
 * an unchanged score renders the same every time.
 *
 * Not wired into npm scripts or CI: it needs a browser, an ad-hoc dep and a
 * running dev server (the jukebox route only exists under `astro dev`).
 *
 *   npm i --no-save playwright-core
 *   npm run dev                                  # in another terminal
 *   node scripts/render-music.js                 # label = branch or short SHA
 *   node scripts/render-music.js main            # explicit label
 *   node scripts/render-music.js main cascade tanks   # only these cabinets
 *
 * To compare a branch with main, run it once on each checkout (restarting the
 * dev server in between) and play music-renders/main/<cabinet>.wav against
 * music-renders/<branch>/<cabinet>.wav; `cmp` says whether they differ at all.
 *
 * CHROMIUM must point at a Chromium binary (the default matches the Claude Code
 * cloud environment; on a Mac use the Playwright cache, e.g.
 * ~/Library/Caches/ms-playwright/chromium-NNNN/...). JUKEBOX_URL overrides the
 * page address, default http://localhost:4321/en/dev/jukebox. The browser always
 * runs headless.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const URL_ = process.env.JUKEBOX_URL || 'http://localhost:4321/en/dev/jukebox';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(...args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' }).trim();
}

function defaultLabel() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  return branch === 'HEAD' ? git('rev-parse', '--short', 'HEAD') : branch;
}

// A branch name like feat/x would otherwise become a nested directory.
const LABEL = (process.argv[2] || defaultLabel()).replace(/[^\w.-]/g, '-');
const ONLY = process.argv.slice(3);
const OUT = join(REPO, 'music-renders', LABEL);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const page = await browser.newPage({ acceptDownloads: true });
let failed = false;
try {
  await page.goto(URL_);
  await page.waitForSelector('[data-jukebox][data-ready]');
  // The dev toolbar floats over the bottom of the page and swallows clicks.
  await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
  const names = await page.$$eval('[data-score]', cards => cards.map(c => c.dataset.score));
  const targets = ONLY.length ? names.filter(n => ONLY.includes(n)) : names;
  const unknown = ONLY.filter(n => !names.includes(n));
  if (unknown.length) throw new Error(`no such score: ${unknown.join(', ')} (have ${names.join(', ')})`);

  async function render(name, file) {
    const card = page.locator(`[data-score="${name}"]`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      card.locator('[data-render]').click()
    ]);
    await download.saveAs(file);
    return readFileSync(file);
  }

  console.log(`rendering ${targets.length} score(s) to ${OUT}`);
  for (const name of targets) {
    const file = join(OUT, `${name}.wav`);
    const bytes = await render(name, file);
    console.log(`  ${name}.wav  ${bytes.length} bytes`);
  }

  const probe = targets[0];
  const again = join(tmpdir(), `render-music-${process.pid}-${probe}.wav`);
  const second = await render(probe, again);
  rmSync(again);
  if (second.equals(readFileSync(join(OUT, `${probe}.wav`)))) {
    console.log(`determinism: ${probe} rendered twice, byte-identical`);
  } else {
    console.error(`determinism: ${probe} rendered twice and the bytes differ`);
    failed = true;
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
