/**
 * PRIME TIME's picture: Smash TV's television studio as the arcade drew it,
 * a charcoal floor inside thick riveted steel walls, a channel of grating
 * running in from each door, an octagon emblem with red chevrons in the
 * middle, and every figure on it a bitmap from `sprites.ts`. The floor and
 * the walls are baked once per studio into a static layer (`paintStudio`);
 * everything that moves is drawn per frame by the functions below, each
 * reading the run and nothing else, so `game.ts` only decides the order.
 *
 * Three studios wear three liveries after the arcade's three circuits: grey
 * steel over charcoal, then red caution walls with chasing bulbs over deep
 * blue, then lavender steel over slate with a red-washed centre; the prize
 * room is gold. The HUD stays in the page's DOM (the cabinet convention),
 * styled there as the arcade's blue LED counters.
 */
import type { Effects } from '../engine';
import { hash01 } from '../engine';
import { ARENA, CANVAS_H, CANVAS_W, DOOR_W, SIDES, WALL, dirIndex, doorCentre, doorRect, inwardOf, type Pt } from './arena';
import { SCARFACE_PHASE, bossStage } from './bosses';
import { ORB_CHARGE, type Enemy } from './enemies';
import {
  COBRA_HEAD,
  COBRA_SEGMENT,
  ITEM_SPRITES,
  MINE,
  MUTOID,
  MUTOID_HURT,
  ORB_FRAMES,
  PLAYER_BACK,
  PLAYER_DOWN,
  PLAYER_FRONT,
  PLAYER_SIDE,
  SCARFACE,
  SHRAPNEL,
  SKULL,
  SNAKE_HEAD,
  SNAKE_SEGMENT,
  TANK,
  drawSprite,
  flashDef,
  gruntSprite,
  orbSprite,
  sprite,
  type SpriteDef
} from './sprites';
import { DEATH_SECONDS } from './run';
import type { Item, ItemId } from './items';
import { CIRCUITS, DOME_SECONDS, neighbour, type RoomDef } from './rooms';
import { MAP_SECONDS, RESPAWN_INVULN, type RunState } from './run';
import type { EnemyKind } from './enemies';
import type { Stick } from './input';
import { STICK_RANGE } from './input';

/** The contestant's skin, for the hands on the gun. */
const SKIN_TONE = '#f1b98a';

export interface StudioTheme {
  /** The floor, its faint panel seams, and the octagon emblem's plate. */
  floor: string;
  floorLine: string;
  emblem: string;
  /** The door channels' grating and its rails. */
  grate: string;
  grateRail: string;
  /** The wall band, its bright outer rim and its dark inner lip. */
  wall: string;
  wallLight: string;
  wallDark: string;
  /** The lamps on the wall and how they behave. */
  lamp: string;
  lampStyle: 'leds' | 'bulbs' | 'strip';
  /** The red of the emblem's chevrons and the wall's tick marks. */
  accent: string;
  /** Text accents: the banners and the map title, and a second for the host. */
  trim: string;
  trim2: string;
}

/** One livery per studio, and a golden one for the prize room. */
export const THEMES: readonly StudioTheme[] = [
  {
    floor: '#2c2c30',
    floorLine: 'rgba(255, 255, 255, 0.05)',
    emblem: '#3a3a40',
    grate: '#222226',
    grateRail: '#5c5c66',
    wall: '#8e8e98',
    wallLight: '#c6c6ce',
    wallDark: '#4a4a54',
    lamp: '#ef4444',
    lampStyle: 'leds',
    accent: '#c0281c',
    trim: '#3fa9ff',
    trim2: '#ff4fd8'
  },
  {
    floor: '#1c1a4e',
    floorLine: 'rgba(255, 255, 255, 0.07)',
    emblem: '#2a2860',
    grate: '#15133a',
    grateRail: '#4a4890',
    wall: '#b4261a',
    wallLight: '#e65a40',
    wallDark: '#5a1008',
    lamp: '#ffd34a',
    lampStyle: 'bulbs',
    accent: '#e03030',
    trim: '#ffd34a',
    trim2: '#3fa9ff'
  },
  {
    floor: '#262a30',
    floorLine: 'rgba(120, 200, 200, 0.09)',
    emblem: '#5a2a30',
    grate: '#1a2a2a',
    grateRail: '#3a6a6a',
    wall: '#8a8ad8',
    wallLight: '#c0c0ff',
    wallDark: '#3a3a90',
    lamp: '#4ade80',
    lampStyle: 'strip',
    accent: '#c0281c',
    trim: '#c0c0ff',
    trim2: '#4ade80'
  }
];
export const DOME_THEME: StudioTheme = {
  floor: '#2a2410',
  floorLine: 'rgba(255, 220, 100, 0.09)',
  emblem: '#4a3c10',
  grate: '#1e1a0a',
  grateRail: '#8a7020',
  wall: '#b8860b',
  wallLight: '#f0c040',
  wallDark: '#5a4208',
  lamp: '#ffffff',
  lampStyle: 'bulbs',
  accent: '#e03030',
  trim: '#f0c040',
  trim2: '#ffffff'
};

/** The colour each kind's particles burst in: a clubber bleeds, steel sparks grey. */
export const ENEMY_COLOR: Record<Enemy['kind'], string> = {
  grunt: '#d9342b',
  orb: '#8c80b0',
  mine: '#9a9aa4',
  shrapnel: '#9a9aa4',
  tank: '#9a9aa4',
  snake: '#38bdf8',
  mutoid: '#2fa84a',
  scarface: '#b8b830',
  cobra: '#c0281c'
};

/** The proper names on the boss bar; names, so the same in every locale. */
export const BOSS_NAME: Record<'mutoid' | 'scarface' | 'cobra', string> = {
  mutoid: 'MUTOID MAN',
  scarface: 'SCARFACE',
  cobra: 'COBRA DEATH'
};

