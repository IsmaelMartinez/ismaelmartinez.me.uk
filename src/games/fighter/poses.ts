/**
 * Every frame of animation, as a pose of one 3D skeleton (see `body.ts`).
 *
 * The arcade drew a few thousand hand-painted cels per fighter, and what
 * made them move like fighters rather than puppets was not the number of
 * cels so much as what each one did: a punch winds the shoulders back,
 * snaps them through so the fist arrives with the body behind it, holds,
 * recoils, and settles back into a stance that breathes; a kick chambers
 * the knee before it extends and turns the hips over; a hit snaps the head
 * before the body follows. So every move here is a short list of held
 * keyframes (anticipation, contact, follow-through, return) mapped onto its
 * frame data in `fight.ts`, not one pose held for its whole duration; the
 * frames are held rather than tweened, which is most of what makes the
 * motion read as sprite animation, and the in-betweens are blends (`mix`)
 * of their neighbours drawn as poses in their own right.
 *
 * Angles are degrees, facing right, y down: a limb's angle is measured from
 * straight down, positive swinging toward the opponent (90 points at him,
 * 180 straight up); an elbow bend folds the forearm forward (positive), a
 * knee folds back (negative). The near arm and leg are on the viewer's side
 * and are the rear ones, as in the arcade's stance: the lead fist and the
 * lead foot are the far ones. `twist` turns the chest toward the viewer
 * (the stance is three quarters, about 42), so a rear-hand punch drives it
 * toward profile; `yaw` turns the whole body, which is how a whirlwind kick
 * spins.
 *
 * DOM-free: `poseFor` reads the fight state and the fighter's frame, nothing
 * else, so the tests can assert that every state has a pose.
 */
import { AIR_FRAMES, type FighterState } from './fight';
import type { NormalDef } from './roster';
import type { CharId } from './roster';

export type Limb = readonly [number, number] | readonly [number, number, number];

export interface Pose {
  /** Hip offset forward from the fighter's x, px. */
  x: number;
  /** Hip height above the feet's floor when not planted. */
  y: number;
  /** Lower the figure until its lowest foot stands on the floor. */
  plant: boolean;
  /** Whole-body roll about the hips, degrees, positive pitching forward (a somersault). */
  rot: number;
  /** Torso lean from upright, positive forward. */
  lean: number;
  /** Head tilt relative to the torso, positive chin down. */
  head: number;
  /**
   * Near (viewer's side, the rear) arm: upper angle, elbow bend, and an
   * optional swing of the elbow out toward the viewer.
   */
  aN: Limb;
  /** Far arm, the lead one. */
  aF: Limb;
  /** Near leg: thigh angle, knee bend, optional swing out. */
  lN: Limb;
  lF: Limb;
  /** The chest's turn toward the viewer, degrees (0 profile, 90 face-on). */
  twist?: number;
  /** The hips' turn, which otherwise follows the chest part way. */
  hipTwist?: number;
  /** Whole-body turn about the vertical, degrees: a spin. */
  yaw?: number;
  /** Ankles, near and far: degrees the toes point down from the shin's square. */
  foot?: readonly [number, number];
  /** Loose cloth and hair blown back (positive) or forward by movement. */
  wind?: number;
  /** Hands: closed fists, or open palms (a fireball, a grab, a slap). */
  hand: 'fist' | 'open';
  /** Stretch on the near/far arm and leg (the yogi's long limbs reach). */
  stretch?: { aN?: number; aF?: number; lN?: number; lF?: number };
  /** Draw the figure mirrored this frame. */
  flip?: boolean;
  /** Eyes shut and mouth open (hit, KO), or shouting (attacking). */
  face?: 'hurt' | 'shout' | 'calm';
}

const BASE: Pose = {
  x: 0,
  y: 0,
  plant: true,
  rot: 0,
  lean: 8,
  head: -6,
  twist: 42,
  aN: [22, 118],
  aF: [52, 80],
  lN: [-18, -14],
  lF: [30, -36],
  hand: 'fist'
};

const P = (over: Partial<Pose>, base: Pose = BASE): Pose => ({ ...base, ...over });

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const limbMix = (a: Limb, b: Limb, t: number): Limb => {
  const out: number[] = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  if (a[2] !== undefined || b[2] !== undefined) out.push(lerp(a[2] ?? 10, b[2] ?? 10, t));
  return out as unknown as Limb;
};

/** An in-between: every angle part way from `a` to `b`, rounded so near-identical frames share a sprite. */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const r = (v: number) => Math.round(v);
  const n = (x: number | undefined, y: number | undefined, d: number) => r(lerp(x ?? d, y ?? d, t));
  const round = (l: Limb): Limb => l.map(r) as unknown as Limb;
  return {
    x: r(lerp(a.x, b.x, t)),
    y: r(lerp(a.y, b.y, t)),
    plant: t < 0.5 ? a.plant : b.plant,
    rot: r(lerp(a.rot, b.rot, t)),
    lean: r(lerp(a.lean, b.lean, t)),
    head: r(lerp(a.head, b.head, t)),
    twist: n(a.twist, b.twist, 42),
    hipTwist: a.hipTwist === undefined && b.hipTwist === undefined ? undefined : n(a.hipTwist, b.hipTwist, 36),
    yaw: a.yaw === undefined && b.yaw === undefined ? undefined : n(a.yaw, b.yaw, 0),
    foot: a.foot || b.foot ? [n(a.foot?.[0], b.foot?.[0], 0), n(a.foot?.[1], b.foot?.[1], 0)] : undefined,
    wind: a.wind === undefined && b.wind === undefined ? undefined : Math.round(lerp(a.wind ?? 0, b.wind ?? 0, t) * 4) / 4,
    aN: round(limbMix(a.aN, b.aN, t)),
    aF: round(limbMix(a.aF, b.aF, t)),
    lN: round(limbMix(a.lN, b.lN, t)),
    lF: round(limbMix(a.lF, b.lF, t)),
    hand: t < 0.5 ? a.hand : b.hand,
    stretch: t < 0.5 ? a.stretch : b.stretch,
    face: t < 0.5 ? a.face : b.face
  };
}

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

