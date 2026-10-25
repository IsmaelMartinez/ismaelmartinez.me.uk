/**
 * The fighters' bodies, modelled in three dimensions and rasterised as
 * pixel art.
 *
 * The arcade's sprites were painted from life drawing: a torso turned three
 * quarters to the viewer, shoulders and hips that rotate into a punch, a
 * muscle the artist outlined wherever it rose over its neighbour. A flat
 * skeleton cannot do any of that, so this one is posed in 3D (x toward the
 * opponent, y down, z toward the viewer) and every part of it is a solid:
 * an ellipsoid for each muscle mass (pecs, abdominals, lats, deltoids,
 * biceps and triceps, forearms, glutes, quadriceps, calves) and a tapered
 * capsule for each bone, drawn through the raster's depth buffer
 * (`Raster.ell3` / `cone3`), so a part hides what is behind it from the
 * geometry rather than from a draw order. The inner outlines come from the
 * depth too (`toImage3`): a dark line wherever a nearer surface overlaps a
 * farther one, and a softer one round each muscle, which is the line the
 * arcade's artists drew. Clothes are shells over the body, cut by clip
 * functions in the body's own frame (a gi's open neck, a belt's band, the
 * hairline), and the face is features placed in the head's frame.
 *
 * The torso **twists** (`Pose.twist`, the chest's turn toward the viewer)
 * and the hips follow it part way, so a straight punch rotates the near
 * shoulder forward; the whole body can **yaw** (`Pose.yaw`), which is what
 * turns a whirlwind kick into a real spin. The near arm is the rear one, as
 * the arcade's stance drew it: the lead fist reaches from the far shoulder.
 *
 * DOM-free apart from the `ImageData` the renderer hands the raster.
 */
import { BUILDS, HEAD_SCALE_3D, type Build, type Look, type Raster, type V3 } from './figure';
import type { Pose } from './poses';
import type { Fighter } from './roster';

const RAD = Math.PI / 180;

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Combine frame axes: o + f*a + u*b + l*c. */
const at = (o: V3, f: V3, a: number, u: V3, b: number, l: V3, c: number): V3 => [
  o[0] + f[0] * a + u[0] * b + l[0] * c,
  o[1] + f[1] * a + u[1] * b + l[1] * c,
  o[2] + f[2] * a + u[2] * b + l[2] * c
];

/**
 * A direction at `deg` from straight down (positive swinging toward the
 * opponent, 180 straight up), turned `out` degrees toward the viewer.
 */
const limbDir = (deg: number, out = 0): V3 => {
  const c = Math.cos(out * RAD);
  return [Math.sin(deg * RAD) * c, Math.cos(deg * RAD) * c, Math.sin(out * RAD)];
};

/** An orthonormal frame: up the spine (or a head), forward out of the chest, and toward the viewer's side. */
interface Frame {
  up: V3;
  fwd: V3;
  lat: V3;
}

/**
 * The frame of a body part leaning `lean` degrees forward and turned
 * `twist` degrees toward the viewer: at 0 it faces the opponent in profile,
 * at 90 it faces the viewer.
 */
function frameOf(lean: number, twist: number): Frame {
  const up: V3 = [Math.sin(lean * RAD), -Math.cos(lean * RAD), 0];
  const f0: V3 = [Math.cos(lean * RAD), Math.sin(lean * RAD), 0];
  const c: V3 = [0, 0, 1];
  const ct = Math.cos(twist * RAD);
  const st = Math.sin(twist * RAD);
  return { up, fwd: add(scale(f0, ct), c, st), lat: add(scale(c, ct), f0, -st) };
}

/** Axes for an ellipsoid laid along a bone: the bone, a side `hint` made perpendicular, and the third. */
function along(u: V3, hint: V3): [V3, V3, V3] {
  let v = sub(hint, scale(u, dot(hint, u)));
  if (len(v) < 1e-3) v = Math.abs(u[2]) < 0.9 ? cross(u, [0, 0, 1]) : cross(u, [1, 0, 0]);
  v = norm(v);
  return [u, v, cross(u, v)];
}

/** The posed skeleton in body space, before the whole-body yaw and roll. */
export interface Skeleton {
  hip: V3;
  waist: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shoulderN: V3;
  shoulderF: V3;
  elbowN: V3;
  elbowF: V3;
  handN: V3;
  handF: V3;
  hipN: V3;
  hipF: V3;
  kneeN: V3;
  kneeF: V3;
  ankleN: V3;
  ankleF: V3;
  toeN: V3;
  toeF: V3;
  chestF: Frame;
  hipFr: Frame;
  headF: Frame;
}

/** How far the chest turns to the viewer when a pose does not say: the arcade's three-quarter stance. */
export const STANCE_TWIST = 42;

/**
 * The arcade drew its fighters a head taller than the hurtbox the rules
 * use: this scales the skeleton against `Fighter.height`.
 */
const SIZE = 1.1;

function skeleton(pose: Pose, b: Build, k: number): Skeleton {
  const twist = pose.twist ?? STANCE_TWIST;
  const hipTwist = pose.hipTwist ?? twist * 0.7 + 6;
  const lean = pose.lean;
  const chestF = frameOf(lean, twist);
  const hipFr = frameOf(lean * 0.35, hipTwist);
  const hip: V3 = [pose.x * k, 0, 0];
  const torso = b.torso * k;
  const waist = add(hip, chestF.up, torso * 0.34);
  const chest = add(hip, chestF.up, torso * 0.66);
  const neck = add(hip, chestF.up, torso);
  const headLean = lean + pose.head;
  const headF = frameOf(headLean, twist * 0.45 + 12);
  const head = add(neck, headF.up, (3.2 + b.head) * k);
  const sw = (b.rChest * 0.92 + b.rUpper * 0.35) * k;
  const shoulderN = at(neck, chestF.fwd, -0.5 * k, chestF.up, -3.2 * k, chestF.lat, sw);
  const shoulderF = at(neck, chestF.fwd, -0.5 * k, chestF.up, -3.2 * k, chestF.lat, -sw);
  const st = pose.stretch ?? {};
  const arm = (s: V3, a: readonly number[], side: 1 | -1, stretch = 1): [V3, V3] => {
    const out = (a[2] ?? (side > 0 ? 14 : 6)) * side;
    const e = add(s, limbDir(a[0], out), b.upper * k * stretch);
    const h = add(e, limbDir(a[0] + a[1], -out * 0.6), b.fore * k * stretch);
    return [e, h];
  };
  const [elbowN, handN] = arm(shoulderN, pose.aN, 1, st.aN);
  const [elbowF, handF] = arm(shoulderF, pose.aF, -1, st.aF);
  const hw = b.rHip * 0.6 * k;
  const hipN = at(hip, hipFr.fwd, 0, hipFr.up, -1.5 * k, hipFr.lat, hw);
  const hipF = at(hip, hipFr.fwd, 0, hipFr.up, -1.5 * k, hipFr.lat, -hw);
  const foot = pose.foot ?? [0, 0];
  const leg = (h: V3, l: readonly number[], side: 1 | -1, f: number, stretch = 1): [V3, V3, V3] => {
    const out = (l[2] ?? 4) * side;
    const knee = add(h, limbDir(l[0], out), b.thigh * k * stretch);
    const shin = l[0] + l[1];
    const ankle = add(knee, limbDir(shin, out * 0.5), b.shin * k * stretch);
    const toe = add(ankle, limbDir(shin + 90 - f, out * 0.5), 8.5 * k);
    return [knee, ankle, toe];
  };
  const [kneeN, ankleN, toeN] = leg(hipN, pose.lN, 1, foot[0], st.lN);
  const [kneeF, ankleF, toeF] = leg(hipF, pose.lF, -1, foot[1], st.lF);
  return { hip, waist, chest, neck, head, shoulderN, shoulderF, elbowN, elbowF, handN, handF, hipN, hipF, kneeN, kneeF, ankleN, ankleF, toeN, toeF, chestF, hipFr, headF };
}