/** Floor panels are large and faint; the arcade's floor is nearly flat. */
const PANEL = 96;
/** How far each door's channel of grating runs onto the floor. */
const CHANNEL_LEN: Record<(typeof SIDES)[number], number> = { n: 66, s: 66, e: 150, w: 150 };
const CHANNEL_W = DOOR_W - 14;

/** A channel of slatted grating from a door onto the floor, as the arcade's doors ran into the arena. */
function paintChannel(ctx: CanvasRenderingContext2D, theme: StudioTheme, side: (typeof SIDES)[number], fromWall: number, len: number): void {
  const c = doorCentre(side);
  const inward = inwardOf(side);
  const vertical = inward.x === 0;
  // Start `fromWall` in from the wall's outer edge (negative reaches into the gap).
  const sx = c.x + inward.x * (fromWall - WALL);
  const sy = c.y + inward.y * (fromWall - WALL);
  const x0 = vertical ? sx - CHANNEL_W / 2 : Math.min(sx, sx + inward.x * len);
  const y0 = vertical ? Math.min(sy, sy + inward.y * len) : sy - CHANNEL_W / 2;
  const w = vertical ? CHANNEL_W : len;
  const h = vertical ? len : CHANNEL_W;
  ctx.fillStyle = theme.grate;
  ctx.fillRect(x0, y0, w, h);
  // Slats across the direction of travel.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  if (vertical) for (let y = y0 + 3; y < y0 + h; y += 6) ctx.fillRect(x0 + 4, y, w - 8, 2);
  else for (let x = x0 + 3; x < x0 + w; x += 6) ctx.fillRect(x, y0 + 4, 2, h - 8);
  // Rails along both long edges, with a lit inner lip.
  ctx.fillStyle = theme.grateRail;
  if (vertical) {
    ctx.fillRect(x0, y0, 3, h);
    ctx.fillRect(x0 + w - 3, y0, 3, h);
  } else {
    ctx.fillRect(x0, y0, w, 3);
    ctx.fillRect(x0, y0 + h - 3, w, 3);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  if (vertical) ctx.fillRect(x0, inward.y > 0 ? y0 + h - 2 : y0, w, 2);
  else ctx.fillRect(inward.x > 0 ? x0 + w - 2 : x0, y0, 2, h);
}

/** The octagon emblem in the middle of the floor, with the red chevrons pointing in from its four sides. */
function paintEmblem(ctx: CanvasRenderingContext2D, theme: StudioTheme): void {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const octagon = (r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  octagon(62);
  ctx.fillStyle = theme.emblem;
  ctx.fill();
  ctx.strokeStyle = theme.grateRail;
  ctx.lineWidth = 3;
  ctx.stroke();
  octagon(54);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = theme.accent;
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0]
  ]) {
    const bx = cx + dx * 46;
    const by = cy + dy * 46;
    const ax = cx + dx * 22;
    const ay = cy + dy * 22;
    ctx.beginPath();
    ctx.moveTo(bx - dy * 13, by - dx * 13);
    ctx.lineTo(bx + dy * 13, by + dx * 13);
    ctx.lineTo(ax, ay);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
}

/** The steel walls: the band, a bright outer rim, a dark inner lip, panel seams, rivets and red tick marks. */
function paintWalls(ctx: CanvasRenderingContext2D, theme: StudioTheme): void {
  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, 0, CANVAS_W, WALL);
  ctx.fillRect(0, CANVAS_H - WALL, CANVAS_W, WALL);
  ctx.fillRect(0, 0, WALL, CANVAS_H);
  ctx.fillRect(CANVAS_W - WALL, 0, WALL, CANVAS_H);
  ctx.fillStyle = theme.wallLight;
  ctx.fillRect(0, 0, CANVAS_W, 3);
  ctx.fillRect(0, CANVAS_H - 3, CANVAS_W, 3);
  ctx.fillRect(0, 0, 3, CANVAS_H);
  ctx.fillRect(CANVAS_W - 3, 0, 3, CANVAS_H);
  ctx.fillStyle = theme.wallDark;
  ctx.fillRect(ARENA.x - 3, ARENA.y - 3, ARENA.w + 6, 3);
  ctx.fillRect(ARENA.x - 3, ARENA.y + ARENA.h, ARENA.w + 6, 3);
  ctx.fillRect(ARENA.x - 3, ARENA.y - 3, 3, ARENA.h + 6);
  ctx.fillRect(ARENA.x + ARENA.w, ARENA.y - 3, 3, ARENA.h + 6);
  // Panel seams and rivets.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let x = 60; x < CANVAS_W; x += 60) {
    ctx.fillRect(x, 3, 1, WALL - 6);
    ctx.fillRect(x, CANVAS_H - WALL + 3, 1, WALL - 6);
  }
  for (let y = 60; y < CANVAS_H; y += 60) {
    ctx.fillRect(3, y, WALL - 6, 1);
    ctx.fillRect(CANVAS_W - WALL + 3, y, WALL - 6, 1);
  }
  for (let x = 30; x < CANVAS_W; x += 60) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - 1, 6, 2, 2);
    ctx.fillRect(x - 1, CANVAS_H - 8, 2, 2);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x + 12, 10, 6, 1);
    ctx.fillRect(x + 12, CANVAS_H - 11, 6, 1);
  }
  for (let y = 30; y < CANVAS_H; y += 60) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(6, y - 1, 2, 2);
    ctx.fillRect(CANVAS_W - 8, y - 1, 2, 2);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(10, y + 12, 1, 6);
    ctx.fillRect(CANVAS_W - 11, y + 12, 1, 6);
  }
}

