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
 * Running text is the 5x7 bitmap font (it carries the accents the Spanish and
 * Catalan labels need); the big calls, the clock and the logo are the drawn
 * display letters of `display.ts`. Effects and props are frames painted once
 * (`effects-art.ts`, `props-art.ts`) and blitted, so a frame of the fight is
 * a few dozen whole-pixel copies and spans.
 */
import { drawText, drawTextCentred, drawTextRight, textWidth } from '../football/font';
import type { ArcadeState } from './arcade';
import { BONUS_TIME, FLOOR_Y, ROUNDS_TO_WIN, SCREEN_H, SCREEN_W, type FightState, type FighterState, type Projectile, type Target } from './fight';
import { drawBody, landmarks3 } from './body';
import { celFor } from './frames';
import { SHEETS } from './sheets';
import { Raster, lookFor, signatureColour, type Look } from './figure';
import { drawPortrait } from './portrait';
import { STYLE, drawDisplay, type DisplayStyle } from './display';
import { DUST_FRAMES, SPARK_FRAMES, blit, breathStream, dizzyBird, dizzyStar, dust, flameTongue, hitSpark, projectileArt, whirl, type HitKind } from './effects-art';
import { bands, checker, ctx2d, disc, hash, makeCanvas, rect } from './pix';
import { PixBuf, bayer, mix, rgb } from './pixbuf';
import { poseFor, type Pose } from './poses';
import { CAR_W, FLAG_OF, carArt, carStage, drumArt, flagArt, koEmblem, planeArt, winMedal } from './props-art';
import { FIGHTERS, HOMES, SELECTABLE, type CharId, type HomeId } from './roster';
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
 * A call in the arcade's style at a cap height of `7 * scale` (the size the
 * 5x7 glyphs used to be blown up to), graded from `top` to `bottom` inside a
 * dark outline. Kept for callers that pick their own colours; the renderer
 * itself uses the house styles of `display.ts`.
 */
export function bigText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, scale: number, top: string, bottom: string, outline = '#1a0808'): void {
  const style: DisplayStyle = { stops: [[0, '#ffffff'], [0.3, top], [1, bottom]], hi: '#ffffff', lo: mix(bottom, '#000000', 0.5), edge: outline, outer: '#000000', shadow: '#000000' };
  drawDisplay(ctx, text, cx, y, 7 * scale, style, `big:${top}:${bottom}:${outline}`);
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
  /** Set by the renderer on first sight: which way the blow travelled, and whether it was the KO. */
  aimed?: boolean;
  ko?: boolean;
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

/** Text with a one-pixel outline and a hard drop shadow, the HUD's lettering. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: 'left' | 'centre' | 'right' = 'left', scale = 1, outline = '#000000'): void {
  const opts = { color, outline, scale, shadow: { color: '#000000', dx: 1, dy: 1 } };
  if (align === 'centre') drawTextCentred(ctx, text, x, y, opts);
  else if (align === 'right') drawTextRight(ctx, text, x, y, opts);
  else drawText(ctx, text, x, y, opts);
}

/** A bevelled panel: black rim, lit top-left, shaded bottom-right, a solid face. */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face = '#101838', light = '#c8d0f0', dark = '#404870'): void {
  rect(ctx, x - 3, y - 3, w + 6, h + 6, '#000000');
  rect(ctx, x - 2, y - 2, w + 4, h + 4, dark);
  rect(ctx, x - 2, y - 2, w + 3, 1, light);
  rect(ctx, x - 2, y - 2, 1, h + 3, light);
  rect(ctx, x - 1, y - 1, w + 2, h + 2, '#000000');
  rect(ctx, x, y, w, h, face);
}

function flagFor(home: HomeId, k = 1) {
  return flagArt(FLAG_OF[home], k);
}

/** Where the CC0 fighter sheets are served from, under `public/`. */
const SPRITE_BASE = '/fun/fighter/sprites';

/** A cached fighter sprite and where its top-left sits relative to the feet. */
interface Sprite {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
}

