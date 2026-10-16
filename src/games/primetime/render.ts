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
import {
  ARENA,
  CANVAS_H,
  CANVAS_W,
  DOOR_W,
  SIDES,
  WALL,
  dirIndex,
  doorRect,
  inwardOf,
  type Pt
} from './arena';
import { SCARFACE_PHASE, bossStage } from './bosses';
import { ORB_CHARGE, type Enemy } from './enemies';
import type { Item, ItemId } from './items';
import { CIRCUITS, DOME_SECONDS, neighbour, type RoomDef } from './rooms';
import { MAP_SECONDS, RESPAWN_INVULN, type RunState, type Shot } from './run';
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

/** The contestant: a jumpsuit, a head, a gun on the aim, a blink while invulnerable, a bubble while shielded. */
export function drawPlayer(ctx: CanvasRenderingContext2D, run: RunState, clock: number, flashT: number): void {
  if (!run.alive) return;
  const p = run.player;
  if (p.invuln > 0 && Math.floor(clock * 14) % 2 === 0 && p.invuln < RESPAWN_INVULN) ctx.globalAlpha = 0.4;
  shadow(ctx, p.x, p.y, p.r);
  // Legs, scissoring while moving.
  const step = p.moving ? Math.sin(clock * 16) * 4 : 0;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(p.x - 6, p.y + 4 + step, 4, 7);
  ctx.fillRect(p.x + 2, p.y + 4 - step, 4, 7);
  // Jumpsuit.
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Contestant number.
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(p.x - 3, p.y + 1, 6, 3);
  // Head.
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f2a14';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, 4.2, Math.PI, Math.PI * 2);
  ctx.fill();
  // Gun along the aim.
  const a = p.aim;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x + a.x * 4, p.y + a.y * 4);
  ctx.lineTo(p.x + a.x * 18, p.y + a.y * 18);
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (flashT > 0) {
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x + a.x * 22, p.y + a.y * 22, 4 + flashT * 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  if (p.shield > 0) {
    const fade = p.shield < 2 ? 0.3 + 0.7 * Math.abs(Math.sin(clock * 10)) : 1;
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.8 * fade})`;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.15 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 19 + Math.sin(clock * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (p.boots > 0 && p.moving) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 6;
      ctx.beginPath();
      ctx.moveTo(p.x - p.facing.x * 12 - p.facing.y * o, p.y - p.facing.y * 12 + p.facing.x * o);
      ctx.lineTo(p.x - p.facing.x * 24 - p.facing.y * o, p.y - p.facing.y * 24 + p.facing.x * o);
      ctx.stroke();
    }
  }
}

function drawGrunt(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  const wob = Math.sin(clock * 12 + e.jitter) * 2;
  const step = Math.sin(clock * 14 + e.jitter) * 3;
  shadow(ctx, e.x, e.y, e.r);
  // Legs, scissoring.
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(e.x - 5, e.y + 3 + step, 4, 7);
  ctx.fillRect(e.x + 1, e.y + 3 - step, 4, 7);
  // The club, swinging over the shoulder.
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x + 6, e.y - 1);
  ctx.lineTo(e.x + 13, e.y - 10 + wob);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(e.x + 13, e.y - 10 + wob, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Torso: a hunched blue shirt, wider than tall.
  ctx.fillStyle = ENEMY_COLOR.grunt;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 1, e.r - 1, e.r - 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Arms out to the sides.
  ctx.fillStyle = '#e2c4a0';
  ctx.beginPath();
  ctx.arc(e.x - e.r + 1, e.y + 1, 2.5, 0, Math.PI * 2);
  ctx.arc(e.x + e.r - 1, e.y + 1, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Bald head with a red visor.
  ctx.fillStyle = '#e2c4a0';
  ctx.beginPath();
  ctx.arc(e.x, e.y - 5, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(e.x - 4, e.y - 6, 8, 2);
}

function drawOrb(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  const colour = e.armed ? '#f87171' : ENEMY_COLOR.orb;
  // An armed orb about to shoot flares white: the telegraph.
  const charging = e.armed && e.timer <= ORB_CHARGE;
  const pulse = charging ? 1.4 : 0.6 + 0.4 * Math.sin(clock * 6 + e.jitter);
  shadow(ctx, e.x, e.y + 6, e.r);
  ctx.shadowColor = colour;
  ctx.shadowBlur = 12 * pulse;
  const g = ctx.createRadialGradient(e.x - 3, e.y - 3, 1, e.x, e.y, e.r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(charging ? 0.75 : 0.4, colour);
  g.addColorStop(1, e.armed ? '#7f1d1d' : '#155e75');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawMine(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y, e.r - 2);
  // Spikes in a warning yellow-grey: a mine the floor hides is not a hazard,
  // it is a trap, and the first playtest round found these near-invisible.
  ctx.fillStyle = '#9ca3af';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? e.r : e.r - 4;
    ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#374151';
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const rate = e.hp < e.maxHp ? 10 : 3;
  if (Math.floor(clock * rate + e.jitter) % 2 === 0) {
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawShrapnel(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  shadow(ctx, e.x, e.y, e.r);
  const step = Math.sin(clock * 9 + e.jitter) * 3;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(e.x - 7, e.y + 6 + step, 5, 6);
  ctx.fillRect(e.x + 2, e.y + 6 - step, 5, 6);
  ctx.fillStyle = ENEMY_COLOR.shrapnel;
  ctx.beginPath();
  ctx.roundRect(e.x - e.r + 1, e.y - e.r + 1, e.r * 2 - 2, e.r * 2 - 2, 4);
  ctx.fill();
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.fillRect(e.x - e.r + 1, e.y - 2, e.r * 2 - 2, 4);
  // The fuse.
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.r + 1);
  ctx.lineTo(e.x + 3, e.y - e.r - 6);
  ctx.stroke();
  ctx.fillStyle = Math.floor(clock * 20) % 2 === 0 ? '#fde047' : '#f97316';
  ctx.beginPath();
  ctx.arc(e.x + 3, e.y - e.r - 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTank(ctx: CanvasRenderingContext2D, e: Enemy, player: Pt, clock: number): void {
  shadow(ctx, e.x, e.y, e.r);
  const w = e.r * 2;
  const h = e.r * 1.6;
  // Treads.
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(e.x - w / 2, e.y - h / 2 - 3, w, 6);
  ctx.fillRect(e.x - w / 2, e.y + h / 2 - 3, w, 6);
  ctx.fillStyle = '#4b5563';
  const roll = (clock * 30 + e.jitter) % 8;
  for (let x = -w / 2 + roll; x < w / 2; x += 8) {
    ctx.fillRect(e.x + x, e.y - h / 2 - 2, 3, 4);
    ctx.fillRect(e.x + x, e.y + h / 2 - 2, 3, 4);
  }
  // Hull and turret.
  ctx.fillStyle = ENEMY_COLOR.tank;
  ctx.fillRect(e.x - w / 2 + 2, e.y - h / 2 + 2, w - 4, h - 4);
  ctx.strokeStyle = '#365314';
  ctx.lineWidth = 2;
  ctx.strokeRect(e.x - w / 2 + 2, e.y - h / 2 + 2, w - 4, h - 4);
  const a = Math.atan2(player.y - e.y, player.x - e.x);
  ctx.strokeStyle = '#1a2e05';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6));
  ctx.stroke();
  ctx.fillStyle = '#a3e635';
  ctx.beginPath();
  ctx.arc(e.x, e.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const tail = e.tail ?? [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i];
    const rr = e.r * 0.85 - i * 0.4;
    ctx.fillStyle = i % 2 === 0 ? '#a21caf' : ENEMY_COLOR.snake;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  shadow(ctx, e.x, e.y, e.r);
  ctx.fillStyle = ENEMY_COLOR.snake;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#701a75';
  ctx.lineWidth = 2;
  ctx.stroke();
  const a = Math.atan2(e.vy, e.vx);
  ctx.fillStyle = '#fde047';
  for (const s of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a + s) * 5, e.y + Math.sin(a + s) * 5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMutoid(ctx: CanvasRenderingContext2D, e: Enemy, player: Pt, clock: number): void {
  shadow(ctx, e.x, e.y + 10, e.r);
  const stage = bossStage(e);
  // Tank base.
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(e.x - 36, e.y + 8, 72, 22);
  ctx.fillStyle = '#4b5563';
  const roll = (clock * 20) % 10;
  for (let x = -34 + roll; x < 34; x += 10) ctx.fillRect(e.x + x, e.y + 10, 4, 18);
  ctx.fillStyle = '#374151';
  ctx.fillRect(e.x - 30, e.y + 4, 60, 10);
  // Torso.
  ctx.fillStyle = stage ? '#cbd5e1' : ENEMY_COLOR.mutoid;
  ctx.beginPath();
  ctx.arc(e.x, e.y - 6, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Arm cannons toward the contestant.
  const a = Math.atan2(player.y - e.y, player.x - e.x);
  for (const s of [-0.55, 0.55]) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(a + s) * 16, e.y - 6 + Math.sin(a + s) * 16);
    ctx.lineTo(e.x + Math.cos(a + s * 0.6) * 40, e.y - 6 + Math.sin(a + s * 0.6) * 40);
    ctx.stroke();
  }
  // Face.
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.arc(e.x, e.y - 14, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stage ? '#ef4444' : '#111827';
  ctx.fillRect(e.x - 8, e.y - 18, 5, 3);
  ctx.fillRect(e.x + 3, e.y - 18, 5, 3);
  ctx.fillStyle = '#fff';
  for (let i = -3; i <= 3; i++) ctx.fillRect(e.x + i * 2.5 - 1, e.y - 9, 2, 3);
  if (e.t < 1.4) return;
  if (stage) {
    // Sparks off the damaged torso.
    ctx.fillStyle = Math.floor(clock * 16) % 2 ? '#fde047' : '#f97316';
    ctx.fillRect(e.x + Math.sin(clock * 9) * 14, e.y - 20 + Math.cos(clock * 7) * 8, 3, 3);
  }
}

function drawScarface(ctx: CanvasRenderingContext2D, e: Enemy, clock: number): void {
  const shake = e.phase === SCARFACE_PHASE.windup ? Math.sin(clock * 60) * 4 : 0;
  const x = e.x + shake;
  shadow(ctx, x, e.y + 14, e.r);
  ctx.fillStyle = e.phase === SCARFACE_PHASE.charge ? '#fde68a' : ENEMY_COLOR.scarface;
  ctx.beginPath();
  ctx.ellipse(x, e.y, e.r, e.r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 3;
  ctx.stroke();
  // The scar.
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 12, e.y - 22);
  ctx.lineTo(x + 6, e.y + 10);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 12 + i * 5, e.y - 18 + i * 8);
    ctx.lineTo(x - 6 + i * 5, e.y - 22 + i * 8);
    ctx.stroke();
  }
  // Eyes and a grin, wide in the wind-up.
  const open = e.phase === SCARFACE_PHASE.windup ? 6 : 4;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x - 10, e.y - 8, 6, open, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 10, e.y - 8, 6, open, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(x - 10 + Math.sign(e.vx) * 2, e.y - 8, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 10 + Math.sign(e.vx) * 2, e.y - 8, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - 12, e.y + 10, 24, 6);
  ctx.fillStyle = '#fff';
  for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 4.5 - 1.5, e.y + 10, 3, 3);
}

function drawCobra(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const tail = e.tail ?? [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i];
    const rr = e.r * 0.72 - i * 0.5;
    ctx.fillStyle = i % 2 === 0 ? '#15803d' : ENEMY_COLOR.cobra;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
  shadow(ctx, e.x, e.y + 8, e.r);
  const a = Math.atan2(e.vy, e.vx);
  // Hood.
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.r * 1.35, e.r, a + Math.PI / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ENEMY_COLOR.cobra;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  for (const s of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a + s) * 9, e.y + Math.sin(a + s) * 9, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tongue.
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8);
  ctx.lineTo(e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10));
  ctx.stroke();
}

export function drawEnemies(ctx: CanvasRenderingContext2D, run: RunState, clock: number): void {
  // Mines first, so the crowd walks over them; bosses last, over everything.
  const order = (e: Enemy) => (e.kind === 'mine' ? 0 : e.boss ? 2 : 1);
  const sorted = [...run.enemies].sort((a, b) => order(a) - order(b) || a.y - b.y);
  for (const e of sorted) {
    switch (e.kind) {
      case 'grunt':
        drawGrunt(ctx, e, clock);
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