/** The baked studio: floor, grating channels, emblem, walls and the door gaps. */
export function paintStudio(ctx: CanvasRenderingContext2D, theme: StudioTheme): void {
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Grain, then faint large panels, then the scuffs of a thousand clubbers.
  for (let i = 0; i < 900; i++) {
    const sx = ARENA.x + hash01(i, 11) * ARENA.w;
    const sy = ARENA.y + hash01(i, 12) * ARENA.h;
    ctx.fillStyle = hash01(i, 13) < 0.5 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.fillStyle = theme.floorLine;
  for (let x = ARENA.x + PANEL; x < ARENA.x + ARENA.w; x += PANEL) ctx.fillRect(x, ARENA.y, 1, ARENA.h);
  for (let y = ARENA.y + PANEL; y < ARENA.y + ARENA.h; y += PANEL) ctx.fillRect(ARENA.x, y, ARENA.w, 1);
  for (let i = 0; i < 28; i++) {
    const sx = ARENA.x + 30 + hash01(i, 1) * (ARENA.w - 60);
    const sy = ARENA.y + 30 + hash01(i, 2) * (ARENA.h - 60);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.1 + hash01(i, 3) * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 8 + hash01(i, 4) * 22, 3 + hash01(i, 5) * 6, hash01(i, 6) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Six vent grilles on the floor between the channels.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (const [fx, fy] of [
    [0.3, 0.28],
    [0.7, 0.28],
    [0.3, 0.72],
    [0.7, 0.72],
    [0.12, 0.5],
    [0.88, 0.5]
  ]) {
    const vx = Math.round(ARENA.x + fx * ARENA.w);
    const vy = Math.round(ARENA.y + fy * ARENA.h);
    for (let k = -1; k <= 1; k++) ctx.fillRect(vx + k * 4 - 1, vy - 6, 2, 12);
  }
  for (const side of SIDES) paintChannel(ctx, theme, side, 0, CHANNEL_LEN[side] + WALL);
  paintEmblem(ctx, theme);
  paintWalls(ctx, theme);
  // The door gaps: the channel runs out through the wall, under a dark lintel.
  for (const side of SIDES) {
    const r = doorRect(side);
    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    paintChannel(ctx, theme, side, 2, WALL - 1);
  }
}

/** Where the lamps sit along each wall, skipping the door gaps. */
function lampSpots(): { x: number; y: number; i: number }[] {
  const spots: { x: number; y: number; i: number }[] = [];
  let i = 0;
  const gapN = doorRect('n');
  const gapW = doorRect('w');
  for (let x = 45; x < CANVAS_W - 20; x += 30) {
    if (x > gapN.x - 6 && x < gapN.x + gapN.w + 6) continue;
    spots.push({ x, y: WALL / 2 + 2, i: i++ });
    spots.push({ x, y: CANVAS_H - WALL / 2 - 2, i: i++ });
  }
  for (let y = 45; y < CANVAS_H - 20; y += 30) {
    if (y > gapW.y - 6 && y < gapW.y + gapW.h + 6) continue;
    spots.push({ x: WALL / 2 - 2, y, i: i++ });
    spots.push({ x: CANVAS_W - WALL / 2 + 2, y, i: i++ });
  }
  return spots;
}
const LAMPS = lampSpots();

/**
 * The lamps on the walls: the one thing on the studio that moves when
 * nothing else does. Studio 1's steel carries small status LEDs that blink
 * on their own clocks; studio 2's red caution walls chase yellow bulbs
 * round the room like the arcade's; studio 3's strip pulses.
 */
export function drawWallLamps(ctx: CanvasRenderingContext2D, clock: number, theme: StudioTheme): void {
  if (theme.lampStyle === 'leds') {
    for (const s of LAMPS) {
      if (s.i % 3 !== 0) continue;
      const on = Math.floor(clock * (1 + (s.i % 4) * 0.5) + s.i) % 2 === 0;
      ctx.fillStyle = on ? (s.i % 2 ? theme.lamp : '#4ade80') : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    return;
  }
  if (theme.lampStyle === 'bulbs') {
    const step = Math.floor(clock * 6) % 3;
    for (const s of LAMPS) {
      const lit = s.i % 3 === step;
      ctx.fillStyle = lit ? theme.lamp : 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      if (lit) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(s.x - 1, s.y - 1, 1, 1);
      }
    }
    return;
  }
  const pulse = 0.35 + 0.35 * Math.sin(clock * 2.5);
  ctx.fillStyle = `rgba(74, 222, 128, ${pulse})`;
  for (const s of LAMPS) if (s.i % 2 === 0) ctx.fillRect(s.x - 6, s.y, 12, 1);
}

/** Shadow under every body on the floor. */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + r * 0.7, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The doors: a red bar across the gap while the room is still sending
 * enemies through it, and yellow arrows chasing out through an exit once
 * the room is cleared, as the arcade's exits lit.
 */
export function drawDoors(ctx: CanvasRenderingContext2D, run: RunState, clock: number, theme: StudioTheme): void {
  for (const side of SIDES) {
    const r = doorRect(side);
    const open = run.openDoors.includes(side);
    const inward = inwardOf(side);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (open) {
      const lit = Math.floor(clock * 4) % 2 === 0;
      ctx.fillStyle = lit ? '#ffd34a' : '#ffffff';
      // Three chevrons marching outward along the channel and through the gap.
      for (let i = 0; i < 3; i++) {
        const t = ((clock * 1.4 + i / 3) % 1) * 54;
        const px = cx + inward.x * (36 - t);
        const py = cy + inward.y * (36 - t);
        ctx.beginPath();
        if (inward.x === 0) {
          ctx.moveTo(px - 12, py + inward.y * 7);
          ctx.lineTo(px, py - inward.y * 2);
          ctx.lineTo(px + 12, py + inward.y * 7);
          ctx.lineTo(px, py + inward.y * 3);
        } else {
          ctx.moveTo(px + inward.x * 7, py - 12);
          ctx.lineTo(px - inward.x * 2, py);
          ctx.lineTo(px + inward.x * 7, py + 12);
          ctx.lineTo(px + inward.x * 3, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const live = run.phase === 'room' && run.schedule.length > 0;
      if (!live) continue;
      const glow = 0.45 + 0.4 * Math.sin(clock * 8 + (side === 'n' ? 0 : side === 'e' ? 1 : side === 's' ? 2 : 3));
      ctx.fillStyle = `rgba(224, 48, 48, ${glow})`;
      if (inward.x === 0) ctx.fillRect(r.x + 4, cy + inward.y * 6 - 1, r.w - 8, 3);
      else ctx.fillRect(cx + inward.x * 6 - 1, r.y + 4, 3, r.h - 8);
    }
  }
  void theme;
}

/**
 * The contestant: a body chosen by the aim (front for a downward aim, back for
 * an upward one, side for east and west), jeans that scissor with the walk,
 * and the long grey gun turned to the aim with a muzzle flash at its end. The
 * gun passes behind him when he fires upward; a blink while invulnerable, a
 * bubble while shielded.
 */
export function drawPlayer(ctx: CanvasRenderingContext2D, run: RunState, clock: number, flashT: number): void {
  if (!run.alive) return;
  const p = run.player;
  if (p.invuln > 0 && Math.floor(clock * 14) % 2 === 0 && p.invuln < RESPAWN_INVULN) ctx.globalAlpha = 0.4;
  shadow(ctx, p.x, p.y + 6, p.r);
  // Legs, scissoring while moving: blue jeans, dark boots.
  const step = p.moving ? Math.sin(clock * 16) * 4 : 0;
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(p.x - 8, p.y + 9 + step, 8, 11);
  ctx.fillRect(p.x, p.y + 9 - step, 8, 11);
  ctx.fillStyle = '#2a4fc9';
  ctx.fillRect(p.x - 6, p.y + 9 + step, 4, 7);
  ctx.fillRect(p.x + 2, p.y + 9 - step, 4, 7);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(p.x - 6, p.y + 16 + step, 4, 3);
  ctx.fillRect(p.x + 2, p.y + 16 - step, 4, 3);
  const dir = dirIndex(p.aim);
  const up = dir >= 5;
  const side = dir === 0 || dir === 4;
  const body = side ? PLAYER_SIDE : up ? PLAYER_BACK : PLAYER_FRONT;
  const name = side ? 'player-side' : up ? 'player-back' : 'player-front';
  const gun = () => {
    const a = Math.atan2(p.aim.y, p.aim.x);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y) + (up ? 0 : side ? 1 : 5));
    ctx.rotate(a);
    // A long thin barrel, the arcade's rifle: two hands on it, a dark muzzle.
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(0, -3, 31, 6);
    ctx.fillStyle = '#55555e';
    ctx.fillRect(2, -2, 27, 4);
    ctx.fillStyle = '#9a9aa4';
    ctx.fillRect(8, -1, 20, 1);
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(28, -3, 3, 6);
    ctx.fillStyle = SKIN_TONE;
    ctx.fillRect(3, -4, 4, 8);
    ctx.fillRect(12, -3, 4, 6);
    if (flashT > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#bfefff';
      ctx.shadowBlur = 12;
      const r = 4 + flashT * 40;
      ctx.fillRect(31, -r / 2, r, r);
      ctx.fillStyle = '#bfefff';
      ctx.fillRect(32, -r / 4, r / 2, r / 2);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };
  if (up) gun();
  drawSprite(ctx, sprite(name, body), p.x, p.y - 4, p.aim.x < 0);
  if (!up) gun();
  ctx.globalAlpha = 1;
  if (p.shield > 0) {
    const fade = p.shield < 2 ? 0.3 + 0.7 * Math.abs(Math.sin(clock * 10)) : 1;
    ctx.strokeStyle = `rgba(74, 222, 128, ${0.85 * fade})`;
    ctx.fillStyle = `rgba(74, 222, 128, ${0.12 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24 + Math.sin(clock * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.boots > 0 && p.moving) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 6;
      ctx.beginPath();
      ctx.moveTo(p.x - p.facing.x * 14 - p.facing.y * o, p.y - p.facing.y * 14 + p.facing.x * o);
      ctx.lineTo(p.x - p.facing.x * 26 - p.facing.y * o, p.y - p.facing.y * 26 + p.facing.x * o);
      ctx.stroke();
    }
  }
}

/** The death: a white ring bursting out, the contestant down on the floor, flickering out. */
export function drawPlayerDeath(ctx: CanvasRenderingContext2D, run: RunState, clock: number): void {
  if (run.phase !== 'dying') return;
  const p = run.player;
  const t = run.phaseT / DEATH_SECONDS;
  if (t < 0.5) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - t * 2})`;
    ctx.lineWidth = 8 * (1 - t * 2) + 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 + t * 160, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (Math.floor(clock * 10) % 3 === 0 && t > 0.6) return;
  shadow(ctx, p.x, p.y + 8, p.r);
  drawSprite(ctx, sprite('player-down', PLAYER_DOWN), p.x, p.y + 4, p.facing.x < 0);
}

/** A body on its way out: the sprite of what died, tumbling along the blow and fading. */
export interface Corpse {
  kind: EnemyKind | 'mutoid' | 'scarface' | 'cobra';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  armed: boolean;
  kit: number;
  spin: number;
}

/** Seconds a tumbling body stays on the floor. */
export const CORPSE_SECONDS = 0.45;

/** Scarface's face for his state: the second stage shows the brain, a wind-up or charge the open mouth. */
function scarfaceFrame(e: Enemy): 'calm' | 'rage' | 'hurt' {
  if (bossStage(e)) return 'hurt';
  return e.phase === SCARFACE_PHASE.windup || e.phase === SCARFACE_PHASE.charge ? 'rage' : 'calm';
}

/** The main bitmap for an enemy kind, as the live draw and the flash and the tumble all need it. */
function kindSprite(kind: Corpse['kind'], armed: boolean, kit: number, stage = 0, face: 'calm' | 'rage' | 'hurt' = 'calm'): { name: string; def: SpriteDef } {
  switch (kind) {
    case 'grunt':
      return { name: `grunt-${kit}-0`, def: gruntSprite(kit, 0) };
    case 'orb':
      return { name: armed ? 'orb-armed-0' : 'orb-quiet-0', def: orbSprite(armed ? 'armed' : 'quiet', 0) };
    case 'mine':
      return { name: 'mine', def: MINE };
    case 'shrapnel':
      return { name: 'shrapnel0', def: SHRAPNEL[0] };
    case 'tank':
      return { name: 'tank', def: TANK };
    case 'snake':
      return { name: 'snake-head', def: SNAKE_HEAD };
    case 'mutoid':
      return stage ? { name: 'mutoid-hurt', def: MUTOID_HURT } : { name: 'mutoid', def: MUTOID };
    case 'scarface':
      return { name: `scarface-${face}`, def: SCARFACE[face] };
    case 'cobra':
      return { name: 'cobra-head', def: COBRA_HEAD };
  }
}

export function drawCorpses(ctx: CanvasRenderingContext2D, corpses: readonly Corpse[]): void {
  for (const c of corpses) {
    const k = Math.min(1, c.t / CORPSE_SECONDS);
    ctx.globalAlpha = 1 - k * k;
    const { name, def } = kindSprite(c.kind, c.armed, c.kit, 0, 'hurt');
    drawSprite(ctx, sprite(name, def), c.x, c.y, false, c.spin * c.t * 14);
  }
  ctx.globalAlpha = 1;
}

/** The white flash of an enemy that has just been hit: its own silhouette over it. */
function drawFlash(ctx: CanvasRenderingContext2D, e: Enemy, clock: number, kit: number): void {
  const { name, def } = kindSprite(e.kind as Corpse['kind'], e.armed, kit, e.boss ? bossStage(e) : 0, e.kind === 'scarface' ? scarfaceFrame(e) : 'calm');
  const at = spriteAnchor(e, clock);
  ctx.globalAlpha = 0.85;
  drawSprite(ctx, sprite(`${name}-flash`, flashDef(def)), e.x + at.dx, e.y + at.dy, at.flip, at.angle);
  ctx.globalAlpha = 1;
}

/** Where each kind's main bitmap sits relative to its body, so the flash lands on the drawing. */
function spriteAnchor(e: Enemy, clock: number): { dx: number; dy: number; flip: boolean; angle: number } {
  switch (e.kind) {
    case 'grunt':
      return { dx: 0, dy: -4, flip: e.vx < 0, angle: 0 };
    case 'orb':
      return { dx: 0, dy: Math.sin(clock * 4 + e.jitter) * 2, flip: false, angle: 0 };
    case 'shrapnel':
      return { dx: 0, dy: -4, flip: e.vx < 0, angle: 0 };
    case 'snake':
    case 'cobra':
      return { dx: 0, dy: 0, flip: false, angle: Math.atan2(e.vy, e.vx) };
    case 'mutoid':
      return { dx: 0, dy: -8, flip: false, angle: 0 };
    case 'scarface':
      return { dx: 0, dy: Math.sin(clock * 3 + e.jitter) * 3, flip: e.vx < 0, angle: 0 };
    default:
      return { dx: 0, dy: 0, flip: false, angle: 0 };
  }
}

function drawGrunt(ctx: CanvasRenderingContext2D, e: Enemy, clock: number, kit: number): void {
  shadow(ctx, e.x, e.y + 6, e.r);
  const frame = [0, 1, 2, 1][Math.floor(clock * 9 + e.jitter) % 4];
  drawSprite(ctx, sprite(`grunt-${kit}-${frame}`, gruntSprite(kit, frame)), e.x, e.y - 4, e.vx < 0);
}

function drawOrb(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  // An armed orb about to shoot flares white: the telegraph.
  const charging = e.armed && e.timer <= ORB_CHARGE;
  const hover = Math.sin(clock * 4 + e.jitter) * 2;
  shadow(ctx, e.x, e.y + 10, e.r * 0.8);
  if (charging) {
    const g = ctx.createRadialGradient(e.x, e.y + hover, 2, e.x, e.y + hover, e.r + 12);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.x - e.r - 12, e.y + hover - e.r - 12, e.r * 2 + 24, e.r * 2 + 24);
  }
  const state = charging ? 'charging' : e.armed ? 'armed' : 'quiet';
  const frame = Math.floor(clock * 6 + e.jitter) % ORB_FRAMES;
  drawSprite(ctx, sprite(`orb-${state}-${frame}`, orbSprite(state, frame)), e.x, e.y + hover);
}

function drawMine(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y + 4, e.r - 2);
  drawSprite(ctx, sprite('mine', MINE), e.x, e.y);
  // The tip lamps blink, faster once the mine has been hit.
  const rate = e.hp < e.maxHp ? 10 : 3;
  if (Math.floor(clock * rate + e.jitter) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    for (const [sx, sy] of [
      [-9, -9],
      [9, -9],
      [-9, 9],
      [9, 9]
    ])
      ctx.fillRect(e.x + sx - 1, e.y + sy - 1, 2, 2);
  }
}

function drawShrapnel(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y + 8, e.r);
  const frame = Math.floor(clock * 6 + e.jitter) % 2;
  drawSprite(ctx, sprite(`shrapnel${frame}`, SHRAPNEL[frame]), e.x, e.y - 4, e.vx < 0);
  // The core pulses.
  if (Math.floor(clock * 8) % 2 === 0) {
    ctx.fillStyle = '#ff7a6a';
    ctx.fillRect(e.x - 2, e.y - 4, 4, 4);
  }
}

function drawTank(ctx: CanvasRenderingContext2D, e: Enemy, player: Pt, clock: number): void {
  shadow(ctx, e.x, e.y + 8, e.r);
  drawSprite(ctx, sprite('tank', TANK), e.x, e.y);
  // Tread motion: a dark bar rolling along each tread.
  const roll = Math.floor((clock * 16 + e.jitter) % 9) * 4;
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(e.x - 16 + roll, e.y - 10, 2, 4);
  ctx.fillRect(e.x - 16 + roll, e.y + 6, 2, 4);
  // The turret, turned to the contestant.
  const a = Math.atan2(player.y - e.y, player.x - e.x);
  ctx.save();
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.rotate(a);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(4, -4, 22, 8);
  ctx.fillStyle = '#5a5a66';
  ctx.fillRect(6, -2, 18, 4);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(22, -3, 5, 6);
  ctx.restore();
}

function drawSnake(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const tail = e.tail ?? [];
  const seg = sprite('snake-seg', SNAKE_SEGMENT);
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i];
    const prev = i === 0 ? e : tail[i - 1];
    drawSprite(ctx, seg, s.x, s.y, false, Math.atan2(prev.y - s.y, prev.x - s.x));
  }
  shadow(ctx, e.x, e.y + 6, e.r);
  drawSprite(ctx, sprite('snake-head', SNAKE_HEAD), e.x, e.y, false, Math.atan2(e.vy, e.vx));
}