export function createRenderer(): Renderer {
  const SPR = 208;
  const ANCHOR_X = SPR / 2;
  const ANCHOR_Y = SPR - 24;
  const rasters = [new Raster(SPR, SPR), new Raster(SPR, SPR)];
  const images = [0, 1].map(() => ctx2d(makeCanvas(1, 1)).createImageData(SPR, SPR));
  const portraits = new Map<string, HTMLCanvasElement>();
  const backdrops = new Map<string, HTMLCanvasElement>();
  let worldMap: HTMLCanvasElement | null = null;

  /**
   * Rasterised sprites, kept per fighter, colourway, flash and pose. Poses
   * are held keyframes, so most frames repeat one already drawn, and the
   * software raster (a millisecond or more a figure) runs only on a pose
   * change. Each sprite is cropped to its outline to keep the cache small,
   * and the oldest entries go once it is full.
   */
  const spriteCache = new Map<string, Sprite>();
  const SPRITE_CACHE_MAX = 480;

  function renderFighter(slot: number, def: FighterState['def'], look: Look, pose: Pose, flash: 'none' | 'white' | 'electric'): Sprite {
    const key = `${def.id}|${look.skin}${look.top}${look.pants}${look.hair}${look.accent}|${flash}|${JSON.stringify(pose)}`;
    const hit = spriteCache.get(key);
    if (hit) {
      // Refresh its place so the cache drops the least recently used.
      spriteCache.delete(key);
      spriteCache.set(key, hit);
      return hit;
    }
    const r = rasters[slot];
    r.clear();
    drawBody(r, def, look, pose, ANCHOR_X, ANCHOR_Y);
    r.toImage3(images[slot], flash, 2.5);
    // The outline sits one pixel outside the drawn parts.
    let x0 = SPR;
    let y0 = SPR;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < SPR; y++) {
      for (let x = 0; x < SPR; x++) {
        if (!r.mat[y * SPR + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(SPR - 1, x1 + 1);
    y1 = Math.min(SPR - 1, y1 + 1);
    const w = Math.max(1, x1 - x0 + 1);
    const h = Math.max(1, y1 - y0 + 1);
    const canvas = makeCanvas(w, h);
    ctx2d(canvas).putImageData(images[slot], -x0, -y0, x0, y0, w, h);
    const sprite: Sprite = { canvas, ox: x0 - ANCHOR_X, oy: y0 - ANCHOR_Y };
    spriteCache.set(key, sprite);
    if (spriteCache.size > SPRITE_CACHE_MAX) spriteCache.delete(spriteCache.keys().next().value as string);
    return sprite;
  }

  /**
   * The sprite sheets of the fighters drawn from puffolotti's CC0 cels,
   * loaded on first use; until a sheet arrives (or if it never does) the
   * fighter is drawn with the 3D body instead. Each keeps a white silhouette
   * copy for the hit flash and an electric one for the beast's charge.
   */
  const sheets = new Map<string, { img: HTMLImageElement; ready: boolean; white?: HTMLCanvasElement; electric?: HTMLCanvasElement }>();
  function sheetFor(id: CharId, alt: boolean) {
    const key = alt ? `${id}-alt` : id;
    let s = sheets.get(key);
    if (!s) {
      const img = new Image();
      const entry = { img, ready: false } as { img: HTMLImageElement; ready: boolean; white?: HTMLCanvasElement; electric?: HTMLCanvasElement };
      img.onload = () => (entry.ready = true);
      img.src = `${SPRITE_BASE}/${key}.png`;
      sheets.set(key, entry);
      s = entry;
    }
    return s.ready ? s : null;
  }
  function tinted(s: { img: HTMLImageElement; white?: HTMLCanvasElement; electric?: HTMLCanvasElement }, kind: 'white' | 'electric'): HTMLCanvasElement {
    const have = s[kind];
    if (have) return have;
    const c = makeCanvas(s.img.width, s.img.height);
    const x = ctx2d(c);
    x.drawImage(s.img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    if (kind === 'white') {
      x.globalAlpha = 0.8;
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
    } else {
      x.globalAlpha = 0.75;
      for (let yy = 0; yy < c.height; yy++)
        for (let xx = 0; xx < c.width; xx += 2) {
          x.fillStyle = (xx + yy) % 4 < 2 ? '#fafa78' : '#283cdc';
          x.fillRect(xx, yy, 2, 1);
        }
    }
    s[kind] = c;
    return c;
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
    r.toImage3(img, 'none', size / 24);
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

  /** The backdrop a portrait sits on: its fighter's colour, graded and dithered, with a sunburst. */
  function backdrop(id: CharId, size: number, mood: string): HTMLCanvasElement {
    const key = `${id}:${size}:${mood}`;
    const hit = backdrops.get(key);
    if (hit) return hit;
    const b = new PixBuf(size, size);
    const base = mood === 'hurt' ? '#585868' : signatureColour(id);
    const top = mix(base, '#000000', 0.25);
    const mid = mix(base, '#000000', 0.55);
    const bot = mix(base, '#000000', 0.82);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const t = y / size;
        const a = t < 0.5 ? top : mid;
        const c = t < 0.5 ? mid : bot;
        const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        let col = f > bayer(x, y) ? c : a;
        // Faint rays from behind the head.
        const ang = Math.atan2(y - size * 0.4, x - size * 0.5);
        if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 18) % 2 === 0 && (x + y) % 2 === 0) col = mix(col, '#ffffff', 0.12);
        b.set(x, y, rgb(col));
      }
    const c = b.toCanvas();
    backdrops.set(key, c);
    return c;
  }

  /** A portrait in a bevelled metal frame, the colour of the side it belongs to. */
  function card(ctx: CanvasRenderingContext2D, id: CharId, alt: boolean, x: number, y: number, size: number, mood: 'calm' | 'hurt' | 'shout' = 'calm', flip = false, frame = '#e8c860'): void {
    x = Math.round(x);
    y = Math.round(y);
    const thick = size >= 64 ? 3 : 2;
    const o = thick + 2;
    rect(ctx, x - o, y - o, size + o * 2, size + o * 2, '#000000');
    rect(ctx, x - o + 1, y - o + 1, size + (o - 1) * 2, size + (o - 1) * 2, mix(frame, '#000000', 0.45));
    rect(ctx, x - o + 1, y - o + 1, size + (o - 1) * 2 - 1, thick - 1 || 1, mix(frame, '#ffffff', 0.55));
    rect(ctx, x - o + 1, y - o + 1, thick - 1 || 1, size + (o - 1) * 2 - 1, mix(frame, '#ffffff', 0.55));
    rect(ctx, x - o + 2, y - o + 2, size + (o - 2) * 2 - 1, size + (o - 2) * 2 - 1, frame);
    rect(ctx, x - o + 2 + (thick - 1), y - o + 2 + (thick - 1), size + 2, size + 2, mix(frame, '#000000', 0.6));
    rect(ctx, x - 1, y - 1, size + 2, size + 2, '#000000');
    ctx.drawImage(backdrop(id, size, mood), x, y);
    const p = portrait(id, alt, mood, size);
    if (flip) {
      ctx.save();
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.drawImage(p, 0, 0);
      ctx.restore();
    } else ctx.drawImage(p, x, y);
    // Rivets at the corners of the bigger frames.
    if (size >= 64) {
      for (const [cx, cy] of [
        [x - o + 2, y - o + 2],
        [x + size + o - 4, y - o + 2],
        [x - o + 2, y + size + o - 4],
        [x + size + o - 4, y + size + o - 4]
      ]) {
        rect(ctx, cx, cy, 2, 2, mix(frame, '#ffffff', 0.7));
        rect(ctx, cx + 1, cy + 1, 1, 1, mix(frame, '#000000', 0.5));
      }
    }
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
    const special = f.state === 'special' ? f.action?.special : undefined;
    const t = f.action?.t ?? 0;
    const electric = special?.kind === 'rapid' && f.def.build === 'beast';
    const flash = f.flash > 0 && f.flash % 2 === 0 ? 'white' : electric && clock % 4 < 2 ? 'electric' : 'none';
    const cel = celFor(f, clock);
    const sheet = cel !== null ? sheetFor(f.id, alt) : null;
    const rect = cel !== null ? SHEETS[f.id]?.frames[cel] : undefined;
    const sprite = sheet && rect ? null : renderFighter(slot, f.def, look, pose, flash);
    const sx = Math.round(f.x - cam + SCREEN_W / 2);
    const sy = Math.round(FLOOR_Y - f.y);
    // A hit fighter shudders through the hitstop.
    const jitter = f.state === 'hitstun' && f.frame < 3 ? (clock % 2 ? 1 : -1) : 0;
    const mirrored = (f.facing === -1) !== !!pose.flip;
    const headY = sy - f.def.height - 8;
    if (f.state === 'dizzy') dizzy(ctx, sx, headY, clock, f, 'back');
    ctx.save();
    ctx.translate(sx + jitter, sy);
    if (mirrored) ctx.scale(-1, 1);
    if (special) auraBack(ctx, f, t, clock);
    if (sprite) ctx.drawImage(sprite.canvas, sprite.ox, sprite.oy);
    else if (sheet && rect) {
      const src = flash === 'none' ? sheet.img : tinted(sheet, flash);
      ctx.drawImage(src, rect[0], rect[1], rect[2], rect[3], rect[4], rect[5], rect[2], rect[3]);
    }
    if (special) auraFront(ctx, f, t, clock, pose);
    ctx.restore();
    if (electric && t >= 6 && t <= (f.action?.until ?? 0)) bolts(ctx, sx, sy - f.def.height * 0.5, f.def.height, clock);
    if (f.state === 'dizzy') dizzy(ctx, sx, headY, clock, f, 'front');
  }

  /** Effects behind the body: psycho flames, the back half of a whirl, speed lines. */
  function auraBack(ctx: CanvasRenderingContext2D, f: FighterState, t: number, clock: number): void {
    const s = f.action?.special;
    if (!s) return;
    const h = f.def.height;
    if (f.id === 'zar' && s.kind === 'rush' && s.button === 'P' && t >= 6) {
      // Psycho power: the body wrapped in purple flame, licking back along the charge.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = Math.cos(a) * 30 + 8;
        const y = -h * 0.5 + Math.sin(a) * h * 0.3;
        blit(ctx, flameTongue((clock >> 1) + i, true, true, false), x, y);
      }
    } else if (f.id === 'zar' && t >= 4 && t < 12) {
      // The flare as any psycho move starts.
      for (let i = 0; i < 8; i++) {
        const a = Math.PI + (i / 7) * Math.PI;
        blit(ctx, flameTongue((clock >> 1) + i, true, false, false), Math.cos(a) * 22, -h * 0.5 + Math.sin(a) * h * 0.45 + 10);
      }
    }
    if (s.kind === 'lariat' && t >= 4 && t < 52) blit(ctx, whirl(60, 10, clock >> 1, 'back', 'white'), 0, -h * 0.7);
    if (s.kind === 'spin' && t >= 6) blit(ctx, whirl(44, 8, clock >> 1, 'back', 'blue'), 0, -h * (f.def.build === 'slim' ? 0.75 : 0.42));
    if (s.kind === 'rush' && t >= 8 && (f.action?.travel ?? 0) > 0) speedLines(ctx, h, clock, f.id === 'zar' ? '#d8a0f8' : '#f8f8f8');
    if (s.kind === 'rising' && t >= 3 && t < 14) {
      for (let i = 0; i < 4; i++) {
        const x = -8 + i * 6 + ((clock + i) % 3);
        const y0 = -h * 0.2 + ((clock * 3 + i * 7) % 12);
        for (let y = 0; y < 24; y += 2) if (bayer(x, y) < 1 - y / 24) rect(ctx, x, y0 + y, 1, 2, '#f8f8ff');
      }
    }
  }

  /** Effects over the body: the front of a whirl, the flash kick's arc, the breath. */
  function auraFront(ctx: CanvasRenderingContext2D, f: FighterState, t: number, clock: number, pose: Pose): void {
    const s = f.action?.special;
    if (!s) return;
    const h = f.def.height;
    if (f.id === 'zar' && s.kind === 'rush' && s.button === 'P' && t >= 6) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        blit(ctx, flameTongue((clock >> 1) + i * 3, true, true, false), Math.cos(a) * 18 - 6, -h * 0.5 + Math.sin(a) * h * 0.16);
      }
    }
    if (s.kind === 'lariat' && t >= 4 && t < 52) blit(ctx, whirl(60, 10, clock >> 1, 'front', 'white'), 0, -h * 0.7);
    if (s.kind === 'spin' && t >= 6) blit(ctx, whirl(44, 8, clock >> 1, 'front', 'blue'), 0, -h * (f.def.build === 'slim' ? 0.75 : 0.42));
    if (s.kind === 'flip' && t >= 3 && t < 18) flipArc(ctx, h, t);
    if (s.kind === 'breath' && t >= 14 && t < 36) {
      const lm = landmarks3(f.def, pose);
      const img = breathStream(clock >> 1, false);
      const grow = Math.min(1, (t - 13) / 6);
      const cut = t >= 30 ? Math.min(1, (t - 30) / 6) : 0;
      const len = Math.round(img.canvas.width * grow);
      const from = Math.round(img.canvas.width * cut);
      if (len > from) {
        const x = Math.round(lm.head[0] + 8);
        const y = Math.round(lm.head[1] + 5);
        ctx.drawImage(img.canvas, from, 0, len - from, img.canvas.height, x - img.ax + from, y - img.ay, len - from, img.canvas.height);
      }
    }
  }

  function speedLines(ctx: CanvasRenderingContext2D, h: number, clock: number, colour: string): void {
    for (let i = 0; i < 7; i++) {
      const y = Math.round(-h * (0.15 + i * 0.11));
      const len = 18 + Math.round(hash(i * 7 + (clock >> 2)) * 30);
      const x0 = -20 - Math.round(hash(i + (clock >> 1)) * 12);
      for (let k = 0; k < len; k++) if (k < len * 0.4 || (k + i) % 2 === 0) rect(ctx, x0 - k, y, 1, 1, colour);
    }
  }

  /** The flash kick's crescent: the foot's path, white at the tip, burning out to blue. */
  function flipArc(ctx: CanvasRenderingContext2D, h: number, t: number): void {
    const cy = -h * 0.5;
    const R = h * 0.52;
    const end = -0.7 + Math.min(1, (t - 3) / 8) * 3.6;
    const fade = t > 12 ? (t - 12) / 6 : 0;
    for (let k = 0; k < 70; k++) {
      const s = k / 70;
      const a = end - s * 2.6;
      if (a < -0.7) break;
      const x = Math.round(Math.cos(a) * R);
      const y = Math.round(cy - Math.sin(a) * R);
      if (bayer(x, y) < fade + s * 0.6) continue;
      const w = s < 0.15 ? 5 : s < 0.5 ? 4 : 3;
      const c = s < 0.12 ? '#ffffff' : s < 0.35 ? '#c8f0ff' : s < 0.7 ? '#70b8f8' : '#3070d8';
      rect(ctx, x - (w >> 1), y - (w >> 1), w, w, c);
    }
  }

  /** The beast's electricity: jagged bolts that re-strike every other frame. */
  function bolts(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, clock: number): void {
    const seed = clock >> 1;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + hash(seed * 3 + i) * 0.8;
      const reach = h * (0.45 + hash(seed + i * 5) * 0.25);
      const pts: [number, number][] = [];
      let px = cx;
      let py = cy;
      pts.push([px, py]);
      for (let k = 1; k <= 6; k++) {
        const d = (reach * k) / 6;
        const off = (hash(seed * 7 + i * 13 + k) - 0.5) * 12;
        px = cx + Math.cos(a) * d - Math.sin(a) * off;
        py = cy + Math.sin(a) * d * 0.9 + Math.cos(a) * off;
        pts.push([px, py]);
      }
      for (const [colour, size] of [
        ['#2878f8', 3],
        ['#f8f8a0', 1]
      ] as const) {
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, ay] = pts[k];
          const [bx, by] = pts[k + 1];
          const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
          for (let j = 0; j <= n; j++) rect(ctx, Math.round(ax + ((bx - ax) * j) / n) - (size >> 1), Math.round(ay + ((by - ay) * j) / n) - (size >> 1), size, size, colour);
        }
      }
    }
  }

  /** Stars (or birds) circling the head; the half behind is drawn before the body. */
  function dizzy(ctx: CanvasRenderingContext2D, x: number, y: number, clock: number, f: FighterState, half: 'back' | 'front'): void {
    const birds = f.id.charCodeAt(0) % 2 === 1;
    for (let i = 0; i < 4; i++) {
      const a = clock * 0.11 + (i * Math.PI) / 2;
      const front = Math.sin(a) > 0;
      if ((half === 'front') !== front) continue;
      const px = x + Math.cos(a) * 18;
      const py = y + Math.sin(a) * 5 + (front ? 0 : -1);
      if (birds && i % 2 === 0) blit(ctx, dizzyBird(clock >> 3, Math.cos(a + Math.PI / 2) < 0), px, py);
      else if (front || clock % 2 === 0) blit(ctx, dizzyStar(), px, py);
    }
  }

  function projectile(ctx: CanvasRenderingContext2D, p: Projectile, cam: number): void {
    if (p.dead) return;
    const x = Math.round(p.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - p.y);
    const flip = p.vx < 0;
    const speed = p.style === 'sonic' ? 2 : 3;
    blit(ctx, projectileArt(p.style, Math.floor(p.t / speed), flip), x, y);
  }

  /** Work out, once, which way a spark's blow travelled and whether it was the round's last. */
  function aim(s: Spark, f: FightState): void {
    if (s.aimed) return;
    s.aimed = true;
    const [a, b] = f.fighters;
    if (b) {
      const hurt = (x: FighterState) => ['hitstun', 'blockstun', 'fall', 'ko', 'down', 'thrown', 'guard'].includes(x.state);
      const def = hurt(a) && !hurt(b) ? a : hurt(b) && !hurt(a) ? b : Math.abs(a.x - s.x) < Math.abs(b.x - s.x) ? a : b;
      const att = def === a ? b : a;
      s.dir = def.x >= att.x ? 1 : -1;
    } else if (f.targets.length) s.dir = f.targets[0].x >= a.x ? 1 : -1;
    s.ko = f.phase === 'ko' && f.phaseFrame <= 3 && s.kind !== 'block' && s.kind !== 'dust' && s.kind !== 'debris';
  }

  function spark(ctx: CanvasRenderingContext2D, s: Spark, f: FightState, cam: number, clock: number): void {
    aim(s, f);
    const x = Math.round(s.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - s.y);
    if (s.kind === 'dust') {
      if (s.t < DUST_FRAMES) blit(ctx, dust(s.seed, s.t), x, FLOOR_Y + 1);
      return;
    }
    if (s.kind === 'debris') {
      debris(ctx, s, f, x, y, clock);
      return;
    }
    if (s.t >= SPARK_FRAMES) return;
    const kind: HitKind = s.ko ? 'ko' : s.kind;
    blit(ctx, hitSpark(kind, s.seed, s.t, s.dir < 0), x, y);
    // On the bonus stage every blow knocks chips of paint and glass off.
    if (f.mode === 'bonus' && s.kind !== 'block' && s.kind !== 'clash') chips(ctx, s, f, x, y);
  }

  function chips(ctx: CanvasRenderingContext2D, s: Spark, f: FightState, x: number, y: number): void {
    const car = f.targets.some(t => t.kind === 'car');
    const cols = car ? ['#d82820', '#e0f4ff', '#98c8e8', '#801010', '#c8d0d8'] : ['#2858a8', '#78a8e8', '#183878', '#101010'];
    const t = s.t;
    for (let i = 0; i < 7; i++) {
      const vx = (0.8 + hash(s.seed * 3 + i) * 2.4) * s.dir;
      const vy = -1.6 - hash(s.seed + i * 7) * 2.2;
      const px = x + vx * t * 1.6;
      const py = y + vy * t * 1.6 + 0.35 * t * t;
      rect(ctx, px, py, i % 3 === 0 ? 2 : 1, i % 2 ? 2 : 1, cols[i % cols.length]);
    }
  }

  /** What is left of a target flying apart: panels, glass and a wheel; or a drum's staves and oil. */
  function debris(ctx: CanvasRenderingContext2D, s: Spark, f: FightState, x: number, y: number, clock: number): void {
    const car = f.targets.some(t => t.kind === 'car');
    const t = s.t;
    const n = car ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const h1 = hash(s.seed * 1.3 + i * 3.1);
      const h2 = hash(s.seed * 0.7 + i * 5.3);
      const vx = (h1 - 0.5) * 7;
      const vy = -2.5 - h2 * 4.5;
      const g = 0.32;
      // Fall, then bounce once and settle on the floor.
      const land = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, FLOOR_Y - y))) / g;
      let px: number;
      let py: number;
      if (t < land) {
        px = x + vx * t;
        py = y + vy * t + 0.5 * g * t * t;
      } else {
        const tt = t - land;
        const bv = -vy * 0.3;
        const up = Math.max(0, bv * tt - 0.5 * g * tt * tt);
        px = x + vx * land + vx * 0.3 * Math.min(tt, bv / g * 2);
        py = FLOOR_Y - up;
      }
      if (t > 40 && (t + i) % 2 === 0) continue;
      const spin = (Math.floor(t / 3) + i) % 4;
      const kind = car ? i % 5 : i % 3;
      if (car) {
        if (kind === 0 || kind === 1) {
          // Glass, glinting as it tumbles.
          rect(ctx, px, py, spin % 2 ? 2 : 1, spin % 2 ? 1 : 2, (clock + i) % 4 === 0 ? '#ffffff' : '#a8d8f0');
        } else if (kind === 2 || kind === 3) {
          const w = spin % 2 ? 6 : 3;
          const h = spin % 2 ? 3 : 5;
          rect(ctx, px - 1, py - 1, w + 2, h + 2, '#200404');
          rect(ctx, px, py, w, h, kind === 2 ? '#d82820' : '#a81818');
          rect(ctx, px, py, w, 1, '#f87860');
        } else {
          rect(ctx, px - 1, py - 1, 5, 4, '#202020');
          rect(ctx, px, py, 3, 2, i % 2 ? '#c8d0d8' : '#606060');
        }
      } else if (kind === 0) {
        rect(ctx, px - 1, py - 1, (spin % 2 ? 7 : 4) + 2, (spin % 2 ? 3 : 6) + 2, '#040810');
        rect(ctx, px, py, spin % 2 ? 7 : 4, spin % 2 ? 3 : 6, '#2858a8');
        rect(ctx, px, py, spin % 2 ? 7 : 1, 1, '#78a8e8');
      } else if (kind === 1) rect(ctx, px, py, 2, 2, '#101010');
      else rect(ctx, px, py, 3, 2, '#3c74c8');
    }
  }

  function drawTarget(ctx: CanvasRenderingContext2D, tg: Target, cam: number, clock: number): void {
    const x = Math.round(tg.x - cam + SCREEN_W / 2);
    const y = Math.round(FLOOR_Y - tg.y);
    const health = tg.hp / tg.maxHp;
    const flash = tg.flash > 0 && tg.flash % 2 === 0;
    if (tg.kind === 'car') {
      const left = Math.round(x - tg.w / 2);
      const k = tg.w / CAR_W;
      // Its shadow on the tarmac.
      for (let dy = 0; dy < 4; dy++) checker(ctx, left - 4 + dy * 2, FLOOR_Y - 1 + dy, tg.w + 8 - dy * 4, 1, '#000000');
      const art = carArt(carStage(health, tg.broken >= 0), flash);
      if (k === 1) blit(ctx, art, left, y);
      else ctx.drawImage(art.canvas, left - art.ax * k, y - art.ay * k, art.canvas.width * k, art.canvas.height * k);
      if (tg.broken >= 0 || health < 0.4) smoke(ctx, left + Math.round(150 * k), y - 30, clock, tg.broken >= 0 ? 1 : 0.5);
      if (tg.broken >= 0) smoke(ctx, left + Math.round(70 * k), y - 34, clock + 17, 0.7);
      return;
    }
    // An oil drum.
    if (tg.broken >= 0) return;
    for (let dy = 0; dy < 2; dy++) if (tg.y === 0) checker(ctx, x - tg.w / 2 - 2 + dy * 2, FLOOR_Y - 1 + dy, tg.w + 4 - dy * 4, 1, '#000000');
    blit(ctx, drumArt(tg.w, tg.h, health, flash), x, y);
  }

  /** Smoke rolling up off a wreck, dark puffs thinning as they climb. */
  function smoke(ctx: CanvasRenderingContext2D, x: number, y: number, clock: number, amount: number): void {
    for (let i = 0; i < 6; i++) {
      const life = (clock * 0.6 + i * 14) % 84;
      if (hash(i) > amount + 0.2) continue;
      const py = y - life * 0.9;
      const px = x + Math.sin(life * 0.08 + i) * 6 + life * 0.15;
      const r = 4 + life * 0.12;
      const shade = life < 30 ? '#303030' : life < 60 ? '#484848' : '#606060';
      if (life < 56) {
        disc(ctx, px, py, r, shade);
        disc(ctx, px - r * 0.3, py - r * 0.3, r * 0.6, life < 30 ? '#484848' : '#686868');
      } else {
        const rr = Math.round(r);
        checker(ctx, px - rr, py - rr, rr * 2, rr * 2, shade);
      }
    }
  }

  // --- The HUD ---------------------------------------------------------------------------------

  const BAR_W = 154;
  const BAR_Y = 17;
  const BAR_H = 10;
  const LIFE_ROWS = ['#fffff0', '#fff8a0', '#f8f050', '#f8e830', '#f8e030', '#f8d020', '#f8c818', '#e8b010', '#c89008', '#987008'];
  const LOW_ROWS = ['#fffff0', '#fff0c0', '#f8c060', '#f8a040', '#f89030', '#f88028', '#f07020', '#e06018', '#c04810', '#903008'];
  const LOST = '#a01010';
  const LOST_DARK = '#600808';

  function bar(ctx: CanvasRenderingContext2D, x: number, health: number, max: number, drain: number, side: 0 | 1, clock: number): void {
    const W = BAR_W;
    const Y = BAR_Y;
    // The frame: a black rim, a gilt bevel, a black inner line.
    rect(ctx, x - 3, Y - 3, W + 6, BAR_H + 6, '#000000');
    rect(ctx, x - 2, Y - 2, W + 4, BAR_H + 4, '#806020');
    rect(ctx, x - 2, Y - 2, W + 4, 1, '#f8e8a0');
    rect(ctx, x - 2, Y - 2, 1, BAR_H + 4, '#f8e8a0');
    rect(ctx, x - 1, Y + BAR_H + 1, W + 2, 1, '#503810');
    rect(ctx, x - 1, Y - 1, W + 2, BAR_H + 2, '#000000');
    // What is lost is red; what is still draining away is a hot orange.
    rect(ctx, x, Y, W, BAR_H, LOST);
    for (let r = 0; r < BAR_H; r += 3) rect(ctx, x, Y + r + 2, W, 1, LOST_DARK);
    const hw = Math.max(0, Math.round((W * health) / max));
    const dw = Math.max(hw, Math.round((W * drain) / max));
    const at = (w: number) => (side === 0 ? x : x + W - w);
    if (dw > hw) {
      rect(ctx, at(dw), Y, dw, BAR_H, '#f8f0d0');
      rect(ctx, at(dw), Y + 2, dw, BAR_H - 4, '#f89838');
    }
    const low = health <= max * 0.25 && health > 0;
    const rows = low && clock % 16 < 8 ? LOW_ROWS : LIFE_ROWS;
    const lx = at(hw);
    for (let r = 0; r < BAR_H; r++) rect(ctx, lx, Y + r, hw, 1, rows[r]);
    // The lit end of the bar.
    if (hw > 1) rect(ctx, side === 0 ? lx + hw - 1 : lx, Y, 1, BAR_H, rows[1]);
    // Tick marks, every eighth of the bar.
    for (let i = 1; i < 8; i++) rect(ctx, x + Math.round((W * i) / 8), Y + BAR_H - 2, 1, 2, '#000000');
  }

  function healthBars(ctx: CanvasRenderingContext2D, v: FightView): void {
    const f = v.fight;
    const [a, b] = f.fighters;
    const kx = SCREEN_W / 2;
    const leftX = 14;
    const rightX = SCREEN_W - 14 - BAR_W;
    bar(ctx, leftX, a.health, a.def.health, Math.max(a.health, v.drain[0]), 0, v.clock);
    if (b) bar(ctx, rightX, b.health, b.def.health, Math.max(b.health, v.drain[1]), 1, v.clock);
    // The KO emblem between the bars, alight when a fighter is near the end.
    const danger = f.fighters.some(x => x && x.health > 0 && x.health <= x.def.health * 0.25) || f.phase === 'ko';
    blit(ctx, koEmblem(danger && v.clock % 20 < 12), kx, BAR_Y - 5);
    // Names and round wins.
    label(ctx, a.def.name, leftX, BAR_Y + BAR_H + 5, '#f8f8f8');
    if (b) label(ctx, b.def.name, SCREEN_W - 14, BAR_Y + BAR_H + 5, '#f8f8f8', 'right');
    const medal = winMedal();
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      if (a.wins > i) ctx.drawImage(medal.canvas, leftX + BAR_W - 13 - i * 15, BAR_Y + BAR_H + 4);
      if (b && b.wins > i) ctx.drawImage(medal.canvas, rightX + i * 15, BAR_Y + BAR_H + 4);
    }
    // The clock.
    if (f.mode === 'bonus' || f.fighters[1]) {
      const time = String(f.timer).padStart(2, '0');
      const low = f.timer <= 10 && f.phase === 'fight';
      drawDisplay(ctx, time, kx, BAR_Y + 16, 18, low ? STYLE.timerLow : STYLE.timer, low ? 'timerLow' : 'timer');
    }
  }

  function scores(ctx: CanvasRenderingContext2D, v: FightView): void {
    label(ctx, v.sides[0], 14, 4, '#60c8f8');
    label(ctx, String(v.score).padStart(8, ' '), 14 + textWidth(v.sides[0]) + 4, 4, '#f8f8f8');
    if (v.hi >= 0) {
      label(ctx, 'HI', SCREEN_W / 2 - 30, 4, '#f8a030');
      label(ctx, String(v.hi).padStart(8, ' '), SCREEN_W / 2 - 16, 4, '#f8f8f8');
    }
    label(ctx, v.sides[1], SCREEN_W - 14, 4, '#f86868', 'right');
  }

  function calls(ctx: CanvasRenderingContext2D, v: FightView): void {
    const c = v.call;
    if (!c) return;
    const y = 72;
    switch (c.kind) {
      case 'round': {
        const h = c.t < 4 ? 40 - c.t * 3 : 28;
        drawDisplay(ctx, c.text, SCREEN_W / 2, y + (28 - h) / 2, h, STYLE.round, 'round');
        break;
      }
      case 'fight': {
        const h = c.t < 6 ? 68 - c.t * 4 : 44;
        drawDisplay(ctx, c.text, SCREEN_W / 2, y - 8 + (44 - h) / 2, h, STYLE.fight, 'fight');
        break;
      }
      case 'ko': {
        if (c.t % 16 < 12 || c.t > 50) {
          const h = c.t < 4 ? 72 - c.t * 6 : 50;
          drawDisplay(ctx, c.text, SCREEN_W / 2, y - 4 + (50 - h) / 2, h, STYLE.ko, 'ko');
        }
        break;
      }
      case 'result': {
        const lose = c.text === 'YOU LOSE';
        const ko = c.text.includes('K.O.');
        drawDisplay(ctx, c.text, SCREEN_W / 2, y, 30, ko ? STYLE.ko : lose ? STYLE.red : STYLE.gold, ko ? 'ko' : lose ? 'red' : 'gold');
        break;
      }
      case 'small':
        drawDisplay(ctx, c.text, SCREEN_W / 2, y + 10, 20, STYLE.blue, 'blue');
        break;
    }
  }

  function tally(ctx: CanvasRenderingContext2D, v: FightView): void {
    const t = v.tally;
    if (!t || t.t < 40 || (v.fight.phase !== 'roundEnd' && v.fight.phase !== 'matchEnd')) return;
    const L = v.labels;
    const rows: [string, number][] = [
      [L.timeBonus, t.time],
      [L.vitalBonus, t.vitality]
    ];
    if (t.perfect) rows.push([L.perfectBonus, t.perfect]);
    rows.forEach(([name, n], i) => {
      if (t.t - 40 < i * 20) return;
      const shown = Math.min(n, Math.floor(((t.t - 40 - i * 20) / 40) * n));
      const y = 116 + i * 20;
      label(ctx, name, 72, y, '#f8f8f8', 'left', 2, '#101040');
      label(ctx, String(Math.max(0, shown)), 312, y, '#f8d818', 'right', 2, '#402000');
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
      for (const p of f.projectiles) projectile(ctx, p, f.camera);
      for (const s of v.sparks) spark(ctx, s, f, f.camera, v.clock);
      for (const fl of v.floaters) {
        const x = Math.round(fl.x - f.camera + SCREEN_W / 2);
        const y = Math.round(FLOOR_Y - fl.y - fl.t * 0.6);
        if (fl.t < 50 || fl.t % 4 < 2) drawTextCentred(ctx, fl.text, x, y, { color: fl.colour, outline: '#100808', shadow: { color: '#000000', dx: 1, dy: 1 } });
      }
      ctx.restore();
      healthBars(ctx, v);
      scores(ctx, v);
      if (v.combo && v.combo.t < 70 && (v.combo.t > 50 ? v.combo.t % 4 < 2 : true)) {
        const side = v.combo.side;
        const text = `${v.combo.hits} HITS`;
        drawDisplay(ctx, text, side === 0 ? 16 : SCREEN_W - 16, 56, 13, STYLE.combo, 'combo', side === 0 ? 'left' : 'right');
      }
      calls(ctx, v);
      tally(ctx, v);
      if (f.mode === 'bonus' && f.phase !== 'fight' && f.phase !== 'roundEnd' && v.call?.kind !== 'fight') drawDisplay(ctx, v.labels.bonusStage, SCREEN_W / 2, 66, 24, STYLE.blue, 'blue');
      if (v.bonusResult && v.bonusResult.t > 30) {
        const cleared = v.bonusResult.cleared;
        drawDisplay(ctx, cleared ? 'PERFECT' : 'TIME OVER', SCREEN_W / 2, 70, 30, cleared ? STYLE.gold : STYLE.red, cleared ? 'gold' : 'red');
        if (cleared) {
          label(ctx, v.labels.clearBonus, 72, 120, '#f8f8f8', 'left', 2, '#101040');
          label(ctx, String(v.bonusResult.bonus), 312, 120, '#f8d818', 'right', 2, '#402000');
        }
      }
      void BONUS_TIME;
    },

    title(ctx, clock, labels) {
      ctx.drawImage(titleBackdrop(), 0, 0);
      drawDisplay(ctx, 'STREET', SCREEN_W / 2 - 4, 30, 30, { ...STYLE.chrome, italic: 0.18 }, 'logoStreet');
      // The brush stroke behind the big word.
      ctx.drawImage(swoosh(), 18, 104);
      drawDisplay(ctx, 'CHAMPION', SCREEN_W / 2, 70, 44, { ...STYLE.fire, italic: 0.12 }, 'logoChampion');
      label(ctx, 'WORLD TOUR 1991', SCREEN_W / 2, 136, '#f8e8b0', 'centre', 1, '#401000');
      // A glint running across the logo.
      const g = (clock * 5) % 520;
      if (g < 360) for (let i = 0; i < 6; i++) rect(ctx, 12 + g - i * 2, 74 + i * 7, 2, 6, '#ffffff');
      if (clock % 60 < 40) label(ctx, labels.pressStart, SCREEN_W / 2, 170, '#f8f8f8', 'centre', 2, '#101040');
    },

    select(ctx, s, clock, labels) {
      ctx.drawImage(mapCanvas(), 0, 0);
      // The map stays bright up top; the grid sits on a darkened band below.
      checker(ctx, 0, 94, SCREEN_W, SCREEN_H - 94, '#000000');
      checker(ctx, 1, 95, SCREEN_W, SCREEN_H - 95, '#000010');
      drawDisplay(ctx, labels.select, SCREEN_W / 2, 6, 14, STYLE.blue, 'blue');
      // Flags pinned where each fighter comes from; the hovered one waves.
      const hovered = [SELECTABLE[s.cursor[0]] ?? null, s.mode === 'versus' ? SELECTABLE[s.cursor[1]] ?? null : null];
      const homes = new Set<HomeId>();
      for (const id of SELECTABLE) homes.add(FIGHTERS[id].home);
      for (const h of homes) {
        const [x, y] = project(HOMES[h]);
        const hot = hovered.some(id => id && FIGHTERS[s.chosen[hovered.indexOf(id)] ?? id].home === h);
        pin(ctx, x, y, h, hot && clock % 20 < 14, hot);
      }
      // The grid: two rows of four portraits.
      const size = 40;
      const pitch = size + 6;
      const gx = Math.round(SCREEN_W / 2 - (4 * pitch - 8) / 2);
      const gy = 112;
      SELECTABLE.forEach((id, i) => {
        const x = gx + (i % 4) * pitch;
        const y = gy + Math.floor(i / 4) * (size + 12);
        card(ctx, id, false, x, y, size, 'calm', false, '#9a8a70');
      });
      const players: (0 | 1)[] = s.mode === 'versus' ? [0, 1] : [0];
      const same = s.mode === 'versus' && s.cursor[0] === s.cursor[1];
      for (const p of players) {
        const c = s.cursor[p];
        const x = gx + (c % 4) * pitch;
        const y = gy + Math.floor(c / 4) * (size + 12);
        const col = p === 0 ? '#3890f8' : '#f83838';
        const hiCol = p === 0 ? '#a8e0ff' : '#ffb0a0';
        const inset = same && p === 1 ? 2 : 0;
        if (s.chosen[p] || clock % 16 < 12) {
          for (let k = 0; k < 2; k++) {
            const o = 5 - k - inset;
            const colour = k === 0 ? col : hiCol;
            rect(ctx, x - o, y - o, size + o * 2, 2 - k, colour);
            rect(ctx, x - o, y + size + o - 2 + k, size + o * 2, 2 - k, colour);
            rect(ctx, x - o, y - o, 2 - k, size + o * 2, colour);
            rect(ctx, x + size + o - 2 + k, y - o, 2 - k, size + o * 2, colour);
          }
        }
        // The player tag, above for 1P and below for 2P.
        const ty = p === 0 ? y - 16 : y + size + 7;
        const tx = x + (p === 0 ? 0 : size - 15);
        rect(ctx, tx - 1, ty - 1, 17, 11, '#000000');
        rect(ctx, tx, ty, 15, 9, col);
        rect(ctx, tx, ty, 15, 1, hiCol);
        label(ctx, p === 0 ? '1P' : '2P', tx + 2, ty + 1, '#ffffff', 'left', 1, mix(col, '#000000', 0.5));
        // The big portrait of whoever the cursor is on.
        const id = s.chosen[p] ?? SELECTABLE[c];
        const big = 84;
        const bx = p === 0 ? 8 : SCREEN_W - 8 - big;
        card(ctx, id, s.alt[p], bx, 104, big, s.chosen[p] ? 'shout' : 'calm', p === 1, col);
        drawDisplay(ctx, FIGHTERS[id].name, bx + big / 2, 198, 12, p === 0 ? STYLE.chrome : STYLE.red, p === 0 ? 'chrome' : 'red', 'centre', big + 16);
        const home = FIGHTERS[id].home;
        const flag = flagFor(home);
        ctx.drawImage(flag.canvas, p === 0 ? bx + big - 16 : bx, 104 + big - 12);
      }
      if (s.mode === 'versus') drawDisplay(ctx, labels.versusMode, SCREEN_W / 2, 30, 12, STYLE.red, 'red');
      else {
        const id = s.chosen[0] ?? SELECTABLE[s.cursor[0]];
        const home = FIGHTERS[id].home;
        const flag = flagFor(home, 2);
        const fx = SCREEN_W - 8 - 42;
        ctx.drawImage(flag.canvas, fx - 17, 120);
        label(ctx, HOMES[home].country, fx, 150, '#f8d818', 'centre', 2, '#301000');
        drawDisplay(ctx, String(s.selectTimer).padStart(2, '0'), fx, 168, 22, s.selectTimer <= 5 ? STYLE.timerLow : STYLE.timer, s.selectTimer <= 5 ? 'timerLow' : 'timer');
      }
    },

    map(ctx, s, clock) {
      ctx.drawImage(mapCanvas(), 0, 0);
      const me = s.chosen[0] as CharId;
      const opp = s.ladder[s.stage];
      // Every fighter already beaten is a crossed-out flag on the map.
      s.ladder.slice(0, s.stage).forEach(id => {
        const [x, y] = project(HOMES[FIGHTERS[id].home]);
        pin(ctx, x, y, FIGHTERS[id].home, false, false);
        for (let i = -4; i <= 4; i++) {
          rect(ctx, x + i - 1, y - 14 + i, 3, 2, '#000000');
          rect(ctx, x - i - 1, y - 14 + i, 3, 2, '#000000');
        }
        for (let i = -3; i <= 3; i++) {
          rect(ctx, x + i, y - 14 + i, 1, 1, '#f82020');
          rect(ctx, x - i, y - 14 + i, 1, 1, '#f82020');
        }
      });
      const fromHome = FIGHTERS[s.stage === 0 ? me : s.ladder[s.stage - 1]].home;
      const from = project(HOMES[fromHome]);
      const to = project(HOMES[FIGHTERS[opp].home]);
      const p = Math.min(1, s.frame / 110);
      const arc = (q: number): [number, number] => [from[0] + (to[0] - from[0]) * q, from[1] + (to[1] - from[1]) * q - Math.sin(q * Math.PI) * 20];
      // The route: a dashed line marching toward the destination.
      for (let i = 0; i < 60; i++) {
        const q = i / 60;
        if (q > p) break;
        if ((i + (clock >> 2)) % 3 === 0) continue;
        const [x, y] = arc(q);
        rect(ctx, x - 1, y - 1, 3, 3, '#000000');
        rect(ctx, x, y, 2, 2, '#f8f070');
      }
      // The destination pulses.
      const ring = (clock % 30) / 30;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        rect(ctx, to[0] + Math.cos(a) * (3 + ring * 10), to[1] + Math.sin(a) * (2 + ring * 6), 1, 1, ring < 0.6 ? '#ffffff' : '#f86060');
      }
      pin(ctx, to[0], to[1], FIGHTERS[opp].home, clock % 20 < 14, true);
      const [px, py] = arc(p);
      const plane = planeArt(to[0] < from[0]);
      blit(ctx, plane, px, py);
      // The plane's shadow on the map below it.
      if (p < 1) checker(ctx, px - 10, py + 16 - Math.sin(p * Math.PI) * 6, 20, 2, '#000000');
      // The opponent's card, his name and his country, on a plate along the bottom.
      panel(ctx, 0, 176, SCREEN_W, 48, '#101830');
      card(ctx, opp, false, SCREEN_W - 66, 152, 56, 'calm', true, '#f83838');
      drawDisplay(ctx, FIGHTERS[opp].name, SCREEN_W - 78, 184, 16, STYLE.red, 'red', 'right');
      const flag = flagFor(FIGHTERS[opp].home);
      label(ctx, HOMES[FIGHTERS[opp].home].country, SCREEN_W - 78, 206, '#f8d818', 'right', 1, '#301000');
      ctx.drawImage(flag.canvas, SCREEN_W - 78 - textWidth(HOMES[FIGHTERS[opp].home].country) - 22, 204);
      drawDisplay(ctx, `STAGE ${s.stage + 1}`, 14, 184, 14, STYLE.gold, 'gold', 'left');
      label(ctx, `${s.stage + 1} / ${s.ladder.length}`, 16, 206, '#c8d0f8', 'left');
    },

    versus(ctx, s, clock) {
      ctx.drawImage(versusBackdrop(), 0, 0);
      const a = s.chosen[0] as CharId;
      const b = (s.mode === 'versus' ? s.chosen[1] : s.ladder[s.stage]) as CharId;
      // Fetch both fighters' sheets while the VS screen holds, so the fight opens on them.
      sheetFor(a, false);
      sheetFor(b, a === b);
      const slide = Math.max(0, 40 - s.frame) * 5;
      // Speed streaks pouring toward the middle.
      for (let i = 0; i < 14; i++) {
        const y = 12 + i * 15 + (i % 3) * 2;
        const len = 30 + Math.round(hash(i * 3) * 50);
        const off = (clock * (3 + (i % 3)) + i * 37) % 220;
        rect(ctx, off - len, y, len, 1, '#6080f0');
        rect(ctx, SCREEN_W - off, y + 6, len, 1, '#f06060');
      }
      card(ctx, a, s.alt[0], 22 - slide, 34, 128, 'calm', false, '#3890f8');
      card(ctx, b, s.mode === 'versus' ? s.alt[1] : false, SCREEN_W - 22 - 128 + slide, 34, 128, 'calm', true, '#f83838');
      drawDisplay(ctx, FIGHTERS[a].name, 22 + 64 - slide, 176, 18, STYLE.chrome, 'chrome', 'centre', 150);
      drawDisplay(ctx, FIGHTERS[b].name, SCREEN_W - 22 - 64 + slide, 176, 18, STYLE.red, 'red', 'centre', 150);
      const fa = flagFor(FIGHTERS[a].home);
      const fb = flagFor(FIGHTERS[b].home);
      ctx.drawImage(fa.canvas, 22 + 64 - slide - 9, 200);
      ctx.drawImage(fb.canvas, SCREEN_W - 22 - 64 + slide - 9, 200);
      if (s.frame > 30) {
        const pop = s.frame < 36 ? 76 - (s.frame - 30) * 4 : 52;
        blit(ctx, vsBurst(), SCREEN_W / 2, 100);
        drawDisplay(ctx, 'VS', SCREEN_W / 2, 76 + (52 - pop) / 2 + (clock % 6 < 3 ? 0 : 1), pop, { ...STYLE.fire, italic: 0.2 }, 'vs');
      }
    },

    quote(ctx, s, clock, labels) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#060a18', '#0a1428', '#0e1c38', '#122448']);
      const f = s.fight as FightState;
      const w = (s.lastWinner ?? 0) as 0 | 1;
      const winner = f.fighters[w] as FighterState;
      const loser = f.fighters[w === 0 ? 1 : 0] as FighterState;
      card(ctx, winner.id, s.alt[w], 22, 20, 112, 'shout', false, '#f8d818');
      card(ctx, loser.id, s.mode === 'versus' ? s.alt[w === 0 ? 1 : 0] : false, SCREEN_W - 22 - 64, 20, 64, 'hurt', true, '#7a7a8a');
      drawDisplay(ctx, winner.def.name, 150, 26, 22, STYLE.gold, 'gold', 'left', 140);
      drawDisplay(ctx, 'WINS', 150, 56, 14, STYLE.chrome, 'chrome', 'left');
      ctx.drawImage(flagFor(winner.def.home, 2).canvas, 150, 84);
      label(ctx, HOMES[winner.def.home].country, 190, 94, '#f8d818', 'left', 1, '#301000');
      panel(ctx, 16, 146, SCREEN_W - 32, 64, '#081028');
      const lines = wrap(labels.quotes[winner.id], 54);
      const shown = Math.floor(s.frame * 1.2);
      let used = 0;
      lines.forEach((line, i) => {
        const part = line.slice(0, Math.max(0, shown - used));
        used += line.length;
        drawText(ctx, part, 26, 156 + i * 12, { color: '#f8f8f8', shadow: { color: '#000000', dx: 1, dy: 1 } });
      });
      if (shown >= used && clock % 30 < 18) rect(ctx, SCREEN_W - 30, 200, 6, 4, '#f8d818');
    },

    continueScreen(ctx, s, clock, labels, count) {
      bands(ctx, 0, 0, SCREEN_W, SCREEN_H, ['#000000', '#0c0206', '#18040a', '#240810']);
      // A spotlight on the beaten fighter.
      for (let y = 0; y < 150; y++) {
        const half = 30 + y * 0.45;
        if (y % 2 === 0) rect(ctx, SCREEN_W / 2 - half, y, half * 2, 1, '#28101a');
      }
      const me = s.chosen[0] as CharId;
      card(ctx, me, s.alt[0], SCREEN_W / 2 - 56, 30, 112, 'hurt', false, '#7a6a6a');
      drawDisplay(ctx, labels.continueQ, SCREEN_W / 2, 160, 22, STYLE.blue, 'blue');
      if (count >= 0) drawDisplay(ctx, String(count), SCREEN_W / 2, 190, 26, STYLE.ko, 'ko');
      void clock;
    },

    ending(ctx, s, art, clock, labels) {
      drawStage(ctx, art, 384, clock, 1);
      checker(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');
      const me = s.chosen[0] as CharId;
      card(ctx, me, s.alt[0], 24, 24, 96, 'shout', false, '#f8d818');
      drawDisplay(ctx, labels.congratulations, SCREEN_W / 2 + 46, 30, 20, STYLE.gold, 'gold', 'centre', 230);
      label(ctx, labels.ending, SCREEN_W / 2 + 46, 62, '#c8d8f8', 'centre');
      ctx.drawImage(flagFor(FIGHTERS[me].home, 2).canvas, SCREEN_W / 2 + 46 - 17, 80);
      panel(ctx, 16, 136, SCREEN_W - 32, 74, '#081028');
      const lines = wrap(labels.endings[me], 54);
      const shown = Math.floor(s.frame * 0.9);
      let used = 0;
      lines.forEach((line, i) => {
        const part = line.slice(0, Math.max(0, shown - used));
        used += line.length;
        drawText(ctx, part, 26, 146 + i * 12, { color: '#f8f8f8', shadow: { color: '#000000', dx: 1, dy: 1 } });
      });
    }
  };

  /** A flag on a pole planted at a map position. */
  function pin(ctx: CanvasRenderingContext2D, x: number, y: number, home: HomeId, wave: boolean, big: boolean): void {
    const flag = flagFor(home);
    rect(ctx, x - 1, y - 18, 3, 19, '#000000');
    rect(ctx, x, y - 17, 1, 18, '#f8f8f8');
    rect(ctx, x - 2, y, 5, 2, '#000000');
    ctx.drawImage(flag.canvas, x + 1, y - 18 + (wave ? 1 : 0));
    if (big) rect(ctx, x - 1, y - 20, 3, 2, '#f8d818');
  }

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

