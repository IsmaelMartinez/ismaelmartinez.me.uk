/**
 * Everything STREET CHAMPION puts on screen, drawn into a 384 x 224
 * framebuffer (the CPS-1's resolution) that `game.ts` blits at a whole
 * scale: the stage, the fighters, the sparks and projectiles, the HUD, the
 * calls, and the screens between fights.
 *
 * The HUD lives in the framebuffer, as CALCIO '90's does and for the same
 * reason: the canvas is sized in device pixels at whatever whole multiple of
 * the framebuffer fits, so DOM text over it could never sit on its pixel
 * grid, and `fillText` would be the one anti-aliased thing in the frame.
 * Every word is the 5x7 bitmap font; the big calls are the same glyphs
 * blown up with a gradient and a heavy outline, the way the arcade's were.
 */
import { GLYPHS, GLYPH_H, GLYPH_W, drawText, drawTextCentred, drawTextRight, normaliseText, textWidth } from '../football/font';
import type { ArcadeState } from './arcade';
import { BONUS_TIME, FLOOR_Y, ROUNDS_TO_WIN, SCREEN_H, SCREEN_W, type FightState, type FighterState, type Projectile, type Target } from './fight';
import { Raster, drawFigure, drawPortrait, landmarks, lookFor, signatureColour, type Look } from './figure';
import { bands, checker, ctx2d, disc, hash, makeCanvas, poly, rect } from './pix';
import { poseFor, type Pose } from './poses';
import { FIGHTERS, HOMES, SELECTABLE, type CharId } from './roster';
import { drawStage, type StageArt } from './stages';

export const FB_W = SCREEN_W;
export const FB_H = SCREEN_H;

/** The words the screens need, composed server-side in the page's locale. */
export interface Labels {
  select: string;
  pressStart: string;
  continueQ: string;
  bonusStage: string;
  timeBonus: string;
  vitalBonus: string;
  perfectBonus: string;
  clearBonus: string;
  congratulations: string;
  ending: string;
  versusMode: string;
  quotes: Record<CharId, string>;
  endings: Record<CharId, string>;
}

// --- Big text -----------------------------------------------------------------------

/**
 * A call in the arcade's style: the bitmap glyphs at `scale`, each pixel row
 * graded from `top` to `bottom`, inside a two-pixel dark outline and a drop
 * shadow.
 */
export function bigText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, scale: number, top: string, bottom: string, outline = '#1a0808'): void {
  const t = normaliseText(text);
  const w = textWidth(t, scale);
  const x0 = Math.round(cx - w / 2);
  const adv = (GLYPH_W + 1) * scale;
  const draw = (dx: number, dy: number, colour: ((row: number) => string) | string) => {
    let pen = x0 + dx;
    for (const ch of t) {
      const g = GLYPHS[ch] ?? GLYPHS['?'];
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = g[row];
        if (!bits) continue;
        ctx.fillStyle = typeof colour === 'string' ? colour : colour(row);
        for (let col = 0; col < GLYPH_W; col++) if (bits & (1 << (GLYPH_W - 1 - col))) ctx.fillRect(pen + col * scale, y + dy + row * scale, scale, scale);
      }
      pen += adv;
    }
  };
  draw(3, 3, 'rgba(0,0,0,0.5)');
  for (const [dx, dy] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-2, -2],
    [2, 2],
    [-2, 2],
    [2, -2]
  ])
    draw(dx, dy, outline);
  const grad = [top, mixHex(top, bottom, 0.25), mixHex(top, bottom, 0.45), mixHex(top, bottom, 0.6), mixHex(top, bottom, 0.75), mixHex(top, bottom, 0.9), bottom];
  draw(0, 0, row => grad[row]);
  // A bright line across the top of each glyph, the shine.
  draw(0, 0, row => (row === 0 ? '#ffffff' : grad[row]));
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
}

/** Wrap prose to lines of at most `max` glyphs. */
export function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines;
}

// --- Effects the renderer owns ---------------------------------------------------------

export interface Spark {
  x: number;
  y: number;
  t: number;
  kind: 'light' | 'medium' | 'heavy' | 'block' | 'clash' | 'dust' | 'debris';
  dir: number;
  seed: number;
}

export interface Floater {
  x: number;
  y: number;
  t: number;
  text: string;
  colour: string;
}

// --- The renderer -------------------------------------------------------------------------

export interface FightView {
  fight: FightState;
  art: StageArt;
  alt: [boolean, boolean];
  /** Whole-frame clock, for blinking and loops. */
  clock: number;
  sparks: Spark[];
  floaters: Floater[];
  /** The health the red bar is draining from, per side. */
  drain: [number, number];
  shake: number;
  /** Text calls over the fight. */
  call: { text: string; t: number; kind: 'round' | 'fight' | 'ko' | 'result' | 'small' } | null;
  combo: { side: 0 | 1; hits: number; t: number } | null;
  score: number;
  hi: number;
  /** Labels the arcade shows (1P/2P or CPU). */
  sides: [string, string];
  /** The round-end bonus tally, counted up. */
  tally: { time: number; vitality: number; perfect: number; t: number } | null;
  excite: number;
  labels: Labels;
  /** The crowd's scream when the fighters are in a bonus stage. */
  bonusResult: { cleared: boolean; bonus: number; t: number } | null;
}

