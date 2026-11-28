/**
 * HOTFIX's drawing: the city from straight above, and everything moving in it.
 *
 * The city is static, so it is baked, but not through `createStaticLayer`:
 * that helper bakes one canvas-sized layer, and this map is nine times the
 * size of the screen and scrolls and zooms under a camera. `createCityLayer`
 * is the same idea cut into chunks, baked on first sight at a fixed scale and
 * kept in a small cache. Nothing static is repainted per frame.
 *
 * Everything else (cars, people, bugs, markers, weather, the dusk and the
 * headlights) is drawn live in world coordinates under the camera transform.
 */
import { hash01, shadeColor } from '../engine';
import {
  CITY,
  COLS,
  ROAD_X,
  ROAD_Y,
  ROWS,
  T,
  TILE,
  districtAt,
  tileAt,
  type Lot,
  type Point
} from './map';
import { BUST_FILL, CAR_SPECS, PLAYER_HP, type Bug, type Car, type Drone, type Person, type Pickup, type RunState, type Shot } from './run';
import type { WeaponId } from './weapons';

export const VIEW_W = 640;
export const VIEW_H = 400;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const CHUNK = 8;
const CHUNK_PX = CHUNK * TILE;
const MAX_CHUNKS = 24;

// --- Ground -----------------------------------------------------------------------

const inPair = (v: number, starts: readonly number[]): boolean => starts.some(s => v === s || v === s + 1);
const isRoad = (tx: number, ty: number): boolean => tileAt(tx, ty) === T.Road;

function paintGround(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const t = tileAt(tx, ty);
  const x = tx * TILE;
  const y = ty * TILE;
  const h = (salt: number) => hash01(tx * 71 + ty * 131, salt);
  const district = districtAt(x);
  switch (t) {
    case T.Water: {
      ctx.fillStyle = shadeColor('#1c5673', 0.92 + h(1) * 0.12);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(186, 230, 253, 0.22)';
      for (let k = 0; k < 2; k++) ctx.fillRect(x + Math.floor(h(2 + k) * 22), y + 6 + Math.floor(h(5 + k) * 20), 7 + Math.floor(h(8 + k) * 5), 1);
      break;
    }
    case T.Road: {
      ctx.fillStyle = shadeColor('#3b3e47', 0.96 + h(1) * 0.08);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + Math.floor(h(2 + k) * 30), y + Math.floor(h(6 + k) * 30), 2, 1);
      const horizontal = inPair(ty, ROAD_Y);
      const vertical = inPair(tx, ROAD_X);
      if (horizontal && vertical) break;
      // Double yellows along the kerb, as on any street here.
      ctx.fillStyle = '#d6a419';
      if (tileAt(tx, ty - 1) !== T.Road && horizontal) ctx.fillRect(x, y + 2, TILE, 1);
      if (tileAt(tx, ty + 1) !== T.Road && horizontal) ctx.fillRect(x, y + TILE - 3, TILE, 1);
      if (tileAt(tx - 1, ty) !== T.Road && vertical) ctx.fillRect(x + 2, y, 1, TILE);
      if (tileAt(tx + 1, ty) !== T.Road && vertical) ctx.fillRect(x + TILE - 3, y, 1, TILE);
      // Centre line, broken; a zebra crossing on the way into each junction.
      ctx.fillStyle = 'rgba(241, 245, 249, 0.8)';
      if (horizontal) {
        const top = ROAD_Y.includes(ty as never);
        const atJunction = inPair(tx - 1, ROAD_X) || inPair(tx + 1, ROAD_X);
        if (atJunction) for (let k = 0; k < 4; k++) ctx.fillRect(x + 10, y + 3 + k * 8, 12, 4);
        else ctx.fillRect(x + 8, top ? y + TILE - 1 : y, 16, 1);
      } else {
        const left = ROAD_X.includes(tx as never);
        const atJunction = inPair(ty - 1, ROAD_Y) || inPair(ty + 1, ROAD_Y);
        if (atJunction) for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 8, y + 10, 4, 12);
        else ctx.fillRect(left ? x + TILE - 1 : x, y + 8, 1, 16);
      }
      break;
    }
    case T.Pave: {
      if (district === 'eix') {
        // Barcelona's pavement: the four-petal flower tile.
        ctx.fillStyle = '#b9ae9d';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(70, 60, 48, 0.22)';
        for (let cy = 0; cy < 4; cy++) {
          for (let cx = 0; cx < 4; cx++) {
            const px = x + cx * 8 + 4;
            const py = y + cy * 8 + 4;
            ctx.fillRect(px - 2, py - 0.5, 4, 1);
            ctx.fillRect(px - 0.5, py - 2, 1, 4);
          }
        }
      } else {
        ctx.fillStyle = shadeColor(district === 'old' ? '#8d9199' : '#868a8c', 0.95 + h(1) * 0.1);
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(30, 34, 44, 0.2)';
        ctx.fillRect(x, y + 15, TILE, 1);
        ctx.fillRect(x + (h(2) < 0.5 ? 10 : 20), y, 1, 15);
        ctx.fillRect(x + (h(3) < 0.5 ? 6 : 24), y + 16, 1, 16);
      }
      // Kerb: a pale lip wherever the pavement meets tarmac.
      ctx.fillStyle = 'rgba(235, 238, 242, 0.55)';
      if (isRoad(tx, ty - 1)) ctx.fillRect(x, y, TILE, 2);
      if (isRoad(tx, ty + 1)) ctx.fillRect(x, y + TILE - 2, TILE, 2);
      if (isRoad(tx - 1, ty)) ctx.fillRect(x, y, 2, TILE);
      if (isRoad(tx + 1, ty)) ctx.fillRect(x + TILE - 2, y, 2, TILE);
      if (district === 'eix') {
        // The xamfrà: every block here has its corners cut off, so the junctions are little octagonal squares.
        for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          if (!isRoad(tx + ox, ty) || !isRoad(tx, ty + oy)) continue;
          const cx = ox < 0 ? x : x + TILE;
          const cy = oy < 0 ? y : y + TILE;
          ctx.fillStyle = '#3b3e47';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - ox * 18, cy);
          ctx.lineTo(cx, cy - oy * 18);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(235, 238, 242, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - ox * 18, cy);
          ctx.lineTo(cx, cy - oy * 18);
          ctx.stroke();
        }
      }
      break;
    }
    case T.Lane: {
      ctx.fillStyle = '#5a5650';
      ctx.fillRect(x, y, TILE, TILE);
      for (let cy = 0; cy < 4; cy++) {
        for (let cx = 0; cx < 4; cx++) {
          ctx.fillStyle = hash01(tx * 4 + cx + (ty * 4 + cy) * 977, 3) < 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.14)';
          ctx.fillRect(x + cx * 8 + (cy % 2 ? 4 : 0) + 1, y + cy * 8 + 1, 6, 6);
        }
      }
      break;
    }
    case T.Plaza: {
      ctx.fillStyle = shadeColor('#c8b88f', 0.96 + h(1) * 0.08);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(92, 72, 40, 0.16)';
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      ctx.fillRect(x + 16, y + 16, 1, 1);
      break;
    }
    case T.Quay: {
      ctx.fillStyle = shadeColor('#6c727a', 0.95 + h(1) * 0.1);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(x, y, TILE, 1);
      if (h(2) < 0.12) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 4 + k * 7, y + 12, 4, 8);
      }
      break;
    }
    case T.Grass:
    case T.Tree:
    case T.Yard: {
      // The park rises to the Seat: the grass lightens towards its top.
      const seat = CITY.places.seat;
      const rise = t === T.Yard ? 0 : Math.max(0, 1 - Math.hypot(x + 16 - seat.x, y + 16 - seat.y) / 150);
      ctx.fillStyle = shadeColor(t === T.Yard ? '#3c6e3a' : '#44803c', 0.94 + h(1) * 0.1 + rise * 0.3);
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(190, 242, 100, 0.2)';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + Math.floor(h(2 + k) * 30), y + Math.floor(h(7 + k) * 30), 1, 2);
      break;
    }
    default: {
      ctx.fillStyle = '#23262e';
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}

