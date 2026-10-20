/**
 * Every frame of animation, as a pose of one skeleton.
 *
 * The arcade drew a few thousand hand-painted sprite cels per fighter; this
 * cabinet poses one jointed figure per fighter and rasterises it (see
 * `figure.ts`), so a pose here is a handful of joint angles and a fighter's
 * whole move list is a page. Poses are **held keyframes**, not tweens: an
 * attack snaps from chamber to extension the way a sprite animation does,
 * which is most of what makes the motion read as 1991 rather than as
 * skeletal animation.
 *
 * Angles are degrees in the figure's own frame, facing right, with y down:
 * a limb's angle is measured from straight down, positive swinging forward
 * (90 points at the opponent, 180 straight up). A bend is the lower segment
 * relative to the upper: an elbow bends forward (positive), a knee folds
 * back (negative).
 *
 * DOM-free: `poseFor` reads the fight state and the fighter's frame, nothing
 * else, so the tests can assert that every state has a pose.
 */
import { AIR_FRAMES, type FighterState } from './fight';
import type { CharId } from './roster';

export interface Pose {
  /** Hip offset forward from the fighter's x, px. */
  x: number;
  /** Hip height above the feet's floor when not planted; with `plant` an extra drop. */
  y: number;
  /** Lower the figure until its lowest foot stands on the floor. */
  plant: boolean;
  /** Whole-body rotation about the hips, degrees, positive pitching forward. */
  rot: number;
  /** Torso lean from upright, positive forward. */
  lean: number;
  /** Head tilt relative to the torso. */
  head: number;
  /** Near (front, drawn over the body) arm: upper angle, elbow bend. */
  aN: readonly [number, number];
  /** Far arm, drawn behind. */
  aF: readonly [number, number];
  /** Near leg: thigh angle, knee bend. */
  lN: readonly [number, number];
  lF: readonly [number, number];
  /** Hands: closed fists, open palms (a fireball, a grab), or the claw. */
  hand: 'fist' | 'open';
  /** Stretch on the near/far arm and leg (the yogi's long limbs reach). */
  stretch?: { aN?: number; aF?: number; lN?: number; lF?: number };
  /** Draw the figure mirrored this frame (spinning moves). */
  flip?: boolean;
  /** Eyes shut and mouth open (hit, KO), or gritted (attacking). */
  face?: 'hurt' | 'shout' | 'calm';
}

const BASE: Pose = {
  x: 0,
  y: 0,
  plant: true,
  rot: 0,
  lean: 6,
  head: -4,
  aN: [36, 78],
  aF: [22, 96],
  lN: [20, -16],
  lF: [-20, -10],
  hand: 'fist'
};

const P = (over: Partial<Pose>, base: Pose = BASE): Pose => ({ ...base, ...over });

/** How a fighter carries himself, which colours every neutral pose. */
type Stance = 'karate' | 'boxer' | 'sumo' | 'beast' | 'wrestler' | 'yogi' | 'kungfu' | 'soldier' | 'muay' | 'claw' | 'dictator';

const STANCE_OF: Record<CharId, Stance> = {
  kenji: 'karate',
  ace: 'karate',
  mei: 'kungfu',
  boris: 'wrestler',
  raj: 'yogi',
  tora: 'sumo',
  rio: 'beast',
  duke: 'soldier',
  rocko: 'boxer',
  varga: 'claw',
  sakda: 'muay',
  zar: 'dictator'
};

