/**
 * Coaster track model: a closed loop of segments the player lays down tile
 * by tile, validated as pure geometry against the park's terrain heights —
 * no canvas involved. See the "drag-to-build coaster track editor" section
 * of docs/plans/2026-07-09-park-overhaul-design.md.
 */
import { GRID_W, GRID_H, type TileType } from './grid';

export type SegmentKind = 'flat' | 'up' | 'down' | 'turnL' | 'turnR' | 'station';

export type Dir = 0 | 1 | 2 | 3;

/**
 * `dir` is the direction of travel FROM this segment's tile TO the next
 * segment's tile in the loop (0 = north, 1 = east, 2 = south, 3 = west) —
 * whichever neighbour the player tapped next while drafting, not derived
 * from `kind`. `kind` is validated against the observed `dir`/height
 * sequence by `validateTrack`, not the other way round.
 */
export interface Segment {
  tile: number;
  dir: Dir;
  kind: SegmentKind;
}

/**
 * Smallest loop that can contain at least one straight (station-eligible)
 * segment: every corner of a rectangle must turn, so a minimal 2×2 loop is
 * all turns and can never fit a station. A 2×3 rectangle (perimeter 6) is
 * the smallest rectangle with a straight run.
 */
export const MIN_TRACK_LENGTH = 6;

/** Guests board a cart in one batch up to this many riders. */
export const CAR_CAPACITY = 4;

/** Cart speed, tiles/second — clamped so it never fully stops on a climb. */
export const CART_MIN_SPEED = 1.5;
export const CART_MAX_SPEED = 6;
export const CART_CRUISE_SPEED = 2.5;

const DIR_DELTA: { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 }, // 0 north
  { dx: 1, dy: 0 }, // 1 east
  { dx: 0, dy: 1 }, // 2 south
  { dx: -1, dy: 0 } // 3 west
];

/** Steps one tile in `dir` from `tile`, or null past the grid edge. */
export function stepTile(tile: number, dir: Dir): number | null {
  const x = tile % GRID_W;
  const y = Math.floor(tile / GRID_W);
  const { dx, dy } = DIR_DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) return null;
  return ny * GRID_W + nx;
}

/** The direction from `fromTile` to `toTile` if they're orthogonal neighbours, else null. */
export function dirBetween(fromTile: number, toTile: number): Dir | null {
  for (let d = 0; d < 4; d++) {
    if (stepTile(fromTile, d as Dir) === toTile) return d as Dir;
  }
  return null;
}

/** Rotates a direction: turn = -1 (left/counter-clockwise) or +1 (right/clockwise). */
export function rotateDir(dir: Dir, turn: -1 | 1): Dir {
  return (((dir + turn) % 4) + 4) % 4 as Dir;
}

const TURN: Partial<Record<SegmentKind, -1 | 1>> = { turnL: -1, turnR: 1 };

/** Height steps a segment's exit transition climbs: up = +1, down = -1, everything else level. */
export function segmentClimb(kind: SegmentKind): -1 | 0 | 1 {
  return kind === 'up' ? 1 : kind === 'down' ? -1 : 0;
}

/**
 * The turn kind implied by entering a tile travelling `entryDir` and leaving
 * it travelling `exitDir`: null for straight-through, and never a 180° —
 * grid drafting can't produce one (stepping back lands on the previous
 * tile, which the duplicate-tile rule already rejects). Lets the drafting
 * UI derive corners from where the player taps instead of asking for
 * explicit turn pieces.
 */
export function turnKind(entryDir: Dir, exitDir: Dir): 'turnL' | 'turnR' | null {
  if (entryDir === exitDir) return null;
  return rotateDir(entryDir, 1) === exitDir ? 'turnR' : 'turnL';
}

export type TrackErrorCode =
  | 'tooShort'
  | 'duplicateTile'
  | 'needsStation'
  | 'notClosed'
  | 'tooSteep'
  | 'heightMismatch';

export type TrackResult = { ok: true } | { ok: false; error: TrackErrorCode };

/**
 * Validates a drafted loop purely from its own segment data plus the park's
 * terrain heights — no world `tiles` access (tile occupancy is a placement
 * concern, handled separately by `canPlaceTrack` below).
 */
