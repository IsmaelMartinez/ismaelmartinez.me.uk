/**
 * Microcity — a pocket SimCity-style zoning sim.
 *
 * Pure rules live in tiles.ts / simulation.ts / budget.ts / terrain.ts /
 * disasters.ts; this module owns DOM wiring, the simulation loop, and canvas
 * rendering. It expects the markup defined in src/pages/[lang]/fun/city.astro.
 */
import {
  createGameLoop,
  initScoreboard,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  drawBlock,
  forEachTileBackToFront,
  rotatedDims,
  rotateTile,
  unrotateTile,
  rotatePoint,
  createGameAudio,
  wireSoundButton,
  type IsoView,
  type Rotation
} from '../engine';
import {
  CITY_W,
  CITY_H,
  cityIdx,
  createCity,
  canBuild,
  buildCost,
  build,
  isZone,
  isRoad,
  type CityTile,
  type CityTool,
  type ZoneType
} from './tiles';
import { generateTerrain } from './terrain';
import {
  computePowered,
  computeFireCover,
  roadAdjacent,
  cityStats,
  computeDemand,
  growthStep
} from './simulation';
import { monthlyIncome, monthlyExpenses } from './budget';
import { targetCarCount, spawnCar, stepCar, type Car } from './traffic';
import {
  isFlammable,
  ignitionChance,
  startFire,
  stepFires,
  rollEvent,
  sumDemandModifiers,
  type Fire,
  type ActiveEvent,
  type CityEventId
} from './disasters';

const HALF_W = 20;
const HALF_H = 10;
const ORIGIN_Y = 60;
// Quarter-turn rotations swap the grid's width and height, but W+H — and so
// the projected canvas size — stays put.
const CANVAS_W = (CITY_W + CITY_H) * HALF_W;
const CANVAS_H = (CITY_W + CITY_H) * HALF_H + ORIGIN_Y + 10;
const START_MONEY = 2500;
const MONTH_LENGTH = 20; // seconds of game time
const GROWTH_INTERVAL = 1.2;
const MILESTONES = [100, 250, 500, 1000, 2000];

const ZONE_EMOJI: Record<ZoneType, string> = { res: '🏠', com: '🏬', ind: '🏭' };
const ZONE_TINT: Record<ZoneType, string> = {
  res: 'rgba(74, 222, 128, 0.16)',
  com: 'rgba(96, 165, 250, 0.16)',
  ind: 'rgba(250, 204, 21, 0.14)'
};
const ZONE_BORDER: Record<ZoneType, string> = {
  res: 'rgba(74, 222, 128, 0.5)',
  com: 'rgba(96, 165, 250, 0.5)',
  ind: 'rgba(250, 204, 21, 0.5)'
};
const ZONE_BLOCK: Record<ZoneType, string> = {
  res: '#3fae6e',
  com: '#4f86d6',
  ind: '#c8a23c'
};
const LEVEL_FONT = [0, 12, 15, 18];
const zoneHeight = (level: number) => 6 + level * 7;
const buildingHeight = (tile: CityTile): number => {
  if (tile.type === 'power') return 22;
  if (tile.type === 'school' || tile.type === 'firehouse') return 14;
  return isZone(tile.type) ? zoneHeight(tile.level) : 0;
};

type Phase = 'idle' | 'play' | 'over';