/** Four breathing frames per stance. */
const IDLE: Record<Stance, Pose[]> = {
  karate: [
    P({}),
    P({ lN: [20, -20], lF: [-20, -14], y: 1 }),
    P({ lN: [20, -24], lF: [-20, -18], y: 2, aN: [38, 76] }),
    P({ lN: [20, -20], lF: [-20, -14], y: 1 })
  ],
  boxer: [0, 1, 2, 1].map(b =>
    P({ lean: 12, head: 4, aN: [52, 100], aF: [40, 116], lN: [16, -14 - b * 5], lF: [-18, -12 - b * 5], y: b * 2 })
  ),
  sumo: [0, 1, 2, 1].map(b => P({ lean: 14, head: -6, aN: [70, 20], aF: [60, 30], lN: [34, -40 - b * 4], lF: [-34, -40 - b * 4], hand: 'open', y: b })),
  beast: [0, 1, 2, 1].map(b => P({ lean: 34, head: -26, aN: [24 + b * 3, 30], aF: [12, 30], lN: [30, -46 - b * 4], lF: [-16, -40 - b * 4], hand: 'open', y: b })),
  wrestler: [0, 1, 2, 1].map(b => P({ lean: 14, head: -8, aN: [44, 50], aF: [30, 60], lN: [24, -22 - b * 4], lF: [-24, -18 - b * 4], hand: 'open', y: b })),
  yogi: [0, 1, 2, 1].map(b => P({ lean: 2, head: -6, aN: [60, 120 + b * 6], aF: [50, 110 + b * 6], lN: [14, -6], lF: [-14, -4], y: b })),
  kungfu: [0, 1, 2, 1].map(b => P({ lean: 4, head: -4, aN: [70, 40 + b * 4], aF: [30, 110], lN: [26, -26 - b * 3], lF: [-16, -12 - b * 3], hand: 'open', y: b })),
  soldier: [0, 1, 2, 1].map(b => P({ lean: 4, head: -4, aN: [40, 96], aF: [26, 100], lN: [18, -10 - b * 4], lF: [-24, -8 - b * 3], y: b })),
  muay: [0, 1, 2, 1].map(b => P({ lean: 0, head: -6, aN: [44, 110], aF: [34, 120], lN: [24 + b * 2, -30 - b * 4], lF: [-18, -10], y: b })),
  claw: [0, 1, 2, 1].map(b => P({ lean: 10, head: -2, aN: [70, 30 - b * 4], aF: [30, 80], lN: [22, -30 - b * 3], lF: [-20, -16], hand: 'open', y: b })),
  dictator: [0, 1, 2, 1].map(b => P({ lean: -2, head: -6, aN: [16, 30], aF: [10, 30], lN: [14, -6 - b * 2], lF: [-16, -6 - b * 2], y: b }))
};

/** Six walking frames: the legs scissor under a steady upper body. */
function walk(stance: Pose, t: number): Pose {
  const phase = Math.floor(t / 6) % 6;
  const swing = [24, 12, -4, -24, -12, 4][phase];
  const lift = [0, -30, -16, 0, -6, -10][phase];
  return P(
    {
      lN: [stance.lN[0] * 0.3 + swing, Math.min(stance.lN[1], lift - 8)],
      lF: [stance.lF[0] * 0.3 - swing, Math.min(stance.lF[1], -lift - 22) * 0.6]
    },
    stance
  );
}

const CROUCH = P({ lean: 16, head: -10, lN: [84, -112], lF: [36, -128], aN: [44, 84], aF: [30, 96] });
const CROUCH_GUARD = P({ lean: 4, head: -14, aN: [64, 112], aF: [56, 120] }, CROUCH);
const STAND_GUARD = P({ lean: -6, head: -10, aN: [58, 116], aF: [50, 124] });
const TUCK = P({ plant: false, y: 46, lean: 14, head: -6, aN: [60, 100], aF: [50, 110], lN: [100, -130], lF: [70, -120] });

