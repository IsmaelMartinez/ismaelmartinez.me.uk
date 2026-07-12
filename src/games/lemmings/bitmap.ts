/**
 * Per-pixel solidity terrain for Critter Rescue.
 *
 * Unlike Tank Duel's heightmap, a Lemmings-style level needs overhangs and
 * tunnels, so terrain is a solidity grid: every cell is `AIR` (empty) or a
 * solid material (`EARTH` or a builder `BRIDGE`). A cell counts as solid when
 * its material is non-zero — mirroring the design's "offscreen canvas where
 * alpha > 0 is solid", but kept DOM-free (a `Uint8Array`) so it unit-tests
 * without a canvas.
 *
 * Diggers and bashers erase cells (`AIR`); builders lay `BRIDGE` cells.
 * Collision queries read the grid directly — it *is* the cached solidity map,
 * the array-native equivalent of caching a canvas's `ImageData`. Terrain edits
 * bump `version`, which is how the renderer knows to rebuild its offscreen
 * image (edits are rare relative to queries).
 */

export const AIR = 0;
export const EARTH = 1;
export const BRIDGE = 2;

export type Material = typeof AIR | typeof EARTH | typeof BRIDGE;

export class TerrainBitmap {
  readonly width: number;
  readonly height: number;
  private readonly cells: Uint8Array;
  private _version = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
  }

  /** Bumped on every terrain edit; the renderer redraws when it changes. */
  get version(): number {
    return this._version;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Material at a cell, or `AIR` outside the field. */
  materialAt(x: number, y: number): Material {
    if (!this.inBounds(x, y)) return AIR;
    return this.cells[y * this.width + x] as Material;
  }

  /**
   * Whether a cell blocks a critter. Everything outside the field reads as
   * empty air, so critters fall off the bottom and walk to the side edges —
   * levels wall themselves in with terrain where they need a boundary.
   */
  solid(x: number, y: number): boolean {
    return this.materialAt(x, y) !== AIR;
  }

  setMaterial(x: number, y: number, material: Material): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    if (this.cells[i] === material) return;
    this.cells[i] = material;
    this._version++;
  }

  /** Fills an axis-aligned block, clipped to the field. */
  fillRect(x: number, y: number, w: number, h: number, material: Material = EARTH): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    let touched = false;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) {
        if (this.cells[row + xx] !== material) {
          this.cells[row + xx] = material;
          touched = true;
        }
      }
    }
    if (touched) this._version++;
  }

  /** Clears an axis-aligned block to air (digger/basher swathes). */
  eraseRect(x: number, y: number, w: number, h: number): void {
    this.fillRect(x, y, w, h, AIR);
  }

  /** Clears a filled disc to air (used for explosion-style effects / nuke). */
  eraseCircle(cx: number, cy: number, r: number): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let touched = false;
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r2 && this.cells[row + xx] !== AIR) {
          this.cells[row + xx] = AIR;
          touched = true;
        }
      }
    }
    if (touched) this._version++;
  }

  /** Lays a horizontal run of bridge cells (one builder tread). */
  buildRow(x: number, y: number, w: number): void {
    this.fillRect(x, y, w, 1, BRIDGE);
  }

  /** Read-only view of the raw material grid, for rendering. */
  get data(): Uint8Array {
    return this.cells;
  }
}
