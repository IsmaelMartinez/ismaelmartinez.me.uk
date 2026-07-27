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

/**
 * Multiplies each RGB channel of a colour; factor <1 darkens. Accepts
 * #rrggbb plus the `rgb(r, g, b)` / `rgba(r, g, b, a)` forms this function
 * itself returns, so a shaded colour can be shaded again (e.g. Pixel
 * Park's zone-tinted ground fed back through drawBlock for raised tiles —
 * which used to come out as NaN channels and paint hills black). An rgba
 * input keeps its alpha; #rgb shorthand expands. Other formats (named
 * colours, hsl()) are not understood and come back black.
 */
export function shadeColor(color: string, factor: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let alpha: string | null = null;
  if (color.charCodeAt(0) === 35 /* '#' */ && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    r = (n >> 16) & 0xff;
    g = (n >> 8) & 0xff;
    b = n & 0xff;
  } else if (color.charCodeAt(0) === 35 && color.length === 4) {
    const n = parseInt(color.slice(1), 16);
    r = ((n >> 8) & 0xf) * 17;
    g = ((n >> 4) & 0xf) * 17;
    b = (n & 0xf) * 17;
  } else if (color.startsWith('rgb')) {
    const m = color.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      r = +m[0];
      g = +m[1];
      b = +m[2];
      if (m.length > 3) alpha = m[3];
    }
  }
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v * factor)));
  return alpha === null
    ? `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`
    : `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${alpha})`;
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
 * Projected screen corners of the inset footprint on tile (x, y) — the four
 * points drawBlock extrudes between. Face-detail passes (mortar seams,
 * window grids, storefront bands, awning rims) draw on a block's faces by
 * interpolating between these corners; they must derive them through this
 * helper so the footprint math exists exactly once.
 */
export interface BlockCorners {
  n: { x: number; y: number };
  e: { x: number; y: number };
  s: { x: number; y: number };
  w: { x: number; y: number };
}

export function blockFaceCorners(
  view: IsoView,
  x: number,
  y: number,
  inset = 0.08
): BlockCorners {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + 1 - inset;
  const y1 = y + 1 - inset;
  return {
    n: isoProject(view, x0, y0),
    e: isoProject(view, x1, y0),
    s: isoProject(view, x1, y1),
    w: isoProject(view, x0, y1)
  };
}

/**
 * Appends the W→S→E seam polyline at pixel height `z` to the current path —
 * the horizontal course line across a block's two visible faces (stone
 * coursing, panel seams, floor lines). Path-append rather than stroke, so
 * callers batch several seams plus any bespoke joints into one
 * beginPath/stroke with their own style.
 */
export function blockSeamPath(
  ctx: CanvasRenderingContext2D,
  c: BlockCorners,
  z: number
): void {
  ctx.moveTo(c.w.x, c.w.y - z);
  ctx.lineTo(c.s.x, c.s.y - z);
  ctx.lineTo(c.e.x, c.e.y - z);
}

/**
 * Appends to the current path the quad spanning fraction `t0`–`t1` along a
 * projected edge a→b raised by `lift0` pixels, closed along `aFar→bFar`
 * (defaulting to the same edge) raised by `lift1` — the face-band idiom
 * behind glazed shopfronts, lit office strips, counter bands, and (via the
 * two-edge form) sagging awning canvas. Path-append rather than fill, so
 * batched callers — Syndicate fills every late-shift strip of a building in
 * one path — keep their draw-call budget; single-band callers wrap it in
 * their own beginPath/fill.
 */
export function faceBandPath(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  t0: number,
  t1: number,
  lift0: number,
  lift1: number,
  aFar = a,
  bFar = b
): void {
  ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 - lift0);
  ctx.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 - lift0);
  ctx.lineTo(aFar.x + (bFar.x - aFar.x) * t1, aFar.y + (bFar.y - aFar.y) * t1 - lift1);
  ctx.lineTo(aFar.x + (bFar.x - aFar.x) * t0, aFar.y + (bFar.y - aFar.y) * t0 - lift1);
  ctx.closePath();
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
  const { n, e, s, w } = blockFaceCorners(view, x, y, inset);
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