// --- Backdrops painted once ---------------------------------------------------------------

let titleBg: HTMLCanvasElement | null = null;
/** The title's night: a deep gradient, a sunburst behind the logo, a skyline along the foot. */
function titleBackdrop(): HTMLCanvasElement {
  if (titleBg) return titleBg;
  const b = new PixBuf(SCREEN_W, SCREEN_H);
  const cx = SCREEN_W / 2;
  const cy = 86;
  const stops = ['#04020c', '#0a0618', '#180828', '#2a0c2c', '#3c1028'];
  for (let y = 0; y < SCREEN_H; y++)
    for (let x = 0; x < SCREEN_W; x++) {
      const t = (y / SCREEN_H) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t));
      let c = t - i > bayer(x, y) ? stops[i + 1] : stops[i];
      const ang = Math.atan2(y - cy, x - cx);
      const d = Math.hypot(x - cx, (y - cy) * 1.6);
      if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 32) % 2 === 0 && d < 260 && bayer(x, y) > d / 300) c = mix(c, '#902030', 0.45 * (1 - d / 300));
      b.set(x, y, rgb(c));
    }
  // Stars.
  for (let i = 0; i < 70; i++) b.set(Math.floor(hash(i) * SCREEN_W), Math.floor(hash(i + 3) * 150), rgb(i % 5 ? '#605890' : '#e0d8ff'));
  // A city skyline in silhouette.
  let x = 0;
  let k = 0;
  while (x < SCREEN_W) {
    const w = 10 + Math.floor(hash(k * 3.3) * 22);
    const h = 14 + Math.floor(hash(k * 7.1) * 34);
    b.rect(x, SCREEN_H - h, w, h, rgb('#0c0610'));
    for (let wy = SCREEN_H - h + 4; wy < SCREEN_H - 4; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (hash(wx * 1.7 + wy * 3.1) > 0.7) b.rect(wx, wy, 2, 2, rgb('#c89838'));
    x += w + 1;
    k++;
  }
  b.rect(0, SCREEN_H - 6, SCREEN_W, 6, rgb('#08040a'));
  titleBg = b.toCanvas();
  return titleBg;
}

