/**
 * Microcity — a pocket SimCity-style zoning sim.
 *
 * Pure rules live in tiles.ts / simulation.ts / budget.ts; this module owns
 * DOM wiring, the simulation loop, and canvas rendering. It expects the
 * markup defined in src/pages/[lang]/fun/city.astro.
 */
import {
  createGameLoop,
  loadScore,
  recordHighScore,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  drawBlock,
  forEachTileBackToFront,
  type IsoView
} from '../engine';
import {
  CITY_W,
  CITY_H,
  TOOL_COSTS,
  createCity,
  canBuild,
  build,
  isZone,
  type CityTile,
  type CityTool,
  type ZoneType
} from './tiles';
import { computePowered, roadAdjacent, cityStats, computeDemand, growthStep } from './simulation';
import { monthlyIncome, monthlyExpenses } from './budget';
import { targetCarCount, spawnCar, stepCar, type Car } from './traffic';

const VIEW: IsoView = { halfW: 20, halfH: 10, originX: CITY_H * 20, originY: 60 };
const CANVAS_W = (CITY_W + CITY_H) * VIEW.halfW;
const CANVAS_H = (CITY_W + CITY_H) * VIEW.halfH + VIEW.originY + 10;
const START_MONEY = 2500;
const MONTH_LENGTH = 20; // seconds of game time
const GROWTH_INTERVAL = 1.2;
const MILESTONES = [100, 250, 500, 1000, 2000];
const RECORD_KEY = 'city-record-pop';

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

type Phase = 'idle' | 'play' | 'over';

