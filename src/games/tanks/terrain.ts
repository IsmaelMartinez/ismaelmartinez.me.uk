/**
 * Destructible terrain as a per-pixel heightmap.
 *
 * `ground[x]` is the y coordinate (measured from the top of the canvas) of
 * the terrain surface at column x. Solid ground occupies y >= ground[x].
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The selectable battlefield silhouettes. `hills` is the original rolling
 * terrain; the other three reshape it into a distinct arena (see
 * `reshapeArena`). All four still walk the same destructible heightmap, so the
 * physics and the CPU's shot search work on every one unchanged.
 */
export type ArenaType = 'hills' | 'canyon' | 'mesa' | 'ridges';

export function generateTerrain(
  width: number,
  height: number,
  random: () => number = Math.random,
  arena: ArenaType = 'hills'
): number[] {
  const ground = new Array<number>(width);
  const base = height * 0.65;
  const waves = [
    { amp: height * (0.08 + random() * 0.1), freq: 0.5 + random(), phase: random() * Math.PI * 2 },
    { amp: height * (0.04 + random() * 0.06), freq: 2 + random() * 2, phase: random() * Math.PI * 2 },
    { amp: height * (0.02 + random() * 0.03), freq: 5 + random() * 4, phase: random() * Math.PI * 2 }
  ];

  for (let x = 0; x < width; x++) {
    const tx = (x / width) * Math.PI * 2;
    let y = base;
    for (const wave of waves) {
      y += wave.amp * Math.sin(tx * wave.freq + wave.phase);
    }
    ground[x] = clamp(y, height * 0.3, height * 0.92);
  }
  // hills is the original terrain, returned untouched so its output stays
  // byte-identical to the pre-arena generator (no extra random() draws).
  if (arena === 'hills') return ground;
  return reshapeArena(ground, width, height, arena);
}

/**
 * Bends a freshly generated `hills` heightmap into one of the other arena
 * silhouettes. Each column blends toward a target profile and keeps a fraction
 * of the original relief as texture, so the arenas read as shaped ground rather
 * than bare geometry. Every column stays inside the same [0.3h, 0.92h] clamp,
 * so nothing here can push terrain off-field or change how it bakes.
 */
function reshapeArena(
  ground: number[],
  width: number,
  height: number,
  arena: Exclude<ArenaType, 'hills'>
): number[] {
  const ceilY = height * 0.3;
  const floorY = height * 0.92;
  const base = height * 0.65;
  const shaped = new Array<number>(width);

  for (let x = 0; x < width; x++) {
    const u = width > 1 ? x / (width - 1) : 0;
    const texture = ground[x] - base;
    let target: number;

    if (arena === 'canyon') {
      // Raised rims either side plunging into a deep, narrow central gorge.
      const rim = height * 0.5;
      const gorge = Math.exp(-(((u - 0.5) / 0.1) ** 2));
      target = rim + (height * 0.9 - rim) * gorge;
    } else if (arena === 'mesa') {
      // A flat central plateau raised toward the ceiling, sloped shoulders down
      // to the surrounding plain — kept moderate so arcs still clear it.
      const plainY = height * 0.7;
      const topY = height * 0.44;
      const d = Math.abs(u - 0.5);
      const t = d <= 0.2 ? 1 : d >= 0.35 ? 0 : (0.35 - d) / 0.15;
      const s = t * t * (3 - 2 * t);
      target = plainY + (topY - plainY) * s;
    } else {
      // Two peaks with a valley between and low outer edges where tanks spawn.
      const valley = height * 0.7;
      const peakY = height * 0.46;
      const peak = Math.max(
        Math.exp(-(((u - 0.3) / 0.12) ** 2)),
        Math.exp(-(((u - 0.7) / 0.12) ** 2))
      );
      target = valley + (peakY - valley) * peak;
    }

    shaped[x] = clamp(target + texture * 0.35, ceilY, floorY);
  }
  return shaped;
}

/** Surface y at an arbitrary (possibly fractional) x, clamped to the field. */
export function surfaceYAt(ground: number[], x: number): number {
  const xi = clamp(Math.round(x), 0, ground.length - 1);
  return ground[xi];
}

/**
 * Removes a circular bite of terrain centred on (ex, ey). Material above the
 * blast collapses straight down, so the surface drops by the amount of solid
 * ground that overlapped the circle in each column.
 */
export function carveCrater(
  ground: number[],
  floorY: number,
  ex: number,
  ey: number,
  radius: number
): void {
  const x0 = Math.max(0, Math.ceil(ex - radius));
  const x1 = Math.min(ground.length - 1, Math.floor(ex + radius));
  for (let x = x0; x <= x1; x++) {
    const dx = x - ex;
    const dy = Math.sqrt(radius * radius - dx * dx);
    const top = ey - dy;
    const bottom = ey + dy;
    const removed = Math.max(0, Math.min(bottom, floorY) - Math.max(top, ground[x]));
    ground[x] = Math.min(floorY, ground[x] + removed);
  }
}
