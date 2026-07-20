import { describe, it, expect } from 'vitest';
import {
  isoProject,
  isoUnproject,
  isoTileFromPoint,
  shadeColor,
  blockFaceCorners,
  blockSeamPath,
  faceBandPath,
  forEachTileBackToFront,
  rotateTile,
  rotateDir,
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

describe('rotateDir', () => {
  it('agrees with rotateTile: a world step in dir becomes a view step in rotateDir(dir, rot)', () => {
    // N/E/S/W step deltas matching the direction indices (0=N … 3=W).
    const DELTA = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }
    ];
    const w = 24;
    const h = 14; // non-square, like Pixel Park
    for (let rot = 0; rot < 4; rot++) {
      for (let dir = 0; dir < 4; dir++) {
        const from = rotateTile(5, 5, w, h, rot);
        const to = rotateTile(5 + DELTA[dir].dx, 5 + DELTA[dir].dy, w, h, rot);
        const viewDelta = DELTA[rotateDir(dir, rot)];
        expect({ dx: to.x - from.x, dy: to.y - from.y }).toEqual(viewDelta);
      }
    }
  });

  it('wraps negative rotations', () => {
    expect(rotateDir(0, -1)).toBe(3);
    expect(rotateDir(3, -3)).toBe(0);
    expect(rotateDir(2, 6)).toBe(0);
  });
});

describe('blockFaceCorners', () => {
  it('projects the four inset footprint corners', () => {
    const c = blockFaceCorners(view, 3, 5, 0.1);
    expect(c.n).toEqual(isoProject(view, 3.1, 5.1));
    expect(c.e).toEqual(isoProject(view, 3.9, 5.1));
    expect(c.s).toEqual(isoProject(view, 3.9, 5.9));
    expect(c.w).toEqual(isoProject(view, 3.1, 5.9));
  });

  it('defaults to drawBlock’s 0.08 inset', () => {
    expect(blockFaceCorners(view, 2, 2)).toEqual(blockFaceCorners(view, 2, 2, 0.08));
  });
});

describe('blockSeamPath', () => {
  it('appends the W→S→E polyline raised by z', () => {
    const c = blockFaceCorners(view, 4, 4, 0.1);
    const ops: unknown[] = [];
    const ctx = {
      moveTo: (x: number, y: number) => ops.push(['moveTo', x, y]),
      lineTo: (x: number, y: number) => ops.push(['lineTo', x, y])
    } as unknown as CanvasRenderingContext2D;
    blockSeamPath(ctx, c, 7);
    expect(ops).toEqual([
      ['moveTo', c.w.x, c.w.y - 7],
      ['lineTo', c.s.x, c.s.y - 7],
      ['lineTo', c.e.x, c.e.y - 7]
    ]);
  });
});

describe('faceBandPath', () => {
  const recorder = () => {
    const ops: unknown[] = [];
    const ctx = {
      moveTo: (x: number, y: number) => ops.push(['moveTo', x, y]),
      lineTo: (x: number, y: number) => ops.push(['lineTo', x, y]),
      closePath: () => ops.push(['closePath'])
    } as unknown as CanvasRenderingContext2D;
    return { ops, ctx };
  };

  it('spans t0–t1 along one edge between two lifts', () => {
    const { ops, ctx } = recorder();
    const a = { x: 10, y: 40 };
    const b = { x: 50, y: 60 };
    faceBandPath(ctx, a, b, 0.25, 0.75, 2, 6);
    expect(ops).toEqual([
      ['moveTo', 20, 43],
      ['lineTo', 40, 53],
      ['lineTo', 40, 49],
      ['lineTo', 20, 39],
      ['closePath']
    ]);
  });

  it('closes along a second far edge when given one (awning form)', () => {
    const { ops, ctx } = recorder();
    const a = { x: 0, y: 0 };
    const b = { x: 8, y: 4 };
    const aOut = { x: -2, y: 6 };
    const bOut = { x: 10, y: 12 };
    faceBandPath(ctx, a, b, 0, 0.5, 10, 5, aOut, bOut);
    expect(ops).toEqual([
      ['moveTo', 0, -10],
      ['lineTo', 4, -8],
      ['lineTo', 4, 4],
      ['lineTo', -2, 1],
      ['closePath']
    ]);
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
