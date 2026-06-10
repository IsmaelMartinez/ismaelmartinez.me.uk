/**
 * Microcity — a pocket SimCity-style zoning sim.
 *
 * Pure rules live in tiles.ts / simulation.ts / budget.ts; this module owns
 * DOM wiring, the simulation loop, and canvas rendering. It expects the
 * markup defined in src/pages/[lang]/fun/city.astro.
 */
import { createGameLoop, loadScore, recordHighScore } from '../engine';
import {
  CITY_W,
  CITY_H,
  TOOL_COSTS,
  createCity,
  canBuild,
  build,
  cityIdx,
  isZone,
  type CityTile,
  type CityTool,
  type ZoneType
} from './tiles';
import { computePowered, roadAdjacent, cityStats, computeDemand, growthStep } from './simulation';
import { monthlyIncome, monthlyExpenses } from './budget';

const TILE = 32;
const WIDTH = CITY_W * TILE;
const HEIGHT = CITY_H * TILE;
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
const LEVEL_FONT = [0, 13, 18, 24];

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

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

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

  function drawRoad(i: number, px: number, py: number) {
    ctx.fillStyle = '#3a4150';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const x = i % CITY_W;
    const y = Math.floor(i / CITY_W);
    const connections: Array<[boolean, number, number]> = [
      [x > 0 && tiles[i - 1].type === 'road', px, cy],
      [x < CITY_W - 1 && tiles[i + 1].type === 'road', px + TILE, cy],
      [y > 0 && tiles[i - CITY_W].type === 'road', cx, py],
      [y < CITY_H - 1 && tiles[i + CITY_W].type === 'road', cx, py + TILE]
    ];
    let any = false;
    for (const [connected, tx, ty] of connections) {
      if (!connected) continue;
      any = true;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    if (!any) {
      ctx.beginPath();
      ctx.moveTo(px + 6, cy);
      ctx.lineTo(px + TILE - 6, cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function render() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < CITY_H; y++) {
      for (let x = 0; x < CITY_W; x++) {
        const i = cityIdx(x, y);
        const tile = tiles[i];
        const px = x * TILE;
        const py = y * TILE;

        ctx.fillStyle = (x + y) % 2 === 0 ? '#171e29' : '#1a2230';
        ctx.fillRect(px, py, TILE, TILE);

        if (tile.type === 'road') {
          drawRoad(i, px, py);
        } else if (tile.type === 'power') {
          ctx.fillStyle = '#2d2438';
          ctx.beginPath();
          ctx.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 5);
          ctx.fill();
          ctx.font = '20px serif';
          ctx.fillText('⚡', px + TILE / 2, py + TILE / 2 + 1);
        } else if (tile.type === 'park') {
          ctx.fillStyle = 'rgba(34, 84, 61, 0.55)';
          ctx.beginPath();
          ctx.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 5);
          ctx.fill();
          ctx.font = '18px serif';
          ctx.fillText('🌳', px + TILE / 2, py + TILE / 2 + 1);
        } else if (isZone(tile.type)) {
          ctx.fillStyle = ZONE_TINT[tile.type];
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = ZONE_BORDER[tile.type];
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
          if (tile.level > 0) {
            ctx.font = `${LEVEL_FONT[tile.level]}px serif`;
            ctx.fillText(ZONE_EMOJI[tile.type], px + TILE / 2, py + TILE / 2 + 1);
            // Unserviced developed zones flash a power warning
            if ((!powered[i] || !roadAdjacent(tiles, i)) && Math.floor(clock * 2) % 2 === 0) {
              ctx.font = '11px serif';
              ctx.fillText('⚠️', px + TILE - 8, py + 9);
            }
          }
        }
      }
    }

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % CITY_W;
      const y = Math.floor(hoverTile / CITY_W);
      const valid = canBuild(tiles, x, y, selectedTool) && TOOL_COSTS[selectedTool] <= money;
      ctx.strokeStyle = valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * TILE + 1.5, y * TILE + 1.5, TILE - 3, TILE - 3);
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
    const x = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / TILE);
    const y = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / TILE);
    if (x < 0 || x >= CITY_W || y < 0 || y >= CITY_H) return -1;
    return cityIdx(x, y);
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
