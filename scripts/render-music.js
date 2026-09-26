/**
 * Renders every arcade score to a WAV through the dev-only jukebox (#367), so
 * a rescore can be heard side by side with the version before it.
 *
 * Drives /en/dev/jukebox headlessly: for each score it clicks Render WAV (two
 * full loops at the score's own tempo, the page's default) and saves the
 * download to music-renders/<label>/<cabinet>.wav, which is gitignored. A
 * cabinet whose music.ts exports several scores lists each as
 * `cabinet/EXPORT` (Critter Rescue's acts, e.g. lemmings/ACT_I_MUSIC), saved
 * as lemmings-ACT_I_MUSIC.wav and selected by that name. It
 * then renders the first score a second time and fails unless the two files
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
 *   node scripts/render-music.js main cascade tanks   # only these scores
 *
 * Optional flags render from an adaptive state instead of the score as
 * written, through the same controls the page shows (#371). A score without
 * the feature a flag asks for is skipped, and the file is named after the
 * state the way the page names its downloads, e.g. cascade-danger-from-b.wav:
 *
 *   --danger                 start in the form's danger variant
 *   --section=<name>         start at this section of the order
 *   --layer=<voice>=on|off   switch a voice, by name or index (repeatable)
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
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
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
const FLAGS = process.argv.slice(2).filter(a => a.startsWith('--'));
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const LABEL = (ARGS[0] || defaultLabel()).replace(/[^\w.-]/g, '-');
const ONLY = ARGS.slice(1);

const STATE = { danger: false, section: '', layers: [] };
for (const flag of FLAGS) {
  const [key, ...rest] = flag.slice(2).split('=');
  const value = rest.join('=');
  if (key === 'danger' && !value) STATE.danger = true;
  else if (key === 'section' && value) STATE.section = value;
  else if (key === 'layer' && /^.+=(on|off)$/.test(value)) {
    const at = value.lastIndexOf('=');
    STATE.layers.push({ voice: value.slice(0, at), on: value.slice(at + 1) === 'on' });
  } else throw new Error(`unknown flag ${flag} (have --danger, --section=<name>, --layer=<voice>=on|off)`);
}
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

  /**
   * Sets a card's controls to the requested state, or says what it lacks.
   * Returns null when the card is ready.
   */
  async function applyState(card) {
    if (STATE.danger) {
      const box = card.locator('[data-danger]');
      if (!(await box.count())) return 'no danger variant';
      await box.check();
    }
    if (STATE.section) {
      const picker = card.locator('[data-section]');
      if (!(await picker.count())) return 'no form';
      const names = await picker.locator('option').evaluateAll(opts => opts.map(o => o.value));
      if (!names.includes(STATE.section)) return `no section ${STATE.section}`;
      await picker.selectOption(STATE.section);
    }
    for (const { voice, on } of STATE.layers) {
      const box = card.locator(`[data-layer="${voice}"]`);
      if (!(await box.count())) return `no voice toggle ${voice}`;
      await box.setChecked(on);
    }
    return null;
  }

  async function render(name, dir) {
    const card = page.locator(`[data-score="${name}"]`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      card.locator('[data-render]').click()
    ]);
    const file = join(dir, download.suggestedFilename());
    await download.saveAs(file);
    return file;
  }

  console.log(`rendering ${targets.length} score(s) to ${OUT}`);
  const rendered = [];
  for (const name of targets) {
    const missing = await applyState(page.locator(`[data-score="${name}"]`));
    if (missing) {
      console.log(`  ${name}: skipped, ${missing}`);
      continue;
    }
    const file = await render(name, OUT);
    rendered.push({ name, file });
    console.log(`  ${basename(file)}  ${readFileSync(file).length} bytes`);
  }
  if (!rendered.length) throw new Error('no score has the state asked for');

  const probe = rendered[0];
  const scratch = mkdtempSync(join(tmpdir(), 'render-music-'));
  const again = await render(probe.name, scratch);
  const second = readFileSync(again);
  rmSync(scratch, { recursive: true });
  if (second.equals(readFileSync(probe.file))) {
    console.log(`determinism: ${probe.name} rendered twice, byte-identical`);
  } else {
    console.error(`determinism: ${probe.name} rendered twice and the bytes differ`);
    failed = true;
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
