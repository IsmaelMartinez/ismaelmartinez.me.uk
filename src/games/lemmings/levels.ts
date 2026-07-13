/**
 * Level authoring for Critter Rescue.
 *
 * Levels are pure vector descriptions — axis-aligned rects and ramps plus a
 * hatch and an exit — rasterised onto a fresh `TerrainBitmap` at load, so there
 * are no image assets. Each level also carries its spawn count, rescue quota,
 * and the per-skill stock the player gets to spend.
 *
 * The twenty levels are hand-tuned so each of the five skills is the natural
 * (and roughly necessary) tool on at least one of them: walk-only, basher,
 * builder, digger, floater, a mid-game finale that chains several together,
 * then three that chain skills in fresh ways — a blocker-gated dig, a
 * builder-then-basher climb, and a floater-drop-into-dig route — a
 * four-level gauntlet (a two-builder bridge over a gorge, a dig-then-build
 * descent, an umbrella drop into a walled pit, and a grand tour that chains
 * float, bash, and build in one trek), and a closing seven that twist the
 * rules themselves: a second hatch (`hatch2`, spawns alternate between the
 * two), a level timer (`timeLimit` ticks — the level ends when it runs out),
 * and steel terrain (`material: 'steel'` rects that no skill can cut).
 */
import { TerrainBitmap, EARTH, STEEL } from './bitmap';
import type { Skill, Critter } from './critter';
import type { TranslationKey } from '../../i18n/translations';

export const LEVEL_W = 320;
export const LEVEL_H = 200;

// Exit-door footprint (feet must land inside it), and hatch draw width.
export const EXIT_HALF_W = 8;
export const EXIT_H = 22;
export const HATCH_W = 20;

export type Shape =
  /** Axis-aligned block; `material: 'steel'` makes it indestructible. */
  | { kind: 'rect'; x: number; y: number; w: number; h: number; material?: 'earth' | 'steel' }
  /** Right triangle; `high` says which side reaches full height `h`. */
  | { kind: 'ramp'; x: number; y: number; w: number; h: number; high: 'left' | 'right' };

export interface Hatch {
  x: number;
  y: number;
  dir: 1 | -1;
}

export interface LevelDef {
  shapes: Shape[];
  /** Trapdoor: critters spawn here (as fallers) facing `dir`. */
  hatch: Hatch;
  /** Optional second trapdoor: spawns alternate between the two hatches. */
  hatch2?: Hatch;
  /** Rescue door: feet reaching here are saved. `y` is the floor surface. */
  exit: { x: number; y: number };
  spawnCount: number;
  needed: number;
  stock: Partial<Record<Skill, number>>;
  /**
   * Par time in simulation ticks (60/s) for the speed bonus: clearing the
   * level faster than this earns points on a sliding scale (see score.ts).
   * Tuned generously — roughly the time a first clear at the default release
   * rate takes, so a decisive replay always beats it.
   */
  par: number;
  /**
   * Optional hard clock in simulation ticks (60/s): when it runs out the level
   * ends immediately with whatever has been rescued so far. Tuned so a player
   * who cranks the release rate clears comfortably — the timer punishes
   * trickling, not playing.
   */
  timeLimit?: number;
  /**
   * Optional one-line nudge shown under the field while the level plays. The
   * value is an i18n key (resolved in `translations.ts`), not raw text, so the
   * level layer stays locale-agnostic; the page hands the resolved strings to
   * the game via `data-t-hint<index>` attributes. Typed as `TranslationKey`
   * (the English table's keys) so a typo fails the build; the locale-parity
   * test guarantees the same key exists in every locale. Given to the trickier
   * later levels whose skill chain isn't obvious at a glance.
   */
  hint?: TranslationKey;
}