export function validateTrack(segments: Segment[], heights: number[]): TrackResult {
  if (segments.length < MIN_TRACK_LENGTH) return { ok: false, error: 'tooShort' };

  const seen = new Set<number>();
  for (const seg of segments) {
    if (seen.has(seg.tile)) return { ok: false, error: 'duplicateTile' };
    seen.add(seg.tile);
  }

  if (segments.filter(s => s.kind === 'station').length !== 1) {
    return { ok: false, error: 'needsStation' };
  }

  const n = segments.length;
  for (let i = 0; i < n; i++) {
    const seg = segments[i];
    const next = segments[(i + 1) % n];
    const prev = segments[(i - 1 + n) % n];

    if (stepTile(seg.tile, seg.dir) !== next.tile) return { ok: false, error: 'notClosed' };

    const turn = TURN[seg.kind];
    const expectedDir = turn !== undefined ? rotateDir(prev.dir, turn) : prev.dir;
    if (seg.dir !== expectedDir) return { ok: false, error: 'notClosed' };

    // Distinct from 'notClosed': drafts survive tool switches so players
    // terraform under laid track, and "reshape the land" is the actionable
    // hint there — "pieces don't connect" would send them hunting a
    // geometry problem that doesn't exist.
    const dh = heights[next.tile] - heights[seg.tile];
    if (dh !== segmentClimb(seg.kind)) return { ok: false, error: 'heightMismatch' };
  }

  for (let i = 0; i < n; i++) {
    const a = segments[i].kind;
    const b = segments[(i + 1) % n].kind;
    const climbs = (k: SegmentKind) => k === 'up' || k === 'down';
    if (climbs(a) && climbs(b)) return { ok: false, error: 'tooSteep' };
  }

  return { ok: true };
}

/**
 * Whether every segment's tile is currently free to build on. A separate
 * concern from `validateTrack`'s geometry checks (matching grid.ts's own
 * split between `canPlace` and pricing) — a drafted loop can be
 * geometrically perfect and still be unbuildable if a segment's tile
 * stopped being grass mid-draft.
 */
export function canPlaceTrack(tiles: TileType[], segments: Segment[]): boolean {
  return segments.every(s => tiles[s.tile] === 'grass');
}

/**
 * Rotates an already-valid closed loop so the station segment is first —
 * lets the runtime track cart progress as `u ∈ [0, length)` with the
 * station always at `u = 0`, so "the cart wrapped past 0" directly means
 * "the cart is back at the station" with no extra bookkeeping.
 */
export function rotateToStation(segments: Segment[]): Segment[] {
  const stationIndex = segments.findIndex(s => s.kind === 'station');
  if (stationIndex <= 0) return segments.slice();
  return [...segments.slice(stationIndex), ...segments.slice(0, stationIndex)];
}

/** Total height descended over one lap — taller hills make a better coaster. */
export function trackHeightDrop(segments: Segment[], heights: number[]): number {
  let drop = 0;
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    const next = segments[(i + 1) % n];
    const dh = heights[segments[i].tile] - heights[next.tile];
    if (dh > 0) drop += dh;
  }
  return drop;
}

/**
 * How much a lap restores the `thrill` need (0–100, same scale as a
 * BuildingDef's `boost`) — scaled by total height drop and loop length, so
 * taller hills and longer tracks make an objectively better coaster.
 */
export function thrillBoost(segments: Segment[], heights: number[]): number {
  const drop = trackHeightDrop(segments, heights);
  return Math.min(100, 40 + drop * 10 + segments.length * 2);
}

/**
 * Next cart speed after `dt` seconds on a segment of `kind`: accelerates
 * downhill, decelerates (but never stalls) uphill, and drags toward cruise
 * speed on flats/turns/tunnels/the station — a simplified energy model, not
 * real physics, in the spirit of Tank Duel's `simulateShot`.
 */
export function nextCartSpeed(speed: number, kind: SegmentKind, dt: number): number {
  const accel = kind === 'down' ? 2.5 : kind === 'up' ? -3.5 : (CART_CRUISE_SPEED - speed) * 0.8;
  return Math.min(CART_MAX_SPEED, Math.max(CART_MIN_SPEED, speed + accel * dt));
}

/** Advances the cart's loop progress by `speed * dt`, wrapping at `loopLength`. */
export function advanceU(u: number, speed: number, dt: number, loopLength: number): number {
  return (u + speed * dt) % loopLength;
}