/** The normals' active frames: chamber, extension. */
type Key = `${'stand' | 'crouch' | 'air'}${'P' | 'K'}${0 | 1 | 2}`;
const ATTACK: Record<Key, [Pose, Pose]> = {
  standP0: [P({ aN: [70, 50], lean: 10 }), P({ aN: [92, 0], aF: [24, 100], lean: 14, face: 'shout' })],
  standP1: [P({ aF: [60, 70], lean: 12 }), P({ aF: [94, 0], aN: [40, 100], lean: 20, x: 3, face: 'shout' })],
  standP2: [P({ aF: [40, 100], lean: 4, x: -2 }), P({ aF: [96, -4], aN: [30, 110], lean: 26, x: 6, lN: [34, -20], lF: [-34, 0], face: 'shout' })],
  standK0: [P({ lN: [50, -70], lean: 0 }), P({ lN: [68, -6], lean: -8, lF: [-10, -6], face: 'shout' })],
  standK1: [P({ lF: [40, -90], lean: -6 }), P({ lF: [96, -4], lN: [-8, -6], lean: -20, aN: [60, 90], face: 'shout' })],
  standK2: [P({ lF: [70, -100], lean: -14 }), P({ lF: [130, -6], lN: [-14, -6], lean: -34, aN: [30, 60], aF: [-10, 60], face: 'shout' })],
  crouchP0: [P({ aN: [70, 50] }, CROUCH), P({ aN: [92, 0], face: 'shout' }, CROUCH)],
  crouchP1: [P({ aF: [60, 70] }, CROUCH), P({ aF: [94, 0], aN: [40, 100], lean: 24, face: 'shout' }, CROUCH)],
  crouchP2: [P({ aF: [60, 110], lean: 20 }, CROUCH), P({ aF: [172, 0], aN: [40, 90], lean: -4, lN: [60, -80], lF: [10, -40], y: -10, face: 'shout' }, CROUCH)],
  crouchK0: [P({ lN: [70, -80] }, CROUCH), P({ lN: [60, 0], lean: 10, face: 'shout' }, CROUCH)],
  crouchK1: [P({ lN: [70, -80], lean: 4 }, CROUCH), P({ lN: [64, 2], lean: -4, x: 2, face: 'shout' }, CROUCH)],
  crouchK2: [P({ lF: [60, -100], lean: 20 }, CROUCH), P({ lF: [82, 2], lN: [100, -150], lean: 34, head: -20, aN: [10, 20], aF: [-6, 20], hand: 'open', face: 'shout' }, CROUCH)],
  airP0: [P({ aN: [70, 50] }, TUCK), P({ aN: [64, 0], face: 'shout' }, TUCK)],
  airP1: [P({ aF: [60, 70] }, TUCK), P({ aF: [58, 0], lean: 20, face: 'shout' }, TUCK)],
  airP2: [P({ aF: [100, 60], lean: 0 }, TUCK), P({ aF: [50, 0], aN: [30, 100], lean: 28, face: 'shout' }, TUCK)],
  airK0: [P({ lN: [80, -100] }, TUCK), P({ y: 40, lN: [50, -4], lF: [40, -110], face: 'shout' }, TUCK)],
  airK1: [P({ lN: [80, -100] }, TUCK), P({ y: 40, lN: [48, 0], lF: [20, -100], lean: -10, face: 'shout' }, TUCK)],
  airK2: [P({ lF: [90, -110], lean: -10 }, TUCK), P({ y: 40, lF: [52, 0], lN: [60, -120], lean: -22, face: 'shout' }, TUCK)]
};

/** The stretching yogi's limbs reach: which segment a normal strikes with. */
function strikeLimb(key: Key): keyof NonNullable<Pose['stretch']> {
  const posture = key.slice(0, -2);
  const button = key[key.length - 2];
  const s = key[key.length - 1];
  if (button === 'P') return s === '0' && posture !== 'air' ? 'aN' : 'aF';
  if (posture === 'stand') return s === '0' ? 'lN' : 'lF';
  if (posture === 'crouch') return s === '2' ? 'lF' : 'lN';
  return s === '2' ? 'lF' : 'lN';
}

function cycle<T>(frames: readonly T[], t: number, hold: number): T {
  return frames[Math.floor(t / hold) % frames.length];
}

/** Rotation the forward jump's somersault has reached. */
function flipAngle(f: FighterState): number {
  const p = Math.min(1, f.frame / AIR_FRAMES);
  return p < 0.12 || p > 0.88 ? 0 : ((p - 0.12) / 0.76) * 360 * f.jumpDir;
}

/**
 * The pose a fighter is in on this frame. `clock` is the fight's frame
 * counter, for the idle loops that run regardless of state frames.
 */