function paintShape(bmp: TerrainBitmap, shape: Shape): void {
  if (shape.kind === 'rect') {
    bmp.fillRect(shape.x, shape.y, shape.w, shape.h, shape.material === 'steel' ? STEEL : EARTH);
    return;
  }
  // Ramp: each column is filled from a sloping top down to the base.
  for (let i = 0; i < shape.w; i++) {
    const t = shape.high === 'right' ? (i + 1) / shape.w : (shape.w - i) / shape.w;
    const colH = Math.max(1, Math.round(shape.h * t));
    bmp.fillRect(shape.x + i, shape.y + shape.h - colH, 1, colH);
  }
}

/** Every hatch a level spawns from — the primary plus the optional second. */
export function levelHatches(def: LevelDef): Hatch[] {
  return def.hatch2 ? [def.hatch, def.hatch2] : [def.hatch];
}

/** Rasterises a level's shapes onto a fresh bitmap. */
export function buildLevel(def: LevelDef): TerrainBitmap {
  const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
  for (const shape of def.shapes) paintShape(bmp, shape);
  return bmp;
}

/**
 * Whether a critter's feet are inside the exit door. `exit.y` is the door's
 * base on the floor, so the opening spans up to `EXIT_H` above it; the small
 * downward slack absorbs pixel rounding without reaching below the floor.
 */
export function atExit(c: Critter, def: LevelDef): boolean {
  return (
    Math.abs(c.x - def.exit.x) <= EXIT_HALF_W &&
    c.y <= def.exit.y + 2 &&
    c.y >= def.exit.y - EXIT_H
  );
}

