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
  setupHiDpiCanvas,
  isoProject,
  fillTile,
  strokeTile,
  blockFaceCorners,
  blockSeamPath,
  faceBandPath,
  drawBlock,
  shadeColor,
  blink,
  hash01,
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
  GRID_W,
  GRID_H,
  MIN_HEIGHT,
  MAX_HEIGHT,
  BUILDINGS,
  ZONES,
  createPark,
  canPlace,
  applyTool,
  footprintTiles,
  toolCost,
  neighbours,
  isWalkable,
  zonesForTiles,
  zoneUnlocked,
  gateZone,
  terraformPlan,
  terraformSteps,
  applyTerraformPlan,
  type TileType,
  type Tool,
  type ZoneId
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
import { parkRating, spawnInterval, operatingCost, DAY_SECONDS } from './economy';
import {
  isRide,
  breakdownChance,
  pickBreakdownTile,
  rollSurge,
  surgedInterval,
  maxGuests,
  BREAKDOWN_SECONDS,
  type RideBreakdown,
  type Surge
} from './mayhem';
import {
  PARK_OBJECTIVES,
  objectiveMet,
  objectiveProgress,
  type ParkObjective,
  type ParkProgress
} from './objectives';

const BLOCK_HEIGHT = 16;
/** Pixels a single terrain height step lifts a tile. */
const TERRAIN_STEP = 12;
const MAX_TERRAIN_LIFT = MAX_HEIGHT * TERRAIN_STEP;
const HALF_W = 20;
const HALF_H = 10;
// originY carries extra headroom so a max-height hill (with a tall building
// on top) never clips off the canvas top, even at the near corner.
const ORIGIN_Y = 60 + MAX_TERRAIN_LIFT;
// Quarter-turn rotations swap the grid's width and height, but W+H — and so
// the canvas size — stays the same for every rotation.
const CANVAS_W = (GRID_W + GRID_H) * HALF_W;
const CANVAS_H = (GRID_W + GRID_H) * HALF_H + ORIGIN_Y + 10;
const START_MONEY = 1500;
const DAY_LENGTH = DAY_SECONDS; // seconds of game time per day (shared with the wage maths)
const GUEST_SPEED = 2.4; // tiles per second


// No ferris or flume entry: the Big Wheel and Log Flume are custom-drawn
// (see drawFerris / drawFlume), never an emoji on a block. Food and drink
// keep theirs as the stall's hanging sign (see drawStall).
const TILE_EMOJI: Partial<Record<TileType, string>> = {
  entrance: '🎟️',
  carousel: '🎠',
  food: '🌭',
  drink: '🥤',
  toilet: '🚻',
  tree: '🌳',
  skytower: '🗼',
  // The Pirate Ship, Haunted Manor, Bumper Cars and Helter Skelter are all
  // custom-drawn (see their draw* functions); no emoji sits on their block.
  pirateship: '🏴‍☠️',
  manor: '👻',
  bumper: '🚗',
  helter: '🎪'
};

/** Zone Gate decorations: flat ground emoji, drawn like a tree (see `render`). */
const GATE_EMOJI: Partial<Record<TileType, string>> = {
  gateFairytale: '🏰',
  gateAdventure: '🌴',
  gatePirate: '🏴‍☠️'
};

/**
 * Cosmetic reskins for existing attractions when built inside a zone's
 * influence — same TileType, same BUILDINGS economics (see design doc),
 * just a different emoji + block colour so each themed area reads
 * distinctly. Any building without an entry here keeps its default look.
 * The Big Wheel is custom-drawn geometry, so its reskin is colour-only;
 * the Log Flume's reskin emoji rides its channel as the themed vehicle
 * (see drawFlume) and the stalls' hang as their sign (see drawStall).
 */
const ZONE_BUILDING_STYLE: Record<ZoneId, Partial<Record<TileType, { emoji?: string; color: string }>>> = {
  fairytale: {
    carousel: { emoji: '🎠', color: '#d68fc2' },
    ferris: { color: '#b28fe0' },
    food: { emoji: '🍰', color: '#e8a0bc' },
    drink: { emoji: '🧃', color: '#f0b6d2' },
    toilet: { emoji: '🚻', color: '#a888d0' },
    flume: { emoji: '🦢', color: '#8fc4dc' },
    skytower: { emoji: '🏰', color: '#b89fdc' }
  },
  adventure: {
    carousel: { emoji: '🐒', color: '#6b8f3f' },
    ferris: { color: '#4f7a2f' },
    food: { emoji: '🍌', color: '#a67c2a' },
    drink: { emoji: '🥥', color: '#5a8a3a' },
    toilet: { emoji: '🛖', color: '#7a5a2f' },
    flume: { emoji: '🐊', color: '#2f7a4f' },
    skytower: { emoji: '🗿', color: '#5a6a4a' }
  },
  pirate: {
    carousel: { emoji: '🎯', color: '#7a3a2a' },
    ferris: { color: '#6a4a2a' },
    // The Pirate Ship is this zone's native ride — deep sea-timber tone.
    pirateship: { color: '#6b4a2f' },
    food: { emoji: '🍖', color: '#6a5a3a' },
    drink: { emoji: '🍺', color: '#5a4a2a' },
    toilet: { emoji: '⚓', color: '#3a5a6a' },
    flume: { emoji: '🐙', color: '#2a5a6a' },
    skytower: { emoji: '🏴‍☠️', color: '#4a3a5a' }
  }
};

/**
 * Per-building block colour and height so each attraction reads distinctly.
 * Bespoke-drawn rides (carousel, Big Wheel, flume, stalls) use `height` as
 * their visual top for anchoring floaters and the breakdown wrench, not as
 * an extruded block height — the stalls' height covers their hanging sign,
 * so a purchase floater spawns clear above it instead of on top of it.
 */
const BUILDING_STYLE: Partial<Record<TileType, { color: string; height: number }>> = {
  carousel: { color: '#b34a8f', height: 30 },
  ferris: { color: '#5a67c0', height: 36 },
  pirateship: { color: '#8a5a34', height: 34 },
  coaster: { color: '#6d5cc4', height: 42 },
  manor: { color: '#4a4668', height: 30 },
  bumper: { color: '#c05a4a', height: 16 },
  helter: { color: '#c94f7a', height: 40 },
  food: { color: '#a8632c', height: 18 },
  drink: { color: '#2f7fb0', height: 18 },
  toilet: { color: '#5e6a72', height: 9 },
  flume: { color: '#1f8a9e', height: 13 },
  skytower: { color: '#8892a6', height: 40 }
};

/**
 * Turn rates (radians/s) for the drawn rides — the carousel's mounts orbit
 * and the Big Wheel's rim turns at these: gentle idle, lively while in use.
 */
const RIDE_SPIN: Record<'carousel' | 'ferris', { idle: number; busy: number }> = {
  carousel: { idle: 0.7, busy: 2.4 },
  ferris: { idle: 0.35, busy: 1.4 }
};

const NEED_EMOJI: Record<string, string> = {
  fun: '🎠',
  hunger: '🍔',
  thirst: '🥤',
  bladder: '🚻',
  thrill: '🎢'
};

const GUEST_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb923c'];
/** Skin/hair variety for drawn guests, picked per guest from its style roll. */
const GUEST_SKINS = ['#eec9a2', '#d9a06b', '#a06a42', '#7a4a2e'];
const GUEST_HAIR = ['#2b2118', '#5a3a1e', '#c9a227', '#8a4a2f', '#3a3a45', '#b0b6c0'];
/**
 * drawGuest's four tints per palette colour, precomputed once — shading
 * strings per guest per frame would re-parse and re-allocate hundreds of
 * identical colours a frame in a full park.
 */
const GUEST_SHADES = new Map(
  GUEST_COLORS.map(c => [
    c,
    {
      trouser: shadeColor(c, 0.4),
      hem: shadeColor(c, 0.6),
      rim: shadeColor(c, 1.35),
      arm: shadeColor(c, 0.75)
    }
  ])
);

/**
 * Zone ground checkerboard tints, precomputed once per zone — the render
 * loop was re-shading the zone colour for every tinted tile every frame.
 */
const ZONE_GROUND_CHECKER = Object.fromEntries(
  (Object.keys(ZONES) as ZoneId[]).map(z => [
    z,
    [shadeColor(ZONES[z].groundColor, 1), shadeColor(ZONES[z].groundColor, 0.88)]
  ])
) as Record<ZoneId, [string, string]>;

interface Pt {
  x: number;
  y: number;
}

/**
 * One striped awning face for drawStall: the quad from the hut's top rim
 * edge (a–b) sagging out to the overhanging outer edge (aOut–bOut), split
 * into alternating canvas/colour strips. Module-scope (rather than a
 * closure inside drawStall) so the render loop allocates nothing per stall
 * per frame — same rule drawCarousel's two-pass loop follows.
 */
function drawAwningFace(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  aOut: Pt,
  bOut: Pt,
  rimLift: number,
  outerLift: number,
  stripe: string
) {
  const strips = 4;
  for (let k = 0; k < strips; k++) {
    ctx.fillStyle = k % 2 === 0 ? '#e8e4da' : stripe;
    ctx.beginPath();
    faceBandPath(ctx, a, b, k / strips, (k + 1) / strips, rimLift, outerLift, aOut, bOut);
    ctx.fill();
  }
}

/**
 * drawStall's scalloped valance along one awning's outer edge (aOut–bOut):
 * half-discs hanging off the edge, alternating canvas/stripe to match the
 * strips above. Module-scope for the same per-frame-allocation reason as
 * drawAwningFace.
 */
function drawScallops(
  ctx: CanvasRenderingContext2D,
  aOut: Pt,
  bOut: Pt,
  outerLift: number,
  stripe: string
) {
  const strips = 4;
  for (let k = 0; k < strips; k++) {
    const t = (k + 0.5) / strips;
    ctx.fillStyle = k % 2 === 0 ? '#e8e4da' : stripe;
    ctx.beginPath();
    ctx.arc(
      aOut.x + (bOut.x - aOut.x) * t,
      aOut.y + (bOut.y - aOut.y) * t - outerLift,
      1.5,
      0,
      Math.PI
    );
    ctx.fill();
  }
}