let swooshArt: HTMLCanvasElement | null = null;
/** A ragged brush stroke of red under CHAMPION. */
function swoosh(): HTMLCanvasElement {
  if (swooshArt) return swooshArt;
  const W = SCREEN_W - 36;
  const b = new PixBuf(W, 26);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const thick = Math.max(0, Math.sin(t * Math.PI) ** 0.6 * 15 + (hash(x * 0.3) - 0.5) * 3);
    const top = 13 - thick / 2 + (t - 0.5) * 8;
    for (let y = Math.floor(top); y < top + thick; y++) {
      const f = (y - top) / Math.max(1, thick);
      if (t > 0.85 && bayer(x, y) < (t - 0.85) * 7) continue;
      if (t < 0.08 && bayer(x, y) < (0.08 - t) * 12) continue;
      b.set(x, y, rgb(f < 0.25 ? '#f86040' : f < 0.7 ? '#c81810' : '#780808'));
    }
  }
  swooshArt = b.toCanvas();
  return swooshArt;
}

let versusBg: HTMLCanvasElement | null = null;
/** Blue for the left side, red for the right, split on a slant. */
function versusBackdrop(): HTMLCanvasElement {
  if (versusBg) return versusBg;
  const b = new PixBuf(SCREEN_W, SCREEN_H);
  const blue = ['#040820', '#081438', '#0c2050', '#081438'];
  const red = ['#200408', '#380810', '#501018', '#380810'];
  for (let y = 0; y < SCREEN_H; y++)
    for (let x = 0; x < SCREEN_W; x++) {
      const split = SCREEN_W / 2 + (y - SCREEN_H / 2) * 0.35;
      const pal = x < split ? blue : red;
      const t = (y / SCREEN_H) * (pal.length - 1);
      const i = Math.min(pal.length - 2, Math.floor(t));
      let c = t - i > bayer(x, y) ? pal[i + 1] : pal[i];
      if (Math.abs(x - split) < 2) c = '#f8f0c8';
      else if (Math.abs(x - split) < 4) c = '#000000';
      b.set(x, y, rgb(c));
    }
  versusBg = b.toCanvas();
  return versusBg;
}

