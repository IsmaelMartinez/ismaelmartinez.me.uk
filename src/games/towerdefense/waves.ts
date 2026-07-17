/**
 * Line Hold — the fixed wave script and its spawner. v1 ships a hand-authored
 * dozen waves (no endless scaling); enemy hp climbs a gentle ramp per wave so
 * early towers stay relevant without trivialising the finale.
 */
import type { EnemyKind } from './enemies';

export interface WaveEntry {
  kind: EnemyKind;
  count: number;
  /** Seconds between spawns within this entry. */
  gap: number;
  /** Seconds of quiet before this entry starts. */
  pause?: number;
}

export const WAVES: WaveEntry[][] = [
  [{ kind: 'scout', count: 6, gap: 1.0 }],
  [{ kind: 'scout', count: 10, gap: 0.8 }],
  [
    { kind: 'scout', count: 6, gap: 0.7 },
    { kind: 'sprinter', count: 4, gap: 0.9, pause: 1.5 }
  ],
  [{ kind: 'brute', count: 4, gap: 1.6 }],
  [{ kind: 'sprinter', count: 10, gap: 0.55 }],
  [
    { kind: 'scout', count: 8, gap: 0.6 },
    { kind: 'brute', count: 4, gap: 1.4, pause: 2 }
  ],
  [
    { kind: 'brute', count: 6, gap: 1.2 },
    { kind: 'sprinter', count: 6, gap: 0.5, pause: 2 }
  ],
  [{ kind: 'scout', count: 14, gap: 0.45 }],
  [{ kind: 'brute', count: 8, gap: 1.0 }],
  [
    { kind: 'sprinter', count: 12, gap: 0.4 },
    { kind: 'brute', count: 4, gap: 1.2, pause: 2 }
  ],
  [
    { kind: 'scout', count: 10, gap: 0.5 },
    { kind: 'sprinter', count: 8, gap: 0.5, pause: 1 },
    { kind: 'brute', count: 5, gap: 1.1, pause: 1 }
  ],
  [
    { kind: 'warlord', count: 1, gap: 1 },
    { kind: 'sprinter', count: 8, gap: 0.6, pause: 3 }
  ]
];

/** Enemy hp multiplier on wave `waveIndex` (0-based). */
export function hpScale(waveIndex: number): number {
  return 1 + waveIndex * 0.14;
}

export interface Spawner {
  /** Index into the wave's entry list. */
  entry: number;
  /** Enemies already spawned from the current entry. */
  spawned: number;
  /** Seconds until the next spawn is due. */
  timer: number;
}

export function createSpawner(wave: WaveEntry[]): Spawner {
  return { entry: 0, spawned: 0, timer: wave[0]?.pause ?? 0 };
}

/** True once every entry of the wave has finished spawning. */
export function spawnerDone(spawner: Spawner, wave: WaveEntry[]): boolean {
  return spawner.entry >= wave.length;
}

/**
 * Advances the spawner by `dt` and returns the kinds due to spawn this step
 * (usually zero or one; more if dt outruns a short gap).
 */
export function stepSpawner(spawner: Spawner, wave: WaveEntry[], dt: number): EnemyKind[] {
  const out: EnemyKind[] = [];
  spawner.timer -= dt;
  while (spawner.entry < wave.length && spawner.timer <= 0) {
    const entry = wave[spawner.entry];
    out.push(entry.kind);
    spawner.spawned++;
    if (spawner.spawned >= entry.count) {
      spawner.entry++;
      spawner.spawned = 0;
      spawner.timer += (wave[spawner.entry]?.pause ?? 0) + entry.gap;
    } else {
      spawner.timer += entry.gap;
    }
  }
  return out;
}
