/**
 * Deterministic before/after screenshot harness for the arcade games —
 * the verification bar for render refactors (see
 * docs/plans/2026-07-20-arcade-consolidation-2-drawing-idioms.md).
 *
 * Seeds Math.random and replaces requestAnimationFrame/performance.now with
 * a manually stepped clock, so every frame of every game is a pure function
 * of the scripted inputs — captures must match byte-for-byte (`cmp`) across
 * refactors that don't change rendering.
 *
 * Not wired into npm scripts or CI: it needs a browser and an ad-hoc dep.
 * Run it against a fresh `npm run build`:
 *
 *   npm i --no-save playwright-core
 *   node scripts/screenshot-games.js before        # on the base commit
 *   node scripts/screenshot-games.js after         # on the refactor
 *   for f in before/*.png; do cmp "$f" "after/$(basename "$f")"; done
 *
 * Usage: node scripts/screenshot-games.js <outDir> [game...]
 * (games: linehold syndicate city park; default all)
 * Serves ./dist via a tiny static server on 4173. The Chromium path below
 * matches the Claude Code cloud environment; point CHROMIUM elsewhere
 * (e.g. a local Playwright install) as needed. The scripted click
 * coordinates assume the seeded procedural terrain — if a game's
 * generation code changes, re-derive them from a fresh baseline capture.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO, 'dist');
const OUT = process.argv[2] || 'shots';
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });

// Deterministic time + randomness in every page.
await context.addInitScript(() => {
  let s = 0xc0ffee;
  Math.random = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let vnow = 0;
  const rafQ = [];
  performance.now = () => vnow;
  Date.now = () => 1753000000000 + vnow;
  window.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
  window.cancelAnimationFrame = () => {};
  // Step n frames of dtMs each; loop.ts clamps a frame to 250ms of updates.
  window.__step = (n, dtMs) => {
    for (let k = 0; k < n; k++) {
      vnow += dtMs;
      const q = rafQ.splice(0, rafQ.length);
      for (const cb of q) cb(vnow);
    }
  };
});

/** Games' iso view constants (rotation 0), for scripted canvas clicks. */
const VIEWS = {
  linehold: { halfW: 20, halfH: 10, originX: 14 * 20, originY: 70, logicalW: 760, logicalH: 466 },
  city: { halfW: 20, halfH: 10, originX: 14 * 20, originY: 60, logicalW: 760, logicalH: 450 },
  park: { halfW: 20, halfH: 10, originX: 14 * 20, originY: 108, logicalW: 760, logicalH: 498 },
  syndicate: { halfW: 16, halfH: 8, originX: 26 * 16, originY: 70, logicalW: 832, logicalH: 498 }
};

async function openGame(pagePath) {
  const page = await context.newPage();
  page.on('pageerror', e => console.error(`[pageerror ${pagePath}]`, e.message));
  await page.goto(`http://localhost:4173${pagePath}`, { waitUntil: 'networkidle' });
  // Toasts ride real setTimeout (not the virtual clock) and overlap the
  // canvas — hide them so wall-clock jitter can't leak into screenshots.
  await page.addStyleTag({ content: '#toast-area { display: none !important; }' });
  return page;
}

/** Dispatch a click at the centre of world tile (x, y) on the game canvas. */
async function clickTile(page, view, x, y, lift = 0) {
  await page.evaluate(([v, tx, ty, lz]) => {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = v.originX + ((tx + 0.5) - (ty + 0.5)) * v.halfW;
    const sy = v.originY + ((tx + 0.5) + (ty + 0.5)) * v.halfH - lz;
    const cx = rect.left + (sx / v.logicalW) * rect.width;
    const cy = rect.top + (sy / v.logicalH) * rect.height;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
  }, [view, x, y, lift]);
}

async function step(page, n, dtMs = 250) {
  await page.evaluate(([n2, dt]) => window.__step(n2, dt), [n, dtMs]);
}

async function snap(page, name) {
  // Raw canvas pixels via toDataURL: immune to DOM overlays (header, HUD,
  // toasts, overlays) and to viewport clipping of the scaled element.
  const dataUrl = await page.evaluate(() => document.getElementById('game-canvas').toDataURL('image/png'));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`captured ${name}`);
}

const run = name => ONLY.length === 0 || ONLY.includes(name);

