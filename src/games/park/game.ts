/**
 * Pixel Park — a pocket theme-park management sim.
 *
 * Pure rules live in grid.ts / pathfind.ts / guests.ts / economy.ts; this
 * module owns DOM wiring, the simulation loop, and canvas rendering. It
 * expects the markup defined in src/pages/[lang]/fun/park.astro.
 */
import {
  createGameLoop,
  initScoreboard,
  isoProject,
  fillTile,
  strokeTile,
  drawBlock,
  shadeColor,
  forEachTileBackToFront,
  createGameAudio,
  wireSoundButton,
  type IsoView
} from '../engine';
import {
  GRID_W,
  GRID_H,
  MIN_HEIGHT,
  MAX_HEIGHT,
  BUILDINGS,
  createPark,
  canPlace,
  applyTool,
  toolCost,
  neighbours,
  isWalkable,
  type TileType,
  type Tool
} from './grid';
import { bfsFrom, buildPath, findPath, nearestReachable } from './pathfind';
import {
  createNeeds,
  decayNeeds,
  mostUrgentNeed,
  satisfyNeed,
  happiness,
  type Needs
} from './guests';
import { parkRating, spawnInterval, dailyUpkeep } from './economy';

const BLOCK_HEIGHT = 16;
/** Pixels a single terrain height step lifts a tile. */
const TERRAIN_STEP = 12;
const MAX_TERRAIN_LIFT = MAX_HEIGHT * TERRAIN_STEP;
// originY carries extra headroom so a max-height hill (with a tall building
// on top) never clips off the canvas top, even at the near corner.
const VIEW: IsoView = { halfW: 20, halfH: 10, originX: GRID_H * 20, originY: 60 + MAX_TERRAIN_LIFT };
const CANVAS_W = (GRID_W + GRID_H) * VIEW.halfW;
const CANVAS_H = (GRID_W + GRID_H) * VIEW.halfH + VIEW.originY + 10;
const START_MONEY = 1500;
const DAY_LENGTH = 24; // seconds of game time per day
const GUEST_SPEED = 2.4; // tiles per second
const MAX_GUESTS = 60;

const TILE_EMOJI: Partial<Record<TileType, string>> = {
  entrance: '🎟️',
  carousel: '🎠',
  ferris: '🎡',
  food: '🌭',
  drink: '🥤',
  toilet: '🚻',
  tree: '🌳',
  flume: '🪵',
  skytower: '🗼'
};

/** Per-building block colour and height so each attraction reads distinctly. */
const BUILDING_STYLE: Partial<Record<TileType, { color: string; height: number }>> = {
  carousel: { color: '#b34a8f', height: 14 },
  ferris: { color: '#5a67c0', height: 26 },
  food: { color: '#a8632c', height: 11 },
  drink: { color: '#2f7fb0', height: 11 },
  toilet: { color: '#5e6a72', height: 9 },
  flume: { color: '#1f8a9e', height: 13 },
  skytower: { color: '#8892a6', height: 40 }
};

/** Spin rates (radians/s) for rides: gentle idle, lively while in use. */
const RIDE_SPIN: Partial<Record<TileType, { idle: number; busy: number }>> = {
  carousel: { idle: 0.7, busy: 3 },
  ferris: { idle: 0.35, busy: 1.4 }
};

const NEED_EMOJI: Record<string, string> = {
  fun: '🎢',
  hunger: '🍔',
  thirst: '🥤',
  bladder: '🚻'
};

const GUEST_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb923c'];

interface Guest {
  tile: number;
  path: number[];
  step: number;
  progress: number;
  state: 'idle' | 'walking' | 'using' | 'leaving';
  targetBuilding: number | null;
  useTimer: number;
  idleTimer: number;
  needs: Needs;
  color: string;
}

type Phase = 'idle' | 'play' | 'over';