export function poseFor(f: FighterState, clock: number): Pose {
  const stance = STANCE_OF[f.id];
  const idle = IDLE[stance];
  const base = idle[0];
  const t = f.frame;
  switch (f.state) {
    case 'stand':
    case 'land':
      return cycle(idle, clock, 9);
    case 'walk': {
      const forward = Math.sign(f.vx) === f.facing;
      return walk(base, forward ? clock : 60 - (clock % 36));
    }
    case 'guard':
      return STAND_GUARD;
    case 'crouch':
      return t < 3 ? P({ lN: [50, -70], lF: [10, -70], lean: 10 }, base) : CROUCH;
    case 'prejump':
      return P({ lN: [40, -70], lF: [-10, -60], lean: 12 }, base);
    case 'jump': {
      if (f.action?.normal) {
        const key = `air${f.action.button}${f.action.strength}` as Key;
        const n = f.action.normal;
        const pose = ATTACK[key][t < n.startup ? 0 : 1];
        return withStretch(f, pose, key, t >= n.startup && t < n.startup + n.active);
      }
      if (f.jumpDir !== 0 && f.id !== 'boris' && f.id !== 'tora') return P({ rot: flipAngle(f) }, TUCK);
      const rising = f.vy > 2;
      return rising ? P({ lN: [30, -40], lF: [-10, -20], aN: [150, 10], aF: [140, 20], plant: false, y: 46 }) : TUCK;
    }
    case 'attack': {
      const a = f.action;
      if (!a?.normal) return base;
      const key = `${a.posture}${a.button}${a.strength}` as Key;
      const n = a.normal;
      const active = t >= n.startup && t < n.startup + n.active;
      const pose = t < n.startup ? ATTACK[key][0] : t < n.startup + n.active + Math.min(4, n.recovery) ? ATTACK[key][1] : ATTACK[key][0];
      return withStretch(f, pose, key, active);
    }
    case 'special':
      return specialPose(f, base);
    case 'blockstun':
      return f.low ? CROUCH_GUARD : STAND_GUARD;
    case 'hitstun':
      if (f.low) return P({ lean: -8, head: -30, face: 'hurt' }, CROUCH);
      return f.hitHigh
        ? P({ lean: -22, head: -30, aN: [10, 40], aF: [-10, 30], x: -3, face: 'hurt' })
        : P({ lean: 34, head: 10, aN: [30, 40], aF: [20, 40], x: -4, face: 'hurt' });
    case 'fall':
    case 'ko': {
      if (f.y > 2 || f.vy > 0) return P({ plant: false, y: 40, rot: -70, lean: -10, head: -30, aN: [150, 20], aF: [130, 30], lN: [40, -60], lF: [10, -20], face: 'hurt' });
      return LYING;
    }
    case 'down':
      return LYING;
    case 'getup': {
      const p = t / 22;
      if (p < 0.4) return P({ plant: false, y: 10, rot: -50, lean: 20, head: -10, lN: [100, -130], lF: [70, -120], aN: [40, 40], aF: [20, 40] });
      if (p < 0.75) return CROUCH;
      return P({ lN: [40, -70], lF: [-10, -60], lean: 12 }, base);
    }
    case 'dizzy': {
      const sway = Math.sin(clock / 9) * 10;
      return P({ lean: sway, head: -sway - 14, aN: [8, 12], aF: [4, 14], hand: 'open', lN: [12, -14], lF: [-10, -10], x: sway / 3, face: 'hurt' });
    }
    case 'throw': {
      const g = f.grab;
      if (t < 5) return P({ aN: [80, 40], aF: [70, 50], hand: 'open', lean: 18 });
      if (g?.slam) return P({ aN: [170, 20], aF: [160, 30], lean: -10, hand: 'open', lN: [10, -10], lF: [-10, -10] });
      return t < 14
        ? P({ aN: [160, 20], aF: [150, 30], lean: g?.backward ? -30 : 0, hand: 'open' })
        : P({ aN: [100, 0], aF: [90, 10], lean: g?.backward ? -20 : 30, hand: 'open' });
    }
    case 'thrown':
      return P({ plant: false, y: 30, rot: -90 + t * 6, lean: -20, head: -30, aN: [140, 20], aF: [120, 30], lN: [60, -60], lF: [20, -40], face: 'hurt' });
    case 'win':
      return winPose(f, base);
    case 'lose':
      return P({ lean: 26, head: 20, aN: [4, 6], aF: [2, 6], hand: 'open', lN: [10, -10], lF: [-10, -8] });
  }
}