/** drawStall's pale counter band across one front face (a–b), under the awning's shade. */
function drawCounterFace(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, liftPx: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  faceBandPath(ctx, a, b, 0, 1, liftPx + 6, liftPx + 3.5);
  ctx.fill();
}

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
  /**
   * Cosmetic style roll fixed at spawn: drives walk-cycle phase (so crowds
   * don't stride in lockstep), idle facing, and skin/hair picks. Rendering
   * only — no simulation logic reads it.
   */
  styleRoll: number;
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
  const finalWelcomedEl = el('final-welcomed');
  const finalPeakEl = el('final-peak');
  const objectiveEl = el('objective');
  const toastArea = el('toast-area');
  // Park's toasts linger slightly less than the arcade default (2.2s vs 2.4s).
  const { show: showToast } = createToaster(toastArea, { durationMs: 2200 });
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
    tooSteep: root.dataset.tTooSteep || "Can't shape the land that steeply!",
    zoneLocked: root.dataset.tZoneLocked || 'Zone not unlocked yet!',
    breakdown: root.dataset.tBreakdown || 'A ride has broken down!',
    repaired: root.dataset.tRepaired || 'Ride repaired',
    surge: root.dataset.tSurge || 'A coach party pours through the gates!',
    newRecord: root.dataset.tNewRecord || 'New record!',
    objWelcome: root.dataset.tObjWelcome || 'Welcome {n} guests',
    objRating: root.dataset.tObjRating || 'Reach a {n}% rating',
    objCrowd: root.dataset.tObjCrowd || 'Draw a crowd of {n}',
    goalReward: root.dataset.tGoalReward || 'Goal complete +£{n}',
    established: root.dataset.tEstablished || 'Park established — endless!'
  };

  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H);

  // On narrow screens the board keeps a minimum size inside a pannable
  // container; start the view centred on the entrance.
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  // Fairground carousel waltz in G major, 3/4 — a lilting square-wave lead
  // over a classic oom-pah-pah bass, with a warm sustained organ bed.
  const audio = createGameAudio({
    tempo: 156,
    volume: 0.12,
    echo: { time: 0.26, feedback: 0.25, mix: 0.22 },
    tracks: [
      {
        // Lead: bright, lilting major melody, A (bars 1-4) then B (bars 5-8).
        wave: 'square',
        envelope: 'pluck',
        detune: 7,
        volume: 1.0,
        melody: [
          // Bar 1 (G)
          { freq: 783.99, beats: 1 }, { freq: 987.77, beats: 1 }, { freq: 880.0, beats: 1 },
          // Bar 2 (D)
          { freq: 880.0, beats: 1 }, { freq: 739.99, beats: 1 }, { freq: 587.33, beats: 1 },
          // Bar 3 (C)
          { freq: 659.25, beats: 1 }, { freq: 783.99, beats: 1 }, { freq: 1046.5, beats: 1 },
          // Bar 4 (D) — little flourish
          { freq: 987.77, beats: 1 }, { freq: 880.0, beats: 0.5 }, { freq: 739.99, beats: 0.5 }, { freq: 880.0, beats: 1 },
          // Bar 5 (G)
          { freq: 783.99, beats: 1 }, { freq: 987.77, beats: 1 }, { freq: 880.0, beats: 1 },
          // Bar 6 (D)
          { freq: 880.0, beats: 1 }, { freq: 739.99, beats: 1 }, { freq: 587.33, beats: 1 },
          // Bar 7 (C)
          { freq: 659.25, beats: 1 }, { freq: 523.25, beats: 1 }, { freq: 783.99, beats: 1 },
          // Bar 8 (D → G resolve)
          { freq: 739.99, beats: 1 }, { freq: 880.0, beats: 1 }, { freq: 783.99, beats: 1 }
        ]
      },
      {
        // Bass: oom-pah-pah — low root on beat 1, two lighter mid tones after.
        wave: 'triangle',
        envelope: 'pluck',
        volume: 0.75,
        melody: [
          // Bar 1 (G)
          { freq: 98.0, beats: 1 }, { freq: 123.47, beats: 1 }, { freq: 146.83, beats: 1 },
          // Bar 2 (D)
          { freq: 73.42, beats: 1 }, { freq: 110.0, beats: 1 }, { freq: 146.83, beats: 1 },
          // Bar 3 (C)
          { freq: 65.41, beats: 1 }, { freq: 82.41, beats: 1 }, { freq: 98.0, beats: 1 },
          // Bar 4 (D)
          { freq: 73.42, beats: 1 }, { freq: 110.0, beats: 1 }, { freq: 146.83, beats: 1 },
          // Bar 5 (G)
          { freq: 98.0, beats: 1 }, { freq: 123.47, beats: 1 }, { freq: 146.83, beats: 1 },
          // Bar 6 (D)
          { freq: 73.42, beats: 1 }, { freq: 110.0, beats: 1 }, { freq: 146.83, beats: 1 },
          // Bar 7 (C)
          { freq: 65.41, beats: 1 }, { freq: 82.41, beats: 1 }, { freq: 98.0, beats: 1 },
          // Bar 8 (D)
          { freq: 73.42, beats: 1 }, { freq: 110.0, beats: 1 }, { freq: 185.0, beats: 1 }
        ]
      },
      {
        // Bed: sustained organ pad holding each bar's chord root.
        wave: 'sine',
        envelope: 'pad',
        volume: 0.4,
        melody: [
          { freq: 392.0, beats: 3 }, // G
          { freq: 293.66, beats: 3 }, // D
          { freq: 261.63, beats: 3 }, // C
          { freq: 293.66, beats: 3 }, // D
          { freq: 392.0, beats: 3 }, // G
          { freq: 293.66, beats: 3 }, // D
          { freq: 261.63, beats: 3 }, // C
          { freq: 293.66, beats: 3 } // D
        ]
      }
    ]
  });
  wireChannelButton(document.getElementById('music-btn'), audio, 'music');
  wireChannelButton(document.getElementById('sfx-btn'), audio, 'sfx');

  const makeView = (rot: Rotation): IsoView => ({
    halfW: HALF_W,
    halfH: HALF_H,
    originX: rotatedDims(GRID_W, GRID_H, rot).h * HALF_W,
    originY: ORIGIN_Y
  });

  let { tiles, heights, tunnels, entrance } = createPark();
  let rotation: Rotation = 0;
  let VIEW = makeView(rotation);
  let phase: Phase = 'idle';
  let money = START_MONEY;
  let day = 1;
  let dayTimer = 0;
  let guests: Guest[] = [];
  let spawnTimer = 3;
  let peakGuests = 0;
  /** Lifetime guests admitted — the banked score (uncapped, unlike peakGuests). */
  let guestsWelcomed = 0;
  /** Index into PARK_OBJECTIVES; === length once the ladder is cleared. */
  let objectiveIdx = 0;
  /** Set once the final ("flagship") objective is met — play continues endless. */
  let established = false;
  let rating = parkRating(null, 0);
  let selectedTool: Tool = 'path';
  let speedMult = 1;
  let hoverTile = -1;
  // Bumped on every tiles/heights/draft mutation so the hover-placement
  // cache in render() knows its memoized answer is stale. Money and zone
  // unlocks deliberately sit outside it — they're compared fresh per frame.
  let worldVersion = 0;
  const bumpWorldVersion = () => worldVersion++;
  let hoverCacheKey = '';
  let hoverCachePlaceable = false;
  let hoverCacheCost = 0;
  let clock = 0;
  // Floaters live in the shared effects module; balloons stay local (their
  // sway drift has no analogue in its physics).
  const fx = createEffects({ floaterSize: 11, floaterRise: 16, floaterLife: 1 });
  let balloons: { x: number; y: number; sway: number; color: string; life: number }[] = [];
  let breakdowns: RideBreakdown[] = [];
  let surge: Surge | null = null;
  const board = initScoreboard(document.getElementById('highscores'));

  // The record readout shows the table's best, beaten live by the current run.
  recordEl.textContent = board.best().toString();
  // Seed the goal strip with the first objective before the run starts.
  renderObjective();

  /** Projects fractional world-tile coordinates through the current rotation. */
  function projectWorld(tx: number, ty: number): { x: number; y: number } {
    const p = rotatePoint(tx, ty, GRID_W, GRID_H, rotation);
    return isoProject(VIEW, p.tx, p.ty);
  }

  function addFloater(tile: number, text: string, color: string) {
    const c = tileCenter(tile);
    const p = projectWorld(c.x, c.y);
    p.y -= heights[tile] * TERRAIN_STEP;
    const buildingHeight = BUILDING_STYLE[tiles[tile]]?.height ?? BLOCK_HEIGHT;
    fx.floater(p.x, p.y - buildingHeight - 6, text, color);
  }

  const treeCount = () => tiles.filter(t => t === 'tree').length;
  const hasAnyBuilding = () => tiles.some(t => BUILDINGS[t]);
  const isBroken = (i: number) => breakdowns.some(b => b.tile === i);

  /** A delighted guest sometimes lets a balloon go as they step off a ride. */
  function releaseBalloon(tile: number) {
    const c = tileCenter(tile);
    const p = projectWorld(c.x, c.y);
    balloons.push({
      x: p.x + (Math.random() - 0.5) * 8,
      y: p.y - heights[tile] * TERRAIN_STEP - 22,
      sway: Math.random() * Math.PI * 2,
      color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
      life: 4.5
    });
  }

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
      color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
      styleRoll: Math.random()
    });
    // Lifetime admissions: the single gate-entry hook, and the banked score.
    guestsWelcomed++;
  }

  /** The current live figures the objective ladder is checked against. */
  function parkProgress(): ParkProgress {
    return { welcomed: guestsWelcomed, peak: peakGuests, rating };
  }

  /** Paints the goal strip: the active objective and its progress, or the
   *  "established" banner once the ladder is cleared. */
  function renderObjective() {
    if (established || objectiveIdx >= PARK_OBJECTIVES.length) {
      if (objectiveEl.textContent !== strings.established) objectiveEl.textContent = strings.established;
      return;
    }
    const obj = PARK_OBJECTIVES[objectiveIdx];
    const label = strings[obj.labelKey].replace('{n}', obj.target.toString());
    const text = `${label} (${objectiveProgress(obj, parkProgress())}/${obj.target})`;
    if (objectiveEl.textContent !== text) objectiveEl.textContent = text;
  }

  /**
   * Checks the active objective and, if met, banks its reward, celebrates, and
   * advances. The final rung is the prestige win: it flips `established` and
   * play continues (the run still ends only on bankruptcy).
   */
  function checkObjectives() {
    if (established || objectiveIdx >= PARK_OBJECTIVES.length) return;
    const obj: ParkObjective = PARK_OBJECTIVES[objectiveIdx];
    if (!objectiveMet(obj, parkProgress())) return;
    if (obj.reward > 0) {
      money += obj.reward;
      showToast(`🎯 ${strings.goalReward.replace('{n}', obj.reward.toString())}`);
    }
    objectiveIdx++;
    if (obj.win) {
      established = true;
      showToast(`🏆 ${strings.established}`);
    }
    audio.playSfx('score');
    // The strip repaint is the caller's job (renderObjective runs every frame
    // right after this), so there's no repaint here.
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
      // Every need — thrill included — is served by a building now that the
      // coaster is just a placed 2×2 thrill ride, so one scan covers them all.
      const candidates: number[] = [];
      tiles.forEach((tile, i) => {
        // Broken rides are roped off — guests won't head for them.
        if (BUILDINGS[tile]?.satisfies === want && !isBroken(i)) candidates.push(i);
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
    // A ride can break down while the guest is walking over.
    if (!def || isBroken(building)) {
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
          if (def) {
            satisfyNeed(guest.needs, def.satisfies, def.boost);
            if (def.satisfies === 'fun' && guest.targetBuilding !== null && Math.random() < 0.35) {
              releaseBalloon(guest.targetBuilding);
            }
          }
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
          guest.targetBuilding === null ||
          !!BUILDINGS[tiles[guest.targetBuilding]];
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

  /** What applying a terraform plan charges: one raise/lower fee per height step moved, cascade-wide. */
  function terraformCharge(plan: Map<number, number>): number {
    return terraformSteps(plan, heights) * toolCost('raiseLand');
  }

  /**
   * The cascade a raise/lower tap on tile `i` would run, or null when it
   * can't (out of range or unterraformable). Shared by the hover highlight
   * and the click handler so they can never disagree.
   */
  function manualTerraformPlan(tool: Tool, i: number): Map<number, number> | null {
    const target = heights[i] + (tool === 'raiseLand' ? 1 : -1);
    return terraformPlan(tiles, heights, i, target);
  }

  /**
   * What placing `tool` on tile `i` will charge. The terraform tools price
   * per height step across the whole cascade (see terraformPlan) — pushing
   * a tile up two neighbours' worth of hillside costs each of those steps —
   * so the toolbar's flat price is just the plain one-tile case. Infinity
   * when no valid plan exists.
   */
  function placementCost(tool: Tool, i: number): number {
    if (tool === 'raiseLand' || tool === 'lowerLand') {
      const plan = manualTerraformPlan(tool, i);
      return plan ? terraformCharge(plan) : Infinity;
    }
    return toolCost(tool, tiles, i);
  }

  // --- Simulation ---

  function update(dt: number) {
    rotator.update(dt);
    clock += dt;
    fx.update(dt);
    balloons = balloons.filter(b => {
      b.life -= dt;
      b.y -= 22 * dt;
      b.x += Math.sin(clock * 2.2 + b.sway) * 9 * dt;
      return b.life > 0 && b.y > 10;
    });
    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;

    guests = guests.filter(guest => updateGuest(guest, simDt));

    // Mayhem: run down repairs (dropping any ride that was bulldozed) and
    // maybe break something new; odds ramp with the park's age.
    breakdowns = breakdowns.filter(b => {
      if (!isRide(tiles[b.tile])) return false;
      b.secondsLeft -= simDt;
      if (b.secondsLeft <= 0) {
        addFloater(b.tile, `✅ ${strings.repaired}`, '#4ade80');
        return false;
      }
      return true;
    });
    const rideCount = tiles.filter(isRide).length;
    if (Math.random() < breakdownChance(day, rideCount) * simDt) {
      const tile = pickBreakdownTile(tiles, breakdowns.map(b => b.tile), Math.random);
      if (tile !== null) {
        breakdowns.push({ tile, secondsLeft: BREAKDOWN_SECONDS });
        // Anyone mid-ride gets turfed out to rethink their day.
        for (const guest of guests) {
          if (guest.state === 'using' && guest.targetBuilding === tile) {
            guest.state = 'idle';
            guest.idleTimer = 0.2;
            guest.targetBuilding = null;
          }
        }
        addFloater(tile, '🔧', '#fbbf24');
        showToast(`🔧 ${strings.breakdown}`);
        audio.playSfx('hit');
      }
    }
    if (surge) {
      surge.secondsLeft -= simDt;
      if (surge.secondsLeft <= 0) surge = null;
    }

    peakGuests = Math.max(peakGuests, guests.length);
    const avg = guests.length
      ? guests.reduce((sum, g) => sum + happiness(g.needs), 0) / guests.length
      : null;
    rating = parkRating(avg, treeCount());

    // Banking stashes lifetime admissions immediately, so a mid-run tab close
    // keeps the record; beating an established best is worth a fanfare.
    const { best, newRecord } = board.bank(guestsWelcomed);
    if (recordEl.textContent !== best.toString()) recordEl.textContent = best.toString();
    if (newRecord) {
      showToast(`🏅 ${strings.newRecord}`);
      audio.playSfx('score');
    }
    checkObjectives();
    renderObjective();

    spawnTimer -= simDt;
    if (spawnTimer <= 0) {
      spawnTimer = surgedInterval(spawnInterval(rating), surge);
      if (guests.length < maxGuests(day) && hasAnyBuilding()) spawnGuest();
    }

    dayTimer += simDt;
    if (dayTimer >= DAY_LENGTH) {
      dayTimer -= DAY_LENGTH;
      day++;
      // Operating cost = flat upkeep + the age-ramped staff wage bill, so a
      // park that stops growing its takings eventually runs a deficit.
      const cost = operatingCost(tiles, day);
      money -= cost;
      showToast(`${strings.day} ${day} · ${strings.upkeep} -£${cost}`);
      // Mayhem: some mornings a coach party floods the gates.
      const rolled = rollSurge(day, Math.random);
      if (rolled) {
        surge = rolled;
        showToast(`🚌 ${strings.surge}`);
        audio.playSfx('score');
      }
      if (money < 0) gameOver();
    }
  }

  function gameOver() {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    finalDaysEl.textContent = day.toString();
    finalWelcomedEl.textContent = guestsWelcomed.toString();
    finalPeakEl.textContent = peakGuests.toString();
    overOverlay.style.display = 'flex';
    board.show(guestsWelcomed);
  }

  /**
   * Starts a fresh run. The map rolled at page load is visible behind the
   * translucent start overlay, so the first Start keeps it (`regenerate:
   * false`) — re-rolling there would swap the terrain the player was
   * looking at mid-click. Play Again rolls a new map. (Only became
   * observable with procedural terrain: every board used to be identical.)
   */
  function resetPark(regenerate = true) {
    if (regenerate) ({ tiles, heights, tunnels, entrance } = createPark());
    // Fresh terrain: stale hover-placement cache entries must not survive
    // into the new park.
    bumpWorldVersion();
    money = START_MONEY;
    day = 1;
    dayTimer = 0;
    guests = [];
    spawnTimer = 3;
    peakGuests = 0;
    guestsWelcomed = 0;
    objectiveIdx = 0;
    established = false;
    rating = parkRating(null, 0);
    speedMult = 1;
    fx.clear();
    balloons = [];
    breakdowns = [];
    surge = null;
    board.beginRun();
    renderObjective();
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
   * The carousel drawn as an actual ride: a round platform, a centre pole
   * under a striped conical canopy, and three mounts orbiting it — upright
   * and gently bobbing, never rotated (a spinning glyph spends half its
   * time upside down). The mount glyph comes from the zone reskin, so a
   * Fairytale carousel spins horses while a Pirate one spins targets.
   */
  function drawCarousel(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    glyph: string,
    busy: boolean,
    broken: boolean
  ) {
    const platformH = 5;
    drawBlock(ctx, VIEW, vx, vy, platformH, color, 0.14, liftPx);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const topY = c.y - liftPx - platformH; // platform surface
    const rimY = topY - 19; // canopy rim centre
    const spin = RIDE_SPIN.carousel;
    const angle = broken ? 0.6 : clock * (busy ? spin.busy : spin.idle);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Round deck over the block: planked turntable with a lit rim, so the
    // platform reads as a carousel floor instead of a square box top.
    ctx.fillStyle = shadeColor(color, 0.72);
    ctx.beginPath();
    ctx.ellipse(c.x, topY + 1, 14.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 1.12);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 14.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 0.8);
    ctx.lineWidth = 0.75;
    for (let k = 0; k < 8; k++) {
      // Planks turn WITH the mounts — the deck is one rigid platform.
      const a = angle + (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(c.x, topY);
      ctx.lineTo(c.x + Math.cos(a) * 14.5, topY + Math.sin(a) * 6);
      ctx.stroke();
    }
    ctx.strokeStyle = shadeColor(color, 1.4);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 14.5, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Depth order: mounts behind the pole (pass 0), the pole, mounts in
    // front (pass 1). Two plain passes over the three mounts, no per-frame
    // arrays or closures — this runs every frame for every carousel.
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        ctx.strokeStyle = shadeColor(color, 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x, topY);
        ctx.lineTo(c.x, rimY);
        ctx.stroke();
        // Brass collar where the pole meets the deck.
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(c.x - 1.5, topY - 2, 3, 1.5);
      }
      for (let k = 0; k < 3; k++) {
        const a = angle + (k * Math.PI * 2) / 3;
        const front = Math.sin(a) >= 0;
        if (front !== (pass === 1)) continue;
        // Orbit squashed to the iso ground plane; each mount bobs on its own phase.
        const mx = c.x + Math.cos(a) * 11;
        const my = topY - 6 + Math.sin(a) * 4 + (broken ? 0 : Math.sin(angle * 2 + k * 2.1) * 1.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx, rimY + 3);
        ctx.lineTo(mx, my - 3);
        ctx.stroke();
        ctx.font = '10px serif';
        ctx.fillText(glyph, mx, my);
      }
    }

    // Canopy: rim underside, rounding board with fairground lights, a
    // striped cone in alternating wedges, scalloped valance, and a finial.
    ctx.fillStyle = shadeColor(color, 0.85);
    ctx.beginPath();
    ctx.ellipse(c.x, rimY, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const apexY = rimY - 10;
    const stripe = '#efe9dc';
    for (let k = 0; k < 6; k++) {
      const a0 = (k * Math.PI) / 6; // front half of the ellipse, right to left
      const a1 = a0 + Math.PI / 6;
      ctx.fillStyle = k % 2 === 0 ? shadeColor(color, 1.25) : stripe;
      ctx.beginPath();
      ctx.moveTo(c.x, apexY);
      ctx.lineTo(c.x + 13 * Math.cos(a0), rimY + 4 * Math.sin(a0));
      ctx.lineTo(c.x + 13 * Math.cos(a1), rimY + 4 * Math.sin(a1));
      ctx.closePath();
      ctx.fill();
    }
    // Scalloped valance along the front rim edge.
    for (let k = 0; k < 7; k++) {
      const a = (Math.PI * (k + 0.5)) / 7;
      ctx.fillStyle = k % 2 === 0 ? stripe : shadeColor(color, 1.25);
      ctx.beginPath();
      ctx.arc(c.x + 13 * Math.cos(a), rimY + 4 * Math.sin(a), 1.7, 0, Math.PI);
      ctx.fill();
    }
    // Rounding board: lit rim band, bulbs chasing while the ride is busy.
    ctx.strokeStyle = shadeColor(color, 1.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(c.x, rimY - 1, 13, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    const lit = Math.floor(clock * 6) % 3;
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * (k + 0.5)) / 6;
      ctx.fillStyle = !broken && (busy ? k % 3 === lit : k % 2 === 0) ? '#fde68a' : shadeColor(color, 0.7);
      ctx.beginPath();
      ctx.arc(c.x + 12.4 * Math.cos(a), rimY - 1 + 3.8 * Math.sin(a), 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Finial ball and a fluttering pennant.
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(c.x, apexY - 1, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e05a6b';
    ctx.beginPath();
    ctx.moveTo(c.x, apexY - 6);
    ctx.lineTo(c.x + 5 + Math.sin(clock * 5) * 0.8, apexY - 4.8);
    ctx.lineTo(c.x, apexY - 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 0.6);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(c.x, apexY - 6.2);
    ctx.lineTo(c.x, apexY);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The Big Wheel drawn as an actual wheel: A-frame legs up to a hub, a
   * spoked rim turning in the screen plane, and gondola cars that hang
   * upright below their rim points however far the wheel has turned.
   */
  function drawFerris(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    busy: boolean,
    broken: boolean
  ) {
    const plinthH = 4;
    drawBlock(ctx, VIEW, vx, vy, plinthH, color, 0.2, liftPx);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const baseY = c.y - liftPx - plinthH;
    const hubY = baseY - 20;
    const radius = 12;
    const spin = RIDE_SPIN.ferris;
    const angle = broken ? 0.4 : clock * (busy ? spin.busy : spin.idle);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Back A-frame first, so the wheel turns between two supports.
    ctx.strokeStyle = shadeColor(color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.x - 5.5, baseY - 1.5);
    ctx.lineTo(c.x + 2.5, hubY - 1);
    ctx.lineTo(c.x + 10.5, baseY - 1.5);
    ctx.stroke();

    // Wheel: double rim with cross-braced spokes and tie ticks.
    ctx.strokeStyle = shadeColor(color, 0.9);
    ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = angle + (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(c.x, hubY);
      ctx.lineTo(c.x + Math.cos(a) * radius, hubY + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.strokeStyle = shadeColor(color, 1.1);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(c.x, hubY, radius - 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(color, 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, hubY, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Tie ticks between the rims at each spoke end.
    ctx.strokeStyle = shadeColor(color, 1.2);
    ctx.lineWidth = 0.75;
    for (let k = 0; k < 8; k++) {
      const a = angle + (k * Math.PI) / 4 + Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a) * (radius - 2.2), hubY + Math.sin(a) * (radius - 2.2));
      ctx.lineTo(c.x + Math.cos(a) * radius, hubY + Math.sin(a) * radius);
      ctx.stroke();
    }

    // Gondolas hang upright from the outer rim: tiny cabins with a roof
    // bar and a lit window, swinging slightly with the motion.
    for (let k = 0; k < 6; k++) {
      const a = angle + (k * Math.PI) / 3;
      const gx = c.x + Math.cos(a) * radius;
      const gy = hubY + Math.sin(a) * radius;
      const sway = broken ? 0 : Math.sin(clock * 2.4 + k) * 0.6;
      const cabin = GUEST_COLORS[k % GUEST_COLORS.length];
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + sway, gy + 2);
      ctx.stroke();
      ctx.fillStyle = shadeColor(cabin, 0.65);
      ctx.fillRect(gx + sway - 2.4, gy + 2, 4.8, 1);
      ctx.fillStyle = cabin;
      ctx.fillRect(gx + sway - 2, gy + 3, 4, 3);
      ctx.fillStyle = 'rgba(255, 244, 214, 0.9)';
      ctx.fillRect(gx + sway - 0.7, gy + 3.7, 1.4, 1.4);
    }

    // Front A-frame, cross-member, axle cap and footing blocks.
    ctx.strokeStyle = shadeColor(color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - 10.5, baseY + 1.5);
    ctx.lineTo(c.x - 2.5, hubY + 1);
    ctx.lineTo(c.x + 5.5, baseY + 1.5);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - 6.8, baseY - 8);
    ctx.lineTo(c.x + 1.8, baseY - 8);
    ctx.stroke();
    ctx.fillStyle = shadeColor(color, 0.45);
    ctx.fillRect(c.x - 12, baseY, 3.5, 2);
    ctx.fillRect(c.x + 4, baseY, 3.5, 2);
    ctx.fillRect(c.x - 7, baseY - 2, 3.5, 2);
    ctx.fillRect(c.x + 9, baseY - 2, 3.5, 2);
    // Axle between the two frames, capped at the hub.
    ctx.strokeStyle = shadeColor(color, 1.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - 2.5, hubY + 1);
    ctx.lineTo(c.x + 2.5, hubY - 1);
    ctx.stroke();
    ctx.fillStyle = shadeColor(color, 1.5);
    ctx.beginPath();
    ctx.arc(c.x, hubY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 0.7);
    ctx.beginPath();
    ctx.arc(c.x, hubY, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The Pirate Ship: a swinging galleon on an A-frame gantry. The hull is a
   * pendulum hanging from a high pivot — a lazy sway when idle, a big arc
   * with riders aboard and a jolly-roger snapping while it's busy.
   */
  function drawPirateShip(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    busy: boolean,
    broken: boolean
  ) {
    const plinthH = 5;
    drawBlock(ctx, VIEW, vx, vy, plinthH, color, 0.16, liftPx);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const baseY = c.y - liftPx - plinthH;
    const pivotY = baseY - 26;
    const armLen = 17;
    // Pendulum: eased amplitude, faster and wider while loaded.
    const amp = broken ? 0.18 : busy ? 0.85 : 0.32;
    const rate = busy ? 2.2 : 1.1;
    const swing = broken ? 0.2 : amp * Math.sin(clock * rate);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Back gantry leg first, so the hull swings in front of it.
    ctx.strokeStyle = shadeColor(color, 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.x - 5, baseY - 1.5);
    ctx.lineTo(c.x + 2.5, pivotY - 1);
    ctx.lineTo(c.x + 11, baseY - 1.5);
    ctx.stroke();

    // The hull hangs from the pivot at the end of the swing arm.
    const hx = c.x + Math.sin(swing) * armLen;
    const hy = pivotY + Math.cos(swing) * armLen;
    // Suspension arms from pivot to the hull's two ends.
    ctx.strokeStyle = shadeColor(color, 1.2);
    ctx.lineWidth = 1;
    for (const end of [-1, 1]) {
      const ex = hx + Math.cos(swing) * end * 7;
      const ey = hy - Math.sin(swing) * end * 7;
      ctx.beginPath();
      ctx.moveTo(c.x, pivotY);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    // Hull: an upturned boat with bow and stern lifted, drawn in the swing
    // frame so bow/stern tip with the arc.
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(swing);
    ctx.fillStyle = shadeColor(color, 0.55);
    ctx.beginPath();
    ctx.moveTo(-8.5, -1);
    ctx.quadraticCurveTo(-9.5, -6, -6, -6.5);
    ctx.lineTo(6, -6.5);
    ctx.quadraticCurveTo(9.5, -6, 8.5, -1);
    ctx.quadraticCurveTo(0, 4, -8.5, -1);
    ctx.closePath();
    ctx.fill();
    // Lit gunwale strake and a hull rib line.
    ctx.strokeStyle = shadeColor(color, 1.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8.2, -1.4);
    ctx.quadraticCurveTo(0, 3, 8.2, -1.4);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(color, 0.35);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-6, -3.5);
    ctx.lineTo(6, -3.5);
    ctx.stroke();
    // Rider heads bob above the gunwale while it's busy.
    if (busy && !broken) {
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = GUEST_COLORS[k % GUEST_COLORS.length];
        ctx.beginPath();
        ctx.arc(-4.5 + k * 3, -6.6, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Bowsprit mast with the jolly roger.
    ctx.strokeStyle = shadeColor(color, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, -13);
    ctx.stroke();
    const fla = broken ? 0 : Math.sin(clock * 6) * 0.8;
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(6 + fla, -11.6);
    ctx.lineTo(0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath();
    ctx.arc(2.4, -11.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Front gantry leg, cross-brace, pivot cap and footings.
    ctx.strokeStyle = shadeColor(color, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - 11, baseY + 1.5);
    ctx.lineTo(c.x - 2.5, pivotY + 1);
    ctx.lineTo(c.x + 5, baseY + 1.5);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - 7, baseY - 10);
    ctx.lineTo(c.x + 1.5, baseY - 10);
    ctx.stroke();
    ctx.fillStyle = shadeColor(color, 0.45);
    ctx.fillRect(c.x - 12.5, baseY, 3.5, 2);
    ctx.fillRect(c.x + 3.5, baseY, 3.5, 2);
    ctx.fillStyle = shadeColor(color, 1.5);
    ctx.beginPath();
    ctx.arc(c.x, pivotY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The Haunted Manor dark ride: a crooked gabled house with a lopsided
   * turret, a window that flickers on the blink cadence, and a pale wisp
   * that drifts out of the eaves — livelier while a car is inside.
   */
  function drawManor(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    busy: boolean,
    broken: boolean
  ) {
    const bodyH = 15;
    const inset = 0.16;
    drawBlock(ctx, VIEW, vx, vy, bodyH, color, inset, liftPx);
    const fc = blockFaceCorners(VIEW, vx, vy, inset);
    const { w, s, e } = fc;
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Sagging eave line and clapboard seams on the two visible faces.
    ctx.strokeStyle = 'rgba(15, 20, 34, 0.3)';
    ctx.lineWidth = 0.75;
    for (let r = 1; r <= 2; r++) {
      ctx.beginPath();
      blockSeamPath(ctx, fc, liftPx + (bodyH * r) / 3);
      ctx.stroke();
    }
    // Boarded windows: one per face, the near one flickering with the blink.
    for (let f = 0; f < 2; f++) {
      const a = f === 0 ? w : s;
      const b = f === 0 ? s : e;
      const wx = a.x + (b.x - a.x) * 0.5;
      const wy = a.y + (b.y - a.y) * 0.5 - liftPx - bodyH * 0.55;
      const lit = !broken && f === 1 && blink(clock, vx + vy);
      ctx.fillStyle = lit ? 'rgba(180, 255, 170, 0.85)' : 'rgba(12, 16, 26, 0.7)';
      ctx.fillRect(wx - 1.5, wy - 2.6, 3, 3.2);
      ctx.strokeStyle = shadeColor(color, 1.3);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(wx - 1.5, wy - 2.6, 3, 3.2);
    }

    // Steep gable roof over the body, ridge tipped off-centre so it reads
    // crooked; a lit rim on the near slope.
    const roofBaseY = c.y - liftPx - bodyH;
    const ridgeX = c.x + 3;
    const ridgeY = roofBaseY - 12;
    ctx.fillStyle = shadeColor(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(w.x, w.y - liftPx - bodyH);
    ctx.lineTo(ridgeX, ridgeY);
    ctx.lineTo(s.x, s.y - liftPx - bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 0.7);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - liftPx - bodyH);
    ctx.lineTo(ridgeX, ridgeY);
    ctx.lineTo(e.x, e.y - liftPx - bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 1.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - liftPx - bodyH);
    ctx.lineTo(ridgeX, ridgeY);
    ctx.stroke();

    // Lopsided turret rising off the far corner, with its own cone cap.
    const tx = w.x + (ridgeX - w.x) * 0.32;
    const tBaseY = w.y - liftPx - bodyH - 2;
    ctx.fillStyle = shadeColor(color, 0.62);
    ctx.fillRect(tx - 2.4, tBaseY - 10, 4.8, 11);
    ctx.strokeStyle = shadeColor(color, 1.25);
    ctx.lineWidth = 0.75;
    ctx.strokeRect(tx - 2.4, tBaseY - 10, 4.8, 11);
    ctx.fillStyle = shadeColor(color, 0.42);
    ctx.beginPath();
    ctx.moveTo(tx - 3.2, tBaseY - 10);
    ctx.lineTo(tx + 0.5, tBaseY - 17);
    ctx.lineTo(tx + 3.2, tBaseY - 10);
    ctx.closePath();
    ctx.fill();

    // Ghost wisp drifting from the eaves, a hair more active while busy.
    if (!broken) {
      const drift = clock * (busy ? 1.6 : 0.7);
      const gx = c.x + Math.sin(drift) * 8;
      const gy = roofBaseY - 4 - (0.5 + 0.5 * Math.sin(drift * 1.3)) * (busy ? 12 : 6);
      const galpha = (busy ? 0.5 : 0.28) * (0.6 + 0.4 * Math.sin(drift * 2));
      ctx.fillStyle = `rgba(214, 236, 248, ${galpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 2.4, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(20, 26, 40, ${(galpha * 0.9).toFixed(3)})`;
      ctx.fillRect(gx - 1, gy - 0.6, 0.7, 0.7);
      ctx.fillRect(gx + 0.3, gy - 0.6, 0.7, 0.7);
    }
    ctx.restore();
  }

  /**
   * Bumper Cars: an open pavilion — a striped roof on corner posts over a
   * checker-floor rink, with three hashed-colour cars sliding on offset
   * phases and sparks jumping off the ceiling grid while it's busy.
   */
  function drawBumper(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    i: number,
    busy: boolean,
    broken: boolean
  ) {
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const floorY = c.y - liftPx;
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Checker-floor rink: an inset diamond pad, two tones.
    const rink = 11;
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2;
      ctx.fillStyle = q % 2 === 0 ? shadeColor(color, 0.9) : shadeColor(color, 0.62);
      ctx.beginPath();
      ctx.moveTo(c.x, floorY);
      ctx.lineTo(c.x + Math.cos(a) * rink, floorY + Math.sin(a) * rink * 0.5);
      ctx.lineTo(
        c.x + Math.cos(a + Math.PI / 2) * rink,
        floorY + Math.sin(a + Math.PI / 2) * rink * 0.5
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = shadeColor(color, 1.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - rink, floorY);
    ctx.lineTo(c.x, floorY - rink * 0.5);
    ctx.lineTo(c.x + rink, floorY);
    ctx.lineTo(c.x, floorY + rink * 0.5);
    ctx.closePath();
    ctx.stroke();

    // Three cars sliding round the rink on offset phases; each bumps at its
    // own hashed radius so they read as jostling, not orbiting in lockstep.
    const spin = broken ? 0 : clock * (busy ? 1.8 : 0.7);
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      const rr = 5.5 + hash01(i, k + 1) * 3;
      const cx = c.x + Math.cos(a) * rr;
      const cy = floorY + Math.sin(a) * rr * 0.5;
      const carCol = GUEST_COLORS[(i + k) % GUEST_COLORS.length];
      ctx.fillStyle = shadeColor(carCol, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.8, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = carCol;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 0.8, 2.4, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      if (busy && !broken) {
        ctx.fillStyle = GUEST_SKINS[(i + k) % GUEST_SKINS.length];
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      // Contact pole up to the ceiling grid.
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 2);
      ctx.lineTo(cx, cy - 11);
      ctx.stroke();
    }

    // Four corner posts and a scalloped striped roof over the rink.
    const roofY = floorY - 13;
    ctx.strokeStyle = shadeColor(color, 0.5);
    ctx.lineWidth = 1.5;
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2 + Math.PI / 4;
      const px = c.x + Math.cos(a) * rink * 0.9;
      const py = floorY + Math.sin(a) * rink * 0.45;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 13);
      ctx.stroke();
    }
    // Roof: a shallow striped canopy, apex lifted.
    for (let q = 0; q < 4; q++) {
      const a0 = (q * Math.PI) / 2 - Math.PI / 4;
      const a1 = a0 + Math.PI / 2;
      ctx.fillStyle = q % 2 === 0 ? shadeColor(color, 1.3) : '#e8e4da';
      ctx.beginPath();
      ctx.moveTo(c.x, roofY - 4);
      ctx.lineTo(c.x + Math.cos(a0) * rink, roofY + Math.sin(a0) * rink * 0.5);
      ctx.lineTo(c.x + Math.cos(a1) * rink, roofY + Math.sin(a1) * rink * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(c.x, roofY - 4.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Sparks jumping off the ceiling grid while cars run.
    if (busy && !broken && blink(clock, i)) {
      ctx.fillStyle = '#fef9c3';
      const sa = clock * 3 + i;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(sa) * 5, roofY - 1 + Math.sin(sa) * 2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Helter Skelter: a tall striped cone with a spiral slide ribbon winding
   * down its outside, a mat rider on the lowest turn while busy, and a
   * pennant at the peak.
   */
  function drawHelter(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    busy: boolean,
    broken: boolean
  ) {
    const baseH = 5;
    drawBlock(ctx, VIEW, vx, vy, baseH, color, 0.2, liftPx);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const baseY = c.y - liftPx - baseH;
    const towerH = 32;
    const apexY = baseY - towerH;
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Cone body: alternating vertical stripes from a base ellipse to the apex.
    const rBase = 9;
    const segs = 10;
    for (let k = 0; k < segs; k++) {
      const a0 = Math.PI + (k * Math.PI) / segs; // front half, left to right
      const a1 = Math.PI + ((k + 1) * Math.PI) / segs;
      ctx.fillStyle = k % 2 === 0 ? shadeColor(color, 1.15) : '#efe9dc';
      ctx.beginPath();
      ctx.moveTo(c.x, apexY);
      ctx.lineTo(c.x + Math.cos(a0) * rBase, baseY + Math.sin(a0) * 3.5);
      ctx.lineTo(c.x + Math.cos(a1) * rBase, baseY + Math.sin(a1) * 3.5);
      ctx.closePath();
      ctx.fill();
    }
    // Grounding edge down the cone's near silhouette.
    ctx.strokeStyle = shadeColor(color, 0.4);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(c.x - rBase, baseY);
    ctx.lineTo(c.x, apexY);
    ctx.lineTo(c.x + rBase, baseY);
    ctx.stroke();

    // Spiral slide ribbon: sampled helix, radius shrinking toward the apex,
    // drawn as a lit band with a shadow edge under it.
    const turns = 2.6;
    const steps = 40;
    const slideRot = broken ? 0.6 : clock * 0.25;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? shadeColor(color, 0.4) : '#f4d06a';
      ctx.lineWidth = pass === 0 ? 2.4 : 1.6;
      ctx.beginPath();
      for (let stp = 0; stp <= steps; stp++) {
        const t = stp / steps; // 0 at apex, 1 at base
        const a = slideRot + turns * Math.PI * 2 * t;
        const rr = 2 + rBase * t;
        const px = c.x + Math.cos(a) * rr;
        const py = apexY + (towerH - 3) * t + Math.sin(a) * rr * 0.38 + pass * 0.8;
        if (stp === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Mat rider on the lowest visible turn while busy.
    if (busy && !broken) {
      const t = 0.9;
      const a = slideRot + turns * Math.PI * 2 * t;
      const rr = 2 + rBase * t;
      const px = c.x + Math.cos(a) * rr;
      const py = apexY + (towerH - 3) * t + Math.sin(a) * rr * 0.38;
      ctx.fillStyle = GUEST_COLORS[(vx + vy) % GUEST_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(px, py - 1.5, 1.8, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GUEST_SKINS[(vx + vy) % GUEST_SKINS.length];
      ctx.beginPath();
      ctx.arc(px, py - 3, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cap and a fluttering pennant at the peak.
    ctx.fillStyle = shadeColor(color, 0.7);
    ctx.beginPath();
    ctx.arc(c.x, apexY, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, apexY);
    ctx.lineTo(c.x, apexY - 6);
    ctx.stroke();
    ctx.fillStyle = '#e05a6b';
    ctx.beginPath();
    ctx.moveTo(c.x, apexY - 6);
    ctx.lineTo(c.x + 5 + Math.sin(clock * 5) * 0.8, apexY - 4.8);
    ctx.lineTo(c.x, apexY - 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * The Log Flume drawn as an actual ride: a low platform holding an oval
   * water channel around a raised island, with a log running the circuit —
   * fast with spray off the front drop while guests ride, a gentle drift
   * when idle. A zone reskin's emoji replaces the drawn log as the themed
   * vehicle (swan, croc, octopus), same slot the carousel gives its mounts.
   */
  function drawFlume(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    vehicle: string | undefined,
    busy: boolean,
    broken: boolean
  ) {
    const platformH = 6;
    drawBlock(ctx, VIEW, vx, vy, platformH, color, 0.1, liftPx);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const topY = c.y - liftPx - platformH;
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;
    // The circuit: jointed stone rim, shimmering water ring with drifting
    // highlight streaks, and a planted island in the middle.
    ctx.fillStyle = shadeColor(color, 0.55);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 14, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 0.35);
    ctx.lineWidth = 0.75;
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5;
      ctx.beginPath();
      ctx.moveTo(c.x + 12.4 * Math.cos(a), topY + 5.4 * Math.sin(a));
      ctx.lineTo(c.x + 14 * Math.cos(a), topY + 6.2 * Math.sin(a));
      ctx.stroke();
    }
    ctx.fillStyle = shadeColor('#2f8fc4', 0.9 + 0.2 * Math.sin(clock * 2.1 + vx + vy));
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Two moving water highlights chase each other round the channel.
    ctx.strokeStyle = 'rgba(214, 236, 248, 0.55)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const a0 = clock * (busy ? 2.6 : 0.9) + k * Math.PI + 0.9;
      ctx.beginPath();
      ctx.ellipse(c.x, topY, 9.2, 3.7, 0, a0, a0 + 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = shadeColor(color, 1.15);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 6.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Island planting: a rock and a stub palm.
    ctx.fillStyle = shadeColor(color, 0.8);
    ctx.beginPath();
    ctx.ellipse(c.x + 2.6, topY + 0.6, 1.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6a4a26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - 1.5, topY + 1);
    ctx.lineTo(c.x - 2, topY - 3.5);
    ctx.stroke();
    ctx.strokeStyle = '#3f7a3f';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(c.x - 2, topY - 3.5);
      ctx.quadraticCurveTo(c.x - 2 + (k - 1) * 3, topY - 6, c.x - 2 + (k - 1) * 4.5, topY - 4.2);
      ctx.stroke();
    }
    // The log rides the ring between island and rim.
    const angle = broken ? 1.2 : clock * (busy ? 2.6 : 0.9);
    const lx = c.x + Math.cos(angle) * 9.2;
    const ly = topY + Math.sin(angle) * 3.7;
    if (vehicle) {
      ctx.font = '10px serif';
      ctx.fillText(vehicle, lx, ly - 3);
    } else {
      // A hollowed log: bark shell, pale rings on the stern, seat channel.
      ctx.fillStyle = '#5f3a1b';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 1.5, 4.2, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a9743d';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 2.2, 3, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5230';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 2.2, 1.9, 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d9b98a';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.ellipse(lx - 3.4, ly - 1.6, 0.8, 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Spray while a loaded log shoots the front of the circuit
    // (sin(angle) ≈ 1 is the point nearest the viewer).
    if (busy && !broken && Math.sin(angle) > 0.8) {
      ctx.fillStyle = 'rgba(226, 240, 248, 0.85)';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(lx + (k - 1) * 4, ly - 4 - k * 1.5, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Food and drink stalls drawn as tiny buildings instead of emoji on
   * blocks: a hut with a striped awning slung over its two viewer-facing
   * sides, a pale counter band under it, and the product emoji as the sign
   * above the roof (bouncing gently while a customer is being served).
   */
  function drawStall(
    vx: number,
    vy: number,
    liftPx: number,
    color: string,
    glyph: string,
    busy: boolean,
    broken: boolean
  ) {
    const bodyH = 10;
    const inset = 0.18;
    drawBlock(ctx, VIEW, vx, vy, bodyH, color, inset, liftPx);
    const { e, s, w } = blockFaceCorners(VIEW, vx, vy, inset);
    // The awning's outer corners overhang the footprint and sag a little.
    const eOut = isoProject(VIEW, vx + 1 - inset + 0.2, vy + inset - 0.08);
    const sOut = isoProject(VIEW, vx + 1 - inset + 0.14, vy + 1 - inset + 0.14);
    const wOut = isoProject(VIEW, vx + inset - 0.08, vy + 1 - inset + 0.2);
    const rimLift = liftPx + bodyH + 1;
    const outerLift = liftPx + bodyH - 3;
    // Shade once per stall, not per strip — these run per frame.
    const stripe = shadeColor(color, 1.3);
    const counterCol = shadeColor(color, 1.45);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;
    drawAwningFace(ctx, w, s, wOut, sOut, rimLift, outerLift, stripe);
    drawAwningFace(ctx, s, e, sOut, eOut, rimLift, outerLift, stripe);
    drawScallops(ctx, wOut, sOut, outerLift, stripe);
    drawScallops(ctx, sOut, eOut, outerLift, stripe);
    drawCounterFace(ctx, w, s, liftPx, counterCol);
    drawCounterFace(ctx, s, e, liftPx, counterCol);
    // Awning corner posts ground the overhang.
    ctx.strokeStyle = shadeColor(color, 0.5);
    ctx.lineWidth = 1;
    for (const corner of [wOut, sOut, eOut]) {
      ctx.beginPath();
      ctx.moveTo(corner.x, corner.y - outerLift);
      ctx.lineTo(corner.x, corner.y - liftPx + 1);
      ctx.stroke();
    }
    // Counter goods: a few product blobs sitting on the near counter band.
    ctx.fillStyle = '#f4e8d0';
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.2;
      ctx.beginPath();
      ctx.arc(s.x + (e.x - s.x) * t, s.y + (e.y - s.y) * t - liftPx - 6.6, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Menu board hung on the west face under the counter.
    const mbx = (w.x + s.x) / 2;
    const mby = (w.y + s.y) / 2 - liftPx - 1;
    ctx.fillStyle = '#2b2620';
    ctx.fillRect(mbx - 2.2, mby - 3.4, 4.4, 3);
    ctx.fillStyle = 'rgba(244, 238, 224, 0.8)';
    ctx.fillRect(mbx - 1.6, mby - 2.8, 3.2, 0.6);
    ctx.fillRect(mbx - 1.6, mby - 1.6, 2.4, 0.6);
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const bob = busy && !broken ? Math.sin(clock * 3) : 0;
    ctx.font = '11px serif';
    ctx.fillText(glyph, c.x, c.y - liftPx - bodyH - 7 + bob);
    ctx.restore();
  }

  /**
   * The Sky Tower's observation ring: rides slowly up and down the shaft
   * while guests are aboard, resting at the base otherwise.
   */
  function drawSkyDeck(
    vx: number,
    vy: number,
    liftPx: number,
    towerH: number,
    busy: boolean,
    broken: boolean
  ) {
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;

    // Shaft detail: floor seams and a window column on the two visible
    // faces of the (0.22-inset) block drawn just before this call.
    const fc = blockFaceCorners(VIEW, vx, vy, 0.22);
    const { w, s, e } = fc;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 0.75;
    for (let r = 1; r < 4; r++) {
      ctx.beginPath();
      blockSeamPath(ctx, fc, liftPx + (towerH * r) / 4);
      ctx.stroke();
    }
    for (let f = 0; f < 2; f++) {
      const a = f === 0 ? w : s;
      const b = f === 0 ? s : e;
      for (let r = 0; r < 4; r++) {
        for (let col = 0; col < 2; col++) {
          const t = 0.35 + col * 0.3;
          const wx = a.x + (b.x - a.x) * t;
          const wy = a.y + (b.y - a.y) * t - liftPx - 4 - (towerH - 10) * (r / 4);
          ctx.fillStyle = (r + col + f) % 2 === 0 ? 'rgba(214, 236, 248, 0.55)' : 'rgba(10, 16, 28, 0.45)';
          ctx.fillRect(wx - 0.7, wy - 2.4, 1.4, 2.4);
        }
      }
    }

    // Observation ring: windowed cabin ring with a roof cap, riding the shaft.
    const travel = towerH - 14;
    const deckLift = busy && !broken ? 6 + (Math.sin(clock * 1.1) * 0.5 + 0.5) * travel : 6;
    const y = c.y - liftPx - deckLift;
    ctx.fillStyle = 'rgba(148, 160, 176, 0.9)';
    ctx.beginPath();
    ctx.ellipse(c.x, y + 1.2, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.beginPath();
    ctx.ellipse(c.x, y, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Window band round the front of the ring.
    ctx.fillStyle = 'rgba(58, 76, 96, 0.85)';
    for (let k = 0; k < 7; k++) {
      const a = (Math.PI * (k + 0.5)) / 7;
      ctx.fillRect(c.x + 11.6 * Math.cos(a) - 0.8, y + 3.6 * Math.sin(a) - 0.9, 1.6, 1.8);
    }
    ctx.fillStyle = 'rgba(196, 206, 218, 0.9)';
    ctx.beginPath();
    ctx.ellipse(c.x, y - 2, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mast and blinking beacon over the shaft top.
    const topY = c.y - liftPx - towerH;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, topY);
    ctx.lineTo(c.x, topY - 7);
    ctx.stroke();
    if (!broken && blink(clock)) {
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(c.x, topY - 7.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Zone Gates as built archways instead of a flat emoji sticker: two
   * stone posts with capitals, an arched span in the zone's colour, pennant
   * bunting, and the zone emoji as the keystone sign.
   */
  function drawGate(vx: number, vy: number, liftPx: number, emoji: string, zoneColor: string) {
    const c = isoProject(VIEW, vx + 0.5, vy + 0.5);
    const gy = c.y - liftPx + 3;
    const postH = 15;
    // Posts: lit face plus a darker side sliver, capital on top.
    for (let s = -1; s <= 1; s += 2) {
      const px = c.x + s * 9;
      ctx.fillStyle = '#8d8577';
      ctx.fillRect(px - 1.5, gy - postH, 3, postH);
      ctx.fillStyle = '#6e6759';
      ctx.fillRect(px + 0.5, gy - postH, 1, postH);
      ctx.fillStyle = '#a29a8a';
      ctx.fillRect(px - 2.25, gy - postH - 1.5, 4.5, 1.5);
      ctx.fillStyle = '#6e6759';
      ctx.fillRect(px - 2, gy - 1, 4, 1);
    }
    // Arch span: a colour band between the capitals with a rise.
    ctx.strokeStyle = shadeColor(zoneColor, 1.2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.x - 9, gy - postH - 1);
    ctx.quadraticCurveTo(c.x, gy - postH - 6.5, c.x + 9, gy - postH - 1);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(zoneColor, 0.7);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(c.x - 9, gy - postH + 0.5);
    ctx.quadraticCurveTo(c.x, gy - postH - 5, c.x + 9, gy - postH + 0.5);
    ctx.stroke();
    // Pennant bunting under the span.
    for (let k = 0; k < 3; k++) {
      const bx = c.x - 4.5 + k * 4.5;
      const by = gy - postH - 4 + Math.abs(k - 1) * 1.4;
      ctx.fillStyle = k % 2 === 0 ? '#efe9dc' : shadeColor(zoneColor, 1.35);
      ctx.beginPath();
      ctx.moveTo(bx - 1.4, by);
      ctx.lineTo(bx + 1.4, by);
      ctx.lineTo(bx + Math.sin(clock * 3 + k) * 0.5, by + 2.6);
      ctx.closePath();
      ctx.fill();
    }
    // Keystone sign: the zone emoji riding above the span.
    ctx.font = '11px serif';
    ctx.fillText(emoji, c.x, gy - postH - 10);
  }

  /**
   * Whether tile `i` still reads as a tunnel: the flag alone isn't enough,
   * since lowering a *neighbouring* hillside back to flat leaves
   * `tunnels[i]` stale (terraforming clears the flag on the tiles whose
   * height it moves, not on their still-flat neighbours). Deriving it from
   * current state means guests only vanish where there's still a hill to
   * vanish into.
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
    const p = projectWorld(pos.x, pos.y);
    p.y -= Math.max(0, pos.z) * TERRAIN_STEP;
    const walking =
      (guest.state === 'walking' || guest.state === 'leaving') && guest.step < guest.path.length;
    // Facing: screen-space sign of the current step; idle guests keep the
    // facing their style roll gave them.
    let dir = guest.styleRoll < 0.5 ? -1 : 1;
    if (walking) {
      const from = tileCenter(guest.path[guest.step - 1] ?? guest.tile);
      const to = tileCenter(guest.path[guest.step]);
      const sa = projectWorld(from.x, from.y);
      const sb = projectWorld(to.x, to.y);
      if (sb.x !== sa.x) dir = sb.x > sa.x ? 1 : -1;
    }
    const phase = guest.styleRoll * Math.PI * 2;
    const stride = walking ? Math.sin(clock * 9 + phase) : 0;
    const bob = walking
      ? Math.abs(Math.cos(clock * 9 + phase)) * 0.8
      : guest.state === 'using'
        ? Math.abs(Math.sin(clock * 4 + phase)) * 1.2
        : 0;
    const skin = GUEST_SKINS[Math.floor(guest.styleRoll * 16) % GUEST_SKINS.length];
    const hair = GUEST_HAIR[Math.floor(guest.styleRoll * 96) % GUEST_HAIR.length];

    ctx.save();
    ctx.globalAlpha = visibility;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs: trouser-dark swings around the hip; feet stay on the ground line.
    const shades = GUEST_SHADES.get(guest.color)!;
    ctx.strokeStyle = shades.trouser;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x - 0.9, p.y - 4 - bob);
    ctx.lineTo(p.x - 0.9 + stride * 1.6, p.y);
    ctx.moveTo(p.x + 0.9, p.y - 4 - bob);
    ctx.lineTo(p.x + 0.9 - stride * 1.6, p.y);
    ctx.stroke();

    // Torso: slightly tapered coat in the guest's colour, hem shadow, lit rim.
    const hipY = p.y - 3.5 - bob;
    const shoulderY = p.y - 9 - bob;
    ctx.fillStyle = guest.color;
    ctx.beginPath();
    ctx.moveTo(p.x - 2.4, hipY);
    ctx.lineTo(p.x - 1.9, shoulderY);
    ctx.lineTo(p.x + 1.9, shoulderY);
    ctx.lineTo(p.x + 2.4, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.fillStyle = shades.hem;
    ctx.fillRect(p.x - 2.2, hipY - 1, 4.4, 1);
    ctx.fillStyle = shades.rim;
    ctx.fillRect(p.x + dir * 1.1, shoulderY + 0.5, 0.8, 4);

    // Arms swing opposite the legs while walking.
    ctx.strokeStyle = shades.arm;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 2, shoulderY + 1);
    ctx.lineTo(p.x - 2 - stride * 1.1, shoulderY + 4);
    ctx.moveTo(p.x + 2, shoulderY + 1);
    ctx.lineTo(p.x + 2 + stride * 1.1, shoulderY + 4);
    ctx.stroke();

    // Head: skin with a hair cap and a leading-side eye.
    const headY = shoulderY - 2;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(p.x, headY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(p.x, headY - 0.3, 2, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    ctx.fillStyle = '#10131c';
    ctx.fillRect(p.x + dir * 0.8 - 0.3, headY - 0.2, 0.7, 0.7);

    // Theme Park-style thought bubble: what this guest badly wants right now
    const urgent = mostUrgentNeed(guest.needs);
    const thought =
      guest.state === 'leaving' && happiness(guest.needs) < 25
        ? '😡'
        : guest.state !== 'using' && urgent && guest.needs[urgent] < 40
          ? NEED_EMOJI[urgent]
          : undefined;
    if (thought) {
      const by = p.y - 19;
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

  /**
   * A placed coaster, drawn across its whole 2×2 footprint in a post-pass
   * (see render): a raised deck, an arched hill of twin rails with a small
   * train, a vertical loop for flair, and a station hut. Upright and
   * rotation-independent like the carousel, so it reads the same from every
   * view angle; the sprite is centred on the footprint.
   */
  function drawCoasterRide(anchor: number, busy: boolean, broken: boolean) {
    const ax = anchor % GRID_W;
    const ay = Math.floor(anchor / GRID_W);
    const liftPx = heights[anchor] * TERRAIN_STEP;
    const baseColor = BUILDING_STYLE.coaster!.color;
    const corner = (dx: number, dy: number) => {
      const p = projectWorld(ax + dx, ay + dy);
      p.y -= liftPx;
      return p;
    };
    const deck = [corner(0, 0), corner(2, 0), corner(2, 2), corner(0, 2)];
    const centre = corner(1, 1);

    ctx.save();
    if (broken) ctx.globalAlpha = 0.5;

    // Raised deck: a darker base diamond peeking below a lit top diamond.
    const skirt = 7;
    ctx.fillStyle = shadeColor(baseColor, 0.5);
    ctx.beginPath();
    ctx.moveTo(deck[0].x, deck[0].y + skirt);
    for (const p of deck.slice(1)) ctx.lineTo(p.x, p.y + skirt);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeColor(baseColor, 1.05);
    ctx.beginPath();
    ctx.moveTo(deck[0].x, deck[0].y);
    for (const p of deck.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeColor(baseColor, 1.4);
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // Superstructure, screen-space and upright, centred on the deck.
    const cx = centre.x;
    const cy = centre.y - 2;
    const span = 30;
    const railTop = cy - 34;
    // Two support posts under the hill.
    ctx.strokeStyle = shadeColor(baseColor, 1.5);
    ctx.lineWidth = 2;
    for (const sx of [-span * 0.35, span * 0.15]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx, cy);
      ctx.lineTo(cx + sx, railTop + 6);
      ctx.stroke();
    }
    // Quadratic hill through (cx - span, cy) → crest → (cx + span, cy).
    const arcX = (t: number) => {
      const mt = 1 - t;
      return mt * mt * (cx - span) + 2 * mt * t * (cx - span * 0.2) + t * t * (cx + span * 0.1);
    };
    const arcY = (t: number) => {
      const mt = 1 - t;
      return mt * mt * (cy - 2) + 2 * mt * t * railTop + t * t * (railTop + 2);
    };
    // Sleepers along the hill.
    ctx.strokeStyle = shadeColor(baseColor, 0.7);
    ctx.lineWidth = 1;
    for (let t = 0.1; t < 1; t += 0.14) {
      ctx.beginPath();
      ctx.moveTo(arcX(t), arcY(t) - 3);
      ctx.lineTo(arcX(t), arcY(t) + 3);
      ctx.stroke();
    }
    // Twin rails: dark understroke, bright steel on top.
    const drawRail = (off: number, color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx - span, cy - 2 + off);
      ctx.quadraticCurveTo(cx - span * 0.2, railTop + off, cx + span * 0.1, railTop + 2 + off);
      ctx.quadraticCurveTo(cx + span * 0.55, railTop + 12 + off, cx + span, cy - 6 + off);
      ctx.stroke();
    };
    drawRail(0, '#26262e', 3);
    drawRail(-2.4, '#c9ced8', 1.4);
    drawRail(1.6, '#9aa0ad', 1.2);

    // A vertical loop for flair, on the descent side.
    ctx.strokeStyle = '#c9ced8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx + span * 0.72, railTop + 15, 6, 9, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Train car: parked near the crest when idle, sliding along when in use.
    const u = busy ? (clock * 0.5) % 1 : 0.14;
    const carX = arcX(u);
    const carY = arcY(u);
    ctx.fillStyle = broken ? '#8a8f9c' : '#f24d4d';
    ctx.fillRect(carX - 5, carY - 6, 10, 5);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = GUEST_COLORS[k % GUEST_COLORS.length];
      ctx.beginPath();
      ctx.arc(carX - 3 + k * 3, carY - 6.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Station hut at the frontmost deck corner (rotation-robust).
    const hut = deck.reduce((a, b) => (b.y > a.y ? b : a));
    ctx.fillStyle = shadeColor(baseColor, 0.85);
    ctx.fillRect(hut.x - 6, hut.y - 9, 12, 8);
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(hut.x - 6, hut.y - 12, 12, 3);

    ctx.restore();

    if (broken) {
      ctx.font = '12px serif';
      ctx.fillText('🔧', cx, railTop - 8 + Math.sin(clock * 5) * 2);
    }
  }

  // The sky fill doubles as the frame clear; the gradient itself never
  // changes, so build it once instead of once per frame.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#11271a');
  sky.addColorStop(1, '#0c1c13');

  function render() {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const inUse = new Set<number>();
    for (const guest of guests) {
      if (guest.state === 'using' && guest.targetBuilding !== null) inUse.add(guest.targetBuilding);
    }

    // Guests draw interleaved with their *view* diagonal so blocks occlude
    // them correctly under any rotation.
    const guestsByDiag: Guest[][] = Array.from({ length: GRID_W + GRID_H - 1 }, () => []);
    for (const guest of guests) {
      const pos = guestPos(guest);
      const vp = rotatePoint(pos.x, pos.y, GRID_W, GRID_H, rotation);
      const d = Math.min(GRID_W + GRID_H - 2, Math.max(0, Math.floor(vp.tx) + Math.floor(vp.ty)));
      guestsByDiag[d].push(guest);
    }

    // One pass over the whole grid instead of a per-tile zoneAt lookup —
    // zoneAt rescans every tile for gates, which turns O(tiles) rendering
    // into O(tiles²) if called once per tile inside the loop below.
    const tileZones = zonesForTiles(tiles);

    // The world grid never moves; rendering walks the *view* grid (rotated
    // dimensions) back-to-front and maps each view tile to its world tile.
    const dims = rotatedDims(GRID_W, GRID_H, rotation);
    let lastDiag = -1;
    forEachTileBackToFront(dims.w, dims.h, (vx, vy, _vi, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) guestsByDiag[lastDiag].forEach(drawGuest);
        lastDiag = diag;
      }
      const { x, y } = unrotateTile(vx, vy, GRID_W, GRID_H, rotation);
      const i = y * GRID_W + x;
      const tile = tiles[i];
      const h = heights[i];
      const liftPx = h * TERRAIN_STEP;

      const zone = tileZones[i];

      if (tile === 'water') {
        const ripple = 0.85 + 0.25 * Math.sin(clock * 1.5 + (x + y) * 0.6);
        fillTile(ctx, VIEW, vx, vy, shadeColor('#1f6fa8', ripple));
      } else {
        // The coaster's footprint tiles (anchor + annexes) render as plain
        // grass here; the ride sprite is painted over them in a later pass.
        const groundColor =
          tile === 'path' || tile === 'entrance'
              ? '#8a7a5c'
              : zone
                ? ZONE_GROUND_CHECKER[zone][(x + y) % 2 === 0 ? 0 : 1]
                : (x + y) % 2 === 0
                  ? '#1d3b24'
                  : '#1f4028';
        if (h > 0) {
          drawBlock(ctx, VIEW, vx, vy, liftPx, groundColor, 0);
        } else {
          fillTile(ctx, VIEW, vx, vy, groundColor);
          if (tile === 'path' || tile === 'entrance') {
            strokeTile(ctx, VIEW, vx, vy, 'rgba(0, 0, 0, 0.2)', 1);
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
            const mouth = projectWorld(mx, my);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.ellipse(mouth.x, mouth.y - 3, 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      const top = isoProject(VIEW, vx + 0.5, vy + 0.5);
      top.y -= liftPx;
      if (tile === 'entrance') {
        ctx.font = '13px serif';
        ctx.fillText('🎟️', top.x, top.y);
      } else if (tile === 'tree') {
        ctx.font = '17px serif';
        ctx.fillText('🌳', top.x, top.y - 7);
      } else if (GATE_EMOJI[tile]) {
        drawGate(vx, vy, liftPx, GATE_EMOJI[tile]!, ZONES[gateZone(tile)!].groundColor);
      } else if (BUILDINGS[tile] && tile !== 'coaster') {
        // The coaster is a 2×2 ride painted in a post-pass (see below), not
        // a single in-loop block; its footprint tiles fell through to ground.
        const style = BUILDING_STYLE[tile] ?? { color: '#44447a', height: BLOCK_HEIGHT };
        const reskin = zone ? ZONE_BUILDING_STYLE[zone][tile] : undefined;
        const broken = isBroken(i);
        const color = reskin?.color ?? style.color;
        const busy = inUse.has(i);
        if (tile === 'carousel') {
          drawCarousel(vx, vy, liftPx, color, reskin?.emoji ?? TILE_EMOJI.carousel!, busy, broken);
        } else if (tile === 'ferris') {
          drawFerris(vx, vy, liftPx, color, busy, broken);
        } else if (tile === 'pirateship') {
          drawPirateShip(vx, vy, liftPx, color, busy, broken);
        } else if (tile === 'manor') {
          drawManor(vx, vy, liftPx, color, busy, broken);
        } else if (tile === 'bumper') {
          drawBumper(vx, vy, liftPx, color, i, busy, broken);
        } else if (tile === 'helter') {
          drawHelter(vx, vy, liftPx, color, busy, broken);
        } else if (tile === 'flume') {
          drawFlume(vx, vy, liftPx, color, reskin?.emoji, busy, broken);
        } else if (tile === 'food' || tile === 'drink') {
          drawStall(vx, vy, liftPx, color, reskin?.emoji ?? TILE_EMOJI[tile]!, busy, broken);
        } else {
          // The Sky Tower gets a slimmer shaft so its travelling deck ring
          // reads as wrapping around it rather than painted on the face.
          drawBlock(ctx, VIEW, vx, vy, style.height, color, tile === 'skytower' ? 0.22 : 0.08, liftPx);
          if (tile === 'skytower') drawSkyDeck(vx, vy, liftPx, style.height, busy, broken);
          ctx.save();
          // A broken ride's emoji hangs dimmed; the wrench bobs above.
          if (broken) ctx.globalAlpha = 0.45;
          ctx.font = `${tile === 'skytower' ? 16 : 14}px serif`;
          ctx.fillText(
            reskin?.emoji ?? TILE_EMOJI[tile] ?? '',
            top.x,
            top.y - style.height - (busy ? 2 : 0)
          );
          ctx.restore();
        }
        if (broken) {
          ctx.font = '12px serif';
          ctx.fillText('🔧', top.x, top.y - style.height - 12 + Math.sin(clock * 5) * 2);
        }
      }

    });
    if (lastDiag >= 0) guestsByDiag[lastDiag].forEach(drawGuest);

    // Coasters are 2×2 rides: paint each over its whole footprint in a final
    // pass (back-to-front) so a ride is never clipped by its own front tiles'
    // ground, which the tile loop drew earlier.
    const coasterDiag = (i: number) => {
      const vp = rotatePoint((i % GRID_W) + 1, Math.floor(i / GRID_W) + 1, GRID_W, GRID_H, rotation);
      return vp.tx + vp.ty;
    };
    const coasterTiles: number[] = [];
    tiles.forEach((t, i) => {
      if (t === 'coaster') coasterTiles.push(i);
    });
    coasterTiles
      .sort((a, b) => coasterDiag(a) - coasterDiag(b))
      .forEach(i => drawCoasterRide(i, inUse.has(i), isBroken(i)));

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % GRID_W;
      const y = Math.floor(hoverTile / GRID_W);
      const lockedZone = gateZone(selectedTool);
      // Placement legality can run a terraform-cascade BFS (placementCost),
      // so it's memoized per (tool, tile, world version) instead of
      // recomputed every frame; only the cheap money and zone-unlock
      // comparisons stay per-frame.
      const cacheKey = `${selectedTool}:${hoverTile}:${worldVersion}`;
      if (cacheKey !== hoverCacheKey) {
        hoverCacheKey = cacheKey;
        hoverCachePlaceable = canPlace(tiles, heights, tunnels, x, y, selectedTool);
        hoverCacheCost = placementCost(selectedTool, hoverTile);
      }
      const valid =
        hoverCachePlaceable &&
        hoverCacheCost <= money &&
        (!lockedZone || zoneUnlocked(lockedZone, rating, money));
      const hoverColor = valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)';
      // A multi-tile ride (the coaster) highlights its whole footprint, so the
      // player sees the 2×2 it will drop rather than just the anchor tile.
      const size = BUILDINGS[selectedTool as TileType]?.footprint ?? 1;
      const cells = footprintTiles(x, y, size) ?? [hoverTile];
      for (const c of cells) {
        const cv = rotateTile(c % GRID_W, Math.floor(c / GRID_W), GRID_W, GRID_H, rotation);
        strokeTile(ctx, VIEW, cv.x, cv.y, hoverColor, 2, heights[c] * TERRAIN_STEP);
      }
    }

    // Escaped balloons drift up over everything, swaying on their strings.
    for (const b of balloons) {
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life / 0.8));
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 4);
      ctx.quadraticCurveTo(b.x + 2, b.y + 9, b.x, b.y + 13);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3.6, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(b.x - 1.2, b.y - 1.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    fx.drawFloaters(ctx);

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
        // rotateTile inlined as scalar math, same as isoUnproject above.
        const vx = rotation === 1 ? GRID_H - 1 - y : rotation === 2 ? GRID_W - 1 - x : rotation === 3 ? y : x;
        const vy = rotation === 1 ? x : rotation === 2 ? GRID_H - 1 - y : rotation === 3 ? GRID_W - 1 - x : y;
        const b = (sy + heights[i] * TERRAIN_STEP - VIEW.originY) / VIEW.halfH;
        const tx = (a + b) / 2;
        const ty = (b - a) / 2;
        if (Math.floor(tx) === vx && Math.floor(ty) === vy) {
          const score = heights[i] * 1000 + (vx + vy);
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
    // Mid-flip the rotateY transform shrinks the bounding rect, so the
    // screen→tile math below would pick a tile far from the cursor.
    if (rotator.animating()) return -1;
    const p = hiDpi.toLogical(e);
    return pickTile(p.x, p.y);
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

    // Terraforming takes its own path: the cascade prices per height step and
    // must be charged and applied here, which grid.ts's generic applyTool
    // (a single flat-cost mutation) doesn't do.
    if (selectedTool === 'raiseLand' || selectedTool === 'lowerLand') {
      const plan = manualTerraformPlan(selectedTool, i);
      if (!plan) {
        const terraformable = tiles[i] === 'grass' || tiles[i] === 'path';
        const next = heights[i] + (selectedTool === 'raiseLand' ? 1 : -1);
        if (terraformable && next >= MIN_HEIGHT && next <= MAX_HEIGHT) {
          // In range on shapeable ground, so the cascade itself was blocked
          // by something immovable (water or a building) in its path.
          showToast(strings.tooSteep);
        }
        return;
      }
      const cost = terraformCharge(plan);
      if (cost > money) {
        showToast(strings.cantAfford);
        return;
      }
      money -= cost;
      applyTerraformPlan(heights, tunnels, plan);
      bumpWorldVersion();
      audio.playSfx('blip');
      invalidateGuests();
      return;
    }
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
      }
      return;
    }
    const lockedZone = gateZone(selectedTool);
    if (lockedZone && !zoneUnlocked(lockedZone, rating, money)) {
      showToast(strings.zoneLocked);
      return;
    }
    const cost = placementCost(selectedTool, i);
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    applyTool(tiles, heights, tunnels, x, y, selectedTool);
    bumpWorldVersion();
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

  const rotator = createViewRotator(canvas, rot => {
    rotation = rot;
    VIEW = makeView(rot);
    hoverTile = -1;
    armedTile = -1;
    // Screen-space effects were projected under the old rotation
    fx.clear();
    balloons = [];
  });
  document.getElementById('rotate-left')?.addEventListener('click', () => rotator.start(-1));
  document.getElementById('rotate-right')?.addEventListener('click', () => rotator.start(1));

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    resetPark(false);
  });
  restartBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    resetPark();
  });

  createGameLoop(update, render).start();
}
