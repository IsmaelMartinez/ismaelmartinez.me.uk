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
  drawBlock,
  drawRamp,
  shadeColor,
  forEachTileBackToFront,
  rotatedDims,
  rotateTile,
  unrotateTile,
  rotatePoint,
  rotateDir,
  createViewRotator,
  createGameAudio,
  wireSoundButton,
  createToaster,
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
import { parkRating, spawnInterval, dailyUpkeep } from './economy';
import {
  isRide,
  breakdownChance,
  pickBreakdownTile,
  coasterStallChance,
  rollSurge,
  surgedInterval,
  maxGuests,
  BREAKDOWN_SECONDS,
  STALL_SECONDS,
  type RideBreakdown,
  type Surge
} from './mayhem';
import {
  MIN_TRACK_LENGTH,
  CAR_CAPACITY,
  CART_MIN_SPEED,
  stepTile,
  dirBetween,
  segmentClimb,
  turnKind,
  validateTrack,
  canPlaceTrack,
  rotateToStation,
  thrillBoost,
  nextCartSpeed,
  advanceU,
  type Segment,
  type SegmentKind,
  type Dir,
  type TrackErrorCode
} from './track';

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
const DAY_LENGTH = 24; // seconds of game time per day
const GUEST_SPEED = 2.4; // tiles per second
/** Guests charged per coaster lap, taken at boarding — a premium ride, priced above the Big Wheel. */
const TRACK_RIDE_PRICE = 7;
/** Seconds a loaded/loading cart waits at the station before departing. */
const LOAD_WAIT = 3;
/** Guests waiting for a cart, per coaster. */
const QUEUE_CAP = 6;

const TRACK_KIND_EMOJI: Record<SegmentKind, string> = {
  flat: '🛤️',
  up: '⬆️',
  down: '⬇️',
  turnL: '↩️',
  turnR: '↪️',
  station: '🚉'
};

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
  skytower: '🗼'
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
    const t0 = k / strips;
    const t1 = (k + 1) / strips;
    ctx.fillStyle = k % 2 === 0 ? '#e8e4da' : stripe;
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 - rimLift);
    ctx.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 - rimLift);
    ctx.lineTo(aOut.x + (bOut.x - aOut.x) * t1, aOut.y + (bOut.y - aOut.y) * t1 - outerLift);
    ctx.lineTo(aOut.x + (bOut.x - aOut.x) * t0, aOut.y + (bOut.y - aOut.y) * t0 - outerLift);
    ctx.closePath();
    ctx.fill();
  }
}

/** drawStall's pale counter band across one front face (a–b), under the awning's shade. */
function drawCounterFace(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, liftPx: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - liftPx - 6);
  ctx.lineTo(b.x, b.y - liftPx - 6);
  ctx.lineTo(b.x, b.y - liftPx - 3.5);
  ctx.lineTo(a.x, a.y - liftPx - 3.5);
  ctx.closePath();
  ctx.fill();
}

interface Guest {
  tile: number;
  path: number[];
  step: number;
  progress: number;
  state: 'idle' | 'walking' | 'using' | 'leaving' | 'queuing' | 'riding';
  targetBuilding: number | null;
  useTimer: number;
  idleTimer: number;
  needs: Needs;
  color: string;
}

/**
 * A built, running coaster. `segments` is rotated (via `rotateToStation`) so
 * index 0 is always the station — the cart's `cartU` progress then lives in
 * `[0, segments.length)` with the station always at `u = 0`, so "the cart
 * wrapped past 0" directly means "back at the station", no extra bookkeeping.
 */