function drawMutoid(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y + 44, e.r * 1.3);
  const stage = bossStage(e);
  drawSprite(ctx, stage ? sprite('mutoid-hurt', MUTOID_HURT) : sprite('mutoid', MUTOID), e.x, e.y - 8);
  // Tread motion along the base.
  const roll = Math.floor((clock * 10) % 3) * 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  for (let x = -40 + roll; x < 40; x += 9) ctx.fillRect(e.x + x, e.y + 46, 3, 14);
  if (e.t < 1.4) return;
  if (stage) {
    // Sparks off the torn torso.
    ctx.fillStyle = Math.floor(clock * 16) % 2 ? '#fde047' : '#f97316';
    ctx.fillRect(e.x + Math.sin(clock * 9) * 20, e.y - 6 + Math.cos(clock * 7) * 12, 4, 4);
    ctx.fillRect(e.x - 18 + Math.cos(clock * 11) * 12, e.y + 8 + Math.sin(clock * 13) * 8, 3, 3);
  }
}

function drawScarface(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  const winding = e.phase === SCARFACE_PHASE.windup;
  const shake = winding ? Math.sin(clock * 60) * 4 : 0;
  const hover = Math.sin(clock * 3 + e.jitter) * 3;
  shadow(ctx, e.x, e.y + 40, e.r);
  const face = scarfaceFrame(e);
  drawSprite(ctx, sprite(`scarface-${face}`, SCARFACE[face]), e.x + shake, e.y + hover, e.vx < 0);
  if (e.phase === SCARFACE_PHASE.charge) {
    // Speed lines behind the charge.
    const speed = Math.hypot(e.vx, e.vy) || 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(e.x - (e.vx / speed) * 50 - (e.vy / speed) * i * 18, e.y - (e.vy / speed) * 50 + (e.vx / speed) * i * 18);
      ctx.lineTo(e.x - (e.vx / speed) * 74 - (e.vy / speed) * i * 18, e.y - (e.vy / speed) * 74 + (e.vx / speed) * i * 18);
      ctx.stroke();
    }
  }
}

