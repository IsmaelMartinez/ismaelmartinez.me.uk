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
  drawRamp,
  shadeColor,
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
  tunnelIn: '🕳️',
  tunnelOut: '🕳️',
  station: '🚉'
};

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
 */
const ZONE_BUILDING_STYLE: Record<ZoneId, Partial<Record<TileType, { emoji: string; color: string }>>> = {
  fairytale: {
    carousel: { emoji: '🎠', color: '#d68fc2' },
    ferris: { emoji: '🎡', color: '#b28fe0' },
    food: { emoji: '🍰', color: '#e8a0bc' },
    drink: { emoji: '🧃', color: '#f0b6d2' },
    toilet: { emoji: '🚻', color: '#a888d0' },
    flume: { emoji: '🦢', color: '#8fc4dc' },
    skytower: { emoji: '🏰', color: '#b89fdc' }
  },
  adventure: {
    carousel: { emoji: '🐒', color: '#6b8f3f' },
    ferris: { emoji: '🎡', color: '#4f7a2f' },
    food: { emoji: '🍌', color: '#a67c2a' },
    drink: { emoji: '🥥', color: '#5a8a3a' },
    toilet: { emoji: '🛖', color: '#7a5a2f' },
    flume: { emoji: '🐊', color: '#2f7a4f' },
    skytower: { emoji: '🗿', color: '#5a6a4a' }
  },
  pirate: {
    carousel: { emoji: '🎯', color: '#7a3a2a' },
    ferris: { emoji: '🛞', color: '#6a4a2a' },
    food: { emoji: '🍖', color: '#6a5a3a' },
    drink: { emoji: '🍺', color: '#5a4a2a' },
    toilet: { emoji: '⚓', color: '#3a5a6a' },
    flume: { emoji: '🐙', color: '#2a5a6a' },
    skytower: { emoji: '🏴‍☠️', color: '#4a3a5a' }
  }
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
  fun: '🎠',
  hunger: '🍔',
  thirst: '🥤',
  bladder: '🚻',
  thrill: '🎢'
};

