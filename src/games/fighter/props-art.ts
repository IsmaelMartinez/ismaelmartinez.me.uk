/**
 * The props the screens and the bonus stages need, painted once: the bonus
 * car in its damage stages (pristine, dented with a cracked screen, glass
 * gone and a bumper hanging, a door off its hinge and a wheel gone, sat on
 * its belly, and finally the wreck), the oil drum, the national flags, the
 * map's plane, the KO emblem and the round-win medal.
 */
import { PixBuf, mix, rgb } from './pixbuf';

export interface Baked {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, Baked>();
function bake(key: string, make: () => { buf: PixBuf; ax: number; ay: number }): Baked {
  const hit = cache.get(key);
  if (hit) return hit;
  const { buf, ax, ay } = make();
  const b = { canvas: buf.toCanvas(), ax, ay };
  cache.set(key, b);
  return b;
}

// --- The car -------------------------------------------------------------------------------

/** 0 pristine ... 4 on its belly, 5 the wreck. */
export function carStage(health: number, broken: boolean): number {
  if (broken || health <= 0) return 5;
  if (health > 0.8) return 0;
  if (health > 0.6) return 1;
  if (health > 0.4) return 2;
  if (health > 0.2) return 3;
  return 4;
}

export const CAR_W = 176;
const CAR_PAD = 8;

/** The car at `stage`, anchored at its rear end on the floor. */
export function carArt(stage: number, flash: boolean): Baked {
  return bake(`car:${stage}:${flash ? 1 : 0}`, () => {
    const buf = paintCar(stage);
    return { buf: flash ? buf.silhouette(rgb('#ffffff')) : buf, ax: CAR_PAD, ay: buf.h - 4 };
  });
}

function paintCar(stage: number): PixBuf {
  const W = CAR_W + CAR_PAD * 2;
  const H = 96;
  const buf = new PixBuf(W, H);
  const X = (v: number) => v + CAR_PAD;
  const FY = H - 4;
  const wreck = stage === 5;
  const paint = wreck
    ? { hi: '#6a5048', base: '#4a3430', mid: '#3a2824', dark: '#2a1c1a', deep: '#160e0c' }
    : { hi: '#f87860', base: '#d82820', mid: '#b01c18', dark: '#781010', deep: '#400808' };
  const P = {
    hi: rgb(paint.hi),
    base: rgb(paint.base),
    mid: rgb(paint.mid),
    dark: rgb(paint.dark),
    deep: rgb(paint.deep),
    chrome0: rgb('#ffffff'),
    chrome1: rgb('#c8d0d8'),
    chrome2: rgb('#808890'),
    chrome3: rgb('#404850'),
    tyre: rgb('#181818'),
    tyreHi: rgb('#404040'),
    glass0: rgb('#e0f4ff'),
    glass1: rgb('#98c8e8'),
    glass2: rgb('#5888b8'),
    glass3: rgb('#305888'),
    inside: rgb('#181820'),
    primer: rgb('#8a8a88'),
    line: rgb('#200404')
  };
  const frontGone = stage >= 3;
  const sink = stage >= 4 ? 11 : 0;
  // The body drops at the end that has lost its wheel.
  const tilt = (x: number) => sink + (frontGone && stage === 3 ? Math.max(0, (x - 70) / 106) * 9 : 0);
  const Y = (x: number, y: number) => FY - y + tilt(x) + (wreck ? 4 : 0);
  const roofDrop = stage >= 4 ? 8 : stage === 3 ? 3 : 0;
  const crush = wreck ? 12 : 0;

  // Wheels, behind the body.
  const wheel = (cx: number, lost: boolean, hubcap: boolean) => {
    if (lost) return;
    const cy = FY - 13;
    buf.disc(X(cx), cy, 13.5, P.tyre);
    buf.disc(X(cx), cy, 12.5, rgb('#262626'));
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      buf.set(X(cx) + Math.cos(ang) * 11.5, cy + Math.sin(ang) * 11.5, P.tyreHi);
    }
    if (hubcap) {
      buf.disc(X(cx), cy, 8, P.chrome3);
      buf.disc(X(cx), cy, 7, P.chrome2);
      buf.disc(X(cx) - 0.6, cy - 0.6, 5.8, P.chrome1);
      buf.disc(X(cx) - 1.5, cy - 1.5, 2.4, P.chrome0);
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + 0.3;
        buf.set(X(cx) + Math.cos(ang) * 5, cy + Math.sin(ang) * 5, P.chrome3);
      }
      buf.disc(X(cx), cy, 1.6, P.chrome3);
    } else {
      buf.disc(X(cx), cy, 6, rgb('#3a3a3a'));
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        buf.rect(X(cx) + Math.cos(ang) * 3.5 - 1, cy + Math.sin(ang) * 3.5 - 1, 2, 2, rgb('#707070'));
      }
    }
  };
  wheel(38, stage >= 4, stage < 2);
  wheel(140, frontGone, stage < 1);

  // The lower body: rear bumper to front bumper, with the boot and bonnet decks.
  const lower: [number, number][] = [
    [X(4), Y(4, 36 - crush * 0.3)],
    [X(44), Y(44, 38 - crush * 0.5)],
    [X(128), Y(128, 38 - crush * 0.5)],
    [X(170), Y(170, 34 - crush * 0.3)],
    [X(175), Y(175, 28)],
    [X(176), Y(176, 16)],
    [X(170), Y(170, 11)],
    [X(4), Y(4, 11)],
    [X(0), Y(0, 16)],
    [X(0), Y(0, 30)]
  ];
  buf.poly(lower, (x, y) => {
    const top = Y(x - CAR_PAD, 38);
    const d = y - top;
    if (d < 2) return P.hi;
    if (d === 3 || d === 4) return (x + y) % 2 ? P.hi : P.base;
    if (d < 9) return P.base;
    if (d < 13) return (x + y) % 2 ? P.base : P.mid;
    if (d < 19) return P.mid;
    return P.dark;
  });
  // The cabin.
  const rf = 62 - roofDrop - crush;
  const cabin: [number, number][] = [
    [X(46), Y(46, 38 - crush * 0.5)],
    [X(62), Y(62, rf)],
    [X(66), Y(66, rf + 2)],
    [X(110), Y(110, rf + 2)],
    [X(116), Y(116, rf)],
    [X(134), Y(134, 38 - crush * 0.5)]
  ];
  buf.poly(cabin, (x, y) => (y - Y(x - CAR_PAD, rf + 2) < 2 ? P.hi : P.base));
  if (stage >= 4 || wreck) {
    // The crushed roof line.
    for (let x = 64; x < 112; x += 6) buf.poly([[X(x), Y(x, rf + 2)], [X(x + 3), Y(x, rf - 1)], [X(x + 6), Y(x, rf + 2)]], P.dark);
  }
  // Wheel arches.
  for (const cx of wreck ? [] : [38, 140]) {
    const cy = FY - 13 + tilt(cx);
    for (let y = Math.floor(cy - 17); y < FY + 2; y++)
      for (let x = Math.floor(X(cx) - 17); x <= X(cx) + 17; x++) {
        const d = Math.hypot(x + 0.5 - X(cx), y + 0.5 - cy);
        const lost = (cx > 90 && frontGone) || (cx < 90 && stage >= 4);
        const wheelThere = !lost && d < 13.5 && y < FY + 1;
        if (d < 16.5 && y >= cy - 17 && buf.get(x, y) && !wheelThere) {
          if (d > 15.3) buf.set(x, y, P.deep);
          else buf.set(x, y, lost ? P.inside : 0);
        }
      }
    if (!((cx > 90 && frontGone) || (cx < 90 && stage >= 4))) wheel(cx, false, cx < 90 ? stage < 2 : stage < 1);
  }

  // The glass.
  const glass = wreck || stage >= 4 ? 'gone' : stage >= 2 ? 'shattered' : stage === 1 ? 'cracked' : 'ok';
  const windows: [number, number][][] = [
    [
      [X(52), Y(52, 39)],
      [X(64), Y(64, rf - 3)],
      [X(86), Y(86, rf - 3)],
      [X(86), Y(86, 39)]
    ],
    [
      [X(90), Y(90, 39)],
      [X(90), Y(90, rf - 3)],
      [X(112), Y(112, rf - 3)],
      [X(128), Y(128, 39)]
    ]
  ];
  for (const win of windows) {
    if (glass === 'gone') {
      buf.poly(win, P.inside);
      continue;
    }
    buf.poly(win, (x, y) => {
      const g = (x * 0.9 - y * 1.4) % 26;
      const gg = g < 0 ? g + 26 : g;
      if (gg < 3) return P.glass0;
      if (gg < 5 || (gg > 12 && gg < 14)) return P.glass1;
      return y < Y(x - CAR_PAD, rf - 10) ? P.glass1 : y < Y(x - CAR_PAD, 47) ? P.glass2 : P.glass3;
    });
  }
  // Seats and a headrest seen through the glass.
  if (rf - 12 > 40) {
    buf.rect(X(70), Y(70, rf - 10), 6, Math.min(10, rf - 50), glass === 'gone' ? rgb('#40302a') : P.glass3);
    buf.rect(X(104), Y(104, rf - 10), 6, Math.min(10, rf - 50), glass === 'gone' ? rgb('#40302a') : P.glass3);
  }
  if (glass === 'cracked') {
    // A star of cracks in the front window.
    const cx = X(108);
    const cy = Y(108, 50);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      for (let d = 0; d < 9 + (i % 3) * 3; d++) {
        const px = cx + Math.cos(a) * d + (d > 4 ? Math.sin(d + i) : 0);
        const py = cy + Math.sin(a) * d * 0.8;
        if (buf.get(Math.floor(px), Math.floor(py)) !== P.base && buf.get(Math.floor(px), Math.floor(py)) !== P.hi) buf.set(px, py, P.glass0);
      }
    }
    buf.rect(cx - 1, cy - 1, 3, 3, P.glass0);
  }
  if (glass === 'shattered') {
    for (const win of windows) {
      const xs = win.map(p => p[0]);
      const ys = win.map(p => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      // Most of it gone: the interior shows through a jagged hole.
      for (let y = Math.ceil(y0) + 1; y < y1; y++)
        for (let x = Math.ceil(x0) + 1; x < x1; x++) {
          const v = buf.get(x, y);
          if (v !== P.glass0 && v !== P.glass1 && v !== P.glass2 && v !== P.glass3) continue;
          const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
          const jag = 2 + ((x * 7 + y * 13) % 5);
          if (edge > jag) buf.set(x, y, P.inside);
        }
    }
  }
  // Pillars and the window frames.
  buf.rect(X(86), Y(86, rf - 2), 4, rf - 40, P.dark);
  buf.rect(X(87), Y(87, rf - 2), 1, rf - 40, P.mid);
  for (const win of windows) {
    for (let i = 0; i < win.length; i++) {
      const [ax, ay] = win[i];
      const [bx, by] = win[(i + 1) % win.length];
      if (Math.abs(ay - by) < 0.5 && ay > Y(90, 41)) continue;
      buf.line(ax, ay, bx, by, wreck ? P.dark : P.chrome2);
    }
  }

  // Chrome: the side trim, bumpers, handles, lights.
  if (!wreck) {
    for (let x = 6; x < 170; x++) {
      buf.set(X(x), Y(x, 26), P.chrome1);
      buf.set(X(x), Y(x, 25), P.chrome3);
    }
    // Door shut lines.
    for (const dx of [54, 88, 130]) for (let y = 13; y < 37; y++) buf.set(X(dx), Y(dx, y), P.line);
    for (let x = 54; x < 130; x++) buf.set(X(x), Y(x, 13), P.line);
    // Handles.
    buf.rect(X(76), Y(76, 33), 7, 2, P.chrome1);
    buf.rect(X(76), Y(76, 32), 7, 1, P.chrome3);
    if (stage < 3) {
      buf.rect(X(114), Y(114, 33), 7, 2, P.chrome1);
      buf.rect(X(114), Y(114, 32), 7, 1, P.chrome3);
    }
    // Rear bumper.
    buf.rect(X(-2), Y(0, 21), 12, 6, P.chrome2);
    buf.rect(X(-2), Y(0, 21), 12, 2, P.chrome0);
    buf.rect(X(-2), Y(0, 16), 12, 1, P.chrome3);
    // Front bumper, hanging off by one corner once it has been kicked.
    if (stage >= 2) {
      buf.poly([[X(166), Y(166, 22)], [X(178), Y(178, 13)], [X(180), Y(180, 9)], [X(167), Y(167, 16)]], P.chrome2);
      buf.line(X(166), Y(166, 22), X(178), Y(178, 13), P.chrome0);
    } else {
      buf.rect(X(166), Y(166, 21), 12, 6, P.chrome2);
      buf.rect(X(166), Y(166, 21), 12, 2, P.chrome0);
      buf.rect(X(166), Y(166, 16), 12, 1, P.chrome3);
    }
    // Lights: tail lights and the headlamp.
    buf.rect(X(0), Y(0, 33), 4, 8, rgb('#901010'));
    buf.rect(X(0), Y(0, 33), 3, 5, rgb('#f83030'));
    buf.rect(X(1), Y(0, 32), 1, 2, rgb('#f8c0b0'));
    if (stage >= 2) {
      buf.rect(X(171), Y(171, 32), 5, 6, P.inside);
      buf.set(X(172), Y(171, 31), P.glass0);
      buf.set(X(174), Y(171, 29), P.glass1);
    } else {
      buf.rect(X(171), Y(171, 32), 5, 6, rgb('#d8d0a0'));
      buf.rect(X(172), Y(171, 31), 3, 3, rgb('#fffff0'));
      buf.rect(X(168), Y(168, 25), 6, 2, rgb('#f8a020'));
    }
    // The wing mirror and the aerial.
    if (stage < 3) {
      buf.rect(X(126), Y(126, 44), 5, 4, P.dark);
      buf.rect(X(126), Y(126, 44), 5, 1, P.hi);
    }
    if (stage < 2) for (let y = 38; y < 58; y++) buf.set(X(20 + (y - 38) * 0.3), Y(20, y), P.chrome2);
  }

  // Dents: shadowed hollows with a lit lip, more of them stage by stage.
  const dents: [number, number, number][] = [
    [100, 28, 5],
    [150, 30, 4],
    [30, 30, 5],
    [70, 22, 6],
    [120, 20, 5],
    [160, 22, 4],
    [12, 24, 4],
    [58, 32, 4],
    [138, 34, 4],
    [86, 18, 6],
    [44, 20, 5],
    [108, 34, 3]
  ];
  const nDents = [0, 3, 6, 9, 12, 12][stage];
  for (let i = 0; i < nDents; i++) {
    const [dx, dy, r] = dents[i];
    const cx = X(dx);
    const cy = Y(dx, dy);
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
        const v = buf.get(x, y);
        if (v !== P.base && v !== P.mid && v !== P.hi && v !== P.dark && v !== P.chrome1 && v !== P.chrome3) continue;
        const nx = (x + 0.5 - cx) / (r * 1.4);
        const ny = (y + 0.5 - cy) / r;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        if (ny < -0.5 && d > 0.45) buf.set(x, y, P.hi);
        else if (ny > 0.2) buf.set(x, y, (x + y) % 2 ? P.dark : P.deep);
        else buf.set(x, y, P.dark);
      }
    // Paint knocked off down to the primer.
    if (stage >= 2 && i % 3 === 1) buf.rect(cx - 2, cy - 1, 4, 2, P.primer);
  }

  // A door off its top hinge, hanging open at the bottom.
  if (stage === 3 || stage === 4) {
    const top = Y(90, 37);
    const door: [number, number][] = [
      [X(90), top],
      [X(129), Y(129, 37)],
      [X(134), Y(129, 12) + 7],
      [X(95), Y(90, 12) + 5]
    ];
    buf.poly(door, (x, y) => (y - top < 2 ? P.hi : y - top < 12 ? P.base : P.mid));
    buf.line(door[0][0], door[0][1], door[3][0], door[3][1], P.line);
    buf.line(door[1][0], door[1][1], door[2][0], door[2][1], P.deep);
    buf.line(door[3][0], door[3][1], door[2][0], door[2][1], P.deep);
    // Its window frame, empty.
    buf.line(X(92), top, X(92), top - 4, P.chrome2);
    buf.rect(X(112), Y(112, 32) + 3, 7, 2, P.chrome1);
  }
  // The bonnet sprung up.
  if (stage >= 3 && !wreck) {
    buf.poly([[X(134), Y(134, 38)], [X(168), Y(168, 46)], [X(170), Y(170, 43)], [X(136), Y(136, 36)]], P.base);
    buf.line(X(134), Y(134, 38), X(168), Y(168, 46), P.hi);
    buf.rect(X(140), Y(140, 37), 26, 2, P.inside);
  }
  if (wreck) {
    // Scorch, crumple folds and an exposed engine.
    for (let i = 0; i < 40; i++) {
      const x = X(4 + ((i * 37) % 168));
      const y = Y(0, 14 + ((i * 11) % 22));
      if (buf.get(x, y)) buf.rect(x, y, 3, 2, i % 3 ? P.deep : rgb('#5a4a40'));
    }
    for (let x = 8; x < 168; x += 10) buf.line(X(x), Y(x, 28), X(x + 5), Y(x, 22), P.deep);
    buf.rect(X(140), Y(140, 34), 24, 6, rgb('#404040'));
    buf.rect(X(144), Y(144, 34), 6, 2, rgb('#707070'));
  }
  buf.outline(rgb('#100404'), 1);
  return buf;
}