// --- Line Hold ------------------------------------------------------------
if (run('linehold')) {
  const page = await openGame('/en/fun/towerdefense/');
  await page.click('#start-btn');
  await step(page, 5, 16);
  // One tower of each kind on the buildable shelf (map is fixed).
  await clickTile(page, VIEWS.linehold, 6, 5);
  await page.click('.tower-tool[data-kind="blast"]');
  await clickTile(page, VIEWS.linehold, 10, 8);
  await page.click('.tower-tool[data-kind="frost"]');
  await clickTile(page, VIEWS.linehold, 10, 4);
  await step(page, 10, 16);
  await snap(page, 'linehold-build');
  // Into the first wave: 12s build timer, then marchers on the road.
  await step(page, 60, 250);
  await snap(page, 'linehold-wave');
  await page.close();
}

// --- Syndicate ------------------------------------------------------------
if (run('syndicate')) {
  const page = await openGame('/en/fun/syndicate/');
  await page.click('#start-btn');
  await step(page, 20, 16);
  await snap(page, 'syndicate-early');
  // March the squad across town past facades; antenna beacons blink on 1.5Hz.
  await clickTile(page, VIEWS.syndicate, 13, 13);
  await step(page, 40, 250);
  await snap(page, 'syndicate-mid');
  await page.close();
}

// --- Microcity ------------------------------------------------------------
if (run('city')) {
  const page = await openGame('/en/fun/city/');
  await page.click('#start-btn');
  await step(page, 3, 16);
  const V = VIEWS.city;
  const tool = id => page.click(`.tool-btn[data-tool="${id}"]`);
  // A compact serviced block on the clear plain south of the river:
  // road spine on row 12, power+school at the ends, zones both sides.
  await tool('power');
  await clickTile(page, V, 3, 11);
  await tool('road');
  for (let x = 3; x <= 14; x++) await clickTile(page, V, x, 12);
  await tool('res');
  for (let x = 4; x <= 9; x++) { await clickTile(page, V, x, 11); await clickTile(page, V, x, 13); }
  await tool('com');
  for (let x = 10; x <= 12; x++) { await clickTile(page, V, x, 11); await clickTile(page, V, x, 13); }
  await tool('ind');
  for (let x = 13; x <= 14; x++) { await clickTile(page, V, x, 11); await clickTile(page, V, x, 13); }
  await tool('school');
  await clickTile(page, V, 15, 12);
  await step(page, 4, 16);
  await snap(page, 'city-zoned');
  // Fast-forward a couple of years so zones grow through their levels.
  await page.click('.speed-btn[data-speed="3"]');
  await step(page, 800, 250);
  await snap(page, 'city-grown');
  await page.close();
}

// --- Pixel Park -----------------------------------------------------------
if (run('park')) {
  const page = await openGame('/en/fun/park/');
  await page.click('#start-btn');
  await step(page, 3, 16);
  const V = VIEWS.park;
  const tool = id => page.click(`.tool-btn[data-tool="${id}"]`);
  // Terrain is seeded, so fixed coords are stable: entrance path ends at
  // (12,11); extend it to row 10 and hang stalls + a raised sky tower off it.
  await tool('path');
  await clickTile(page, V, 12, 10);
  for (const x of [11, 10, 13]) await clickTile(page, V, x, 10);
  // Sky tower needs height ≥ 2: raise (10,9) twice while its neighbours
  // are still empty (a stall next door would block the terraform cascade).
  // Raised tiles render lifted, so later clicks pass the rendered lift.
  await tool('raiseLand');
  await clickTile(page, V, 10, 9);
  await clickTile(page, V, 10, 9, 12);
  await tool('skytower');
  await clickTile(page, V, 10, 9, 24);
  // Stalls on flat ground clear of the cascade, hung off the path row.
  await tool('food');
  await clickTile(page, V, 13, 9);
  await tool('drink');
  await clickTile(page, V, 14, 10);
  await step(page, 4, 16);
  await snap(page, 'park-built');
  // A small coaster loop on the flat plain east of the path, then test it.
  await tool('track');
  const loop = [[15, 9], [16, 9], [17, 9], [17, 10], [17, 11], [16, 11], [15, 11], [15, 10], [15, 9]];
  for (const [x, y] of loop) { await clickTile(page, V, x, y); await step(page, 1, 16); }
  await page.click('#track-test-btn');
  await step(page, 40, 250);
  await snap(page, 'park-coaster');
  // One rotation, to exercise view-dependent geometry.
  await page.click('#rotate-right');
  await step(page, 20, 100);
  await snap(page, 'park-rotated');
  await page.close();
}

await browser.close();
server.close();