export function initCityGame(): void {
  const root = document.getElementById('city-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
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
    milestone: root.dataset.tMilestone || 'Population'
  };

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

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
  let clock = 0;
  let cars: Car[] = [];
  let smoke: { x: number; y: number; vx: number; r: number; life: number; maxLife: number }[] = [];
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];
  let record = loadScore(RECORD_KEY);
  let powered = computePowered(tiles);
  let stats = cityStats(tiles);
  let demand = computeDemand(stats);

  recordEl.textContent = record.toString();

  function addFloater(i: number, text: string, color: string) {
    const p = isoProject(VIEW, (i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.5);
    floaters.push({ x: p.x, y: p.y - zoneHeight(tiles[i].level) - 8, text, color, life: 1 });
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
    stats = cityStats(tiles);
    demand = computeDemand(stats);
  }

  function resetCity() {
    tiles = createCity();
    money = START_MONEY;
    month = 1;
    monthTimer = 0;
    growthTimer = 0;
    peakPop = 0;
    milestoneIdx = 0;
    speedMult = 1;
    cars = [];
    smoke = [];
    floaters = [];
    speedButtons.forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    refreshDerivedState();
    phase = 'play';
  }

  function gameOver() {
    phase = 'over';
    finalMonthsEl.textContent = month.toString();
    finalPopEl.textContent = peakPop.toString();
    overOverlay.style.display = 'flex';
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

    // Power plants puff smoke while the city runs
    tiles.forEach((tile, i) => {
      if (tile.type === 'power' && Math.random() < simDt * 1.6) {
        const p = isoProject(VIEW, (i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.35);
        smoke.push({
          x: p.x + (Math.random() - 0.5) * 4,
          y: p.y - 24,
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
      const result = growthStep(tiles);
      if (result.grown.length || result.decayed.length) refreshDerivedState();
      for (const i of result.grown) addFloater(i, '▲', '#4ade80');
      for (const i of result.decayed) addFloater(i, '▼', '#f87171');

      peakPop = Math.max(peakPop, stats.population);
      if (peakPop > record) {
        record = recordHighScore(RECORD_KEY, peakPop);
        recordEl.textContent = record.toString();
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
      if (money < 0) gameOver();
    }
  }

  // --- Rendering ---

  function drawRoad(i: number, x: number, y: number) {
    fillTile(ctx, VIEW, x, y, '#3a4150');
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const centre = isoProject(VIEW, x + 0.5, y + 0.5);
    const connections: Array<[boolean, number, number]> = [
      [x > 0 && tiles[i - 1].type === 'road', x, y + 0.5],
      [x < CITY_W - 1 && tiles[i + 1].type === 'road', x + 1, y + 0.5],
      [y > 0 && tiles[i - CITY_W].type === 'road', x + 0.5, y],
      [y < CITY_H - 1 && tiles[i + CITY_W].type === 'road', x + 0.5, y + 1]
    ];
    let any = false;
    for (const [connected, tx, ty] of connections) {
      if (!connected) continue;
      any = true;
      const edge = isoProject(VIEW, tx, ty);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }
    if (!any) {
      const a = isoProject(VIEW, x + 0.2, y + 0.5);
      const b = isoProject(VIEW, x + 0.8, y + 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Lit windows on the two visible faces of a developed zone block. */
  function drawWindows(x: number, y: number, i: number, level: number, height: number) {
    const inset = 0.08;
    const w = isoProject(VIEW, x + inset, y + 1 - inset);
    const s = isoProject(VIEW, x + 1 - inset, y + 1 - inset);
    const e = isoProject(VIEW, x + 1 - inset, y + inset);
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

  function carPos(car: Car): { x: number; y: number } {
    const fx = (car.from % CITY_W) + 0.5;
    const fy = Math.floor(car.from / CITY_W) + 0.5;
    const tx = (car.to % CITY_W) + 0.5;
    const ty = Math.floor(car.to / CITY_W) + 0.5;
    return { x: fx + (tx - fx) * car.progress, y: fy + (ty - fy) * car.progress };
  }

  function drawCar(car: Car) {
    const pos = carPos(car);
    const p = isoProject(VIEW, pos.x, pos.y);
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

    // Cars draw interleaved with their diagonal so blocks occlude them correctly
    const carsByDiag: Car[][] = Array.from({ length: CITY_W + CITY_H - 1 }, () => []);
    for (const car of cars) {
      const pos = carPos(car);
      const d = Math.min(
        CITY_W + CITY_H - 2,
        Math.max(0, Math.floor(pos.x) + Math.floor(pos.y))
      );
      carsByDiag[d].push(car);
    }

    let lastDiag = -1;
    forEachTileBackToFront(CITY_W, CITY_H, (x, y, i, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) carsByDiag[lastDiag].forEach(drawCar);
        lastDiag = diag;
      }
      const tile = tiles[i];
      const top = isoProject(VIEW, x + 0.5, y + 0.5);

      if (tile.type === 'road') {
        drawRoad(i, x, y);
        return;
      }

      fillTile(ctx, VIEW, x, y, (x + y) % 2 === 0 ? '#171e29' : '#1a2230');

      if (tile.type === 'power') {
        drawBlock(ctx, VIEW, x, y, 22, '#5b4a7a');
        ctx.font = '15px serif';
        ctx.fillText('⚡', top.x, top.y - 22);
      } else if (tile.type === 'park') {
        fillTile(ctx, VIEW, x, y, '#22543d');
        ctx.font = '14px serif';
        ctx.fillText('🌳', top.x, top.y - 5);
      } else if (isZone(tile.type)) {
        if (tile.level === 0) {
          fillTile(ctx, VIEW, x, y, ZONE_TINT[tile.type]);
          strokeTile(ctx, VIEW, x, y, ZONE_BORDER[tile.type], 1);
        } else {
          const height = zoneHeight(tile.level);
          drawBlock(ctx, VIEW, x, y, height, ZONE_BLOCK[tile.type]);
          drawWindows(x, y, i, tile.level, height);
          ctx.font = `${LEVEL_FONT[tile.level]}px serif`;
          ctx.fillText(ZONE_EMOJI[tile.type], top.x, top.y - height);
          // Unserviced developed zones flash a warning above the roof
          if ((!powered[i] || !roadAdjacent(tiles, i)) && Math.floor(clock * 2) % 2 === 0) {
            ctx.font = '11px serif';
            ctx.fillText('⚠️', top.x, top.y - height - 14);
          }
        }
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
      const valid = canBuild(tiles, x, y, selectedTool) && TOOL_COSTS[selectedTool] <= money;
      strokeTile(ctx, VIEW, x, y, valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)', 2);
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
    return isoTileFromPoint(VIEW, sx, sy, CITY_W, CITY_H);
  }

  canvas.addEventListener('mousemove', e => {
    hoverTile = tileFromEvent(e);
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTile = -1;
  });

  canvas.addEventListener('click', e => {
    if (phase !== 'play') return;
    const i = tileFromEvent(e);
    if (i < 0) return;
    const x = i % CITY_W;
    const y = Math.floor(i / CITY_W);
    if (!canBuild(tiles, x, y, selectedTool)) return;
    const cost = TOOL_COSTS[selectedTool];
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    build(tiles, x, y, selectedTool);
    refreshDerivedState();
  });

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTool = btn.dataset.tool as CityTool;
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
    resetCity();
  });
  restartBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    resetCity();
  });

  createGameLoop(update, render).start();
}
