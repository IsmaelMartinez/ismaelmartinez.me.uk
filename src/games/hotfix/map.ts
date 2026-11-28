/**
 * HOTFIX's city: one authored town, built by code so it is the same on every
 * run. It is the owner's two homes laid side by side: a grey stone old town
 * in the west with a castle on its rock and a park with a hill in it, a grid
 * of chamfered courtyard blocks around a basilica in the middle, and a
 * working port in the east, all under a firth along the north edge.
 *
 * DOM-free. The grid is the single source for collision (`solidAt`), for the
 * traffic's road graph (`NODES`, `EDGES`), for where jobs start and end
 * (`PLACES`, `PHONES`) and for what the renderer paints.
 */
import { hash01 } from '../engine/canvas';
import { bfsFrom, type BfsResult } from '../engine/pathfind';

export const TILE = 32;
export const COLS = 60;
export const ROWS = 44;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const T = {
  Water: 0,
  Road: 1,
  Pave: 2,
  Building: 3,
  Grass: 4,
  Tree: 5,
  Plaza: 6,
  Quay: 7,
  Lane: 8,
  Rock: 9,
  Yard: 10
} as const;
export type Tile = (typeof T)[keyof typeof T];

const SOLID = new Set<number>([T.Water, T.Building, T.Tree, T.Rock, T.Yard]);

/** Left tile column of each north-south road (roads are two tiles wide). */
export const ROAD_X = [2, 12, 22, 32, 44, 56] as const;
/** Top tile row of each east-west road. */
export const ROAD_Y = [5, 14, 23, 32, 40] as const;

export type District = 'old' | 'eix' | 'port';
/** District names are proper nouns, the same in every locale. */
export const DISTRICT_NAMES: Record<District, string> = {
  old: 'AULD TOUN',
  eix: "L'EIXAMPLE",
  port: 'EL PUERTO'
};

/** The district a pixel column is in: the city's three run west to east. */
export function districtAt(x: number): District {
  const tx = x / TILE;
  return tx < 23 ? 'old' : tx < 45 ? 'eix' : 'port';
}

/** Roof styles the renderer knows how to paint. */
export type LotStyle =
  | 'slate'
  | 'terracotta'
  | 'shed'
  | 'container'
  | 'castle'
  | 'basilica'
  | 'lighthouse'
  | 'datacentre'
  | 'market'
  | 'nick'
  | 'pub'
  | 'hall'
  | 'clinic'
  | 'edge';

export interface Lot {
  style: LotStyle;
  /** 0-1, for the renderer's per-lot colour variety. */
  tint: number;
  /** The lot's bounding box in tiles, inclusive; empty (x1 < x0) for a lot with no tiles. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoadNode {
  id: number;
  /** Grid position in the road lattice. */
  i: number;
  j: number;
  /** Centre of the crossing, in pixels. */
  x: number;
  y: number;
  /** Ids of the nodes a road leads to from here. */
  links: number[];
}

export type PlaceId =
  | 'home'
  | 'castle'
  | 'pub'
  | 'seat'
  | 'basilica'
  | 'mercat'
  | 'lighthouse'
  | 'docks'
  | 'datacentre'
  | 'nick'
  | 'hall'
  | 'clinic';

export interface Point {
  x: number;
  y: number;
}

/** What a crate on the street holds: a gun, a coffee (health), or a bug bash. */
export type PickupKind = 'pistol' | 'smg' | 'rocket' | 'coffee' | 'bash';

export interface ParkedSpot extends Point {
  angle: number;
}

export interface CityMap {
  tiles: Uint8Array;
  lotAt: Int16Array;
  lots: Lot[];
  nodes: RoadNode[];
  places: Record<PlaceId, Point>;
  phones: Point[];
  washes: Point[];
  parked: ParkedSpot[];
  pickups: (Point & { kind: PickupKind })[];
  /** Pavement tiles, for spawning people. */
  pavements: number[];
  /** Road tiles, for spawning bugs. */
  roads: number[];
}