export interface Renderer {
  fightScene(ctx: CanvasRenderingContext2D, v: FightView): void;
  select(ctx: CanvasRenderingContext2D, s: ArcadeState, clock: number, labels: Labels): void;
  map(ctx: CanvasRenderingContext2D, s: ArcadeState, clock: number): void;
  versus(ctx: CanvasRenderingContext2D, s: ArcadeState, clock: number): void;
  quote(ctx: CanvasRenderingContext2D, s: ArcadeState, clock: number, labels: Labels): void;
  continueScreen(ctx: CanvasRenderingContext2D, s: ArcadeState, clock: number, labels: Labels, count: number): void;
  ending(ctx: CanvasRenderingContext2D, s: ArcadeState, art: StageArt, clock: number, labels: Labels): void;
  title(ctx: CanvasRenderingContext2D, clock: number, labels: Labels): void;
}

export function createRenderer(): Renderer {
  const SPR = 208;
  const ANCHOR_X = SPR / 2;
  const ANCHOR_Y = SPR - 24;
  const rasters = [new Raster(SPR, SPR), new Raster(SPR, SPR)];
  const sprites = [makeCanvas(SPR, SPR), makeCanvas(SPR, SPR)];
  const images = sprites.map(c => ctx2d(c).createImageData(SPR, SPR));
  const portraits = new Map<string, HTMLCanvasElement>();
  let worldMap: HTMLCanvasElement | null = null;

  function renderFighter(slot: number, def: FighterState['def'], look: Look, pose: Pose, flash: 'none' | 'white' | 'electric'): HTMLCanvasElement {
    const r = rasters[slot];
    r.clear();
    drawFigure(r, def, look, pose, ANCHOR_X, ANCHOR_Y);
    r.toImage(images[slot], flash);
    ctx2d(sprites[slot]).putImageData(images[slot], 0, 0);
    return sprites[slot];
  }

  /** A head-and-shoulders portrait, cached per fighter, colourway and mood. */
  function portrait(id: CharId, alt: boolean, mood: 'calm' | 'hurt' | 'shout', size: number): HTMLCanvasElement {
    const key = `${id}:${alt}:${mood}:${size}`;
    const hit = portraits.get(key);
    if (hit) return hit;
    const r = new Raster(size, size);
    drawPortrait(r, FIGHTERS[id], lookFor(id, alt), mood, size);
    const c = makeCanvas(size, size);
    const cx = ctx2d(c);
    const img = cx.createImageData(size, size);
    r.toImage(img, 'none');
    if (mood === 'hurt') {
      // Bruises and a black eye, for the continue screen.
      const d = img.data;
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(size * 0.3 + hash(i) * size * 0.4);
        const y = Math.floor(size * 0.18 + hash(i + 50) * size * 0.4);
        const p = (y * size + x) * 4;
        if (d[p + 3]) {
          d[p] = Math.min(255, d[p] * 0.8 + 40);
          d[p + 1] *= 0.55;
          d[p + 2] = Math.min(255, d[p + 2] * 0.7 + 30);
        }
      }
    }
    cx.putImageData(img, 0, 0);
    portraits.set(key, c);
    return c;
  }

  function card(ctx: CanvasRenderingContext2D, id: CharId, alt: boolean, x: number, y: number, size: number, mood: 'calm' | 'hurt' | 'shout' = 'calm', flip = false, frame = '#e8c860'): void {
    rect(ctx, x - 2, y - 2, size + 4, size + 4, frame);
    rect(ctx, x - 1, y - 1, size + 2, size + 2, '#100808');
    bands(ctx, x, y, size, size, [mixHex(signatureColour(id), '#000000', 0.45), mixHex(signatureColour(id), '#000000', 0.7), '#140c18']);
    const p = portrait(id, alt, mood, size);
    if (flip) {
      ctx.save();
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.drawImage(p, 0, 0);
      ctx.restore();
    } else ctx.drawImage(p, x, y);
  }

  // --- The fight -------------------------------------------------------------------------

  function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    const scale = Math.max(0.4, 1 - y / 160);
    const half = Math.round((w * scale) / 2);
    for (let dy = -2; dy <= 2; dy++) {
      const span = Math.round(half * Math.sqrt(1 - (dy / 3) ** 2));
      checker(ctx, x - span, FLOOR_Y + dy + 1, span * 2, 1, '#000000');
    }
  }

  function drawFighterAt(ctx: CanvasRenderingContext2D, f: FighterState, slot: number, cam: number, alt: boolean, clock: number): void {
    const pose = poseFor(f, clock);
    const look = lookFor(f.id, alt);
    const electric = f.state === 'special' && f.action?.special?.kind === 'rapid' && f.def.build === 'beast';
    const flash = f.flash > 0 && f.flash % 2 === 0 ? 'white' : electric && clock % 4 < 2 ? 'electric' : 'none';
    const sprite = renderFighter(slot, f.def, look, pose, flash);
    const sx = Math.round(f.x - cam + SCREEN_W / 2);
    const sy = Math.round(FLOOR_Y - f.y);
    // A hit fighter shudders through the hitstop.
    const jitter = f.state === 'hitstun' && f.frame < 3 ? (clock % 2 ? 1 : -1) : 0;
    const mirrored = (f.facing === -1) !== !!pose.flip;
    ctx.save();
    ctx.translate(sx + jitter, sy);
    if (mirrored) ctx.scale(-1, 1);
    // Psycho power and the sumo's torpedo glow; the yogi breathes fire.
    if (f.state === 'special' && f.action?.special) aura(ctx, f, clock);
    ctx.drawImage(sprite, -ANCHOR_X, -ANCHOR_Y);
    if (f.state === 'special' && f.action?.special?.kind === 'breath' && f.action.t >= 14 && f.action.t < 34) flame(ctx, f, clock, pose);
    ctx.restore();
    if (f.state === 'dizzy') stars(ctx, sx, sy - f.def.height - 6, clock);
  }

  function aura(ctx: CanvasRenderingContext2D, f: FighterState, clock: number): void {
    const s = f.action?.special;
    if (!s) return;
    if (f.id === 'zar' && s.kind === 'rush' && s.button === 'P' && (f.action?.t ?? 0) >= 8) {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + clock * 0.4;
        disc(ctx, Math.cos(ang) * 30, -46 + Math.sin(ang) * 22, 6 + (i % 3), i % 2 ? '#a040e8' : '#e080f8');
      }
    }
    if (s.kind === 'lariat') {
      checker(ctx, -56, -58, 112, 14, '#ffffff');
    }
    if (s.kind === 'spin' && (f.action?.t ?? 0) >= 6) {
      for (let i = 0; i < 3; i++) checker(ctx, -46 + i * 4, -52 + ((clock + i * 3) % 6), 92 - i * 8, 3, '#e8e8ff');
    }
  }

  function flame(ctx: CanvasRenderingContext2D, f: FighterState, clock: number, pose: Pose): void {
    const lm = landmarks(f.def, pose);
    const mx = lm.head[0] + 10;
    const my = lm.head[1] + 4;
    for (let i = 0; i < 9; i++) {
      const d = i * 7 + (clock % 3) * 2;
      const r = 4 + i * 1.2;
      disc(ctx, mx + d, my + Math.sin(clock + i) * 2, r, i < 2 ? '#fff8c0' : i < 5 ? '#f8b030' : '#e85020');
    }
  }

  function stars(ctx: CanvasRenderingContext2D, x: number, y: number, clock: number): void {
    for (let i = 0; i < 3; i++) {
      const a = clock * 0.12 + (i * Math.PI * 2) / 3;
      const px = Math.round(x + Math.cos(a) * 14);
      const py = Math.round(y + Math.sin(a) * 4);
      const c = i === 0 ? '#f8e040' : i === 1 ? '#ffffff' : '#f88040';
      rect(ctx, px - 1, py - 3, 2, 6, c);
      rect(ctx, px - 3, py - 1, 6, 2, c);
    }
  }

  function projectile(ctx: CanvasRenderingContext2D, p: Projectile, cam: number, clock: number): void {
    const x = Math.round(p.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - p.y);
    const dir = Math.sign(p.vx);
    const wob = Math.sin(p.t * 0.6) * 2;
    switch (p.style) {
      case 'spirit':
        for (let i = 5; i > 0; i--) disc(ctx, x - dir * i * 6, y + Math.sin(p.t * 0.5 + i) * 2, 2 + (5 - i) * 0.6, i % 2 ? '#3070e8' : '#80b8f8');
        disc(ctx, x, y, 11 + wob * 0.3, '#2050d0');
        disc(ctx, x + dir * 2, y, 8, '#60a0f8');
        disc(ctx, x + dir * 3, y - 1, 5, '#c8e8ff');
        disc(ctx, x + dir * 4, y - 1, 2.5, '#ffffff');
        break;
      case 'sonic': {
        const c = clock % 4 < 2 ? '#f8f080' : '#f8c840';
        for (let i = -8; i <= 8; i++) {
          const bend = Math.round((1 - (i / 8) ** 2) * 8) * dir;
          rect(ctx, x + bend - dir * 2, y + i * 1.6, 5, 2, c);
        }
        for (let i = -6; i <= 6; i += 3) rect(ctx, x - dir * 10, y + i * 1.6, 3, 1, '#fff8d0');
        break;
      }
      case 'fire':
        for (let i = 0; i < 6; i++) disc(ctx, x - dir * i * 5, y + hash(p.t + i) * 4 - 2, 9 - i, i < 2 ? '#fff0a0' : i < 4 ? '#f8a030' : '#d84018');
        disc(ctx, x + dir * 2, y, 6, '#fff8d8');
        break;
      case 'tiger':
      case 'tigerLow':
        disc(ctx, x, y, 11, '#e86818');
        disc(ctx, x + dir * 2, y, 8, '#f8a830');
        disc(ctx, x + dir * 3, y, 4, '#fff0b0');
        for (let i = 1; i < 4; i++) checker(ctx, x - dir * (8 + i * 6) - 3, y - 6 + i, 6, 12 - i * 2, '#f8a830');
        break;
    }
  }

  function spark(ctx: CanvasRenderingContext2D, s: Spark, cam: number): void {
    const x = Math.round(s.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - s.y);
    const t = s.t;
    if (s.kind === 'dust') {
      for (let i = 0; i < 5; i++) checker(ctx, x - 20 + i * 9 - t * (i < 2 ? 1 : -1), y - 6 - t / 2, 8, 6, '#d8c8b0');
      return;
    }
    if (s.kind === 'debris') {
      for (let i = 0; i < 8; i++) {
        const a = hash(s.seed + i) * Math.PI;
        const d = t * (2 + hash(i) * 3);
        rect(ctx, x + Math.cos(a) * d * (i % 2 ? 1 : -1), y - Math.sin(a) * d + t * t * 0.1, 3, 3, i % 3 ? '#9aa0a8' : '#3a3a40');
      }
      return;
    }
    const size = s.kind === 'heavy' || s.kind === 'clash' ? 22 : s.kind === 'medium' ? 16 : s.kind === 'block' ? 12 : 11;
    const life = 12;
    const k = t < 3 ? (t + 1) / 3 : Math.max(0, 1 - (t - 3) / (life - 3));
    const outer = s.kind === 'block' ? '#4080f8' : s.kind === 'clash' ? '#80c0f8' : '#f8a020';
    const inner = s.kind === 'block' ? '#c0e0ff' : '#fff8c0';
    const rays = s.kind === 'block' ? 6 : 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + s.seed;
      const len = size * k * (i % 2 ? 0.6 : 1);
      for (let d = 2; d < len; d += 2) rect(ctx, x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 3, 3, d < len * 0.5 ? inner : outer);
    }
    if (t < 4) disc(ctx, x, y, size * 0.35 * k + 2, '#ffffff');
  }

  function drawTarget(ctx: CanvasRenderingContext2D, tg: Target, cam: number, clock: number): void {
    const x = Math.round(tg.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - tg.y);
    const health = tg.hp / tg.maxHp;
    const flash = tg.flash > 0 && tg.flash % 2 === 0;
    if (tg.kind === 'car') {
      // Authored at 120 px long and scaled to the target, so the hitbox and the
      // picture are the same car.
      const k = tg.w / 120;
      const left = x - tg.w / 2;
      const X = (v: number) => left + v * k;
      const Y = (v: number) => y - v * k;
      const body = flash ? '#ffffff' : health > 0 ? '#c82828' : '#3a2a28';
      const dark = flash ? '#e0e0e0' : health > 0 ? '#801818' : '#201818';
      const sag = health < 0.25 ? 6 : 0;
      poly(ctx, [[X(0), Y(14 - sag)], [X(120), Y(14)], [X(118), Y(30)], [X(6), Y(30 - sag)]], body);
      poly(ctx, [[X(26), Y(30 - sag / 2)], [X(34), Y(48 - sag)], [X(82), Y(48 - (sag ? 3 : 0))], [X(96), Y(30)]], body);
      if (health > 0.45) {
        poly(ctx, [[X(32), Y(31)], [X(38), Y(45)], [X(56), Y(45)], [X(56), Y(31)]], '#9ad0f0');
        poly(ctx, [[X(60), Y(31)], [X(60), Y(45)], [X(80), Y(45)], [X(90), Y(31)]], '#9ad0f0');
        checker(ctx, X(40), Y(44), 8 * k, 10 * k, '#e0f0ff');
        if (health < 0.75) {
          rect(ctx, X(44), Y(44), 1, 12 * k, '#ffffff');
          rect(ctx, X(70), Y(40), 8 * k, 1, '#ffffff');
        }
      } else if (health > 0) {
        rect(ctx, X(36), Y(44), 50 * k, 12 * k, '#1a1a20');
      }
      rect(ctx, X(0), Y(16), tg.w, 2 * k, dark);
      rect(ctx, X(4), Y(24), tg.w - 8 * k, 1, mixHex(body, '#ffffff', 0.35));
      rect(ctx, X(58), Y(29), 1, 14 * k, dark);
      rect(ctx, X(62), Y(24), 6 * k, 2, '#d8d8d8');
      // Dents, more of them as it takes a beating.
      for (let i = 0; i < Math.floor((1 - health) * 14); i++) checker(ctx, X(6 + hash(i) * 100), Y(28 - hash(i + 9) * 12), 8 * k, 4 * k, '#000000');
      // Wheels, until they come off.
      for (const wv of [22, 98]) {
        if (health < 0.15 && wv > 60) continue;
        disc(ctx, X(wv), Y(10), 10 * k, '#1a1a1a');
        disc(ctx, X(wv), Y(10), 5 * k, '#9a9aa0');
        disc(ctx, X(wv), Y(10), 2 * k, '#3a3a40');
      }
      rect(ctx, X(116), Y(26), 4 * k, 5 * k, '#f8f0a0');
      rect(ctx, X(0), Y(26), 3 * k, 5 * k, '#e83030');
      if (tg.broken >= 0) {
        for (let i = 0; i < 6; i++) checker(ctx, X(20 + i * 14), Y(60) - ((clock + i * 8) % 30), 12 * k, 10 * k, '#5a5a5a');
      }
      return;
    }
    // An oil drum.
    if (tg.broken >= 0) {
      if (tg.broken < 40) for (let i = 0; i < 6; i++) rect(ctx, x - 12 + hash(i) * 24, y - tg.broken * 0.4 - hash(i + 4) * 12, 4, 3, '#3a5a8a');
      return;
    }
    const body = flash ? '#ffffff' : '#2a5a9a';
    rect(ctx, x - tg.w / 2, y - tg.h, tg.w, tg.h, body);
    rect(ctx, x - tg.w / 2, y - tg.h, 4, tg.h, mixHex(body, '#ffffff', 0.3));
    rect(ctx, x + tg.w / 2 - 6, y - tg.h, 6, tg.h, mixHex(body, '#000000', 0.35));
    for (const ry of [0.25, 0.75]) rect(ctx, x - tg.w / 2, y - tg.h * ry - 1, tg.w, 2, '#1a3a6a');
    rect(ctx, x - tg.w / 2, y - tg.h, tg.w, 2, '#1a3a6a');
    if (health < 0.6) checker(ctx, x - 6, y - tg.h + 8, 10, 8, '#000000');
  }

  function healthBars(ctx: CanvasRenderingContext2D, v: FightView): void {
    const f = v.fight;
    const [a, b] = f.fighters;
    const W = 156;
    const Y = 18;
    const bar = (x: number, health: number, max: number, drain: number, rightToLeft: boolean) => {
      rect(ctx, x - 2, Y - 2, W + 4, 13, '#f8f0d8');
      rect(ctx, x - 1, Y - 1, W + 2, 11, '#201010');
      const hw = Math.round((W * health) / max);
      const dw = Math.round((W * drain) / max);
      // Red is what was lost, still draining away; yellow is what is left.
      rect(ctx, rightToLeft ? x : x + W - dw, Y, dw, 9, '#c82020');
      const low = health <= max * 0.25 && v.clock % 20 < 10;
      rect(ctx, rightToLeft ? x : x + W - hw, Y, hw, 9, low ? '#f87818' : '#f8d818');
      rect(ctx, rightToLeft ? x : x + W - hw, Y, hw, 2, '#fff8a0');
      rect(ctx, rightToLeft ? x : x + W - hw, Y + 7, hw, 2, '#c89808');
    };
    bar(14, a.health, a.def.health, Math.max(a.health, v.drain[0]), false);
    if (b) bar(SCREEN_W - 14 - W, b.health, b.def.health, Math.max(b.health, v.drain[1]), true);
    // The KO badge between the bars.
    const kx = SCREEN_W / 2;
    disc(ctx, kx, Y + 4, 10, '#f8f0d8');
    disc(ctx, kx, Y + 4, 9, '#c82020');
    drawTextCentred(ctx, 'KO', kx + 1, Y + 1, { color: '#f8f0d8', scale: 1 });
    // Names and round wins.
    drawText(ctx, a.def.name, 14, Y + 14, { color: '#f8f0d8', outline: '#200808' });
    if (b) drawTextRight(ctx, b.def.name, SCREEN_W - 14, Y + 14, { color: '#f8f0d8', outline: '#200808' });
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      if (a.wins > i) winMark(ctx, 14 + textWidth(a.def.name) + 6 + i * 11, Y + 13);
      if (b && b.wins > i) winMark(ctx, SCREEN_W - 14 - textWidth(b.def.name) - 15 - i * 11, Y + 13);
    }
    // The clock.
    if (f.mode === 'bonus' || f.fighters[1]) {
      const time = String(f.timer).padStart(2, '0');
      bigText(ctx, time, kx + 1, Y + 16, 3, '#f8f8f8', '#f8b020');
    }
  }

  function winMark(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    poly(ctx, [[x, y + 4], [x + 3, y], [x + 6, y + 4], [x + 3, y + 8]], '#f8d818');
    rect(ctx, x + 2, y + 2, 2, 2, '#ffffff');
  }

  function scores(ctx: CanvasRenderingContext2D, v: FightView): void {
    drawText(ctx, `${v.sides[0]} ${String(v.score).padStart(7, '0')}`, 14, 4, { color: '#60c8f8', outline: '#081830' });
    if (v.hi >= 0) drawTextRight(ctx, `HI ${String(v.hi).padStart(7, '0')}`, SCREEN_W - 14, 4, { color: '#f8d818', outline: '#302008' });
    else drawTextRight(ctx, v.sides[1], SCREEN_W - 14, 4, { color: '#f86868', outline: '#300808' });
  }

  function calls(ctx: CanvasRenderingContext2D, v: FightView): void {
    const c = v.call;
    if (!c) return;
    const y = 74;
    switch (c.kind) {
      case 'round':
        bigText(ctx, c.text, SCREEN_W / 2, y, 4, '#f8f8f8', '#f8c040');
        break;
      case 'fight': {
        const s = c.t < 6 ? 8 - Math.floor(c.t / 2) : 6;
        bigText(ctx, c.text, SCREEN_W / 2, y - (s - 6) * 4, s, '#f8f040', '#e82818');
        break;
      }
      case 'ko':
        if (c.t % 16 < 12 || c.t > 50) bigText(ctx, c.text, SCREEN_W / 2, y - 6, 8, '#f8f8f8', '#e82818');
        break;
      case 'result':
        bigText(ctx, c.text, SCREEN_W / 2, y, 4, '#f8f040', '#f86818');
        break;
      case 'small':
        bigText(ctx, c.text, SCREEN_W / 2, y + 10, 3, '#f8f8f8', '#8ac8f8', '#081830');
        break;
    }
  }

  function tally(ctx: CanvasRenderingContext2D, v: FightView): void {
    const t = v.tally;
    if (!t || t.t < 40) return;
    const L = v.labels;
    const rows: [string, number][] = [
      [L.timeBonus, t.time],
      [L.vitalBonus, t.vitality]
    ];
    if (t.perfect) rows.push([L.perfectBonus, t.perfect]);
    rows.forEach(([label, n], i) => {
      const shown = Math.min(n, Math.floor(((t.t - 40 - i * 20) / 40) * n));
      if (t.t - 40 < i * 20) return;
      drawText(ctx, label, 96, 120 + i * 14, { color: '#f8f8f8', outline: '#101030', scale: 1 });
      drawTextRight(ctx, String(Math.max(0, shown)), 288, 120 + i * 14, { color: '#f8d818', outline: '#302008' });
    });
  }

  return {
    fightScene(ctx, v) {
      const f = v.fight;
      const shakeX = v.shake > 0 ? Math.round((hash(v.clock) - 0.5) * v.shake * 2) : 0;
      const shakeY = v.shake > 0 ? Math.round((hash(v.clock + 7) - 0.5) * v.shake) : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);
      drawStage(ctx, v.art, f.camera, v.clock, v.excite);
      for (const tg of f.targets) drawTarget(ctx, tg, f.camera, v.clock);
      // Shadows, then the bodies: whoever is attacking is drawn on top.
      const bodies = f.fighters.map((x, i) => ({ x, i })).filter(e => e.x) as { x: FighterState; i: number }[];
      for (const { x } of bodies) shadow(ctx, Math.round(x.x - f.camera + SCREEN_W / 2), x.y, x.def.build === 'giant' || x.def.build === 'heavy' ? 46 : 38);
      bodies.sort((p, q) => rankOf(p.x) - rankOf(q.x));
      for (const { x, i } of bodies) drawFighterAt(ctx, x, i, f.camera, v.alt[i], v.clock);
      for (const p of f.projectiles) projectile(ctx, p, f.camera, v.clock);
      for (const s of v.sparks) spark(ctx, s, f.camera);
      for (const fl of v.floaters) {
        const x = Math.round(fl.x - f.camera + SCREEN_W / 2);
        const y = Math.round(FLOOR_Y - fl.y - fl.t * 0.6);
        if (fl.t < 50 || fl.t % 4 < 2) drawTextCentred(ctx, fl.text, x, y, { color: fl.colour, outline: '#100808' });
      }
      ctx.restore();
      healthBars(ctx, v);
      scores(ctx, v);
      if (v.combo && v.combo.t < 70) {
        const side = v.combo.side;
        const text = `${v.combo.hits} HITS`;
        const x = side === 0 ? 20 : SCREEN_W - 20 - textWidth(text, 2);
        drawText(ctx, text, x, 66, { color: '#f8d818', outline: '#301000', scale: 2 });
      }
      calls(ctx, v);
      tally(ctx, v);
      if (f.mode === 'bonus' && f.phase !== 'fight' && f.phase !== 'roundEnd') bigText(ctx, v.labels.bonusStage, SCREEN_W / 2, 64, 3, '#f8f8f8', '#60c8f8', '#081830');
      if (v.bonusResult && v.bonusResult.t > 30) {
        bigText(ctx, v.bonusResult.cleared ? 'PERFECT' : 'TIME OVER', SCREEN_W / 2, 70, 4, '#f8f040', '#f86818');
        if (v.bonusResult.cleared) {
          drawText(ctx, v.labels.clearBonus, 96, 120, { color: '#f8f8f8', outline: '#101030' });
          drawTextRight(ctx, String(v.bonusResult.bonus), 288, 120, { color: '#f8d818', outline: '#302008' });
        }
      }
      void BONUS_TIME;
    },

    title(ctx, clock, labels) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#080410', '#140818', '#200a18', '#300c18']);
      for (let i = 0; i < 60; i++) rect(ctx, hash(i) * SCREEN_W, hash(i + 3) * SCREEN_H, 1, 1, '#605080');
      bigText(ctx, 'STREET', SCREEN_W / 2, 50, 6, '#f8f8f8', '#f8b020');
      bigText(ctx, 'CHAMPION', SCREEN_W / 2, 98, 6, '#f8d040', '#e82818');
      drawTextCentred(ctx, 'WORLD TOUR 1991', SCREEN_W / 2, 150, { color: '#c8c8f8', outline: '#100820', scale: 1 });
      if (clock % 60 < 40) drawTextCentred(ctx, labels.pressStart, SCREEN_W / 2, 180, { color: '#f8f8f8', outline: '#100820', scale: 2 });
    },

    select(ctx, s, clock, labels) {
      ctx.drawImage(mapCanvas(), 0, 0);
      checker(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');
      bigText(ctx, labels.select, SCREEN_W / 2, 8, 2, '#f8f8f8', '#60c8f8', '#081830');
      // The grid: two rows of four portraits.
      const size = 40;
      const gx = SCREEN_W / 2 - (4 * (size + 6)) / 2 + 3;
      const gy = 128;
      SELECTABLE.forEach((id, i) => {
        const x = gx + (i % 4) * (size + 6);
        const y = gy + Math.floor(i / 4) * (size + 8);
        card(ctx, id, false, x, y, size, 'calm', false, '#7a6a5a');
      });
      const players: (0 | 1)[] = s.mode === 'versus' ? [0, 1] : [0];
      for (const p of players) {
        const c = s.cursor[p];
        const x = gx + (c % 4) * (size + 6);
        const y = gy + Math.floor(c / 4) * (size + 8);
        const col = p === 0 ? '#3890f8' : '#f83838';
        if (s.chosen[p] || clock % 16 < 12) {
          for (const [dx, dy, w, h] of [
            [-4, -4, size + 8, 2],
            [-4, size + 2, size + 8, 2],
            [-4, -4, 2, size + 8],
            [size + 2, -4, 2, size + 8]
          ])
            rect(ctx, x + dx, y + dy, w, h, col);
        }
        drawText(ctx, p === 0 ? '1P' : '2P', x + (p === 0 ? -2 : size - 10), y - 12, { color: col, outline: '#101010' });
        // The big portrait of whoever the cursor is on.
        const id = s.chosen[p] ?? SELECTABLE[c];
        const big = 84;
        const bx = p === 0 ? 14 : SCREEN_W - 14 - big;
        card(ctx, id, s.alt[p], bx, 28, big, s.chosen[p] ? 'shout' : 'calm', p === 1, col);
        const name = FIGHTERS[id].name;
        drawTextCentred(ctx, name, bx + big / 2, 116, { color: '#f8f8f8', outline: '#101010', scale: 2 });
      }
      // Flags of where the cursor's fighter comes from.
      const home = HOMES[FIGHTERS[s.chosen[0] ?? SELECTABLE[s.cursor[0]]].home];
      drawTextCentred(ctx, home.country, s.mode === 'versus' ? SCREEN_W / 2 : 230, s.mode === 'versus' ? 100 : 60, { color: '#f8d818', outline: '#301000', scale: 2 });
      if (s.mode === 'versus') drawTextCentred(ctx, labels.versusMode, SCREEN_W / 2, 40, { color: '#f86868', outline: '#300808', scale: 2 });
      else bigText(ctx, String(s.selectTimer).padStart(2, '0'), 300, 84, 3, '#f8f8f8', '#f8b020');
    },

    map(ctx, s, clock) {
      ctx.drawImage(mapCanvas(), 0, 0);
      const me = s.chosen[0] as CharId;
      const opp = s.ladder[s.stage];
      // Every fighter already beaten is marked on the map.
      s.ladder.slice(0, s.stage).forEach(id => {
        const [x, y] = project(HOMES[FIGHTERS[id].home]);
        rect(ctx, x - 3, y - 3, 7, 7, '#801818');
        rect(ctx, x - 2, y - 2, 5, 5, '#f84040');
      });
      const from = project(HOMES[FIGHTERS[s.stage === 0 ? me : s.ladder[s.stage - 1]].home]);
      const to = project(HOMES[FIGHTERS[opp].home]);
      const p = Math.min(1, s.frame / 110);
      const px = from[0] + (to[0] - from[0]) * p;
      const py = from[1] + (to[1] - from[1]) * p - Math.sin(p * Math.PI) * 18;
      for (let i = 0; i < 30; i++) {
        const q = (i / 30) * p;
        if (i % 2) continue;
        rect(ctx, from[0] + (to[0] - from[0]) * q, from[1] + (to[1] - from[1]) * q - Math.sin(q * Math.PI) * 18, 2, 2, '#f8f8f8');
      }
      if (clock % 20 < 14) {
        rect(ctx, to[0] - 4, to[1] - 4, 9, 9, '#f8f8f8');
        rect(ctx, to[0] - 3, to[1] - 3, 7, 7, '#e82020');
      }
      plane(ctx, px, py, to[0] >= from[0] ? 1 : -1);
      // The opponent's card and his country.
      card(ctx, opp, false, SCREEN_W - 70, 150, 56, 'calm', true, '#f83838');
      drawTextRight(ctx, FIGHTERS[opp].name, SCREEN_W - 76, 170, { color: '#f8f8f8', outline: '#101010', scale: 2 });
      drawTextRight(ctx, HOMES[FIGHTERS[opp].home].country, SCREEN_W - 76, 190, { color: '#f8d818', outline: '#301000' });
      drawText(ctx, `${s.stage + 1} / ${s.ladder.length}`, 12, 206, { color: '#f8f8f8', outline: '#101010' });
    },

    versus(ctx, s, clock) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#100818', '#281030', '#401838', '#281030', '#100818']);
      const a = s.chosen[0] as CharId;
      const b = (s.mode === 'versus' ? s.chosen[1] : s.ladder[s.stage]) as CharId;
      const slide = Math.max(0, 40 - s.frame) * 5;
      card(ctx, a, s.alt[0], 24 - slide, 40, 128, 'calm', false, '#3890f8');
      card(ctx, b, s.mode === 'versus' ? s.alt[1] : false, SCREEN_W - 24 - 128 + slide, 40, 128, 'calm', true, '#f83838');
      drawTextCentred(ctx, FIGHTERS[a].name, 24 + 64 - slide, 178, { color: '#f8f8f8', outline: '#101010', scale: 2 });
      drawTextCentred(ctx, FIGHTERS[b].name, SCREEN_W - 24 - 64 + slide, 178, { color: '#f8f8f8', outline: '#101010', scale: 2 });
      if (s.frame > 30) bigText(ctx, 'VS', SCREEN_W / 2, 92 + (clock % 4 < 2 ? 0 : 1), 6, '#f8f040', '#e82818');
    },

    quote(ctx, s, clock, labels) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#081018', '#0c1828', '#102038']);
      const f = s.fight as FightState;
      const w = (s.lastWinner ?? 0) as 0 | 1;
      const winner = f.fighters[w] as FighterState;
      const loser = f.fighters[w === 0 ? 1 : 0] as FighterState;
      card(ctx, winner.id, s.alt[w], 20, 24, 112, 'shout', false, '#f8d818');
      card(ctx, loser.id, s.mode === 'versus' ? s.alt[w === 0 ? 1 : 0] : false, SCREEN_W - 20 - 64, 24, 64, 'hurt', true, '#6a6a7a');
      drawText(ctx, `${winner.def.name} WINS`, 148, 32, { color: '#f8d818', outline: '#301000', scale: 2 });
      const lines = wrap(labels.quotes[winner.id], 36);
      const shown = Math.floor(s.frame * 1.2);
      let used = 0;
      lines.forEach((line, i) => {
        const part = line.slice(0, Math.max(0, shown - used));
        used += line.length;
        drawText(ctx, part, 24, 152 + i * 12, { color: '#f8f8f8', outline: '#101020' });
      });
      void clock;
    },

    continueScreen(ctx, s, clock, labels, count) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#000000', '#100408', '#200810']);
      const me = s.chosen[0] as CharId;
      card(ctx, me, s.alt[0], SCREEN_W / 2 - 56, 40, 112, 'hurt', false, '#6a6a7a');
      bigText(ctx, labels.continueQ, SCREEN_W / 2, 164, 3, '#f8f8f8', '#f86868');
      if (count >= 0) bigText(ctx, String(count), SCREEN_W / 2, 188, 3, '#f8f040', '#e82818');
      void clock;
    },

    ending(ctx, s, art, clock, labels) {
      drawStage(ctx, art, 384, clock, 1);
      checker(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');
      const me = s.chosen[0] as CharId;
      card(ctx, me, s.alt[0], 24, 24, 96, 'shout', false, '#f8d818');
      bigText(ctx, labels.congratulations, SCREEN_W / 2 + 40, 34, 2, '#f8f040', '#f86818');
      const lines = wrap(labels.endings[me], 40);
      const shown = Math.floor(s.frame * 0.9);
      let used = 0;
      lines.forEach((line, i) => {
        const part = line.slice(0, Math.max(0, shown - used));
        used += line.length;
        drawText(ctx, part, 24, 132 + i * 12, { color: '#f8f8f8', outline: '#101020' });
      });
      drawTextCentred(ctx, labels.ending, SCREEN_W / 2 + 40, 60, { color: '#c8c8f8', outline: '#101020' });
    }
  };

  function mapCanvas(): HTMLCanvasElement {
    if (!worldMap) worldMap = paintWorld();
    return worldMap;
  }
}

