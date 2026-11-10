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
const SIZE = 1.06;

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
  const headF = frameOf(headLean, pose.headTwist ?? twist * 0.45 + 12);
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
    const toe = add(ankle, limbDir(shin + 90 - f, out * 0.5), b.foot * k);
    return [knee, ankle, toe];
  };
  // A leg with a foot target: the ankle goes where the pose puts it and the knee is solved between hip and ankle.
  const ik = (h: V3, target: readonly [number, number], side: 1 | -1, turn: number, f: number): [V3, V3, V3] => {
    const lT = b.thigh * k;
    const lS = b.shin * k;
    const sole = b.rShin * 0.8 * k;
    let a: V3 = [hip[0] + target[0] * k, (pose.h ?? 0) * k - sole - target[1] * k, h[2] + side * 1.5 * k];
    let d = sub(a, h);
    const reach = (lT + lS) * 0.995;
    if (len(d) > reach) {
      // Out of reach: the foot comes up along the line to the hip rather than the leg stretching.
      d = scale(norm(d), reach);
      a = add(h, d);
    }
    const dl = Math.max(1e-3, len(d));
    const u = scale(d, 1 / dl);
    const along0 = (lT * lT - lS * lS + dl * dl) / (2 * dl);
    const off = Math.sqrt(Math.max(0, lT * lT - along0 * along0));
    const hint: V3 = [Math.cos(turn * RAD), -0.1, side * Math.sin(turn * RAD)];
    let w = sub(hint, scale(u, dot(hint, u)));
    w = len(w) < 1e-3 ? [1, 0, 0] : norm(w);
    const knee = add(add(h, u, along0), w, off);
    const shinDir = norm(sub(a, knee));
    const shinDeg = Math.atan2(shinDir[0], shinDir[1]) / RAD;
    const toe = add(a, limbDir(shinDeg + 90 - f, side * 4), b.foot * k);
    return [knee, a, toe];
  };
  const [kneeN, ankleN, toeN] = pose.h !== undefined && pose.fN ? ik(hipN, pose.fN, 1, pose.kN ?? 24, foot[0]) : leg(hipN, pose.lN, 1, foot[0], st.lN);
  const [kneeF, ankleF, toeF] = pose.h !== undefined && pose.fF ? ik(hipF, pose.fF, -1, pose.kF ?? 8, foot[1]) : leg(hipF, pose.lF, -1, foot[1], st.lF);
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

const BODIES = BUILDS;