function drawCobra(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const tail = e.tail ?? [];
  const seg = sprite('cobra-seg', COBRA_SEGMENT);
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i];
    shadow(ctx, s.x, s.y + 10, 14);
    drawSprite(ctx, seg, s.x, s.y);
  }
  shadow(ctx, e.x, e.y + 14, e.r);
  drawSprite(ctx, sprite('cobra-head', COBRA_HEAD), e.x, e.y, false, Math.atan2(e.vy, e.vx));
}

export function drawEnemies(ctx: CanvasRenderingContext2D, run: RunState, clock: number, flashes: ReadonlySet<number>): void {
  // Mines first, so the crowd walks over them; bosses last, over everything.
  const order = (e: Enemy) => (e.kind === 'mine' ? 0 : e.boss ? 2 : 1);
  const sorted = [...run.enemies].sort((a, b) => order(a) - order(b) || a.y - b.y);
  const kit = run.circuit;
  for (const e of sorted) {
    switch (e.kind) {
      case 'grunt':
        drawGrunt(ctx, e, clock, kit);
        break;
      case 'orb':
        drawOrb(ctx, e, clock);
        break;
      case 'mine':
        drawMine(ctx, e, clock);
        break;
      case 'shrapnel':
        drawShrapnel(ctx, e, clock);
        break;
      case 'tank':
        drawTank(ctx, e, run.player, clock);
        break;
      case 'snake':
        drawSnake(ctx, e);
        break;
      case 'mutoid':
        drawMutoid(ctx, e, clock);
        break;
      case 'scarface':
        drawScarface(ctx, e, clock);
        break;
      case 'cobra':
        drawCobra(ctx, e);
        break;
    }
    if (flashes.has(e.id)) drawFlash(ctx, e, clock, kit);
  }
}