const GUEST_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb923c'];

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
  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tool-btn'));
  const speedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.speed-btn'));
  const trackPalette = el('track-palette');
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
    trackTooSteep: root.dataset.tTrackTooSteep || 'Two climbs/drops in a row — add a flat between them!',
    trackStatusEmpty: root.dataset.tTrackStatusEmpty || 'Tap a grass tile to start laying track',
    trackStatusDrafting:
      root.dataset.tTrackStatusDrafting || 'Track length: {n} — tap the start tile to close the loop',
    trackStatusClosed: root.dataset.tTrackStatusClosed || 'Loop closed — Test Track to open it',
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
    tooSteep: strings.trackTooSteep
  };

  // Render at device-pixel resolution: the canvas is CSS-scaled to fill its
  // container, so a 1:1 backing store comes out blurry — especially the
  // emoji sprites — on hi-DPI screens. All drawing stays in logical
  // CANVAS_W×CANVAS_H coordinates via the transform. A floor of 2 keeps
  // standard-DPI screens crisp too, since CSS can stretch the board wider
  // than its logical size.
  const DPR = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;
  canvas.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

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
  const reduceMotion =
    typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const ROTATE_ANIM_DURATION = 0.32; // seconds
  let rotAnim: { t: number; dir: 1 | -1; swapped: boolean } | null = null;
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
  let balloons: { x: number; y: number; sway: number; color: string; life: number }[] = [];
  let coasters: Coaster[] = [];
  let breakdowns: RideBreakdown[] = [];
  let surge: Surge | null = null;
  // The table best when this run started, so beating it is announced once.
  let runStartRecord = 0;
  let recordCelebrated = false;
  // A drafted segment's `dir` is a placeholder until the *next* tap fixes it
  // (see handleTrackTap) — trackClosed flips true once the closing tap sets
  // the last segment's dir back to the start tile.
  let trackDraft: Segment[] | null = null;
  let trackClosed = false;
  let trackKind: SegmentKind = 'station';
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

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.removeChild(toastArea.firstChild!);
    setTimeout(() => toast.remove(), 2200);
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
    // in-progress loop hasn't been thrown away.
    trackPalette.style.display = selectedTool === 'track' || trackDraft ? 'flex' : 'none';
    if (!trackDraft) {
      trackStatusEl.textContent = strings.trackStatusEmpty;
    } else if (trackClosed) {
      trackStatusEl.textContent = strings.trackStatusClosed;
    } else {
      trackStatusEl.textContent = strings.trackStatusDrafting.replace('{n}', String(trackDraft.length));
    }
    trackTestBtn.disabled = !trackClosed;
  }

  /** Whether tapping tile `i` right now would be accepted by handleTrackTap — drives the hover highlight. */
  function trackTapValid(i: number): boolean {
    if (trackClosed) return false;
    if (trackDraft === null) return tiles[i] === 'grass';
    const head = trackDraft[trackDraft.length - 1];
    if (i === head.tile) return true; // undo
    const dir = dirBetween(head.tile, i);
    if (dir === null) return false;
    if (i === trackDraft[0].tile) return trackDraft.length >= MIN_TRACK_LENGTH;
    return !trackDraft.some(s => s.tile === i) && tiles[i] === 'grass';
  }

  /**
   * Tap-to-extend track drafting: tapping the current head's own tile again
   * undoes the last piece; tapping an orthogonal neighbour extends the
   * draft with the selected sub-palette kind; tapping back at the start
   * tile closes the loop (once it's long enough) without adding a new
   * segment. See the "Build interaction" section of
   * docs/plans/2026-07-09-park-overhaul-design.md.
   */
  function handleTrackTap(i: number) {
    if (trackClosed) return; // Test Track or Cancel first
    if (trackDraft === null) {
      if (tiles[i] !== 'grass') {
        showToast(strings.trackBlocked);
        return;
      }
      trackDraft = [{ tile: i, dir: 0, kind: trackKind }];
      audio.playSfx('blip');
      updateTrackStatus();
      return;
    }
    const head = trackDraft[trackDraft.length - 1];
    if (i === head.tile) {
      trackDraft.pop();
      if (trackDraft.length === 0) trackDraft = null;
      updateTrackStatus();
      return;
    }
    const dir = dirBetween(head.tile, i);
    if (dir === null) {
      showToast(strings.trackNotAdjacent);
      return;
    }
    if (i === trackDraft[0].tile) {
      if (trackDraft.length < MIN_TRACK_LENGTH) {
        showToast(strings.trackTooShort);
        return;
      }
      head.dir = dir;
      trackClosed = true;
      audio.playSfx('blip');
      updateTrackStatus();
      return;
    }
    if (trackDraft.some(s => s.tile === i)) {
      showToast(strings.trackDuplicateTile);
      return;
    }
    if (tiles[i] !== 'grass') {
      showToast(strings.trackBlocked);
      return;
    }
    head.dir = dir;
    trackDraft.push({ tile: i, dir: 0, kind: trackKind });
    audio.playSfx('blip');
    updateTrackStatus();
  }

  function cancelTrackDraft() {
    trackDraft = null;
    trackClosed = false;
    updateTrackStatus();
  }

  function testTrack() {
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
    const cost = trackDraft.length * toolCost('track');
    if (cost > money) {
      showToast(strings.cantAfford);
      return;
    }
    money -= cost;
    const rotated = rotateToStation(trackDraft);
    for (const seg of rotated) tiles[seg.tile] = 'track';
    coasters.push(createCoaster(rotated));
    trackDraft = null;
    trackClosed = false;
    updateTrackStatus();
    invalidateGuests();
    audio.playSfx('blip');
  }

  // --- Simulation ---

  function update(dt: number) {
    if (rotAnim) {
      rotAnim.t += dt;
      const t = Math.min(1, rotAnim.t / ROTATE_ANIM_DURATION);
      // First half spins the current view edge-on; at the midpoint (an
      // imperceptible sliver) the underlying rotation swaps and the second
      // half spins the new view back in from the opposite edge.
      if (t >= 0.5 && !rotAnim.swapped) {
        rotAnim.swapped = true;
        setRotation(((rotation + (rotAnim.dir === 1 ? 1 : 3)) % 4) as Rotation);
      }
      const half = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
      const angle = t < 0.5 ? rotAnim.dir * 90 * half : rotAnim.dir * -90 * (1 - half);
      canvas.style.transform = `rotateY(${angle}deg)`;
      if (t >= 1) {
        canvas.style.transform = '';
        rotAnim = null;
      }
    }

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
        drawBlock(ctx, VIEW, vx, vy, style.height, reskin?.color ?? style.color, 0.08, liftPx);
        const spin = RIDE_SPIN[tile];
        const busy = inUse.has(i);
        ctx.save();
        ctx.translate(top.x, top.y - style.height - (busy ? 2 : 0));
        // A broken ride's emoji hangs still and dimmed; the wrench bobs above.
        if (broken) ctx.globalAlpha = 0.45;
        if (spin && !broken) ctx.rotate((clock * (busy ? spin.busy : spin.idle)) % (Math.PI * 2));
        ctx.font = `${tile === 'ferris' || tile === 'skytower' ? 16 : 14}px serif`;
        ctx.fillText(reskin?.emoji ?? TILE_EMOJI[tile] ?? '', 0, 0);
        ctx.restore();
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
          // seg.dir is a world direction; a quarter-turn of the view turns
          // it by the same amount on screen.
          const viewDir = ((seg.dir + rotation) % 4) as Dir;
          drawRamp(ctx, VIEW, vx, vy, rampCorners(viewDir, liftPx, nextLift), '#8a8a95');
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
      const valid =
        selectedTool === 'track'
          ? trackTapValid(hoverTile)
          : canPlace(tiles, heights, tunnels, x, y, selectedTool) &&
            toolCost(selectedTool, tiles, hoverTile) <= money &&
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
        const v = rotateTile(x, y, GRID_W, GRID_H, rotation);
        const b = (sy + heights[i] * TERRAIN_STEP - VIEW.originY) / VIEW.halfH;
        const tx = (a + b) / 2;
        const ty = (b - a) / 2;
        if (Math.floor(tx) === v.x && Math.floor(ty) === v.y) {
          const score = heights[i] * 1000 + (v.x + v.y);
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
    // Logical (not backing-store) canvas size: drawing runs under the DPR
    // transform, so picking has to work in the same logical coordinates.
    const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const sy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
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
    const lockedZone = gateZone(selectedTool);
    if (lockedZone && !zoneUnlocked(lockedZone, rating, money)) {
      showToast(strings.zoneLocked);
      return;
    }
    const cost = toolCost(selectedTool, tiles, i);
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

  function setRotation(rot: Rotation) {
    rotation = rot;
    VIEW = makeView(rotation);
    hoverTile = -1;
    armedTile = -1;
    // Screen-space effects were projected under the old rotation
    floaters = [];
    balloons = [];
  }
  function startRotate(dir: 1 | -1) {
    if (rotAnim) return; // ignore taps while a turn is already animating
    if (reduceMotion) {
      setRotation(((rotation + (dir === 1 ? 1 : 3)) % 4) as Rotation);
      return;
    }
    rotAnim = { t: 0, dir, swapped: false };
  }
  document.getElementById('rotate-left')?.addEventListener('click', () => startRotate(-1));
  document.getElementById('rotate-right')?.addEventListener('click', () => startRotate(1));

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
