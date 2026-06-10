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
  let record = loadScore(RECORD_KEY);
  let powered = computePowered(tiles);
  let stats = cityStats(tiles);
  let demand = computeDemand(stats);

  recordEl.textContent = record.toString();

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
    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;
    clock += simDt;

    growthTimer += simDt;
    if (growthTimer >= GROWTH_INTERVAL) {
      growthTimer -= GROWTH_INTERVAL;
      const result = growthStep(tiles);
      if (result.grown || result.decayed) refreshDerivedState();

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

  function render() {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#101723');
    sky.addColorStop(1, '#0b111b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    forEachTileBackToFront(CITY_W, CITY_H, (x, y, i) => {
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

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % CITY_W;
      const y = Math.floor(hoverTile / CITY_W);
      const valid = canBuild(tiles, x, y, selectedTool) && TOOL_COSTS[selectedTool] <= money;
      strokeTile(ctx, VIEW, x, y, valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)', 2);
    }

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