/** The breath: knees sink, shoulders rise and fall, four frames. */
const BREATH = [0, 1, 2, 1];

const STANCES: Record<Stance, (b: number) => Pose> = {
  karate: b => P({ lN: [-18, -14 - b * 4], lF: [30 + b, -36 - b * 5], aF: [52 - b, 80 + b * 2], aN: [22 - b, 118 + b * 2], lean: 8 + b }),
  boxer: b => P({ lean: 16 + b, head: 6, twist: 34, aN: [34 - b, 128], aF: [52, 98 + b * 2], lN: [-16, -16 - b * 5], lF: [26, -30 - b * 5], foot: [28, 0] }),
  sumo: b => P({ lean: 16, head: -6, twist: 56, aN: [56, 30 - b * 3, 30], aF: [62, 36 - b * 3], lN: [-34, -46 - b * 5, 18], lF: [40, -50 - b * 5, 18], hand: 'open' }),
  beast: b => P({ lean: 38 + b, head: -30, twist: 50, aN: [30 + b * 3, 34, 24], aF: [40, 30], lN: [-26, -54 - b * 4], lF: [34, -58 - b * 4], hand: 'open' }),
  wrestler: b => P({ lean: 18, head: -10, twist: 50, aN: [44, 56 + b * 3, 24], aF: [56, 50 + b * 3], lN: [-24, -24 - b * 4, 10], lF: [30, -30 - b * 4, 10], hand: 'open' }),
  yogi: b => P({ lean: 2, head: -6, twist: 48, aN: [56, 124 + b * 4], aF: [62, 112 + b * 4], lN: [-12, -8], lF: [16, -10], hand: 'fist' }),
  kungfu: b => P({ lean: 4, head: -4, twist: 46, aN: [36, 104], aF: [74, 38 + b * 4], lN: [-20, -18 - b * 3], lF: [34, -42 - b * 3], foot: [30, 0], hand: 'open' }),
  soldier: b => P({ lean: 6, head: -4, twist: 40, aN: [30, 104], aF: [48, 92 + b * 2], lN: [-22, -10 - b * 4], lF: [24, -14 - b * 3] }),
  muay: b => P({ lean: -2, head: -8, twist: 50, aN: [30, 128], aF: [44, 116], lN: [-14, -10], lF: [34 + b * 3, -46 - b * 5], foot: [0, 30] }),
  claw: b => P({ lean: 12, head: -2, twist: 44, aN: [28, 92], aF: [76, 26 - b * 3], lN: [-22, -30 - b * 3], lF: [30, -38 - b * 3] }),
  dictator: b => P({ lean: -2, head: -8, twist: 60, aN: [14, 34, 28], aF: [10, 30, 24], lN: [-12, -6 - b * 2], lF: [16, -8 - b * 2] })
};

const IDLE: Record<Stance, Pose[]> = Object.fromEntries(
  (Object.keys(STANCES) as Stance[]).map(s => [s, BREATH.map(b => STANCES[s](b))])
) as Record<Stance, Pose[]>;

/**
 * Eight walking frames: the legs scissor under an upper body that bobs and
 * counter-turns a little, the arms keeping their guard. Backward walks play
 * the cycle in reverse, a shade more upright.
 */
function walk(stance: Pose, t: number, back: boolean): Pose {
  const phase = Math.floor(t / 5) % 8;
  const a = (phase / 8) * Math.PI * 2;
  const swing = Math.sin(a) * 26;
  const liftN = Math.max(0, Math.cos(a)) * 38;
  const liftF = Math.max(0, -Math.cos(a)) * 38;
  return P(
    {
      lN: [-6 - swing, -10 - liftN, stance.lN[2] ?? 4],
      lF: [14 + swing, -14 - liftF, stance.lF[2] ?? 4],
      foot: [Math.round(liftN * 0.5), Math.round(liftF * 0.5)],
      twist: (stance.twist ?? 42) + Math.round(Math.sin(a) * 5),
      lean: stance.lean + (back ? -4 : 2) + Math.round(Math.abs(Math.sin(a)) * 2),
      aN: [stance.aN[0] + Math.round(Math.sin(a) * 6), stance.aN[1], stance.aN[2] ?? 14],
      wind: back ? -0.5 : 0.5
    },
    stance
  );
}

const CROUCH = P({ lean: 22, head: -14, twist: 46, lN: [44, -136], lF: [80, -120], foot: [30, 0], aN: [30, 110], aF: [52, 90] });
const CROUCH_GUARD = P({ lean: 10, head: -18, twist: 30, aN: [66, 118, 20], aF: [72, 124] }, CROUCH);
const STAND_GUARD = P({ lean: -4, head: -12, twist: 30, aN: [62, 122, 22], aF: [70, 128], lN: [-22, -12], lF: [24, -24] });
const TUCK = P({ plant: false, y: 46, lean: 18, head: -8, aN: [56, 110], aF: [70, 100], lN: [96, -132], lF: [74, -124], foot: [40, 40] });

/** A move's keys: anticipation, the hit, and (optionally) the follow-through it recoils from. */
interface Seq {
  windup?: Pose;
  chamber: Pose;
  hit: Pose;
  follow?: Pose;
}

/**
 * Map a move's keys onto its frame data: the wind-up and the chamber
 * through the start-up, the hit through the active frames, then the
 * follow-through, a recoil back through the chamber, and a last in-between
 * on the way home to the stance.
 */