/** Draw order: grounded and hurt first, attackers last. */
function rankOf(f: FighterState): number {
  if (f.state === 'attack' || f.state === 'special' || f.state === 'throw') return 2;
  if (f.state === 'down' || f.state === 'ko' || f.state === 'fall') return 0;
  return 1;
}

function plane(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  const X = (dx: number) => x + dx * dir;
  poly(ctx, [[X(-10), y], [X(10), y - 1], [X(12), y + 1], [X(-10), y + 3]], '#f8f8f8');
  poly(ctx, [[X(-2), y], [X(4), y - 8], [X(7), y - 8], [X(4), y + 1]], '#d8d8e8');
  poly(ctx, [[X(-2), y + 2], [X(4), y + 9], [X(7), y + 9], [X(4), y + 2]], '#b8b8c8');
  poly(ctx, [[X(-10), y], [X(-8), y - 5], [X(-6), y - 5], [X(-6), y]], '#d8d8e8');
  rect(ctx, X(6), y, 2, 1, '#3a5aa8');
}

// --- The world map ---------------------------------------------------------------------

const LON0 = -170;
const LON1 = 190;
const LAT0 = 78;
const LAT1 = -58;
const MAP_Y = 24;
const MAP_H = 180;

function project(h: { lon: number; lat: number }): [number, number] {
  return [Math.round(((h.lon - LON0) / (LON1 - LON0)) * SCREEN_W), Math.round(MAP_Y + ((LAT0 - h.lat) / (LAT0 - LAT1)) * MAP_H)];
}