// --- The oil drum --------------------------------------------------------------------------

export function drumArt(w: number, h: number, health: number, flash: boolean): Baked {
  const stage = health > 0.66 ? 0 : health > 0.33 ? 1 : 2;
  return bake(`drum:${w}:${h}:${stage}:${flash ? 1 : 0}`, () => {
    const buf = new PixBuf(w + 2, h + 2);
    const ramp = ['#0c2048', '#183878', '#2858a8', '#3c74c8', '#78a8e8', '#b8d8f8', '#3c74c8', '#2858a8', '#183878', '#0c2048'];
    const colAt = (x: number) => {
      const t = x / (w - 1);
      const k = t < 0.18 ? Math.floor(t * 11) : t < 0.36 ? 3 + Math.floor((t - 0.18) * 16) : 6 + Math.floor((t - 0.36) * 6);
      return rgb(ramp[Math.min(ramp.length - 1, k)]);
    };
    const dentAt = (x: number, y: number): boolean => {
      if (stage === 0) return false;
      const d1 = ((x - w * 0.62) / 6) ** 2 + ((y - h * 0.42) / 5) ** 2;
      const d2 = stage === 2 ? ((x - w * 0.3) / 7) ** 2 + ((y - h * 0.7) / 6) ** 2 : 9;
      return d1 < 1 || d2 < 1;
    };
    for (let y = 5; y < h + 1; y++)
      for (let x = 1; x < w + 1; x++) {
        let c = colAt(x - 1);
        if (dentAt(x, y)) c = (x + y) % 2 ? rgb('#0c2048') : rgb('#183878');
        buf.set(x, y, c);
      }
    // Rims and the two rolling hoops, lit on top and shaded under.
    const hoop = (y: number) => {
      for (let x = 1; x < w + 1; x++) {
        buf.set(x, y - 1, rgb(mix('#b8d8f8', '#3c74c8', Math.abs(x / w - 0.3) * 1.5)));
        buf.set(x, y, colAt(x - 1));
        buf.set(x, y + 1, rgb('#0c2048'));
      }
    };
    hoop(Math.round(h * 0.34));
    hoop(Math.round(h * 0.68));
    // The lid seen from just above, with its bung; the base curving away.
    const lx = (w + 2) / 2;
    buf.ellipse(lx, 5, w / 2, 4.5, rgb('#081838'));
    buf.ellipse(lx, 5, w / 2 - 1, 3.6, rgb('#78a8e8'));
    buf.ellipse(lx, 5.4, w / 2 - 3, 2.6, rgb('#3c74c8'));
    buf.ellipse(lx - 2, 4.6, w / 2 - 8, 1.2, rgb('#5888d0'));
    buf.disc(lx + w * 0.22, 5, 1.6, rgb('#183878'));
    buf.set(lx + w * 0.22 - 1, 4, rgb('#b8d8f8'));
    for (let y = h - 2; y <= h + 1; y++)
      for (let x = 0; x < w + 2; x++) {
        const nx = (x + 0.5 - lx) / (w / 2);
        const ny = (y - (h - 2)) / 3;
        if (nx * nx + ny * ny > 1) buf.set(x, y, 0);
        else if (nx * nx + (ny + 0.35) ** 2 > 1) buf.set(x, y, rgb('#081838'));
      }
    // Dents catch the light along their top lip.
    if (stage > 0)
      for (let y = 6; y < h; y++)
        for (let x = 1; x < w + 1; x++) if (dentAt(x, y) && !dentAt(x, y - 2)) buf.set(x, y, rgb('#b8d8f8'));
    // The hazard diamond.
    const cx = Math.round(w * 0.42);
    const cy = Math.round(h * 0.51);
    buf.poly([[cx, cy - 5], [cx + 5, cy], [cx, cy + 5], [cx - 5, cy]], rgb('#101010'));
    buf.poly([[cx, cy - 4], [cx + 4, cy], [cx, cy + 4], [cx - 4, cy]], rgb('#f8c818'));
    buf.rect(cx - 1, cy - 2, 2, 3, rgb('#e83010'));
    if (stage === 2) {
      // Oil weeping from a split seam.
      for (let y = Math.round(h * 0.7); y < h; y++) buf.set(Math.round(w * 0.3) + ((y >> 2) & 1), y, rgb('#101010'));
      buf.rect(Math.round(w * 0.3) - 1, Math.round(h * 0.68), 4, 2, rgb('#000000'));
    }
    buf.outline(rgb('#040810'), 1);
    return { buf: flash ? buf.silhouette(rgb('#ffffff')) : buf, ax: Math.round((w + 2) / 2), ay: h + 1 };
  });
}