let burstArt: { canvas: HTMLCanvasElement; ax: number; ay: number } | null = null;
/** The starburst the VS mark sits on. */
function vsBurst(): { canvas: HTMLCanvasElement; ax: number; ay: number } {
  if (burstArt) return burstArt;
  const D = 120;
  const b = new PixBuf(D, D);
  const c = D / 2;
  const star = (r0: number, r1: number, col: string) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = i % 2 ? r0 : r1 * (0.8 + hash(i) * 0.3);
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r * 0.8]);
    }
    b.poly(pts, rgb(col));
  };
  star(32, 58, '#000000');
  star(30, 55, '#f8e8a0');
  star(26, 48, '#f8b020');
  star(20, 36, '#e85010');
  b.ellipse(c, c, 22, 17, rgb('#a01808'));
  burstArt = { canvas: b.toCanvas(), ax: c, ay: c };
  return burstArt;
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
  [[96, 5], [105, -6], [122, -8], [118, -3], [104, 0]],
  // Madagascar, New Zealand
  [[44, -16], [50, -15], [48, -25], [44, -24]],
  [[172, -35], [178, -38], [174, -46], [167, -46]]
];

/** Smooth noise in [0, 1) on a coarse grid, for the land's relief. */
function relief(x: number, y: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const n = (i: number, j: number) => hash(i * 12.9 + j * 78.2);
  const a = n(gx, gy) * (1 - fx) + n(gx + 1, gy) * fx;
  const b = n(gx, gy + 1) * (1 - fx) + n(gx + 1, gy + 1) * fx;
  return a * (1 - fy) + b * fy;
}