/** The whole-body turn: yaw about the vertical through the hips, then the roll of a somersault. */
function transform(pose: Pose, hip: V3) {
  const cy = Math.cos((pose.yaw ?? 0) * RAD);
  const sy = Math.sin((pose.yaw ?? 0) * RAD);
  const cr = Math.cos(pose.rot * RAD);
  const sr = Math.sin(pose.rot * RAD);
  const dirT = (d: V3): V3 => {
    const x = d[0] * cy - d[2] * sy;
    const z = d[0] * sy + d[2] * cy;
    const y = d[1];
    return [x * cr - y * sr, y * cr + x * sr, z];
  };
  const dirInv = (d: V3): V3 => {
    const x = d[0] * cr + d[1] * sr;
    const y = d[1] * cr - d[0] * sr;
    return [x * cy + d[2] * sy, y, -x * sy + d[2] * cy];
  };
  return {
    point: (p: V3): V3 => add(hip, dirT(sub(p, hip))),
    dir: dirT,
    inv: (p: V3): V3 => add(hip, dirInv(sub(p, hip))),
    invDir: dirInv
  };
}

/** Where the figure's landmarks land on screen, relative to its feet anchor. */
export interface Placed {
  head: [number, number];
  hip: [number, number];
  neck: [number, number];
  handN: [number, number];
  handF: [number, number];
}

/**
 * The flat figures' radii were fattened to read at a smaller size; the 3D
 * bodies are drawn bigger and with their muscles modelled, so their limbs
 * come back down toward anatomy: trimmed arms and legs, a waist a little in.
 */
const LIMB = 0.76;
const BODIES = Object.fromEntries(
  Object.entries(BUILDS).map(([id, b]) => [id, { ...b, rUpper: b.rUpper * LIMB, rFore: b.rFore * LIMB, rThigh: b.rThigh * LIMB * 1.04, rShin: b.rShin * LIMB, rFist: b.rFist * 0.92, rHip: b.rHip * 0.92 }])
) as Record<Fighter['build'], Build>;

function place(pose: Pose, b: Build, k: number) {
  const s = skeleton(pose, b, k);
  const T = transform(pose, s.hip);
  let drop: number;
  if (pose.plant) {
    // Stand on whichever of the heels and toes hangs lowest.
    const low = Math.max(...[s.ankleN, s.ankleF, s.toeN, s.toeF].map(p => T.point(p)[1]));
    drop = -low - b.rShin * 0.55 * k;
  } else drop = -pose.y * k;
  return { s, T, drop };
}

const flat = (p: V3, drop: number): [number, number] => [p[0], p[1] + drop];

/** Where the head, hips and hands are, for effects that come out of them (the yogi's breath). */
export function landmarks3(def: Fighter, pose: Pose, scaleBy = 1): Placed {
  const k = (def.height / 90) * scaleBy * SIZE;
  const { s, T, drop } = place(pose, BODIES[def.build], k);
  return {
    head: flat(T.point(s.head), drop),
    hip: flat(T.point(s.hip), drop),
    neck: flat(T.point(s.neck), drop),
    handN: flat(T.point(s.handN), drop),
    handF: flat(T.point(s.handF), drop)
  };
}

/** Part groups, for the cloth folds and creases painted onto one part. */
const G = { armF: 1, legF: 2, torso: 3, legN: 4, head: 5, hair: 6, armN: 7, extra: 8 } as const;

/**
 * Draw a fighter into the raster with its feet at (ax, ay), facing right
 * (the renderer mirrors it to face left).
 */