// --- Roofs ------------------------------------------------------------------------

const CONTAINER_COLORS = ['#c2410c', '#1d4ed8', '#15803d', '#b91c1c', '#a16207', '#0e7490'];

function roofColor(lot: Lot): string {
  switch (lot.style) {
    case 'slate':
      return shadeColor('#5c6675', 0.82 + lot.tint * 0.4);
    case 'terracotta':
      return shadeColor('#c46a43', 0.82 + lot.tint * 0.34);
    case 'shed':
      return shadeColor('#6a8799', 0.8 + lot.tint * 0.4);
    case 'container':
      return CONTAINER_COLORS[Math.floor(lot.tint * CONTAINER_COLORS.length)];
    case 'castle':
      return '#6d7168';
    case 'basilica':
      return '#d8c6a0';
    case 'lighthouse':
      return '#e5e7eb';
    case 'datacentre':
      return '#cbd5e1';
    case 'market':
      return '#f59e0b';
    case 'nick':
      return '#1e3a8a';
    case 'pub':
      return '#14532d';
    case 'hall':
      return '#ea580c';
    case 'clinic':
      return '#f1f5f9';
    default:
      return shadeColor('#3a4050', 0.85 + lot.tint * 0.3);
  }
}

const raised = (tx: number, ty: number): boolean => {
  const t = tileAt(tx, ty);
  return t === T.Building || t === T.Rock;
};
const lotOf = (tx: number, ty: number): number =>
  tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? -2 : raised(tx, ty) ? CITY.lotAt[ty * COLS + tx] : -1;