const LYING = P({ plant: false, y: 8, rot: -90, lean: 0, head: 6, aN: [170, 10], aF: [160, 20], lN: [6, -10], lF: [-4, -6], face: 'hurt' });

function withStretch(f: FighterState, pose: Pose, key: Key, active: boolean): Pose {
  if (!active || f.def.reach < 1.2) return pose;
  const limb = strikeLimb(key);
  const s = key.endsWith('0') ? 1 + (f.def.reach - 1) * 0.3 : f.def.reach;
  return { ...pose, stretch: { [limb]: s } };
}

function winPose(f: FighterState, base: Pose): Pose {
  const t = f.frame;
  if (t < 20) return base;
  switch (STANCE_OF[f.id]) {
    case 'boxer':
      return P({ aN: [170, 10], aF: [165, 20], lean: -6, face: 'shout' });
    case 'sumo':
      return P({ lN: [60, -60], lF: [-40, -50], aN: [80, 40], aF: [60, 40], hand: 'open', lean: 10, y: t % 30 < 15 ? 0 : 4 });
    case 'beast':
      return P({ aN: [150, 30], aF: [140, 30], lean: -10, head: -20, hand: 'open', face: 'shout' });
    case 'kungfu':
      return P({ aN: [160, 30], aF: [10, 110], lN: [90, -150], lF: [0, -4], lean: 0 });
    case 'yogi':
      return P({ aN: [120, 150], aF: [110, 150], lN: [60, -140], lF: [0, 0], lean: 0, head: 0 });
    case 'dictator':
      return P({ aN: [10, 110], aF: [5, 120], lean: -8, head: -10 });
    default:
      return t % 60 < 40 ? P({ aN: [172, 0], aF: [20, 90], lean: -4, face: 'shout' }) : P({ aN: [160, 20], aF: [20, 90], lean: -2 });
  }
}