const centre = (tx: number, ty: number): Point => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** The two road edges the city leaves out: the park swallows one, the campus the other. */
const isRemoved = (horizontal: boolean, i: number, j: number): boolean =>
  horizontal ? i === 1 && j === 2 : i === 4 && j === 3;

function build(): CityMap {
  const tiles = new Uint8Array(COLS * ROWS).fill(T.Building);
  const lotAt = new Int16Array(COLS * ROWS).fill(-1);
  const lots: Lot[] = [];
  const idx = (x: number, y: number) => y * COLS + x;
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) tiles[idx(x, y)] = t;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, t: Tile) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
  };
  const newLot = (style: LotStyle, salt: number): number => {
    lots.push({ style, tint: hash01(lots.length * 7 + salt, 11), x0: COLS, y0: ROWS, x1: -1, y1: -1 });
    return lots.length - 1;
  };
  /** Marks a rectangle as one building of `style`. */
  const building = (x0: number, y0: number, x1: number, y1: number, style: LotStyle) => {
    const id = newLot(style, x0 * 31 + y0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        set(x, y, style === 'castle' ? T.Rock : T.Building);
        lotAt[idx(x, y)] = id;
      }
    }
  };
  /** Splits a rectangle of buildings into lots no bigger than 3 tiles a side. */
  const subdivide = (x0: number, y0: number, x1: number, y1: number, style: LotStyle, depth = 0) => {
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    if (w <= 3 && h <= 3 && (depth > 0 || w * h <= 6)) {
      building(x0, y0, x1, y1, style);
      return;
    }
    const roll = hash01(x0 * 13 + y0 * 7 + depth, 3);
    if (w >= h) {
      const cut = x0 + 1 + Math.floor(roll * (w - 2));
      subdivide(x0, y0, cut, y1, style, depth + 1);
      subdivide(cut + 1, y0, x1, y1, style, depth + 1);
    } else {
      const cut = y0 + 1 + Math.floor(roll * (h - 2));
      subdivide(x0, y0, x1, cut, style, depth + 1);
      subdivide(x0, cut + 1, x1, y1, style, depth + 1);
    }
  };

  // The edge of the world: one lot, so it reads as a wall of anonymous town.
  const edge = newLot('edge', 0);
  lotAt.fill(edge);

  // The firth, the promenade under it, and the pier the lighthouse stands on.
  rect(0, 0, COLS - 1, 3, T.Water);
  rect(2, 4, 57, 4, T.Pave);
  rect(49, 1, 51, 3, T.Quay);

  // Roads, one edge of the lattice at a time, so a removed edge leaves no tarmac.
  const nodes: RoadNode[] = [];
  const nodeId = (i: number, j: number) => j * ROAD_X.length + i;
  ROAD_Y.forEach((ry, j) => {
    ROAD_X.forEach((rx, i) => {
      nodes.push({ id: nodeId(i, j), i, j, x: (rx + 1) * TILE, y: (ry + 1) * TILE, links: [] });
    });
  });
  const link = (a: number, b: number) => {
    nodes[a].links.push(b);
    nodes[b].links.push(a);
  };
  for (let j = 0; j < ROAD_Y.length; j++) {
    for (let i = 0; i < ROAD_X.length - 1; i++) {
      if (isRemoved(true, i, j)) continue;
      rect(ROAD_X[i], ROAD_Y[j], ROAD_X[i + 1] + 1, ROAD_Y[j] + 1, T.Road);
      link(nodeId(i, j), nodeId(i + 1, j));
    }
  }
  for (let i = 0; i < ROAD_X.length; i++) {
    for (let j = 0; j < ROAD_Y.length - 1; j++) {
      if (isRemoved(false, i, j)) continue;
      rect(ROAD_X[i], ROAD_Y[j], ROAD_X[i] + 1, ROAD_Y[j + 1] + 1, T.Road);
      link(nodeId(i, j), nodeId(i, j + 1));
    }
  }

  /** A block of buildings: a ring of pavement around lots. */
  const block = (x0: number, y0: number, x1: number, y1: number, style: LotStyle) => {
    rect(x0, y0, x1, y1, T.Pave);
    subdivide(x0 + 1, y0 + 1, x1 - 1, y1 - 1, style);
  };
  /** An Eixample block: pavement, a ring of flats, a courtyard garden. */
  const courtyard = (x0: number, y0: number, x1: number, y1: number) => {
    block(x0, y0, x1, y1, 'terracotta');
    rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, T.Yard);
    for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) lotAt[idx(x, y)] = -1;
  };
  const bx = (i: number): [number, number] => [ROAD_X[i] + 2, ROAD_X[i + 1] - 1];
  const by = (j: number): [number, number] => [ROAD_Y[j] + 2, ROAD_Y[j + 1] - 1];

  // --- Auld Toun -------------------------------------------------------------
  block(...([bx(0)[0], by(0)[0], bx(0)[1], by(0)[1]] as const), 'slate');
  rect(8, 7, 8, 13, T.Lane); // a close cutting through the tenements
  // The castle on its rock.
  rect(bx(0)[0], by(1)[0], bx(0)[1], by(1)[1], T.Pave);
  building(5, 17, 10, 21, 'castle');
  block(bx(0)[0], by(2)[0], bx(0)[1], by(2)[1], 'slate');
  rect(4, 28, 11, 28, T.Lane); // the wynd with the car wash in it
  block(bx(0)[0], by(3)[0], bx(0)[1], by(3)[1], 'slate');
  block(bx(1)[0], by(0)[0], bx(1)[1], by(0)[1], 'slate');
  building(16, 11, 18, 12, 'pub');
  block(bx(1)[0], by(3)[0], bx(1)[1], by(3)[1], 'slate');

  // The park: two blocks and the road between them, with paths, a pond and a hill.
  rect(14, 16, 21, 31, T.Grass);
  for (let y = 16; y <= 31; y++) {
    for (let x = 14; x <= 21; x++) {
      const nearSeat = Math.abs(x - 19) <= 1 && Math.abs(y - 19) <= 1;
      if (!nearSeat && hash01(x * 53 + y * 17, 5) < 0.22) set(x, y, T.Tree);
    }
  }
  rect(17, 16, 17, 31, T.Plaza);
  rect(14, 23, 21, 24, T.Plaza);
  rect(15, 27, 16, 28, T.Water);

  // --- L'Eixample ------------------------------------------------------------
  courtyard(bx(2)[0], by(0)[0], bx(2)[1], by(0)[1]);
  building(26, 12, 28, 12, 'clinic');
  // The basilica in its square.
  rect(bx(2)[0], by(1)[0], bx(2)[1], by(1)[1], T.Plaza);
  building(27, 17, 28, 20, 'basilica');
  {
    const id = lotAt[idx(27, 17)];
    for (const [x, y] of [[26, 18], [26, 19], [29, 18], [29, 19]]) {
      set(x, y, T.Building);
      lotAt[idx(x, y)] = id;
    }
  }
  for (const [x, y] of [[25, 17], [30, 17], [25, 21], [30, 21]]) set(x, y, T.Tree);
  courtyard(bx(2)[0], by(2)[0], bx(2)[1], by(2)[1]);
  courtyard(bx(2)[0], by(3)[0], bx(2)[1], by(3)[1]);
  building(26, 35, 28, 35, 'hall');
  courtyard(bx(3)[0], by(0)[0], bx(3)[1], by(0)[1]);
  // The market hall fills its block.
  rect(bx(3)[0], by(1)[0], bx(3)[1], by(1)[1], T.Pave);
  building(35, 17, 42, 21, 'market');
  courtyard(bx(3)[0], by(2)[0], bx(3)[1], by(2)[1]);

  // --- El Puerto -------------------------------------------------------------
  // The docks: open quay with container stacks.
  rect(bx(4)[0], by(0)[0], bx(4)[1], by(0)[1], T.Quay);
  for (const [x0, y0, x1, y1] of [
    [47, 8, 48, 9],
    [51, 8, 53, 9],
    [47, 11, 49, 12],
    [52, 11, 53, 12]
  ]) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) building(x, y, x, y, 'container');
  }
  block(bx(4)[0], by(1)[0], bx(4)[1], by(1)[1], 'shed');
  block(bx(4)[0], by(2)[0], bx(4)[1], by(2)[1], 'shed');
  building(47, 27, 49, 29, 'nick');
  // The campus: the data centre's two halls on open tarmac.
  rect(34, 34, 55, 39, T.Quay);
  building(36, 35, 41, 38, 'datacentre');
  building(47, 35, 53, 38, 'datacentre');
  building(50, 1, 50, 1, 'lighthouse');

  const pavements: number[] = [];
  const roads: number[] = [];
  lotAt.forEach((id, i) => {
    const t = tiles[i];
    if (id < 0 || id === edge || (t !== T.Building && t !== T.Rock)) return;
    const lot = lots[id];
    lot.x0 = Math.min(lot.x0, i % COLS);
    lot.x1 = Math.max(lot.x1, i % COLS);
    lot.y0 = Math.min(lot.y0, Math.floor(i / COLS));
    lot.y1 = Math.max(lot.y1, Math.floor(i / COLS));
  });
  tiles.forEach((t, i) => {
    if (t === T.Pave) pavements.push(i);
    if (t === T.Road) roads.push(i);
  });

  return {
    tiles,
    lotAt,
    lots,
    nodes,
    places: {
      home: centre(6, 34),
      castle: centre(11, 19),
      pub: centre(17, 13),
      seat: centre(19, 19),
      basilica: centre(28, 21),
      mercat: centre(38, 16),
      lighthouse: centre(50, 3),
      docks: centre(50, 10),
      datacentre: centre(44, 37),
      nick: centre(46, 28),
      hall: centre(27, 34),
      clinic: centre(27, 13)
    },
    phones: [centre(4, 7), centre(21, 13), centre(24, 25), centre(43, 31), centre(46, 16), centre(14, 34), centre(34, 7)],
    washes: [centre(7, 28), centre(55, 10)],
    parked: [
      { ...centre(8, 34), angle: 0 },
      { ...centre(8, 10), angle: Math.PI / 2 },
      { ...centre(25, 19), angle: -Math.PI / 2 },
      { ...centre(30, 19), angle: Math.PI / 2 },
      { ...centre(46, 10), angle: Math.PI / 2 },
      { ...centre(54, 13), angle: Math.PI },
      { ...centre(43, 35), angle: Math.PI / 2 },
      { ...centre(45, 39), angle: 0 },
      // On the wide cross path: the path up through the park is one car wide, and a car left on it is a cork.
      { ...centre(15, 24), angle: 0 },
      { ...centre(20, 4), angle: 0 },
      { ...centre(40, 4), angle: Math.PI },
      { ...centre(10, 28), angle: 0 }
    ],
    pickups: [
      { ...centre(10, 34), kind: 'pistol' },
      { ...centre(17, 20), kind: 'pistol' },
      { ...centre(31, 25), kind: 'pistol' },
      { ...centre(11, 7), kind: 'smg' },
      { ...centre(43, 13), kind: 'smg' },
      { ...centre(46, 31), kind: 'smg' },
      { ...centre(51, 2), kind: 'rocket' },
      { ...centre(9, 16), kind: 'rocket' },
      { ...centre(14, 13), kind: 'coffee' },
      { ...centre(34, 25), kind: 'coffee' },
      { ...centre(55, 34), kind: 'coffee' },
      { ...centre(4, 25), kind: 'coffee' },
      { ...centre(24, 22), kind: 'bash' },
      { ...centre(50, 13), kind: 'bash' }
    ],
    pavements,
    roads
  };
}