function sequence(t: number, n: NormalDef, seq: Seq, home: Pose): Pose {
  const { startup, active, recovery } = n;
  if (t < startup) return seq.windup && t < Math.ceil(startup / 2) ? seq.windup : seq.chamber;
  if (t < startup + active) return seq.hit;
  const r = (t - startup - active) / Math.max(1, recovery);
  if (r < 0.3) return seq.follow ?? mix(seq.hit, seq.chamber, 0.25);
  if (r < 0.62) return mix(seq.hit, seq.chamber, 0.7);
  if (r < 0.85) return seq.chamber;
  return mix(seq.chamber, home, 0.5);
}

/** The normals, built over the fighter's stance so each keeps his own guard while he strikes. */
type Key = `${'stand' | 'crouch' | 'air'}${'P' | 'K'}${0 | 1 | 2}`;
const ATTACK: Record<Key, (s: Pose) => Seq> = {
  // Jab: the lead hand straight out, shoulder turned in behind it.
  standP0: s => ({
    chamber: P({ aF: [70, 60], twist: 36 }, s),
    hit: P({ aF: [90, 2, 4], aN: [24, 122], twist: 24, lean: s.lean + 4, face: 'shout' }, s),
    follow: P({ aF: [86, 14], twist: 28 }, s)
  }),
  // Strong: the rear hand, the hips turning it over.
  standP1: s => ({
    windup: P({ aN: [10, 130], twist: 56, lean: s.lean - 2 }, s),
    chamber: P({ aN: [56, 70, 20], twist: 34 }, s),
    hit: P({ aN: [90, 0, 6], aF: [40, 110], twist: 4, hipTwist: 22, lean: s.lean + 8, x: 3, foot: [36, 0], face: 'shout' }, s),
    follow: P({ aN: [88, 10, 6], aF: [40, 110], twist: 8, hipTwist: 24, lean: s.lean + 9, x: 3, foot: [30, 0] }, s)
  }),
  // Fierce: a stepping straight with everything behind it.
  standP2: s => ({
    windup: P({ aN: [0, 140, 10], aF: [70, 70], twist: 66, hipTwist: 50, lean: s.lean - 6, x: -2 }, s),
    chamber: P({ aN: [50, 90, 24], twist: 44, lean: s.lean + 4, x: 1 }, s),
    hit: P({ aN: [94, -4, 4], aF: [30, 120], twist: -8, hipTwist: 10, lean: 26, x: 7, lN: [-34, 0], lF: [40, -30], foot: [44, 0], face: 'shout' }, s),
    follow: P({ aN: [92, 6, 4], aF: [30, 120], twist: -4, hipTwist: 12, lean: 28, x: 7, lN: [-34, -2], lF: [40, -30], foot: [44, 0], face: 'shout' }, s)
  }),
  // Short: a snapping low front kick off the lead foot.
  standK0: s => ({
    chamber: P({ lF: [64, -96], foot: [0, 30], lean: s.lean - 4 }, s),
    hit: P({ lF: [72, -6], foot: [0, 52], lean: -6, lN: [-12, -10], twist: 44, face: 'shout' }, s),
    follow: P({ lF: [68, -24], foot: [0, 48], lean: -4 }, s)
  }),
  // Forward: the rear leg turned over into a body-high roundhouse.
  standK1: s => ({
    windup: P({ lN: [40, -110, 20], twist: 56, hipTwist: 54, lean: s.lean - 4 }, s),
    chamber: P({ lN: [74, -110, 30], lF: [8, -12], twist: 70, hipTwist: 76, lean: -6, foot: [40, 0] }, s),
    hit: P({ lN: [100, -4, 24], lF: [6, -10], twist: 76, hipTwist: 86, lean: -20, foot: [56, 0], aN: [40, 80], aF: [60, 100], face: 'shout' }, s),
    follow: P({ lN: [96, -24, 24], lF: [6, -10], twist: 74, hipTwist: 82, lean: -18, foot: [56, 0], aN: [40, 80] }, s)
  }),
  // Roundhouse: the rear leg to the head, the whole body opening behind it.
  standK2: s => ({
    windup: P({ lN: [30, -90, 16], twist: 60, hipTwist: 60, lean: s.lean - 6, aN: [10, 110] }, s),
    chamber: P({ lN: [92, -126, 40], lF: [4, -14], twist: 82, hipTwist: 92, lean: -14, foot: [40, 0], aN: [10, 80], aF: [60, 90] }, s),
    hit: P({ lN: [132, -6, 30], lF: [-4, -8], twist: 86, hipTwist: 100, lean: -34, head: 4, foot: [60, 0], aN: [-10, 70, 30], aF: [70, 90], face: 'shout' }, s),
    follow: P({ lN: [124, -30, 30], lF: [-2, -8], twist: 84, hipTwist: 96, lean: -30, foot: [60, 0], aN: [0, 70, 30], aF: [70, 90] }, s)
  }),
  crouchP0: () => ({
    chamber: P({ aF: [70, 60] }, CROUCH),
    hit: P({ aF: [90, 4], twist: 30, face: 'shout' }, CROUCH),
    follow: P({ aF: [86, 14], twist: 32 }, CROUCH)
  }),
  crouchP1: () => ({
    chamber: P({ aN: [50, 80, 20], twist: 50 }, CROUCH),
    hit: P({ aN: [90, 0, 6], aF: [40, 110], twist: 8, lean: 28, face: 'shout' }, CROUCH),
    follow: P({ aN: [88, 10], aF: [40, 110], twist: 10, lean: 28 }, CROUCH)
  }),
  // The crouching fierce: an uppercut that drives up out of the crouch, the anti-air.
  crouchP2: () => ({
    windup: P({ aN: [10, 120, 10], twist: 60, lean: 30 }, CROUCH),
    chamber: P({ aN: [70, 110, 14], twist: 34, lean: 12, lN: [30, -110], lF: [60, -96] }, CROUCH),
    hit: P({ aN: [174, 4, 10], aF: [40, 100], twist: 8, lean: -6, head: -16, lN: [10, -60], lF: [40, -40], foot: [40, 0], face: 'shout' }, CROUCH),
    follow: P({ aN: [166, 14, 10], aF: [40, 100], twist: 10, lean: -4, head: -14, lN: [14, -70], lF: [44, -50], foot: [40, 0] }, CROUCH)
  }),
  crouchK0: () => ({
    chamber: P({ lF: [76, -110], foot: [30, 20] }, CROUCH),
    hit: P({ lF: [82, -6], foot: [30, 60], lean: 16, face: 'shout' }, CROUCH),
    follow: P({ lF: [80, -24], foot: [30, 56] }, CROUCH)
  }),
  crouchK1: () => ({
    chamber: P({ lF: [76, -110], foot: [30, 20], lean: 26 }, CROUCH),
    hit: P({ lF: [86, -2], foot: [30, 64], lean: 12, x: 3, face: 'shout' }, CROUCH),
    follow: P({ lF: [84, -20], foot: [30, 60], lean: 14, x: 3 }, CROUCH)
  }),
  // The sweep: the rear leg swung round along the floor, a hand down for balance.
  crouchK2: () => ({
    windup: P({ lN: [60, -140, 20], twist: 64, hipTwist: 70, lean: 34 }, CROUCH),
    chamber: P({ lN: [70, -60, 40], lF: [92, -150], twist: 84, hipTwist: 96, lean: 40, aF: [30, 10], aN: [10, 20], hand: 'open' }, CROUCH),
    hit: P({ lN: [86, -2, 10], lF: [96, -150], twist: 96, hipTwist: 110, lean: 42, head: -26, aF: [26, 6], aN: [-6, 20], foot: [60, 20], hand: 'open', face: 'shout' }, CROUCH),
    follow: P({ lN: [80, -6, 20], lF: [96, -150], twist: 104, hipTwist: 118, lean: 40, head: -24, aF: [26, 6], aN: [-6, 20], foot: [60, 20], hand: 'open' }, CROUCH)
  }),
  airP0: () => ({ chamber: P({ aF: [70, 60] }, TUCK), hit: P({ aF: [70, 2], twist: 28, face: 'shout' }, TUCK) }),
  airP1: () => ({ chamber: P({ aN: [40, 100, 20], twist: 56 }, TUCK), hit: P({ aN: [62, 0, 6], twist: 16, lean: 24, face: 'shout' }, TUCK) }),
  airP2: () => ({
    chamber: P({ aN: [130, 70, 10], twist: 60, lean: 4 }, TUCK),
    hit: P({ aN: [56, 0, 6], aF: [30, 110], twist: 10, lean: 32, head: 0, face: 'shout' }, TUCK)
  }),
  airK0: () => ({ chamber: P({ lF: [84, -110] }, TUCK), hit: P({ y: 40, lF: [52, -4], lN: [40, -116], foot: [40, 60], face: 'shout' }, TUCK) }),
  airK1: () => ({ chamber: P({ lF: [84, -110] }, TUCK), hit: P({ y: 40, lF: [48, 0], lN: [24, -100], lean: -10, foot: [40, 64], face: 'shout' }, TUCK) }),
  airK2: () => ({
    chamber: P({ lN: [90, -120, 30], twist: 70, lean: -4 }, TUCK),
    hit: P({ y: 40, lN: [56, 0, 20], lF: [50, -120], twist: 80, hipTwist: 90, lean: -24, foot: [64, 40], face: 'shout' }, TUCK)
  })
};