const CONTINENTS: (readonly [number, number])[][] = [
  // North America
  [[-165, 65], [-140, 70], [-95, 72], [-80, 62], [-62, 55], [-64, 45], [-76, 36], [-81, 26], [-90, 29], [-97, 26], [-96, 18], [-88, 15], [-80, 8], [-92, 14], [-105, 21], [-117, 32], [-124, 42], [-128, 52], [-140, 59], [-158, 58], [-166, 62]],
  // Greenland
  [[-55, 80], [-20, 81], [-22, 70], [-44, 60], [-54, 68]],
  // South America
  [[-80, 10], [-62, 11], [-50, 0], [-35, -6], [-40, -22], [-52, -33], [-66, -55], [-74, -48], [-71, -20], [-81, -5]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 48], [4, 52], [8, 57], [12, 56], [18, 60], [24, 68], [32, 70], [44, 68], [60, 70], [80, 74], [110, 76], [140, 72], [170, 68], [180, 66], [162, 58], [142, 54], [134, 43], [122, 39], [121, 30], [110, 20], [106, 10], [101, 3], [98, 15], [92, 22], [80, 9], [73, 20], [66, 25], [57, 25], [52, 17], [44, 13], [35, 29], [36, 36], [28, 37], [24, 40], [20, 38], [14, 40], [10, 44], [3, 43], [-2, 37]],
  // Africa
  [[-17, 21], [-9, 34], [10, 37], [32, 31], [43, 12], [51, 12], [41, -3], [40, -15], [33, -27], [20, -35], [14, -24], [12, -6], [9, 4], [-8, 5], [-17, 14]],
  // Australia
  [[113, -22], [129, -13], [142, -11], [153, -26], [150, -37], [140, -38], [131, -32], [115, -34]],
  // Japan
  [[130, 32], [136, 34], [141, 38], [143, 44], [140, 42], [135, 36]],
  // Britain
  [[-5, 50], [2, 51], [-1, 56], [-5, 58], [-5, 54]],
  // Indonesia
  [[96, 5], [105, -6], [122, -8], [118, -3], [104, 0]]
];