export const LEVELS: LevelDef[] = [
  // 1 — First Steps: a flat stroll, so the player meets spawn → exit.
  {
    shapes: [{ kind: 'rect', x: 0, y: 160, w: 320, h: 40 }],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 290, y: 159 },
    spawnCount: 8,
    needed: 4,
    stock: { builder: 2, digger: 1, basher: 1, floater: 2, blocker: 2 },
    par: 2400
  },
  // 2 — Over the Wall: a pillar too tall to climb; bash straight through it.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 320, h: 40 },
      { kind: 'rect', x: 0, y: 120, w: 6, h: 40 },
      { kind: 'rect', x: 150, y: 100, w: 16, h: 60 }
    ],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 292, y: 159 },
    spawnCount: 10,
    needed: 5,
    stock: { basher: 3, blocker: 2, builder: 2 },
    par: 3000
  },
  // 3 — Step Up: the exit sits on a ledge too tall to climb; build a ramp of
  // treads up to it and the whole crowd follows the staircase home.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 320, h: 40 },
      { kind: 'rect', x: 0, y: 120, w: 8, h: 40 },
      { kind: 'rect', x: 240, y: 148, w: 80, h: 52 }
    ],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 292, y: 147 },
    spawnCount: 10,
    needed: 4,
    stock: { builder: 4, blocker: 2 },
    par: 3000
  },
  // 4 — Dig Down: a sealed upper hall over a lower one; a digger opens the
  // floor so the crowd drops through to the exit below.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 120, w: 320, h: 24 },
      { kind: 'rect', x: 0, y: 86, w: 8, h: 58 },
      { kind: 'rect', x: 312, y: 86, w: 8, h: 58 },
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 160, w: 6, h: 40 },
      { kind: 'rect', x: 314, y: 160, w: 6, h: 40 }
    ],
    hatch: { x: 160, y: 80, dir: 1 },
    exit: { x: 160, y: 179 },
    spawnCount: 10,
    needed: 4,
    stock: { digger: 3, blocker: 2 },
    par: 3000
  },
  // 5 — The Long Drop: a fatal fall from the ledge; pop an umbrella and float.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 60, w: 110, h: 8 },
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 }
    ],
    hatch: { x: 24, y: 24, dir: 1 },
    exit: { x: 296, y: 179 },
    spawnCount: 10,
    needed: 5,
    stock: { floater: 10, blocker: 2, builder: 2 },
    par: 3000
  },
  // 6 — Grand Finale: float down off the ledge, bash through the wall, then
  // build up to the exit. Every skill has its moment.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 60, w: 90, h: 8 },
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 150, w: 6, h: 50 },
      { kind: 'rect', x: 150, y: 130, w: 14, h: 50 },
      { kind: 'rect', x: 272, y: 169, w: 48, h: 31 }
    ],
    hatch: { x: 24, y: 24, dir: 1 },
    exit: { x: 296, y: 168 },
    spawnCount: 12,
    needed: 4,
    stock: { floater: 12, basher: 3, builder: 4, blocker: 3, digger: 2 },
    par: 3600
  },
  // 7 — Hold the Line: the upper shelf ends in a bottomless cliff, so a blocker
  // has to turn the crowd back before they march off it while a digger opens a
  // shaft down onto the lower floor and the exit. Blocker gates the dig.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 120, w: 230, h: 16 },
      { kind: 'rect', x: 0, y: 88, w: 6, h: 32 },
      { kind: 'rect', x: 0, y: 168, w: 200, h: 32 },
      { kind: 'rect', x: 0, y: 138, w: 6, h: 30 },
      { kind: 'rect', x: 194, y: 138, w: 6, h: 30 }
    ],
    hatch: { x: 40, y: 90, dir: 1 },
    exit: { x: 40, y: 167 },
    spawnCount: 10,
    needed: 4,
    stock: { blocker: 2, digger: 3, builder: 2, floater: 2 },
    par: 3600,
    hint: 'fun.lemmings.hint7'
  },
  // 8 — Up and Over: a shelf too tall to climb, capped by a wall too tall to
  // pass. Build a staircase up onto the shelf, then bash through the wall to
  // the exit beyond it — a builder-then-basher combo.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 170, w: 320, h: 30 },
      { kind: 'rect', x: 0, y: 140, w: 6, h: 30 },
      { kind: 'rect', x: 200, y: 158, w: 120, h: 42 },
      { kind: 'rect', x: 250, y: 120, w: 14, h: 38 }
    ],
    hatch: { x: 30, y: 140, dir: 1 },
    exit: { x: 300, y: 157 },
    spawnCount: 10,
    needed: 4,
    stock: { builder: 4, basher: 4, blocker: 2 },
    par: 3600,
    hint: 'fun.lemmings.hint8'
  },
  // 9 — Down the Shaft: a fatal drop off the entry ledge onto a walled shelf
  // with no way off but through it. Float down to land safely, then dig a shaft
  // to the exit chamber below — a floater-drop-into-dig route.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 40, w: 90, h: 8 },
      { kind: 'rect', x: 0, y: 140, w: 320, h: 10 },
      { kind: 'rect', x: 0, y: 110, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 110, w: 6, h: 30 },
      { kind: 'rect', x: 0, y: 185, w: 320, h: 15 },
      { kind: 'rect', x: 0, y: 155, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 155, w: 6, h: 30 }
    ],
    hatch: { x: 24, y: 20, dir: 1 },
    exit: { x: 160, y: 184 },
    spawnCount: 10,
    needed: 5,
    // Every critter must pop an umbrella before walking off the entry ledge, so
    // the stock covers all ten with a small buffer for a fumbled tap or two.
    stock: { floater: 14, digger: 3, blocker: 2 },
    par: 4200,
    hint: 'fun.lemmings.hint9'
  },
  // 10 — Across the Gorge: the floor tears open into a bottomless gorge and
  // the far bank sits higher than the near one. One builder can't span it —
  // a second must take over at the tip of the first bridge, and every critter
  // that wanders onto the unfinished span pays for the delay.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 150, h: 40 },
      { kind: 'rect', x: 160, y: 152, w: 160, h: 48 },
      { kind: 'rect', x: 0, y: 120, w: 6, h: 40 }
    ],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 292, y: 151 },
    spawnCount: 12,
    needed: 4,
    stock: { builder: 5, blocker: 2, floater: 2, basher: 1 },
    par: 4200,
    hint: 'fun.lemmings.hint10'
  },
  // 11 — Down and Up: a sealed upper hall over a lower one whose exit stands
  // on a plinth too tall to climb. Dig through the floor, then build a ramp
  // up to the door — the descent and the climb in one level.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 140, w: 320, h: 12 },
      { kind: 'rect', x: 0, y: 110, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 110, w: 6, h: 30 },
      { kind: 'rect', x: 0, y: 188, w: 320, h: 12 },
      { kind: 'rect', x: 0, y: 158, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 158, w: 6, h: 30 },
      { kind: 'rect', x: 240, y: 176, w: 80, h: 12 }
    ],
    hatch: { x: 40, y: 100, dir: 1 },
    exit: { x: 300, y: 175 },
    spawnCount: 10,
    needed: 5,
    stock: { digger: 2, builder: 3, blocker: 2, floater: 2 },
    par: 4200,
    hint: 'fun.lemmings.hint11'
  },
  // 12 — Into the Pit: the hatch hangs high over a walled pit — the drop is
  // fatal without an umbrella, and the walls are too tall to climb. Float
  // everyone in, then bash through the right wall to the door.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 168, w: 320, h: 32 },
      { kind: 'rect', x: 70, y: 138, w: 8, h: 30 },
      { kind: 'rect', x: 150, y: 138, w: 8, h: 30 },
      { kind: 'rect', x: 0, y: 138, w: 6, h: 30 }
    ],
    hatch: { x: 114, y: 90, dir: 1 },
    exit: { x: 296, y: 167 },
    spawnCount: 10,
    needed: 5,
    stock: { floater: 14, basher: 2, blocker: 2 },
    par: 4200,
    hint: 'fun.lemmings.hint12'
  },
  // 13 — The Long Way Home: the grand tour. Umbrellas off the entry ledge
  // onto the shelf, a safe hop down to the hall, a bash through the wall, and
  // a bridge up to the door's plinth — float, bash, and build in one trek.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 36, w: 70, h: 8 },
      { kind: 'rect', x: 0, y: 12, w: 6, h: 32 },
      { kind: 'rect', x: 0, y: 120, w: 200, h: 12 },
      { kind: 'rect', x: 0, y: 90, w: 6, h: 30 },
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 150, w: 6, h: 30 },
      { kind: 'rect', x: 240, y: 150, w: 12, h: 30 },
      { kind: 'rect', x: 280, y: 170, w: 40, h: 10 }
    ],
    hatch: { x: 24, y: 16, dir: 1 },
    exit: { x: 302, y: 169 },
    spawnCount: 12,
    needed: 5,
    stock: { floater: 14, basher: 2, builder: 3, blocker: 2, digger: 1 },
    par: 5400,
    hint: 'fun.lemmings.hint13'
  },
  // 14 — Double Trouble: the first two-hatch level. A crowd drops in from each
  // side of the field and both march toward one shared door in the middle —
  // a walk-only breather that teaches the alternating spawns.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 320, h: 40 },
      { kind: 'rect', x: 0, y: 120, w: 6, h: 40 },
      { kind: 'rect', x: 314, y: 120, w: 6, h: 40 }
    ],
    hatch: { x: 34, y: 120, dir: 1 },
    hatch2: { x: 286, y: 120, dir: -1 },
    exit: { x: 160, y: 159 },
    spawnCount: 12,
    needed: 6,
    stock: { blocker: 2, floater: 2 },
    par: 2400,
    hint: 'fun.lemmings.hint14'
  },
  // 15 — Beat the Clock: the wall level again, but now against a hard timer.
  // Trickling loses; crank the release rate, bash through, and hustle home.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 320, h: 40 },
      { kind: 'rect', x: 0, y: 120, w: 6, h: 40 },
      { kind: 'rect', x: 150, y: 100, w: 16, h: 60 }
    ],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 292, y: 159 },
    spawnCount: 10,
    needed: 5,
    stock: { basher: 3, builder: 2, blocker: 2 },
    par: 2400,
    timeLimit: 2700,
    hint: 'fun.lemmings.hint15'
  },
  // 16 — Steel Floor: a sealed upper hall like level 4, but most of its floor
  // is riveted steel that shrugs off every spade. Only the strip on the right
  // is still earth — dig there and drop to the exit chamber below.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 120, w: 240, h: 16, material: 'steel' },
      { kind: 'rect', x: 240, y: 120, w: 80, h: 16 },
      { kind: 'rect', x: 0, y: 88, w: 6, h: 32 },
      { kind: 'rect', x: 314, y: 88, w: 6, h: 32 },
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 150, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 150, w: 6, h: 30 }
    ],
    hatch: { x: 60, y: 80, dir: 1 },
    exit: { x: 40, y: 179 },
    spawnCount: 10,
    needed: 5,
    stock: { digger: 3, blocker: 2 },
    par: 4200,
    hint: 'fun.lemmings.hint16'
  },
  // 17 — Rush Hour: two hatches and a timer at once. The right-hand crowd
  // walks straight to the door; the left-hand crowd faces a bottomless gap
  // that needs a bridge before the clock — and the crowd — runs out.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 176, w: 130, h: 24 },
      { kind: 'rect', x: 142, y: 176, w: 178, h: 24 },
      { kind: 'rect', x: 0, y: 146, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 146, w: 6, h: 30 }
    ],
    hatch: { x: 30, y: 136, dir: 1 },
    hatch2: { x: 290, y: 136, dir: -1 },
    exit: { x: 240, y: 175 },
    spawnCount: 12,
    needed: 7,
    stock: { builder: 2, blocker: 2, floater: 2 },
    par: 4200,
    timeLimit: 3600,
    hint: 'fun.lemmings.hint17'
  },
  // 18 — Over the Steel: a squat steel wall blocks the road. Bashers bounce
  // straight off it, so the only way past is a ramp up and over the top.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 160, w: 320, h: 40 },
      { kind: 'rect', x: 0, y: 120, w: 6, h: 40 },
      { kind: 'rect', x: 314, y: 120, w: 6, h: 40 },
      { kind: 'rect', x: 150, y: 152, w: 10, h: 8, material: 'steel' }
    ],
    hatch: { x: 30, y: 120, dir: 1 },
    exit: { x: 292, y: 159 },
    spawnCount: 10,
    needed: 5,
    stock: { builder: 3, basher: 2, blocker: 2 },
    par: 3600,
    hint: 'fun.lemmings.hint18'
  },
  // 19 — Two Streams: one hatch opens high over a cliff, the other at ground
  // level. The low crowd strolls home; the high crowd needs umbrellas for a
  // drop that would otherwise be fatal.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 70, w: 80, h: 8 },
      { kind: 'rect', x: 0, y: 40, w: 6, h: 30 },
      { kind: 'rect', x: 314, y: 150, w: 6, h: 30 }
    ],
    hatch: { x: 30, y: 30, dir: 1 },
    hatch2: { x: 286, y: 140, dir: -1 },
    exit: { x: 160, y: 179 },
    spawnCount: 12,
    needed: 8,
    stock: { floater: 8, blocker: 2 },
    par: 4200,
    hint: 'fun.lemmings.hint19'
  },
  // 20 — The Gauntlet: everything at once. Two crowds, one central door, a
  // hard clock: the left crowd must bash through an earth wall while the
  // right crowd builds over a steel stub no fist can dent.
  {
    shapes: [
      { kind: 'rect', x: 0, y: 180, w: 320, h: 20 },
      { kind: 'rect', x: 0, y: 140, w: 6, h: 40 },
      { kind: 'rect', x: 314, y: 140, w: 6, h: 40 },
      { kind: 'rect', x: 110, y: 150, w: 12, h: 30 },
      { kind: 'rect', x: 200, y: 172, w: 10, h: 8, material: 'steel' }
    ],
    hatch: { x: 30, y: 140, dir: 1 },
    hatch2: { x: 290, y: 140, dir: -1 },
    exit: { x: 160, y: 179 },
    spawnCount: 14,
    needed: 8,
    stock: { basher: 2, builder: 3, blocker: 2, floater: 2, digger: 1 },
    par: 5400,
    timeLimit: 5400,
    hint: 'fun.lemmings.hint20'
  }
];