/** The one city. Built once at import; nothing mutates it. */
export const CITY: CityMap = build();

export function tileAt(tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T.Building;
  return CITY.tiles[ty * COLS + tx] as Tile;
}

export const isSolidTile = (tx: number, ty: number): boolean => SOLID.has(tileAt(tx, ty));

/** True where nothing can stand or drive, in pixels. */
export const solidAt = (x: number, y: number): boolean => isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE));

/** How well tyres hold on the surface under a point: grass and cobbles are loose. */
export function surfaceGrip(x: number, y: number): number {
  const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === T.Grass ? 0.55 : t === T.Lane ? 0.85 : 1;
}

/** The node whose crossing is nearest a point. */
export function nearestNode(x: number, y: number): RoadNode {
  let best = CITY.nodes[0];
  let bestD = Infinity;
  for (const n of CITY.nodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Breadth-first route over the road lattice, as node ids from `from` to `to` inclusive. */
export function route(from: number, to: number): number[] {
  if (from === to) return [from];
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift() as number;
    for (const next of CITY.nodes[at].links) {
      if (prev.has(next)) continue;
      prev.set(next, at);
      if (next === to) {
        const path = [to];
        let p = at;
        while (p !== -1) {
          path.unshift(p);
          p = prev.get(p) as number;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [from];
}

/**
 * True when a straight line between two points crosses nothing solid. With a
 * `width`, the line is a strip that wide to either side, so a car that
 * follows it does not clip the corner it was sighted past.
 */
export function clearLine(ax: number, ay: number, bx: number, by: number, width = 0): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / (TILE / 2));
  const px = dist ? (-(by - ay) / dist) * width : 0;
  const py = dist ? ((bx - ax) / dist) * width : 0;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (solidAt(x, y)) return false;
    if (width && (solidAt(x + px, y + py) || solidAt(x - px, y - py))) return false;
  }
  return true;
}

const open = (i: number): boolean => !SOLID.has(CITY.tiles[i]);
const fields = new Map<number, BfsResult>();

/** Steps to a tile from everywhere, through the shared BFS; the last few targets are kept. */
function fieldTo(tile: number): BfsResult {
  let field = fields.get(tile);
  if (!field) {
    field = bfsFrom(COLS, ROWS, open, tile);
    if (fields.size >= 32) fields.delete(fields.keys().next().value as number);
    fields.set(tile, field);
  }
  return field;
}

/**
 * The point to steer at now to reach a target round the buildings: the target
 * itself when it is in plain sight, else the furthest tile along the shortest
 * open route that is. It is what the police chase with, and what the test
 * bot drives by. `width` is half the width of whatever is following it.
 */
export function wayTo(fromX: number, fromY: number, toX: number, toY: number, width: number): Point {
  if (clearLine(fromX, fromY, toX, toY, width)) return { x: toX, y: toY };
  const tileOf = (x: number, y: number) =>
    Math.min(ROWS - 1, Math.max(0, Math.floor(y / TILE))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(x / TILE)));
  const field = fieldTo(tileOf(toX, toY));
  let at = tileOf(fromX, fromY);
  if (field.dist[at] < 0) return { x: toX, y: toY };
  let best: Point | null = null;
  // The field was grown from the target, so each tile's parent is the next step towards it.
  for (let step = 0; step < 18 && field.parent[at] !== -1; step++) {
    at = field.parent[at];
    const p = { x: (at % COLS) * TILE + TILE / 2, y: Math.floor(at / COLS) * TILE + TILE / 2 };
    if (clearLine(fromX, fromY, p.x, p.y, width)) best = p;
    else if (best) break;
  }
  return best ?? { x: toX, y: toY };
}