function paintWorld(): HTMLCanvasElement {
  const c = makeCanvas(SCREEN_W, SCREEN_H);
  const ctx = ctx2d(c);
  bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#0a2a6a', '#103480', '#143c90', '#103480']);
  // The sea's grid of latitude and longitude.
  for (let y = MAP_Y; y < MAP_Y + MAP_H; y += 20) for (let x = 0; x < SCREEN_W; x += 3) rect(ctx, x, y, 1, 1, '#2a5ab0');
  for (let x = 0; x < SCREEN_W; x += 32) for (let y = MAP_Y; y < MAP_Y + MAP_H; y += 3) rect(ctx, x, y, 1, 1, '#2a5ab0');
  // Continents in chunky 3 px cells, with a coast.
  const cell = 3;
  const land = makeCanvas(SCREEN_W, SCREEN_H);
  const lctx = ctx2d(land);
  for (const shape of CONTINENTS) poly(lctx, shape.map(([lon, lat]) => project({ lon, lat })), '#000000');
  const data = lctx.getImageData(0, 0, SCREEN_W, SCREEN_H).data;
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < SCREEN_W && y < SCREEN_H && data[(y * SCREEN_W + x) * 4 + 3] > 0;
  for (let y = 0; y < SCREEN_H; y += cell) {
    for (let x = 0; x < SCREEN_W; x += cell) {
      const cx = x + 1;
      const cy = y + 1;
      if (!isLand(cx, cy)) {
        if (isLand(cx + cell, cy) || isLand(cx - cell, cy) || isLand(cx, cy + cell) || isLand(cx, cy - cell)) rect(ctx, x, y, cell, cell, '#3a70c8');
        continue;
      }
      const shade = hash(x * 0.37 + y * 1.7) > 0.7 ? '#c8a050' : (y / cell) % 7 < 3 ? '#58a040' : '#4a9038';
      rect(ctx, x, y, cell, cell, y < 50 || y > 190 ? '#e8f0f0' : shade);
    }
  }
  return c;
}

/** The project helper for tests. */
export const projectHome = project;