// --- Flags --------------------------------------------------------------------------------

export type FlagId = 'japan' | 'usa' | 'china' | 'ussr' | 'india' | 'brazil' | 'spain' | 'thailand';

export const FLAG_OF: Record<string, FlagId> = {
  japan: 'japan',
  usa: 'usa',
  harbour: 'usa',
  vegas: 'usa',
  china: 'china',
  ussr: 'ussr',
  india: 'india',
  brazil: 'brazil',
  spain: 'spain',
  thailand: 'thailand',
  temple: 'thailand'
};

/** A flag `k` times the 16 x 11 design, framed. */
export function flagArt(id: FlagId, k = 1): Baked {
  return bake(`flag:${id}:${k}`, () => {
    const W = 16 * k;
    const H = 11 * k;
    const buf = new PixBuf(W + 2, H + 2);
    const R = (x: number, y: number, w: number, h: number, c: string) => buf.rect(1 + x * k, 1 + y * k, w * k, h * k, rgb(c));
    switch (id) {
      case 'japan':
        R(0, 0, 16, 11, '#f8f8f8');
        buf.disc(1 + 8 * k, 1 + 5.5 * k, 3.2 * k, rgb('#d81818'));
        break;
      case 'usa':
        for (let i = 0; i < 11; i++) R(0, i, 16, 1, i % 2 ? '#f8f8f8' : '#d01818');
        R(0, 0, 7, 6, '#20308c');
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) R(1 + x * 2, 1 + y * 2 - (k > 1 ? 0 : 0), 1, 1, '#f8f8f8');
        break;
      case 'china':
        R(0, 0, 16, 11, '#d81818');
        buf.poly(starPts(1 + 3.5 * k, 1 + 3.5 * k, 2.6 * k), rgb('#f8e020'));
        for (const [x, y] of [
          [7, 1.5],
          [8.5, 3.5],
          [8.5, 6],
          [7, 8]
        ])
          R(x, y, 1, 1, '#f8e020');
        break;
      case 'ussr':
        R(0, 0, 16, 11, '#d01010');
        R(2, 1, 1, 1, '#f8d020');
        R(2, 3, 3, 1, '#f8d020');
        R(3, 2, 1, 3, '#f8d020');
        R(2, 5, 1, 1, '#f8d020');
        break;
      case 'india':
        R(0, 0, 16, 4, '#f89830');
        R(0, 4, 16, 3, '#f8f8f8');
        R(0, 7, 16, 4, '#189030');
        buf.disc(1 + 8 * k, 1 + 5.5 * k, 1.5 * k, rgb('#20308c'));
        buf.disc(1 + 8 * k, 1 + 5.5 * k, 0.6 * k + 0.1, rgb('#f8f8f8'));
        break;
      case 'brazil':
        R(0, 0, 16, 11, '#109030');
        buf.poly([[1 + 8 * k, 1 + 1 * k], [1 + 15 * k, 1 + 5.5 * k], [1 + 8 * k, 1 + 10 * k], [1 + 1 * k, 1 + 5.5 * k]], rgb('#f8d818'));
        buf.disc(1 + 8 * k, 1 + 5.5 * k, 2.6 * k, rgb('#20308c'));
        R(6, 5, 4, 1, '#f8f8f8');
        break;
      case 'spain':
        R(0, 0, 16, 3, '#c81818');
        R(0, 3, 16, 5, '#f8c818');
        R(0, 8, 16, 3, '#c81818');
        R(4, 4, 2, 3, '#a83010');
        break;
      case 'thailand':
        R(0, 0, 16, 2, '#d01818');
        R(0, 2, 16, 2, '#f8f8f8');
        R(0, 4, 16, 3, '#20308c');
        R(0, 7, 16, 2, '#f8f8f8');
        R(0, 9, 16, 2, '#d01818');
        break;
    }
    // A sheen down the hoist side and a dark frame.
    for (let y = 1; y <= H; y++) buf.set(1, y, rgb(mix('#ffffff', '#808080', 0.3)));
    buf.outline(rgb('#101010'), 1);
    return { buf, ax: 0, ay: 0 };
  });
}