function paintRoof(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const id = lotOf(tx, ty);
  if (id < 0) return;
  const lot = CITY.lots[id];
  const x = tx * TILE;
  const y = ty * TILE;
  const h = (salt: number) => hash01(tx * 71 + ty * 131, salt);
  const base = roofColor(lot);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, TILE, TILE);

  if (lot.style === 'castle') {
    // Crag: facets of darker and lighter rock.
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = h(k) < 0.5 ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x + Math.floor(h(10 + k) * 24), y + Math.floor(h(20 + k) * 24), 6 + Math.floor(h(30 + k) * 8), 4 + Math.floor(h(40 + k) * 6));
    }
  } else if (lot.style === 'shed' || lot.style === 'container') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 8, y, 2, TILE);
  } else if (lot.style === 'slate' || lot.style === 'edge') {
    // Courses of slate, and chimney stacks with their pots.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x, y + 4 + k * 8, TILE, 1);
    if (h(3) < 0.3) {
      const cx = x + 6 + Math.floor(h(4) * 14);
      const cy = y + 6 + Math.floor(h(5) * 14);
      ctx.fillStyle = '#3b3632';
      ctx.fillRect(cx, cy, 10, 6);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(cx + 1, cy + 1, 2, 2);
      ctx.fillRect(cx + 4, cy + 1, 2, 2);
      ctx.fillRect(cx + 7, cy + 1, 2, 2);
    } else if (h(3) > 0.82) {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.5)';
      ctx.fillRect(x + 10, y + 10, 8, 6);
    }
  } else if (lot.style === 'terracotta') {
    // Flat roof terraces, water tanks and the odd awning.
    ctx.fillStyle = 'rgba(255, 237, 213, 0.22)';
    if (h(3) < 0.45) ctx.fillRect(x + 5, y + 5, 12 + Math.floor(h(4) * 10), 10 + Math.floor(h(5) * 10));
    if (h(6) < 0.25) {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(x + 22, y + 22, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Party walls between lots, a lit edge to the north and west, a dark one to the south and east.
  const n = lotOf(tx, ty - 1);
  const s = lotOf(tx, ty + 1);
  const w = lotOf(tx - 1, ty);
  const e = lotOf(tx + 1, ty);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  if (n >= 0 && n !== id) ctx.fillRect(x, y, TILE, 1);
  if (w >= 0 && w !== id) ctx.fillRect(x, y, 1, TILE);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  if (n === -1) ctx.fillRect(x, y, TILE, 2);
  if (w === -1) ctx.fillRect(x, y, 2, TILE);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  if (s === -1) ctx.fillRect(x, y + TILE - 2, TILE, 2);
  if (e === -1) ctx.fillRect(x + TILE - 2, y, 2, TILE);
  if (lot.style === 'terracotta') {
    // The flats follow the cut corner of their block.
    ctx.fillStyle = '#b9ae9d';
    for (const [ox, oy, a, b] of [[-1, -1, w, n], [1, -1, e, n], [-1, 1, w, s], [1, 1, e, s]]) {
      if (a !== -1 || b !== -1) continue;
      const cx = ox < 0 ? x : x + TILE;
      const cy = oy < 0 ? y : y + TILE;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - ox * 14, cy);
      ctx.lineTo(cx, cy - oy * 14);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** The landmarks, each drawn whole over its lot. */
function paintLandmark(ctx: CanvasRenderingContext2D, lot: Lot): void {
  const x = lot.x0 * TILE;
  const y = lot.y0 * TILE;
  const w = (lot.x1 - lot.x0 + 1) * TILE;
  const h = (lot.y1 - lot.y0 + 1) * TILE;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const disc = (px: number, py: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (lot.style) {
    case 'castle': {
      // Curtain wall, corner towers, the keep, and the saltire flying over it.
      ctx.strokeStyle = '#a8a393';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 18, y + 18, w - 36, h - 36);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 21.5, y + 21.5, w - 43, h - 43);
      ctx.fillStyle = '#57534a';
      for (let px = x + 20; px < x + w - 20; px += 10) {
        ctx.fillRect(px, y + 15, 5, 3);
        ctx.fillRect(px, y + h - 18, 5, 3);
      }
      for (const [px, py] of [[x + 18, y + 18], [x + w - 18, y + 18], [x + 18, y + h - 18], [x + w - 18, y + h - 18]]) {
        disc(px, py, 11, '#8f8a7a');
        disc(px, py, 7, '#b5b09f');
      }
      ctx.fillStyle = '#8f8a7a';
      ctx.fillRect(cx - 30, cy - 24, 60, 48);
      ctx.fillStyle = '#bdb8a6';
      ctx.fillRect(cx - 24, cy - 18, 48, 36);
      ctx.fillStyle = '#57534a';
      for (let px = cx - 30; px < cx + 30; px += 12) {
        ctx.fillRect(px, cy - 24, 6, 4);
        ctx.fillRect(px, cy + 20, 6, 4);
      }
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(cx - 9, cy - 6, 18, 12);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 6);
      ctx.lineTo(cx + 9, cy + 6);
      ctx.moveTo(cx + 9, cy - 6);
      ctx.lineTo(cx - 9, cy + 6);
      ctx.stroke();
      break;
    }
    case 'basilica': {
      // Four spires over the crossing, tipped in broken-tile colour.
      const tips = ['#dc2626', '#facc15', '#16a34a', '#2563eb'];
      [[-22, -34], [22, -34], [-22, 34], [22, 34]].forEach(([ox, oy], i) => {
        disc(cx + ox, cy + oy, 13, '#a8956c');
        disc(cx + ox, cy + oy, 9, '#e7d8b4');
        disc(cx + ox, cy + oy, 5, '#a8956c');
        disc(cx + ox, cy + oy, 2.5, tips[i]);
      });
      disc(cx, cy, 20, '#a8956c');
      disc(cx, cy, 15, '#efe2c0');
      disc(cx, cy, 8, '#a8956c');
      disc(cx, cy, 3.5, '#facc15');
      break;
    }
    case 'lighthouse': {
      disc(cx, cy, 13, '#f8fafc');
      disc(cx, cy, 10, '#dc2626');
      disc(cx, cy, 7, '#f8fafc');
      disc(cx, cy, 3.5, '#fde047');
      break;
    }
    case 'market': {
      // The market's roof: waves of coloured tile.
      const bands = ['#f59e0b', '#84cc16', '#f43f5e', '#fde047', '#a855f7', '#22c55e', '#fb923c'];
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 3, y + 3, w - 6, h - 6);
      ctx.clip();
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = bands[i % bands.length];
        ctx.lineWidth = 13;
        ctx.beginPath();
        for (let px = x - 10; px <= x + w + 10; px += 10) {
          const py = y + i * 13 - 4 + Math.sin(px / 26 + i * 0.6) * 7;
          if (px === x - 10) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      break;
    }
    case 'datacentre': {
      // Rows of cooling units.
      for (let py = y + 22; py < y + h - 12; py += 30) {
        for (let px = x + 22; px < x + w - 12; px += 30) {
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(px - 10, py - 10, 20, 20);
          disc(px, py, 7, '#475569');
          disc(px, py, 2, '#cbd5e1');
        }
      }
      break;
    }
    case 'nick': {
      // The chequered band every police car in the country wears.
      for (let i = 0; i < w / 8; i++) {
        ctx.fillStyle = i % 2 ? '#f8fafc' : '#1e3a8a';
        ctx.fillRect(x + i * 8, y + 6, 8, 6);
        ctx.fillStyle = i % 2 ? '#1e3a8a' : '#f8fafc';
        ctx.fillRect(x + i * 8, y + 12, 8, 6);
      }
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + 12, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.fillRect(cx - 9, cy + 2, 4, 20);
      ctx.fillRect(cx + 5, cy + 2, 4, 20);
      ctx.fillRect(cx - 9, cy + 10, 18, 4);
      break;
    }
    case 'clinic': {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(cx - 3, cy - 10, 6, 20);
      ctx.fillRect(cx - 10, cy - 3, 20, 6);
      break;
    }
    case 'pub': {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(cx - 20, cy - 4, 40, 8);
      ctx.fillStyle = '#14532d';
      for (let i = 0; i < 5; i++) ctx.fillRect(cx - 17 + i * 8, cy - 2, 4, 4);
      break;
    }
    case 'hall': {
      // A penguin on the roof, so nobody misses the user group.
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - 2, cy - 7, 4, 3);
      break;
    }
  }
}

function paintTree(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  const h = (salt: number) => hash01(tx * 71 + ty * 131, salt);
  const green = shadeColor('#2f6b2e', 0.85 + h(1) * 0.4);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = k === 2 ? shadeColor(green, 1.25) : green;
    ctx.beginPath();
    ctx.arc(x + (h(2 + k) - 0.5) * 12, y + (h(5 + k) - 0.5) * 12, 12 - k * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const LANDMARKS = new Set(['castle', 'basilica', 'lighthouse', 'market', 'datacentre', 'nick', 'clinic', 'pub', 'hall']);

function bakeChunk(cx: number, cy: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_PX * scale;
  canvas.height = CHUNK_PX * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  ctx.translate(-cx * CHUNK_PX, -cy * CHUNK_PX);
  // One tile of margin all round, so shadows and tree crowns that spill over a chunk's edge meet their other half.
  const x0 = cx * CHUNK - 1;
  const y0 = cy * CHUNK - 1;
  const each = (fn: (tx: number, ty: number) => void) => {
    for (let ty = y0; ty <= y0 + CHUNK + 1; ty++) for (let tx = x0; tx <= x0 + CHUNK + 1; tx++) fn(tx, ty);
  };
  each((tx, ty) => paintGround(ctx, tx, ty));
  // The Seat: contour rings up to a cairn at the top.
  const seat = CITY.places.seat;
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    ctx.strokeStyle = `rgba(236, 252, 203, ${0.34 - k * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(seat.x - k * 3, seat.y + k * 2, 20 + k * 22, 16 + k * 19, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(seat.x - 3, seat.y - 3, 6, 6);
  ctx.fillStyle = '#e7e5e4';
  ctx.fillRect(seat.x - 2, seat.y - 4, 4, 4);
  ctx.fillStyle = 'rgba(8, 10, 20, 0.3)';
  each((tx, ty) => {
    const t = tileAt(tx, ty);
    if (t === T.Building || t === T.Rock) ctx.fillRect(tx * TILE + 7, ty * TILE + 9, TILE, TILE);
    else if (t === T.Tree) {
      ctx.beginPath();
      ctx.arc(tx * TILE + 21, ty * TILE + 23, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  each((tx, ty) => paintRoof(ctx, tx, ty));
  each((tx, ty) => {
    if (tileAt(tx, ty) === T.Tree) paintTree(ctx, tx, ty);
  });
  for (const lot of CITY.lots) {
    if (!LANDMARKS.has(lot.style) || lot.x1 < lot.x0) continue;
    if (lot.x1 < x0 || lot.x0 > x0 + CHUNK + 1 || lot.y1 < y0 || lot.y0 > y0 + CHUNK + 1) continue;
    paintLandmark(ctx, lot);
  }
  return canvas;
}

export interface CityLayer {
  /** Blits the chunks the camera can see. The context must already carry the camera transform. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera): void;
  /** Drops the bakes, for a new device-pixel ratio. */
  reset(dpr: number): void;
}

export function createCityLayer(): CityLayer {
  const chunks = new Map<number, HTMLCanvasElement>();
  let scale = 1;
  return {
    reset(dpr) {
      const next = dpr >= 1.5 ? 2 : 1;
      if (next !== scale) chunks.clear();
      scale = next;
    },
    draw(ctx, cam) {
      const halfW = VIEW_W / 2 / cam.zoom;
      const halfH = VIEW_H / 2 / cam.zoom;
      const cx0 = Math.max(0, Math.floor((cam.x - halfW) / CHUNK_PX));
      const cx1 = Math.min(Math.ceil(COLS / CHUNK) - 1, Math.floor((cam.x + halfW) / CHUNK_PX));
      const cy0 = Math.max(0, Math.floor((cam.y - halfH) / CHUNK_PX));
      const cy1 = Math.min(Math.ceil(ROWS / CHUNK) - 1, Math.floor((cam.y + halfH) / CHUNK_PX));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * 64 + cx;
          let chunk = chunks.get(key);
          if (chunk) chunks.delete(key);
          else {
            chunk = bakeChunk(cx, cy, scale);
            if (chunks.size >= MAX_CHUNKS) chunks.delete(chunks.keys().next().value as number);
          }
          // Re-inserted on every use, so the map's order is least recently seen first.
          chunks.set(key, chunk);
          // A hair of overlap hides the seam a fractional zoom would open between chunks.
          ctx.drawImage(chunk, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX + 0.6, CHUNK_PX + 0.6);
        }
      }
    }
  };
}

// --- Things that move ---------------------------------------------------------------

const CAR_SIZE: Record<Car['kind'], [number, number]> = {
  mini: [22, 12],
  saloon: [26, 13],
  taxi: [26, 13],
  van: [28, 14],
  coupe: [26, 12],
  panda: [26, 13]
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCar(ctx: CanvasRenderingContext2D, car: Car, clock: number): void {
  const [len, wid] = CAR_SIZE[car.kind];
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(car.x + 3, car.y + 4, len / 2, wid / 2 + 1, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const wrecked = car.dead > 0;
  const hurt = 1 - Math.max(0, car.hp) / CAR_SPECS[car.kind].hp;
  const body = wrecked ? '#1c1917' : shadeColor(car.color, 1 - hurt * 0.35);
  roundRect(ctx, -len / 2, -wid / 2, len, wid, car.kind === 'van' ? 2 : 4);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!wrecked) {
    // Glass front and back, the roof between them.
    ctx.fillStyle = '#1e293b';
    const cabin = car.kind === 'van' ? len * 0.2 : len * 0.12;
    ctx.fillRect(cabin - 1, -wid / 2 + 2, 5, wid - 4);
    if (car.kind !== 'van') ctx.fillRect(-len / 2 + 4, -wid / 2 + 2, 3, wid - 4);
    ctx.fillStyle = shadeColor(car.color, 1.18 - hurt * 0.3);
    ctx.fillRect(car.kind === 'van' ? -len / 2 + 2 : -len / 2 + 7, -wid / 2 + 2, car.kind === 'van' ? len * 0.62 : cabin + len / 2 - 8, wid - 4);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 1, 2, 3);
    ctx.fillRect(len / 2 - 2, wid / 2 - 4, 2, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-len / 2, -wid / 2 + 1, 1.5, 3);
    ctx.fillRect(-len / 2, wid / 2 - 4, 1.5, 3);
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-3, -3, 5, 6);
    }
    if (car.kind === 'panda') {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#fde047' : '#1d4ed8';
        ctx.fillRect(-len / 2 + 2 + i * 3.6, -wid / 2, 3.6, 2);
        ctx.fillRect(-len / 2 + 2 + i * 3.6, wid / 2 - 2, 3.6, 2);
      }
      const flash = car.driver === 'cop' && Math.floor(clock * 6) % 2 === 0;
      ctx.fillStyle = car.driver !== 'cop' ? '#64748b' : flash ? '#ef4444' : '#7f1d1d';
      ctx.fillRect(-2, -wid / 2 + 2, 3, wid / 2 - 2);
      ctx.fillStyle = car.driver !== 'cop' ? '#64748b' : flash ? '#1e3a8a' : '#60a5fa';
      ctx.fillRect(-2, 0, 3, wid / 2 - 2);
    }
  }
  ctx.restore();
}

const COATS = ['#f97316', '#3b82f6', '#a855f7', '#ef4444', '#eab308', '#64748b', '#0d9488', '#be185d'];
const HAIR = ['#1c1917', '#78350f', '#a16207', '#e5e7eb', '#451a03'];

export function drawPerson(ctx: CanvasRenderingContext2D, person: Person, raining: boolean): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(person.x + 1.5, person.y + 2, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(person.x, person.y);
  if (person.penguin) {
    ctx.rotate(person.facing + Math.PI / 2 + Math.sin(person.x + person.y) * 0.25);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(0, -0.5, 2.6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-1, -6.5, 2, 2.5);
    ctx.restore();
    return;
  }
  const lying = person.state === 'down' || person.state === 'dive';
  ctx.rotate(person.facing);
  const coat = COATS[Math.floor(person.look * COATS.length)];
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, 0, lying ? 6.5 : 3.2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = HAIR[Math.floor(person.look * 37) % HAIR.length];
  ctx.beginPath();
  ctx.arc(lying ? 6 : 0.5, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (person.state === 'fist') {
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', person.x, person.y - 8 - Math.abs(Math.sin(person.timer * 14)) * 3);
  } else if (raining && !lying && person.look > 0.35) {
    // It rains here. Most people came prepared.
    ctx.fillStyle = COATS[Math.floor(person.look * 53) % COATS.length];
    ctx.beginPath();
    ctx.arc(person.x, person.y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(person.x - Math.cos((k * Math.PI) / 4) * 7.5, person.y - Math.sin((k * Math.PI) / 4) * 7.5);
      ctx.lineTo(person.x + Math.cos((k * Math.PI) / 4) * 7.5, person.y + Math.sin((k * Math.PI) / 4) * 7.5);
      ctx.stroke();
    }
  }
}

export function drawPlayer(ctx: CanvasRenderingContext2D, run: RunState, clock: number): void {
  const p = run.player;
  if (p.car) return;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(p.x + 1.5, p.y + 2, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // A ring, so the one person who matters is never lost in the crowd.
  ctx.strokeStyle = `rgba(94, 234, 212, ${0.5 + 0.3 * Math.sin(clock * 5)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  const swing = Math.sin(p.stride / 5) * 2.5;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-1 + swing, -3.5, 3, 2);
  ctx.fillRect(-1 - swing, 1.5, 3, 2);
  ctx.fillStyle = '#14b8a6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.6, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#042f2e';
  ctx.lineWidth = 1;
  ctx.stroke();
  // The laptop bag never leaves.
  ctx.fillStyle = '#475569';
  ctx.fillRect(-5.5, -3, 3, 6);
  if (p.weapon) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, 2.2, p.weapon === 'pistol' ? 6 : p.weapon === 'smg' ? 9 : 11, p.weapon === 'rocket' ? 3 : 1.8);
  }
  ctx.fillStyle = '#292524';
  ctx.beginPath();
  ctx.arc(0.6, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (p.stun > 0) {
    ctx.fillStyle = '#fde047';
    for (let k = 0; k < 3; k++) {
      const a = clock * 7 + (k * Math.PI * 2) / 3;
      ctx.fillRect(p.x + Math.cos(a) * 8 - 1, p.y - 9 + Math.sin(a) * 3 - 1, 2, 2);
    }
  }
}

export function drawBug(ctx: CanvasRenderingContext2D, bug: Bug, clock: number): void {
  ctx.save();
  ctx.translate(bug.x, bug.y);
  ctx.rotate(bug.angle);
  if (bug.gold || bug.bash) {
    ctx.fillStyle = `rgba(250, 204, 21, ${0.22 + 0.12 * Math.sin(clock * 8)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#0c0a09';
  ctx.lineWidth = 1;
  const wiggle = Math.sin(clock * 30 + bug.x) * 1.5;
  for (const lx of [-3, 0, 3]) {
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + wiggle, -6.5);
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx - wiggle, 6.5);
    ctx.stroke();
  }
  ctx.fillStyle = bug.gold ? '#facc15' : bug.bash ? '#fb923c' : '#65a30d';
  ctx.beginPath();
  ctx.ellipse(-1, 0, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(4.5, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-5, -0.5, 8, 1);
  ctx.restore();
}

const WEAPON_ICON: Record<WeaponId, string> = { pistol: '🔫', smg: '💥', rocket: '🚀' };
const PICKUP_ICON: Record<Pickup['kind'], string> = { ...WEAPON_ICON, coffee: '☕', bash: '🪲' };
const PICKUP_COLOR: Record<Pickup['kind'], string> = { pistol: '#94a3b8', smg: '#f59e0b', rocket: '#ef4444', coffee: '#a16207', bash: '#84cc16' };

/** A crate on the street, bobbing a little so it reads as something to take. */
export function drawPickup(ctx: CanvasRenderingContext2D, pickup: Pickup, clock: number): void {
  if (pickup.wait > 0) return;
  const bob = Math.sin(clock * 4 + pickup.x) * 1.5;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(pickup.x - 7, pickup.y - 4, 16, 14);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(pickup.x - 9, pickup.y - 9 + bob, 18, 18);
  ctx.fillStyle = PICKUP_COLOR[pickup.kind];
  ctx.fillRect(pickup.x - 8, pickup.y - 8 + bob, 16, 16);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(pickup.x - 8, pickup.y - 8 + bob, 16, 3);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(PICKUP_ICON[pickup.kind], pickup.x, pickup.y + 1 + bob);
  ctx.textBaseline = 'alphabetic';
}

/** A delivery drone gone rogue: four rotors and one red eye. */
export function drawDrone(ctx: CanvasRenderingContext2D, drone: Drone, clock: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(drone.x + 4, drone.y + 9, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const y = drone.y + Math.sin(clock * 6 + drone.homeX) * 1.5;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(drone.x - 8, y - 8);
  ctx.lineTo(drone.x + 8, y + 8);
  ctx.moveTo(drone.x + 8, y - 8);
  ctx.lineTo(drone.x - 8, y + 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
  for (const [ox, oy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    ctx.beginPath();
    ctx.ellipse(drone.x + ox, y + oy, 5, 2, clock * 30 + ox, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#475569';
  ctx.fillRect(drone.x - 5, y - 5, 10, 10);
  ctx.fillStyle = drone.cool < 0.3 ? '#fecaca' : '#ef4444';
  ctx.beginPath();
  ctx.arc(drone.x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawShots(ctx: CanvasRenderingContext2D, shots: Shot[]): void {
  ctx.lineCap = 'round';
  for (const shot of shots) {
    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    const len = shot.blast ? 9 : shot.hostile ? 5 : 8;
    ctx.strokeStyle = shot.hostile ? '#f87171' : shot.blast ? '#fb923c' : '#fef08a';
    ctx.lineWidth = shot.blast ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(shot.x - (shot.vx / speed) * len, shot.y - (shot.vy / speed) * len);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// --- Markers ------------------------------------------------------------------------

export function drawPhone(ctx: CanvasRenderingContext2D, at: Point, ringing: boolean, clock: number): void {
  if (ringing) {
    for (let k = 0; k < 2; k++) {
      const t = (clock * 0.9 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.8 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 10 + t * 38, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const shake = ringing ? Math.sin(clock * 50) * 0.8 : 0;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(at.x - 5 + 3, at.y - 5 + 4, 11, 11);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(at.x - 6 + shake, at.y - 6, 12, 12);
  ctx.fillStyle = '#fecaca';
  ctx.fillRect(at.x - 4 + shake, at.y - 4, 8, 8);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(at.x - 0.5 + shake, at.y - 4, 1, 8);
  ctx.fillRect(at.x - 4 + shake, at.y - 0.5, 8, 1);
}

export function drawWash(ctx: CanvasRenderingContext2D, at: Point, clock: number, hot: boolean): void {
  ctx.fillStyle = hot ? `rgba(56, 189, 248, ${0.28 + 0.14 * Math.sin(clock * 6)})` : 'rgba(56, 189, 248, 0.14)';
  ctx.fillRect(at.x - 16, at.y - 16, 32, 32);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = (k + Math.floor(clock * 6)) % 2 ? '#38bdf8' : '#f0f9ff';
      ctx.fillRect(at.x - 16 + k * 8, at.y + side * 14 - 2, 8, 4);
    }
  }
}

export function drawMarker(ctx: CanvasRenderingContext2D, at: Point, r: number, color: string, clock: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -clock * 26;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.16 + 0.08 * Math.sin(clock * 5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The lighthouse's beam, sweeping the firth. */
export function drawBeam(ctx: CanvasRenderingContext2D, clock: number): void {
  const lot = CITY.lots.find(l => l.style === 'lighthouse');
  if (!lot) return;
  const x = lot.x0 * TILE + TILE / 2;
  const y = lot.y0 * TILE + TILE / 2;
  const a = clock * 0.9;
  const beam = ctx.createRadialGradient(x, y, 4, x, y, 230);
  beam.addColorStop(0, 'rgba(254, 249, 195, 0.5)');
  beam.addColorStop(1, 'rgba(254, 249, 195, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, 230, a - 0.16, a + 0.16);
  ctx.closePath();
  ctx.fill();
}

// --- Light and weather ----------------------------------------------------------------

/** Dusk, in screen space: a blue wash over the whole view. */
export function drawDusk(ctx: CanvasRenderingContext2D, dusk: number): void {
  if (dusk <= 0.01) return;
  ctx.fillStyle = `rgba(14, 18, 52, ${0.42 * dusk})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** Every driven car's headlights, in world space, cutting back through the dusk. */
export function drawHeadlights(ctx: CanvasRenderingContext2D, run: RunState, dusk: number): void {
  if (dusk <= 0.01) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const car of run.cars) {
    if (car.dead || car.driver === 'none') continue;
    const lx = car.x + Math.cos(car.angle) * 46;
    const ly = car.y + Math.sin(car.angle) * 46;
    const light = ctx.createRadialGradient(lx, ly, 2, lx, ly, 46);
    light.addColorStop(0, `rgba(254, 240, 170, ${0.34 * dusk})`);
    light.addColorStop(1, 'rgba(254, 240, 170, 0)');
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(lx, ly, 46, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Rain, in screen space: slanting streaks and a cold wash over everything. */
export function drawRain(ctx: CanvasRenderingContext2D, clock: number, amount: number): void {
  if (amount <= 0.01) return;
  ctx.fillStyle = `rgba(80, 110, 160, ${0.12 * amount})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.strokeStyle = `rgba(210, 228, 255, ${0.4 * amount})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const frame = Math.floor(clock * 30);
  for (let k = 0; k < 70; k++) {
    const x = hash01(k + frame * 131, 1) * (VIEW_W + 40) - 20;
    const y = hash01(k + frame * 131, 2) * VIEW_H;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 13);
  }
  ctx.stroke();
}

// --- Head-up ------------------------------------------------------------------------

/** The arrow round the player that points at whatever they are being sent to. */
export function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, cam: Camera, color: string, clock: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  // On screen already: the marker itself says where.
  if (d * cam.zoom < 120) return;
  const a = Math.atan2(dy, dx);
  const r = 58 + Math.sin(clock * 6) * 3;
  ctx.save();
  ctx.translate(VIEW_W / 2 + (from.x - cam.x) * cam.zoom + Math.cos(a) * r, VIEW_H / 2 + (from.y - cam.y) * cam.zoom + Math.sin(a) * r);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-7, -9);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-7, 9);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(8, 10, 20, 0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

export interface Hud {
  /** The current job's title, or empty. */
  job: string;
  /** A banner (a district's name, BUSTED) and how much of it is left, 0-1. */
  banner: string;
  bannerLeft: number;
  bannerColor: string;
  paused: string;
  signal: string;
  /** The bug bash's caption, or empty with none running. */
  bash: string;
}

export function drawHud(ctx: CanvasRenderingContext2D, run: RunState, hud: Hud, signal: number, clock: number): void {
  const job = run.job;
  if (job) {
    // The job's clock: a bar that drains, red for the last ten seconds.
    const frac = Math.max(0, job.timeLeft / job.def.time);
    const urgent = job.timeLeft < 10;
    ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
    roundRect(ctx, VIEW_W / 2 - 132, 8, 264, 30, 8);
    ctx.fill();
    ctx.fillStyle = urgent ? (Math.floor(clock * 5) % 2 ? '#f87171' : '#b91c1c') : '#facc15';
    roundRect(ctx, VIEW_W / 2 - 126, 28, Math.max(4, 252 * frac), 5, 2.5);
    ctx.fill();
    label(ctx, `${hud.job}  ${Math.ceil(Math.max(0, job.timeLeft))}s`, VIEW_W / 2, 19, 12, '#fff7ed');
  }
  if (signal > 0) {
    // The signal meter: what the pings say, for anyone playing with the sound off.
    const bars = 12;
    const lit = Math.round(signal * bars);
    ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
    roundRect(ctx, VIEW_W / 2 - 96, VIEW_H - 46, 192, 36, 8);
    ctx.fill();
    for (let k = 0; k < bars; k++) {
      ctx.fillStyle = k < lit ? (k > 8 ? '#4ade80' : k > 4 ? '#facc15' : '#38bdf8') : 'rgba(148, 163, 184, 0.3)';
      ctx.fillRect(VIEW_W / 2 - 84 + k * 14, VIEW_H - 18 - (6 + k * 1.4), 10, 6 + k * 1.4);
    }
    label(ctx, hud.signal, VIEW_W / 2, VIEW_H - 38, 9, '#e0f2fe');
  }
  // Health, and the gun in hand with what is left in it: top left, clear of the toasts along the bottom.
  const hp = Math.max(0, run.player.hp) / PLAYER_HP;
  ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
  roundRect(ctx, 8, 8, 150, 22, 6);
  ctx.fill();
  ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#f87171';
  ctx.fillRect(30, 16, 54 * hp, 6);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(29.5, 15.5, 55, 7);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('❤', 13, 20);
  const gun = run.player.weapon;
  if (gun) ctx.fillText(`${WEAPON_ICON[gun]} ${run.player.ammo[gun] ?? 0}`, 96, 20);
  ctx.textBaseline = 'alphabetic';
  if (run.bash) {
    ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
    roundRect(ctx, VIEW_W - 178, 8, 170, 22, 6);
    ctx.fill();
    label(ctx, `${hud.bash} ${run.bash.left} · ${Math.ceil(run.bash.timeLeft)}s`, VIEW_W - 93, 19, 11, '#fdba74');
  }
  if (run.bust > 0.05) {
    const frac = Math.min(1, run.bust / BUST_FILL);
    ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
    ctx.fillRect(VIEW_W / 2 - 42, VIEW_H / 2 - 40, 84, 8);
    ctx.fillStyle = Math.floor(clock * 8) % 2 ? '#ef4444' : '#3b82f6';
    ctx.fillRect(VIEW_W / 2 - 40, VIEW_H / 2 - 38, 80 * frac, 4);
  }
  if (hud.bannerLeft > 0) label(ctx, hud.banner, VIEW_W / 2, 78, 26, hud.bannerColor, Math.min(1, hud.bannerLeft * 2.5));
  if (hud.paused) {
    ctx.fillStyle = 'rgba(8, 10, 20, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    label(ctx, hud.paused, VIEW_W / 2, VIEW_H / 2, 30, '#f8fafc');
  }
}

/** The touch stick, drawn where the thumb went down. */
export function drawStick(ctx: CanvasRenderingContext2D, origin: Point | null, at: Point | null): void {
  if (!origin || !at) return;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(at.x, at.y, 14, 0, Math.PI * 2);
  ctx.fill();
}
