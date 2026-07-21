/**
 * Line Hold — the wave script and its spawner. An 18-wave hand-authored
 * campaign that escalates in *kind* (earlier and multiple warlords, armoured
 * brute packs, denser mixes) rather than HP alone, then hands off to a
 * deterministic endless assault (`endlessWave`) so a strong defence has an
 * unbounded score tail instead of a victory wall. Enemy hp climbs a gentle
 * linear ramp per wave so early towers stay relevant without trivialising the
 * late game.
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
  // 1-6: the teaching arc — one kind at a time, then the first mixes.
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
  // 7-12: the pressure builds — layered mixes and the first warlord.
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
  ],
  // 13-18: the escalation — armoured floods, escorted and twin warlords.
  [
    { kind: 'brute', count: 8, gap: 0.9 },
    { kind: 'sprinter', count: 10, gap: 0.4, pause: 2 }
  ],
  [
    { kind: 'scout', count: 18, gap: 0.35 },
    { kind: 'brute', count: 4, gap: 1.0, pause: 2 }
  ],
  [
    { kind: 'warlord', count: 1, gap: 1 },
    { kind: 'brute', count: 6, gap: 1.0, pause: 2.5 }
  ],
  [
    { kind: 'sprinter', count: 16, gap: 0.3 },
    { kind: 'brute', count: 6, gap: 0.9, pause: 2 }
  ],
  [
    { kind: 'warlord', count: 2, gap: 4 },
    { kind: 'sprinter', count: 10, gap: 0.4, pause: 2 }
  ],
  // Finale: twin warlords behind a brute wall, chased home by a sprinter pack.
  [
    { kind: 'warlord', count: 2, gap: 3 },
    { kind: 'brute', count: 8, gap: 0.8, pause: 2 },
    { kind: 'sprinter', count: 10, gap: 0.35, pause: 1.5 }
  ]
];

/** Number of hand-authored waves; past this the endless assault takes over. */
export const AUTHORED_WAVES = WAVES.length;

/**
 * The endless assault past the authored campaign. A pure function of the wave
 * index (no RNG, so tests are exact): three rotating compositions whose counts
 * and warlord tally climb every few waves, on top of the ever-rising hpScale.
 */
export function endlessWave(waveIndex: number): WaveEntry[] {
  // Clamp to the campaign's end: `over` is never negative, so counts stay sane
  // even if a caller passes an in-campaign or non-finite index.
  const over = Math.max(0, Math.floor(waveIndex) - AUTHORED_WAVES);
  const tier = Math.floor(over / 3);
  const scouts = 14 + tier * 3;
  const sprinters = 12 + tier * 3;
  const brutes = 6 + tier * 2;
  const warlords = 1 + Math.floor(over / 4);
  switch (over % 3) {
    case 0:
      return [
        { kind: 'scout', count: scouts, gap: 0.35 },
        { kind: 'brute', count: brutes, gap: 0.9, pause: 1.5 }
      ];
    case 1:
      return [
        { kind: 'sprinter', count: sprinters, gap: 0.3 },
        { kind: 'warlord', count: warlords, gap: 3, pause: 2 }
      ];
    default:
      return [
        { kind: 'warlord', count: warlords, gap: 3 },
        { kind: 'brute', count: brutes, gap: 0.8, pause: 2 },
        { kind: 'sprinter', count: sprinters, gap: 0.35, pause: 1 }
      ];
  }
}

/** The wave to run at `waveIndex`: authored while it lasts, else endless. */
export function waveDef(waveIndex: number): WaveEntry[] {
  // Normalise so the primary accessor never returns undefined for a stray
  // negative or non-finite index.
  const i = Number.isFinite(waveIndex) ? Math.max(0, Math.floor(waveIndex)) : 0;
  return i < AUTHORED_WAVES ? WAVES[i] : endlessWave(i);
}

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
