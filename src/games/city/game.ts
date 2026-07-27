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
  setupHiDpiCanvas,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  blockFaceCorners,
  blockSeamPath,
  faceBandPath,
  drawBlock,
  shadeColor,
  hash01,
  blink,
  forEachTileBackToFront,
  rotatedDims,
  rotateTile,
  unrotateTile,
  rotatePoint,
  createViewRotator,
  createGameAudio,
  wireChannelButton,
  createToaster,
  createEffects,
  type IsoView,
  type Rotation
} from '../engine';
import {
  CITY_W,
  CITY_H,
  DENSE_LEVEL,
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
  growthStep,
  DENSITY_UNLOCK_POP
} from './simulation';
import { monthlyIncome, monthlyExpenses } from './budget';
import { targetCarCount, spawnCar, stepCar, computeCongestion, isCongested, type Car } from './traffic';
import { POP_MILESTONES, MILESTONE_GRANTS, METROPOLIS_INDEX } from './milestones';
import {
  isFlammable,
  ignitionChance,
  startFire,
  stepFires,
  rollEvent,
  sumDemandModifiers,
  disasterIntensity,
  tornadoChance,
  spawnTornado,
  stepTornado,
  quakeChance,
  earthquakeDamage,
  BURN_TICKS,
  BURN_TICKS_COVERED,
  type Fire,
  type Tornado,
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
/** Cars crawl to this fraction of their speed over a congested road tile, so
 *  traffic visibly clots at chokepoints. */
const CONGESTED_CAR_SPEED = 0.35;

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
/** Wall colour keeps the type recognisable (green/blue/yellow); roof/trim
 *  are accent colours for the per-level architectural details. */
const ZONE_PALETTE: Record<ZoneType, { wall: string; roof: string; trim: string }> = {
  res: { wall: '#3fae6e', roof: '#8a4a2e', trim: '#f4ede0' },
  com: { wall: '#4f86d6', roof: '#22406b', trim: '#f6f8ff' },
  ind: { wall: '#c8a23c', roof: '#5a5a5a', trim: '#3a3a3a' }
};
const ZONE_ICON_FONT = 13;
/** Rooftop mechanical units (AC boxes, tower plant) share one light grey so
 *  they read as equipment, not as a dark hole punched in the roofline. */
const ROOFTOP_UNIT = '#c9ced6';
/**
 * Hashed per-tile picks so grown blocks don't repeat identically.
 * ACCENT_COLORS is the shared accent palette: commercial awnings AND the
 * industrial silo company bands both draw from it — retune with both in
 * view.
 */
const ACCENT_COLORS = ['#c0503a', '#2f7a55', '#a3823a', '#7a4a8a'];
const SIGN_COLORS = ['#f6f8ff', '#e0b040', '#d06a8a'];
/** Overall silhouette height per (type, level) — tallest architectural
 *  feature — so floaters/warnings/emoji sit above the actual building. */
const ZONE_TOP_HEIGHT: Record<ZoneType, number[]> = {
  res: [0, 10, 14, 22, 30],
  com: [0, 7, 16, 25, 34],
  ind: [0, 8, 15, 26, 33]
};
const buildingHeight = (tile: CityTile): number => {
  // These include the smokestack/gable-roof-peak flourish drawn on top of
  // the base block, so fire icons and smoke line up above the whole shape.
  if (tile.type === 'power') return 38;
  if (tile.type === 'school' || tile.type === 'firehouse' || tile.type === 'police') return 20;
  if (!isZone(tile.type)) return 0;
  const level = Math.min(Math.max(tile.level, 0), DENSE_LEVEL);
  return ZONE_TOP_HEIGHT[tile.type][level];
};

type Phase = 'idle' | 'play' | 'over';

export function initCityGame(): void {
  const root = document.getElementById('city-root');
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
  const popEl = el('population');
  const jobsEl = el('jobs');
  const monthEl = el('month');
  const recordEl = el('record');
  const finalMonthsEl = el('final-months');
  const finalPopEl = el('final-pop');
  const objectiveEl = el('objective');
  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea);
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
    objPop: root.dataset.tObjPop || '{n} residents',
    established: root.dataset.tEstablished || 'Metropolis — endless!',
    fireAlert: root.dataset.tFireAlert || 'Fire has broken out!',
    tornadoAlert: root.dataset.tTornadoAlert || 'Tornado touching down!',
    quakeAlert: root.dataset.tQuakeAlert || 'Earthquake!',
    crimeAlert: root.dataset.tCrimeAlert || 'Crime is rising. Build a police station!',
    densityUnlocked: root.dataset.tDensityUnlocked || 'High-density zoning unlocked!',
    newRecord: root.dataset.tNewRecord || 'New record population!',
    events: {
      grant: root.dataset.tEventGrant || 'Government grant awarded',
      protest: root.dataset.tEventProtest || 'Tax protest at the town hall',
      festival: root.dataset.tEventFestival || 'Street festival draws crowds',
      strike: root.dataset.tEventStrike || 'Factory workers on strike',
      boom: root.dataset.tEventBoom || 'Business is booming'
    } satisfies Record<CityEventId, string>
  };

  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H);

  // On narrow screens the board keeps a minimum size inside a pannable
  // container; start the view centred.
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  // Cozy city-builder bed in C major (I–vi–IV–V): a warm pad, a sparse bell
  // arpeggio, and a slow bass — SimCity-relaxed, unhurried.
  const audio = createGameAudio({
    tempo: 104,
    volume: 0.12,
    echo: { time: 0.3, feedback: 0.2, mix: 0.18 },
    tracks: [
      // PAD: sustained warm chord roots, a soft bed under everything.
      {
        wave: 'triangle',
        envelope: 'pad',
        detune: 6,
        volume: 0.45,
        melody: [
          { freq: 261.63, beats: 4 }, // C4  (I)
          { freq: 220.0, beats: 4 }, // A3  (vi)
          { freq: 174.61, beats: 4 }, // F3  (IV)
          { freq: 196.0, beats: 4 } // G3  (V)
        ]
      },
      // LEAD: light, unhurried bell arpeggio tracing each chord, with rests.
      {
        wave: 'sine',
        envelope: 'pluck',
        volume: 0.85,
        melody: [
          { freq: 523.25, beats: 1 }, // C5
          { freq: 659.25, beats: 1 }, // E5
          { freq: 783.99, beats: 1 }, // G5
          { freq: 0, beats: 1 },
          { freq: 440.0, beats: 1 }, // A4
          { freq: 523.25, beats: 1 }, // C5
          { freq: 659.25, beats: 1 }, // E5
          { freq: 0, beats: 1 },
          { freq: 523.25, beats: 1 }, // C5
          { freq: 440.0, beats: 1 }, // A4
          { freq: 698.46, beats: 1 }, // F5
          { freq: 0, beats: 1 },
          { freq: 587.33, beats: 1 }, // D5
          { freq: 783.99, beats: 1 }, // G5
          { freq: 493.88, beats: 1 }, // B4
          { freq: 0, beats: 1 }
        ]
      },
      // BASS: slow whole notes rooting the progression.
      {
        wave: 'triangle',
        volume: 0.7,
        melody: [
          { freq: 65.41, beats: 4 }, // C2  (I)
          { freq: 110.0, beats: 4 }, // A2  (vi)
          { freq: 87.31, beats: 4 }, // F2  (IV)
          { freq: 98.0, beats: 4 } // G2  (V)
        ]
      }
    ]
  });
  wireChannelButton(document.getElementById('music-btn'), audio, 'music');
  wireChannelButton(document.getElementById('sfx-btn'), audio, 'sfx');

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
  /** Set once the metropolis milestone is reached — play continues endless. */
  let established = false;
  let selectedTool: CityTool = 'road';
  let speedMult = 1;
  let hoverTile = -1;
  let armedTile = -1;
  let clock = 0;
  let rotation: Rotation = 0;
  let VIEW = makeView(rotation);
  let cars: Car[] = [];
  let fires: Fire[] = [];
  let tornado: Tornado | null = null;
  let shake = 0; // seconds of screen shake left (earthquakes)
  let densityToastShown = false;
  let crimeToastShown = false;
  let activeEvents: ActiveEvent[] = [];
  let smoke: { x: number; y: number; vx: number; r: number; life: number; maxLife: number }[] = [];
  let sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  // Floaters live in the shared effects module; smoke and sparks stay local
  // (their life*2 alpha ramp and stepped sizes diverge from its draw model).
  const fx = createEffects({ floaterSize: 10, floaterRise: 14, floaterLife: 1 });
  const board = initScoreboard(document.getElementById('highscores'));
  let powered = computePowered(tiles);
  let fireCover = computeFireCover(tiles);
  let stats = cityStats(tiles);
  let demand = computeDemand(stats);
  // Which road tiles are congested — congestion is a pure function of the
  // slow-changing grid, so it's recomputed only in refreshDerivedState and the
  // cached booleans are reused by both the growth choke and the per-frame car
  // slowdown (no per-tick re-derivation).
  let congested = computeCongestion(tiles).map(isCongested);

  // The record readout shows the table's best, beaten live by the current run.
  recordEl.textContent = board.best().toString();
  // Seed the goal strip with the first milestone before the run starts.
  renderObjective();

  /** Projects fractional world-tile coordinates through the current rotation. */
  function projectWorld(tx: number, ty: number): { x: number; y: number } {
    const p = rotatePoint(tx, ty, CITY_W, CITY_H, rotation);
    return isoProject(VIEW, p.tx, p.ty);
  }

  function addFloater(i: number, text: string, color: string) {
    const p = projectWorld((i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.5);
    fx.floater(p.x, p.y - buildingHeight(tiles[i]) - 8, text, color);
  }

  /** A little celebratory (or calamitous) burst of sparks over a tile. */
  function addSparks(i: number, color: string, count = 8) {
    const p = projectWorld((i % CITY_W) + 0.5, Math.floor(i / CITY_W) + 0.5);
    const y = p.y - buildingHeight(tiles[i]) - 4;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = 12 + Math.random() * 26;
      sparks.push({
        x: p.x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 18,
        life: 0.5 + Math.random() * 0.4,
        color
      });
    }
  }

  function refreshDerivedState() {
    powered = computePowered(tiles);
    fireCover = computeFireCover(tiles);
    stats = cityStats(tiles);
    demand = computeDemand(stats, sumDemandModifiers(activeEvents));
    congested = computeCongestion(tiles).map(isCongested);
  }

  /** Paints the goal strip: the next population milestone and progress, or the
   *  "metropolis" banner once the city is established. */
  function renderObjective() {
    if (established || milestoneIdx >= POP_MILESTONES.length) {
      if (objectiveEl.textContent !== strings.established) objectiveEl.textContent = strings.established;
      return;
    }
    const target = POP_MILESTONES[milestoneIdx];
    const label = strings.objPop.replace('{n}', target.toString());
    const text = `${label} (${Math.min(stats.population, target)}/${target})`;
    if (objectiveEl.textContent !== text) objectiveEl.textContent = text;
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
    established = false;
    speedMult = 1;
    cars = [];
    fires = [];
    tornado = null;
    shake = 0;
    densityToastShown = false;
    crimeToastShown = false;
    board.beginRun();
    activeEvents = [];
    smoke = [];
    sparks = [];
    fx.clear();
    speedButtons.forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    refreshDerivedState();
    renderObjective();
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
    rotator.update(dt);

    fx.update(dt);
    if (shake > 0) shake = Math.max(0, shake - dt);
    smoke = smoke.filter(s => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y -= 14 * dt;
      s.r += 3.5 * dt;
      return s.life > 0;
    });
    sparks = sparks.filter(s => {
      s.life -= dt;
      s.vy += 70 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      return s.life > 0;
    });

    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;
    clock += simDt;

    // Traffic scaled to the population; cars crawl over congested tiles, so
    // chokepoints visibly clot (the same congestion throttles growth below).
    cars = cars.filter(car => {
      const slow = congested[car.to] || congested[car.from];
      return stepCar(tiles, car, simDt * (slow ? CONGESTED_CAR_SPEED : 1));
    });
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
      const result = growthStep(tiles, Math.random, sumDemandModifiers(activeEvents), congested);
      if (result.grown.length || result.decayed.length) refreshDerivedState();
      for (const i of result.grown) {
        addFloater(i, '▲', '#4ade80');
        addSparks(i, '#4ade80', 6);
      }
      for (const i of result.decayed) addFloater(i, '▼', '#f87171');
      // One-time nudge the first time crime bites, so the player learns the
      // new pressure rather than watching an unexplained district shrink.
      if (result.crimeDecayed.length && !crimeToastShown) {
        crimeToastShown = true;
        showToast(`🚨 ${strings.crimeAlert}`);
      }

      // Chaos: active fires spread and burn down; new ones spark up
      if (fires.length) {
        const burnt = stepFires(tiles, fires, fireCover, Math.random);
        fires = burnt.fires;
        for (const i of burnt.spread) addFloater(i, '🔥', '#fb923c');
        // Fire crews contained a blaze: the tile is saved, so cheer it with a
        // splash floater and a soft chime (no derived-state refresh — nothing
        // on the tile changed).
        for (const i of burnt.extinguished) {
          addFloater(i, '💧', '#38bdf8');
          addSparks(i, '#38bdf8', 5);
        }
        if (burnt.extinguished.length) audio.playSfx('rescue');
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

      // Late-game weather: a roaming tornado, its odds ramping with the
      // city's age and size.
      const intensity = disasterIntensity(month, stats.population);
      if (tornado) {
        const step = stepTornado(tiles, tornado, Math.random);
        tornado = step.tornado;
        if (step.wrecked.length) {
          for (const i of step.wrecked) addFloater(i, '💥', '#fbbf24');
          audio.playSfx('hit');
          refreshDerivedState();
        }
      } else if (Math.random() < tornadoChance(intensity)) {
        tornado = spawnTornado(Math.random);
        showToast(`🌪️ ${strings.tornadoAlert}`);
        audio.playSfx('explosion');
      }

      if (!densityToastShown && stats.population >= DENSITY_UNLOCK_POP) {
        densityToastShown = true;
        showToast(`🏙️ ${strings.densityUnlocked}`);
      }

      peakPop = Math.max(peakPop, stats.population);
      // Banking stashes a grown peak immediately, so a mid-run tab close
      // keeps the record; beating an established best is worth a fanfare.
      const { best, newRecord } = board.bank(peakPop);
      if (recordEl.textContent !== best.toString()) recordEl.textContent = best.toString();
      if (newRecord) {
        showToast(`🏅 ${strings.newRecord}`);
        audio.playSfx('score');
      }
      // Milestones with teeth: each crossing pays a cash grant, and the last
      // (metropolis) is the prestige win — play continues endless after it.
      while (milestoneIdx < POP_MILESTONES.length && stats.population >= POP_MILESTONES[milestoneIdx]) {
        const grant = MILESTONE_GRANTS[milestoneIdx];
        money += grant;
        showToast(`🏙️ ${strings.milestone} ${POP_MILESTONES[milestoneIdx]} +£${grant}`);
        if (milestoneIdx === METROPOLIS_INDEX) {
          established = true;
          showToast(`🏆 ${strings.established}`);
        }
        audio.playSfx('score');
        milestoneIdx++;
      }
      renderObjective();
    }

    monthTimer += simDt;
    if (monthTimer >= MONTH_LENGTH) {
      monthTimer -= MONTH_LENGTH;
      month++;
      const income = monthlyIncome(stats);
      const expenses = monthlyExpenses(tiles, stats);
      money += income - expenses;
      showToast(`${strings.month} ${month} · ${strings.income} +£${income} · ${strings.expenses} -£${expenses}`);

      // Geology: the ground itself turns hostile in the late game
      if (Math.random() < quakeChance(disasterIntensity(month, stats.population))) {
        const quake = earthquakeDamage(tiles, Math.random);
        for (const i of quake.damaged) addFloater(i, '💥', '#f87171');
        for (const i of quake.ignited) {
          if (!fires.some(f => f.idx === i)) {
            fires.push({ idx: i, ticks: fireCover[i] ? BURN_TICKS_COVERED : BURN_TICKS });
            addFloater(i, '🔥', '#fb923c');
          }
        }
        shake = 0.9;
        showToast(`🫨 ${strings.quakeAlert}`);
        audio.playSfx('explosion');
        refreshDerivedState();
      }

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
    fillTile(ctx, VIEW, vx, vy, '#123c5f');
    // Slow diagonal current bands drifting with time
    const wave = Math.sin((x + y) * 0.9 - clock * 1.6);
    if (wave > 0.35) {
      fillTile(ctx, VIEW, vx, vy, `rgba(30, 92, 138, ${0.35 + wave * 0.25})`);
    }
    // Smoothly pulsing sparkle rather than an on/off flicker
    const sparkle = Math.sin(x * 12.9 + y * 7.3 + clock * 2.2) * 0.5 + 0.5;
    if (sparkle > 0.82) {
      fillTile(ctx, VIEW, vx, vy, `rgba(186, 230, 253, ${(sparkle - 0.82) * 2.2})`);
    }
  }

  /** Stable per-tile flecks that fake a grassy/dirt texture on bare ground. */
  function drawGroundFlecks(x: number, y: number) {
    const hash = (x * 928371 + y * 12345) >>> 0;
    for (let k = 0; k < 3; k++) {
      const h = (hash >> (k * 5)) & 31;
      if (h % 4 !== 0) continue;
      const fx = 0.15 + ((h * 7) % 70) / 100;
      const fy = 0.2 + ((h * 13) % 60) / 100;
      const p = projectWorld(x + fx, y + fy);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.07)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Soft grounding shadow so flat emoji tiles don't look like stickers. */
  function drawFlatShadow(top: { x: number; y: number }, rx: number, ry: number) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 3, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Extruded box between explicit fractional tile-space corners, elevated
   * from zBase to zTop. Generalises drawBlock's fixed full-tile inset so
   * buildings can combine several offset, non-centred volumes instead of
   * one block that just gets taller.
   */
  function drawBox(x0: number, y0: number, x1: number, y1: number, zBase: number, zTop: number, baseColor: string) {
    const n = isoProject(VIEW, x0, y0);
    const e = isoProject(VIEW, x1, y0);
    const s = isoProject(VIEW, x1, y1);
    const w = isoProject(VIEW, x0, y1);

    ctx.fillStyle = shadeColor(baseColor, 0.62);
    ctx.beginPath();
    ctx.moveTo(w.x, w.y - zTop);
    ctx.lineTo(s.x, s.y - zTop);
    ctx.lineTo(s.x, s.y - zBase);
    ctx.lineTo(w.x, w.y - zBase);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeColor(baseColor, 0.45);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - zTop);
    ctx.lineTo(e.x, e.y - zTop);
    ctx.lineTo(e.x, e.y - zBase);
    ctx.lineTo(s.x, s.y - zBase);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeColor(baseColor, 1.05);
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - zTop);
    ctx.lineTo(e.x, e.y - zTop);
    ctx.lineTo(s.x, s.y - zTop);
    ctx.lineTo(w.x, w.y - zTop);
    ctx.closePath();
    ctx.fill();
    // Crisp rim on the top edge, and a highlight down the near vertical
    // edge, so the block reads as solid geometry rather than a flat cutout.
    ctx.strokeStyle = shadeColor(baseColor, 1.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = shadeColor(baseColor, 0.85);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - zTop);
    ctx.lineTo(s.x, s.y - zBase);
    ctx.stroke();
  }

  /**
   * Pitched-roof ridge silhouette over an explicit footprint, sitting on
   * top of a box whose roofline is at zBase. The eave line runs between
   * the W and E diamond corners — the N–S pair projects to a single
   * screen x (iso x is (tx−ty)·halfW, and the corners share tx−ty on any
   * square-ish footprint), which would collapse the triangles to zero
   * area. The triangle splits into a lit and a shaded slope with a ridge
   * highlight so the pitch reads; roof *variety* comes from callers
   * alternating this with drawPyramidCap (hipped), not from re-aiming
   * the ridge.
   */
  function drawGableRoof(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    zBase: number,
    peakRise: number,
    color: string
  ) {
    const a = isoProject(VIEW, x0, y1);
    const b = isoProject(VIEW, x1, y0);
    const peak = isoProject(VIEW, (x0 + x1) / 2, (y0 + y1) / 2);
    const py = peak.y - zBase - peakRise;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - zBase;
    ctx.fillStyle = shadeColor(color, 1.05);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - zBase);
    ctx.lineTo(peak.x, py);
    ctx.lineTo(mx, my);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 1.35);
    ctx.beginPath();
    ctx.moveTo(peak.x, py);
    ctx.lineTo(b.x, b.y - zBase);
    ctx.lineTo(mx, my);
    ctx.closePath();
    ctx.fill();
    // Ridge highlight and eave shadow line.
    ctx.strokeStyle = shadeColor(color, 1.6);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - zBase);
    ctx.lineTo(peak.x, py);
    ctx.lineTo(b.x, b.y - zBase);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(color, 0.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - zBase);
    ctx.lineTo(mx, my);
    ctx.lineTo(b.x, b.y - zBase);
    ctx.stroke();
  }

  function drawRoofRidge(vx: number, vy: number, height: number, color: string) {
    drawGableRoof(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, height, 6, color);
  }

  /** Pointed cap (silo lid, rooftop dome) rising to a single peak above a
   *  footprint, built from the same two visible faces as drawBox. */
  function drawPyramidCap(x0: number, y0: number, x1: number, y1: number, zBase: number, peakRise: number, color: string) {
    const e = isoProject(VIEW, x1, y0);
    const s = isoProject(VIEW, x1, y1);
    const w = isoProject(VIEW, x0, y1);
    const peakXY = isoProject(VIEW, (x0 + x1) / 2, (y0 + y1) / 2);
    const apex = { x: peakXY.x, y: peakXY.y - zBase - peakRise };
    ctx.fillStyle = shadeColor(color, 0.75);
    ctx.beginPath();
    ctx.moveTo(w.x, w.y - zBase);
    ctx.lineTo(s.x, s.y - zBase);
    ctx.lineTo(apex.x, apex.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - zBase);
    ctx.lineTo(e.x, e.y - zBase);
    ctx.lineTo(apex.x, apex.y);
    ctx.closePath();
    ctx.fill();
    // Ridge between the two visible (front) faces, not the back one — the
    // back ridge would be occluded and shouldn't be drawn over them.
    ctx.strokeStyle = shadeColor(color, 1.3);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - zBase);
    ctx.lineTo(apex.x, apex.y);
    ctx.stroke();
  }

  function drawRoad(i: number, vx: number, vy: number, dims: { w: number; h: number }) {
    if (tiles[i].type === 'bridge') {
      drawWater(i % CITY_W, Math.floor(i / CITY_W), vx, vy);
      fillTile(ctx, VIEW, vx, vy, 'rgba(94, 82, 60, 0.85)');
      // Wooden plank texture across the deck
      ctx.strokeStyle = 'rgba(40, 32, 20, 0.5)';
      ctx.lineWidth = 1;
      for (let p = 0.2; p < 1; p += 0.28) {
        const a = isoProject(VIEW, vx + p, vy);
        const b = isoProject(VIEW, vx + p + 0.12, vy + 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
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

  /** Lit windows on the two visible faces of an explicit footprint box. */
  function drawWindows(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    i: number,
    rows: number,
    zBase: number,
    zTop: number,
    salt = 0
  ) {
    const w = isoProject(VIEW, x0, y1);
    const s = isoProject(VIEW, x1, y1);
    const e = isoProject(VIEW, x1, y0);
    const faces: [{ x: number; y: number }, { x: number; y: number }][] = [[w, s], [s, e]];
    const rise = zTop - zBase;
    // Framed two-pane windows, batched into one path per colour (frame,
    // lit glass, dark glass, mullion+sill) instead of four fillStyle
    // swaps per window — a grown city redraws every window every frame,
    // so draw-call count is the budget, not the arithmetic.
    for (let pass = 0; pass < 4; pass++) {
      ctx.fillStyle =
        pass === 0
          ? 'rgba(12, 18, 32, 0.65)'
          : pass === 1
            ? 'rgba(254, 240, 138, 0.9)'
            : pass === 2
              ? 'rgba(64, 84, 110, 0.65)'
              : 'rgba(226, 232, 240, 0.3)';
      ctx.beginPath();
      faces.forEach(([a, b], f) => {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 2; c++) {
            // Stable per-window pattern: most lit, some dark
            const lit = (i * 31 + f * 17 + r * 7 + c * 13 + salt * 19) % 5 < 3;
            if (pass === 1 && !lit) continue;
            if (pass === 2 && lit) continue;
            const t = 0.3 + c * 0.4;
            const bx = a.x + (b.x - a.x) * t;
            const by = a.y + (b.y - a.y) * t - zBase - rise * ((r + 0.5) / rows);
            if (pass === 0) ctx.rect(bx - 1.4, by - 2, 2.8, 4);
            else if (pass === 3) ctx.rect(bx - 1.6, by + 2, 3.2, 0.5);
            else if (lit) {
              // Lit glass as two half-panes; the gap reads as the mullion.
              ctx.rect(bx - 1, by - 1.6, 0.75, 3.2);
              ctx.rect(bx + 0.25, by - 1.6, 0.75, 3.2);
            } else {
              ctx.rect(bx - 1, by - 1.6, 2, 3.2);
            }
          }
        }
      });
      ctx.fill();
    }
  }

  /** Street door on the south-west face of a box, at fraction `t` along it. */
  function drawDoor(x0: number, y0: number, x1: number, y1: number, t: number, leaf: string) {
    const w = isoProject(VIEW, x0, y1);
    const s = isoProject(VIEW, x1, y1);
    const dx = w.x + (s.x - w.x) * t;
    const dy = w.y + (s.y - w.y) * t;
    ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.fillRect(dx - 1.5, dy - 4.8, 3, 4.8);
    ctx.fillStyle = leaf;
    ctx.fillRect(dx - 1.05, dy - 4.3, 2.1, 4.3);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.7)';
    ctx.fillRect(dx - 1.05, dy - 4.3, 2.1, 0.8);
  }

  /** Brick chimney poking through a roof at tile-space (px, py). */
  function drawChimney(px: number, py: number, zBase: number) {
    const c = isoProject(VIEW, px, py);
    ctx.fillStyle = '#7a4a3a';
    ctx.fillRect(c.x - 1.25, c.y - zBase - 4, 2.5, 4);
    ctx.fillStyle = '#4f2f24';
    ctx.fillRect(c.x + 0.25, c.y - zBase - 4, 1, 4);
    ctx.fillStyle = '#9a6a52';
    ctx.fillRect(c.x - 1.5, c.y - zBase - 4.9, 3, 1);
  }

  /**
   * Industrial smokestack with a lit edge and a hazard-striped tip —
   * shared by the heavy-industry tiers and the power plant.
   */
  function drawStack(px: number, py: number, zBase: number, h: number, w: number, color: string) {
    const c = isoProject(VIEW, px, py);
    ctx.fillStyle = shadeColor(color, 0.7);
    ctx.fillRect(c.x - w / 2, c.y - zBase - h, w, h);
    ctx.fillStyle = shadeColor(color, 1.05);
    ctx.fillRect(c.x - w / 2, c.y - zBase - h, w * 0.35, h);
    ctx.fillStyle = '#ded8ca';
    ctx.fillRect(c.x - w / 2, c.y - zBase - h - 3, w, 3);
    ctx.fillStyle = '#c0503a';
    ctx.fillRect(c.x - w / 2, c.y - zBase - h - 3, w, 1.4);
  }

  /** Thin rooftop mast/flagpole: one pale stroke rising from screen-space
   *  yBase to yTop — shared by the high-rise antennas and the school's
   *  flagpole. Whatever tops it (beacon, flag) stays at the call site. */
  function drawMast(x: number, yBase: number, yTop: number, width = 0.75) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    ctx.lineTo(x, yTop);
    ctx.stroke();
  }

  /** Small ledge accents (balconies, AC units) protruding from a face at a
   *  given row height — reuses the window face geometry but wider/flatter. */
  function drawLedges(x0: number, y0: number, x1: number, y1: number, rows: number, zBase: number, zTop: number, color: string) {
    const w = isoProject(VIEW, x0, y1);
    const s = isoProject(VIEW, x1, y1);
    const e = isoProject(VIEW, x1, y0);
    const faces: [{ x: number; y: number }, { x: number; y: number }][] = [[w, s], [s, e]];
    const rise = zTop - zBase;
    ctx.fillStyle = color;
    faces.forEach(([a, b]) => {
      for (let r = 0; r < rows; r++) {
        const by = a.y + (b.y - a.y) * 0.5 - zBase - rise * ((r + 0.5) / rows);
        const bx = a.x + (b.x - a.x) * 0.5;
        ctx.fillRect(bx - 5, by + 1, 10, 1.5);
      }
    });
  }

  /**
   * Per-tile memo for hashed variety. The hash01 rolls — and the shadeColor
   * strings and palette picks derived from them — are pure in (tile index,
   * type, level), i.e. they only change when a tile is built, grows,
   * decays, or is destroyed. Each drawer recomputes its variety through
   * here only when its `${type}:${level}` key changes, instead of
   * re-hashing and rebuilding colour strings every frame. Computes are
   * named functions (not inline closures) so a cache hit allocates
   * nothing.
   */
  const variety: ({ key: string; value: unknown } | null)[] = new Array(tiles.length).fill(null);
  function varietyFor<T>(i: number, key: string, compute: (tile: number) => T): T {
    const hit = variety[i];
    if (hit && hit.key === key) return hit.value as T;
    const value = compute(i);
    variety[i] = { key, value };
    return value;
  }

  /** House (res L1): small gabled cottage, footprint well inside the tile.
   *  Hashed variety: wall tint, ridge axis, chimney, door position. */
  const res1Variety = (i: number) => ({
    wall: shadeColor(ZONE_PALETTE.res.wall, 0.88 + hash01(i, 21) * 0.28),
    gable: hash01(i, 22) < 0.5,
    doorT: hash01(i, 25) < 0.5 ? 0.3 : 0.7,
    chimney: hash01(i, 23) > 0.45
  });

  function drawResLevel1(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.res;
    const v = varietyFor(i, 'res:1', res1Variety);
    const x0 = vx + 0.27, y0 = vy + 0.24, x1 = vx + 0.73, y1 = vy + 0.7;
    drawBox(x0, y0, x1, y1, 0, 6, v.wall);
    // Construction variety: half the cottages get a gable, half a hip.
    if (v.gable) drawGableRoof(x0, y0, x1, y1, 6, 4, p.roof);
    else drawPyramidCap(x0, y0, x1, y1, 6, 4, p.roof);
    drawWindows(x0, y0, x1, y1, i, 1, 0, 6);
    drawDoor(x0, y0, x1, y1, v.doorT, shadeColor(p.roof, 0.8));
    if (v.chimney) drawChimney(vx + 0.38, vy + 0.34, 8);
  }

  /** Res L2: the L1 cottage enlarged, plus a lower extension massed off to
   *  one side rather than centred — reads as "someone built onto the house". */
  const res2Variety = (i: number) => ({
    wall: shadeColor(ZONE_PALETTE.res.wall, 0.88 + hash01(i, 24) * 0.28),
    gable: hash01(i, 22) < 0.5,
    chimney: hash01(i, 26) > 0.4
  });

  function drawResLevel2(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.res;
    const v = varietyFor(i, 'res:2', res2Variety);
    const mx0 = vx + 0.18, my0 = vy + 0.16, mx1 = vx + 0.66, my1 = vy + 0.7;
    drawBox(mx0, my0, mx1, my1, 0, 10, v.wall);
    if (v.gable) drawGableRoof(mx0, my0, mx1, my1, 10, 4, p.roof);
    else drawPyramidCap(mx0, my0, mx1, my1, 10, 4, p.roof);
    drawWindows(mx0, my0, mx1, my1, i, 2, 0, 10);
    drawDoor(mx0, my0, mx1, my1, 0.5, shadeColor(p.roof, 0.8));
    if (v.chimney) drawChimney(vx + 0.3, vy + 0.28, 12);

    // Touches the main block's east wall (mx1) without overlapping its
    // footprint, so the two full-height volumes don't paint over each other.
    const ex0 = mx1, ey0 = vy + 0.5, ex1 = vx + 0.95, ey1 = vy + 0.92;
    drawBox(ex0, ey0, ex1, ey1, 0, 6, v.wall);
    drawWindows(ex0, ey0, ex1, ey1, i, 1, 0, 6, 1);
  }

  /** Res L3: a proper apartment block — flat roof, balcony ledges, and a
   *  couple of rooftop AC units instead of one more storey of the cottage. */
  const res3Variety = (i: number) => ({
    wall: shadeColor(ZONE_PALETTE.res.wall, 0.92 + hash01(i, 27) * 0.18),
    acBox: hash01(i, 28) > 0.5
  });

  function drawResLevel3(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.res;
    const v = varietyFor(i, 'res:3', res3Variety);
    const x0 = vx + 0.12, y0 = vy + 0.12, x1 = vx + 0.88, y1 = vy + 0.88;
    drawBox(x0, y0, x1, y1, 0, 20, v.wall);
    drawWindows(x0, y0, x1, y1, i, 4, 0, 20);
    drawLedges(x0, y0, x1, y1, 4, 0, 20, 'rgba(226, 232, 240, 0.55)');
    drawDoor(x0, y0, x1, y1, 0.5, shadeColor(p.wall, 0.5));
    drawBox(vx + 0.2, vy + 0.2, vx + 0.34, vy + 0.34, 20, 22, ROOFTOP_UNIT);
    drawBox(vx + 0.55, vy + 0.6, vx + 0.72, vy + 0.75, 20, 21.5, ROOFTOP_UNIT);
    if (v.acBox) drawBox(vx + 0.62, vy + 0.24, vx + 0.74, vy + 0.36, 20, 21.8, ROOFTOP_UNIT);
  }

  /** Res L4: a slim high-rise — the dense-city payoff. Two stacked volumes
   *  with a rooftop plant box, noticeably taller than anything at L3. */
  const res4Variety = (i: number) => {
    const wall = shadeColor(ZONE_PALETTE.res.wall, 0.92 + hash01(i, 29) * 0.18);
    return {
      wall,
      wallTop: shadeColor(wall, 1.12),
      mast: hash01(i, 30) > 0.55
    };
  };

  function drawResLevel4(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.res;
    const v = varietyFor(i, 'res:4', res4Variety);
    const x0 = vx + 0.16, y0 = vy + 0.16, x1 = vx + 0.84, y1 = vy + 0.84;
    drawBox(x0, y0, x1, y1, 0, 24, v.wall);
    drawWindows(x0, y0, x1, y1, i, 5, 0, 24);
    drawLedges(x0, y0, x1, y1, 5, 0, 24, 'rgba(226, 232, 240, 0.55)');
    drawDoor(x0, y0, x1, y1, 0.5, shadeColor(p.wall, 0.5));
    const tx0 = vx + 0.3, ty0 = vy + 0.3, tx1 = vx + 0.7, ty1 = vy + 0.7;
    drawBox(tx0, ty0, tx1, ty1, 24, 29, v.wallTop);
    drawBox(vx + 0.42, vy + 0.42, vx + 0.58, vy + 0.58, 29, 30.5, ROOFTOP_UNIT);
    if (v.mast) {
      const mast = isoProject(VIEW, vx + 0.5, vy + 0.5);
      drawMast(mast.x, mast.y - 30.5, mast.y - 35);
    }
  }

  /** Canopy blob layout + flower roll for park/tree landscaping. The
   *  flower roll is computed for trees too (unused) — the record is shared
   *  and the rolls are pure in the tile index either way. */
  const greenVariety = (i: number) => ({
    blobs: [0, 1, 2].map(k => ({
      bx: 0.2 + hash01(i, 51 + k) * 0.6,
      by: 0.2 + hash01(i, 54 + k) * 0.6,
      r: 1.6 + hash01(i, 57 + k) * 1.6
    })),
    flower:
      hash01(i, 60) > 0.4
        ? {
            fdx: hash01(i, 61) * 0.4,
            fdy: hash01(i, 62) * 0.4,
            color: hash01(i, 63) > 0.5 ? '#f0a8bc' : '#f6d860'
          }
        : null
  });

  function drawResZone(vx: number, vy: number, i: number, level: number) {
    if (level === 1) drawResLevel1(vx, vy, i);
    else if (level === 2) drawResLevel2(vx, vy, i);
    else if (level === 3) drawResLevel3(vx, vy, i);
    else drawResLevel4(vx, vy, i);
  }

  /** Shop (com L1): flat-roofed box with a glazed shopfront and an awning
   *  in a hashed colour, so a parade of shops doesn't repeat. */
  const com1Variety = (i: number) => ({
    awning: ACCENT_COLORS[Math.floor(hash01(i, 31) * ACCENT_COLORS.length)]
  });

  function drawComLevel1(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.com;
    const x0 = vx + 0.2, y0 = vy + 0.2, x1 = vx + 0.8, y1 = vy + 0.8;
    drawBox(x0, y0, x1, y1, 0, 7, p.wall);
    drawWindows(x0, y0, x1, y1, i, 1, 0, 7);
    // Glazed shopfront band along the street face, under the awning.
    const w = isoProject(VIEW, x0, y1);
    const s = isoProject(VIEW, x1, y1);
    ctx.fillStyle = 'rgba(140, 200, 240, 0.45)';
    ctx.beginPath();
    faceBandPath(ctx, w, s, 0.12, 0.88, 0.8, 3.6);
    ctx.fill();
    // Thin awning strip flush with the front wall, overhanging it slightly.
    drawBox(vx + 0.14, vy + 0.72, vx + 0.86, vy + 0.9, 3, 3.8, varietyFor(i, 'com:1', com1Variety).awning);
  }

  /** Com L2: taller storefront with more window rows and a sign board
   *  standing proud of the roofline. */
  const com2Variety = (i: number) => ({
    sign: SIGN_COLORS[Math.floor(hash01(i, 32) * SIGN_COLORS.length)]
  });

  function drawComLevel2(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.com;
    const x0 = vx + 0.15, y0 = vy + 0.15, x1 = vx + 0.85, y1 = vy + 0.85;
    drawBox(x0, y0, x1, y1, 0, 12, p.wall);
    drawWindows(x0, y0, x1, y1, i, 2, 0, 12);
    drawDoor(x0, y0, x1, y1, 0.5, shadeColor(p.roof, 1.3));
    drawBox(vx + 0.3, vy + 0.58, vx + 0.7, vy + 0.78, 12, 16, varietyFor(i, 'com:2', com2Variety).sign);
  }

  /** Com L3: a small tower — main block, a setback top floor, and a
   *  rooftop mechanical unit, instead of one taller box. */
  const com3Variety = (i: number) => ({ acBox: hash01(i, 33) > 0.5 });

  function drawComLevel3(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.com;
    const x0 = vx + 0.18, y0 = vy + 0.18, x1 = vx + 0.82, y1 = vy + 0.82;
    drawBox(x0, y0, x1, y1, 0, 19, p.wall);
    drawWindows(x0, y0, x1, y1, i, 3, 0, 19);
    // No windows here — the setback floor is too small a face for the
    // fixed-size window marks to read as anything but a dark smear.
    const tx0 = vx + 0.3, ty0 = vy + 0.3, tx1 = vx + 0.7, ty1 = vy + 0.7;
    drawBox(tx0, ty0, tx1, ty1, 19, 23, '#7fb0f0');
    drawBox(vx + 0.42, vy + 0.42, vx + 0.58, vy + 0.58, 23, 25, ROOFTOP_UNIT);
    if (varietyFor(i, 'com:3', com3Variety).acBox) drawBox(vx + 0.62, vy + 0.5, vx + 0.72, vy + 0.6, 19, 20.5, ROOFTOP_UNIT);
  }

  /** Com L4: a glass tower with a setback crown and an antenna mast. */
  function drawComLevel4(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.com;
    const x0 = vx + 0.16, y0 = vy + 0.16, x1 = vx + 0.84, y1 = vy + 0.84;
    drawBox(x0, y0, x1, y1, 0, 26, p.wall);
    drawWindows(x0, y0, x1, y1, i, 5, 0, 26);
    drawBox(vx + 0.28, vy + 0.28, vx + 0.72, vy + 0.72, 26, 31, '#7fb0f0');
    // Antenna mast with a blinking aircraft light
    const mast = isoProject(VIEW, vx + 0.5, vy + 0.5);
    drawMast(mast.x, mast.y - 31, mast.y - 37, 1);
    ctx.fillStyle = blink(clock, i) ? '#f87171' : '#7a3a3a';
    ctx.fillRect(mast.x - 1, mast.y - 38, 2, 2);
  }

  function drawComZone(vx: number, vy: number, i: number, level: number) {
    if (level === 1) drawComLevel1(vx, vy, i);
    else if (level === 2) drawComLevel2(vx, vy, i);
    else if (level === 3) drawComLevel3(vx, vy, i);
    else drawComLevel4(vx, vy, i);
  }

  /** Weathering streaks down a box's south-west face — hashed (in the
   *  levels' variety records), so only some industrial sheds rust. */
  type RustRolls = { t: number; lenFrac: number }[] | null;
  const rustRolls = (i: number, salt: number): RustRolls =>
    hash01(i, salt) < 0.45
      ? null
      : [0, 1].map(k => ({
          t: 0.25 + k * 0.35 + hash01(i, salt + k + 1) * 0.15,
          lenFrac: 0.5 + hash01(i, salt + k + 3) * 0.5
        }));

  function drawRust(x0: number, y0: number, x1: number, y1: number, rolls: RustRolls, zTop: number) {
    if (!rolls) return;
    const w = isoProject(VIEW, x0, y1);
    const s = isoProject(VIEW, x1, y1);
    ctx.fillStyle = 'rgba(122, 68, 34, 0.4)';
    for (const { t, lenFrac } of rolls) {
      const bx = w.x + (s.x - w.x) * t;
      const by = w.y + (s.y - w.y) * t;
      const len = zTop * lenFrac;
      ctx.fillRect(bx - 0.5, by - len, 1, len);
    }
  }

  /** Shed (ind L1): squat low warehouse with a couple of roof vents. */
  const ind1Variety = (i: number) => ({ rust: rustRolls(i, 41) });

  function drawIndLevel1(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.ind;
    const x0 = vx + 0.1, y0 = vy + 0.25, x1 = vx + 0.9, y1 = vy + 0.85;
    drawBox(x0, y0, x1, y1, 0, 5, p.wall);
    drawWindows(x0, y0, x1, y1, i, 1, 0, 5);
    drawRust(x0, y0, x1, y1, varietyFor(i, 'ind:1', ind1Variety).rust, 5);
    drawBox(vx + 0.28, vy + 0.34, vx + 0.37, vy + 0.43, 5, 8, p.roof);
    drawBox(vx + 0.55, vy + 0.55, vx + 0.64, vy + 0.64, 5, 7.5, p.roof);
  }

  /** Ind L2: the shed plus a tall silo and a low loading dock, offset
   *  beside it rather than one bigger shed. */
  const ind2Variety = (i: number) => ({
    band: ACCENT_COLORS[Math.floor(hash01(i, 42) * ACCENT_COLORS.length)],
    rust: rustRolls(i, 43)
  });

  function drawIndLevel2(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.ind;
    const v = varietyFor(i, 'ind:2', ind2Variety);
    const sx0 = vx + 0.12, sy0 = vy + 0.3, sx1 = vx + 0.6, sy1 = vy + 0.9;
    drawBox(sx0, sy0, sx1, sy1, 0, 7, p.wall);
    drawWindows(sx0, sy0, sx1, sy1, i, 1, 0, 7);

    // Silo sits further back in the tile than the dock, so it must paint
    // first for the painter's algorithm to let the dock occlude its base.
    const silo = '#aab0b8';
    const six0 = vx + 0.66, siy0 = vy + 0.12, six1 = vx + 0.9, siy1 = vy + 0.38;
    drawBox(six0, siy0, six1, siy1, 0, 12, silo);
    drawPyramidCap(six0, siy0, six1, siy1, 12, 3, silo);
    // Company band round the silo, colour hashed per plot.
    const bandY = isoProject(VIEW, vx + 0.78, vy + 0.38);
    ctx.fillStyle = v.band;
    ctx.fillRect(bandY.x - 4.4, bandY.y - 9.5, 8.8, 1.6);
    drawRust(sx0, sy0, sx1, sy1, v.rust, 7);

    const lox0 = vx + 0.6, loy0 = vy + 0.62, lox1 = vx + 0.94, loy1 = vy + 0.92;
    drawBox(lox0, loy0, lox1, loy1, 0, 3, p.roof);
  }

  /** Ind L3: a larger complex — two offset stacked volumes plus a tall
   *  smokestack, rather than a single bigger shed. */
  const ind3Variety = (i: number) => ({
    rust: rustRolls(i, 44),
    stackJitter: hash01(i, 45) * 0.08
  });

  function drawIndLevel3(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.ind;
    const v = varietyFor(i, 'ind:3', ind3Variety);
    const hx0 = vx + 0.1, hy0 = vy + 0.35, hx1 = vx + 0.62, hy1 = vy + 0.92;
    drawBox(hx0, hy0, hx1, hy1, 0, 9, p.wall);
    drawWindows(hx0, hy0, hx1, hy1, i, 1, 0, 9);

    // Concrete/steel tone rather than a tint of the wall — the wall's
    // yellow shades to near-black on its own shadowed face at this scale.
    const bx0 = vx + 0.62, by0 = vy + 0.12, bx1 = vx + 0.92, by1 = vy + 0.55;
    drawBox(bx0, by0, bx1, by1, 0, 13, '#7d8a94');
    drawWindows(bx0, by0, bx1, by1, i, 1, 0, 13, 3);

    drawRust(hx0, hy0, hx1, hy1, v.rust, 9);
    drawStack(vx + 0.74 + v.stackJitter, vy + 0.3, 13, 11, 5, p.roof);
  }

  /** Ind L4: heavy industry — the L3 complex scaled up with twin stacks. */
  const ind4Variety = (i: number) => ({
    rust: rustRolls(i, 46),
    jitter: hash01(i, 47) * 0.06,
    stackH: 12 + hash01(i, 48) * 3
  });

  function drawIndLevel4(vx: number, vy: number, i: number) {
    const p = ZONE_PALETTE.ind;
    const v = varietyFor(i, 'ind:4', ind4Variety);
    const hx0 = vx + 0.08, hy0 = vy + 0.3, hx1 = vx + 0.6, hy1 = vy + 0.94;
    drawBox(hx0, hy0, hx1, hy1, 0, 12, p.wall);
    drawWindows(hx0, hy0, hx1, hy1, i, 2, 0, 12);

    const bx0 = vx + 0.6, by0 = vy + 0.08, bx1 = vx + 0.94, by1 = vy + 0.56;
    drawBox(bx0, by0, bx1, by1, 0, 18, '#7d8a94');
    drawWindows(bx0, by0, bx1, by1, i, 2, 0, 18, 3);

    drawRust(hx0, hy0, hx1, hy1, v.rust, 12);
    drawStack(vx + 0.7 + v.jitter, vy + 0.28, 18, v.stackH, 5, p.roof);
    drawStack(vx + 0.84 + v.jitter, vy + 0.28, 18, 10, 4.5, p.roof);
  }

  function drawIndZone(vx: number, vy: number, i: number, level: number) {
    if (level === 1) drawIndLevel1(vx, vy, i);
    else if (level === 2) drawIndLevel2(vx, vy, i);
    else if (level === 3) drawIndLevel3(vx, vy, i);
    else drawIndLevel4(vx, vy, i);
  }

  const ZONE_DRAW: Record<ZoneType, (vx: number, vy: number, i: number, level: number) => void> = {
    res: drawResZone,
    com: drawComZone,
    ind: drawIndZone
  };

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

  // The sky fill doubles as the frame clear; the gradient itself never
  // changes, so build it once instead of once per frame.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#101723');
  sky.addColorStop(1, '#0b111b');

  function render() {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Earthquake screen shake: jitter the whole scene while `shake` runs down.
    ctx.save();
    if (shake > 0) {
      const amp = 5 * shake;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

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
        if (tile.type === 'empty') drawGroundFlecks(x, y);

        if (tile.type === 'power') {
          drawBlock(ctx, VIEW, vx, vy, 22, '#5b4a7a');
          // Panel seams and a lit window row so the plant reads as a
          // working building rather than a purple slab.
          const pc = blockFaceCorners(VIEW, vx, vy, 0.08);
          ctx.strokeStyle = 'rgba(20, 16, 34, 0.4)';
          ctx.lineWidth = 0.75;
          for (const zz of [8, 15]) {
            ctx.beginPath();
            blockSeamPath(ctx, pc, zz);
            ctx.stroke();
          }
          drawWindows(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, i, 1, 0, 8);
          // Hazard-striped smokestack with a blinking warning light.
          drawStack(vx + 0.62, vy + 0.28, 22, 14, 6, '#3d3252');
          if (blink(clock)) {
            const tip = isoProject(VIEW, vx + 0.62, vy + 0.28);
            ctx.fillStyle = '#f87171';
            ctx.beginPath();
            ctx.arc(tip.x, tip.y - 22 - 17.8, 1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.font = '15px serif';
          ctx.fillText('⚡', top.x, top.y - 22);
        } else if (tile.type === 'park' || tile.type === 'tree') {
          // Drawn landscaping under the emoji: canopy clusters, a path
          // curve on parks, hashed so no two greens repeat.
          const isPark = tile.type === 'park';
          fillTile(ctx, VIEW, vx, vy, isPark ? '#22543d' : '#16301f');
          if (isPark) {
            ctx.strokeStyle = 'rgba(138, 122, 92, 0.5)';
            ctx.lineWidth = 1.5;
            const pa = isoProject(VIEW, vx + 0.15, vy + 0.6);
            const pb = isoProject(VIEW, vx + 0.85, vy + 0.45);
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.quadraticCurveTo(top.x, top.y + 3, pb.x, pb.y);
            ctx.stroke();
          }
          const v = varietyFor(i, tile.type, greenVariety);
          for (let k = 0; k < 3; k++) {
            const { bx, by, r } = v.blobs[k];
            const b = isoProject(VIEW, vx + bx, vy + by);
            ctx.fillStyle = k % 2 === 0 ? '#2e6b48' : '#1f4a32';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y - 1.5, r, r * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(190, 242, 100, 0.35)';
            ctx.beginPath();
            ctx.ellipse(b.x - r * 0.3, b.y - 2, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (isPark && v.flower) {
            const f = isoProject(VIEW, vx + 0.3 + v.flower.fdx, vy + 0.3 + v.flower.fdy);
            ctx.fillStyle = v.flower.color;
            ctx.fillRect(f.x - 0.6, f.y - 1, 1.2, 1.2);
          }
          drawFlatShadow(top, isPark ? 6 : 5, isPark ? 2.5 : 2);
          ctx.font = isPark ? '14px serif' : '13px serif';
          ctx.fillText(isPark ? '🌳' : '🌲', top.x, top.y - 5);
        } else if (tile.type === 'rubble') {
          fillTile(ctx, VIEW, vx, vy, '#31302c');
          ctx.font = '11px serif';
          ctx.fillText('🪨', top.x, top.y - 3);
        } else if (tile.type === 'school') {
          drawBlock(ctx, VIEW, vx, vy, 14, '#b9813e');
          drawWindows(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, i, 2, 0, 14);
          drawDoor(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, 0.5, '#5a3a20');
          drawRoofRidge(vx, vy, 14, '#8a5f2c');
          // Flagpole on the ridge.
          drawMast(top.x, top.y - 20, top.y - 27);
          ctx.fillStyle = '#4f86d6';
          ctx.beginPath();
          ctx.moveTo(top.x, top.y - 27);
          ctx.lineTo(top.x + 4 + Math.sin(clock * 4) * 0.6, top.y - 26);
          ctx.lineTo(top.x, top.y - 25);
          ctx.closePath();
          ctx.fill();
          ctx.font = '13px serif';
          ctx.fillText('🏫', top.x, top.y - 14);
        } else if (tile.type === 'firehouse') {
          drawBlock(ctx, VIEW, vx, vy, 14, '#a34141');
          // Two garage doors with slat lines on the street face.
          const fw = isoProject(VIEW, vx + 0.08, vy + 0.92);
          const fs = isoProject(VIEW, vx + 0.92, vy + 0.92);
          for (let g = 0; g < 2; g++) {
            const t = 0.3 + g * 0.4;
            const gx = fw.x + (fs.x - fw.x) * t;
            const gy = fw.y + (fs.y - fw.y) * t;
            ctx.fillStyle = '#d9d2c0';
            ctx.fillRect(gx - 2.4, gy - 6, 4.8, 6);
            ctx.strokeStyle = 'rgba(60, 40, 30, 0.45)';
            ctx.lineWidth = 0.5;
            for (let sl = 1; sl < 3; sl++) {
              ctx.beginPath();
              ctx.moveTo(gx - 2.4, gy - sl * 2);
              ctx.lineTo(gx + 2.4, gy - sl * 2);
              ctx.stroke();
            }
          }
          drawRoofRidge(vx, vy, 14, '#7a2e2e');
          // Watch tower on the back corner.
          drawBox(vx + 0.66, vy + 0.14, vx + 0.84, vy + 0.32, 14, 23, '#8a3636');
          drawPyramidCap(vx + 0.66, vy + 0.14, vx + 0.84, vy + 0.32, 23, 2.5, '#6a2a2a');
          ctx.font = '13px serif';
          ctx.fillText('🚒', top.x, top.y - 14);
        } else if (tile.type === 'police') {
          drawBlock(ctx, VIEW, vx, vy, 14, '#3f5a8f');
          drawWindows(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, i, 2, 0, 14);
          drawDoor(vx + 0.08, vy + 0.08, vx + 0.92, vy + 0.92, 0.5, '#26365c');
          drawRoofRidge(vx, vy, 14, '#2f4670');
          // Rooftop beacon pulsing on the shared blink cadence, phased by tile.
          ctx.fillStyle = blink(clock, i) ? '#7dd3fc' : '#1e3a5f';
          ctx.beginPath();
          ctx.arc(top.x, top.y - 20, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '13px serif';
          ctx.fillText('🚓', top.x, top.y - 14);
        } else if (isZone(tile.type)) {
          if (tile.level === 0) {
            fillTile(ctx, VIEW, vx, vy, ZONE_TINT[tile.type]);
            strokeTile(ctx, VIEW, vx, vy, ZONE_BORDER[tile.type], 1);
            // Diagonal survey hatch marks the plot as vacant, not derelict
            ctx.strokeStyle = ZONE_BORDER[tile.type];
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.35;
            for (let p = 0.25; p <= 0.75; p += 0.25) {
              const a = isoProject(VIEW, vx + p, vy + 0.1);
              const b = isoProject(VIEW, vx + p - 0.15, vy + 0.9);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          } else {
            const height = buildingHeight(tile);
            ZONE_DRAW[tile.type](vx, vy, i, tile.level);
            ctx.font = `${ZONE_ICON_FONT}px serif`;
            // A gap above the tallest architectural feature (gable, sign,
            // stack…) so the type icon doesn't collide with the new roofs.
            ctx.fillText(ZONE_EMOJI[tile.type], top.x, top.y - height - 6);
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
        // Flickering firelight halo spilling onto the surroundings.
        const throb = 0.75 + 0.25 * Math.sin(clock * 11 + i);
        const glow = ctx.createRadialGradient(top.x, top.y, 2, top.x, top.y, 30 * throb);
        glow.addColorStop(0, 'rgba(251, 146, 60, 0.4)');
        glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(top.x - 32, top.y - 32, 64, 64);
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

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Tornado funnel: a wobbling stack of grey discs narrowing to the ground.
    if (tornado) {
      const base = projectWorld(tornado.x + 0.5, tornado.y + 0.5);
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        const wob = Math.sin(clock * 9 + k * 1.3) * (1.5 + t * 4);
        ctx.fillStyle = `rgba(148, 163, 184, ${0.5 - t * 0.32})`;
        ctx.beginPath();
        ctx.ellipse(base.x + wob, base.y - 4 - k * 6, 3 + t * 11, 2 + t * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Debris ring at the base
      ctx.fillStyle = 'rgba(120, 113, 108, 0.55)';
      for (let d = 0; d < 5; d++) {
        const a = clock * 7 + (d * Math.PI * 2) / 5;
        ctx.fillRect(base.x + Math.cos(a) * 8 - 1, base.y - 2 + Math.sin(a) * 3 - 1, 2, 2);
      }
    }

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % CITY_W;
      const y = Math.floor(hoverTile / CITY_W);
      const v = rotateTile(x, y, CITY_W, CITY_H, rotation);
      const valid = canBuild(tiles, x, y, selectedTool) && buildCost(tiles, x, y, selectedTool) <= money;
      strokeTile(ctx, VIEW, v.x, v.y, valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)', 2);
    }

    fx.drawFloaters(ctx);
    ctx.restore(); // end earthquake shake

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
    // Mid-flip the rotateY transform shrinks the bounding rect, so the
    // screen→tile math below would pick a tile far from the cursor.
    if (rotator.animating()) return -1;
    // Logical (not backing-store) coordinates: the backing store is
    // DPR-scaled, so canvas.width/rect.width would land tiles wide.
    const p = hiDpi.toLogical(e);
    const dims = rotatedDims(CITY_W, CITY_H, rotation);
    const vi = isoTileFromPoint(VIEW, p.x, p.y, dims.w, dims.h);
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

  const rotator = createViewRotator(canvas, rot => {
    rotation = rot;
    VIEW = makeView(rot);
    hoverTile = -1;
    armedTile = -1;
    // Screen-space particles were projected under the old rotation
    smoke = [];
    sparks = [];
    fx.clear();
  });
  document.getElementById('rotate-left')?.addEventListener('click', () => rotator.start(-1));
  document.getElementById('rotate-right')?.addEventListener('click', () => rotator.start(1));

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