/** The boxer throws every button as a punch; his kick buttons are body shots. */
const BOXER: Record<'P' | 'K', Record<0 | 1 | 2, (s: Pose) => Seq>> = {
  P: { 0: ATTACK.standP0, 1: ATTACK.standP1, 2: ATTACK.standP2 },
  K: {
    0: s => ({ chamber: P({ aF: [50, 70], lean: 26 }, s), hit: P({ aF: [78, 4], lean: 30, twist: 22, face: 'shout' }, s) }),
    1: s => ({
      chamber: P({ aN: [30, 90, 20], lean: 26, twist: 50 }, s),
      hit: P({ aN: [76, 2, 6], aF: [40, 110], lean: 34, twist: 10, x: 4, foot: [40, 0], face: 'shout' }, s)
    }),
    2: s => ({
      windup: P({ aN: [0, 120, 10], lean: 30, twist: 64 }, s),
      chamber: P({ aN: [60, 60, 20], lean: 30, twist: 40 }, s),
      hit: P({ aN: [122, 20, 6], aF: [40, 110], lean: 20, twist: 4, x: 5, foot: [44, 0], face: 'shout' }, s)
    })
  }
};

/** The stretching yogi's limbs reach: which segment a normal strikes with. */
function strikeLimb(key: Key): keyof NonNullable<Pose['stretch']> {
  const posture = key.slice(0, -2);
  const button = key[key.length - 2];
  const s = key[key.length - 1];
  if (button === 'P') return s === '0' || posture === 'air' ? 'aF' : 'aN';
  if (posture === 'stand') return s === '0' ? 'lF' : 'lN';
  if (posture === 'crouch') return s === '2' ? 'lN' : 'lF';
  return s === '2' ? 'lN' : 'lF';
}

function cycle<T>(frames: readonly T[], t: number, hold: number): T {
  return frames[Math.floor(t / hold) % frames.length];
}