interface Coaster {
  segments: Segment[];
  cartU: number;
  cartSpeed: number;
  cartState: 'loading' | 'running';
  loadTimer: number;
  queue: Guest[];
  riders: Guest[];
  /** How much a completed lap restores the `thrill` need — precomputed from track.ts's thrillBoost. */
  thrillBoost: number;
  /** Seconds the cart hangs jammed mid-track (mayhem); 0 = running fine. */
  stallLeft: number;
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
  // Park's toasts linger slightly less than the arcade default (2.2s vs 2.4s).
  const { show: showToast } = createToaster(toastArea, { durationMs: 2200 });
  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tool-btn'));
  const speedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.speed-btn'));
  const trackPalette = el('track-palette');
  const trackKindsEl = root.querySelector<HTMLElement>('.track-kinds');
  const trackKindButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.track-kind-btn'));
  const trackStatusEl = el('track-status');
  const trackCloseBtn = el('track-close-btn') as HTMLButtonElement;
  const trackTestBtn = el('track-test-btn') as HTMLButtonElement;
  const trackCancelBtn = el('track-cancel-btn') as HTMLButtonElement;

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
    trackNotAdjacent: root.dataset.tTrackNotAdjacent || 'Track pieces must connect to the last one!',
    trackBlocked: root.dataset.tTrackBlocked || "Can't lay track there!",
    trackEmpty: root.dataset.tTrackEmpty || 'Lay some track first!',
    trackNotClosedYet: root.dataset.tTrackNotClosedYet || "Tap the start tile to close the loop first!",
    trackTooShort: root.dataset.tTrackTooShort || 'Loop needs to be longer before it can close!',
    trackDuplicateTile: root.dataset.tTrackDuplicateTile || 'Track already crosses that tile!',
    trackNeedsStation: root.dataset.tTrackNeedsStation || 'Needs exactly one station piece!',
    trackNotClosed: root.dataset.tTrackNotClosed || "Track pieces don't connect correctly!",
    trackTooSteep:
      root.dataset.tTrackTooSteep || 'Too steep — a climb or drop needs a straight piece around it!',
    trackHeightMismatch:
      root.dataset.tTrackHeightMismatch || "Track and terrain heights don't match — reshape the land or the piece!",
    trackStationStraight: root.dataset.tTrackStationStraight || 'The station must be on a straight run!',
    trackDraftInWay: root.dataset.tTrackDraftInWay || 'Your coaster draft crosses that tile!',
    trackStatusEmpty: root.dataset.tTrackStatusEmpty || 'Tap a grass tile to start laying track',
    trackStatusDrafting:
      root.dataset.tTrackStatusDrafting || 'Track length: {n} — tap the start tile to close the loop',
    trackStatusClosed:
      root.dataset.tTrackStatusClosed || 'Loop closed — Test Track to open it for £{cost}',
    breakdown: root.dataset.tBreakdown || 'A ride has broken down!',
    repaired: root.dataset.tRepaired || 'Ride repaired',
    surge: root.dataset.tSurge || 'A coach party pours through the gates!',
    coasterStall: root.dataset.tCoasterStall || 'The coaster has jammed mid-track!',
    newRecord: root.dataset.tNewRecord || 'New record crowd!'
  };

  const TRACK_ERROR_MESSAGES: Record<TrackErrorCode, string> = {
    tooShort: strings.trackTooShort,
    duplicateTile: strings.trackDuplicateTile,
    needsStation: strings.trackNeedsStation,
    notClosed: strings.trackNotClosed,
    tooSteep: strings.trackTooSteep,
    heightMismatch: strings.trackHeightMismatch
  };

  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H);

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
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];
  let balloons: { x: number; y: number; sway: number; color: string; life: number }[] = [];
  let coasters: Coaster[] = [];
  let breakdowns: RideBreakdown[] = [];
  let surge: Surge | null = null;
  // The table best when this run started, so beating it is announced once.
  let runStartRecord = 0;
  let recordCelebrated = false;
  // A drafted segment's `dir` and `kind` are placeholders until the *next*
  // tap fixes them (see handleTrackTap) — trackClosed flips true once the
  // closing tap sets the last segment's dir back to the start tile.
  let trackDraft: Segment[] | null = null;
  let trackClosed = false;
  let trackKind: SegmentKind = 'station';
  /**
   * One record per extension tap (parallel to trackDraft[1..]): the previous
   * head's kind before the tap overwrote it, so undo can restore it. (The
   * head's dir needs no restore — a tail segment's dir is never read until
   * the next extend/close rewrites it.) Terrain pushed by climb/drop pieces
   * is NOT recorded: it's charged the moment it's shaped and stays shaped
   * through undo/cancel, exactly like using the raise/lower tools by hand —
   * reverting it later could clobber terraform the player did in between.
   */
  let draftSteps: { headKind: SegmentKind }[] = [];
  const board = initScoreboard(document.getElementById('highscores'));
  // The record readout shows the table's best, beaten live by the current run.
  let record = board.top()?.score ?? 0;

  recordEl.textContent = record.toString();

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
    floaters.push({ x: p.x, y: p.y - buildingHeight - 6, text, color, life: 1 });
  }

  const treeCount = () => tiles.filter(t => t === 'tree').length;
  const hasAnyBuilding = () => tiles.some(t => BUILDINGS[t]) || coasters.length > 0;
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
    if (want === 'thrill') {
      const candidates = coasters.filter(c => c.queue.length < QUEUE_CAP).map(c => c.segments[0].tile);
      const found = nearestReachable(tiles, guest.tile, candidates);
      if (found && found.path.length >= 2) {
        startWalking(guest, found.path, found.building);
        return;
      }
      if (found) {
        // Already standing next to the station
        const coaster = coasters.find(c => c.segments[0].tile === found.building);
        if (coaster) {
          joinQueue(guest, coaster);
          return;
        }
      }
    } else if (want) {
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

  /** Queues a guest at a coaster's station; boarding happens in `updateCoaster`. */
  function joinQueue(guest: Guest, coaster: Coaster) {
    // The queue can fill up during the guest's walk over — chooseAction's
    // own QUEUE_CAP check only holds at the moment they set off — so this
    // re-checks at the point of actually joining, not just at dispatch.
    if (coaster.queue.length >= QUEUE_CAP) {
      guest.state = 'idle';
      guest.idleTimer = 0.3;
      return;
    }
    guest.state = 'queuing';
    guest.targetBuilding = coaster.segments[0].tile;
    coaster.queue.push(guest);
  }

  function arrive(guest: Guest): boolean {
    // Returns false if the guest left the park. A leaving guest's route ends
    // at the entrance (or they were cut off entirely) — either way, despawn.
    if (guest.state === 'leaving') return false;
    if (guest.targetBuilding !== null) {
      const coaster = coasters.find(c => c.segments[0].tile === guest.targetBuilding);
      if (coaster) {
        joinQueue(guest, coaster);
      } else {
        beginUsing(guest, guest.targetBuilding);
      }
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
      case 'queuing': {
        // Boarding (queuing → riding) happens in updateCoaster once the
        // cart is at the station and has room; nothing to do per-frame.
        return true;
      }
      case 'riding': {
        // Position and the thrill payout are entirely driven by
        // updateCoaster — riders aren't drawn individually (see render()).
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
          !!BUILDINGS[tiles[guest.targetBuilding]] ||
          tiles[guest.targetBuilding] === 'track';
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

  // --- Coaster track ---

  function createCoaster(segments: Segment[]): Coaster {
    return {
      segments,
      cartU: 0,
      cartSpeed: CART_MIN_SPEED,
      cartState: 'loading',
      loadTimer: LOAD_WAIT,
      queue: [],
      riders: [],
      thrillBoost: thrillBoost(segments, heights),
      stallLeft: 0
    };
  }

  /** Bulldozing any one tile of a coaster tears down the whole loop and cart. */
  function removeCoaster(coaster: Coaster) {
    for (const seg of coaster.segments) tiles[seg.tile] = 'grass';
    for (const guest of [...coaster.queue, ...coaster.riders]) {
      guest.state = 'idle';
      guest.idleTimer = 0.2;
      guest.targetBuilding = null;
    }
    coasters = coasters.filter(c => c !== coaster);
  }

  function updateCoaster(coaster: Coaster, dt: number) {
    if (coaster.cartState === 'loading') {
      while (coaster.riders.length < CAR_CAPACITY && coaster.queue.length > 0) {
        const guest = coaster.queue.shift()!;
        guest.state = 'riding';
        coaster.riders.push(guest);
        money += TRACK_RIDE_PRICE;
        addFloater(coaster.segments[0].tile, `+£${TRACK_RIDE_PRICE}`, '#4ade80');
      }
      coaster.loadTimer -= dt;
      if (coaster.loadTimer <= 0) {
        if (coaster.riders.length > 0) {
          coaster.cartState = 'running';
          coaster.cartSpeed = CART_MIN_SPEED;
        } else {
          coaster.loadTimer = LOAD_WAIT; // keep waiting rather than dispatch an empty cart
        }
      }
      return;
    }
    // Mayhem: a running cart can jam mid-track and hang there a few seconds.
    if (coaster.stallLeft > 0) {
      coaster.stallLeft -= dt;
      return;
    }
    if (coaster.riders.length > 0 && Math.random() < coasterStallChance(day) * dt) {
      coaster.stallLeft = STALL_SECONDS;
      const segTile = coaster.segments[Math.floor(coaster.cartU) % coaster.segments.length].tile;
      addFloater(segTile, '🔧', '#fbbf24');
      showToast(`🔧 ${strings.coasterStall}`);
      return;
    }
    const segIndex = Math.floor(coaster.cartU) % coaster.segments.length;
    coaster.cartSpeed = nextCartSpeed(coaster.cartSpeed, coaster.segments[segIndex].kind, dt);
    const prevU = coaster.cartU;
    coaster.cartU = advanceU(coaster.cartU, coaster.cartSpeed, dt, coaster.segments.length);
    if (coaster.cartU < prevU) {
      // Wrapped past 0 = back at the station: disembark, pay out thrill, reload.
      for (const guest of coaster.riders) {
        satisfyNeed(guest.needs, 'thrill', coaster.thrillBoost);
        guest.state = 'idle';
        guest.idleTimer = 0.2;
        guest.targetBuilding = null;
      }
      coaster.riders = [];
      coaster.cartU = 0;
      coaster.cartSpeed = CART_MIN_SPEED;
      coaster.cartState = 'loading';
      coaster.loadTimer = LOAD_WAIT;
    }
  }

  function updateTrackStatus() {
    if (!trackPalette) return;
    // The palette stays up while a draft exists — even with another tool
    // selected — so Test/Cancel remain reachable and it's clear the
    // in-progress loop hasn't been thrown away. The piece selector dims
    // then, since canvas taps run the selected tool, not track laying.
    trackPalette.style.display = selectedTool === 'track' || trackDraft !== null ? 'flex' : 'none';
    if (trackKindsEl) {
      const laying = selectedTool === 'track';
      trackKindsEl.style.opacity = laying ? '' : '0.45';
      trackKindsEl.style.pointerEvents = laying ? '' : 'none';
      // pointer-events doesn't stop keyboard activation (Tab + Enter).
      trackKindButtons.forEach(btn => (btn.disabled = !laying));
    }
    if (trackDraft === null) {
      trackStatusEl.textContent = strings.trackStatusEmpty;
    } else if (trackClosed) {
      trackStatusEl.textContent = strings.trackStatusClosed.replace('{cost}', String(draftCost()));
    } else {
      trackStatusEl.textContent = strings.trackStatusDrafting.replace('{n}', String(trackDraft.length));
    }
    trackTestBtn.disabled = !trackClosed;
  }

  /**
   * Whether applying `tool` to tile `i` would overwrite a drafted track
   * tile. Terraforming under a draft is the point of keeping it alive
   * across tool switches (shaping hills for climbs), so only tools that
   * write the tile itself conflict — raise/lower touch heights only, and
   * bulldoze/digTunnel can never pass canPlace on the draft's grass tiles.
   */
  function toolHitsDraft(i: number, tool: Tool): boolean {
    if (!trackDraft || !trackDraft.some(s => s.tile === i)) return false;
    return tool !== 'raiseLand' && tool !== 'lowerLand' && tool !== 'digTunnel' && tool !== 'bulldoze';
  }

  /** The draft's own tiles, which no terraform cascade may move — their heights are the loop's profile. */
  function draftLockedTiles(): Set<number> | undefined {
    return trackDraft ? new Set(trackDraft.map(s => s.tile)) : undefined;
  }

  /** What applying a terraform plan charges: one raise/lower fee per height step moved, cascade-wide. */
  function terraformCharge(plan: Map<number, number>): number {
    return terraformSteps(plan, heights) * toolCost('raiseLand');
  }

  /**
   * The cascade a raise/lower tap on tile `i` would run, or null when it
   * can't (out of range, unterraformable, or it would have to move a
   * drafted track tile — the draft's heights are anchored). Shared by the
   * hover highlight and the click handler so they can never disagree.
   */
  function manualTerraformPlan(tool: Tool, i: number): Map<number, number> | null {
    const target = heights[i] + (tool === 'raiseLand' ? 1 : -1);
    return terraformPlan(tiles, heights, i, target, draftLockedTiles());
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

  /** Whether tapping tile `i` right now would be accepted by handleTrackTap — drives the hover highlight. */
  function trackTapValid(i: number): boolean {
    return planTrackTap(i).action !== 'reject';
  }

  /** What Test Track will charge: per-piece track cost. Terrain shaping was already paid tap by tap. */
  function draftCost(): number {
    return trackDraft ? trackDraft.length * toolCost('track') : 0;
  }

  type TrackTap =
    | { action: 'reject'; message: string | null }
    | { action: 'start' }
    | { action: 'undo' }
    | { action: 'extend'; exitKind: SegmentKind; plan: Map<number, number> | null }
    | { action: 'close'; exitKind: SegmentKind; startKind: SegmentKind; stationAt: number };

  /**
   * Decides what tapping tile `i` would do to the draft, without mutating
   * anything — handleTrackTap executes the result, and the hover highlight
   * asks it whether the tap would land. Corners are derived from the tap
   * direction rather than picked from a palette, and the selected
   * Climb/Drop piece pushes the terrain under the new tile to fit (the
   * `plan` on an extend). The closing piece is derived from the height gap
   * back to the start tile, whose height anchors the loop.
   */
  function planTrackTap(i: number): TrackTap {
    if (trackClosed) return { action: 'reject', message: null }; // Test Track or Cancel first
    if (trackDraft === null) {
      if (tiles[i] !== 'grass') return { action: 'reject', message: strings.trackBlocked };
      return { action: 'start' };
    }
    const head = trackDraft[trackDraft.length - 1];
    if (i === head.tile) return { action: 'undo' };
    const dir = dirBetween(head.tile, i);
    if (dir === null) return { action: 'reject', message: strings.trackNotAdjacent };
    const closing = i === trackDraft[0].tile;
    if (closing && trackDraft.length < MIN_TRACK_LENGTH) {
      return { action: 'reject', message: strings.trackTooShort };
    }
    if (!closing) {
      if (trackDraft.some(s => s.tile === i)) {
        return { action: 'reject', message: strings.trackDuplicateTile };
      }
      if (tiles[i] !== 'grass') return { action: 'reject', message: strings.trackBlocked };
    }

    // The head's exit piece: a derived corner if the tap changes direction,
    // else the selected Climb/Drop, else level. A station keeps its kind —
    // it's a level, straight piece by definition, so it can't corner.
    const entryDir =
      trackDraft.length >= 2 ? dirBetween(trackDraft[trackDraft.length - 2].tile, head.tile) : null;
    const turn = entryDir !== null ? turnKind(entryDir, dir) : null;
    const closeDh = heights[i] - heights[head.tile];
    let exitKind: SegmentKind;
    if (turn) {
      if (head.kind === 'station') return { action: 'reject', message: strings.trackStationStraight };
      exitKind = turn;
    } else if (head.kind === 'station') {
      exitKind = 'station';
    } else if (closing) {
      exitKind = closeDh > 0 ? 'up' : closeDh < 0 ? 'down' : 'flat';
    } else {
      exitKind = trackKind === 'up' || trackKind === 'down' ? trackKind : 'flat';
    }

    const climbs = (k: SegmentKind) => segmentClimb(k) !== 0;
    const prevKind = trackDraft.length >= 2 ? trackDraft[trackDraft.length - 2].kind : null;
    if (climbs(exitKind) && prevKind !== null && climbs(prevKind)) {
      return { action: 'reject', message: strings.trackTooSteep };
    }

    if (closing) {
      // The closing piece must bridge the height gap back to the start
      // exactly — corners and stations can't climb, and a straight can
      // only bridge one step.
      if (closeDh !== segmentClimb(exitKind)) {
        return { action: 'reject', message: strings.trackHeightMismatch };
      }
      let startKind = trackDraft[0].kind;
      const startTurn = turnKind(dir, dirBetween(trackDraft[0].tile, trackDraft[1].tile)!);
      if (startTurn) {
        if (climbs(startKind)) return { action: 'reject', message: strings.trackTooSteep };
        // A station displaced by the corner is re-homed below.
        startKind = startTurn;
      }
      if (climbs(exitKind) && climbs(startKind)) {
        return { action: 'reject', message: strings.trackTooSteep };
      }
      // Exactly one station: if the loop has none — never selected, or the
      // start corner just displaced it — it lands on the first level
      // straight, so the obvious draft (loop first, details never) works.
      const kinds = trackDraft.map((s, k) =>
        k === 0 ? startKind : k === trackDraft!.length - 1 ? exitKind : s.kind
      );
      let stationAt = kinds.indexOf('station');
      if (stationAt === -1) stationAt = kinds.indexOf('flat');
      if (stationAt === -1) return { action: 'reject', message: strings.trackNeedsStation };
      return { action: 'close', exitKind, startKind, stationAt };
    }

    // Climb/Drop pieces push the terrain under the new tile to fit, exactly
    // like the terraform tools (cascading to neighbours); the draft's own
    // tiles are anchored — their heights are already part of the profile.
    const targetH = heights[head.tile] + segmentClimb(exitKind);
    let plan: Map<number, number> | null = null;
    if (heights[i] !== targetH) {
      plan = terraformPlan(tiles, heights, i, targetH, draftLockedTiles());
      if (!plan) {
        // Only on failure: re-plan without the draft lock to tell "the
        // cascade would move the draft itself" apart from "the land can't
        // be shaped that way at all".
        const blockedByDraft = terraformPlan(tiles, heights, i, targetH) !== null;
        return {
          action: 'reject',
          message: blockedByDraft ? strings.trackDraftInWay : strings.tooSteep
        };
      }
    }
    return { action: 'extend', exitKind, plan };
  }

  /**
   * Tap-to-extend track drafting: tapping the current head's own tile again
   * undoes the last piece; tapping an orthogonal neighbour extends the
   * draft; tapping back at the start tile closes the loop (once it's long
   * enough) without adding a new segment. Terrain pushed by a climb/drop
   * piece is charged on the spot (same rate as the terraform tools) and
   * stays shaped through undo/cancel — re-laying a piece over land already
   * at the right height costs nothing extra. All the decision logic lives
   * in planTrackTap. See the "Build interaction" section of
   * docs/plans/2026-07-09-park-overhaul-design.md.
   */
  function handleTrackTap(i: number) {
    // The Close Loop button routes here directly, bypassing the canvas
    // click handler's own phase guard.
    if (phase !== 'play') return;
    const tap = planTrackTap(i);
    switch (tap.action) {
      case 'reject':
        if (tap.message) showToast(tap.message);
        return;
      case 'start':
        trackDraft = [{ tile: i, dir: 0, kind: trackKind === 'station' ? 'station' : 'flat' }];
        draftSteps = [];
        break;
      case 'undo': {
        const step = draftSteps.pop();
        trackDraft!.pop();
        if (step) trackDraft![trackDraft!.length - 1].kind = step.headKind;
        if (trackDraft!.length === 0) trackDraft = null;
        bumpWorldVersion();
        updateTrackStatus();
        return;
      }
      case 'extend': {
        const shapingCost = tap.plan ? terraformCharge(tap.plan) : 0;
        if (shapingCost > money) {
          showToast(strings.cantAfford);
          return;
        }
        if (tap.plan) {
          money -= shapingCost;
          applyTerraformPlan(heights, tunnels, tap.plan);
        }
        const head = trackDraft![trackDraft!.length - 1];
        draftSteps.push({ headKind: head.kind });
        head.dir = dirBetween(head.tile, i)!;
        head.kind = tap.exitKind;
        // Only one station per loop — once placed, further taps with the
        // station piece selected just lay plain track.
        const hasStation = trackDraft!.some(s => s.kind === 'station');
        trackDraft!.push({
          tile: i,
          dir: 0,
          kind: trackKind === 'station' && !hasStation ? 'station' : 'flat'
        });
        break;
      }
      case 'close': {
        const head = trackDraft![trackDraft!.length - 1];
        head.dir = dirBetween(head.tile, i)!;
        head.kind = tap.exitKind;
        trackDraft![0].kind = tap.startKind;
        trackDraft![tap.stationAt].kind = 'station';
        trackClosed = true;
        break;
      }
    }
    bumpWorldVersion();
    audio.playSfx('blip');
    updateTrackStatus();
  }

  /**
   * Drops the draft. Terrain shaped while drafting stays — it was paid for
   * tap by tap, exactly as if the raise/lower tools had been used by hand.
   */
  function cancelTrackDraft() {
    draftSteps = [];
    trackDraft = null;
    trackClosed = false;
    bumpWorldVersion();
    updateTrackStatus();
  }

  function testTrack() {
    // The palette outlives the run (a draft keeps it visible), so without
    // this guard Test Track could build a coaster into a finished game.
    if (phase !== 'play') return;
    if (!trackDraft) {
      showToast(strings.trackEmpty);
      return;
    }
    if (!trackClosed) {
      showToast(strings.trackNotClosedYet);
      return;
    }
    const result = validateTrack(trackDraft, heights);
    if (!result.ok) {
      showToast(TRACK_ERROR_MESSAGES[result.error]);
      return;
    }
    if (!canPlaceTrack(tiles, trackDraft)) {
      showToast(strings.trackBlocked);
      return;
    }
    // Track pieces only — terrain shaping was already charged tap by tap.
    const cost = draftCost();
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    const rotated = rotateToStation(trackDraft);
    for (const seg of rotated) tiles[seg.tile] = 'track';
    coasters.push(createCoaster(rotated));
    cancelTrackDraft();
    invalidateGuests();
    audio.playSfx('blip');
  }

  // --- Simulation ---

  function update(dt: number) {
    rotator.update(dt);
    clock += dt;
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 16 * dt;
      return f.life > 0;
    });
    balloons = balloons.filter(b => {
      b.life -= dt;
      b.y -= 22 * dt;
      b.x += Math.sin(clock * 2.2 + b.sway) * 9 * dt;
      return b.life > 0 && b.y > 10;
    });
    if (phase !== 'play' || speedMult === 0) return;
    const simDt = dt * speedMult;

    guests = guests.filter(guest => updateGuest(guest, simDt));
    for (const coaster of coasters) updateCoaster(coaster, simDt);

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
    if (peakGuests > record) {
      record = peakGuests;
      recordEl.textContent = record.toString();
      // Persist immediately so a mid-run tab close keeps the record.
      board.stash(peakGuests);
    }
    // Beating an established best is worth a fanfare — once per run.
    if (!recordCelebrated && runStartRecord > 0 && peakGuests > runStartRecord) {
      recordCelebrated = true;
      showToast(`🏅 ${strings.newRecord}`);
      audio.playSfx('score');
    }

    const avg = guests.length
      ? guests.reduce((sum, g) => sum + happiness(g.needs), 0) / guests.length
      : null;
    rating = parkRating(avg, treeCount());

    spawnTimer -= simDt;
    if (spawnTimer <= 0) {
      spawnTimer = surgedInterval(spawnInterval(rating), surge);
      if (guests.length < maxGuests(day) && hasAnyBuilding()) spawnGuest();
    }

    dayTimer += simDt;
    if (dayTimer >= DAY_LENGTH) {
      dayTimer -= DAY_LENGTH;
      day++;
      const upkeep = dailyUpkeep(tiles);
      money -= upkeep;
      showToast(`${strings.day} ${day} · ${strings.upkeep} -£${upkeep}`);
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
    finalPeakEl.textContent = peakGuests.toString();
    overOverlay.style.display = 'flex';
    board.show(peakGuests);
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
    money = START_MONEY;
    day = 1;
    dayTimer = 0;
    guests = [];
    spawnTimer = 3;
    peakGuests = 0;
    rating = parkRating(null, 0);
    speedMult = 1;
    floaters = [];
    balloons = [];
    coasters = [];
    breakdowns = [];
    surge = null;
    runStartRecord = record;
    recordCelebrated = false;
    cancelTrackDraft();
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
   * Pixel lift at each of a tile's four iso corners for an 'up'/'down' rail
   * segment travelling in `dir`: the two corners on the exit edge (the side
   * bordering the next tile) sit at `nextLift`, the two on the opposite
   * edge sit at `curLift` — a single-axis tilt along the direction of
   * travel, not a partial average (which would twist the quad instead of
   * sloping it). Corner layout matches iso.ts's `drawBlock`/`drawRamp`:
   * n=(x,y), e=(x+1,y), s=(x+1,y+1), w=(x,y+1), so the N–E edge borders the
   * north neighbour, S–W borders south, N–W borders west, E–S borders east.
   */
  function rampCorners(
    dir: Dir,
    curLift: number,
    nextLift: number
  ): { n: number; e: number; s: number; w: number } {
    if (dir === 0) return { n: nextLift, e: nextLift, s: curLift, w: curLift };
    if (dir === 2) return { n: curLift, e: curLift, s: nextLift, w: nextLift };
    if (dir === 1) return { n: curLift, w: curLift, e: nextLift, s: nextLift };
    return { n: nextLift, w: nextLift, e: curLift, s: curLift }; // dir === 3
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
    // Canopy: elliptical rim underside, cone on top, stripes, finial.
    ctx.fillStyle = shadeColor(color, 0.85);
    ctx.beginPath();
    ctx.ellipse(c.x, rimY, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 1.25);
    ctx.beginPath();
    ctx.moveTo(c.x - 13, rimY);
    ctx.lineTo(c.x, rimY - 9);
    ctx.lineTo(c.x + 13, rimY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, 0.7);
    ctx.lineWidth = 1;
    for (const t of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(c.x, rimY - 9);
      ctx.lineTo(c.x + 13 * t, rimY);
      ctx.stroke();
    }
    ctx.fillStyle = shadeColor(color, 1.4);
    ctx.beginPath();
    ctx.arc(c.x, rimY - 10, 1.5, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.strokeStyle = shadeColor(color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - 8, baseY);
    ctx.lineTo(c.x, hubY);
    ctx.lineTo(c.x + 8, baseY);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(color, 0.9);
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = angle + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(c.x, hubY);
      ctx.lineTo(c.x + Math.cos(a) * radius, hubY + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.strokeStyle = shadeColor(color, 1.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, hubY, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = angle + (k * Math.PI) / 3;
      ctx.fillStyle = GUEST_COLORS[k % GUEST_COLORS.length];
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(a) * radius, hubY + Math.sin(a) * radius + 2.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shadeColor(color, 1.5);
    ctx.beginPath();
    ctx.arc(c.x, hubY, 2, 0, Math.PI * 2);
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
    // The circuit: stone rim, shimmering water ring, island in the middle.
    ctx.fillStyle = shadeColor(color, 0.55);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 14, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor('#2f8fc4', 0.9 + 0.2 * Math.sin(clock * 2.1 + vx + vy));
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor(color, 1.15);
    ctx.beginPath();
    ctx.ellipse(c.x, topY, 6.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // The log rides the ring between island and rim.
    const angle = broken ? 1.2 : clock * (busy ? 2.6 : 0.9);
    const lx = c.x + Math.cos(angle) * 9.2;
    const ly = topY + Math.sin(angle) * 3.7;
    if (vehicle) {
      ctx.font = '10px serif';
      ctx.fillText(vehicle, lx, ly - 3);
    } else {
      ctx.fillStyle = '#7a4a22';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 1.5, 4.2, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a9743d';
      ctx.beginPath();
      ctx.ellipse(lx, ly - 2.2, 3, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
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
    const e = isoProject(VIEW, vx + 1 - inset, vy + inset);
    const s = isoProject(VIEW, vx + 1 - inset, vy + 1 - inset);
    const w = isoProject(VIEW, vx + inset, vy + 1 - inset);
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
    drawCounterFace(ctx, w, s, liftPx, counterCol);
    drawCounterFace(ctx, s, e, liftPx, counterCol);
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
    const travel = towerH - 14;
    const deckLift = busy && !broken ? 6 + (Math.sin(clock * 1.1) * 0.5 + 0.5) * travel : 6;
    const y = c.y - liftPx - deckLift;
    ctx.save();
    if (broken) ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.beginPath();
    ctx.ellipse(c.x, y, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /** The cart's current position, interpolated along its current rail segment. */
  function drawCoaster(coaster: Coaster) {
    const n = coaster.segments.length;
    const segIndex = Math.floor(coaster.cartU) % n;
    const frac = coaster.cartU - Math.floor(coaster.cartU);
    const curSeg = coaster.segments[segIndex];
    const nextSeg = coaster.segments[(segIndex + 1) % n];
    const from = tileCenter(curSeg.tile);
    const to = tileCenter(nextSeg.tile);
    const curH = heights[curSeg.tile];
    const nextH = heights[nextSeg.tile];
    const p = projectWorld(from.x + (to.x - from.x) * frac, from.y + (to.y - from.y) * frac);
    p.y -= (curH + (nextH - curH) * frac) * TERRAIN_STEP + 10;
    ctx.font = '15px serif';
    ctx.fillText('🚃', p.x, p.y);
    if (coaster.riders.length > 0) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`×${coaster.riders.length}`, p.x, p.y - 13);
    }
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
    // them correctly under any rotation. Riders aren't drawn individually —
    // the cart (drawCoaster) stands in for them.
    const guestsByDiag: Guest[][] = Array.from({ length: GRID_W + GRID_H - 1 }, () => []);
    for (const guest of guests) {
      if (guest.state === 'riding') continue;
      const pos = guestPos(guest);
      const vp = rotatePoint(pos.x, pos.y, GRID_W, GRID_H, rotation);
      const d = Math.min(GRID_W + GRID_H - 2, Math.max(0, Math.floor(vp.tx) + Math.floor(vp.ty)));
      guestsByDiag[d].push(guest);
    }

    // One pass over the whole grid instead of a per-tile zoneAt lookup —
    // zoneAt rescans every tile for gates, which turns O(tiles) rendering
    // into O(tiles²) if called once per tile inside the loop below.
    const tileZones = zonesForTiles(tiles);

    // Committed coaster segments plus the in-progress draft (rendered as a
    // translucent preview) so a player sees exactly what they're laying.
    // The draft's tail segment has a placeholder `dir` (see handleTrackTap)
    // until the next tap fixes it, so its ramp orientation isn't known yet
    // — `pending` flags it so the renderer falls back to a flat marker
    // instead of guessing a slope direction.
    const trackByTile = new Map<number, { seg: Segment; draft: boolean; pending: boolean }>();
    for (const coaster of coasters) {
      for (const seg of coaster.segments) trackByTile.set(seg.tile, { seg, draft: false, pending: false });
    }
    if (trackDraft) {
      trackDraft.forEach((seg, idx) => {
        // Once the loop is closed the tail's dir was fixed by the closing
        // tap (see handleTrackTap), so nothing is pending any more.
        const pending = !trackClosed && idx === trackDraft!.length - 1;
        trackByTile.set(seg.tile, { seg, draft: true, pending });
      });
    }

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
        const groundColor =
          tile === 'track'
            ? '#3a3a42'
            : tile === 'path' || tile === 'entrance'
              ? '#8a7a5c'
              : zone
                ? shadeColor(ZONES[zone].groundColor, (x + y) % 2 === 0 ? 1 : 0.88)
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
        ctx.font = '17px serif';
        ctx.fillText(GATE_EMOJI[tile]!, top.x, top.y - 7);
      } else if (BUILDINGS[tile]) {
        const style = BUILDING_STYLE[tile] ?? { color: '#44447a', height: BLOCK_HEIGHT };
        const reskin = zone ? ZONE_BUILDING_STYLE[zone][tile] : undefined;
        const broken = isBroken(i);
        const color = reskin?.color ?? style.color;
        const busy = inUse.has(i);
        if (tile === 'carousel') {
          drawCarousel(vx, vy, liftPx, color, reskin?.emoji ?? TILE_EMOJI.carousel!, busy, broken);
        } else if (tile === 'ferris') {
          drawFerris(vx, vy, liftPx, color, busy, broken);
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

      const trackInfo = trackByTile.get(i);
      if (trackInfo) {
        const { seg, draft, pending } = trackInfo;
        // A pending tail segment's dir is still a placeholder (see
        // handleTrackTap), so its slope direction isn't known yet — render
        // it flat rather than guess a ramp orientation from a bogus dir.
        const isRamp = (seg.kind === 'up' || seg.kind === 'down') && !pending;
        const nextTile = isRamp ? stepTile(seg.tile, seg.dir) : null;
        const nextLift = nextTile !== null ? heights[nextTile] * TERRAIN_STEP : liftPx;
        ctx.save();
        if (draft) ctx.globalAlpha = 0.55;
        if (isRamp) {
          drawRamp(ctx, VIEW, vx, vy, rampCorners(rotateDir(seg.dir, rotation) as Dir, liftPx, nextLift), '#8a8a95');
        } else {
          fillTile(ctx, VIEW, vx, vy, '#8a8a95', liftPx);
        }
        const emojiLift = isRamp ? (liftPx + nextLift) / 2 : liftPx;
        const railTop = isoProject(VIEW, vx + 0.5, vy + 0.5);
        railTop.y -= emojiLift + 6;
        ctx.font = '12px serif';
        ctx.fillText(TRACK_KIND_EMOJI[seg.kind], railTop.x, railTop.y);
        ctx.restore();
      }
    });
    if (lastDiag >= 0) guestsByDiag[lastDiag].forEach(drawGuest);
    coasters.forEach(drawCoaster);

    if (hoverTile >= 0 && phase === 'play') {
      const x = hoverTile % GRID_W;
      const y = Math.floor(hoverTile / GRID_W);
      const v = rotateTile(x, y, GRID_W, GRID_H, rotation);
      const lockedZone = gateZone(selectedTool);
      // Placement legality can run a terraform-cascade BFS (placementCost /
      // planTrackTap), so it's memoized per (tool, piece, tile, world
      // version) instead of recomputed every frame; only the cheap money
      // and zone-unlock comparisons stay per-frame.
      const cacheKey = `${selectedTool}:${trackKind}:${hoverTile}:${worldVersion}`;
      if (cacheKey !== hoverCacheKey) {
        hoverCacheKey = cacheKey;
        if (selectedTool === 'track') {
          hoverCachePlaceable = trackTapValid(hoverTile);
          hoverCacheCost = 0;
        } else {
          hoverCachePlaceable =
            canPlace(tiles, heights, tunnels, x, y, selectedTool) &&
            !toolHitsDraft(hoverTile, selectedTool);
          hoverCacheCost = placementCost(selectedTool, hoverTile);
        }
      }
      const valid =
        hoverCachePlaceable &&
        hoverCacheCost <= money &&
        (!lockedZone || zoneUnlocked(lockedZone, rating, money));
      strokeTile(
        ctx,
        VIEW,
        v.x,
        v.y,
        valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)',
        2,
        heights[hoverTile] * TERRAIN_STEP
      );
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
    // Track drafting is already a tap-by-tap flow with its own undo/close
    // semantics (see handleTrackTap), so it bypasses the arm-then-confirm
    // touch pattern below rather than requiring a double tap per piece.
    if (selectedTool === 'track') {
      handleTrackTap(i);
      return;
    }
    if (coarsePointer && armedTile !== i) {
      armedTile = i;
      hoverTile = i;
      return;
    }
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);

    if (selectedTool === 'bulldoze' && tiles[i] === 'track') {
      const coaster = coasters.find(c => c.segments.some(s => s.tile === i));
      if (coaster) {
        removeCoaster(coaster);
      } else {
        // No owning coaster (shouldn't happen in normal play) — still clear
        // the tile so it can never become permanently un-bulldozable.
        tiles[i] = 'grass';
      }
      bumpWorldVersion();
      audio.playSfx('blip');
      invalidateGuests();
      return;
    }
    if (toolHitsDraft(i, selectedTool)) {
      showToast(strings.trackDraftInWay);
      return;
    }
    // Terraforming takes its own path: the cascade must also respect an
    // in-progress draft's anchored tiles, which grid.ts's generic
    // canPlace/applyTool know nothing about.
    if (selectedTool === 'raiseLand' || selectedTool === 'lowerLand') {
      const plan = manualTerraformPlan(selectedTool, i);
      if (!plan) {
        const terraformable = tiles[i] === 'grass' || tiles[i] === 'path';
        const next = heights[i] + (selectedTool === 'raiseLand' ? 1 : -1);
        if (terraformable && next >= MIN_HEIGHT && next <= MAX_HEIGHT) {
          // In range on shapeable ground, so the cascade itself was blocked:
          // by the draft's anchored tiles if one accepts the unlocked plan,
          // otherwise by something immovable (water, a building, track).
          const blockedByDraft =
            trackDraft !== null && terraformPlan(tiles, heights, i, next) !== null;
          showToast(blockedByDraft ? strings.trackDraftInWay : strings.tooSteep);
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
      // Switching tools deliberately keeps any in-progress track draft: the
      // loop stays rendered (translucently) and drafting resumes when the
      // track tool is re-selected — players terraform mid-draft to shape
      // hills under their climbs. Only the Cancel button discards it.
      selectedTool = btn.dataset.tool as Tool;
      armedTile = -1;
      toolButtons.forEach(b => b.classList.toggle('active', b === btn));
      updateTrackStatus();
    });
  });

  trackKindButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      trackKind = btn.dataset.kind as SegmentKind;
      trackKindButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  trackCloseBtn?.addEventListener('click', () => {
    // Replays a tap on the start tile — the same "close the loop" gesture
    // as tapping it directly on the canvas (see handleTrackTap).
    if (trackDraft) handleTrackTap(trackDraft[0].tile);
  });
  trackTestBtn?.addEventListener('click', testTrack);
  trackCancelBtn?.addEventListener('click', cancelTrackDraft);

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
    floaters = [];
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