export function initCityGame(): void {
  const root = document.getElementById('city-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  root.dataset.gameWired = 'true';
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const restartBtn = el('restart-btn');
  const moneyEl = el('money');
  const popEl = el('population');
  const jobsEl = el('jobs');
  const monthEl = el('month');
  const recordEl = el('record');
  const finalMonthsEl = el('final-months');
  const finalPopEl = el('final-pop');
  const toastArea = el('toast-area');
  const demandBars: Record<ZoneType, HTMLElement> = {
    res: el('demand-res'),
    com: el('demand-com'),
    ind: el('demand-ind')
  };
  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tool-btn'));
  const speedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.speed-btn'));

  const strings = {
    month: root.dataset.tMonth || 'Month',
    income: root.dataset.tIncome || 'Taxes',
    expenses: root.dataset.tExpenses || 'Upkeep',
    cantAfford: root.dataset.tCantAfford || 'Not enough funds!',
    milestone: root.dataset.tMilestone || 'Population',
    fireAlert: root.dataset.tFireAlert || 'Fire has broken out!',
    events: {
      grant: root.dataset.tEventGrant || 'Government grant awarded',
      protest: root.dataset.tEventProtest || 'Tax protest at the town hall',
      festival: root.dataset.tEventFestival || 'Street festival draws crowds',
      strike: root.dataset.tEventStrike || 'Factory workers on strike',
      boom: root.dataset.tEventBoom || 'Business is booming'
    } satisfies Record<CityEventId, string>
  };

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // On narrow screens the board keeps a minimum size inside a pannable
  // container; start the view centred.
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  // Calm, civic builder loop in F major.
  const audio = createGameAudio({
    tempo: 104,
    wave: 'triangle',
    melody: [
      { freq: 349.23, beats: 1 },
      { freq: 440.0, beats: 1 },
      { freq: 523.25, beats: 1 },
      { freq: 440.0, beats: 1 },
      { freq: 392.0, beats: 1 },
      { freq: 523.25, beats: 1 },
      { freq: 698.46, beats: 1 },
      { freq: 523.25, beats: 1 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  const makeView = (rot: Rotation): IsoView => ({
    halfW: HALF_W,
    halfH: HALF_H,
    originX: rotatedDims(CITY_W, CITY_H, rot).h * HALF_W,
    originY: ORIGIN_Y
  });

  let tiles: CityTile[] = createCity();
  let phase: Phase = 'idle';
  let money = START_MONEY;
  let month = 1;
  let monthTimer = 0;
  let growthTimer = 0;
  let peakPop = 0;
  let milestoneIdx = 0;
  let selectedTool: CityTool = 'road';
  let speedMult = 1;
  let hoverTile = -1;
  let armedTile = -1;
  let clock = 0;
  let rotation: Rotation = 0;
  let VIEW = makeView(rotation);
  let cars: Car[] = [];
  let fires: Fire[] = [];
  let activeEvents: ActiveEvent[] = [];
  let smoke: { x: number; y: number; vx: number; r: number; life: number; maxLife: number }[] = [];
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];
  const board = initScoreboard(document.getElementById('highscores'));
  // The record readout shows the table's best, beaten live by the current run.
  let record = board.top()?.score ?? 0;
  let powered = computePowered(tiles);
  let fireCover = computeFireCover(tiles);
  let stats = cityStats(tiles);
  let demand = computeDemand(stats);

  recordEl.textContent = record.toString();

  /** Projects fractional world-tile coordinates through the current rotation. */
  function projectWorld(tx: number, ty: number): { x: number; y: number } {
    const p = rotatePoint(tx, ty, CITY_W, CITY_H, rotation);
    return isoProject(VIEW, p.tx, p.ty);
  }

  function addFloater(i: number, text: string, color: string) {
    const p = projectWorld((i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.5);
    floaters.push({ x: p.x, y: p.y - buildingHeight(tiles[i]) - 8, text, color, life: 1 });
  }

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.removeChild(toastArea.firstChild!);
    setTimeout(() => toast.remove(), 2400);
  }

  function refreshDerivedState() {
    powered = computePowered(tiles);
    fireCover = computeFireCover(tiles);
    stats = cityStats(tiles);
    demand = computeDemand(stats, sumDemandModifiers(activeEvents));
  }

  function resetCity() {
    tiles = createCity();
    generateTerrain(tiles);
    money = START_MONEY;
    month = 1;
    monthTimer = 0;
    growthTimer = 0;
    peakPop = 0;
    milestoneIdx = 0;
    speedMult = 1;
    cars = [];
    fires = [];
    activeEvents = [];
    smoke = [];
    floaters = [];
    speedButtons.forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    refreshDerivedState();
    board.hide();
    phase = 'play';
    audio.start();
  }

  function gameOver() {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    finalMonthsEl.textContent = month.toString();
    finalPopEl.textContent = peakPop.toString();
    overOverlay.style.display = 'flex';
    board.show(peakPop);
  }

  function update(dt: number) {
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 14 * dt;
      return f.life > 0;
    });
    smoke = smoke.filter(s => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y -= 14 * dt;
      s.r += 3.5 * dt;
      return s.life > 0;
    });

    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;
    clock += simDt;

    // Cosmetic traffic scaled to the population
    cars = cars.filter(car => stepCar(tiles, car, simDt));
    if (cars.length < targetCarCount(stats.population)) {
      const car = spawnCar(tiles);
      if (car) cars.push(car);
    }

    // Power plants puff smoke while the city runs; fires belch it
    const burning = new Set(fires.map(f => f.idx));
    tiles.forEach((tile, i) => {
      const puffs = tile.type === 'power' ? 1.6 : burning.has(i) ? 3.2 : 0;
      if (puffs && Math.random() < simDt * puffs) {
        const p = projectWorld((i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.35);
        smoke.push({
          x: p.x + (Math.random() - 0.5) * 4,
          y: p.y - (tile.type === 'power' ? 24 : buildingHeight(tile) + 4),
          vx: 3 + Math.random() * 5,
          r: 1.5 + Math.random() * 1.5,
          life: 1.6 + Math.random() * 0.8,
          maxLife: 2.4
        });
      }
    });

    growthTimer += simDt;
    if (growthTimer >= GROWTH_INTERVAL) {
      growthTimer -= GROWTH_INTERVAL;
      const result = growthStep(tiles, Math.random, sumDemandModifiers(activeEvents));
      if (result.grown.length || result.decayed.length) refreshDerivedState();
      for (const i of result.grown) addFloater(i, '▲', '#4ade80');
      for (const i of result.decayed) addFloater(i, '▼', '#f87171');

      // Chaos: active fires spread and burn down; new ones spark up
      if (fires.length) {
        const burnt = stepFires(tiles, fires, fireCover, Math.random);
        fires = burnt.fires;
        for (const i of burnt.spread) addFloater(i, '🔥', '#fb923c');
        if (burnt.burnedOut.length) {
          audio.playSfx('explosion');
          refreshDerivedState();
        }
      }
      if (Math.random() < ignitionChance(tiles, fireCover)) {
        const fire = startFire(tiles, fireCover, Math.random);
        if (fire && !fires.some(f => f.idx === fire.idx)) {
          fires.push(fire);
          addFloater(fire.idx, '🔥', '#fb923c');
          showToast(`🔥 ${strings.fireAlert}`);
          audio.playSfx('hit');
        }
      }

      peakPop = Math.max(peakPop, stats.population);
      if (peakPop > record) {
        record = peakPop;
        recordEl.textContent = record.toString();
        // Persist immediately so a mid-run tab close keeps the record.
        board.stash(peakPop);
      }
      if (milestoneIdx < MILESTONES.length && stats.population >= MILESTONES[milestoneIdx]) {
        showToast(`🏙️ ${strings.milestone} ${MILESTONES[milestoneIdx]}!`);
        milestoneIdx++;
      }
    }

    monthTimer += simDt;
    if (monthTimer >= MONTH_LENGTH) {
      monthTimer -= MONTH_LENGTH;
      month++;
      const income = monthlyIncome(stats);
      const expenses = monthlyExpenses(tiles);
      money += income - expenses;
      showToast(`${strings.month} ${month} · ${strings.income} +£${income} · ${strings.expenses} -£${expenses}`);

      // Politics: expire old events, maybe roll a fresh one
      activeEvents.forEach(a => a.monthsLeft--);
      activeEvents = activeEvents.filter(a => a.monthsLeft > 0);
      const event = rollEvent(month, Math.random);
      if (event) {
        money += event.money;
        if (event.months > 0) activeEvents.push({ event, monthsLeft: event.months });
        const delta = event.money ? ` ${event.money > 0 ? '+' : '−'}£${Math.abs(event.money)}` : '';
        showToast(`${event.emoji} ${strings.events[event.id]}${delta}`);
      }
      refreshDerivedState();
      if (money < 0) gameOver();
    }
  }

  // --- Rendering ---
  // The world grid never moves; rendering walks the *view* grid (rotated
  // dimensions) back-to-front and maps each view tile to its world tile.

  function drawWater(x: number, y: number, vx: number, vy: number) {
    fillTile(ctx, VIEW, vx, vy, '#14456e');
    // Drifting sparkle keyed to world coords so it flows, not flickers
    if ((x * 5 + y * 3 + Math.floor(clock * 2)) % 9 === 0) {
      fillTile(ctx, VIEW, vx, vy, 'rgba(125, 211, 252, 0.14)');
    }
  }

  function drawRoad(i: number, vx: number, vy: number, dims: { w: number; h: number }) {
    if (tiles[i].type === 'bridge') {
      drawWater(i % CITY_W, Math.floor(i / CITY_W), vx, vy);
      fillTile(ctx, VIEW, vx, vy, 'rgba(94, 82, 60, 0.85)');
    } else {
      fillTile(ctx, VIEW, vx, vy, '#3a4150');
    }
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const centre = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let any = false;
    for (const [dx, dy] of dirs) {
      const nvx = vx + dx;
      const nvy = vy + dy;
      if (nvx < 0 || nvx >= dims.w || nvy < 0 || nvy >= dims.h) continue;
      const n = unrotateTile(nvx, nvy, CITY_W, CITY_H, rotation);
      if (!isRoad(tiles[cityIdx(n.x, n.y)].type)) continue;
      any = true;
      const edge = isoProject(VIEW, vx + 0.5 + dx * 0.5, vy + 0.5 + dy * 0.5);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }
    if (!any) {
      const a = isoProject(VIEW, vx + 0.2, vy + 0.5);
      const b = isoProject(VIEW, vx + 0.8, vy + 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Lit windows on the two visible faces of a developed zone block. */
  function drawWindows(vx: number, vy: number, i: number, level: number, height: number) {
    const inset = 0.08;
    const w = isoProject(VIEW, vx + inset, vy + 1 - inset);
    const s = isoProject(VIEW, vx + 1 - inset, vy + 1 - inset);
    const e = isoProject(VIEW, vx + 1 - inset, vy + inset);
    const faces: [{ x: number; y: number }, { x: number; y: number }][] = [[w, s], [s, e]];
    faces.forEach(([a, b], f) => {
      for (let r = 0; r < level; r++) {
        for (let c = 0; c < 2; c++) {
          const t = 0.3 + c * 0.4;
          const bx = a.x + (b.x - a.x) * t;
          const by = a.y + (b.y - a.y) * t - height * ((r + 0.5) / level);
          // Stable per-window pattern: most lit, some dark
          const lit = (i * 31 + f * 17 + r * 7 + c * 13) % 5 < 3;
          ctx.fillStyle = lit ? 'rgba(254, 240, 138, 0.85)' : 'rgba(2, 6, 23, 0.5)';
          ctx.fillRect(bx - 1, by - 1.5, 2, 3.5);
        }
      }
    });
  }

  function carWorldPos(car: Car): { x: number; y: number } {
    const fx = (car.from % CITY_W) + 0.5;
    const fy = Math.floor(car.from / CITY_W) + 0.5;
    const tx = (car.to % CITY_W) + 0.5;
    const ty = Math.floor(car.to / CITY_W) + 0.5;
    return { x: fx + (tx - fx) * car.progress, y: fy + (ty - fy) * car.progress };
  }

  function drawCar(car: Car) {
    const pos = carWorldPos(car);
    const p = projectWorld(pos.x, pos.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(p.x - 2.5, p.y - 1, 5, 2.5);
    ctx.fillStyle = car.color;
    ctx.fillRect(p.x - 2, p.y - 3, 4, 2.5);
  }

  function render() {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#101723');
    sky.addColorStop(1, '#0b111b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const dims = rotatedDims(CITY_W, CITY_H, rotation);
    const burning = new Set(fires.map(f => f.idx));

    // Cars draw interleaved with their view diagonal so blocks occlude them
    const carsByDiag: Car[][] = Array.from({ length: CITY_W + CITY_H - 1 }, () => []);
    for (const car of cars) {
      const pos = carWorldPos(car);
      const vp = rotatePoint(pos.x, pos.y, CITY_W, CITY_H, rotation);
      const d = Math.min(
        CITY_W + CITY_H - 2,
        Math.max(0, Math.floor(vp.tx) + Math.floor(vp.ty))
      );
      carsByDiag[d].push(car);
    }

    let lastDiag = -1;
    forEachTileBackToFront(dims.w, dims.h, (vx, vy, _vi, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) carsByDiag[lastDiag].forEach(drawCar);
        lastDiag = diag;
      }
      const { x, y } = unrotateTile(vx, vy, CITY_W, CITY_H, rotation);
      const i = cityIdx(x, y);
      const tile = tiles[i];
      const top = isoProject(VIEW, vx + 0.5, vy + 0.5);

      if (isRoad(tile.type)) {
        drawRoad(i, vx, vy, dims);
      } else if (tile.type === 'water') {
        drawWater(x, y, vx, vy);
      } else {
        fillTile(ctx, VIEW, vx, vy, (x + y) % 2 === 0 ? '#171e29' : '#1a2230');

        if (tile.type === 'power') {
          drawBlock(ctx, VIEW, vx, vy, 22, '#5b4a7a');
          ctx.font = '15px serif';
          ctx.fillText('⚡', top.x, top.y - 22);
        } else if (tile.type === 'park') {
          fillTile(ctx, VIEW, vx, vy, '#22543d');
          ctx.font = '14px serif';
          ctx.fillText('🌳', top.x, top.y - 5);
        } else if (tile.type === 'tree') {
          fillTile(ctx, VIEW, vx, vy, '#16301f');
          ctx.font = '13px serif';
          ctx.fillText('🌲', top.x, top.y - 5);
        } else if (tile.type === 'rubble') {
          fillTile(ctx, VIEW, vx, vy, '#31302c');
          ctx.font = '11px serif';
          ctx.fillText('🪨', top.x, top.y - 3);
        } else if (tile.type === 'school') {
          drawBlock(ctx, VIEW, vx, vy, 14, '#b9813e');
          ctx.font = '13px serif';
          ctx.fillText('🏫', top.x, top.y - 14);
        } else if (tile.type === 'firehouse') {
          drawBlock(ctx, VIEW, vx, vy, 14, '#a34141');
          ctx.font = '13px serif';
          ctx.fillText('🚒', top.x, top.y - 14);
        } else if (isZone(tile.type)) {
          if (tile.level === 0) {
            fillTile(ctx, VIEW, vx, vy, ZONE_TINT[tile.type]);
            strokeTile(ctx, VIEW, vx, vy, ZONE_BORDER[tile.type], 1);
          } else {
            const height = zoneHeight(tile.level);
            drawBlock(ctx, VIEW, vx, vy, height, ZONE_BLOCK[tile.type]);
            drawWindows(vx, vy, i, tile.level, height);
            ctx.font = `${LEVEL_FONT[tile.level]}px serif`;
            ctx.fillText(ZONE_EMOJI[tile.type], top.x, top.y - height);
            // Unserviced developed zones flash a warning above the roof
            if (
              !burning.has(i) &&
              (!powered[i] || !roadAdjacent(tiles, i)) &&
              Math.floor(clock * 2) % 2 === 0
            ) {
              ctx.font = '11px serif';
              ctx.fillText('⚠️', top.x, top.y - height - 14);
            }
          }
        }
      }

      if (burning.has(i)) {
        fillTile(ctx, VIEW, vx, vy, 'rgba(251, 146, 60, 0.28)');
        const flicker = Math.floor(clock * 6) % 2;
        ctx.font = `${13 + flicker * 2}px serif`;
        ctx.fillText('🔥', top.x, top.y - buildingHeight(tile) - 4);
      }
    });
    if (lastDiag >= 0) carsByDiag[lastDiag].forEach(drawCar);

    for (const puff of smoke) {
      ctx.globalAlpha = Math.max(0, (puff.life / puff.maxLife) * 0.45);
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % CITY_W;
      const y = Math.floor(hoverTile / CITY_W);
      const v = rotateTile(x, y, CITY_W, CITY_H, rotation);
      const valid = canBuild(tiles, x, y, selectedTool) && buildCost(tiles, x, y, selectedTool) <= money;
      strokeTile(ctx, VIEW, v.x, v.y, valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)', 2);
    }

    ctx.font = 'bold 10px monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    moneyEl.textContent = `£${Math.floor(money)}`;
    popEl.textContent = stats.population.toString();
    jobsEl.textContent = stats.jobs.toString();
    monthEl.textContent = month.toString();
    for (const zone of ['res', 'com', 'ind'] as ZoneType[]) {
      const value = demand[zone];
      demandBars[zone].style.height = `${((value + 50) / 100) * 100}%`;
      demandBars[zone].classList.toggle('negative', value < 0);
    }
  }

  // --- Input wiring ---

  function tileFromEvent(e: MouseEvent): number {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const dims = rotatedDims(CITY_W, CITY_H, rotation);
    const vi = isoTileFromPoint(VIEW, sx, sy, dims.w, dims.h);
    if (vi < 0) return -1;
    const { x, y } = unrotateTile(vi % dims.w, Math.floor(vi / dims.w), CITY_W, CITY_H, rotation);
    return cityIdx(x, y);
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
    const x = i % CITY_W;
    const y = Math.floor(i / CITY_W);
    if (!canBuild(tiles, x, y, selectedTool)) return;
    const cost = buildCost(tiles, x, y, selectedTool);
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    build(tiles, x, y, selectedTool);
    // Bulldozing a burning tile doubles as a firebreak
    fires = fires.filter(f => isFlammable(tiles[f.idx]));
    armedTile = -1;
    audio.playSfx('blip');
    refreshDerivedState();
  });

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTool = btn.dataset.tool as CityTool;
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

  function setRotation(rot: Rotation) {
    rotation = rot;
    VIEW = makeView(rotation);
    hoverTile = -1;
    armedTile = -1;
    // Screen-space particles were projected under the old rotation
    smoke = [];
    floaters = [];
  }
  document.getElementById('rotate-left')?.addEventListener('click', () => {
    setRotation(((rotation + 3) % 4) as Rotation);
  });
  document.getElementById('rotate-right')?.addEventListener('click', () => {
    setRotation(((rotation + 1) % 4) as Rotation);
  });

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    resetCity();
  });
  restartBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    resetCity();
  });

  const loop = createGameLoop(update, render);
  // A ClientRouter navigation detaches this game's DOM but not this loop;
  // stop it so revisits don't stack rAF loops drawing to orphaned canvases.
  document.addEventListener('astro:before-swap', () => loop.stop(), { once: true });
  loop.start();
}
