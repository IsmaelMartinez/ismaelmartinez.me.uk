/**
 * Destructible terrain as a per-pixel heightmap.
 *
 * `ground[x]` is the y coordinate (measured from the top of the canvas) of
 * the terrain surface at column x. Solid ground occupies y >= ground[x].
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generateTerrain(
  width: number,
  height: number,
  random: () => number = Math.random
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
  return ground;
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