export function drawBody(r: Raster, def: Fighter, look: Look, pose: Pose, ax: number, ay: number, scaleBy = 1): void {
  const b = BODIES[def.build];
  const k = (def.height / 90) * scaleBy * SIZE;
  const { s, T, drop } = place(pose, b, k);
  // Body space to raster space, and back (the clip functions think in body space).
  const W = (p: V3): V3 => {
    const q = T.point(p);
    return [ax + q[0], ay + q[1] + drop, q[2]];
  };
  const Wi = (x: number, y: number, z: number): V3 => T.inv([x - ax, y - ay - drop, z]);
  const D = T.dir;
  type Clip = (p: V3) => boolean;
  const opt = (sep?: boolean, clip?: Clip) => ({ sep, clip: clip ? (x: number, y: number, z: number) => clip(Wi(x, y, z)) : undefined });
  const ell = (c: V3, axes: [V3, V3, V3], rad: [number, number, number], m: number, g: number, bias = 0, sep = false, clip?: Clip) =>
    r.ell3(W(c), [D(axes[0]), D(axes[1]), D(axes[2])], rad, m, g, bias, opt(sep, clip));
  const cone = (a: V3, c: V3, ra: number, rb: number, m: number, g: number, bias = 0, sep = false, clip?: Clip) => r.cone3(W(a), W(c), ra, rb, m, g, bias, opt(sep, clip));
  const frameAxes = (f: Frame): [V3, V3, V3] => [f.lat, f.up, f.fwd];
  const crease = (a: V3, c: V3, g: number, depth = 1) => {
    const p = W(a);
    const q = W(c);
    r.crease(p[0], p[1], q[0], q[1], g, depth);
  };
  const lift = (a: V3, c: V3, g: number) => {
    const p = W(a);
    const q = W(c);
    r.lift(p[0], p[1], q[0], q[1], g);
  };
  /** A face mark at a body-space point, drawn only where the surface there is the one it belongs to. */
  const mark = (p: V3, m: number, tone: number, g: number) => {
    const q = W(p);
    const x = Math.round(q[0] - 0.5);
    const y = Math.round(q[1] - 0.5);
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
    const i = y * r.w + x;
    if (r.grp[i] !== g || r.zb[i] > q[2] + 2.2 * k) return;
    r.dot(x, y, m, tone);
  };

  const skin = r.material(look.skin);
  const hair = r.material(look.hair);
  const top = look.top ? r.material(look.top) : 0;
  const pants = r.material(look.pants);
  const shoes = look.shoes ? r.material(look.shoes) : 0;
  const gloves = look.gloves ? r.material(look.gloves) : skin;
  const bands = look.bands ? r.material(look.bands) : 0;
  const accent = look.accent ? r.material(look.accent) : hair;
  const extras = new Set(look.extras ?? []);
  const style = look.pantsStyle;
  const wind = pose.wind ?? 0;
  /** Which way loose cloth hangs: down and back, blown by movement. */
  const hang = (back: number): V3 => norm([-back - wind * 0.9, 1 - Math.abs(wind) * 0.3, -0.25]);

  const { chestF: C, hipFr: H } = s;
  const rH = b.rHip * k;
  const rC = b.rChest * k;
  const torso = b.torso * k;

  // --- Torso -------------------------------------------------------------------------
  const abdF: Frame = { up: norm(mixV(C.up, H.up, 0.5)), fwd: norm(mixV(C.fwd, H.fwd, 0.5)), lat: norm(mixV(C.lat, H.lat, 0.5)) };
  ell(at(s.hip, H.fwd, 0, H.up, 1 * k, H.lat, 0), frameAxes(H), [rH * 1.08, rH * 0.78, rH * 0.82], skin, G.torso);
  // Glutes behind.
  for (const sd of [1, -1]) ell(at(s.hip, H.fwd, -rH * 0.42, H.up, -0.5 * k, H.lat, sd * rH * 0.46), frameAxes(H), [rH * 0.58, rH * 0.66, rH * 0.52], skin, G.torso, -0.02, true);
  ell(s.waist, frameAxes(abdF), [rH * 0.98, torso * 0.3, rH * 0.76], skin, G.torso);
  ell(s.chest, frameAxes(C), [rC * 1.0, torso * 0.33, rC * 0.7], skin, G.torso);
  // Lats flare under the arms.
  for (const sd of [1, -1]) ell(at(s.chest, C.fwd, -rC * 0.12, C.up, -torso * 0.12, C.lat, sd * rC * 0.66), frameAxes(C), [rC * 0.42, torso * 0.3, rC * 0.5], skin, G.torso, 0, true);
  if (b.belly) {
    const bc = at(s.waist, abdF.fwd, rH * 0.35, abdF.up, -torso * 0.05, abdF.lat, 0);
    ell(bc, frameAxes(abdF), [b.belly * k * 0.98, b.belly * k * 0.9, b.belly * k * 0.92], skin, G.torso, 0.02, true);
    crease(at(bc, abdF.fwd, b.belly * k * 0.5, abdF.up, -b.belly * k * 0.7, abdF.lat, -b.belly * k * 0.4), at(bc, abdF.fwd, b.belly * k * 0.6, abdF.up, -b.belly * k * 0.62, abdF.lat, b.belly * k * 0.5), G.torso, 1);
  }
  // Pecs, the abdominal wall in its six blocks, the obliques.
  const pecC = at(s.chest, C.fwd, rC * 0.48, C.up, torso * 0.06, C.lat, 0);
  for (const sd of [1, -1]) ell(at(pecC, C.fwd, 0, C.up, 0, C.lat, sd * rC * 0.43), frameAxes(C), [rC * 0.52, rC * 0.4, rC * 0.34], skin, G.torso, 0.02, true);
  if (!b.belly) {
    for (let row = 0; row < 3; row++)
      for (const sd of [1, -1])
        ell(at(s.waist, abdF.fwd, rH * 0.6, abdF.up, (0.42 - row * 0.36) * torso * 0.3, abdF.lat, sd * rH * 0.24), frameAxes(abdF), [rH * 0.25, torso * 0.075, rH * 0.2], skin, G.torso, 0.03, true);
    for (const sd of [1, -1]) ell(at(s.waist, abdF.fwd, rH * 0.25, abdF.up, -torso * 0.04, abdF.lat, sd * rH * 0.72), frameAxes(abdF), [rH * 0.32, torso * 0.22, rH * 0.4], skin, G.torso, 0, true);
  }
  // Trapezius from the neck down to each shoulder, and the neck itself.
  for (const sh of [s.shoulderN, s.shoulderF]) cone(at(s.neck, C.fwd, -1 * k, C.up, -1.5 * k, C.lat, 0), sh, rC * 0.36, b.rUpper * k * 0.95, skin, G.torso, -0.04, true);
  const neckTop = add(s.head, s.headF.up, -b.head * k * 0.55);
  cone(add(s.neck, C.up, -2 * k), neckTop, b.head * k * (b.belly || b.rChest > 13 ? 0.62 : 0.52), b.head * k * 0.45, skin, G.torso);

  // --- Clothes over the torso ----------------------------------------------------------
  const local = (p: V3, o: V3, f: Frame) => {
    const d = sub(p, o);
    return { f: dot(d, f.fwd), u: dot(d, f.up), l: dot(d, f.lat) };
  };
  if (top) {
    const vCut: Clip = p => {
      if (!look.vNeck) return false;
      const q = local(p, s.neck, C);
      return q.f > -rC * 0.1 && -q.u < torso * 0.62 && Math.abs(q.l) < -q.u * 0.3 + 0.8 * k;
    };
    const tank: Clip = p => {
      // A sleeveless top leaves the shoulders bare.
      if (look.sleeves !== 'none') return false;
      const q = local(p, s.neck, C);
      return -q.u < torso * 0.22 && Math.abs(q.l) > rC * 0.45;
    };
    const cut: Clip = p => vCut(p) || tank(p);
    const loose = look.sleeves === 'long' ? 1.12 : 1.1;
    ell(at(s.chest, C.fwd, rC * 0.12, C.up, torso * 0.03, C.lat, 0), frameAxes(C), [rC * 1.1 * loose, torso * 0.4, rC * 0.88], top, G.torso, 0, false, cut);
    ell(s.waist, frameAxes(abdF), [rH * 1.26, torso * 0.36, rH * (b.belly ? 1.25 : 1.04)], top, G.torso, 0, false, cut);
    for (const sh of [s.shoulderN, s.shoulderF]) cone(at(s.neck, C.fwd, -1 * k, C.up, -1 * k, C.lat, 0), sh, rC * 0.44, b.rUpper * k * 1.2, top, G.torso, -0.04, false, cut);
    // The folds across a gi's front and the lapel's edge.
    for (const f of [0.2, 0.45]) {
      const y = at(s.waist, abdF.fwd, rH * 0.8, abdF.up, (f - 0.3) * torso, abdF.lat, rH * 0.6);
      crease(y, at(y, abdF.fwd, 0, abdF.up, -2.5 * k, abdF.lat, -rH * 1.1), G.torso, 2);
      lift(at(y, abdF.fwd, 0, abdF.up, 1 * k, abdF.lat, 0), at(y, abdF.fwd, 0, abdF.up, -1.5 * k, abdF.lat, -rH * 1.1), G.torso);
    }
    if (look.vNeck) {
      const v0 = at(s.neck, C.fwd, rC * 0.75, C.up, -torso * 0.6, C.lat, 0);
      crease(at(s.neck, C.fwd, rC * 0.2, C.up, -1 * k, C.lat, rC * 0.5), v0, G.torso, 1);
    }
  }
  // Pelvis cover: trunks, shorts and trousers all begin here.
  const pelvisCover = style === 'mawashi' ? 1.12 : 1.1;
  ell(at(s.hip, H.fwd, 0, H.up, 0.5 * k, H.lat, 0), frameAxes(H), [rH * 1.08 * pelvisCover, rH * 0.85, rH * 0.9 * pelvisCover], pants, G.torso, 0, false, p => local(p, s.hip, H).u > rH * (style === 'trunks' || style === 'mawashi' ? 0.45 : 0.75));
  if (style === 'mawashi') {
    // The apron's knot at the front, and its stiff hanging cords.
    const front = at(s.hip, H.fwd, rH * 0.95, H.up, -rH * 0.2, H.lat, 0);
    ell(front, frameAxes(H), [rH * 0.32, rH * 0.42, rH * 0.25], pants, G.torso, 0.05, true);
    for (const o of [-0.25, 0, 0.25]) cone(add(front, H.lat, o * rH), at(front, H.fwd, 0.3 * k, H.up, -rH * 1.1, H.lat, o * rH * 1.2), 0.7 * k, 0.6 * k, pants, G.torso, 0.15, true);
  }
  if (look.belt) {
    const belt = r.material(look.belt);
    const bc = at(s.hip, H.fwd, 0, H.up, rH * 0.62, H.lat, 0);
    ell(bc, frameAxes(H), [rH * 1.2, rH * 0.5, rH * 1.02], belt, G.torso, 0, true, p => Math.abs(local(p, bc, H).u) > 1.8 * k);
    if (style === 'gi') {
      const knot = at(bc, H.fwd, rH * 1.0, H.up, 0, H.lat, rH * 0.25);
      ell(knot, frameAxes(H), [1.9 * k, 1.6 * k, 1.3 * k], belt, G.torso, 0.1, true);
      for (const [o, l] of [[-0.6, 10], [0.7, 9]] as const) {
        const d = hang(o * 0.3 - 0.1);
        cone(knot, add(add(knot, d, l * k), H.lat, o * 2 * k), 1.15 * k, 1.05 * k, belt, G.torso, 0.05, true);
      }
    }
  }
  if (extras.has('skirt') && top) {
    // The qipao's panels hang from the hips front and back, gold at the hem.
    const gold = r.material('#e8c040');
    for (const [f, mat] of [[1, top], [-1, top]] as const) {
      const c0 = at(s.hip, H.fwd, f * rH * 0.75, H.up, 0, H.lat, 0);
      const d = f > 0 ? hang(-0.25 - wind * 0.4) : hang(0.35);
      // A flat panel: wide across the hips, long down the hang, thin front to back.
      const pf = norm(cross(d, H.lat));
      const axes: [V3, V3, V3] = [H.lat, d, pf];
      ell(add(c0, d, 10 * k), axes, [rH * 0.62, 11 * k, 1.3 * k], mat, G.legN, 0.02, true, p => dot(sub(p, c0), d) < 0);
      ell(add(c0, d, 20 * k), axes, [rH * 0.6, 1.1 * k, 1.5 * k], gold, G.legN, 0.1, true);
    }
  }
  if (extras.has('cape')) {
    const capeMat = r.material('#2a2830');
    const lining = r.material('#e8c040');
    const c0 = at(s.neck, C.fwd, -rC * 0.6, C.up, -3 * k, C.lat, 0);
    // A heavy cloth panel from the shoulders, flaring as it falls behind him.
    const d = hang(0.4);
    const pf = norm(cross(d, C.lat));
    cone(c0, add(c0, d, 6 * k), rC * 0.9, rC * 0.95, capeMat, G.armF, -0.15, true);
    ell(add(c0, d, 19 * k), [C.lat, d, pf], [rC * 1.15, 21 * k, 2 * k], capeMat, G.armF, -0.15, true, p => dot(sub(p, c0), d) < 0);
    for (const sd of [1, -1]) ell(at(s.neck, C.fwd, -1 * k, C.up, -2.5 * k, C.lat, sd * rC * 0.85), frameAxes(C), [rC * 0.42, 2.2 * k, rC * 0.5], lining, G.torso, 0.1, true);
  }
  if (extras.has('skulls')) {
    const bone = r.material('#ece4cc');
    for (let i = -3; i <= 3; i++) {
      const p = at(s.chest, C.fwd, rC * 0.78 - Math.abs(i) * 0.5 * k, C.up, torso * 0.24 - Math.abs(i) * 1.6 * k + 1.2 * k, C.lat, i * rC * 0.24);
      ell(p, frameAxes(C), [1.8 * k, 1.9 * k, 1.5 * k], bone, G.torso, 0.1, true);
      mark(at(p, C.fwd, 1.5 * k, C.up, 0, C.lat, 0.5 * k), bone, 0, G.torso);
    }
  }
  if (extras.has('tags')) {
    const steel = r.material('#c8ccd4');
    const p = at(s.chest, C.fwd, rC * 0.95, C.up, torso * 0.05, C.lat, rC * 0.15);
    cone(at(s.neck, C.fwd, rC * 0.3, C.up, -1 * k, C.lat, 0), p, 0.4 * k, 0.4 * k, steel, G.torso, 0.2);
    ell(p, frameAxes(C), [1.2 * k, 1.8 * k, 0.6 * k], steel, G.torso, 0.3, true);
  }

  // --- Limbs ---------------------------------------------------------------------------
  const hand = (e: V3, h: V3, g: number, bias: number, side: 1 | -1) => {
    const u = norm(sub(h, e));
    const boxing = extras.has('boxing');
    const fr = b.rFist * k * (boxing ? 1.5 : 1);
    const [, n, bn] = along(u, [0, 0, side]);
    if (boxing) {
      ell(add(h, u, fr * 0.35), [u, n, bn], [fr * 1.1, fr * 0.95, fr * 0.9], gloves, g, bias + 0.05, true);
      cone(add(h, u, -fr * 0.55), add(h, u, -fr * 0.9), fr * 0.75, fr * 0.7, r.material('#f4f0e8'), g, bias, true);
      return;
    }
    if (pose.hand === 'open') {
      // A flat palm, the fingers together, the thumb splayed.
      ell(add(h, u, fr * 0.25), [u, n, bn], [fr * 0.95, fr * 0.42, fr * 0.8], gloves, g, bias, true);
      cone(add(h, u, fr * 0.9), add(h, u, fr * 1.9), fr * 0.5, fr * 0.36, skin, g, bias, true);
      cone(at(h, u, fr * 0.1, n, 0, bn, fr * 0.55), at(h, u, fr * 0.8, n, fr * 0.2, bn, fr * 0.95), fr * 0.3, fr * 0.24, skin, g, bias, true);
      return;
    }
    // A closed fist: the block of fingers, the knuckle ridge, the thumb wrapped across.
    const fc = add(h, u, fr * 0.35);
    ell(fc, [u, n, bn], [fr * 1.0, fr * 0.9, fr * 0.82], gloves, g, bias + 0.03, true);
    for (const o of [-0.45, 0, 0.45]) {
      const kn = at(fc, u, fr * 0.75, n, 0, bn, o * fr);
      crease(kn, at(kn, u, -fr * 0.5, n, -fr * 0.5, bn, 0), g, 1);
    }
    cone(at(fc, u, -fr * 0.2, n, fr * 0.15, bn, fr * 0.8 * side), at(fc, u, fr * 0.55, n, fr * 0.3, bn, fr * 0.45 * side), fr * 0.36, fr * 0.3, gloves === skin ? skin : gloves, g, bias + 0.08, true);
  };

  const arm = (sh: V3, el: V3, hd: V3, side: 1 | -1) => {
    const g = side > 0 ? G.armN : G.armF;
    const bias = side > 0 ? 0 : -0.24;
    const rU = b.rUpper * k;
    const rF = b.rFore * k;
    const ua = norm(sub(el, sh));
    const fa = norm(sub(hd, el));
    // The biceps faces the way the forearm folds; straight, it faces forward and down.
    const front = len(sub(fa, scale(ua, dot(fa, ua)))) > 0.2 ? fa : add(norm(cross(ua, [0, 0, side])), [0, 0, 0]);
    const ax = along(ua, front);
    const lU = len(sub(el, sh));
    cone(sh, el, rU * 0.95, rF * 1.0, skin, g, bias);
    ell(add(add(sh, ua, lU * 0.5), ax[1], rU * 0.32), ax, [lU * 0.34, rU * 0.82, rU * 0.85], skin, g, bias + 0.02, true);
    ell(add(add(sh, ua, lU * 0.45), ax[1], -rU * 0.35), ax, [lU * 0.36, rU * 0.8, rU * 0.82], skin, g, bias, true);
    // The deltoid caps the shoulder.
    ell(add(sh, ua, rU * 0.45), along(ua, C.lat.map(x => x * side) as V3), [rU * 1.3, rU * 1.22, rU * 1.12], skin, g, bias + 0.02, true);
    const lF = len(sub(hd, el));
    const fax = along(fa, ax[1]);
    cone(el, hd, rF * 1.0, rF * 0.68, skin, g, bias);
    ell(add(add(el, fa, lF * 0.27), fax[1], rF * 0.12), fax, [lF * 0.33, rF * 1.08, rF * 0.98], skin, g, bias + 0.02, true);
    if (top && look.sleeves === 'long') {
      cone(sh, el, rU * 1.14, rF * 1.2, top, g, bias);
      cone(el, add(hd, fa, -rF * 1.2), rF * 1.2, rF * 1.1, top, g, bias);
      for (const f of [0.45, 0.8]) crease(at(sh, ua, lU * f, ax[1], rU * 1.2, ax[2], 0), at(sh, ua, lU * f + 2 * k, ax[1], -rU * 1.2, ax[2], 0), g, 2);
      crease(at(el, fa, lF * 0.4, fax[1], rF * 1.3, fax[2], 0), at(el, fa, lF * 0.5, fax[1], -rF * 1.3, fax[2], 0), g, 2);
    } else if (top && look.sleeves === 'short') {
      // A gi's sleeve: wide, stopping above the elbow, creased where it bunches.
      const end = add(sh, ua, lU * 0.72);
      cone(add(sh, ua, -rU * 0.2), end, rU * 1.32, rU * 1.36, top, g, bias);
      crease(at(sh, ua, lU * 0.4, ax[1], rU * 1.5, ax[2], 0), at(sh, ua, lU * 0.52, ax[1], -rU * 1.5, ax[2], 0), g, 2);
      lift(at(sh, ua, lU * 0.4 - 1.2 * k, ax[1], rU * 1.4, ax[2], 0), at(sh, ua, lU * 0.52 - 1.2 * k, ax[1], -rU * 1.4, ax[2], 0), g);
    }
    if (bands) {
      cone(add(hd, fa, -rF * 1.9), add(hd, fa, -rF * 0.5), rF * 0.95, rF * 0.85, bands, g, bias + 0.05, true);
      if (extras.has('spikes')) {
        const sp = r.material('#e8e8f0');
        for (const o of [-1, 1]) ell(at(hd, fa, -rF * 1.2, fax[1], o * rF * 1.0, fax[2], 0), fax, [0.8 * k, 0.8 * k, 0.8 * k], sp, g, 0.3);
      }
    }
    if (look.gloves && !extras.has('boxing')) cone(add(hd, fa, -rF * 1.1), hd, rF * 0.8, rF * 0.75, gloves, g, bias + 0.03, true);
    hand(el, hd, g, bias, side);
    if (extras.has('claw') && side < 0) {
      // The claw is on the lead hand, which is the far one.
      const steel = r.material('#d8dce8');
      for (const o of [-1, 0, 1]) cone(at(hd, fa, b.rFist * k * 0.8, fax[1], 0, fax[2], o * 1.8 * k), at(hd, fa, 19 * k, fax[1], 0.5 * k, fax[2], o * 2.8 * k), 0.85 * k, 0.4 * k, steel, G.extra, 0.3);
    }
  };

  const leg = (hp: V3, kn: V3, an: V3, toe: V3, side: 1 | -1) => {
    const g = side > 0 ? G.legN : G.legF;
    const bias = side > 0 ? 0 : -0.24;
    const rT = b.rThigh * k;
    const rS = b.rShin * k;
    const ut = norm(sub(kn, hp));
    const us = norm(sub(an, kn));
    // The quadriceps faces away from the way the shin folds.
    const fold = sub(us, scale(ut, dot(us, ut)));
    const quadDir: V3 = len(fold) > 0.15 ? scale(fold, -1) : [ut[1] > 0 ? 1 : 0, ut[1] > 0 ? 0 : 1, 0];
    const tax = along(ut, quadDir);
    const sax = along(us, scale(tax[1], 1));
    const lT = len(sub(kn, hp));
    const lS = len(sub(an, kn));
    const skinLegs = style === 'trunks' || style === 'mawashi' || style === 'shorts';
    // Under trousers the leg's own masses take the cloth's colour, so no skin shows through a fold.
    const legMat = style === 'gi' || style === 'cargo' || style === 'tight' ? pants : skin;
    cone(hp, kn, rT * 1.05, rS * 1.02, legMat, g, bias);
    ell(add(add(hp, ut, lT * 0.45), tax[1], rT * 0.25), tax, [lT * 0.42, rT * 0.9, rT * 0.92], legMat, g, bias + 0.02, true);
    ell(add(kn, tax[1], rS * 0.55), sax, [rS * 0.6, rS * 0.55, rS * 0.6], legMat, g, bias + 0.04, true);
    cone(kn, an, rS * 0.95, rS * 0.6, legMat, g, bias);
    ell(add(add(kn, us, lS * 0.3), sax[1], -rS * 0.42), sax, [lS * 0.32, rS * 0.85, rS * 0.85], legMat, g, bias + 0.02, true);
    // Feet: a heel and a long wedge to the toes.
    const fu = norm(sub(toe, an));
    const fax = along(fu, scale(us, -1));
    const fl = len(sub(toe, an));
    const footMat = shoes || skin;
    ell(add(an, fu, -rS * 0.15), fax, [rS * 0.65, rS * 0.65, rS * 0.6], footMat, g, bias, true);
    ell(add(add(an, fu, fl * 0.45), fax[1], -rS * 0.1), fax, [fl * 0.62, rS * 0.5, rS * 0.62], footMat, g, bias + 0.02, true);
    if (!shoes) crease(add(an, fu, fl * 0.8), add(add(an, fu, fl * 0.8), fax[1], rS * 0.5), g, 1);
    if (shoes) {
      // Boots climb the shin; a sole underneath.
      const tall = style === 'trunks' ? 0.5 : style === 'gi' ? 0.15 : 0.32;
      cone(add(kn, us, lS * (1 - tall) - rS * 0.3), an, rS * 0.98, rS * 0.78, shoes, g, bias + 0.03);
      crease(add(add(an, fax[1], -rS * 0.6), fu, -rS * 0.5), add(add(an, fax[1], -rS * 0.55), fu, fl * 1.05), g, 3);
    }
    if (style === 'gi' || style === 'cargo') {
      // Trousers: wider than the leg, flaring to the ankle, folded where they bunch.
      const wide = style === 'gi' ? 1.5 : 1.34;
      cone(add(hp, ut, -rT * 0.3), kn, rT * 1.16, rS * wide * 1.02, pants, g, bias);
      const hem = add(an, us, -rS * (shoes ? 1.6 : 0.4));
      cone(kn, hem, rS * wide, rS * wide * 1.08, pants, g, bias);
      // A few diagonal folds pulled from the knee, the way cloth hangs from it.
      crease(at(hp, ut, lT * 0.55, tax[1], rT * 0.9, tax[2], 0), at(hp, ut, lT * 0.85, tax[1], -rT * 0.2, tax[2], 0), g, 1);
      for (const [f, d] of [[0.3, 2], [0.62, 1]] as const) {
        const a = at(kn, us, lS * f, sax[1], -rS * wide * 0.9, sax[2], 0);
        const c = at(kn, us, lS * f - rS * 1.4, sax[1], rS * wide * 0.3, sax[2], 0);
        crease(a, c, g, d);
        lift(add(a, us, 1.2 * k), add(c, us, 1.2 * k), g);
      }
      if (style === 'cargo') ell(at(hp, ut, lT * 0.55, tax[1], 0, tax[2], rT * 1.05 * side), tax, [rT * 0.55, rT * 0.42, rT * 0.35], pants, g, bias + 0.05, true);
    } else if (style === 'tight') {
      cone(hp, kn, rT * 1.08, rS * 1.06, pants, g, bias);
      cone(kn, add(an, us, -rS * 0.3), rS * 1.0, rS * 0.66, pants, g, bias);
      ell(add(add(hp, ut, lT * 0.45), tax[1], rT * 0.25), tax, [lT * 0.43, rT * 0.94, rT * 0.96], pants, g, bias + 0.02, true);
      ell(add(add(kn, us, lS * 0.3), sax[1], -rS * 0.42), sax, [lS * 0.33, rS * 0.9, rS * 0.9], pants, g, bias + 0.02, true);
    } else if (style === 'shorts') {
      cone(add(hp, ut, -rT * 0.4), add(hp, ut, lT * 0.55), rT * 1.28, rT * 1.24, pants, g, bias);
      crease(at(hp, ut, lT * 0.5, tax[1], rT * 1.2, tax[2], 0), at(hp, ut, lT * 0.5, tax[1], -rT * 1.2, tax[2], 0), g, 2);
    } else if (style === 'trunks') {
      cone(add(hp, ut, -rT * 0.4), add(hp, ut, lT * 0.12), rT * 1.16, rT * 1.12, pants, g, bias);
    }
    if (skinLegs && !shoes) {
      // The long line between the calf's heads.
      crease(add(add(kn, us, lS * 0.2), sax[1], -rS * 0.9), add(add(kn, us, lS * 0.75), sax[1], -rS * 0.3), g, 1);
    }
  };

  arm(s.shoulderF, s.elbowF, s.handF, -1);
  leg(s.hipF, s.kneeF, s.ankleF, s.toeF, -1);
  leg(s.hipN, s.kneeN, s.ankleN, s.toeN, 1);
  arm(s.shoulderN, s.elbowN, s.handN, 1);

  drawHead(r, look, pose, s, b, k, { ell, cone, crease, lift, mark, local, hang }, { skin, hair, top, accent, extras });
}