function starPts(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

// --- The map's plane --------------------------------------------------------------------------

/** A jet in profile, nose toward +x (or -x), anchored at its middle. */
export function planeArt(flip: boolean): Baked {
  return bake(`plane:${flip ? 1 : 0}`, () => {
    const b = new PixBuf(34, 16);
    const white = rgb('#f8f8f8');
    const grey = rgb('#b8c0d0');
    const dark = rgb('#606878');
    // Far wing, fuselage, tail, near wing.
    b.poly([[13, 8], [19, 8], [15, 3], [12, 3]], grey);
    b.poly([[2, 7], [27, 6], [31, 7.5], [32, 9], [29, 10.5], [3, 10.5], [1, 9]], white);
    b.rect(3, 9, 27, 1, grey);
    b.rect(3, 10, 26, 1, dark);
    b.poly([[1, 8], [2, 1], [5, 1], [9, 7]], white);
    b.poly([[2, 2], [4, 2], [6, 6], [3, 6]], rgb('#d82020'));
    b.poly([[12, 10], [20, 10], [15, 15], [11, 15]], grey);
    b.poly([[12, 10], [18, 10], [14, 14], [11, 14]], white);
    // Windows and a cheat line.
    for (let x = 8; x < 26; x += 2) b.set(x, 8, rgb('#3858a8'));
    b.rect(5, 9, 23, 1, rgb('#d82020'));
    b.rect(27, 7, 3, 2, rgb('#203060'));
    b.outline(rgb('#101828'), 1);
    if (!flip) return { buf: b, ax: 17, ay: 8 };
    const f = new PixBuf(b.w, b.h);
    f.blit(b, 0, 0, true);
    return { buf: f, ax: 16, ay: 8 };
  });
}

// --- HUD pieces ------------------------------------------------------------------------------

const KO_ROWS = [
  'XXX..XXX.XXXXXXX..',
  'XXX.XXX.XXX...XXX.',
  'XXXXXX..XXX...XXX.',
  'XXXXX...XXX...XXX.',
  'XXXXXX..XXX...XXX.',
  'XXX.XXX.XXX...XXX.',
  'XXX..XXX.XXXXXXX..'
];

/** The KO emblem between the bars, `lit` in red (it flashes when a fighter is near the end). */
export function koEmblem(lit: boolean): Baked {
  return bake(`ko:${lit ? 1 : 0}`, () => {
    const W = 30;
    const H = 17;
    const b = new PixBuf(W, H);
    // A bevelled plate.
    b.rect(0, 0, W, H, rgb('#000000'));
    b.rect(1, 1, W - 2, H - 2, rgb('#e8d8a8'));
    b.rect(2, 2, W - 3, H - 3, rgb('#806038'));
    b.rect(2, 2, W - 4, H - 4, lit ? rgb('#d01818') : rgb('#401818'));
    b.rect(2, 2, W - 4, 2, lit ? rgb('#f86848') : rgb('#602828'));
    const ox = 6;
    const oy = 5;
    KO_ROWS.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'X') continue;
        b.set(ox + x, oy + y, y < 2 ? rgb('#ffffff') : y < 5 ? rgb(lit ? '#f8f0c0' : '#f8d040') : rgb(lit ? '#f8c060' : '#d89018'));
        b.set(ox + x + 1, oy + y + 1, b.get(ox + x + 1, oy + y + 1) === 0 ? 0 : rgb('#280000'));
      }
    });
    KO_ROWS.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') b.set(ox + x, oy + y, y < 2 ? rgb('#ffffff') : y < 5 ? rgb(lit ? '#ffffff' : '#f8e070') : rgb(lit ? '#f8d080' : '#e0a020'));
    });
    return { buf: b, ax: Math.floor(W / 2), ay: 0 };
  });
}

/** The round-win medal: a gold V on a disc. */
export function winMedal(): Baked {
  return bake('medal', () => {
    const b = new PixBuf(13, 13);
    b.disc(6.5, 6.5, 6.2, rgb('#603000'));
    b.disc(6.5, 6.5, 5.4, rgb('#e0a018'));
    b.disc(6, 6, 4.4, rgb('#f8d040'));
    b.disc(5.2, 5, 2, rgb('#fff8c0'));
    const v = rgb('#c02010');
    for (let i = 0; i < 5; i++) {
      b.rect(3 + i * 0.5, 3 + i, 2, 1, v);
      b.rect(8 - i * 0.5, 3 + i, 2, 1, v);
    }
    b.rect(5, 8, 3, 1, v);
    return { buf: b, ax: 0, ay: 0 };
  });
}