function specialPose(f: FighterState, base: Pose): Pose {
  const a = f.action;
  const s = a?.special;
  if (!a || !s) return base;
  const t = a.t;
  switch (s.kind) {
    case 'projectile':
      if (s.style === 'sonic')
        return t < 8 ? P({ aN: [-40, 160], aF: [-30, 150], lean: -6 }) : P({ aN: [96, 0], aF: [88, 0], lean: 10, hand: 'open', face: 'shout' });
      if (s.style === 'fire') return t < 12 ? P({ aN: [30, 120], aF: [30, 110], lean: -6 }) : P({ aN: [80, 30], aF: [70, 40], lean: 20, head: 10, hand: 'open', face: 'shout' });
      if (s.style === 'tigerLow') return t < 12 ? P({ aF: [20, 120] }, CROUCH) : P({ aF: [80, 0], aN: [40, 90], lean: 24, face: 'shout' }, CROUCH);
      if (s.style === 'tiger') return t < 12 ? P({ aF: [30, 120], lN: [70, -90] }) : P({ aF: [100, 0], aN: [80, 30], lean: 10, lN: [80, -100], hand: 'open', face: 'shout' });
      return t < 12
        ? P({ aN: [-30, 110], aF: [-36, 104], lean: -4, lN: [24, -20], lF: [-30, -4], hand: 'open' })
        : P({ aN: [92, 0], aF: [88, 4], lean: 14, x: 4, lN: [34, -22], lF: [-34, 0], hand: 'open', face: 'shout' });
    case 'rising':
      if (t < 3) return P({ aF: [40, 110] }, CROUCH);
      return f.y > 0 && f.vy > -1
        ? P({ plant: false, y: 40, aF: [176, 0], aN: [40, 60], lean: -6, lN: [100, -130], lF: [-6, 0], face: 'shout' })
        : P({ plant: false, y: 40, aF: [150, 10], aN: [40, 60], lean: 4, lN: [60, -60], lF: [0, -10] });
    case 'flip': {
      if (t < 3) return CROUCH;
      if (f.y <= 0) return CROUCH;
      const spin = Math.min(360, (t - 3) * 22);
      return P({ plant: false, y: 40, rot: -spin, lean: 0, aN: [-30, 30], aF: [-40, 30], lN: [170, -6], lF: [60, -100], face: 'shout' });
    }
    case 'spin': {
      if (f.def.build === 'slim') {
        // The upside-down bird kick, legs splayed.
        const turn = Math.floor(t / 4) % 2 === 0;
        return P({ plant: false, y: 30, rot: 180, lean: 0, head: 0, aN: [80, 0], aF: [-80, 0], lN: [90, 0], lF: [-90, 0], flip: turn, hand: 'open' });
      }
      const turn = Math.floor(t / 5) % 2 === 0;
      return P({ plant: false, y: 46, lean: 0, aN: [60, 90], aF: [40, 100], lN: [92, -2], lF: [10, -100], flip: turn, face: 'shout' });
    }
    case 'rapid': {
      const k = Math.floor(t / 3) % 3;
      if (s.button === 'K') return P({ lean: -20, lN: [[80, 110, 60][k], -4], lF: [-10, -8], aN: [60, 90], aF: [20, 100], hand: 'open', face: 'shout' });
      if (f.def.build === 'beast') return P({ lean: 30, head: -20, aN: [100 + k * 20, 20], aF: [60 - k * 20, 30], lN: [40, -80], lF: [-20, -70], hand: 'open', face: 'shout' });
      return P({ lean: 14, aN: [[80, 100, 70][k], 0], aF: [[100, 70, 90][k], 0], hand: 'open', lN: [34, -40], lF: [-34, -40], face: 'shout' });
    }
    case 'rush': {
      if (t < 8) return P({ lean: -10, aN: [30, 100], aF: [20, 110], lN: [30, -40], lF: [-30, -30] });
      switch (f.id) {
        case 'tora':
          return P({ plant: false, y: 40, rot: 76, lean: 0, head: -40, aN: [176, 0], aF: [170, 4], lN: [0, -6], lF: [-6, -6], hand: 'open', face: 'shout' });
        case 'rio':
        case 'varga':
          return P({ plant: false, y: 24, rot: t * 30, lean: 30, head: -20, aN: [60, 120], aF: [40, 130], lN: [110, -150], lF: [90, -150] });
        case 'zar':
          return P({ plant: false, y: 46, rot: s.button === 'P' ? 80 : 0, lean: 0, head: -40, aN: [176, 0], aF: [170, 4], lN: s.button === 'K' ? [100 + (t % 8) * 6, 0] : [0, -6], lF: [-6, -6], face: 'shout' });
        default:
          return s.guard === 'low'
            ? P({ aF: [80, 0], aN: [40, 100], lean: 30, lN: [60, -80], lF: [-30, -20], face: 'shout' }, CROUCH)
            : P({ aF: [94, 0], aN: [40, 100], lean: 28, x: 4, lN: [40, -20], lF: [-34, 0], face: 'shout' });
      }
    }
    case 'grab':
      return t < 3 ? P({ aN: [60, 60], aF: [50, 60], lean: 10, hand: 'open' }) : P({ aN: [86, 20], aF: [80, 24], lean: 20, hand: 'open' });
    case 'lariat': {
      const turn = Math.floor(t / 6) % 2 === 0;
      return P({ aN: [90, 0], aF: [-90, 0], lean: 0, hand: 'fist', flip: turn, face: 'shout' });
    }
    case 'breath':
      return t < 14 ? P({ lean: -10, head: -14 }) : P({ lean: 20, head: 14, aN: [20, 30], aF: [10, 30], face: 'shout' });
  }
}