export function initParkGame(): void {
  const root = document.getElementById('park-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  // Stamped only once wiring is certain to proceed — a root marked wired on
  // a failed getContext would block the after-swap retry for good.
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const restartBtn = el('restart-btn');
  const moneyEl = el('money');
  const guestCountEl = el('guest-count');
  const ratingEl = el('rating');
  const dayEl = el('day');
  const recordEl = el('record');
  const finalDaysEl = el('final-days');
  const finalPeakEl = el('final-peak');
  const toastArea = el('toast-area');
  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tool-btn'));
  const speedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.speed-btn'));

  const strings = {
    day: root.dataset.tDay || 'Day',
    upkeep: root.dataset.tUpkeep || 'Upkeep',
    cantAfford: root.dataset.tCantAfford || 'Not enough cash!',
    needsPath: root.dataset.tNeedsPath || 'Needs a path next to it!',
    blocked: root.dataset.tBlocked || 'A guest is in the way!',
    needsWater: root.dataset.tNeedsWater || 'Needs water next to it!',
    needsHeight: root.dataset.tNeedsHeight || 'Needs higher ground!',
    tooSteep: root.dataset.tTooSteep || "Can't shape the land that steeply!"
  };

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // On narrow screens the board keeps a minimum size inside a pannable
  // container; start the view centred on the entrance.
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  // Bright, bouncy fairground waltz in G major.
  const audio = createGameAudio({
    tempo: 150,
    wave: 'square',
    melody: [
      { freq: 392.0, beats: 0.5 },
      { freq: 587.33, beats: 0.5 },
      { freq: 783.99, beats: 0.5 },
      { freq: 587.33, beats: 0.5 },
      { freq: 493.88, beats: 0.5 },
      { freq: 659.25, beats: 0.5 },
      { freq: 987.77, beats: 0.5 },
      { freq: 0, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  let { tiles, heights, tunnels, entrance } = createPark();
  let phase: Phase = 'idle';
  let money = START_MONEY;
  let day = 1;
  let dayTimer = 0;
  let guests: Guest[] = [];
  let spawnTimer = 3;
  let peakGuests = 0;
  let rating = parkRating(null, 0);
  let selectedTool: Tool = 'path';
  let speedMult = 1;
  let hoverTile = -1;
  let clock = 0;
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];
  const board = initScoreboard(document.getElementById('highscores'));
  // The record readout shows the table's best, beaten live by the current run.
  let record = board.top()?.score ?? 0;

  recordEl.textContent = record.toString();

  function addFloater(tile: number, text: string, color: string) {
    const c = tileCenter(tile);
    const p = isoProject(VIEW, c.x, c.y);
    p.y -= heights[tile] * TERRAIN_STEP;
    const buildingHeight = BUILDING_STYLE[tiles[tile]]?.height ?? BLOCK_HEIGHT;
    floaters.push({ x: p.x, y: p.y - buildingHeight - 6, text, color, life: 1 });
  }

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.removeChild(toastArea.firstChild!);
    setTimeout(() => toast.remove(), 2200);
  }

  const treeCount = () => tiles.filter(t => t === 'tree').length;
  const hasAnyBuilding = () => tiles.some(t => BUILDINGS[t]);

  // --- Guest behaviour ---

  function spawnGuest() {
    guests.push({
      tile: entrance,
      path: [],
      step: 0,
      progress: 0,
      state: 'idle',
      targetBuilding: null,
      useTimer: 0,
      idleTimer: 0.3,
      needs: createNeeds(),
      color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)]
    });
  }

  function startWalking(guest: Guest, path: number[], targetBuilding: number | null) {
    guest.path = path;
    guest.step = 1;
    guest.progress = 0;
    guest.targetBuilding = targetBuilding;
    guest.state = 'walking';
  }

  function startLeaving(guest: Guest) {
    const path = findPath(tiles, guest.tile, entrance);
    if (!path || path.length < 2) {
      guest.state = 'leaving';
      guest.path = [];
      guest.step = 0;
      return; // already at (or cut off from) the entrance; despawns on arrival check
    }
    startWalking(guest, path, null);
    guest.state = 'leaving';
  }

  function chooseAction(guest: Guest) {
    if (happiness(guest.needs) < 25) {
      startLeaving(guest);
      return;
    }
    // Urgent need first; otherwise guests still gravitate to rides
    const want = mostUrgentNeed(guest.needs) ?? (guest.needs.fun < 80 ? 'fun' : null);
    if (want) {
      const candidates: number[] = [];
      tiles.forEach((tile, i) => {
        if (BUILDINGS[tile]?.satisfies === want) candidates.push(i);
      });
      const found = nearestReachable(tiles, guest.tile, candidates);
      if (found && found.path.length >= 2) {
        startWalking(guest, found.path, found.building);
        return;
      }
      if (found) {
        // Already standing next to it
        beginUsing(guest, found.building);
        return;
      }
    }
    // Nothing to do: wander somewhere reachable, or give up and go home
    const bfs = bfsFrom(tiles, guest.tile);
    const reachable: number[] = [];
    bfs.dist.forEach((d, i) => {
      if (d > 0) reachable.push(i);
    });
    if (!reachable.length || (want && Math.random() < 0.3)) {
      startLeaving(guest);
      return;
    }
    const target = reachable[Math.floor(Math.random() * reachable.length)];
    const path = buildPath(bfs, target);
    if (path) startWalking(guest, path, null);
    else startLeaving(guest);
  }

  function beginUsing(guest: Guest, building: number) {
    const def = BUILDINGS[tiles[building]];
    if (!def) {
      guest.state = 'idle';
      guest.idleTimer = 0.3;
      return;
    }
    guest.state = 'using';
    guest.targetBuilding = building;
    guest.useTimer = def.useTime;
    money += def.price;
    addFloater(building, `+£${def.price}`, '#4ade80');
  }

  function arrive(guest: Guest): boolean {
    // Returns false if the guest left the park. A leaving guest's route ends
    // at the entrance (or they were cut off entirely) — either way, despawn.
    if (guest.state === 'leaving') return false;
    if (guest.targetBuilding !== null) {
      beginUsing(guest, guest.targetBuilding);
    } else {
      guest.state = 'idle';
      guest.idleTimer = 0.3 + Math.random() * 0.6;
    }
    return true;
  }

  function updateGuest(guest: Guest, dt: number): boolean {
    decayNeeds(guest.needs, dt);

    switch (guest.state) {
      case 'walking':
      case 'leaving': {
        if (guest.step >= guest.path.length) return arrive(guest);
        guest.progress += GUEST_SPEED * dt;
        while (guest.progress >= 1 && guest.step < guest.path.length) {
          guest.tile = guest.path[guest.step];
          guest.step++;
          guest.progress -= 1;
        }
        if (guest.step >= guest.path.length) {
          guest.progress = 0;
          return arrive(guest);
        }
        return true;
      }
      case 'using': {
        guest.useTimer -= dt;
        if (guest.useTimer <= 0) {
          const def = guest.targetBuilding !== null ? BUILDINGS[tiles[guest.targetBuilding]] : undefined;
          if (def) satisfyNeed(guest.needs, def.satisfies, def.boost);
          guest.targetBuilding = null;
          guest.state = 'idle';
          guest.idleTimer = 0.2;
        }
        return true;
      }
      case 'idle': {
        guest.idleTimer -= dt;
        if (guest.idleTimer <= 0) chooseAction(guest);
        return true;
      }
    }
  }

  /** After the grid changes, drop any guest plans that are no longer valid. */
  function invalidateGuests() {
    for (const guest of guests) {
      if (guest.state === 'walking' || guest.state === 'leaving') {
        const remainingValid = guest.path
          .slice(guest.step)
          .every(i => isWalkable(tiles[i]));
        const targetValid =
          guest.targetBuilding === null || !!BUILDINGS[tiles[guest.targetBuilding]];
        if (!remainingValid || !targetValid) {
          guest.path = [];
          guest.step = 0;
          guest.progress = 0;
          guest.targetBuilding = null;
          guest.state = 'idle';
          guest.idleTimer = 0.2;
        }
      } else if (
        guest.state === 'using' &&
        guest.targetBuilding !== null &&
        !BUILDINGS[tiles[guest.targetBuilding]]
      ) {
        guest.targetBuilding = null;
        guest.state = 'idle';
        guest.idleTimer = 0.2;
      }
    }
  }

  // --- Simulation ---

  function update(dt: number) {
    clock += dt;
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 16 * dt;
      return f.life > 0;
    });
    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;

    guests = guests.filter(guest => updateGuest(guest, simDt));
    peakGuests = Math.max(peakGuests, guests.length);
    if (peakGuests > record) {
      record = peakGuests;
      recordEl.textContent = record.toString();
      // Persist immediately so a mid-run tab close keeps the record.
      board.stash(peakGuests);
    }

    const avg = guests.length
      ? guests.reduce((sum, g) => sum + happiness(g.needs), 0) / guests.length
      : null;
    rating = parkRating(avg, treeCount());

    spawnTimer -= simDt;
    if (spawnTimer <= 0) {
      spawnTimer = spawnInterval(rating);
      if (guests.length < MAX_GUESTS && hasAnyBuilding()) spawnGuest();
    }

    dayTimer += simDt;
    if (dayTimer >= DAY_LENGTH) {
      dayTimer -= DAY_LENGTH;
      day++;
      const upkeep = dailyUpkeep(tiles);
      money -= upkeep;
      showToast(`${strings.day} ${day} · ${strings.upkeep} -£${upkeep}`);
      if (money < 0) gameOver();
    }
  }

  function gameOver() {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    finalDaysEl.textContent = day.toString();
    finalPeakEl.textContent = peakGuests.toString();
    overOverlay.style.display = 'flex';
    board.show(peakGuests);
  }

  function resetPark() {
    ({ tiles, heights, tunnels, entrance } = createPark());
    money = START_MONEY;
    day = 1;
    dayTimer = 0;
    guests = [];
    spawnTimer = 3;
    peakGuests = 0;
    rating = parkRating(null, 0);
    speedMult = 1;
    floaters = [];
    speedButtons.forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    board.hide();
    phase = 'play';
    audio.start();
  }

  // --- Rendering ---

  // Positions below are in tile units; isoProject turns them into pixels.
  function tileCenter(i: number): { x: number; y: number } {
    return { x: (i % GRID_W) + 0.5, y: Math.floor(i / GRID_W) + 0.5 };
  }

  /**
   * Whether tile `i` still reads as a tunnel: the flag alone isn't enough,
   * since raising/lowering a *neighbouring* hillside back to flat leaves
   * `tunnels[i]` stale (raiseLand/lowerLand only clears the flag on the
   * tile it directly touches). Deriving it from current state means guests
   * only vanish where there's still a hill to vanish into.
   */
  function isTunnelActive(i: number): boolean {
    return tunnels[i] && heights[i] === MIN_HEIGHT && neighbours(i).some(n => heights[n] >= 1);
  }

  /**
   * 1 = fully visible, 0 = hidden underground. Cross-fades across the tile
   * boundary while walking into/out of a tunnel instead of popping at the
   * halfway point, and is fully binary while a guest stands still.
   */
  function tunnelVisibility(guest: Guest): number {
    if (
      (guest.state === 'walking' || guest.state === 'leaving') &&
      guest.step < guest.path.length
    ) {
      const fromHidden = isTunnelActive(guest.path[guest.step - 1] ?? guest.tile);
      const toHidden = isTunnelActive(guest.path[guest.step]);
      if (fromHidden === toHidden) return fromHidden ? 0 : 1;
      const t = Math.min(1, Math.max(0, (guest.progress - 0.3) / 0.4));
      return fromHidden ? t : 1 - t;
    }
    return isTunnelActive(guest.tile) ? 0 : 1;
  }

  function guestPos(guest: Guest): { x: number; y: number; z: number } {
    if (
      (guest.state === 'walking' || guest.state === 'leaving') &&
      guest.step < guest.path.length
    ) {
      const fromTile = guest.path[guest.step - 1] ?? guest.tile;
      const toTile = guest.path[guest.step];
      const from = tileCenter(fromTile);
      const to = tileCenter(toTile);
      return {
        x: from.x + (to.x - from.x) * guest.progress,
        y: from.y + (to.y - from.y) * guest.progress,
        z: heights[fromTile] + (heights[toTile] - heights[fromTile]) * guest.progress
      };
    }
    const pos = tileCenter(guest.tile);
    let z = heights[guest.tile];
    if (guest.state === 'using' && guest.targetBuilding !== null) {
      const building = tileCenter(guest.targetBuilding);
      pos.x += (building.x - pos.x) * 0.4;
      pos.y += (building.y - pos.y) * 0.4;
      z = heights[guest.targetBuilding];
    }
    return { ...pos, z };
  }

  function drawGuest(guest: Guest) {
    const visibility = tunnelVisibility(guest);
    if (visibility <= 0) return;
    const pos = guestPos(guest);
    const p = isoProject(VIEW, pos.x, pos.y);
    p.y -= Math.max(0, pos.z) * TERRAIN_STEP;
    ctx.save();
    ctx.globalAlpha = visibility;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = guest.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Theme Park-style thought bubble: what this guest badly wants right now
    const urgent = mostUrgentNeed(guest.needs);
    const thought =
      guest.state === 'leaving' && happiness(guest.needs) < 25
        ? '😡'
        : guest.state !== 'using' && urgent && guest.needs[urgent] < 40
          ? NEED_EMOJI[urgent]
          : undefined;
    if (thought) {
      const by = p.y - 17;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(p.x, by, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - 3, by + 8, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px serif';
      ctx.fillText(thought, p.x, by + 1);
    }
    ctx.restore();
  }

  function render() {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#11271a');
    sky.addColorStop(1, '#0c1c13');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const inUse = new Set<number>();
    for (const guest of guests) {
      if (guest.state === 'using' && guest.targetBuilding !== null) inUse.add(guest.targetBuilding);
    }

    // Guests draw interleaved with their diagonal so blocks occlude them correctly
    const guestsByDiag: Guest[][] = Array.from({ length: GRID_W + GRID_H - 1 }, () => []);
    for (const guest of guests) {
      const pos = guestPos(guest);
      const d = Math.min(GRID_W + GRID_H - 2, Math.max(0, Math.floor(pos.x) + Math.floor(pos.y)));
      guestsByDiag[d].push(guest);
    }

    let lastDiag = -1;
    forEachTileBackToFront(GRID_W, GRID_H, (x, y, i, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) guestsByDiag[lastDiag].forEach(drawGuest);
        lastDiag = diag;
      }
      const tile = tiles[i];
      const h = heights[i];
      const liftPx = h * TERRAIN_STEP;

      if (tile === 'water') {
        const ripple = 0.85 + 0.25 * Math.sin(clock * 1.5 + (x + y) * 0.6);
        fillTile(ctx, VIEW, x, y, shadeColor('#1f6fa8', ripple));
      } else {
        const groundColor =
          tile === 'path' || tile === 'entrance'
            ? '#8a7a5c'
            : (x + y) % 2 === 0
              ? '#1d3b24'
              : '#1f4028';
        if (h > 0) {
          drawBlock(ctx, VIEW, x, y, liftPx, groundColor, 0);
        } else {
          fillTile(ctx, VIEW, x, y, groundColor);
          if (tile === 'path' || tile === 'entrance') {
            strokeTile(ctx, VIEW, x, y, 'rgba(0, 0, 0, 0.2)', 1);
          }
        }
        if (isTunnelActive(i)) {
          // Dark archway where this dug-in path meets each raised neighbour.
          for (const n of neighbours(i)) {
            if (heights[n] < 1) continue;
            const nx = n % GRID_W;
            const ny = Math.floor(n / GRID_W);
            const mx = x + 0.5 + (nx - x) * 0.5;
            const my = y + 0.5 + (ny - y) * 0.5;
            const mouth = isoProject(VIEW, mx, my);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.ellipse(mouth.x, mouth.y - 3, 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      const top = isoProject(VIEW, x + 0.5, y + 0.5);
      top.y -= liftPx;
      if (tile === 'entrance') {
        ctx.font = '13px serif';
        ctx.fillText('🎟️', top.x, top.y);
      } else if (tile === 'tree') {
        ctx.font = '17px serif';
        ctx.fillText('🌳', top.x, top.y - 7);
      } else if (BUILDINGS[tile]) {
        const style = BUILDING_STYLE[tile] ?? { color: '#44447a', height: BLOCK_HEIGHT };
        drawBlock(ctx, VIEW, x, y, style.height, style.color, 0.08, liftPx);
        const spin = RIDE_SPIN[tile];
        const busy = inUse.has(i);
        ctx.save();
        ctx.translate(top.x, top.y - style.height - (busy ? 2 : 0));
        if (spin) ctx.rotate((clock * (busy ? spin.busy : spin.idle)) % (Math.PI * 2));
        ctx.font = `${tile === 'ferris' || tile === 'skytower' ? 16 : 14}px serif`;
        ctx.fillText(TILE_EMOJI[tile] ?? '', 0, 0);
        ctx.restore();
      }
    });
    if (lastDiag >= 0) guestsByDiag[lastDiag].forEach(drawGuest);

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % GRID_W;
      const y = Math.floor(hoverTile / GRID_W);
      const valid = canPlace(tiles, heights, tunnels, x, y, selectedTool) && toolCost(selectedTool) <= money;
      strokeTile(
        ctx,
        VIEW,
        x,
        y,
        valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)',
        2,
        heights[hoverTile] * TERRAIN_STEP
      );
    }

    ctx.font = 'bold 11px monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    moneyEl.textContent = `£${Math.floor(money)}`;
    guestCountEl.textContent = guests.length.toString();
    ratingEl.textContent = `${rating}%`;
    dayEl.textContent = day.toString();
  }

  // --- Input wiring ---

  /**
   * Screen point → tile index, accounting for terrain lift. Raised tiles
   * render higher on screen than sea level (see TERRAIN_STEP), so naive
   * height-0 unprojection drifts towards the near corner on hills — this
   * tests each tile against its own lifted position instead, preferring the
   * tallest (frontmost) match where a raised tile's face overlaps a
   * neighbour's picking region.
   */
  function pickTile(sx: number, sy: number): number {
    // Inlines isoUnproject's math instead of calling it, to avoid an object
    // allocation per tile — this runs the full grid on every mousemove.
    const a = (sx - VIEW.originX) / VIEW.halfW;
    let best = -1;
    let bestScore = -Infinity;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        const b = (sy + heights[i] * TERRAIN_STEP - VIEW.originY) / VIEW.halfH;
        const tx = (a + b) / 2;
        const ty = (b - a) / 2;
        if (Math.floor(tx) === x && Math.floor(ty) === y) {
          const score = heights[i] * 1000 + (x + y);
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
      }
    }
    return best;
  }

  function tileFromEvent(e: MouseEvent): number {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    return pickTile(sx, sy);
  }

  canvas.addEventListener('mousemove', e => {
    hoverTile = tileFromEvent(e);
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTile = -1;
  });

  // Touch taps can't hover-preview, so the first tap arms a tile (showing
  // the placement highlight) and a second tap on the same tile confirms.
  let coarsePointer = false;
  let armedTile = -1;
  canvas.addEventListener('pointerdown', e => {
    coarsePointer = e.pointerType !== 'mouse';
  });

  canvas.addEventListener('click', e => {
    if (phase !== 'play') return;
    const i = tileFromEvent(e);
    if (i < 0) return;
    if (coarsePointer && armedTile !== i) {
      armedTile = i;
      hoverTile = i;
      return;
    }
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);

    if (selectedTool === 'bulldoze' && isWalkable(tiles[i])) {
      const occupied = guests.some(
        g => g.tile === i || (g.step < g.path.length && g.path[g.step] === i && g.progress > 0)
      );
      if (occupied) {
        showToast(strings.blocked);
        return;
      }
    }
    if (!canPlace(tiles, heights, tunnels, x, y, selectedTool)) {
      const def = BUILDINGS[selectedTool as TileType];
      if (def && tiles[i] === 'grass') {
        const hasPathNextDoor = neighbours(i).some(n => isWalkable(tiles[n]));
        if (!hasPathNextDoor) {
          showToast(strings.needsPath);
        } else if (def.needsWater && !neighbours(i).some(n => tiles[n] === 'water')) {
          showToast(strings.needsWater);
        } else if (def.minHeight !== undefined && heights[i] < def.minHeight) {
          showToast(strings.needsHeight);
        }
      } else if (selectedTool === 'raiseLand' || selectedTool === 'lowerLand') {
        // canPlace also rejects raising/lowering water, buildings, or a tile
        // already at MIN_HEIGHT/MAX_HEIGHT — "too steep" would be misleading
        // for those, so only show it for an actual smoothing violation.
        const terraformable = tiles[i] === 'grass' || tiles[i] === 'path';
        const next = heights[i] + (selectedTool === 'raiseLand' ? 1 : -1);
        const withinRange = next >= MIN_HEIGHT && next <= MAX_HEIGHT;
        if (terraformable && withinRange) showToast(strings.tooSteep);
      }
      return;
    }
    const cost = toolCost(selectedTool);
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    applyTool(tiles, heights, tunnels, x, y, selectedTool);
    audio.playSfx('blip');
    invalidateGuests();
  });

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTool = btn.dataset.tool as Tool;
      armedTile = -1;
      toolButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      speedMult = parseInt(btn.dataset.speed || '1', 10);
      speedButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    resetPark();
  });
  restartBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    resetPark();
  });

  createGameLoop(update, render).start();
}