/** Rotation the forward jump's somersault has reached, in eighths of a turn so the frames are the arcade's few. */
function flipAngle(f: FighterState): number {
  const p = Math.min(1, f.frame / AIR_FRAMES);
  if (p < 0.14 || p > 0.86) return 0;
  return Math.round((((p - 0.14) / 0.72) * 360) / 45) * 45 * f.jumpDir;
}

/** A spin's turn, in twelfths so a spinning move draws a dozen sprites, not hundreds. */
const spin = (deg: number): number => (((Math.round(deg / 30) * 30) % 360) + 360) % 360;

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
      return cycle(idle, clock, 10);
    case 'land':
      // The landing absorbs into the knees before the stance comes back.
      return t < 2 ? P({ lN: [10, -110], lF: [50, -100], lean: 24, head: -12, wind: -0.5 }, base) : mix(P({ lN: [0, -70], lF: [40, -70], lean: 16 }, base), base, 0.5);
    case 'walk': {
      const forward = Math.sign(f.vx) === f.facing;
      return walk(base, forward ? clock : 400 - (clock % 400), !forward);
    }
    case 'guard':
      return STAND_GUARD;
    case 'crouch':
      return t < 2 ? mix(base, CROUCH, 0.5) : CROUCH;
    case 'prejump':
      return P({ lN: [8, -84], lF: [44, -84], lean: 18, head: -10, aN: [30, 100], aF: [50, 80] }, base);
    case 'jump':
      return jumpPose(f, base);
    case 'attack': {
      const a = f.action;
      if (!a?.normal) return base;
      const key = `${a.posture}${a.button}${a.strength}` as Key;
      const seq = stance === 'boxer' && a.posture === 'stand' ? BOXER[a.button][a.strength](base) : ATTACK[key](base);
      const n = a.normal;
      const active = t >= n.startup && t < n.startup + n.active;
      return withStretch(f, sequence(t, n, seq, a.posture === 'crouch' ? CROUCH : base), key, active);
    }
    case 'special':
      return specialPose(f, base);
    case 'blockstun':
      // The guard takes the blow: a frame pushed back, then held.
      if (f.low) return t < 3 ? P({ lean: 4, x: -2 }, CROUCH_GUARD) : CROUCH_GUARD;
      return t < 3 ? P({ lean: -10, head: -16, x: -2, lN: [-26, -10] }, STAND_GUARD) : STAND_GUARD;
    case 'hitstun':
      return hitPose(f, base);
    case 'fall':
    case 'ko':
      return fallPose(f);
    case 'down': {
      if (t < 5) return P({ y: 6, rot: -86, lean: -8, head: -20, aN: [150, 40], aF: [130, 30], lN: [50, -50], lF: [30, -30], face: 'hurt' }, LYING);
      return t > 26 ? P({ lN: [70, -120], lF: [60, -110], aN: [120, 60], head: -10 }, LYING) : LYING;
    }
    case 'getup': {
      if (t < 6) return P({ plant: false, y: 12, rot: -60, lean: 20, head: -10, lN: [110, -140], lF: [96, -130], aN: [40, 40], aF: [20, 40] });
      if (t < 12) return P({ lean: 34, head: -20, lN: [70, -150], lF: [10, -100, 10], aN: [10, 30], aF: [30, 10], hand: 'open' }, CROUCH);
      if (t < 17) return CROUCH;
      return mix(CROUCH, base, 0.6);
    }
    case 'dizzy': {
      const k = Math.floor(clock / 12) % 4;
      const sway = [-8, 0, 8, 0][k];
      return P({ lean: 14 + sway, head: 20 - sway, twist: 60 + sway, aN: [6, 14, 20], aF: [4, 16], hand: 'open', lN: [-6, -24], lF: [16, -30], x: sway / 3, face: 'hurt' }, base);
    }
    case 'throw':
      return throwPose(f, base);
    case 'thrown': {
      const a = Math.round((-90 + t * 6) / 30) * 30;
      return P({ plant: false, y: 34, rot: a, lean: -20, head: -30, twist: 70, aN: [140, 30], aF: [120, 40], lN: [60, -70], lF: [20, -40], face: 'hurt' });
    }
    case 'win':
      return winPose(f, base, clock);
    case 'lose':
      return P({ lean: 30, head: 24, twist: 60, aN: [4, 8, 10], aF: [2, 6], hand: 'open', lN: [-8, -20], lF: [14, -26] });
  }
}

function jumpPose(f: FighterState, base: Pose): Pose {
  const t = f.frame;
  if (f.action?.normal) {
    const key = `air${f.action.button}${f.action.strength}` as Key;
    const n = f.action.normal;
    const seq = ATTACK[key](base);
    const active = t >= n.startup && t < n.startup + n.active;
    return withStretch(f, t < n.startup ? seq.chamber : active || t < n.startup + n.active + 6 ? seq.hit : seq.chamber, key, active);
  }
  const heavy = f.id === 'boris' || f.id === 'tora';
  if (f.jumpDir !== 0 && !heavy) {
    const rot = flipAngle(f);
    if (rot !== 0) return P({ rot, lean: 30, head: -10, aN: [80, 120], aF: [90, 110], lN: [110, -150], lF: [100, -150], foot: [40, 40], wind: 0 }, TUCK);
  }
  // Straight up: the legs gather on the way up, tuck at the top, reach for the floor coming down.
  if (f.vy > 3) return P({ plant: false, y: 44, lN: [10, -40], lF: [36, -60], aN: [80, 120], aF: [120, 40], lean: 4, foot: [50, 40], wind: -1 }, base);
  if (f.vy > -2) return P({ wind: 0 }, TUCK);
  return P({ plant: false, y: 44, lN: [6, -30], lF: [40, -50], lean: 12, head: -10, foot: [40, 30], wind: 1 }, base);
}

