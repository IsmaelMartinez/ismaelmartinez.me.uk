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
  lineWidth = 2
): void {
  diamondPath(ctx, view, x, y, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Extruded block on tile (x, y): lit top, shaded south-west and south-east
 * faces. `inset` shrinks the footprint within the tile (0–0.5).
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  x: number,
  y: number,
  height: number,
  baseColor: string,
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

  // South-west face (between W and S corners)
  ctx.fillStyle = shadeColor(baseColor, 0.62);
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - height);
  ctx.lineTo(s.x, s.y - height);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.fill();

  // South-east face (between S and E corners)
  ctx.fillStyle = shadeColor(baseColor, 0.45);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - height);
  ctx.lineTo(e.x, e.y - height);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = shadeColor(baseColor, 1.05);
  ctx.beginPath();
  ctx.moveTo(n.x, n.y - height);
  ctx.lineTo(e.x, e.y - height);
  ctx.lineTo(s.x, s.y - height);
  ctx.lineTo(w.x, w.y - height);
  ctx.closePath();
  ctx.fill();
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
