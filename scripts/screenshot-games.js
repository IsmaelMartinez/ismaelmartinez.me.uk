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
 * (games: linehold syndicate city park snake tanks; default all)
 * Serves ./dist via a tiny static server on 4173. The Chromium path below
 * matches the Claude Code cloud environment; point CHROMIUM elsewhere
 * (e.g. a local Playwright install) as needed. The scripted click
 * coordinates assume the seeded procedural terrain — if a game's
 * generation code changes, re-derive them from a fresh baseline capture.
 *
 * Excluded from Snyk Code (SAST) via `.snyk`: this is a dev-only tool, already
 * loopback-bound (127.0.0.1) and path-contained to ./dist. See `.snyk` for the
 * per-finding rationale.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO, 'dist');
const OUT = process.argv[2] || 'shots';
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Contain resolved paths to DIST — decoded `..` segments must not escape.
  let file = resolve(DIST, '.' + p);
  if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403); res.end('forbidden'); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
// Loopback only: the harness has no business being reachable off-machine.
await new Promise(r => server.listen(4173, '127.0.0.1', r));

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

// --- Snake (flat canvas) --------------------------------------------------
// Driven by document-level keydown, not iso tile clicks. Early in a run
// ~160ms of virtual time is one snake move (interval starts at 0.16s), so a
// cell-at-a-time serpentine steers deterministically. The seeded Math.random
// fixes apple/bonus placement, so the grown body and eaten count reproduce.
if (run('snake')) {
  const CELL = 20, COLS = 20, ROWS = 20;
  const page = await openGame('/en/fun/snake/');
  const STEP = 1000 / 60; // ms per fixed sim step (loop.ts STEP_MS)
  const KEYS = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
  const dispatch = k =>
    page.evaluate(kk => document.dispatchEvent(new KeyboardEvent('keydown', { key: kk, bubbles: true })), k);
  // The apple (red) and bonus (golden) read cleanly off the canvas — solid
  // discs, unlike the snake's green which the dark scale-dots confuse. Require
  // several red/gold sub-samples so stray eat-burst particles don't register.
  // Score comes from the DOM. The snake head/body we track logically instead
  // (exact, drift-free — see move()), sidestepping green-cell detection.
  const readState = () =>
    page.evaluate(({ CELL, COLS, ROWS }) => {
      const c = document.getElementById('game-canvas');
      const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const w = c.width;
      const dpr = w / (COLS * CELL);
      const px = (cx, cy) => {
        const i = (Math.round(cy * dpr) * w + Math.round(cx * dpr)) * 4;
        return [img[i], img[i + 1], img[i + 2]];
      };
      let apple = null, aBest = 3, bonus = null, bBest = 3;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          let red = 0, gold = 0;
          for (let sy = 0; sy < 5; sy++)
            for (let sx = 0; sx < 5; sx++) {
              const [r, g, b] = px(x * CELL + (sx + 0.5) * CELL / 5, y * CELL + (sy + 0.5) * CELL / 5);
              if (r > 170 && g < 90 && b < 90) red++;
              if (r > 210 && g > 180 && b < 110) gold++;
            }
          if (red > aBest) { aBest = red; apple = { x, y }; }
          if (gold > bBest) { bBest = gold; bonus = { x, y }; }
        }
      return { apple, bonus, score: parseInt(document.getElementById('score').textContent || '0', 10) };
    }, { CELL, COLS, ROWS });

  await page.click('#start-btn');
  await step(page, 6, STEP);
  // Exactly one logical move per call, drift-free. The interval shrinks as the
  // snake eats (logic.ts: 0.16 − 0.004·apples), so a fixed dt would let the
  // moveTimer leftover accumulate until a call sneaks in a second move and the
  // tracked head diverges. Instead step exactly the current interval's worth,
  // carrying the sub-step remainder as `debt`, so cumulative stepped time
  // tracks cumulative intervals: precisely one move fires and tracking holds.
  let snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  let score = 0, debt = 0;
  const move = async nd => {
    await dispatch(KEYS[`${nd.x},${nd.y}`]);
    const apples = Math.round(score / 10);
    const interval = Math.max(0.07, 0.16 - apples * 0.004);
    const want = (interval * 1000) / STEP + debt;
    const n = Math.max(1, Math.round(want));
    debt = want - n;
    await step(page, n, STEP);
    const st = await readState();
    const head = { x: snake[0].x + nd.x, y: snake[0].y + nd.y };
    snake.unshift(head);
    if (st.score <= score) snake.pop(); // no growth unless the score rose
    score = st.score;
    return st;
  };
  // Greedy chase: of the in-bounds, body-free neighbours (the neck is in the
  // body, so this never reverses), take the one nearest the apple; tie-break
  // toward the cell that keeps the most exits so the snake doesn't box itself.
  const pick = target => {
    const body = snake.slice(0, -1);
    const blocked = (x, y) => body.some(s => s.x === x && s.y === y);
    const opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
      .map(d => ({ d, x: snake[0].x + d.x, y: snake[0].y + d.y }))
      .filter(o => o.x >= 0 && o.x < COLS && o.y >= 0 && o.y < ROWS && !blocked(o.x, o.y));
    if (!opts.length) return { x: 1, y: 0 };
    const free = o =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
        const nx = o.x + dx, ny = o.y + dy;
        return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !blocked(nx, ny);
      }).length;
    opts.sort((a, b) =>
      (Math.abs(a.x - target.x) + Math.abs(a.y - target.y)) -
      (Math.abs(b.x - target.x) + Math.abs(b.y - target.y)) || free(b) - free(a));
    return opts[0].d;
  };

  let played = false;
  let st = await readState();
  for (let i = 0; i < 90; i++) {
    if (st.bonus) { await snap(page, 'snake-bonus'); break; }
    if (!played && snake.length >= 7) { await snap(page, 'snake-play'); played = true; }
    st = await move(pick(st.bonus || st.apple || { x: 10, y: 10 }));
  }
  await page.close();
}

// --- Tank Duel (flat canvas) ----------------------------------------------
// Seeded terrain + tank placement make the battlefield reproducible. Snaps
// land on settled frames (shake==0) so the seeded shake jitter can't leak in.
if (run('tanks')) {
  const page = await openGame('/en/fun/tanks/');
  await page.click('#vs-cpu-btn');
  await step(page, 8, 16);
  await snap(page, 'tanks-aim');
  // Fire a lobbing shot: drive the sliders (their input handlers set the
  // tank's angle/power) then the fire button. Whoever's turn it is, a shell
  // flies — the human path is deterministic, so prefer it when enabled.
  const setRange = async (id, v) => {
    await page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
  };
  const humanTurn = await page.evaluate(() => !document.getElementById('fire-btn').disabled);
  if (humanTurn) {
    // The heavy shell (radius 72) leaves an unmistakable crater, so the
    // bake-on-crater rebuild is plainly visible in the after-pair.
    await page.click('.weapon-btn[data-weapon="heavy"]');
    await setRange('angle-slider', 62);
    await setRange('power-slider', 72);
    await page.click('#fire-btn');
  }
  // A few frames in: the shell is airborne over the terrain.
  await step(page, 10, 16);
  await snap(page, 'tanks-fly');
  // Let the high lob complete, land, and the dust/shake fully settle: a fresh
  // crater in the baked terrain (exercises the bake-on-crater rebuild),
  // captured on a still frame.
  await step(page, 250, 16);
  await snap(page, 'tanks-impact');
  await page.close();
}

await browser.close();
server.close();