/** A four-point sparkle, the arcade's white round. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string, core: string): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  ctx.fillStyle = colour;
  ctx.fillRect(cx - size, cy - 1, size * 2 + 1, 2);
  ctx.fillRect(cx - 1, cy - size, 2, size * 2 + 1);
  ctx.fillStyle = core;
  ctx.fillRect(cx - 1, cy - 1, 3, 3);
}

/**
 * The contestant's rounds are white sparkles with a fading trail, a spread
 * shot's a warmer white, a grenade a grey ball on a lob, a rocket a white
 * streak with a flame. Hostile shots are yellow balls with an orange rim,
 * the most lethal thing on the floor and the one thing drawn hot.
 */
export function drawShots(ctx: CanvasRenderingContext2D, run: RunState, clock: number): void {
  for (const s of run.shots) {
    const speed = Math.hypot(s.vx, s.vy) || 1;
    const ux = s.vx / speed;
    const uy = s.vy / speed;
    if (s.weapon === 'grenade') {
      ctx.fillStyle = '#0b0b12';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a9aa4';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - 2, s.y - 2, 2, 2);
      continue;
    }
    if (s.weapon === 'rocket') {
      ctx.fillStyle = Math.floor(clock * 30) % 2 ? '#ff7a1a' : '#ffd34a';
      ctx.fillRect(s.x - ux * 12 - 3, s.y - uy * 12 - 3, 6, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - ux * 6 - 2, s.y - uy * 6 - 2, 4, 4);
      sparkle(ctx, s.x, s.y, 5, '#ffffff', '#bfefff');
      continue;
    }
    sparkle(ctx, s.x - ux * 9, s.y - uy * 9, 2, 'rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.45)');
    sparkle(ctx, s.x, s.y, 4, '#ffffff', s.weapon === 'spread' ? '#fff1a8' : '#bfefff');
  }
  for (const f of run.flak) {
    const speed = Math.hypot(f.vx, f.vy) || 1;
    ctx.strokeStyle = 'rgba(255, 211, 74, 0.4)';
    ctx.lineWidth = f.r;
    ctx.beginPath();
    ctx.moveTo(f.x - (f.vx / speed) * 12, f.y - (f.vy / speed) * 12);
    ctx.lineTo(f.x, f.y);
    ctx.stroke();
    ctx.fillStyle = '#7a3000';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd34a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7d0';
    ctx.beginPath();
    ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.25, f.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** An item's bitmap at a scale, cached per scale. */
function itemSprite(item: ItemId, scale: number) {
  return sprite(`item-${item}-${scale}`, { ...ITEM_SPRITES[item], scale });
}

export function drawItems(ctx: CanvasRenderingContext2D, items: readonly Item[], clock: number): void {
  for (const it of items) {
    // About to be taken back: blink.
    if (it.ttl < 3 && Math.floor(clock * 6) % 2 === 0) continue;
    const bob = Math.sin(clock * 4 + it.id) * 1.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + 10, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSprite(ctx, itemSprite(it.item, 2), it.x, it.y + bob - 1);
  }
}

/** The boss's health across the top wall as the arcade's red LED bar, with his name in blue. */
export function drawBossBar(ctx: CanvasRenderingContext2D, run: RunState): void {
  const boss = run.boss;
  if (!boss) return;
  const w = 300;
  const x = CANVAS_W / 2 - w / 2;
  const y = 3;
  ctx.fillStyle = '#4a4a54';
  ctx.fillRect(x - 3, y - 1, w + 6, 14);
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(x - 1, y, w + 2, 12);
  const frac = Math.max(0, boss.hp / boss.maxHp);
  const segments = 24;
  const lit = Math.ceil(frac * segments);
  const segW = (w - 2) / segments;
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < lit ? (frac > 0.5 ? '#e03030' : '#ff7a1a') : '#2a1010';
    ctx.fillRect(x + 1 + i * segW, y + 8, segW - 1, 3);
  }
  ctx.fillStyle = '#3fa9ff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BOSS_NAME[boss.kind as keyof typeof BOSS_NAME], CANVAS_W / 2, y + 4);
}

/** The touch sticks, where the thumbs are. */
export function drawSticks(ctx: CanvasRenderingContext2D, move: Stick | null, fire: Stick | null): void {
  for (const [stick, colour] of [
    [move, '#ffffff'],
    [fire, '#ffd34a']
  ] as const) {
    if (!stick) continue;
    ctx.strokeStyle = `${colour}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.anchor.x, stick.anchor.y, STICK_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    const dx = stick.at.x - stick.anchor.x;
    const dy = stick.at.y - stick.anchor.y;
    const m = Math.hypot(dx, dy);
    const k = m > STICK_RANGE ? STICK_RANGE / m : 1;
    ctx.fillStyle = `${colour}99`;
    ctx.beginPath();
    ctx.arc(stick.anchor.x + dx * k, stick.anchor.y + dy * k, 18, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A banner across the middle: the host's lines and the studio titles. */
export function drawBanner(ctx: CanvasRenderingContext2D, text: string, life: number, colour: string, y = CANVAS_H / 2 - 40): void {
  if (life <= 0 || !text) return;
  const alpha = Math.min(1, life / 0.4);
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colour;
  ctx.shadowBlur = 18;
  ctx.fillStyle = colour;
  ctx.fillText(text, CANVAS_W / 2, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillText(text, CANVAS_W / 2, y);
  ctx.globalAlpha = 1;
}

/** A row of a room's first three prizes as small icons, or the skull for a boss room, centred on (x, y). */
function drawRoomIcons(ctx: CanvasRenderingContext2D, room: RoomDef, x: number, y: number): void {
  if (room.boss) {
    drawSprite(ctx, sprite('skull-1', { ...SKULL, scale: 1 }), x, y);
    return;
  }
  const items = room.script.items.slice(0, 3).map(i => i.item);
  const step = 12;
  items.forEach((item, i) => drawSprite(ctx, itemSprite(item, 1), x + (i - (items.length - 1) / 2) * step, y));
}

/**
 * Over each open door, what the room beyond holds, so the choice is made
 * at the door with the map's information rather than blind.
 */
export function drawDoorContents(ctx: CanvasRenderingContext2D, run: RunState): void {
  if (run.openDoors.length === 0) return;
  const circuit = CIRCUITS[run.circuit];
  const room = circuit.rooms[run.roomKey];
  for (const side of run.openDoors) {
    const next = neighbour(circuit, room, side);
    if (!next) continue;
    const r = doorRect(side);
    const inward = inwardOf(side);
    const x = r.x + r.w / 2 + inward.x * 60;
    const y = r.y + r.h / 2 + inward.y * 58;
    const n = next.boss ? 1 : Math.min(3, next.script.items.length);
    if (n === 0) continue;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - 6 * n - 5, y - 9, 12 * n + 10, 18);
    ctx.fillStyle = '#4a4a54';
    ctx.fillRect(x - 6 * n - 5, y - 9, 12 * n + 10, 1);
    ctx.fillRect(x - 6 * n - 5, y + 8, 12 * n + 10, 1);
    drawRoomIcons(ctx, next, x, y);
  }
}

export interface MapStrings {
  studio: string;
  dome: string;
}

/**
 * The map between rooms: the studio's grid, cleared rooms dimmed, the boss
 * room marked, and the contestant's token sliding from the room just left to
 * the next, eased over `MAP_SECONDS`.
 */
export function drawMap(ctx: CanvasRenderingContext2D, run: RunState, strings: MapStrings, theme: StudioTheme): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const circuit = CIRCUITS[run.circuit];
  const rooms = Object.values(circuit.rooms);
  const cw = 64;
  const ch = 54;
  const ox = CANVAS_W / 2 - (circuit.cols * cw) / 2;
  const oy = CANVAS_H / 2 - (circuit.rows * ch) / 2 + 14;
  const centreOf = (r: RoomDef): Pt => ({ x: ox + r.col * cw + cw / 2, y: oy + r.row * ch + ch / 2 });
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = theme.trim;
  ctx.shadowBlur = 14;
  ctx.fillStyle = theme.trim;
  const last = run.circuit === CIRCUITS.length - 1;
  const title =
    run.mapTarget === 'next-studio'
      ? last
        ? strings.dome
        : strings.studio.replace('{n}', String(circuit.studio + 1))
      : strings.studio.replace('{n}', String(circuit.studio));
  ctx.fillText(title, CANVAS_W / 2, oy - 40);
  ctx.shadowBlur = 0;
  // Corridors between neighbours an exit joins.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 6;
  for (const r of rooms) {
    for (const side of r.exits) {
      const inward = inwardOf(side);
      const a = centreOf(r);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - inward.x * cw, a.y - inward.y * ch);
      ctx.stroke();
    }
  }
  for (const r of rooms) {
    const c = centreOf(r);
    const visited = run.visited.includes(`${run.circuit}:${r.key}`);
    const current = r.key === run.roomKey;
    // Steel plaques, the current one lit in the studio's accent.
    ctx.fillStyle = current ? theme.trim : visited ? '#3a3a42' : r.boss ? '#5a1010' : '#1e1e26';
    ctx.fillRect(c.x - 24, c.y - 18, 48, 36);
    ctx.strokeStyle = current ? '#ffffff' : '#8e8e98';
    ctx.lineWidth = current ? 2 : 1;
    ctx.strokeRect(c.x - 23.5, c.y - 17.5, 47, 35);
    if (r.boss) {
      drawSprite(ctx, sprite('skull-2', SKULL), c.x, c.y);
    } else if (visited && !current) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - 8, c.y);
      ctx.lineTo(c.x - 2, c.y + 6);
      ctx.lineTo(c.x + 9, c.y - 7);
      ctx.stroke();
    } else if (!visited) {
      // What the room holds, so the long way round can be seen to be the
      // rich one: the choice the map exists to offer (`rooms.ts`).
      drawRoomIcons(ctx, r, c.x, c.y);
    }
  }
  // The token slides from the room just left toward where the exit leads.
  const from = circuit.rooms[run.roomKey];
  const a = centreOf(from);
  const inward = run.exitSide ? inwardOf(run.exitSide) : { x: 0, y: 0 };
  const b = { x: a.x - inward.x * cw, y: a.y - inward.y * ch };
  const t = Math.min(1, run.phaseT / MAP_SECONDS);
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const tx = a.x + (b.x - a.x) * ease;
  const ty = a.y + (b.y - a.y) * ease;
  ctx.fillStyle = '#ffd34a';
  ctx.shadowColor = '#ffd34a';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(tx, ty, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/** The prize room's clock and title. */
export function drawDomeHud(ctx: CanvasRenderingContext2D, run: RunState, strings: MapStrings): void {
  const left = Math.max(0, DOME_SECONDS - run.phaseT);
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0c040';
  ctx.shadowColor = '#f0c040';
  ctx.shadowBlur = 14;
  ctx.fillText(`${strings.dome}  ${left.toFixed(1)}`, CANVAS_W / 2, ARENA.y + 22);
  ctx.shadowBlur = 0;
}

/** The expanding ring of a respawn's shockwave. */
export function drawShock(ctx: CanvasRenderingContext2D, shock: { x: number; y: number; t: number; radius: number } | null): void {
  if (!shock || shock.t >= 0.5) return;
  const k = shock.t / 0.5;
  ctx.strokeStyle = `rgba(255, 255, 255, ${1 - k})`;
  ctx.lineWidth = 6 * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(shock.x, shock.y, shock.radius * k, 0, Math.PI * 2);
  ctx.stroke();
}

/** A pause card over the floor. */
export function drawPaused(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawBanner(ctx, text, 1, '#fff', CANVAS_H / 2);
}

export { dirIndex, DOOR_W };
export type { Effects };