/** A hit: the head snaps first, the body follows, then it recovers toward the stance. */
function hitPose(f: FighterState, base: Pose): Pose {
  const t = f.frame;
  if (f.low) {
    const reel = P({ lean: -6, head: -34, twist: 70, aN: [20, 60], aF: [10, 50], hand: 'open', face: 'hurt' }, CROUCH);
    return t < 3 ? P({ x: -3, head: -44 }, reel) : t < 10 ? reel : mix(reel, CROUCH, 0.5);
  }
  if (f.hitHigh) {
    const snap = P({ lean: -26, head: -40, twist: 72, hipTwist: 50, aN: [24, 30, 30], aF: [-6, 30], lN: [-30, -6], lF: [30, -20], hand: 'open', x: -4, face: 'hurt' });
    const reel = P({ lean: -16, head: -24, twist: 64, aN: [30, 50, 20], aF: [6, 50], lN: [-26, -10], lF: [26, -30], hand: 'open', x: -3, face: 'hurt' });
    return t < 3 ? snap : t < 9 ? reel : mix(reel, base, 0.5);
  }
  // In the gut: doubled over the blow.
  const fold = P({ lean: 42, head: 14, twist: 60, aN: [40, 70, 10], aF: [50, 60], lN: [-30, -24], lF: [20, -40], hand: 'open', x: -4, face: 'hurt' });
  const reel = P({ lean: 30, head: 6, twist: 56, aN: [40, 80, 10], aF: [50, 70], lN: [-26, -24], lF: [22, -40], x: -3, face: 'hurt' });
  return t < 3 ? fold : t < 9 ? reel : mix(reel, base, 0.5);
}

const LYING = P({ plant: false, y: 7, rot: -90, lean: 0, head: 8, twist: 60, aN: [170, 20, 10], aF: [150, 30], lN: [8, -14], lF: [-6, -10], hand: 'open', face: 'hurt' });

/** Knocked off the feet: arched on the way up, legs over on the way down. */
function fallPose(f: FighterState): Pose {
  if (f.y > 2 || f.vy > 0) {
    if (f.vy > 1) return P({ plant: false, y: 40, rot: -40, lean: -24, head: -36, twist: 70, aN: [150, 30, 30], aF: [130, 30], lN: [30, -60], lF: [4, -30], hand: 'open', face: 'hurt' });
    return P({ plant: false, y: 40, rot: -74, lean: -10, head: -30, twist: 64, aN: [160, 20, 30], aF: [140, 30], lN: [60, -70], lF: [36, -40], hand: 'open', face: 'hurt' });
  }
  return f.state === 'ko' && f.frame % 40 < 4 ? P({ y: 10, rot: -84 }, LYING) : LYING;
}

function throwPose(f: FighterState, base: Pose): Pose {
  const t = f.frame;
  const g = f.grab;
  if (t < 5) return P({ aN: [80, 40, 20], aF: [76, 40], hand: 'open', lean: 22, twist: 36, x: 2 }, base);
  if (g?.slam) {
    // The suplex: arms locked round him, the back arching over.
    if (t < 14) return P({ aN: [150, 30, 20], aF: [140, 40], lean: -10, head: -20, hand: 'open', lN: [-10, -30], lF: [20, -40] });
    return P({ plant: false, y: 30, rot: -70, aN: [176, 10, 20], aF: [170, 10], lean: -20, head: -30, hand: 'open', lN: [10, -40], lF: [20, -50] });
  }
  if (g?.backward) {
    // Turned and heaved over the shoulder.
    return t < 14
      ? P({ aN: [150, 30, 20], aF: [150, 30], twist: 80, hipTwist: 70, lean: 0, hand: 'open' }, base)
      : P({ aN: [100, 10, 20], aF: [90, 20], twist: 110, hipTwist: 100, lean: 30, hand: 'open', lN: [20, -30], lF: [-10, -20], face: 'shout' }, base);
  }
  return t < 14
    ? P({ aN: [150, 20, 20], aF: [140, 30], lean: -6, twist: 50, hand: 'open', lN: [-30, -10] }, base)
    : P({ aN: [96, 0, 10], aF: [90, 10], lean: 30, twist: 20, x: 4, hand: 'open', lN: [-34, 0], lF: [40, -30], foot: [44, 0], face: 'shout' }, base);
}

function withStretch(f: FighterState, pose: Pose, key: Key, active: boolean): Pose {
  if (!active || f.def.reach < 1.2) return pose;
  const limb = strikeLimb(key);
  const s = key.endsWith('0') ? 1 + (f.def.reach - 1) * 0.3 : f.def.reach;
  return { ...pose, stretch: { [limb]: s } };
}