function paintWorld(): HTMLCanvasElement {
  const W = SCREEN_W;
  const H = SCREEN_H;
  const land = new PixBuf(W, H);
  for (const shape of CONTINENTS) land.poly(shape.map(([lon, lat]) => project({ lon, lat })), 1);
  const isLand = (x: number, y: number) => land.get(x, y) !== 0;
  const near = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && isLand(x + dx, y + dy)) return true;
    return false;
  };
  const b = new PixBuf(W, H);
  const sea = ['#082058', '#0c2a70', '#103482', '#0c2a70', '#082058'];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isLand(x, y)) {
        const lat = LAT0 - ((y - MAP_Y) / MAP_H) * (LAT0 - LAT1);
        const lon = LON0 + (x / W) * (LON1 - LON0);
        const r = relief(x, y, 9) * 0.65 + relief(x, y, 4) * 0.35;
        const coast = !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1);
        let c: string;
        const desert = (lat > 14 && lat < 34 && lon > -15 && lon < 60) || (lat < -18 && lat > -32 && lon > 118 && lon < 145) || (lat > 26 && lat < 40 && lon > -118 && lon < -100);
        if (lat > 64 || lat < -48) c = r > 0.5 ? '#f8f8f8' : '#d0e0f0';
        else if (desert) c = r > 0.6 ? '#e8d090' : r > 0.35 ? '#d0b070' : '#b89858';
        else if (r > 0.72) c = '#a08050';
        else if (r > 0.55) c = '#4a8a30';
        else if (r > 0.3) c = '#60a838';
        else c = '#78c048';
        if (!coast && lat < 64 && !desert && r > 0.6 && r < 0.72 && bayer(x, y) > 0.5) c = '#3a7028';
        if (coast) c = '#20401a';
        else if (!isLand(x, y - 2) || !isLand(x - 2, y)) c = mix(c, '#ffffff', 0.25);
        b.set(x, y, rgb(c));
        continue;
      }
      const t = (y / H) * (sea.length - 1);
      const i = Math.min(sea.length - 2, Math.floor(t));
      let c = t - i > bayer(x, y) ? sea[i + 1] : sea[i];
      if (near(x, y, 2)) c = '#2a64c0';
      else if (near(x, y, 4) && (x + y) % 2 === 0) c = '#1a4aa0';
      else if ((y - MAP_Y) % 20 === 0 && x % 3 === 0) c = '#2858b0';
      else if (x % 32 === 0 && y % 3 === 0 && y > MAP_Y && y < MAP_Y + MAP_H) c = '#2858b0';
      else if (hash(x * 0.71 + y * 13.3) > 0.985) c = '#3a70c8';
      b.set(x, y, rgb(c));
    }
  return b.toCanvas();
}

/** The project helper for tests. */
export const projectHome = project;