function place(pose: Pose, b: Build, k: number) {
  const s = skeleton(pose, b, k);
  const T = transform(pose, s.hip);
  let drop: number;
  const sole = b.rShin * 0.8 * k;
  /** Lay a foot flat when its ankle is at floor height: the lead one at the opponent, the rear one turned out to the viewer. */
  const settle = (low: number): void => {
    const fl = b.foot * k;
    for (const [ankle, key, dir] of [
      [s.ankleN, 'toeN', [0.6, 0, 0.8]],
      [s.ankleF, 'toeF', [0.97, 0, -0.24]]
    ] as const) {
      const t = Math.max(0, Math.min(1, 1 - (low - ankle[1]) / (5 * k)));
      if (t <= 0) continue;
      const lying: V3 = [ankle[0] + dir[0] * fl, ankle[1], ankle[2] + dir[2] * fl];
      s[key] = mixV(s[key], lying, t);
    }
  };
  if (pose.h !== undefined && (pose.fN || pose.fF) && pose.rot === 0 && !pose.yaw) {
    // Placed feet: the floor is where the pose says it is under the hips.
    settle(pose.h * k - sole);
    drop = -pose.h * k;
  } else if (pose.plant) {
    const upright = pose.rot === 0 && !pose.yaw;
    if (upright) {
      // A foot on the floor lies flat on it, the lead one pointing at the opponent and the rear one turned out
      // to the viewer, as a stance plants them; a foot off the floor keeps the angle its shin gives it.
      const low = Math.max(s.ankleN[1], s.ankleF[1]);
      settle(low);
      drop = -low - sole;
    } else {
      // Stand on whichever of the heels and toes hangs lowest.
      const low = Math.max(...[s.ankleN, s.ankleF, s.toeN, s.toeF].map(p => T.point(p)[1]));
      drop = -low - b.rShin * 0.55 * k;
    }
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
  /** A line or a mark is a pixel wide on a sprite and grows with a portrait, so a close-up keeps the same drawing. */
  const pen = Math.max(1, Math.round(k * 0.8));
  const crease = (a: V3, c: V3, g: number, depth = 1) => {
    const p = W(a);
    const q = W(c);
    for (let o = 0; o < pen; o++) r.crease(p[0], p[1] + o, q[0], q[1] + o, g, depth);
  };
  const lift = (a: V3, c: V3, g: number) => {
    const p = W(a);
    const q = W(c);
    for (let o = 0; o < pen; o++) r.lift(p[0], p[1] + o, q[0], q[1] + o, g);
  };
  /** A face mark at a body-space point, drawn only where the surface there is the one it belongs to. */
  const mark = (p: V3, m: number, tone: number, g: number) => {
    const q = W(p);
    const x0 = Math.round(q[0] - pen / 2);
    const y0 = Math.round(q[1] - pen / 2);
    for (let y = y0; y < y0 + pen; y++)
      for (let x = x0; x < x0 + pen; x++) {
        if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
        const i = y * r.w + x;
        if (r.grp[i] !== g || r.zb[i] > q[2] + 2.2 * k) continue;
        r.dot(x, y, m, tone);
      }
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
  const local = (p: V3, o: V3, f: Frame) => {
    const d = sub(p, o);
    return { f: dot(d, f.fwd), u: dot(d, f.up), l: dot(d, f.lat) };
  };
  /** The angle of a point round an axis, for a hem or a torn edge that is not cut square. */
  const round = (p: V3, o: V3, ax: [V3, V3, V3]): number => {
    const d = sub(p, o);
    return Math.atan2(dot(d, ax[1]), dot(d, ax[2]));
  };

  // --- Torso -------------------------------------------------------------------------
  const abdF: Frame = { up: norm(mixV(C.up, H.up, 0.5)), fwd: norm(mixV(C.fwd, H.fwd, 0.5)), lat: norm(mixV(C.lat, H.lat, 0.5)) };
  const gi = !!top && look.vNeck;
  ell(at(s.hip, H.fwd, 0, H.up, 1 * k, H.lat, 0), frameAxes(H), [rH * 1.04, rH * 0.8, rH * 0.84], skin, G.torso);
  // Glutes behind.
  for (const sd of [1, -1]) ell(at(s.hip, H.fwd, -rH * 0.42, H.up, -0.5 * k, H.lat, sd * rH * 0.46), frameAxes(H), [rH * 0.58, rH * 0.66, rH * 0.52], skin, G.torso, -0.02, true);
  const woman = !!look.face?.soft;
  ell(s.waist, frameAxes(abdF), [rH * (woman ? 0.8 : 0.94), torso * 0.3, rH * (woman ? 0.64 : 0.72)], skin, G.torso);
  ell(s.chest, frameAxes(C), [rC * 0.98, torso * 0.34, rC * 0.68], skin, G.torso);
  // The shoulder girdle: the bar the arms hang from, which is what makes the chest read as broad.
  const sw = len(sub(s.shoulderN, s.shoulderF)) / 2;
  ell(at(s.neck, C.fwd, -0.5 * k, C.up, -4.2 * k, C.lat, 0), frameAxes(C), [sw * 0.98, 4.6 * k, rC * 0.56], skin, G.torso);
  // Lats flare under the arms.
  for (const sd of [1, -1]) ell(at(s.chest, C.fwd, -rC * 0.12, C.up, -torso * 0.1, C.lat, sd * rC * 0.68), frameAxes(C), [rC * 0.42, torso * 0.3, rC * 0.5], skin, G.torso, 0, true);
  if (b.belly) {
    const bc = at(s.waist, abdF.fwd, rH * 0.35, abdF.up, -torso * 0.05, abdF.lat, 0);
    ell(bc, frameAxes(abdF), [b.belly * k * 0.98, b.belly * k * 0.9, b.belly * k * 0.92], skin, G.torso, 0.02, true);
    crease(at(bc, abdF.fwd, b.belly * k * 0.5, abdF.up, -b.belly * k * 0.7, abdF.lat, -b.belly * k * 0.4), at(bc, abdF.fwd, b.belly * k * 0.6, abdF.up, -b.belly * k * 0.62, abdF.lat, b.belly * k * 0.5), G.torso, 1);
  }
  // Pecs, the abdominal wall in its six blocks, the obliques.
  const pecC = at(s.chest, C.fwd, rC * 0.46, C.up, torso * 0.07, C.lat, 0);
  for (const sd of [1, -1]) ell(at(pecC, C.fwd, 0, C.up, 0, C.lat, sd * rC * 0.44), frameAxes(C), [rC * 0.54, rC * 0.42, rC * 0.34], skin, G.torso, 0.02, true);
  if (!b.belly) {
    for (let row = 0; row < 3; row++)
      for (const sd of [1, -1])
        ell(at(s.waist, abdF.fwd, rH * 0.58, abdF.up, (0.42 - row * 0.36) * torso * 0.3, abdF.lat, sd * rH * 0.24), frameAxes(abdF), [rH * 0.25, torso * 0.075, rH * 0.2], skin, G.torso, 0.03, true);
    for (const sd of [1, -1]) ell(at(s.waist, abdF.fwd, rH * 0.25, abdF.up, -torso * 0.04, abdF.lat, sd * rH * 0.7), frameAxes(abdF), [rH * 0.32, torso * 0.22, rH * 0.4], skin, G.torso, 0, true);
  }
  // Trapezius from the neck down to each shoulder, and the neck itself.
  for (const sh of [s.shoulderN, s.shoulderF]) cone(at(s.neck, C.fwd, -1 * k, C.up, -1.2 * k, C.lat, 0), sh, rC * 0.34, b.rUpper * k * 0.9, skin, G.torso, -0.04, true);
  const neckTop = add(s.head, s.headF.up, -b.head * k * 0.5);
  cone(add(s.neck, C.up, -2 * k), neckTop, b.head * k * (b.belly || b.rChest > 14 ? 0.66 : 0.56), b.head * k * 0.5, skin, G.torso);

  // --- Clothes over the torso ----------------------------------------------------------
  if (top) {
    // The V a gi falls open in: wide at the collar, closing at the belt.
    const vDepth = torso * 0.66;
    const vHalf = (u: number, wider: number) => (1 - Math.min(1, -u / vDepth)) * (rC * 0.44 + wider) + wider * 0.4;
    const inV = (p: V3, wider = 0) => {
      const q = local(p, s.neck, C);
      return q.f > -rC * 0.2 && q.u < 2 * k && Math.abs(q.l - 0.6 * k) < vHalf(q.u, wider);
    };
    const tank: Clip = p => {
      // A vest leaves the shoulders bare.
      if (look.sleeves !== 'none') return false;
      const q = local(p, s.neck, C);
      return -q.u < torso * 0.2 && Math.abs(q.l) > rC * 0.5;
    };
    const cut: Clip = p => (look.vNeck ? inV(p) : false) || tank(p);
    const loose = look.sleeves === 'none' || woman ? 1.03 : 1.1;
    ell(at(s.chest, C.fwd, rC * 0.1, C.up, torso * 0.03, C.lat, 0), frameAxes(C), [rC * 1.06 * loose, torso * 0.42, rC * 0.82 * loose], top, G.torso, 0, false, cut);
    ell(s.waist, frameAxes(abdF), [rH * (woman ? 0.96 : 1.2) * loose, torso * 0.38, rH * (b.belly ? 1.25 : woman ? 0.8 : 1.0) * loose], top, G.torso, 0, false, cut);
    if (woman) for (const sd of [1, -1]) ell(at(pecC, C.fwd, rC * 0.1, C.up, -torso * 0.03, C.lat, sd * rC * 0.42), frameAxes(C), [rC * 0.5, rC * 0.5, rC * 0.46], top, G.torso, 0.02);
    if (woman && extras.has('skirt')) {
      // A qipao: a high collar edged in gold, and the dress drawn in over the hips.
      const gold = r.material('#e8c040');
      cone(add(s.neck, C.up, -1.5 * k), add(s.neck, C.up, 1.6 * k), b.head * k * 0.6, b.head * k * 0.56, top, G.torso, 0.05, true);
      cone(add(s.neck, C.up, 1.2 * k), add(s.neck, C.up, 1.9 * k), b.head * k * 0.58, b.head * k * 0.56, gold, G.torso, 0.1, true);
      ell(at(s.hip, H.fwd, 0, H.up, 2.5 * k, H.lat, 0), frameAxes(H), [rH * 1.12, rH * 0.8, rH * 0.92], top, G.torso);
    }
    if (look.sleeves !== 'none') {
      // The yoke over each shoulder.
      ell(at(s.neck, C.fwd, -0.5 * k, C.up, -4 * k, C.lat, 0), frameAxes(C), [sw * 1.04, 5.4 * k, rC * 0.64], top, G.torso, 0, false, cut);
      for (const sh of [s.shoulderN, s.shoulderF]) cone(at(s.neck, C.fwd, -1 * k, C.up, -1 * k, C.lat, 0), sh, rC * 0.42, b.rUpper * k * 1.22, top, G.torso, -0.04, false, cut);
    }
    if (gi) {
      // The lapels: a band of the cloth doubled along the V's edge, raised off the chest.
      const lapel: Clip = p => inV(p) || !inV(p, 2.3 * k);
      ell(at(s.chest, C.fwd, rC * 0.14, C.up, torso * 0.03, C.lat, 0), frameAxes(C), [rC * 1.1 * loose, torso * 0.44, rC * 0.88 * loose], top, G.torso, 0.06, true, lapel);
      ell(at(s.waist, abdF.fwd, rH * 0.06, abdF.up, 0, abdF.lat, 0), frameAxes(abdF), [rH * 1.24 * loose, torso * 0.4, rH * 1.06 * loose], top, G.torso, 0.06, true, lapel);
      // The jacket's skirt below the belt, split at the front.
      const sk = at(s.hip, H.fwd, 0, H.up, -1.5 * k, H.lat, 0);
      ell(sk, frameAxes(H), [rH * 1.36, 9 * k, rH * 1.2], top, G.torso, -0.02, true, p => {
        const q = local(p, s.hip, H);
        return q.u > rH * 0.6 || q.u < -6.5 * k - Math.sin(round(p, s.hip, frameAxes(H)) * 3) * 0.7 * k || (q.f > 0 && Math.abs(q.l - 0.6 * k) < 1.2 * k - q.u * 0.22);
      });
    } else {
      // Folds across a shirt's front.
      for (const f of [0.2, 0.45]) {
        const y = at(s.waist, abdF.fwd, rH * 0.8, abdF.up, (f - 0.3) * torso, abdF.lat, rH * 0.6);
        crease(y, at(y, abdF.fwd, 0, abdF.up, -2.5 * k, abdF.lat, -rH * 1.1), G.torso, 2);
        lift(at(y, abdF.fwd, 0, abdF.up, 1 * k, abdF.lat, 0), at(y, abdF.fwd, 0, abdF.up, -1.5 * k, abdF.lat, -rH * 1.1), G.torso);
      }
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
    ell(bc, frameAxes(H), [rH * (gi ? 1.34 : 1.2), rH * 0.5, rH * (gi ? 1.16 : 1.02)], belt, G.torso, 0, true, p => Math.abs(local(p, bc, H).u) > 2 * k);
    if (style === 'gi') {
      const knot = at(bc, H.fwd, rH * 1.12, H.up, 0, H.lat, rH * 0.2);
      ell(knot, frameAxes(H), [2.1 * k, 1.8 * k, 1.4 * k], belt, G.torso, 0.1, true);
      for (const [o, l] of [[-0.6, 11], [0.7, 9.5]] as const) {
        const d = hang(o * 0.3 - 0.1);
        cone(knot, add(add(knot, d, l * k), H.lat, o * 2 * k), 1.25 * k, 1.15 * k, belt, G.torso, 0.05, true);
      }
    }
  }
  if (extras.has('skirt') && top) {
    // The qipao's panels hang from the hips front and back, gold at the hem.
    const gold = r.material('#e8c040');
    for (const [f, mat] of [[1, top], [-1, top]] as const) {
      const c0 = at(s.hip, H.fwd, f * rH * (f > 0 ? 1.12 : 0.8), H.up, 0, H.lat, f > 0 ? rH * 0.3 : 0);
      const d = f > 0 ? hang(-0.25 - wind * 0.4) : hang(0.35);
      // A flat panel: wide across the hips, long down the hang, thin front to back.
      const pf = norm(cross(d, H.lat));
      const axes: [V3, V3, V3] = [H.lat, d, pf];
      ell(add(c0, d, 9 * k), axes, [rH * 0.92, 12 * k, 1.4 * k], mat, G.legN, 0.02, true, p => dot(sub(p, c0), d) < 0 || dot(sub(p, c0), d) > 18 * k);
      ell(add(c0, d, 18.4 * k), axes, [rH * 0.8, 1.0 * k, 1.6 * k], gold, G.legN, 0.1, true);
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
    const fr = b.rFist * k * (boxing ? 1.35 : 1);
    const [, n, bn] = along(u, [0, 0, side]);
    if (boxing) {
      ell(add(h, u, fr * 0.35), [u, n, bn], [fr * 1.1, fr * 0.95, fr * 0.9], gloves, g, bias + 0.05, true);
      cone(add(h, u, -fr * 0.55), add(h, u, -fr * 0.9), fr * 0.75, fr * 0.7, r.material('#f4f0e8'), g, bias, true);
      return;
    }
    // A fighter's mitt covers the back of the hand and the wrist and leaves the fingers bare.
    const mitt = look.gloves ? gloves : 0;
    if (pose.hand === 'open') {
      // A flat palm, the fingers together, the thumb splayed.
      ell(add(h, u, fr * 0.25), [u, n, bn], [fr * 0.95, fr * 0.46, fr * 0.84], mitt || skin, g, bias, true);
      cone(add(h, u, fr * 0.9), add(h, u, fr * 1.9), fr * 0.52, fr * 0.38, skin, g, bias, true);
      cone(at(h, u, fr * 0.1, n, 0, bn, fr * 0.55), at(h, u, fr * 0.8, n, fr * 0.2, bn, fr * 0.95), fr * 0.3, fr * 0.24, skin, g, bias, true);
      return;
    }
    // A closed fist: the block of fingers, the knuckle ridge, the thumb wrapped across.
    const fc = add(h, u, fr * 0.35);
    ell(fc, [u, n, bn], [fr * 1.0, fr * 0.92, fr * 0.84], skin, g, bias + 0.03, true);
    if (mitt) ell(add(fc, u, -fr * 0.22), [u, n, bn], [fr * 0.9, fr * 1.0, fr * 0.92], mitt, g, bias + 0.03, true, p => dot(sub(p, fc), u) > fr * 0.28);
    for (const o of [-0.45, 0, 0.45]) {
      const kn = at(fc, u, fr * 0.78, n, 0, bn, o * fr);
      crease(kn, at(kn, u, -fr * 0.4, n, -fr * 0.5, bn, 0), g, 1);
    }
    cone(at(fc, u, -fr * 0.2, n, fr * 0.15, bn, fr * 0.8 * side), at(fc, u, fr * 0.55, n, fr * 0.3, bn, fr * 0.45 * side), fr * 0.36, fr * 0.3, skin, g, bias + 0.08, true);
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
    cone(sh, el, rU * 0.95, rF * 0.92, skin, g, bias);
    ell(add(add(sh, ua, lU * 0.52), ax[1], rU * 0.34), ax, [lU * 0.34, rU * 0.84, rU * 0.86], skin, g, bias + 0.02, true);
    ell(add(add(sh, ua, lU * 0.45), ax[1], -rU * 0.36), ax, [lU * 0.38, rU * 0.82, rU * 0.84], skin, g, bias, true);
    // The deltoid caps the shoulder.
    const dax = along(ua, C.lat.map(x => x * side) as V3);
    ell(add(sh, ua, rU * 0.4), dax, [rU * 1.36, rU * 1.3, rU * 1.2], skin, g, bias + 0.02, true);
    const lF = len(sub(hd, el));
    const fax = along(fa, ax[1]);
    // The forearm: thick below the elbow, narrowing to the wrist.
    cone(el, add(el, fa, lF * 0.45), rF * 1.0, rF * 1.04, skin, g, bias);
    cone(add(el, fa, lF * 0.45), hd, rF * 1.04, rF * 0.66, skin, g, bias);
    ell(add(add(el, fa, lF * 0.3), fax[1], rF * 0.14), fax, [lF * 0.34, rF * 1.1, rF * 1.0], skin, g, bias + 0.02, true);
    if (top && look.sleeves === 'long') {
      cone(sh, el, rU * 1.14, rF * 1.2, top, g, bias);
      cone(el, add(hd, fa, -rF * 1.2), rF * 1.2, rF * 1.1, top, g, bias);
      for (const f of [0.45, 0.8]) crease(at(sh, ua, lU * f, ax[1], rU * 1.2, ax[2], 0), at(sh, ua, lU * f + 2 * k, ax[1], -rU * 1.2, ax[2], 0), g, 2);
      crease(at(el, fa, lF * 0.4, fax[1], rF * 1.3, fax[2], 0), at(el, fa, lF * 0.5, fax[1], -rF * 1.3, fax[2], 0), g, 2);
    } else if (top && look.sleeves === 'short' && extras.has('skirt')) {
      // A puffed sleeve, gathered into a gold cuff above the biceps.
      ell(add(sh, ua, rU * 0.5), dax, [rU * 2.0, rU * 2.0, rU * 1.9], top, g, bias + 0.03, true);
      cone(add(sh, ua, lU * 0.5), add(sh, ua, lU * 0.62), rU * 1.28, rU * 1.24, r.material('#e8c040'), g, bias + 0.08, true);
    } else if (top && look.sleeves === 'short') {
      // A gi's sleeve: wide, stopping above the elbow, creased where it bunches.
      const end = add(sh, ua, lU * 0.72);
      cone(add(sh, ua, -rU * 0.2), end, rU * 1.32, rU * 1.36, top, g, bias);
      crease(at(sh, ua, lU * 0.4, ax[1], rU * 1.5, ax[2], 0), at(sh, ua, lU * 0.52, ax[1], -rU * 1.5, ax[2], 0), g, 2);
      lift(at(sh, ua, lU * 0.4 - 1.2 * k, ax[1], rU * 1.4, ax[2], 0), at(sh, ua, lU * 0.52 - 1.2 * k, ax[1], -rU * 1.4, ax[2], 0), g);
    } else if (top && look.sleeves === 'torn') {
      // A sleeve ripped off at the shoulder: a ragged cuff of cloth over the deltoid.
      const o = add(sh, ua, -rU * 0.5);
      cone(o, add(sh, ua, lU * 0.5), rU * 1.42, rU * 1.4, top, g, bias + 0.02, true, p => dot(sub(p, sh), ua) > lU * 0.12 + Math.sin(round(p, sh, dax) * 4 + side) * 1.4 * k);
    }
    if (bands) {
      cone(add(hd, fa, -rF * 1.9), add(hd, fa, -rF * 0.5), rF * 0.95, rF * 0.85, bands, g, bias + 0.05, true);
      if (extras.has('spikes')) {
        const sp = r.material('#e8e8f0');
        for (const o of [-1, 1]) ell(at(hd, fa, -rF * 1.2, fax[1], o * rF * 1.0, fax[2], 0), fax, [0.8 * k, 0.8 * k, 0.8 * k], sp, g, 0.3);
      }
    }
    if (look.gloves && !extras.has('boxing')) cone(add(hd, fa, -rF * 1.5), add(hd, fa, -rF * 0.2), rF * 0.82, rF * 0.78, gloves, g, bias + 0.03, true);
    hand(el, hd, g, bias, side);
    if (extras.has('claw') && side < 0) {
      // The claw is on the lead hand, which is the far one.
      const steel = r.material('#d8dce8');
      cone(add(hd, fa, -rF * 2.2), add(hd, fa, b.rFist * k * 0.3), rF * 1.1, b.rFist * k * 1.05, r.material('#8a8e9c'), g, bias + 0.1, true);
      for (const o of [-1, 0, 1]) cone(at(hd, fa, b.rFist * k * 0.6, fax[1], o * 1.6 * k, fax[2], o * 1.2 * k), at(hd, fa, 24 * k, fax[1], o * 3.4 * k, fax[2], o * 2 * k), 1.0 * k, 0.45 * k, steel, G.extra, 0.3, true);
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
    const trousers = style === 'gi' || style === 'cargo';
    // Under trousers the leg's own masses take the cloth's colour, so no skin shows through a fold.
    const legMat = trousers || style === 'tight' ? pants : skin;
    cone(hp, kn, rT * 1.05, rS * 1.02, legMat, g, bias);
    ell(add(add(hp, ut, lT * 0.45), tax[1], rT * 0.25), tax, [lT * 0.42, rT * 0.9, rT * 0.92], legMat, g, bias + 0.02, true);
    ell(add(kn, tax[1], rS * 0.55), sax, [rS * 0.6, rS * 0.55, rS * 0.6], legMat, g, bias + 0.04, true);
    // The shin stays skin under a trouser's hem, where the ankle shows.
    cone(kn, an, rS * 0.95, rS * 0.62, trousers ? skin : legMat, g, bias);
    ell(add(add(kn, us, lS * 0.3), sax[1], -rS * 0.42), sax, [lS * 0.32, rS * 0.85, rS * 0.85], trousers ? skin : legMat, g, bias + 0.02, true);
    // Feet: the heel, the long wedge of the instep, and the toes splayed on the floor.
    const fu = norm(sub(toe, an));
    const fax = along(fu, scale(us, -1));
    const fl = len(sub(toe, an));
    const footMat = shoes || skin;
    ell(at(an, fu, -fl * 0.1, fax[1], -rS * 0.12, fax[2], 0), fax, [rS * 0.78, rS * 0.7, rS * 0.7], footMat, g, bias, true);
    ell(at(an, fu, fl * 0.46, fax[1], -rS * 0.26, fax[2], 0), fax, [fl * 0.56, rS * 0.5, rS * 0.8], footMat, g, bias + 0.02);
    ell(at(an, fu, fl * 0.92, fax[1], -rS * 0.42, fax[2], 0), fax, [fl * 0.2, rS * 0.34, rS * 0.86], footMat, g, bias + 0.03, !shoes);
    if (!shoes) {
      for (const o of [-0.35, 0.2]) crease(at(an, fu, fl * 0.86, fax[1], -rS * 0.2, fax[2], o * rS), at(an, fu, fl * 1.08, fax[1], -rS * 0.6, fax[2], o * rS), g, 1);
    }
    if (shoes) {
      // Boots climb the shin; a sole underneath.
      const tall = style === 'trunks' ? 0.5 : trousers ? 0.15 : 0.32;
      cone(add(kn, us, lS * (1 - tall) - rS * 0.3), an, rS * 0.98, rS * 0.78, shoes, g, bias + 0.03);
      crease(add(add(an, fax[1], -rS * 0.6), fu, -rS * 0.5), add(add(an, fax[1], -rS * 0.55), fu, fl * 1.05), g, 3);
    }
    if (trousers) {
      // Trousers: full at the thigh, drawn in at the knee, flaring to a hem cut off above the ankle.
      const wide = style === 'gi' ? 1.5 : 1.34;
      const hemAt = lS * (shoes ? 0.7 : 0.8);
      const mid = add(hp, ut, lT * 0.5);
      cone(add(hp, ut, -rT * 0.3), mid, rT * 1.2, rT * 1.2, pants, g, bias);
      cone(mid, kn, rT * 1.2, rS * wide * 0.96, pants, g, bias);
      ell(add(kn, tax[1], rS * 0.4), sax, [rS * wide * 0.8, rS * wide * 0.86, rS * wide * 0.9], pants, g, bias + 0.02);
      cone(kn, add(kn, us, lS), rS * wide * 0.96, rS * wide * 1.16, pants, g, bias, false, p => dot(sub(p, kn), us) > hemAt + Math.sin(round(p, kn, sax) * 3 + side * 2) * 0.8 * k);
      // The hem's dark mouth, where the cloth stands off the shin.
      const hm = add(kn, us, hemAt);
      crease(at(hm, us, 0.6 * k, sax[1], -rS * wide * 1.1, sax[2], 0), at(hm, us, 0.6 * k, sax[1], rS * wide * 1.1, sax[2], 0), g, 2);
      // Folds: one pulled across the thigh from the hip, two hanging off the knee.
      crease(at(hp, ut, lT * 0.5, tax[1], rT * 1.0, tax[2], 0), at(hp, ut, lT * 0.82, tax[1], -rT * 0.3, tax[2], 0), g, 1);
      lift(at(hp, ut, lT * 0.5 + 1.2 * k, tax[1], rT * 1.0, tax[2], 0), at(hp, ut, lT * 0.82 + 1.2 * k, tax[1], -rT * 0.3, tax[2], 0), g);
      for (const [f, d] of [[0.26, 2], [0.52, 1]] as const) {
        const a = at(kn, us, lS * f, sax[1], -rS * wide * 0.95, sax[2], 0);
        const c = at(kn, us, lS * f - rS * 1.5, sax[1], rS * wide * 0.35, sax[2], 0);
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
  /** An ellipsoid on the head, its radii in head radii (across, up, forward). */
  const blob = (c: V3, a: number, u: number, f: number, mat: number, grp: number, bias = 0, sep = false, clip?: (p: V3) => boolean) => t.ell(c, axes, [hr * a, hr * u, hr * f], mat, grp, bias, sep, clip);
  const { skin, hair, accent } = m;
  const fc = look.face ?? {};
  const jaw = fc.jaw ?? 1;
  const chin = fc.chin ?? 1;
  const brow = fc.brow ?? 1;
  const nose = fc.nose ?? 1;
  /** Hair takes the light late: a dark mass with a sheen on top, not a grey cap. */
  const HAIR = -0.26;
  const dark = r.material('#14100c');
  const white = r.material('#f4f0ec');
  const face = pose.face ?? 'calm';
  const style = look.hairStyle;

  // The skull, the face hung under its front, a chin that sits back from the brow, the brow ridge, cheekbones, nose and ear.
  blob(hp(-0.08, 0.22), 0.84, 0.84, 0.95, skin, g);
  blob(hp(0.2, -0.28), 0.72 * jaw, 0.64, 0.64, skin, g);
  blob(hp(0.34, -0.72 - (chin - 1) * 0.1), 0.44 * jaw, 0.27 * chin, 0.36, skin, g, 0.02);
  if (!fc.soft) blob(hp(0.66, 0.12), 0.62, 0.15 * brow, 0.25 + (brow - 1) * 0.07, skin, g, 0.05, true);
  for (const sd of [1, -1]) blob(hp(0.52, -0.18, sd * 0.42 * jaw), 0.26, 0.18, 0.24, skin, g, 0.05);
  t.cone(hp(0.84, 0.0), hp(1.0 + (nose - 1) * 0.12, -0.27), hr * 0.09 * nose, hr * 0.15 * nose, skin, g, 0.08, true);
  blob(hp(-0.1, -0.06, 0.8 * Math.max(1, jaw * 0.96)), 0.14, 0.26, 0.2, skin, g, -0.04, true);

  // Hair: a shell over the skull, cut at a hairline that sits high on the brow and low at the nape.
  const hairline = (lowAtBack: number, frontAt: number) => (p: V3) => {
    const q = hl(p);
    const line = q.f > 0 ? frontAt - q.f * 0.1 : frontAt + q.f * lowAtBack;
    return q.u < line || (q.l > 0.62 && q.u < 0.25 && q.f > -0.35);
  };
  const cap = (grow: number, lowAtBack = 0.75, frontAt = 0.36, mat = hair) => blob(hp(-0.14, 0.22), 0.92 * grow, 1.0 * grow, 1.06 * grow, mat, hg, HAIR, true, hairline(lowAtBack, frontAt));
  const spike = (f: number, u: number, l: number, out: V3, length: number, r0 = 0.32) => {
    const a = hp(f, u, l);
    t.cone(a, add(a, norm(out), length * hr), r0 * hr, 0.06 * hr, hair, hg, HAIR + 0.04, true);
  };
  /** A direction in the head's frame. */
  const hd = (f: number, u: number, l = 0): V3 => add(add(scale(F.fwd, f), F.up, u), F.lat, l);
  switch (style) {
    case 'spiky': {
      cap(1.1, 0.8, 0.4);
      // Tufts thrown up and back off the crown, and a ragged fringe over the band.
      for (const [f, u, l, bf, bu, n] of [
        [0.5, 0.74, 0.2, 0.9, 0.5, 0.42],
        [0.25, 0.92, 0.3, 0.3, 1, 0.5],
        [-0.1, 1.0, 0.1, -0.2, 1, 0.55],
        [-0.45, 0.9, 0.3, -0.7, 0.8, 0.6],
        [-0.8, 0.6, 0.2, -1, 0.4, 0.55],
        [-0.95, 0.2, 0.15, -1, -0.1, 0.5],
        [0.05, 0.98, -0.3, 0, 1, 0.45],
        [-0.5, 0.86, -0.3, -0.8, 0.7, 0.5]
      ] as const)
        spike(f, u, l, hd(bf, bu, l * 0.5), n, 0.34);
      for (const l of [-0.2, 0.15, 0.45]) spike(0.62, 0.56, l, hd(0.9, -0.5, l * 0.3), 0.34, 0.24);
      break;
    }
    case 'blond': {
      // A full head of hair swept back off the brow and down over the collar.
      cap(1.13, 1.05, 0.34);
      blob(hp(-0.5, 0.36), 0.86, 0.86, 0.8, hair, hg, HAIR, true);
      for (const [f, u, l] of [[0.62, 0.7, 0.2], [0.5, 0.84, -0.1], [0.64, 0.56, 0.5]] as const) spike(f, u, l, hd(0.9, 0.1, l * 0.4), 0.5, 0.3);
      for (const [f, u, l, n] of [[-0.7, -0.1, 0.4, 0.8], [-0.9, 0.1, 0, 0.9], [-0.6, -0.3, -0.3, 0.7]] as const) spike(f, u, l, hd(-0.7, -0.8, l * 0.3), n, 0.36);
      break;
    }
    case 'buns': {
      cap(1.06, 0.7, 0.42);
      // A fringe, a lock in front of each ear, and the two buns in their silk covers.
      for (const l of [-0.3, 0.1, 0.45]) spike(0.66, 0.6, l, hd(0.7, -0.75, l * 0.2), 0.36, 0.26);
      t.cone(hp(0.3, 0.2, 0.74), hp(0.36, -0.5, 0.7), hr * 0.16, hr * 0.08, hair, hg, HAIR, true);
      for (const sd of [1, -1]) {
        const bc = hp(-0.2, 0.92, sd * 0.66);
        blob(bc, 0.42, 0.4, 0.42, accent, hg, 0.08, true);
        blob(add(bc, F.up, -hr * 0.3), 0.3, 0.14, 0.3, hair, hg, HAIR, true);
        t.cone(add(bc, F.fwd, -hr * 0.3), add(add(bc, F.fwd, -hr * 0.5), t.hang(0.5), hr * 0.9), hr * 0.09, hr * 0.07, accent, hg, 0.05, true);
      }
      break;
    }
    case 'mohawk': {
      for (let i = 0; i <= 7; i++) {
        const a = -1.2 + i * 0.3;
        blob(hp(Math.sin(a) * 0.98 - 0.1, Math.cos(a) * 0.98 + 0.24, 0), 0.2, 0.34, 0.26, hair, hg, HAIR + 0.1, true);
      }
      break;
    }
    case 'bald': {
      const red = r.material('#d82424');
      for (const sd of [-0.22, 0, 0.22]) t.mark(hp(0.82, 0.62, sd + 0.1), red, 2, g);
      // A ring in the ear.
      blob(hp(-0.1, -0.34, 0.86), 0.1, 0.12, 0.06, r.material('#e8c040'), hg, 0.2, true);
      break;
    }
    case 'topknot': {
      // Oiled back tight off the brow into a folded knot on the crown.
      cap(1.04, 0.45, 0.5);
      blob(hp(-0.2, 1.3), 0.28, 0.2, 0.5, hair, hg, HAIR + 0.1, true);
      blob(hp(-0.62, 1.12), 0.26, 0.28, 0.26, hair, hg, HAIR, true);
      break;
    }
    case 'mane': {
      cap(1.12, 1.0, 0.3);
      for (const [f, u, l, bf, bu, n] of [
        [0.3, 0.9, 0.2, 0.5, 1, 0.9],
        [-0.1, 1.0, 0, -0.1, 1, 1.1],
        [-0.5, 0.86, 0.25, -0.6, 0.9, 1.1],
        [-0.85, 0.5, 0.2, -1, 0.5, 1.0],
        [-0.95, 0.0, 0.3, -1, -0.1, 0.9],
        [-0.7, -0.45, 0.3, -0.8, -0.8, 0.9],
        [-0.3, 0.5, 0.8, -0.4, 0.4, 0.7],
        [0.1, 0.95, -0.4, 0.1, 1, 0.9],
        [-0.6, 0.7, -0.4, -0.8, 0.8, 1.0]
      ] as const)
        spike(f, u, l, hd(bf, bu, l * 0.4), n, 0.44);
      break;
    }
    case 'flattop': {
      cap(1.03, 0.5, 0.44);
      // A block of hair standing straight up, cut dead level.
      blob(hp(0.02, 0.95), 0.84, 0.75, 0.98, hair, hg, HAIR + 0.12, true, p => hl(p).u > 1.48 || hl(p).u < 0.5);
      break;
    }
    case 'short':
      cap(1.04, 0.45, 0.52);
      break;
    case 'mask': {
      cap(1.06, 1.1, 0.4);
      // A plait down the back.
      const root = hp(-0.9, 0.1);
      const d = t.hang(0.5);
      for (let i = 0; i < 5; i++) blob(add(root, d, i * hr * 0.42), 0.2 - i * 0.015, 0.26, 0.2 - i * 0.015, hair, hg, HAIR + (i % 2) * 0.1, true);
      // The mask: a white shell over the face, a slit for each eye and a painted mouth.
      blob(hp(0.3, -0.2), 0.78, 0.86, 0.72, accent, hg, 0.1, true, p => hl(p).f < 0.12 || hl(p).u > 0.36);
      break;
    }
    case 'patch': {
      // The strap over the bare skull, and the patch on the far eye.
      blob(hp(-0.08, 0.22), 0.86, 0.86, 0.97, accent, hg, 0, true, p => {
        const q = hl(p);
        return Math.abs(q.u - 0.12 - q.f * 0.3 + q.l * 0.1) > 0.07;
      });
      blob(hp(0.8, -0.06, 0.32), 0.2, 0.17, 0.1, accent, hg, 0.05, true);
      break;
    }
    case 'cap': {
      // A peaked military cap: the band, the crown rising to the front, the peak and a badge.
      const capMat = m.top || accent;
      blob(hp(-0.08, 0.52), 1.0, 0.36, 1.12, r.material('#1a1a1e'), hg, 0, true, p => hl(p).u < 0.34);
      blob(hp(0.02, 0.92), 1.08, 0.5, 1.2, capMat, hg, 0, true, p => hl(p).u < 0.62);
      blob(hp(0.86, 0.36), 0.62, 0.07, 0.42, r.material('#1a1a1e'), hg, 0.15, true);
      blob(hp(0.98, 0.84), 0.16, 0.16, 0.06, accent, hg, 0.3, true);
      break;
    }
  }
  if (look.hat) {
    const hc = r.material(look.hatColor ?? '#c83030');
    const black = r.material('#1a1a22');
    const above = (u0: number) => (p: V3) => hl(p).u < u0;
    switch (look.hat) {
      case 'cap':
      case 'peaked':
        blob(hp(-0.08, 0.46), 1.0, 0.66, 1.12, hc, hg, 0, true, above(0.3));
        blob(hp(0.82, 0.3), 0.62, 0.08, 0.5, look.hat === 'peaked' ? black : hc, hg, 0.1, true);
        if (look.hat === 'peaked') blob(hp(0.98, 0.62), 0.16, 0.14, 0.06, r.material('#e8c040'), hg, 0.3, true);
        break;
      case 'sailor': {
        const wh = r.material('#f4f6ff');
        blob(hp(-0.08, 0.5), 1.02, 0.5, 1.12, r.material('#2a3a7a'), hg, 0, true, above(0.34));
        blob(hp(-0.08, 0.9), 1.12, 0.3, 1.24, wh, hg, 0.05, true);
        break;
      }
      case 'hard':
        blob(hp(-0.08, 0.48), 1.0, 0.8, 1.14, hc, hg, 0.05, true, above(0.32));
        blob(hp(0.05, 0.34), 1.22, 0.08, 1.42, hc, hg, 0, true);
        break;
      case 'helmet':
        blob(hp(-0.08, 0.34), 1.06, 0.92, 1.16, hc, hg, 0, true, above(0.1));
        break;
      case 'cone':
        blob(hp(-0.05, 0.72), 1.9, 0.1, 1.9, hc, hg, -0.1, true);
        t.cone(hp(-0.05, 0.72), hp(-0.05, 1.3), hr * 1.5, hr * 0.12, hc, hg, 0.05, true);
        break;
      case 'turban':
        blob(hp(-0.1, 0.6), 1.1, 0.74, 1.22, hc, hg, 0, true, above(0.26));
        blob(hp(0.92, 0.62), 0.14, 0.14, 0.08, r.material('#f8e040'), hg, 0.3, true);
        break;
      case 'plume':
        blob(hp(-0.1, 0.4), 1.0, 1.02, 1.12, r.material('#f0c840'), hg, 0, true, p => Math.abs(hl(p).u - 0.5) > 0.12);
        for (const l of [-0.9, -0.45, 0, 0.45, 0.9]) t.cone(hp(-0.1, 0.9, l * 0.4), hp(-0.2, 2.3 - Math.abs(l) * 0.4, l * 1.3), hr * 0.3, hr * 0.12, hc, hg, 0.05, true);
        break;
      case 'bandana':
        blob(hp(-0.1, 0.4), 0.98, 1.02, 1.12, hc, hg, 0, true, p => Math.abs(hl(p).u - 0.46) > 0.16);
        break;
      case 'flower':
        blob(hp(0.3, 0.8, 0.7), 0.26, 0.24, 0.24, r.material('#f82838'), hg, 0.1, true);
        break;
      case 'beret':
        blob(hp(-0.15, 0.9, 0.15), 1.12, 0.3, 1.2, hc, hg, 0, true);
        break;
      case 'cowboy':
        blob(hp(-0.05, 0.5), 1.7, 0.08, 1.7, hc, hg, -0.05, true);
        blob(hp(-0.08, 0.7), 0.74, 0.62, 0.84, hc, hg, 0.05, true, above(0.5));
        break;
      case 'hood':
        blob(hp(-0.2, 0.08), 1.14, 1.2, 1.2, m.top || hc, hg, 0, true, p => {
          const q = hl(p);
          return q.f > 0.45 && Math.abs(q.l) < 0.62 && q.u < 0.5 && q.u > -0.9;
        });
        break;
    }
  }
  if (look.accent && style === 'spiky') {
    // The headband, its knot at the back and two long tails.
    blob(hp(-0.12, 0.38), 0.98, 1.04, 1.12, accent, hg, 0, true, p => {
      const q = hl(p);
      const mid = 0.4 + q.f * 0.06;
      return Math.abs(q.u - mid) > 0.14;
    });
    const knot = hp(-1.05, 0.36, 0.1);
    blob(knot, 0.16, 0.16, 0.14, accent, hg, 0.05, true);
    for (const [back, l0] of [[0.75, 1.7], [0.3, 1.9]] as const) {
      const d = t.hang(back);
      const mid = add(add(knot, d, l0 * hr * 0.5), F.lat, -0.1 * hr);
      t.cone(knot, mid, hr * 0.14, hr * 0.15, accent, hg, 0.05, true);
      t.cone(mid, add(add(mid, t.hang(back + 0.3), l0 * hr * 0.5), F.lat, -0.1 * hr), hr * 0.15, hr * 0.12, accent, hg, 0.05, true);
    }
  }
  if (style === 'topknot' && m.extras.has('paint')) {
    // The kumadori: red strokes sweeping up from the eye and across the cheek.
    for (let i = 0; i < 4; i++) {
      t.mark(hp(0.78, 0.15 + i * 0.08, 0.32 + i * 0.12), accent, 2, g);
      t.mark(hp(0.7, -0.2 - i * 0.03, 0.36 + i * 0.1), accent, 2, g);
    }
  }
  if (fc.beard) {
    // A full beard: a shell round the jaw from ear to ear, clear of the mouth.
    blob(hp(0.2, -0.46), 0.78 * jaw, 0.6, 0.7, r.material(fc.beard), hg, HAIR + 0.1, true, p => {
      const q = hl(p);
      return q.u > -0.26 + Math.max(0, q.f - 0.55) * 0.5 || (q.f > 0.62 && q.u > -0.62 && Math.abs(q.l) < 0.2);
    });
  }
  if (fc.moustache) blob(hp(0.8, -0.42), 0.3, 0.08, 0.12, r.material(fc.moustache), hg, HAIR + 0.1, true);

  // The face: a dark brow over each eye, the eye under it, the shadow under the nose, the mouth.
  const masked = style === 'mask';
  const hairRgb = parseInt(look.hair.slice(1), 16);
  const fair = ((hairRgb >> 16) & 255) + ((hairRgb >> 8) & 255) > 330;
  const browMat = style === 'bald' || style === 'patch' ? r.material('#3a2418') : fc.beard ? r.material(fc.beard) : style === 'cap' ? dark : fair ? r.material('#6a4418') : hair;
  /** How far forward the brow ridge stands, which the brow sits on. */
  const ridge = 0.9 + (brow - 1) * 0.07;
  for (const sd of [1, -1]) {
    const e = hp(0.82, -0.08, sd * 0.3);
    if (masked) {
      // The slit.
      t.mark(hp(0.9, -0.02, sd * 0.3), dark, 0, hg);
      t.mark(hp(0.9, -0.02, sd * 0.3 + 0.12), dark, 0, hg);
      continue;
    }
    if (style === 'patch' && sd > 0) continue;
    // The brow: a short dark bar, its inner end pulled down in a scowl.
    const tilt = (fc.soft ? -0.1 : 0.22) * sd;
    const bl = norm(add(scale(F.lat, Math.cos(tilt)), F.up, Math.sin(tilt)));
    const bu = norm(add(scale(F.up, Math.cos(tilt)), F.lat, -Math.sin(tilt)));
    t.ell(hp(fc.soft ? 0.86 : ridge - 0.02, fc.soft ? 0.16 : 0.08, sd * 0.31), [bl, bu, F.fwd], [hr * 0.22, hr * (fc.soft ? 0.05 : 0.075) * Math.min(1.4, brow), hr * 0.06], browMat, g, -0.3, false);
    if (k > 2) {
      // Close up, an eye is drawn: the white, the iris looking at the opponent, the lid's dark line over both.
      if (face === 'hurt') {
        t.ell(e, axes, [hr * 0.15, hr * 0.03, hr * 0.05], dark, g, -0.5);
        continue;
      }
      blob(e, 0.15, 0.075, 0.06, white, g, 0.4);
      if (!fc.blank) blob(add(e, F.lat, hr * 0.03), 0.07, 0.075, 0.07, dark, g, -0.5);
      t.ell(add(e, F.up, hr * 0.07), axes, [hr * 0.17, hr * 0.028, hr * 0.07], dark, g, -0.5);
      if (fc.soft) t.cone(add(e, F.lat, sd * hr * 0.15), at(e, F.fwd, 0, F.up, hr * 0.1, F.lat, sd * hr * 0.26), hr * 0.03, hr * 0.02, dark, g, -0.5);
      continue;
    }
    if (face === 'hurt') {
      t.mark(e, dark, 0, g);
      t.mark(add(e, F.lat, k * 0.9), dark, 0, g);
    } else if (fc.blank) {
      t.mark(e, white, 4, g);
      t.mark(add(e, F.lat, k * 0.9), white, 4, g);
    } else {
      t.mark(add(e, F.lat, k * 0.95), white, 3, g);
      t.mark(e, dark, 0, g);
      if (fc.soft) t.mark(add(e, F.up, k * 0.9), dark, 0, g);
    }
  }
  if (!masked) {
    // Under the nose, and the line from its wing down the cheek.
    t.mark(hp(0.9, -0.36, 0.08), skin, 0, g);
    if (!fc.soft) t.crease(hp(0.8, -0.34, 0.22), hp(0.72, -0.5, 0.36), g, 1);
    const mouth = hp(0.8, -0.56, 0.1);
    if (k > 2) {
      // Close up, a mouth: the dark line between the lips, the lower lip's light, or teeth bared.
      const mc = hp(0.8, -0.56, 0);
      if (face === 'shout' || face === 'hurt') {
        blob(mc, 0.24, 0.12, 0.1, r.material('#6a0e0e'), g, -0.2);
        blob(add(mc, F.up, hr * 0.07), 0.2, 0.035, 0.11, white, g, 0.3);
      } else {
        t.ell(mc, axes, [hr * 0.24, hr * 0.028, hr * 0.1], fc.soft ? r.material('#a02838') : dark, g, fc.soft ? 0 : -0.4);
        if (fc.soft) blob(add(mc, F.up, -hr * 0.06), 0.16, 0.05, 0.1, r.material('#c84858'), g, 0.1);
      }
      if (fc.fangs) for (const sd of [1, -1]) t.cone(at(mc, F.fwd, hr * 0.04, F.up, 0, F.lat, sd * hr * 0.16), at(mc, F.fwd, hr * 0.04, F.up, hr * 0.18, F.lat, sd * hr * 0.17), hr * 0.05, hr * 0.015, white, g, 0.4);
    } else if (face === 'shout' || face === 'hurt') {
      const red = r.material('#6a0e0e');
      t.mark(mouth, red, 0, g);
      t.mark(add(mouth, F.up, -k), red, 0, g);
      t.mark(add(mouth, F.lat, k), red, 1, g);
      t.mark(add(add(mouth, F.lat, k), F.up, -k), red, 0, g);
      t.mark(add(mouth, F.up, k * 0.9), white, 3, g);
    } else if (fc.soft) {
      const lips = r.material('#c03848');
      t.mark(mouth, lips, 1, g);
      t.mark(add(mouth, F.lat, k), lips, 2, g);
    } else {
      t.mark(mouth, skin, 0, g);
      t.mark(add(mouth, F.lat, k), skin, 0, g);
      t.mark(add(mouth, F.lat, k * 2), skin, 1, g);
    }
    if (fc.fangs) {
      t.mark(add(mouth, F.up, -k), white, 4, g);
      t.mark(add(add(mouth, F.lat, k * 2), F.up, -k), white, 4, g);
    }
    if (fc.scar) t.crease(hp(0.78, 0.3, 0.5), hp(0.7, -0.3, 0.56), g, 2);
  } else {
    t.mark(hp(0.98, -0.5, 0.1), r.material('#c03848'), 1, hg);
  }
  // The jaw's edge.
  t.crease(hp(-0.1, -0.5, 0.68 * jaw), hp(0.3, -0.86, 0.42 * jaw), g, 1);
}
