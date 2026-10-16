/**
 * PRIME TIME's picture: a neon-trimmed television studio drawn with canvas
 * primitives, the way every non-framebuffer cabinet on the floor draws. The
 * floor, the walls and the lighting are baked once per studio into a static
 * layer (`paintStudio`); everything that moves is drawn per frame by the
 * functions below, each reading the run and nothing else, so `game.ts` only
 * decides the order.
 *
 * Prizes are emoji, the one place the cabinet uses text as a sprite: a
 * banknote, a cassette and a car read at twenty pixels where a primitive
 * would need a label.
 */
import type { Effects } from '../engine';
import { hash01 } from '../engine';
import {
  ARENA,
  CANVAS_H,
  CANVAS_W,
  DOOR_W,
  SIDES,
  WALL,
  dirIndex,
  doorCentre,
  doorRect,
  inwardOf,
  type Pt
} from './arena';
import { SCARFACE_PHASE, bossStage } from './bosses';
import { ORB_CHARGE, type Enemy } from './enemies';
import {
  COBRA_HEAD,
  COBRA_SEGMENT,
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

/** The contestant's skin, for the hands on the gun. */
const SKIN_TONE = '#f1c27d';
import type { Item, ItemId } from './items';
import { CIRCUITS, DOME_SECONDS, neighbour, type RoomDef } from './rooms';
import { MAP_SECONDS, RESPAWN_INVULN, type RunState, type Shot } from './run';
import type { EnemyKind } from './enemies';
import type { Stick } from './input';
import { STICK_RANGE } from './input';

export interface StudioTheme {
  floorA: string;
  floorB: string;
  trim: string;
  trim2: string;
  wall: string;
}

/** One palette per studio, and a golden one for the prize room. */
export const THEMES: readonly StudioTheme[] = [
  { floorA: '#1c1c36', floorB: '#121226', trim: '#ec4899', trim2: '#22d3ee', wall: '#232340' },
  { floorA: '#241a2e', floorB: '#17111f', trim: '#f59e0b', trim2: '#a855f7', wall: '#2c2040' },
  { floorA: '#2a171d', floorB: '#1a0f13', trim: '#ef4444', trim2: '#2dd4bf', wall: '#3a1a26' }
];
export const DOME_THEME: StudioTheme = { floorA: '#2a2210', floorB: '#1f1a0c', trim: '#facc15', trim2: '#fb7185', wall: '#4a3a12' };

export const ITEM_GLYPH: Record<ItemId, string> = {
  cash: '💵',
  toaster: '🍞',
  vcr: '📼',
  car: '🚗',
  key: '🔑',
  spread: '🔱',
  grenade: '🧨',
  rocket: '🚀',
  shield: '🛡️',
  boots: '👟',
  bomb: '💣',
  life: '❤️'
};

export const ENEMY_COLOR: Record<Enemy['kind'], string> = {
  grunt: '#5b7cfa',
  orb: '#22d3ee',
  mine: '#64748b',
  shrapnel: '#ef4444',
  tank: '#84cc16',
  snake: '#d946ef',
  mutoid: '#94a3b8',
  scarface: '#fbbf24',
  cobra: '#22c55e'
};

/** The proper names on the boss bar; names, so the same in every locale. */
export const BOSS_NAME: Record<'mutoid' | 'scarface' | 'cobra', string> = {
  mutoid: 'MUTOID MAN',
  scarface: 'SCARFACE',
  cobra: 'COBRA DEATH'
};

const TILE = 48;

/** The baked studio: floor tiles, spotlight pools, walls and their neon trim. */
export function paintStudio(ctx: CanvasRenderingContext2D, theme: StudioTheme): void {
  ctx.fillStyle = '#06060b';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Floor tiles.
  for (let y = 0; y < ARENA.h; y += TILE) {
    for (let x = 0; x < ARENA.w; x += TILE) {
      const even = ((x / TILE + y / TILE) & 1) === 0;
      ctx.fillStyle = even ? theme.floorA : theme.floorB;
      ctx.fillRect(ARENA.x + x, ARENA.y + y, Math.min(TILE, ARENA.w - x), Math.min(TILE, ARENA.h - y));
    }
  }
  // Tile seams.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let x = TILE; x < ARENA.w; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(ARENA.x + x + 0.5, ARENA.y);
    ctx.lineTo(ARENA.x + x + 0.5, ARENA.y + ARENA.h);
    ctx.stroke();
  }
  for (let y = TILE; y < ARENA.h; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(ARENA.x, ARENA.y + y + 0.5);
    ctx.lineTo(ARENA.x + ARENA.w, ARENA.y + y + 0.5);
    ctx.stroke();
  }
  // Studio lighting: a warm pool in the middle, coloured pools in the corners.
  const centre = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 40, CANVAS_W / 2, CANVAS_H / 2, 360);
  centre.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  centre.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = centre;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  const corners: [number, number, string][] = [
    [ARENA.x, ARENA.y, theme.trim],
    [ARENA.x + ARENA.w, ARENA.y, theme.trim2],
    [ARENA.x, ARENA.y + ARENA.h, theme.trim2],
    [ARENA.x + ARENA.w, ARENA.y + ARENA.h, theme.trim]
  ];
  for (const [cx, cy, colour] of corners) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
    g.addColorStop(0, `${colour}33`);
    g.addColorStop(1, `${colour}00`);
    ctx.fillStyle = g;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  // Floor markings: a chevron on the floor pointing at each door, the show's
  // logo ring in the middle, scuffs where the crowds have walked.
  for (const side of SIDES) {
    const c = doorCentre(side);
    const inward = inwardOf(side);
    for (let i = 0; i < 2; i++) {
      const px = c.x + inward.x * (60 + i * 22);
      const py = c.y + inward.y * (60 + i * 22);
      ctx.strokeStyle = `${theme.trim}${i === 0 ? '55' : '33'}`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (inward.x === 0) {
        ctx.moveTo(px - 14, py + inward.y * 8);
        ctx.lineTo(px, py - inward.y * 6);
        ctx.lineTo(px + 14, py + inward.y * 8);
      } else {
        ctx.moveTo(px + inward.x * 8, py - 14);
        ctx.lineTo(px - inward.x * 6, py);
        ctx.lineTo(px + inward.x * 8, py + 14);
      }
      ctx.stroke();
    }
  }
  ctx.strokeStyle = `${theme.trim}30`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `${theme.trim2}22`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 84, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${theme.trim}30`;
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', CANVAS_W / 2, CANVAS_H / 2 + 2);
  for (let i = 0; i < 40; i++) {
    const sx = ARENA.x + 20 + hash01(i, 1) * (ARENA.w - 40);
    const sy = ARENA.y + 20 + hash01(i, 2) * (ARENA.h - 40);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + hash01(i, 3) * 0.12})`;
    ctx.fillRect(sx, sy, 6 + hash01(i, 4) * 14, 2 + hash01(i, 5) * 3);
  }
  // Walls.
  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, 0, CANVAS_W, WALL);
  ctx.fillRect(0, CANVAS_H - WALL, CANVAS_W, WALL);
  ctx.fillRect(0, 0, WALL, CANVAS_H);
  ctx.fillRect(CANVAS_W - WALL, 0, WALL, CANVAS_H);
  // Caution hatching on the walls' outer half.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_W, CANVAS_H);
  ctx.rect(ARENA.x - 6, ARENA.y - 6, ARENA.w + 12, ARENA.h + 12);
  ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 4;
  for (let d = -CANVAS_H; d < CANVAS_W + CANVAS_H; d += 16) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + CANVAS_H, CANVAS_H);
    ctx.stroke();
  }
  ctx.restore();
  // Neon trim along the inner edge of the walls, cut at the doors.
  ctx.save();
  ctx.beginPath();
  for (const side of SIDES) {
    const r = doorRect(side);
    ctx.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  }
  ctx.rect(0, 0, CANVAS_W, CANVAS_H);
  ctx.clip('evenodd');
  ctx.shadowColor = theme.trim;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = theme.trim;
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x - 1, ARENA.y - 1, ARENA.w + 2, ARENA.h + 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ARENA.x - 0.5, ARENA.y - 0.5, ARENA.w + 1, ARENA.h + 1);
  ctx.restore();
  // The door recesses.
  for (const side of SIDES) {
    const r = doorRect(side);
    ctx.fillStyle = '#050508';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

/**
 * The studio's lighting rig: two spotlights sweeping slowly from the top
 * corners, drawn additively over the floor each frame. Cheap (two gradients)
 * and the one thing on the floor that moves when nothing else does.
 */
export function drawSpotlights(ctx: CanvasRenderingContext2D, clock: number, theme: StudioTheme): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beams: [number, number, number, string][] = [
    [ARENA.x, ARENA.y, Math.PI / 4 + Math.sin(clock * 0.35) * 0.45, theme.trim],
    [ARENA.x + ARENA.w, ARENA.y, (3 * Math.PI) / 4 + Math.sin(clock * 0.28 + 2) * 0.45, theme.trim2]
  ];
  for (const [x, y, a, colour] of beams) {
    const len = 520;
    const half = 0.16;
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.addColorStop(0, `${colour}26`);
    g.addColorStop(1, `${colour}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - half) * len, y + Math.sin(a - half) * len);
    ctx.lineTo(x + Math.cos(a + half) * len, y + Math.sin(a + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Shadow under every body on the floor. */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + r * 0.7, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The doors: red warning bars while enemies pour through them, bright green
 * chevrons pointing out once the room is cleared and that door is an exit.
 */
export function drawDoors(ctx: CanvasRenderingContext2D, run: RunState, clock: number, theme: StudioTheme): void {
  for (const side of SIDES) {
    const r = doorRect(side);
    const open = run.openDoors.includes(side);
    const inward = inwardOf(side);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (open) {
      const pulse = 0.55 + 0.45 * Math.sin(clock * 6);
      ctx.strokeStyle = `rgba(74, 222, 128, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 8;
      // Three chevrons marching outward.
      for (let i = 0; i < 3; i++) {
        const t = ((clock * 1.5 + i / 3) % 1) * 18 - 9;
        const px = cx - inward.x * t;
        const py = cy - inward.y * t;
        ctx.beginPath();
        if (side === 'n' || side === 's') {
          ctx.moveTo(px - 10, py + inward.y * 5);
          ctx.lineTo(px, py - inward.y * 5);
          ctx.lineTo(px + 10, py + inward.y * 5);
        } else {
          ctx.moveTo(px + inward.x * 5, py - 10);
          ctx.lineTo(px - inward.x * 5, py);
          ctx.lineTo(px + inward.x * 5, py + 10);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      const lit = run.phase === 'room' && run.schedule.length > 0;
      const glow = lit ? 0.5 + 0.5 * Math.sin(clock * 10 + (side === 'n' ? 0 : side === 'e' ? 1 : side === 's' ? 2 : 3)) : 0.25;
      ctx.fillStyle = lit ? `rgba(248, 113, 113, ${0.25 + glow * 0.5})` : `${theme.trim}55`;
      if (side === 'n' || side === 's') ctx.fillRect(r.x + 6, cy - 2, r.w - 12, 4);
      else ctx.fillRect(cx - 2, r.y + 6, 4, r.h - 12);
    }
  }
  // The ON AIR lamp, top left on the wall.
  const on = Math.floor(clock * 2) % 2 === 0;
  ctx.fillStyle = on ? '#ef4444' : '#5a1111';
  ctx.beginPath();
  ctx.arc(WALL / 2 + 2, WALL / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/**
 * The contestant: a body chosen by the aim (front for a downward aim, back for
 * an upward one, side for east and west), legs that scissor with the walk, and
 * a two-handed gun turned to the aim with a muzzle flash at its end. The gun
 * passes behind him when he fires upward; a blink while invulnerable, a
 * bubble while shielded.
 */
export function drawPlayer(ctx: CanvasRenderingContext2D, run: RunState, clock: number, flashT: number): void {
  if (!run.alive) return;
  const p = run.player;
  if (p.invuln > 0 && Math.floor(clock * 14) % 2 === 0 && p.invuln < RESPAWN_INVULN) ctx.globalAlpha = 0.4;
  shadow(ctx, p.x, p.y + 6, p.r);
  // Legs, scissoring while moving: dark trousers, boots.
  const step = p.moving ? Math.sin(clock * 16) * 4 : 0;
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(p.x - 8, p.y + 9 + step, 8, 10);
  ctx.fillRect(p.x, p.y + 9 - step, 8, 10);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(p.x - 6, p.y + 9 + step, 4, 6);
  ctx.fillRect(p.x + 2, p.y + 9 - step, 4, 6);
  ctx.fillStyle = '#374151';
  ctx.fillRect(p.x - 6, p.y + 15 + step, 4, 3);
  ctx.fillRect(p.x + 2, p.y + 15 - step, 4, 3);
  const dir = dirIndex(p.aim);
  const up = dir >= 5;
  const body = dir === 0 || dir === 4 ? PLAYER_SIDE : up ? PLAYER_BACK : PLAYER_FRONT;
  const name = dir === 0 || dir === 4 ? 'player-side' : up ? 'player-back' : 'player-front';
  const gun = () => {
    const a = Math.atan2(p.aim.y, p.aim.x);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y) + (up ? 2 : 6));
    ctx.rotate(a);
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(2, -5, 24, 10);
    ctx.fillStyle = '#374151';
    ctx.fillRect(4, -3, 20, 6);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(14, -2, 12, 4);
    ctx.fillStyle = SKIN_TONE;
    ctx.fillRect(4, -5, 5, 10);
    ctx.fillRect(12, -4, 4, 8);
    if (flashT > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 12;
      const r = 4 + flashT * 40;
      ctx.fillRect(26, -r / 2, r, r);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(27, -r / 4, r / 2, r / 2);
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
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.8 * fade})`;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.15 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24 + Math.sin(clock * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
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

/** The main bitmap for an enemy kind, as the live draw and the flash and the tumble all need it. */
function kindSprite(kind: Corpse['kind'], armed: boolean, kit: number, clock: number, stage = 0): { name: string; def: SpriteDef } {
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
      return { name: `scarface${Math.floor(clock) % 2 === 0 ? 0 : 1}`, def: SCARFACE[0] };
    case 'cobra':
      return { name: 'cobra-head', def: COBRA_HEAD };
  }
}

export function drawCorpses(ctx: CanvasRenderingContext2D, corpses: readonly Corpse[], clock: number): void {
  for (const c of corpses) {
    const k = Math.min(1, c.t / CORPSE_SECONDS);
    ctx.globalAlpha = 1 - k * k;
    const { name, def } = kindSprite(c.kind, c.armed, c.kit, clock);
    drawSprite(ctx, sprite(name, def), c.x, c.y, false, c.spin * c.t * 14);
  }
  ctx.globalAlpha = 1;
}

/** The white flash of an enemy that has just been hit: its own silhouette over it. */
function drawFlash(ctx: CanvasRenderingContext2D, e: Enemy, clock: number, kit: number): void {
  const { name, def } = kindSprite(e.kind as Corpse['kind'], e.armed, kit, clock, e.boss ? bossStage(e) : 0);
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
      return { dx: 0, dy: -14, flip: false, angle: 0 };
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
  const colour = e.armed ? '#f87171' : ENEMY_COLOR.orb;
  // An armed orb about to shoot flares white: the telegraph.
  const charging = e.armed && e.timer <= ORB_CHARGE;
  const pulse = charging ? 1 : 0.5 + 0.5 * Math.sin(clock * 6 + e.jitter);
  const hover = Math.sin(clock * 4 + e.jitter) * 2;
  shadow(ctx, e.x, e.y + 10, e.r * 0.8);
  // The glow under the sphere, the one thing about it that is not a block.
  const g = ctx.createRadialGradient(e.x, e.y + hover, 2, e.x, e.y + hover, e.r + 10);
  g.addColorStop(0, `${colour}${charging ? 'aa' : '55'}`);
  g.addColorStop(1, `${colour}00`);
  ctx.fillStyle = g;
  ctx.fillRect(e.x - e.r - 10, e.y + hover - e.r - 10, e.r * 2 + 20, e.r * 2 + 20);
  const state = charging ? 'charging' : e.armed ? 'armed' : 'quiet';
  const frame = Math.floor(clock * 6 + e.jitter) % ORB_FRAMES;
  drawSprite(ctx, sprite(`orb-${state}-${frame}`, orbSprite(state, frame)), e.x, e.y + hover);
  if (pulse > 0.95) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(e.x - e.r - 2, e.y + hover - 1, 2, 2);
    ctx.fillRect(e.x + e.r, e.y + hover - 1, 2, 2);
  }
}

function drawMine(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y + 4, e.r - 2);
  drawSprite(ctx, sprite('mine', MINE), e.x, e.y, false, Math.floor(clock * 2 + e.jitter) % 2 ? Math.PI / 4 : 0);
  const rate = e.hp < e.maxHp ? 10 : 3;
  if (Math.floor(clock * rate + e.jitter) % 2 === 0) {
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.fillRect(e.x - 2, e.y - 2, 4, 4);
    ctx.shadowBlur = 0;
  }
}

function drawShrapnel(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y + 8, e.r);
  const frame = Math.floor(clock * 6 + e.jitter) % 2;
  drawSprite(ctx, sprite(`shrapnel${frame}`, SHRAPNEL[frame]), e.x, e.y - 4, e.vx < 0);
  // The spark on the fuse.
  ctx.fillStyle = Math.floor(clock * 20) % 2 === 0 ? '#fde047' : '#f97316';
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 6;
  ctx.fillRect(e.x + (e.vx < 0 ? 1 : -3), e.y - 22, 3, 3);
  ctx.shadowBlur = 0;
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
  ctx.fillRect(0, -4, 24, 8);
  ctx.fillStyle = '#365314';
  ctx.fillRect(2, -2, 20, 4);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(20, -3, 5, 6);
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

function drawMutoid(ctx: CanvasRenderingContext2D, e: Enemy, player: Pt, clock: number): void {
  shadow(ctx, e.x, e.y + 22, e.r * 1.2);
  const stage = bossStage(e);
  // Tank base: treads rolling, a steel hull.
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(e.x - 48, e.y + 14, 96, 30);
  ctx.fillStyle = '#374151';
  ctx.fillRect(e.x - 46, e.y + 16, 92, 26);
  ctx.fillStyle = '#1f2937';
  const roll = (clock * 24) % 12;
  for (let x = -44 + roll; x < 44; x += 12) ctx.fillRect(e.x + x, e.y + 17, 5, 24);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(e.x - 36, e.y + 8, 72, 10);
  // Arm cannons toward the contestant, slung under the steel shoulders.
  const a = Math.atan2(player.y - e.y, player.x - e.x);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(e.x + side * 34, e.y + 2);
    ctx.rotate(a);
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(-4, -7, 38, 14);
    ctx.fillStyle = stage ? '#7f1d1d' : '#4b5563';
    ctx.fillRect(-2, -5, 34, 10);
    ctx.fillStyle = '#111827';
    ctx.fillRect(26, -4, 10, 8);
    ctx.fillStyle = stage ? '#ef4444' : '#facc15';
    ctx.fillRect(34, -2, 3, 4);
    ctx.restore();
  }
  drawSprite(ctx, stage ? sprite('mutoid-hurt', MUTOID_HURT) : sprite('mutoid', MUTOID), e.x, e.y - 14);
  if (e.t < 1.4) return;
  if (stage) {
    // Sparks off the damaged torso.
    ctx.fillStyle = Math.floor(clock * 16) % 2 ? '#fde047' : '#f97316';
    ctx.fillRect(e.x + Math.sin(clock * 9) * 20, e.y - 18 + Math.cos(clock * 7) * 12, 4, 4);
    ctx.fillRect(e.x - 18 + Math.cos(clock * 11) * 12, e.y - 4 + Math.sin(clock * 13) * 8, 3, 3);
  }
}

function drawScarface(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  const winding = e.phase === SCARFACE_PHASE.windup;
  const shake = winding ? Math.sin(clock * 60) * 4 : 0;
  const hover = Math.sin(clock * 3 + e.jitter) * 3;
  shadow(ctx, e.x, e.y + 26, e.r);
  const frame = winding || e.phase === SCARFACE_PHASE.charge ? 1 : 0;
  drawSprite(ctx, sprite(`scarface${frame}`, SCARFACE[frame]), e.x + shake, e.y + hover, e.vx < 0);
  if (e.phase === SCARFACE_PHASE.charge) {
    // Speed lines behind the charge.
    const speed = Math.hypot(e.vx, e.vy) || 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(e.x - (e.vx / speed) * 30 - (e.vy / speed) * i * 14, e.y - (e.vy / speed) * 30 + (e.vx / speed) * i * 14);
      ctx.lineTo(e.x - (e.vx / speed) * 50 - (e.vy / speed) * i * 14, e.y - (e.vy / speed) * 50 + (e.vx / speed) * i * 14);
      ctx.stroke();
    }
  }
}

function drawCobra(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const tail = e.tail ?? [];
  const seg = sprite('cobra-seg', COBRA_SEGMENT);
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i];
    const prev = i === 0 ? e : tail[i - 1];
    drawSprite(ctx, seg, s.x, s.y, false, Math.atan2(prev.y - s.y, prev.x - s.x));
  }
  shadow(ctx, e.x, e.y + 12, e.r);
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
        drawMutoid(ctx, e, run.player, clock);
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

const SHOT_COLOR: Record<Shot['weapon'], string> = {
  machine: '#fde047',
  spread: '#fb923c',
  grenade: '#86efac',
  rocket: '#f472b6'
};

export function drawShots(ctx: CanvasRenderingContext2D, run: RunState): void {
  for (const s of run.shots) {
    const speed = Math.hypot(s.vx, s.vy) || 1;
    const ux = s.vx / speed;
    const uy = s.vy / speed;
    ctx.strokeStyle = SHOT_COLOR[s.weapon];
    ctx.lineWidth = s.weapon === 'grenade' ? 5 : s.r * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x - ux * (s.weapon === 'rocket' ? 14 : 8), s.y - uy * (s.weapon === 'rocket' ? 14 : 8));
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    if (s.weapon === 'grenade') {
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
  // Hostile shots are the most lethal thing on the floor, so they are the one
  // thing in hot orange with a dark rim: rose on the pink-walled studio read
  // as decoration.
  for (const f of run.flak) {
    const speed = Math.hypot(f.vx, f.vy) || 1;
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.5)';
    ctx.lineWidth = f.r;
    ctx.beginPath();
    ctx.moveTo(f.x - (f.vx / speed) * 12, f.y - (f.vy / speed) * 12);
    ctx.lineTo(f.x, f.y);
    ctx.stroke();
    ctx.fillStyle = '#1c0a00';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawItems(ctx: CanvasRenderingContext2D, items: readonly Item[], clock: number): void {
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const it of items) {
    // About to be taken back: blink.
    if (it.ttl < 3 && Math.floor(clock * 6) % 2 === 0) continue;
    const bob = Math.sin(clock * 4 + it.id) * 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -clock * 20;
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + 10, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(ITEM_GLYPH[it.item], it.x, it.y + bob - 1);
  }
}

/** The boss's health bar across the top wall, with its name. */
export function drawBossBar(ctx: CanvasRenderingContext2D, run: RunState): void {
  const boss = run.boss;
  if (!boss) return;
  const w = 280;
  const x = CANVAS_W / 2 - w / 2;
  const y = 4;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x - 2, y - 1, w + 4, 12);
  const frac = Math.max(0, boss.hp / boss.maxHp);
  ctx.fillStyle = frac > 0.5 ? '#ef4444' : '#f97316';
  ctx.fillRect(x, y, w * frac, 10);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 9);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BOSS_NAME[boss.kind as keyof typeof BOSS_NAME], CANVAS_W / 2, y + 5.5);
}

/** The touch sticks, where the thumbs are. */
export function drawSticks(ctx: CanvasRenderingContext2D, move: Stick | null, fire: Stick | null): void {
  for (const [stick, colour] of [
    [move, '#ffffff'],
    [fire, '#fb7185']
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

/** A room's prizes and gear as glyphs, three at most. */
export function roomGlyphs(room: RoomDef): string {
  return room.script.items
    .slice(0, 3)
    .map(i => ITEM_GLYPH[i.item])
    .join('');
}

/**
 * Over each open door, what the room beyond holds, so the choice is made
 * at the door with the map's information rather than blind.
 */
export function drawDoorContents(ctx: CanvasRenderingContext2D, run: RunState): void {
  if (run.openDoors.length === 0) return;
  const circuit = CIRCUITS[run.circuit];
  const room = circuit.rooms[run.roomKey];
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const side of run.openDoors) {
    const next = neighbour(circuit, room, side);
    if (!next) continue;
    const r = doorRect(side);
    const inward = inwardOf(side);
    const x = r.x + r.w / 2 + inward.x * 34;
    const y = r.y + r.h / 2 + inward.y * 30;
    const text = next.boss ? '💀' : roomGlyphs(next);
    if (!text) continue;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.roundRect(x - 10 * Math.max(1, text.length / 2) - 8, y - 12, 20 * Math.max(1, text.length / 2) + 16, 24, 6);
    ctx.fill();
    ctx.fillText(text, x, y + 1);
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
    ctx.fillStyle = current ? theme.trim : visited ? '#334155' : r.boss ? '#7f1d1d' : '#1e293b';
    ctx.beginPath();
    ctx.roundRect(c.x - 24, c.y - 18, 48, 36, 5);
    ctx.fill();
    ctx.strokeStyle = current ? '#fff' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = current ? 2 : 1;
    ctx.stroke();
    if (r.boss) {
      ctx.font = '18px sans-serif';
      ctx.fillText('💀', c.x, c.y + 1);
    } else if (visited && !current) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#86efac';
      ctx.fillText('✓', c.x, c.y + 1);
    } else if (!visited) {
      // What the room holds, so the long way round can be seen to be the
      // rich one: the choice the map exists to offer (`rooms.ts`).
      ctx.font = '11px sans-serif';
      ctx.fillText(roomGlyphs(r), c.x, c.y + 1);
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
  ctx.fillStyle = '#fbbf24';
  ctx.shadowColor = '#fbbf24';
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
  ctx.fillStyle = '#facc15';
  ctx.shadowColor = '#facc15';
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