/** Each fighter's victory, two or three keys looping. */
function winPose(f: FighterState, base: Pose, clock: number): Pose {
  const t = f.frame;
  if (t < 20) return base;
  const beat = Math.floor(clock / 20) % 2;
  switch (STANCE_OF[f.id]) {
    case 'boxer':
      return P({ aN: [170, 10, 20], aF: [166, 16], lean: -6, twist: 70, head: -12, face: 'shout', y: beat * 2 });
    case 'sumo':
      // The shiko stamp: one leg high, then the other.
      return beat
        ? P({ lN: [70, -40, 30], lF: [-4, -20, 20], lean: 30, twist: 80, aN: [40, 40, 30], aF: [60, 40], hand: 'open' })
        : P({ lF: [80, -40, 30], lN: [-30, -20, 20], lean: 24, twist: 80, aN: [50, 40, 30], aF: [40, 40], hand: 'open' });
    case 'beast':
      return P({ aN: [150, 30, 30], aF: [140, 30], lean: -10 + beat * 6, head: -26, hand: 'open', face: 'shout', twist: 76 }, base);
    case 'kungfu':
      return beat ? P({ aN: [120, 60, 20], aF: [150, 40], lN: [70, -150], lF: [0, -6], lean: 0, twist: 60, hand: 'open', face: 'shout' }) : P({ aN: [20, 110], aF: [20, 110], lN: [-6, -6], lF: [10, -6], twist: 80, hand: 'open', head: -6 });
    case 'yogi':
      return P({ aN: [120, 150, 10], aF: [110, 150], lN: [60, -150], lF: [0, 0], lean: 0, head: 6, twist: 80, hand: 'open' });
    case 'dictator':
      return P({ aN: [10, 110, 30], aF: [5, 120, 30], lean: -8 - beat * 2, head: -12, twist: 80 });
    case 'wrestler':
      return P({ aN: [120, 80, 50], aF: [120, 80, 50], lean: -4, twist: 86, head: -14, face: beat ? 'shout' : 'calm', lN: [-20, -6, 20], lF: [20, -6, 20] });
    case 'soldier':
      return P({ aN: [100, 120, 20], aF: [6, 20], lean: -4, twist: 60, head: -10, lN: [-8, -4], lF: [10, -4] });
    case 'muay':
      return P({ aN: [140, 120, 30], aF: [140, 110, 30], twist: 84, lean: -6, head: -10, lN: [-8, -4], lF: [12, -4], face: beat ? 'shout' : 'calm' });
    case 'claw':
      return P({ aF: [160, 10], aN: [30, 120, 20], twist: 70, lean: -4, head: -16, face: 'shout', y: beat * 2 }, base);
    default:
      // The shoto's fist to the sky, held, then lowered to the belt.
      return beat
        ? P({ aN: [174, 0, 10], aF: [30, 100], lean: -4, twist: 70, head: -16, lN: [-10, -6], lF: [16, -10], face: 'shout' })
        : P({ aN: [166, 14, 10], aF: [30, 100], lean: -2, twist: 72, head: -12, lN: [-10, -6], lF: [16, -10] });
  }
}

