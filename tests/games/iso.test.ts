import { describe, it, expect } from 'vitest';
import {
  isoProject,
  isoUnproject,
  isoTileFromPoint,
  shadeColor,
  forEachTileBackToFront,
  type IsoView
} from '../../src/games/engine/iso';

const view: IsoView = { halfW: 20, halfH: 10, originX: 280, originY: 60 };

describe('iso projection', () => {
  it('round-trips arbitrary tile coordinates', () => {
    for (const [tx, ty] of [[0, 0], [5.5, 3.25], [23, 13], [0.1, 13.9]]) {
      const p = isoProject(view, tx, ty);
      const back = isoUnproject(view, p.x, p.y);
      expect(back.tx).toBeCloseTo(tx, 6);
      expect(back.ty).toBeCloseTo(ty, 6);
    }
  });

  it('maps the origin tile corner to the view origin', () => {
    expect(isoProject(view, 0, 0)).toEqual({ x: 280, y: 60 });
  });

  it('picks the tile whose centre is clicked', () => {
    for (const [x, y] of [[0, 0], [7, 4], [23, 13]]) {
      const centre = isoProject(view, x + 0.5, y + 0.5);
      expect(isoTileFromPoint(view, centre.x, centre.y, 24, 14)).toBe(y * 24 + x);
    }
  });

  it('returns -1 outside the diamond', () => {
    expect(isoTileFromPoint(view, 0, 0, 24, 14)).toBe(-1);
    const outside = isoProject(view, -0.5, 3);
    expect(isoTileFromPoint(view, outside.x, outside.y, 24, 14)).toBe(-1);
  });
});

describe('shadeColor', () => {
  it('darkens, brightens, and clamps channels', () => {
    expect(shadeColor('#808080', 0.5)).toBe('rgb(64, 64, 64)');
    expect(shadeColor('#808080', 1.5)).toBe('rgb(192, 192, 192)');
    expect(shadeColor('#ffffff', 2)).toBe('rgb(255, 255, 255)');
    expect(shadeColor('#000000', 0.5)).toBe('rgb(0, 0, 0)');
  });
});

describe('forEachTileBackToFront', () => {
  it('visits every tile exactly once in non-decreasing diagonal order', () => {
    const seen: number[] = [];
    let lastDiag = -1;
    forEachTileBackToFront(4, 3, (x, y, i, diag) => {
      expect(diag).toBe(x + y);
      expect(diag).toBeGreaterThanOrEqual(lastDiag);
      lastDiag = diag;
      seen.push(i);
    });
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });
});
