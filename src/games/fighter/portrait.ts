/**
 * The head-and-shoulders portraits of the select, VS, quote and continue
 * screens: the fighter's own body (`body.ts`), drawn several times larger
 * with only the bust in frame. A portrait is the sprite's model seen close,
 * so it wears what the fighter wears in the ring (the headband, the mask,
 * the cap and cape, the buns in their silk) and no second likeness has to
 * be kept in step with the first.
 */
import { drawBody, landmarks3 } from './body';
import { BUILDS, type Look, type Raster } from './figure';
import type { Pose } from './poses';
import type { Fighter } from './roster';

/** Squared up to the camera, chin down, arms at the sides. */
const BUST: Pose = { x: 0, y: 0, plant: true, rot: 0, lean: 3, head: -3, twist: 60, headTwist: 62, hipTwist: 50, aN: [8, 24, 24], aF: [6, 28], lN: [-6, -6], lF: [8, -8], hand: 'fist' };

/** How much of the square a head fills, by build: the big men are framed a little looser. */
const FILL: Record<Fighter['build'], number> = { lean: 0.24, muscle: 0.235, giant: 0.22, heavy: 0.22, slim: 0.25, beast: 0.21, tall: 0.245 };

export function drawPortrait(r: Raster, def: Fighter, look: Look, mood: 'calm' | 'hurt' | 'shout', size: number): void {
  const pose: Pose = { ...BUST, face: mood === 'calm' ? 'calm' : mood, head: mood === 'hurt' ? 8 : BUST.head };
  // Scale the body so its head is `FILL` of the square in radius, then put the head just above the middle.
  const scale = (size * FILL[def.build]) / (BUILDS[def.build].head * (def.height / 90) * 1.06);
  const at = landmarks3(def, pose, scale);
  drawBody(r, def, look, pose, Math.round(size * 0.47 - at.head[0]), Math.round(size * 0.45 - at.head[1]), scale);
}