interface Tools {
  ell: (c: V3, axes: [V3, V3, V3], rad: [number, number, number], m: number, g: number, bias?: number, sep?: boolean, clip?: (p: V3) => boolean) => void;
  cone: (a: V3, c: V3, ra: number, rb: number, m: number, g: number, bias?: number, sep?: boolean, clip?: (p: V3) => boolean) => void;
  crease: (a: V3, c: V3, g: number, depth?: number) => void;
  lift: (a: V3, c: V3, g: number) => void;
  mark: (p: V3, m: number, tone: number, g: number) => void;
  local: (p: V3, o: V3, f: Frame) => { f: number; u: number; l: number };
  hang: (back: number) => V3;
}

function drawHead(
  r: Raster,
  look: Look,
  pose: Pose,
  s: Skeleton,
  b: Build,
  k0: number,
  t: Tools,
  m: { skin: number; hair: number; top: number; accent: number; extras: Set<string> }
): void {
  const k = k0 * HEAD_SCALE_3D;
  const F = s.headF;
  const hr = b.head * k;
  const C = s.head;
  const g = G.head;
  const hg = G.hair;
  const axes: [V3, V3, V3] = [F.lat, F.up, F.fwd];
  /** A point on the head: forward, up and toward the viewer, in head radii. */
  const hp = (f: number, u: number, l = 0): V3 => at(C, F.fwd, f * hr, F.up, u * hr, F.lat, l * hr);
  const hl = (p: V3) => {
    const q = t.local(p, C, F);
    return { f: q.f / hr, u: q.u / hr, l: q.l / hr };
  };
  const { skin, hair, accent } = m;
  // The skull, the face's mass forward and low, the jaw and chin, the brow ridge, cheekbones, nose and ear.
  t.ell(hp(-0.12, 0.18), axes, [hr * 0.86, hr * 0.94, hr * 1.0], skin, g);
  t.ell(hp(0.32, -0.36), axes, [hr * 0.72, hr * 0.66, hr * 0.7], skin, g);
  t.ell(hp(0.5, -0.74), axes, [hr * 0.36, hr * 0.26, hr * 0.32], skin, g, 0.02, true);
  t.ell(hp(0.76, 0.2), axes, [hr * 0.6, hr * 0.2, hr * 0.26], skin, g, 0.06, true);
  for (const sd of [1, -1]) t.ell(hp(0.62, -0.12, sd * 0.4), axes, [hr * 0.26, hr * 0.18, hr * 0.22], skin, g, 0.06, true);
  t.cone(hp(0.92, 0.06), hp(1.12, -0.24), hr * 0.12, hr * 0.17, skin, g, 0.08, true);
  t.ell(hp(-0.08, -0.02, 0.84), axes, [hr * 0.16, hr * 0.3, hr * 0.22], skin, g, -0.04, true);
  const dark = r.material('#14100c');
  const white = r.material('#f4f0ec');
  const face = pose.face ?? 'calm';
  const style = look.hairStyle;

  // Hair: a shell over the skull, cut at a hairline that sits high on the brow and low at the nape.
  const hairline = (lowAtBack: number, frontAt: number) => (p: V3) => {
    const q = hl(p);
    const line = q.f > 0 ? frontAt - q.f * 0.1 : frontAt + q.f * lowAtBack;
    return q.u < line || (q.l > 0.62 && q.u < 0.25 && q.f > -0.35);
  };
  const cap = (grow: number, lowAtBack = 0.75, frontAt = 0.36, mat = hair) => t.ell(hp(-0.14, 0.22), axes, [hr * 0.92 * grow, hr * 1.0 * grow, hr * 1.06 * grow], mat, hg, 0, true, hairline(lowAtBack, frontAt));
  const spike = (f: number, u: number, l: number, out: V3, length: number, r0 = 0.32) => {
    const a = hp(f, u, l);
    t.cone(a, add(a, norm(out), length * hr), r0 * hr, 0.06 * hr, hair, hg, 0.02, true);
  };
  switch (style) {
    case 'spiky': {
      cap(1.07);
      // Short tufts swept up and back from the crown, a clump falling over the brow.
      for (const [f, u, l, bf, bu, n] of [
        [0.45, 0.62, 0.15, 0.6, 0.5, 0.45],
        [0.2, 0.84, 0.3, 0.1, 1, 0.5],
        [-0.15, 0.9, 0.1, -0.4, 1, 0.55],
        [-0.5, 0.72, 0.3, -0.9, 0.6, 0.55],
        [-0.8, 0.35, 0.2, -1, 0, 0.45],
        [0.0, 0.88, -0.35, -0.1, 1, 0.45],
        [-0.45, 0.7, -0.35, -0.8, 0.7, 0.45]
      ] as const)
        spike(f, u, l, add(add(scale(F.fwd, bf), F.up, bu), F.lat, l * 0.5), n, 0.3);
      break;
    }
    case 'blond': {
      cap(1.08, 0.95);
      for (const [f, u, l] of [[0.55, 0.62, 0.2], [0.2, 0.85, 0.35], [0.6, 0.45, -0.2]] as const) spike(f, u, l, add(scale(F.fwd, 0.9), F.up, -0.15), 0.55, 0.3);
      spike(-0.5, 0.5, 0.5, add(scale(F.fwd, -0.6), F.up, -0.8), 0.6, 0.35);
      break;
    }
    case 'buns': {
      cap(1.05);
      for (const sd of [1, -1]) {
        const bc = hp(-0.15, 0.78, sd * 0.62);
        t.ell(bc, axes, [hr * 0.38, hr * 0.38, hr * 0.38], hair, hg, 0.05, true);
        t.ell(add(bc, F.up, -hr * 0.12), axes, [hr * 0.42, hr * 0.16, hr * 0.42], accent, hg, 0.15, true);
      }
      break;
    }
    case 'mohawk': {
      for (let i = 0; i <= 6; i++) {
        const a = -1.1 + i * 0.32;
        const p = hp(Math.sin(a) * 0.98 - 0.12, Math.cos(a) * 1.0 + 0.22, 0);
        t.ell(p, axes, [hr * 0.2, hr * 0.3, hr * 0.26], hair, hg, 0.05, true);
      }
      // The beard round the jaw, the brows.
      t.ell(hp(0.38, -0.55), axes, [hr * 0.76, hr * 0.55, hr * 0.72], hair, hg, 0, true, p => hl(p).u > -0.25 + Math.max(0, hl(p).f - 0.6) * 0.5);
      break;
    }
    case 'bald': {
      const red = r.material('#d82424');
      for (const sd of [-0.2, 0, 0.2]) t.mark(hp(0.86, 0.6, sd), red, 2, g);
      break;
    }
    case 'topknot': {
      cap(1.04, 0.9);
      t.ell(hp(-0.3, 1.0), axes, [hr * 0.22, hr * 0.34, hr * 0.45], hair, hg, 0.05, true);
      t.cone(hp(-0.25, 0.9), hp(0.25, 1.2), hr * 0.22, hr * 0.15, hair, hg, 0.05, true);
      break;
    }
    case 'mane': {
      cap(1.1, 1.0, 0.3);
      for (const [f, u, l, bf, bu] of [
        [-0.2, 0.9, 0, -0.4, 1],
        [-0.7, 0.6, 0.2, -1, 0.5],
        [-0.9, 0, 0.3, -1, -0.3],
        [-0.6, -0.5, 0.3, -0.7, -1],
        [0.3, 0.8, 0.2, 0.4, 1],
        [-0.3, 0.4, 0.75, -0.4, 0.2]
      ] as const)
        spike(f, u, l, add(add(scale(F.fwd, bf), F.up, bu), F.lat, l * 0.4), 0.9, 0.42);
      break;
    }
    case 'flattop': {
      cap(1.03, 0.6, 0.42);
      t.ell(hp(-0.05, 0.95), axes, [hr * 0.86, hr * 0.62, hr * 1.0], hair, hg, 0.05, true, p => hl(p).u > 1.35 || hl(p).u < 0.45);
      break;
    }
    case 'short':
      cap(1.03, 0.6, 0.42);
      break;
    case 'mask': {
      cap(1.05, 1.1);
      t.cone(hp(-0.8, 0.1), add(hp(-0.9, -0.2), t.hang(0.6), hr * 1.8), hr * 0.3, hr * 0.16, hair, hg, 0, true);
      // The white mask over the face, its eye slits cut dark.
      t.ell(hp(0.32, -0.12), axes, [hr * 0.82, hr * 0.92, hr * 0.85], accent, hg, 0.12, true, p => hl(p).f < 0.05);
      break;
    }
    case 'patch': {
      t.cone(hp(-0.6, 0.6, 0.7), hp(0.75, 0.1, 0.45), hr * 0.08, hr * 0.08, accent, hg, 0, true);
      t.ell(hp(0.85, 0.02, 0.3), axes, [hr * 0.22, hr * 0.2, hr * 0.12], accent, hg, 0.1, true);
      break;
    }
    case 'cap': {
      const capMat = m.top || accent;
      t.ell(hp(-0.08, 0.5), axes, [hr * 1.02, hr * 0.7, hr * 1.14], capMat, hg, 0, true, p => hl(p).u < 0.32);
      t.ell(hp(0.7, 0.36), axes, [hr * 0.7, hr * 0.08, hr * 0.5], r.material('#1a1a1e'), hg, 0.1, true);
      t.ell(hp(0.9, 0.7), axes, [hr * 0.18, hr * 0.16, hr * 0.06], accent, hg, 0.3, true);
      break;
    }
  }
  if (look.accent && style === 'spiky') {
    // The headband, its knot at the back and two long tails.
    t.ell(hp(-0.12, 0.38), axes, [hr * 0.98, hr * 1.04, hr * 1.12], accent, hg, 0, true, p => {
      const q = hl(p);
      const mid = 0.38 + q.f * 0.06;
      return Math.abs(q.u - mid) > 0.13;
    });
    const knot = hp(-1.05, 0.34, 0.1);
    for (const [back, l0] of [[0.7, 1.5], [0.3, 1.7]] as const) {
      const d = t.hang(back);
      t.cone(knot, add(add(knot, d, l0 * hr), F.lat, -0.2 * hr), hr * 0.13, hr * 0.12, accent, hg, 0.05, true);
    }
  }
  if (style === 'topknot' && m.extras.has('paint')) {
    // The kumadori: red strokes sweeping up from the eye and across the cheek.
    for (let i = 0; i < 4; i++) {
      t.mark(hp(0.78, 0.15 + i * 0.08, 0.32 + i * 0.12), accent, 2, g);
      t.mark(hp(0.7, -0.2 - i * 0.03, 0.36 + i * 0.1), accent, 2, g);
    }
  }

  // The face: the brow, the eyes (white in front of a dark iris), the mouth.
  const masked = style === 'mask';
  for (const sd of [1, -1]) {
    const e = hp(0.84, 0.02, sd * 0.3);
    if (style === 'patch' && sd > 0) continue;
    if (masked) {
      t.mark(e, dark, 0, hg);
      t.mark(add(e, F.fwd, k * 0.9), dark, 0, hg);
      continue;
    }
    if (face === 'hurt') {
      t.mark(e, dark, 0, g);
      t.mark(add(e, F.fwd, k), dark, 0, g);
      t.mark(add(add(e, F.fwd, -k), F.up, k), dark, 0, g);
    } else {
      t.mark(add(e, F.fwd, k * 1.1), white, 3, g);
      t.mark(e, dark, 0, g);
      t.mark(add(e, F.up, -k * 0.9), dark, 0, g);
    }
    t.crease(hp(0.8, 0.22, sd * 0.12), hp(0.82, 0.18, sd * 0.5), g, 2);
  }
  t.crease(hp(0.9, -0.25, 0.08), hp(0.84, -0.1, 0.3), g, 1);
  const mouth = hp(0.86, -0.5, 0.08);
  if (face === 'shout' || face === 'hurt') {
    const red = r.material('#6a0e0e');
    t.mark(mouth, red, 0, g);
    t.mark(add(mouth, F.up, -k), red, 0, g);
    t.mark(add(mouth, F.lat, k), red, 1, g);
    t.mark(add(add(mouth, F.lat, k), F.up, -k), red, 0, g);
    t.mark(add(mouth, F.up, k * 0.9), white, 3, g);
  } else t.crease(hp(0.86, -0.5, -0.12), hp(0.86, -0.52, 0.28), g, 2);
  // The jaw's edge.
  t.crease(hp(-0.15, -0.55, 0.7), hp(0.4, -0.88, 0.45), g, 1);
}
