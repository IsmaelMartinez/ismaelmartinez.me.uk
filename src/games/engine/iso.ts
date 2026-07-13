/**
 * Isometric projection and drawing helpers for grid games (Pixel Park,
 * Microcity). Tiles are diamonds; buildings are extruded blocks with a lit
 * top face and shaded left/right faces, drawn back-to-front by diagonal.
 *
 * Tile coordinates are in tile units (fractions allowed); the projection
 * maps tile (tx, ty) to screen pixels.
 */

export interface IsoView {
  /** Half the on-screen width of one tile diamond. */
  halfW: number;
  /** Half the on-screen height of one tile diamond. */
  halfH: number;
  originX: number;
  originY: number;
}

export function isoProject(view: IsoView, tx: number, ty: number): { x: number; y: number } {
  return {
    x: view.originX + (tx - ty) * view.halfW,
    y: view.originY + (tx + ty) * view.halfH
  };
}

export function isoUnproject(view: IsoView, sx: number, sy: number): { tx: number; ty: number } {
  const a = (sx - view.originX) / view.halfW;
  const b = (sy - view.originY) / view.halfH;
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** Screen point → tile index, or -1 outside the grid. */
export function isoTileFromPoint(
  view: IsoView,
  sx: number,
  sy: number,
  w: number,
  h: number
): number {
  const { tx, ty } = isoUnproject(view, sx, sy);
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  if (x < 0 || x >= w || y < 0 || y >= h) return -1;
  return y * w + x;
}

/** Multiplies each RGB channel of a #rrggbb colour; factor <1 darkens. */
export function shadeColor(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(Math.min(255, Math.max(0, ((n >> shift) & 0xff) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function diamondPath(ctx: CanvasRenderingContext2D, view: IsoView, x: number, y: number, lift: number) {
  const n = isoProject(view, x, y);
  const e = isoProject(view, x + 1, y);
  const s = isoProject(view, x + 1, y + 1);
  const w = isoProject(view, x, y + 1);
  ctx.beginPath();
  ctx.moveTo(n.x, n.y - lift);
  ctx.lineTo(e.x, e.y - lift);
  ctx.lineTo(s.x, s.y - lift);
  ctx.lineTo(w.x, w.y - lift);
  ctx.closePath();
}

export function fillTile(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  x: number,
  y: number,
  color: string,
  lift = 0
): void {
  diamondPath(ctx, view, x, y, lift);
  ctx.fillStyle = color;
  ctx.fill();
}

export function strokeTile(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  x: number,
  y: number,
  color: string,
  lineWidth = 2,
  lift = 0
): void {
  diamondPath(ctx, view, x, y, lift);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Extruded block on tile (x, y): lit top, shaded south-west and south-east
 * faces. `inset` shrinks the footprint within the tile (0–0.5). `zOffset`
 * lifts the block's *base* by that many pixels before drawing `height` on
 * top of it — e.g. a building on a raised tile passes the terrain's own
 * lift as `zOffset` so its base sits on the hill's surface instead of at
 * sea level, while `height` stays just the building's own height.
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  x: number,
  y: number,
  height: number,
  baseColor: string,
  inset = 0.08,
  zOffset = 0
): void {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + 1 - inset;
  const y1 = y + 1 - inset;
  const n = isoProject(view, x0, y0);
  const e = isoProject(view, x1, y0);
  const s = isoProject(view, x1, y1);
  const w = isoProject(view, x0, y1);
  const top = height + zOffset;

  // South-west face (between W and S corners)
  ctx.fillStyle = shadeColor(baseColor, 0.62);
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - top);
  ctx.lineTo(s.x, s.y - top);
  ctx.lineTo(s.x, s.y - zOffset);
  ctx.lineTo(w.x, w.y - zOffset);
  ctx.closePath();
  ctx.fill();

  // South-east face (between S and E corners)
  ctx.fillStyle = shadeColor(baseColor, 0.45);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - top);
  ctx.lineTo(e.x, e.y - top);
  ctx.lineTo(e.x, e.y - zOffset);
  ctx.lineTo(s.x, s.y - zOffset);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = shadeColor(baseColor, 1.05);
  ctx.beginPath();
  ctx.moveTo(n.x, n.y - top);
  ctx.lineTo(e.x, e.y - top);
  ctx.lineTo(s.x, s.y - top);
  ctx.lineTo(w.x, w.y - top);
  ctx.closePath();
  ctx.fill();
  // Crisp rim on the top edge, and a highlight down the near vertical
  // edge, so the block reads as solid geometry rather than a flat cutout.
  ctx.strokeStyle = shadeColor(baseColor, 1.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = shadeColor(baseColor, 0.85);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - top);
  ctx.lineTo(s.x, s.y - zOffset);
  ctx.stroke();
}

/**
 * A thin sloped quad spanning one tile whose four corners can each sit at a
 * different pixel height — generalizes drawBlock's flat-topped corner math
 * (one uniform height per tile) to bridge two different heights, e.g. a
 * coaster track climbing a hillside between two adjacent terrain steps.
 */
export function drawRamp(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  x: number,
  y: number,
  cornerLift: { n: number; e: number; s: number; w: number },
  color: string,
  inset = 0.08
): void {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + 1 - inset;
  const y1 = y + 1 - inset;
  const n = isoProject(view, x0, y0);
  const e = isoProject(view, x1, y0);
  const s = isoProject(view, x1, y1);
  const w = isoProject(view, x0, y1);

  ctx.fillStyle = shadeColor(color, 1.05);
  ctx.beginPath();
  ctx.moveTo(n.x, n.y - cornerLift.n);
  ctx.lineTo(e.x, e.y - cornerLift.e);
  ctx.lineTo(s.x, s.y - cornerLift.s);
  ctx.lineTo(w.x, w.y - cornerLift.w);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor(color, 1.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * View rotation in quarter turns (0–3, counting clockwise). Rotation is
 * purely a rendering concern: world tiles stay put, and these helpers map
 * between world coordinates and rotated view coordinates.
 */
export type Rotation = 0 | 1 | 2 | 3;

/** Grid dimensions as seen from a rotated view (quarter turns swap them). */
export function rotatedDims(w: number, h: number, rot: number): { w: number; h: number } {
  return rot % 2 ? { w: h, h: w } : { w, h };
}

/** World tile (x, y) → view tile under `rot` quarter turns. */
export function rotateTile(
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number
): { x: number; y: number } {
  switch (((rot % 4) + 4) % 4) {
    case 1:
      return { x: h - 1 - y, y: x };
    case 2:
      return { x: w - 1 - x, y: h - 1 - y };
    case 3:
      return { x: y, y: w - 1 - x };
    default:
      return { x, y };
  }
}

/** View tile → world tile: the inverse of rotateTile. */
export function unrotateTile(
  vx: number,
  vy: number,
  w: number,
  h: number,
  rot: number
): { x: number; y: number } {
  switch (((rot % 4) + 4) % 4) {
    case 1:
      return { x: vy, y: h - 1 - vx };
    case 2:
      return { x: w - 1 - vx, y: h - 1 - vy };
    case 3:
      return { x: w - 1 - vy, y: vx };
    default:
      return { x: vx, y: vy };
  }
}

/**
 * A step direction index (0=N, 1=E, 2=S, 3=W — one quarter turn clockwise
 * per increment) as seen under `rot` quarter turns of the view. Consistent
 * with rotateTile: a step from tile A to tile B in world direction `dir`
 * is a step in view direction `rotateDir(dir, rot)` between their rotated
 * positions — so callers never need to know rotateTile's handedness.
 */
export function rotateDir(dir: number, rot: number): number {
  return (((dir + rot) % 4) + 4) % 4;
}

/**
 * Continuous variant of rotateTile for fractional positions (cars, smoke,
 * floaters). Consistent with rotateTile: a point inside world tile (x, y)
 * lands inside its rotated view tile.
 */
export function rotatePoint(
  tx: number,
  ty: number,
  w: number,
  h: number,
  rot: number
): { tx: number; ty: number } {
  switch (((rot % 4) + 4) % 4) {
    case 1:
      return { tx: h - ty, ty: tx };
    case 2:
      return { tx: w - tx, ty: h - ty };
    case 3:
      return { tx: ty, ty: w - tx };
    default:
      return { tx, ty };
  }
}

/**
 * Visits every tile back-to-front (by x+y diagonal) — the painter's order
 * that keeps extruded blocks correctly layered.
 */
export function forEachTileBackToFront(
  w: number,
  h: number,
  visit: (x: number, y: number, i: number, diagonal: number) => void
): void {
  for (let s = 0; s <= w + h - 2; s++) {
    for (let x = Math.max(0, s - h + 1); x <= Math.min(w - 1, s); x++) {
      const y = s - x;
      visit(x, y, y * w + x, s);
    }
  }
}