function specialPose(f: FighterState, base: Pose): Pose {
  const a = f.action;
  const s = a?.special;
  if (!a || !s) return base;
  const t = a.t;
  switch (s.kind) {
    case 'projectile': {
      if (s.style === 'sonic') {
        // Arms crossed over the chest, then flung out and forward.
        if (t < 4) return P({ aN: [60, 130, 30], aF: [60, 130], twist: 70, lean: -6, lF: [30, -40] }, base);
        if (t < 8) return P({ aN: [100, 60, 40], aF: [20, 150], twist: 80, lean: -10 }, base);
        return t < 26 ? P({ aN: [94, 0, 10], aF: [80, 10], twist: 20, lean: 14, x: 3, hand: 'open', face: 'shout' }, base) : mix(P({ aN: [94, 0, 10], aF: [80, 10], twist: 20, lean: 14 }, base), base, 0.5);
      }
      if (s.style === 'fire')
        return t < 6
          ? P({ aN: [20, 130], aF: [20, 120], lean: -10, head: -10, twist: 66 }, base)
          : t < 12
            ? P({ aN: [50, 100], aF: [56, 90], lean: 0, twist: 50, hand: 'open' }, base)
            : P({ aN: [84, 26], aF: [76, 36], lean: 22, head: 10, twist: 40, hand: 'open', face: 'shout' }, base);
      if (s.style === 'tigerLow')
        return t < 12 ? P({ aN: [10, 130], aF: [30, 110], twist: 66, lean: 26 }, CROUCH) : P({ aN: [80, 4], aF: [70, 30], twist: 30, lean: 30, hand: 'open', face: 'shout' }, CROUCH);
      if (s.style === 'tiger')
        // The knee comes up as the hands go out, high.
        return t < 12
          ? P({ aN: [20, 130], aF: [40, 110], lF: [80, -110], foot: [0, 40], twist: 66 }, base)
          : P({ aN: [104, 6], aF: [100, 10], lF: [86, -100], foot: [0, 50], lean: 4, twist: 40, hand: 'open', face: 'shout' }, base);
      // The spirit wave: palms drawn back to the hip, gathered, then driven out.
      if (t < 6) return P({ aN: [-24, 112, 20], aF: [-20, 104], twist: 72, hipTwist: 60, lean: -4, head: -6, lN: [-24, -12], lF: [30, -30], hand: 'open' });
      if (t < 12) return P({ aN: [-36, 120, 20], aF: [-30, 112], twist: 80, hipTwist: 66, lean: -8, head: -8, lN: [-28, -14], lF: [32, -26], hand: 'open', face: 'shout' });
      if (t < 30) return P({ aN: [90, 4, 8], aF: [86, 8], twist: 34, hipTwist: 30, lean: 16, x: 5, lN: [-36, -2], lF: [36, -22], foot: [44, 0], hand: 'open', face: 'shout' });
      return mix(P({ aN: [86, 14], aF: [80, 20], twist: 38, lean: 14, x: 4, lN: [-34, -4], lF: [36, -24], hand: 'open' }), base, 0.5);
    }
    case 'rising': {
      if (t < 3) return P({ aN: [40, 120, 16], twist: 60 }, CROUCH);
      const rising = f.y > 0 && f.vy > -1;
      if (f.y <= 0 && t > 6) return t - (a.until || t) < 6 ? P({ lN: [10, -110], lF: [50, -100], lean: 24 }, base) : CROUCH;
      if (rising) {
        // The rising fist drives straight up and the body turns into it.
        const turn = spin(Math.min(60, (t - 3) * 10));
        return P({ plant: false, y: 40, aN: [176, 2, 6], aF: [40, 100], lean: -8, head: -18, twist: 20, yaw: turn, lN: [-6, -6], lF: [96, -126], foot: [60, 40], face: 'shout', wind: 1 });
      }
      return P({ plant: false, y: 40, aN: [150, 30], aF: [40, 100], lean: 10, twist: 40, lN: [50, -80], lF: [70, -90], foot: [40, 40], wind: -1 });
    }
    case 'flip': {
      if (t < 3) return CROUCH;
      if (f.y <= 0) return CROUCH;
      // A backflip with the kicking leg leading the arc.
      const roll = Math.round(Math.min(360, (t - 3) * 24) / 30) * 30;
      return P({ plant: false, y: 40, rot: -roll, lean: 0, twist: 50, aN: [-30, 30, 30], aF: [-40, 30], lN: [170, -6], lF: [70, -110], foot: [60, 40], face: 'shout' });
    }
    case 'spin': {
      if (f.def.build === 'slim') {
        // The upside-down bird kick, legs split and spinning.
        return P({ plant: false, y: 30, rot: 180, lean: 0, head: 0, twist: 70, yaw: spin(t * 40), aN: [40, 10, 40], aF: [40, 10, 40], lN: [90, 0, 10], lF: [-90, 0, 10], foot: [60, 60], hand: 'open' });
      }
      if (t < 6) return P({ plant: false, y: 30, lN: [70, -110], lF: [20, -40], twist: 70, lean: 0, aN: [40, 110], aF: [60, 100] });
      // The whirlwind: one leg straight out, the body turning under it.
      return P({ plant: false, y: 46, lean: -4, twist: 60, yaw: spin(t * 36), aN: [50, 110], aF: [60, 100], lN: [96, -2, 6], lF: [30, -110], foot: [60, 40], face: 'shout' });
    }
    case 'rapid': {
      const k = Math.floor(t / 3) % 3;
      if (s.button === 'K')
        return P({ lean: -24, twist: 74, hipTwist: 84, lN: [[80, 112, 60][k], -4, 20], lF: [-4, -10], foot: [60, 0], aN: [60, 90, 30], aF: [30, 110], hand: 'open', face: 'shout' });
      if (f.def.build === 'beast')
        return P({ lean: 34, head: -24, twist: 60, aN: [100 + k * 20, 20, 30], aF: [60 - k * 20, 30], lN: [-26, -70], lF: [40, -80], hand: 'open', face: 'shout' });
      // The hundred slaps: palms everywhere.
      return P({ lean: 16, twist: 50, aN: [[84, 104, 70][k], [4, 20, 10][k], 10], aF: [[104, 74, 92][k], [10, 0, 20][k]], hand: 'open', lN: [-34, -46, 16], lF: [40, -50, 16], face: 'shout' });
    }
    case 'rush': {
      if (t < 8) return P({ lean: -10, twist: 60, aN: [30, 100], aF: [20, 110], lN: [-30, -40], lF: [30, -30] }, base);
      if (f.y > 0 || f.vy !== 0) return P({ plant: false, y: 30, rot: -30, lean: -10, aN: [140, 30], aF: [120, 30], lN: [60, -80], lF: [30, -60], face: 'hurt' });
      const done = a.travel <= 0;
      switch (f.id) {
        case 'tora':
          return done
            ? P({ lean: 40, head: -10, aN: [60, 20], aF: [70, 20], hand: 'open' }, CROUCH)
            : P({ plant: false, y: 40, rot: 76, lean: 0, head: -40, twist: 40, aN: [176, 0], aF: [170, 4], lN: [0, -6], lF: [-6, -6], foot: [60, 60], hand: 'open', face: 'shout', wind: 1 });
        case 'rio':
        case 'varga': {
          if (done) return CROUCH;
          const roll = Math.round((t * 30) / 45) * 45;
          return P({ plant: false, y: 22, rot: roll, lean: 40, head: -30, twist: 50, aN: [60, 130], aF: [40, 130], lN: [110, -150], lF: [94, -150], foot: [40, 40] });
        }
        case 'zar':
          return done
            ? CROUCH
            : P({ plant: false, y: 46, rot: s.button === 'P' ? 80 : 0, lean: 0, head: -40, twist: 50, aN: [176, 0], aF: [170, 4], lN: s.button === 'K' ? [100 + (Math.floor(t / 3) % 3) * 10, 0] : [0, -6], lF: [-6, -6], foot: [60, 60], face: 'shout', wind: 1 });
        default:
          if (s.guard === 'low')
            return done
              ? CROUCH
              : P({ aN: [140, 20, 10], aF: [40, 100], twist: 20, lean: 20, lN: [10, -80], lF: [50, -50], foot: [40, 0], face: 'shout', wind: 1 }, CROUCH);
          return done
            ? mix(base, P({ aN: [90, 0], lean: 24 }, base), 0.5)
            : P({ aN: [94, 0, 6], aF: [40, 110], twist: 0, lean: 30, x: 4, lN: [-40, 0], lF: [44, -26], foot: [50, 0], face: 'shout', wind: 1 });
      }
    }
    case 'grab':
      return t < 3 ? P({ aN: [60, 60, 30], aF: [50, 60], lean: 14, twist: 60, hand: 'open' }, base) : P({ aN: [86, 20, 30], aF: [80, 24], lean: 24, twist: 40, hand: 'open', x: 3 }, base);
    case 'lariat':
      // Arms straight out to both sides, the body turning between them.
      return P({ aN: [90, 0, 84], aF: [90, 0, 84], lean: 0, twist: 70, yaw: spin(t * 30), hand: 'fist', lN: [-20, -20, 16], lF: [20, -20, 16], face: 'shout' });
    case 'breath':
      return t < 14
        ? P({ lean: -14, head: -18, twist: 60, aN: [30, 90], aF: [30, 80] }, base)
        : P({ lean: 22, head: 16, twist: 44, aN: [20, 30], aF: [10, 30], face: 'shout' }, base);
  }
}
