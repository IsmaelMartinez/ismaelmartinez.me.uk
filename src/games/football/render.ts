/**
 * CALCIO '90's presentation layer: everything the cabinet puts on screen.
 *
 * The renderer owns a single offscreen **320 x 224 framebuffer** (the Mega
 * Drive's H40 mode) with `imageSmoothingEnabled = false`. One world unit is
 * one framebuffer pixel, so the simulation's coordinates are drawn straight
 * through with only the camera subtracted, and `blit()` copies the whole
 * framebuffer to the visible canvas at an **integer scale factor** — the one
 * and only draw the page-level context performs. Nothing is ever drawn at a
 * fractional coordinate, which is what keeps the pixels chunky and identical
 * at every screen size.
 *
 * The pitch, its mown bands, the goals and the terrace crowd are baked once
 * into a world-sized `createStaticLayer` and blitted at the camera offset;
 * per-frame work is players, ball, HUD and text. The camera itself is
 * presentation state, so it lives here and is stepped from `pitch.ts`'s pure
 * `cameraFor` — `game.ts` only passes `dt`.
 *
 * Import-safe in node: nothing touches `document` until `createRenderer()`.
 */
import { blink, createStaticLayer, hash01, type StaticLayer } from '../engine/canvas';
import { clamp } from '../engine/math';
import {
  BOX_DEPTH,
  BOX_HALF,
  CAMERA_MAX_X,
  CAMERA_MAX_Y,
  CAMERA_MIN_X,
  CAMERA_MIN_Y,
  CENTRE_R,
  CENTRE_X,
  CENTRE_Y,
  CORNER_R,
  GOAL_DEPTH,
  GOAL_HALF,
  GOAL_LEFT,
  PENALTY_SPOT,
  PITCH_L,
  PITCH_W,
  SIX_DEPTH,
  SIX_HALF,
  TEAM_SIZE,
  VIEW_H,
  VIEW_W,
  attackDir,
  attackGoalY,
  cameraFor,
  type Camera,
  type Side
} from './pitch';
import {
  drawText,
  drawTextCentred,
  drawTextRight,
  textWidth
} from './font';
import {
  BALL_MIN,
  CROWD_COLOURS,
  PALETTE,
  PLAYER_H,
  PLAYER_W,
  SLIDE_H,
  SLIDE_W,
  DIVE_H,
  DIVE_W,
  MARKER_SIZE,
  SHADOW_W,
  TRIANGLE_W,
  ballSize,
  createSpriteSheet,
  facingIndex,
  type ACue,
  type PlayerSprites,
  type SpriteSheet
} from './sprites';
import {
  ALL_TEAMS,
  KEEPER_KITS,
  SECRET_TEAM,
  TEAMS,
  type Kit,
  type Team
} from './teams';
import type { MatchState, PlayerState } from './match';
import { SHOOT_RANGE, canAirStrike, scorerList } from './match';
import { DIVE_WINDOW, SHOOTOUT_ZONES, type ShootoutState } from './shootout';
import { standings, type RunState, type TableRow } from './tournament';

export { PALETTE, CROWD_COLOURS } from './sprites';

/** Mega Drive H40: the framebuffer everything is drawn into. */
export const FB_W = 320;
export const FB_H = 224;
/** The HUD column occupies the right-hand 72 px; the playfield is the rest. */
export const HUD_X = VIEW_W;
export const HUD_W = FB_W - VIEW_W;

/**
 * The largest whole multiple of the framebuffer that fits `availW x availH`
 * **device** pixels, never below 1.
 *
 * This is the whole of the integer-blit contract and it is stated in device
 * pixels on purpose. Sizing the canvas in CSS pixels and letting the browser
 * scale the backing store is what broke it before: a 960-wide backing store
 * displayed in a 716 px box is a 0.746x nearest-neighbour *downscale*, and a
 * quarter of the framebuffer's rows and columns simply vanish — visible as
 * uneven stems on the wordmark and the HUD. `game.ts` feeds this the container
 * width times `devicePixelRatio`, sizes the backing store to the scale it
 * returns, and sets the CSS box to exactly that many device pixels, so one
 * framebuffer pixel is always the same square block of screen.
 */
export function integerScale(availW: number, availH: number, dpr: number): number {
  const wide = Math.floor((availW * dpr) / FB_W);
  const tall = Math.floor((availH * dpr) / FB_H);
  return Math.max(1, Math.min(wide, tall));
}

/** Terrace baked around the pitch, which is also the camera's slack. */
export const LAYER_MARGIN = 40;
export const LAYER_W = PITCH_W + LAYER_MARGIN * 2;
export const LAYER_H = PITCH_L + LAYER_MARGIN * 2;

/** Radar geometry, per 8.4. */
const RADAR = { x: 254, y: 68, w: 56, h: 104 };
const RADAR_FRAME = { x: 252, y: 66, w: 60, h: 120 };

/** Chalk is 2 px: the original's 4-5 px slabs are what looks crude at this zoom. */
const MARK = 2;

const SIDES: readonly Side[] = [0, 1];

/**
 * True when the A button under the player's thumb is a **shot** rather than a
 * clearance: he is the man on the ball, and the goal he is attacking is inside
 * `SHOOT_RANGE`.
 *
 * The rule itself is section 5.3's A-quirk and is faithful — outside range, A
 * hoofs the ball up-pitch and usually gives it away. What was missing was any
 * way to know which press you were about to make until you had made it, so
 * this predicate drives two things the cabinet already drew: the marker at the
 * controlled player's feet and the HUD's attacking arrow, both of which go red
 * while a shot is armed. Nothing modern goes on the pitch — no aiming arc, no
 * range circle.
 *
 * It is exported because it must not be allowed to drift from `humanAction`'s
 * own branch in match.ts; a test pins the two together.
 */
export function shotArmed(m: MatchState): boolean {
  const owner = m.owner;
  if (!owner || owner.side !== 0 || owner.idx !== m.controlled) return false;
  const p = m.players[0][owner.idx];
  return Math.hypot(p.x - CENTRE_X, p.y - attackGoalY(0, m.swapped)) <= SHOOT_RANGE;
}

/**
 * True when the A button under the player's thumb is a **header or volley**
 * rather than a slide tackle: nobody is on the ball, it is in the air at a
 * height this man can meet, and he is inside the meeting radius.
 *
 * This is the other half of the same idea as `shotArmed`, and it was the half
 * that was missing. Delivering a cross, running in and pressing A was a guess
 * — the reward is a strike on goal and the forfeit is a slide tackle and its
 * cooldown, with nothing on screen saying which press you were about to make.
 * The window is short, only `CROSS_STRIKE_R` wide, and it closes the instant
 * anybody touches the ball, so it is exactly the boundary a cue is for. The
 * marker at the man's feet and the HUD arrow both go sky blue while it is
 * open, which is the same two things `shotArmed` already turns red; nothing
 * modern goes on the pitch for it either.
 *
 * It delegates to `canAirStrike` rather than restating it, because a cue that
 * disagrees with the branch it cues is worse than no cue: a test sweeps the
 * two together over the whole box.
 */
export function airArmed(m: MatchState): boolean {
  return canAirStrike(m, 0, m.controlled);
}

/**
 * Which of the marker's three colours this frame earns. There is no tie to
 * break: `shotArmed` wants the ball at the man's feet and `airArmed` wants it
 * loose and off the deck.
 */
export function aCue(m: MatchState): ACue {
  if (shotArmed(m)) return 'shot';
  return airArmed(m) ? 'air' : 'idle';
}

/**
 * Every word the renderer draws itself. Defaults are the cabinet's arcade
 * English; `game.ts` can override any of them with a localised string, which
 * is why the font carries accented capitals.
 */
export interface RenderText {
  kickoff: string;
  goal: string;
  throwIn: string;
  corner: string;
  goalKick: string;
  halfTime: string;
  fullTime: string;
  paused: string;
  pressStart: string;
  selectTeam: string;
  score: string;
  best: string;
  group: string;
  tables: string;
  columns: string;
  through: string;
  penalties: string;
  gameOver: string;
  champions: string;
  semiFinal: string;
  final: string;
  bracket: string;
  yes: string;
  no: string;
  ratings: readonly [string, string, string, string];
  shootout: string;
  suddenDeath: string;
  credit: string;
  wordmark: string;
  /** Blinked over the attract-mode demo: the cabinet asking for a player. */
  attract: string;
  /** Banner for the flourish when the hidden team is unlocked. */
  unlocked: string;
}

export const DEFAULT_TEXT: RenderText = {
  kickoff: 'KICKOFF',
  goal: 'GOAL!',
  throwIn: 'THROW IN',
  corner: 'CORNER KICK',
  goalKick: 'GOAL KICK',
  halfTime: 'HALF TIME',
  fullTime: 'FULL TIME',
  paused: 'PAUSED',
  pressStart: 'PRESS START',
  selectTeam: 'SELECT TEAM',
  score: 'SCORE',
  best: 'BEST',
  group: 'GROUP',
  tables: 'GROUP TABLES',
  columns: 'P  W  D  L  GD PTS',
  through: 'THROUGH',
  penalties: 'PENALTIES',
  gameOver: 'GAME OVER',
  champions: 'CHAMPIONS',
  semiFinal: 'SEMI FINAL',
  final: 'FINAL',
  bracket: 'KNOCKOUT',
  yes: 'YES',
  no: 'NO',
  ratings: ['SPD', 'SKL', 'DEF', 'GK'],
  shootout: 'PENALTIES',
  suddenDeath: 'SUDDEN DEATH',
  credit: 'A PIXEL FOOTBALL CABINET',
  wordmark: "CALCIO '90",
  attract: 'PRESS SPACE TO PLAY',
  unlocked: 'SECRET TEAM UNLOCKED'
};

/* ------------------------------------------------------------------ */
/* view models                                                         */

export interface MatchView {
  /** Real seconds since the last frame; drives the camera and the run cycle. */
  dt: number;
  runScore: number;
  best: number;
  /** Overrides the banner word derived from the match phase. */
  banner?: string | null;
  /**
   * The stick's lateral deflection this frame. Only the corner markers read
   * it, to highlight the one a release would pick; the thresholds mirror
   * match.ts's `pickMarker` so the highlight cannot lie about the outcome.
   */
  aimX?: number;
  /**
   * True while this match is the attract-mode demo: the HUD stays live and the
   * blinking `PRESS SPACE TO PLAY` strip goes over the playfield.
   */
  attract?: boolean;
}

export interface TitleView {
  /** Seconds since the screen appeared; the cursor blinks off it. */
  clock: number;
}

export interface TeamSelectView {
  clock: number;
  /** Index into the visible roster, 0..11 — or 12 once the secret side is in. */
  cursor: number;
  /** True once the stats box with YES / NO is open. */
  confirming: boolean;
  /** Which of YES / NO the stick is on. */
  confirmYes: boolean;
  /** True once the Konami code has put the thirteenth side on the grid. */
  unlocked?: boolean;
  /** Seconds left on the unlock flourish; 0 or absent draws no banner. */
  unlockFlash?: number;
}

/**
 * The live effect arrays, exactly as `createEffects` exposes them. The
 * renderer takes the physics from the engine and does its own rasterising —
 * see {@link Renderer.drawEffects}.
 */
export interface EffectsView {
  readonly particles: ReadonlyArray<{
    x: number;
    y: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
  }>;
  readonly floaters: ReadonlyArray<{
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
  }>;
}

export interface TablesView {
  run: RunState;
  /** Headline above the tables, e.g. the matchday. */
  heading?: string;
}

export interface BracketView {
  run: RunState;
}

export interface ShootoutView {
  teams: [Team, Team];
  /** The strips the fixture was played in, so the taker keeps his shirt. */
  kits: [Kit, Kit];
}

export interface FullTimeView {
  match: MatchState;
  /** The word under the scorers: THROUGH, PENALTIES, GAME OVER… */
  outcome: string;
  runScore: number;
  best: number;
}

export interface ChampionView {
  team: Team;
  runScore: number;
  best: number;
}

export interface GameOverView {
  run: RunState;
  runScore: number;
  best: number;
}

export interface Renderer {
  /** The 320 x 224 framebuffer; `blit` is the only thing that should read it. */
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Camera top-left in world pixels; presentation state, stepped by drawMatch. */
  camera: Camera;
  /** Snap the camera onto the ball, for a kickoff or a new match. */
  resetCamera(m: MatchState): void;
  drawMatch(m: MatchState, view: MatchView): void;
  drawTitle(view: TitleView): void;
  drawTeamSelect(view: TeamSelectView): void;
  drawTables(view: TablesView): void;
  drawBracket(view: BracketView): void;
  drawShootout(s: ShootoutState, view: ShootoutView): void;
  drawFullTime(view: FullTimeView): void;
  drawChampion(view: ChampionView): void;
  drawGameOver(view: GameOverView): void;
  /**
   * Draw the engine's live particles and floaters into the framebuffer as
   * pixels: whole-pixel squares and bitmap-font words, no alpha, no system
   * font. See the method's own note for why the drawing is not the engine's.
   */
  drawEffects(fx: EffectsView): void;
  /** Dither the framebuffer down and stamp PAUSED over whatever is there. */
  drawPause(): void;
  /** Copy the framebuffer to a visible context at an integer scale. */
  blit(dest: CanvasRenderingContext2D, destW: number, destH: number): void;
}

export interface RendererOptions {
  text?: Partial<RenderText>;
}

/* ------------------------------------------------------------------ */
/* small drawing helpers                                               */

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A hollow rectangle of `t` px chalk, drawn inside the given bounds. */
function frame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  colour: string
): void {
  fill(ctx, x, y, w, t, colour);
  fill(ctx, x, y + h - t, w, t, colour);
  fill(ctx, x, y, t, h, colour);
  fill(ctx, x + w - t, y, t, h, colour);
}

/** Seconds of flicker at the end of a floater's life, in place of a fade. */
const FLOATER_FLICKER = 0.3;

/**
 * True when an effect in its last `window` seconds should be skipped this
 * frame. Alternating every second frame at 15 Hz is how the hardware faded a
 * sprite out — there is no alpha channel to fade with, and 8.1 forbids one.
 */
function dying(life: number, window: number): boolean {
  return life < window && Math.floor(life * 30) % 2 === 0;
}

/**
 * Plot a circle (or an arc) a pixel at a time. Canvas arcs anti-alias, which
 * is exactly what 8.1 forbids, so the markings are rasterised by hand.
 */
function arcPixels(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  colour: string,
  keep?: (dx: number, dy: number) => boolean
): void {
  ctx.fillStyle = colour;
  const half = thickness / 2;
  const lo = -Math.ceil(r + half);
  const hi = Math.ceil(r + half);
  for (let dy = lo; dy <= hi; dy++) {
    for (let dx = lo; dx <= hi; dx++) {
      const px = Math.floor(cx) + dx;
      const py = Math.floor(cy) + dy;
      const ox = px + 0.5 - cx;
      const oy = py + 0.5 - cy;
      if (Math.abs(Math.hypot(ox, oy) - r) > half) continue;
      if (keep && !keep(ox, oy)) continue;
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

/**
 * The goal net: a checkerboard of 2 x 2 blocks. Alternating single pixels
 * would average out to a flat grey at this size — the block is what reads as
 * a net from three metres away, which is why the original used one.
 */
function netChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string
): void {
  ctx.fillStyle = colour;
  for (let by = 0; by * 2 < h; by++) {
    for (let bx = by % 2; bx * 2 < w; bx += 2) {
      ctx.fillRect(x + bx * 2, y + by * 2, Math.min(2, w - bx * 2), Math.min(2, h - by * 2));
    }
  }
}

/** A 50 % single-pixel dither, which is how the pause screen dims. */
function dither50(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string
): void {
  ctx.fillStyle = colour;
  for (let py = 0; py < h; py++) {
    for (let px = py % 2; px < w; px += 2) {
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/**
 * A terrace crowd: 2 x 2 confetti blocks, seeded so the same faces are in the
 * same seats every run. Blocks rather than single pixels — one-pixel crowds
 * read as television static.
 */
function crowdBlocks(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  salt: number,
  density: number,
  skip?: (x: number, y: number) => boolean
): void {
  for (let by = 0; by * 2 < h; by++) {
    for (let bx = 0; bx * 2 < w; bx++) {
      const px = x0 + bx * 2;
      const py = y0 + by * 2;
      if (skip?.(px, py)) continue;
      const roll = hash01(by * 512 + bx, salt);
      if (roll > density) continue;
      ctx.fillStyle = CROWD_COLOURS[Math.floor((roll / density) * CROWD_COLOURS.length) % CROWD_COLOURS.length];
      ctx.fillRect(px, py, 2, 2);
    }
  }
}

/** A solid triangle from rows, so no path is ever anti-aliased. */
function triangleRows(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 'up' | 'down' | 'right',
  colour: string
): void {
  ctx.fillStyle = colour;
  if (dir === 'right') {
    for (let row = 0; row < h; row++) {
      const t = 1 - Math.abs(row - (h - 1) / 2) / ((h - 1) / 2 || 1);
      const len = Math.max(1, Math.round(w * t));
      ctx.fillRect(x, y + row, len, 1);
    }
    return;
  }
  for (let row = 0; row < h; row++) {
    const step = dir === 'up' ? row : h - 1 - row;
    const len = Math.max(1, Math.round((w * (step + 1)) / h));
    ctx.fillRect(Math.round(x + (w - len) / 2), y + row, len, 1);
  }
}

/** Black or white, whichever reads on a kit colour. */
function inkOn(colour: string): string {
  const r = parseInt(colour.slice(1, 3), 16);
  const g = parseInt(colour.slice(3, 5), 16);
  const b = parseInt(colour.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? PALETTE.black : PALETTE.white;
}

/* ------------------------------------------------------------------ */
/* the baked pitch                                                     */

/** World (x, y) to layer pixel. */
function lx(x: number): number {
  return x + LAYER_MARGIN;
}

function paintTerrace(ctx: CanvasRenderingContext2D): void {
  fill(ctx, 0, 0, LAYER_W, LAYER_H, PALETTE.terraceFloor);
  ctx.fillStyle = PALETTE.terraceStep;
  for (let y = 0; y < LAYER_H; y += 6) ctx.fillRect(0, y, LAYER_W, 1);
  // A fixed crowd, seeded so it is identical every run, and kept off the
  // pitch and the goals — everything the turf covers is painted over anyway.
  crowdBlocks(ctx, 0, 0, LAYER_W, LAYER_H, 17, 0.34, (x, y) =>
    x >= LAYER_MARGIN - 2 &&
    x < LAYER_MARGIN + PITCH_W + 2 &&
    y >= LAYER_MARGIN - GOAL_DEPTH - 4 &&
    y < LAYER_MARGIN + PITCH_L + GOAL_DEPTH + 4
  );
}

function paintTurf(ctx: CanvasRenderingContext2D): void {
  fill(ctx, LAYER_MARGIN, LAYER_MARGIN, PITCH_W, PITCH_L, PALETTE.grass);
  // Mown bands run goal to goal, 20 px wide; every other one is a 25 %
  // 2 x 2 checker of the darker green over the base.
  const BAND = 20;
  ctx.fillStyle = PALETTE.grassBand;
  for (let band = 0; band * BAND < PITCH_W; band++) {
    if (band % 2 === 0) continue;
    const x0 = band * BAND;
    const x1 = Math.min(PITCH_W, x0 + BAND);
    for (let y = 0; y < PITCH_L; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        ctx.fillRect(lx(x), lx(y), 1, 1);
      }
    }
  }
  // A fixed speckle over the whole turf, seeded from hash01. Kept sparse:
  // any denser and the noise swallows the mown bands it is meant to sit on.
  for (let y = 0; y < PITCH_L; y++) {
    for (let x = 0; x < PITCH_W; x++) {
      const roll = hash01(y * PITCH_W + x, 3);
      if (roll > 0.03) continue;
      ctx.fillStyle = roll > 0.015 ? PALETTE.speckleLight : PALETTE.speckleDark;
      ctx.fillRect(lx(x), lx(y), 1, 1);
    }
  }
}

function paintHalfMarkings(ctx: CanvasRenderingContext2D, goalY: number, dir: 1 | -1): void {
  const c = PALETTE.marking;
  // Goal line.
  fill(ctx, lx(0), lx(goalY - (dir === 1 ? 0 : MARK)), PITCH_W, MARK, c);
  // Penalty area: two sides and the front line.
  const boxFront = goalY + dir * BOX_DEPTH;
  fill(ctx, lx(CENTRE_X - BOX_HALF), lx(Math.min(goalY, boxFront)), MARK, BOX_DEPTH, c);
  fill(ctx, lx(CENTRE_X + BOX_HALF - MARK), lx(Math.min(goalY, boxFront)), MARK, BOX_DEPTH, c);
  fill(ctx, lx(CENTRE_X - BOX_HALF), lx(boxFront - (dir === 1 ? MARK : 0)), BOX_HALF * 2, MARK, c);
  // Six-yard box.
  const sixFront = goalY + dir * SIX_DEPTH;
  fill(ctx, lx(CENTRE_X - SIX_HALF), lx(Math.min(goalY, sixFront)), MARK, SIX_DEPTH, c);
  fill(ctx, lx(CENTRE_X + SIX_HALF - MARK), lx(Math.min(goalY, sixFront)), MARK, SIX_DEPTH, c);
  fill(ctx, lx(CENTRE_X - SIX_HALF), lx(sixFront - (dir === 1 ? MARK : 0)), SIX_HALF * 2, MARK, c);
  // Penalty spot and the arc outside the box.
  const spotY = goalY + dir * PENALTY_SPOT;
  fill(ctx, lx(CENTRE_X - 1), lx(spotY - 1), MARK, MARK, c);
  arcPixels(ctx, lx(CENTRE_X), lx(spotY), CENTRE_R, MARK, c, (_dx, dy) =>
    dir === 1 ? dy > BOX_DEPTH - PENALTY_SPOT : dy < -(BOX_DEPTH - PENALTY_SPOT)
  );
  // Goal frame and net, drawn outside the line.
  const netY = dir === 1 ? goalY - GOAL_DEPTH : goalY;
  fill(ctx, lx(GOAL_LEFT), lx(netY), GOAL_HALF * 2, GOAL_DEPTH, PALETTE.netFill);
  netChecker(ctx, lx(GOAL_LEFT), lx(netY), GOAL_HALF * 2, GOAL_DEPTH, PALETTE.netLine);
  frame(ctx, lx(GOAL_LEFT) - MARK, lx(netY) - (dir === 1 ? MARK : 0), GOAL_HALF * 2 + MARK * 2, GOAL_DEPTH + MARK, MARK, PALETTE.goalFrame);
}

function paintMarkings(ctx: CanvasRenderingContext2D): void {
  const c = PALETTE.marking;
  // Touchlines.
  fill(ctx, lx(0), lx(0), MARK, PITCH_L, c);
  fill(ctx, lx(PITCH_W - MARK), lx(0), MARK, PITCH_L, c);
  // Halfway line, centre circle and spot.
  fill(ctx, lx(0), lx(CENTRE_Y - MARK / 2), PITCH_W, MARK, c);
  arcPixels(ctx, lx(CENTRE_X), lx(CENTRE_Y), CENTRE_R, MARK, c);
  fill(ctx, lx(CENTRE_X - 1), lx(CENTRE_Y - 1), MARK, MARK, c);
  paintHalfMarkings(ctx, 0, 1);
  paintHalfMarkings(ctx, PITCH_L, -1);
  // Corner arcs and flags.
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 1, 1],
    [PITCH_W, 0, -1, 1],
    [0, PITCH_L, 1, -1],
    [PITCH_W, PITCH_L, -1, -1]
  ];
  for (const [cx, cy, sx, sy] of corners) {
    arcPixels(ctx, lx(cx), lx(cy), CORNER_R, MARK, c, (dx, dy) => dx * sx > 0 && dy * sy > 0);
    fill(ctx, lx(cx) - (sx > 0 ? 4 : -2), lx(cy) - (sy > 0 ? 5 : -1), 2, 4, PALETTE.flag);
  }
}

/* ------------------------------------------------------------------ */
/* renderer                                                            */

export function createRenderer(options: RendererOptions = {}): Renderer {
  const text: RenderText = { ...DEFAULT_TEXT, ...options.text };
  const canvas = document.createElement('canvas');
  canvas.width = FB_W;
  canvas.height = FB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CALCIO 90: no 2d context for the framebuffer');
  ctx.imageSmoothingEnabled = false;

  const sprites: SpriteSheet = createSpriteSheet();
  let pitchLayer: StaticLayer | null = null;
  /** Drives the two-frame run cycle; presentation only. */
  let animClock = 0;
  const camera: Camera = { x: 0, y: 0 };

  function pitch(): StaticLayer {
    if (!pitchLayer) {
      pitchLayer = createStaticLayer(LAYER_W, LAYER_H, target => {
        paintTerrace(target);
        paintTurf(target);
        paintMarkings(target);
      });
      // The framebuffer is already one device pixel per world unit, so the
      // bake is 1x — no dpr scaling, which is what keeps the dither aligned.
      pitchLayer.rebuild(1);
    }
    return pitchLayer;
  }

  function clearTo(colour: string): void {
    fill(ctx!, 0, 0, FB_W, FB_H, colour);
  }

  /* --- match ---------------------------------------------------- */

  function bannerFor(m: MatchState): string | null {
    switch (m.phase) {
      case 'kickoff':
        return text.kickoff;
      case 'goal':
        return text.goal;
      case 'halfTime':
        return text.halfTime;
      case 'over':
        return text.fullTime;
      case 'restart':
        if (!m.restart) return null;
        if (m.restart.kind === 'throwIn') return text.throwIn;
        if (m.restart.kind === 'corner') return text.corner;
        return text.goalKick;
      default:
        return null;
    }
  }

  function drawPlayer(p: PlayerState, side: Side, idx: number, m: MatchState): void {
    const sx = Math.round(p.x - camera.x);
    const sy = Math.round(p.y - camera.y);
    if (sx < -SLIDE_W || sx > VIEW_W + SLIDE_W || sy < -SLIDE_H || sy > VIEW_H + SLIDE_H) return;
    // The strip, not the team: a fixture whose two first strips would be two
    // dark blobs is played in a change strip, decided once at kickoff.
    const strip = m.kits[side];
    let kit: PlayerSprites;
    if (idx === 0) {
      const keeper = sprites.keeper(KEEPER_KITS[side]);
      const dive = m.keepers[side].dive;
      if (dive && dive.elapsed > 0) {
        // A committed keeper is drawn mid-dive, toward the side he chose.
        const sprite = keeper.dive[dive.targetX >= dive.fromX ? 0 : 1];
        ctx!.drawImage(sprite, sx - DIVE_W / 2, sy - DIVE_H / 2);
        return;
      }
      kit = keeper;
    } else {
      kit = sprites.outfield(strip.primary, strip.trim);
    }

    if (p.slide > 0 || p.down > 0) {
      ctx!.drawImage(kit.slide[p.fx >= 0 ? 0 : 1], sx - SLIDE_W / 2, sy - SLIDE_H / 2);
      return;
    }
    const facing = facingIndex(p.fx, p.fy);
    const moving = p.speed > 8;
    const step = moving ? Math.floor(animClock * 7 + idx) % 2 : 0;
    ctx!.drawImage(kit.run[facing][step], sx - PLAYER_W / 2, sy - PLAYER_H / 2);
  }

  function drawBall(m: MatchState): void {
    const sx = Math.round(m.ball.x - camera.x);
    const sy = Math.round(m.ball.y - camera.y);
    if (m.ball.z > 3) {
      ctx!.drawImage(sprites.ballShadow, sx - SHADOW_W / 2, sy + BALL_MIN / 2);
    }
    const size = ballSize(m.ball.z);
    ctx!.drawImage(sprites.ball(m.ball.z), Math.round(sx - size / 2), Math.round(sy - size / 2));
  }

  function drawTriangle(m: MatchState, cue: ACue): void {
    if (m.switchFlash > 0 && Math.floor(m.switchFlash * 4) % 2 === 1) return;
    const p = m.players[0][m.controlled];
    if (!p) return;
    const sx = Math.round(p.x - camera.x - TRIANGLE_W / 2);
    const sy = Math.round(p.y - camera.y + PLAYER_H / 2 + 2);
    ctx!.drawImage(sprites.triangle(cue), sx, sy);
  }

  function drawHud(m: MatchState, view: MatchView, cue: ACue): void {
    fill(ctx!, HUD_X, 0, HUD_W, FB_H, PALETTE.hudPanel);
    fill(ctx!, HUD_X, 0, 1, FB_H, PALETTE.hudRule);
    const cx = HUD_X + HUD_W / 2;

    const minute = Math.min(90, Math.floor(m.clock));
    const second = Math.floor((m.clock - Math.floor(m.clock)) * 60);
    const clock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
    drawTextCentred(ctx!, clock, cx, 6, { color: PALETTE.hudText });

    drawTextCentred(ctx!, `${m.teams[0].code}  ${m.teams[1].code}`, cx, 20, {
      color: PALETTE.hudText
    });
    drawTextCentred(ctx!, `${m.score[0]} - ${m.score[1]}`, cx, 32, {
      scale: 2,
      color: PALETTE.scoreText,
      outline: PALETTE.scoreOutline
    });

    // Which way the human is kicking, so a swapped half is never a surprise —
    // and, in the cue's colour, what the A button is about to do: red that the
    // goal it points at is in shooting range, sky blue that the ball overhead
    // is one this man may head or volley.
    const down = attackDir(0, m.swapped) === 1;
    const arrow =
      cue === 'shot' ? PALETTE.shotArmed : cue === 'air' ? PALETTE.airArmed : PALETTE.hudDim;
    triangleRows(ctx!, cx - 5, 52, 10, 8, down ? 'down' : 'up', arrow);

    drawRadar(m);

    drawText(ctx!, `${text.score} ${view.runScore}`, HUD_X + 4, 192, { color: PALETTE.hudText });
    drawText(ctx!, `${text.best} ${view.best}`, HUD_X + 4, 204, { color: PALETTE.hudDim });
  }

  function radarX(x: number): number {
    return RADAR.x + Math.round((x / PITCH_W) * RADAR.w);
  }

  function radarY(y: number): number {
    return RADAR.y + Math.round((y / PITCH_L) * RADAR.h);
  }

  function drawRadar(m: MatchState): void {
    frame(ctx!, RADAR_FRAME.x, RADAR_FRAME.y, RADAR_FRAME.w, RADAR_FRAME.h, 2, PALETTE.radarFrame);
    fill(ctx!, RADAR.x, RADAR.y, RADAR.w, RADAR.h, PALETTE.radarPitch);
    const c = PALETTE.radarMarking;
    fill(ctx!, RADAR.x, RADAR.y + RADAR.h / 2, RADAR.w, 1, c);
    frame(ctx!, RADAR.x, RADAR.y, RADAR.w, RADAR.h, 1, c);
    // Both boxes, so the radar reads as a pitch rather than a rectangle.
    const boxW = Math.round(((BOX_HALF * 2) / PITCH_W) * RADAR.w);
    const boxH = Math.round((BOX_DEPTH / PITCH_L) * RADAR.h);
    frame(ctx!, radarX(CENTRE_X - BOX_HALF), RADAR.y, boxW, boxH, 1, c);
    frame(ctx!, radarX(CENTRE_X - BOX_HALF), RADAR.y + RADAR.h - boxH, boxW, boxH, 1, c);

    for (const side of SIDES) {
      ctx!.fillStyle = side === 0 ? PALETTE.radarA : PALETTE.radarB;
      for (let idx = 0; idx < TEAM_SIZE; idx++) {
        const p = m.players[side][idx];
        ctx!.fillRect(radarX(p.x) - 1, radarY(p.y) - 1, 2, 2);
      }
    }
    fill(ctx!, radarX(m.ball.x) - 1, radarY(m.ball.y) - 1, 2, 2, PALETTE.radarBall);

    // The camera window: the whole reason the radar is functional here.
    const vx = radarX(clamp(camera.x, 0, PITCH_W));
    const vy = radarY(clamp(camera.y, 0, PITCH_L));
    const vw = Math.round((VIEW_W / PITCH_W) * RADAR.w);
    const vh = Math.round((VIEW_H / PITCH_L) * RADAR.h);
    frame(
      ctx!,
      Math.min(vx, RADAR.x + RADAR.w - vw),
      Math.min(vy, RADAR.y + RADAR.h - vh),
      vw,
      vh,
      1,
      PALETTE.radarView
    );
  }

  function drawMatch(m: MatchState, view: MatchView): void {
    animClock += view.dt;
    // pitch.ts owns the camera maths; the renderer only owns the state it
    // scrolls, already rounded to whole framebuffer pixels by cameraFor.
    const cam = cameraFor(camera, m.ball, view.dt);
    camera.x = cam.x;
    camera.y = cam.y;

    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(0, 0, VIEW_W, VIEW_H);
    ctx!.clip();
    ctx!.translate(-LAYER_MARGIN - camera.x, -LAYER_MARGIN - camera.y);
    pitch().draw(ctx!);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);

    // Corner landing markers, under everything else.
    const aimX = view.aimX ?? 0;
    const picked = aimX < -0.4 ? 0 : aimX > 0.4 ? 2 : 1;
    for (let i = 0; i < m.markers.length; i++) {
      const mk = m.markers[i];
      ctx!.drawImage(
        sprites.marker(i === picked),
        Math.round(mk.x - camera.x - MARKER_SIZE / 2),
        Math.round(mk.y - camera.y - MARKER_SIZE / 2)
      );
    }

    // Painter's algorithm down the pitch, so a nearer player overlaps.
    const order: Array<{ p: PlayerState; side: Side; idx: number }> = [];
    for (const side of SIDES) {
      for (let idx = 0; idx < TEAM_SIZE; idx++) {
        order.push({ p: m.players[side][idx], side, idx });
      }
    }
    order.sort((a, b) => a.p.y - b.p.y);
    for (const entry of order) drawPlayer(entry.p, entry.side, entry.idx, m);

    drawBall(m);
    const cue = aCue(m);
    drawTriangle(m, cue);

    const banner = view.banner === undefined ? bannerFor(m) : view.banner;
    if (banner) {
      drawTextCentred(ctx!, banner, VIEW_W / 2, 96, {
        scale: 3,
        color: PALETTE.bannerText,
        shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
      });
    }
    if (view.attract) drawAttractPrompt();
    ctx!.restore();

    drawHud(m, view, cue);
  }

  /**
   * The cabinet asking for a player, over its own demo. A strip rather than
   * bare text: a one-pixel font on mown grass is unreadable, and the panel is
   * the same opaque `hudPanel` the HUD column uses, so it reads as chrome.
   */
  function drawAttractPrompt(): void {
    const w = textWidth(text.attract) + 12;
    const x = Math.round((VIEW_W - w) / 2);
    const y = VIEW_H - 26;
    fill(ctx!, x, y, w, 15, PALETTE.hudPanel);
    frame(ctx!, x, y, w, 15, 1, PALETTE.hudRule);
    // 1.5 Hz, the arcade's own beacon cadence: on for two thirds of a second.
    if (blink(animClock)) {
      drawTextCentred(ctx!, text.attract, VIEW_W / 2, y + 4, { color: PALETTE.hudText });
    }
  }

  /**
   * Particles and floaters, rasterised here rather than by `effects.ts`.
   *
   * The engine module stays the required channel for the *physics* — `burst`,
   * `emit`, `floater`, `update` and `clear` are all its own, and this reads the
   * arrays it owns. Only the drawing is local, because the engine draws
   * floaters with `ctx.fillText` in a system font and fades everything under
   * `globalAlpha`, and 8.1 forbids both anti-aliasing and alpha blending in
   * the pixel layer. A particle therefore fades the way a Mega Drive faded a
   * sprite — by flickering off on alternate frames near the end of its life —
   * and a floater is a bitmap word like every other word on screen.
   */
  function drawEffects(fx: EffectsView): void {
    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(0, 0, VIEW_W, VIEW_H);
    ctx!.clip();
    for (const part of fx.particles) {
      if (dying(part.life, part.maxLife * 0.3)) continue;
      const size = Math.max(1, Math.round(part.size * 2));
      fill(ctx!, Math.round(part.x), Math.round(part.y), size, size, part.color);
    }
    for (const f of fx.floaters) {
      if (dying(f.life, FLOATER_FLICKER)) continue;
      drawTextCentred(ctx!, f.text, f.x, f.y, {
        scale: 2,
        color: f.color,
        shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
      });
    }
    ctx!.restore();
  }

  /* --- screens --------------------------------------------------- */

  function drawTitle(view: TitleView): void {
    clearTo(PALETTE.titleCredit);
    fill(ctx!, 0, 0, FB_W, 24, PALETTE.titleBand);
    fill(ctx!, 0, 24, FB_W, 2, PALETTE.titleRuleDark);
    fill(ctx!, 0, 26, FB_W, 2, PALETTE.titleRuleGreen);
    fill(ctx!, 0, 28, FB_W, 2, PALETTE.titleRuleWhite);
    fill(ctx!, 0, 30, FB_W, 96, PALETTE.titlePanel);

    // The wordmark: one pass per stripe, each clipped to its band, so the
    // green / white / red runs through the letterforms rather than behind them.
    const stripes: ReadonlyArray<readonly [number, number, string]> = [
      [0, 7, PALETTE.titleRuleGreen],
      [7, 7, PALETTE.titleRuleWhite],
      [14, 7, PALETTE.titleBand]
    ];
    const wordY = 62;
    drawTextCentred(ctx!, text.wordmark, FB_W / 2, wordY, {
      scale: 3,
      color: PALETTE.black,
      outline: PALETTE.black
    });
    for (const [offset, height, colour] of stripes) {
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(0, wordY + offset, FB_W, height);
      ctx!.clip();
      drawTextCentred(ctx!, text.wordmark, FB_W / 2, wordY, { scale: 3, color: colour });
      ctx!.restore();
    }
    drawTextCentred(ctx!, text.credit, FB_W / 2, 104, { color: PALETTE.menuBarDark });

    fill(ctx!, 0, 126, FB_W, 2, PALETTE.titleRuleWhite);
    fill(ctx!, 0, 128, FB_W, 2, PALETTE.titleRuleGreen);
    fill(ctx!, 0, 130, FB_W, 2, PALETTE.titleRuleDark);

    if (Math.floor(view.clock * 2) % 2 === 0) {
      const w = textWidth(text.pressStart, 2);
      const x = Math.round((FB_W - w) / 2);
      drawText(ctx!, text.pressStart, x, 170, { scale: 2, color: PALETTE.white });
      triangleRows(ctx!, x - 14, 170, 8, 14, 'right', PALETTE.white);
    }
  }

  function drawTeamSelect(view: TeamSelectView): void {
    clearTo(PALETTE.menuField);
    drawTextCentred(ctx!, text.selectTeam, FB_W / 2, 12, {
      scale: 2,
      color: PALETTE.white,
      outline: PALETTE.menuSelected
    });

    // The thirteenth cell sits alone on a fourth row, so an unlocked cabinet
    // shows the secret side without reflowing the twelve above it.
    const roster = view.unlocked ? ALL_TEAMS : TEAMS;
    const cols = 4;
    const cellW = 66;
    const cellH = 36;
    const gapX = 8;
    const gapY = 6;
    const x0 = 16;
    const y0 = 40;
    for (let i = 0; i < roster.length; i++) {
      const team = roster[i];
      const cx = x0 + (i % cols) * (cellW + gapX);
      const cy = y0 + Math.floor(i / cols) * (cellH + gapY);
      fill(ctx!, cx, cy, cellW, cellH, team.primary);
      frame(ctx!, cx, cy, cellW, cellH, 1, PALETTE.black);
      fill(ctx!, cx + cellW - 12, cy + 4, 8, 8, team.trim);
      const ink = inkOn(team.primary);
      drawText(ctx!, team.code, cx + 5, cy + 5, { scale: 2, color: ink });
      drawText(ctx!, team.name, cx + 5, cy + 23, { color: ink });
      if (i === view.cursor) {
        // The outline is solid and the arrow blinks on the same half-second
        // beat as PRESS START. Blinking both was the whole cursor going away
        // for half of every second, which on a twelve-cell grid reads as no
        // cursor at all rather than as an animated one — the selection has to
        // be legible in every frame, and only the attract-beat is decoration.
        frame(ctx!, cx - 2, cy - 2, cellW + 4, cellH + 4, 2, PALETTE.white);
        if (Math.floor(view.clock * 2) % 2 === 0) {
          triangleRows(ctx!, cx - 12, cy + cellH / 2 - 5, 8, 10, 'right', PALETTE.white);
        }
      }
    }

    if (view.confirming) drawStatsBox(roster[view.cursor], view.confirmYes);
    if (view.unlockFlash && view.unlockFlash > 0) drawUnlockBanner(view.unlockFlash);
  }

  /**
   * The flourish for the hidden side. It sits over the grid for a couple of
   * seconds on the same 1.5 Hz beat as everything else that blinks, so the
   * reward reads as part of the cabinet rather than a web page's toast.
   */
  function drawUnlockBanner(remaining: number): void {
    const label = text.unlocked;
    // Spanish and Catalan say it in more letters than English does; the label
    // drops a size rather than running off the framebuffer.
    const labelScale = textWidth(label, 2) + 20 <= FB_W ? 2 : 1;
    const w = Math.max(textWidth(label, labelScale), textWidth(SECRET_TEAM.name, 3)) + 20;
    const h = 52;
    const x = Math.round((FB_W - w) / 2);
    const y = 82;
    fill(ctx!, x, y, w, h, PALETTE.menuPanel);
    frame(ctx!, x, y, w, h, 2, SECRET_TEAM.primary);
    if (blink(remaining)) {
      drawTextCentred(ctx!, label, FB_W / 2, y + 10, {
        scale: labelScale,
        color: PALETTE.bannerText
      });
    }
    drawTextCentred(ctx!, SECRET_TEAM.name, FB_W / 2, y + 28, {
      scale: 3,
      color: SECRET_TEAM.primary,
      shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
    });
  }

  function drawStatsBox(team: Team, confirmYes: boolean): void {
    const w = 160;
    const h = 92;
    const x = Math.round((FB_W - w) / 2);
    const y = 66;
    fill(ctx!, x, y, w, h, PALETTE.menuBg);
    frame(ctx!, x, y, w, h, 2, PALETTE.menuPanel);
    drawTextCentred(ctx!, team.name, x + w / 2, y + 8, { color: PALETTE.menuText });
    const values = [team.speed, team.skill, team.defence, team.keeper];
    for (let i = 0; i < 4; i++) {
      const ry = y + 22 + i * 12;
      drawText(ctx!, text.ratings[i], x + 10, ry, { color: PALETTE.menuText });
      for (let pip = 0; pip < 5; pip++) {
        fill(ctx!, x + 40 + pip * 12, ry, 10, 7, pip < values[i] ? PALETTE.pipFull : PALETTE.pipEmpty);
      }
    }
    const barY = y + h - 18;
    highlightBar(x + 6, barY, w - 12, 12);
    // The pick gets a plate, not merely a different ink. Drawing the selected
    // word in blue and the unselected one in white on an orange bar was read
    // backwards in playtest, and it deserved to be: white is the brighter of
    // the two, so it reads as the lit option whichever way round the code
    // means it. A filled cursor plate under white letters is the cabinet's own
    // idiom — the corner landing markers do exactly this — and it cannot be
    // read the other way about.
    confirmOption(text.yes, x + 32, barY, confirmYes);
    confirmOption(text.no, x + w - 60, barY, !confirmYes);
  }

  /** One word of the YES/NO bar; the picked one sits on a filled plate. */
  function confirmOption(label: string, x: number, barY: number, picked: boolean): void {
    if (picked) fill(ctx!, x - 3, barY + 1, textWidth(label) + 6, 10, PALETTE.menuSelected);
    drawText(ctx!, label, x, barY + 2, { color: picked ? PALETTE.white : PALETTE.menuText });
  }

  /** The menu's three-band highlight bar: light over base over dark. */
  function highlightBar(x: number, y: number, w: number, h: number): void {
    fill(ctx!, x, y, w, h, PALETTE.menuBar);
    fill(ctx!, x, y, w, 2, PALETTE.menuBarLight);
    fill(ctx!, x, y + h - 2, w, 2, PALETTE.menuBarDark);
  }

  function drawTableBlock(rows: readonly TableRow[], x: number, y: number, w: number, label: string, playerCode: string): void {
    drawText(ctx!, label, x, y, { color: PALETTE.menuText });
    drawText(ctx!, text.columns, x + 40, y + 12, { color: PALETTE.menuPanel });
    const table = standings(rows);
    for (let i = 0; i < table.length; i++) {
      const row = table[i];
      const ry = y + 24 + i * 12;
      const isPlayer = row.code === playerCode;
      if (isPlayer) highlightBar(x - 2, ry - 2, w, 11);
      const ink = isPlayer ? PALETTE.menuSelected : PALETTE.menuText;
      if (i < 2) triangleRows(ctx!, x - 8, ry + 1, 5, 5, 'up', PALETTE.marking);
      drawText(ctx!, row.code, x, ry, { color: ink });
      const cells = [row.played, row.won, row.drawn, row.lost, row.gd, row.points];
      for (let c = 0; c < cells.length; c++) {
        drawTextRight(ctx!, String(cells[c]), x + 52 + c * 18, ry, { color: ink });
      }
    }
  }

  function drawTables(view: TablesView): void {
    clearTo(PALETTE.menuBg);
    const heading = view.heading ?? text.tables;
    drawTextCentred(ctx!, heading, FB_W / 2, 8, { scale: 2, color: PALETTE.menuPanel });
    drawTableBlock(view.run.tables[0], 16, 34, 140, `${text.group} A`, view.run.playerCode);
    drawTableBlock(view.run.tables[1], 172, 34, 140, `${text.group} B`, view.run.playerCode);
  }

  function bracketBox(x: number, y: number, code: string | null, highlight: boolean): void {
    fill(ctx!, x, y, 60, 16, highlight ? PALETTE.menuBar : PALETTE.menuBg);
    frame(ctx!, x, y, 60, 16, 2, PALETTE.marking);
    drawTextCentred(ctx!, code ?? '---', x + 30, y + 5, {
      color: highlight ? PALETTE.menuSelected : PALETTE.menuText
    });
  }

  function drawBracket(view: BracketView): void {
    clearTo(PALETTE.menuBg);
    const run = view.run;
    drawTextCentred(ctx!, text.bracket, FB_W / 2, 10, { scale: 2, color: PALETTE.menuPanel });
    const a = standings(run.tables[0]);
    const b = standings(run.tables[1]);
    const semis: Array<[string, string]> = [
      [a[0].code, b[1].code],
      [b[0].code, a[1].code]
    ];
    const ys = [50, 74, 122, 146];
    let slot = 0;
    for (const pair of semis) {
      for (const code of pair) {
        bracketBox(16, ys[slot], code, code === run.playerCode);
        slot++;
      }
    }
    drawTextCentred(ctx!, text.semiFinal, 46, 36, { color: PALETTE.menuPanel });
    // Winners, once they are known.
    const playerSemiWinner = run.semiWon ? run.playerCode : null;
    bracketBox(128, 62, playerSemiWinner, run.semiWon);
    bracketBox(128, 134, run.otherSemiWinner, false);
    drawTextCentred(ctx!, text.final, 158, 100, { scale: 2, color: PALETTE.menuPanel });
    bracketBox(240, 98, run.finalWon ? run.playerCode : null, run.finalWon);
    // Connecting rules.
    fill(ctx!, 78, ys[0] + 8, 48, 2, PALETTE.marking);
    fill(ctx!, 78, ys[1] + 8, 48, 2, PALETTE.marking);
    fill(ctx!, 78, ys[2] + 8, 48, 2, PALETTE.marking);
    fill(ctx!, 78, ys[3] + 8, 48, 2, PALETTE.marking);
    fill(ctx!, 190, 70, 48, 2, PALETTE.marking);
    fill(ctx!, 190, 142, 48, 2, PALETTE.marking);
  }

  function drawShootout(s: ShootoutState, view: ShootoutView): void {
    clearTo(PALETTE.terraceFloor);
    // Terrace behind the goal, then the goal frontal and large.
    ctx!.fillStyle = PALETTE.terraceStep;
    for (let y = 0; y < 60; y += 6) ctx!.fillRect(0, y, FB_W, 1);
    crowdBlocks(ctx!, 0, 0, FB_W, 60, 23, 0.34);
    fill(ctx!, 0, 60, FB_W, FB_H - 60, PALETTE.grass);

    const goalX = 44;
    const goalY = 62;
    const goalW = 232;
    const goalH = 62;
    fill(ctx!, goalX, goalY, goalW, goalH, PALETTE.netFill);
    netChecker(ctx!, goalX, goalY, goalW, goalH, PALETTE.netLine);
    frame(ctx!, goalX - 4, goalY - 4, goalW + 8, goalH + 8, 4, PALETTE.goalFrame);

    // Five zone markers across the mouth, each on a dark plate: a mint
    // diamond straight onto a white net is invisible.
    const zoneW = goalW / SHOOTOUT_ZONES;
    for (let z = 0; z < SHOOTOUT_ZONES; z++) {
      const zx = Math.round(goalX + z * zoneW + zoneW / 2 - MARKER_SIZE / 2);
      const zy = goalY + goalH - 28;
      const picked = s.phase !== 'result' && z === s.selected;
      fill(ctx!, zx - 2, zy - 2, MARKER_SIZE + 4, MARKER_SIZE + 4, picked ? PALETTE.menuSelected : PALETTE.scoreOutline);
      ctx!.drawImage(sprites.marker(picked), zx, zy);
    }

    // Keeper on his line and the taker from behind, both at double size:
    // this is the one view the cabinet gives them a close-up in.
    const keeperSide: Side = s.turn === 0 ? 1 : 0;
    const keeper = sprites.keeper(KEEPER_KITS[keeperSide]);
    const keeperZone = s.kicks.length && s.phase === 'result' ? s.kicks[s.kicks.length - 1].keeperZone : 2;
    const keeperX = Math.round(goalX + keeperZone * zoneW + zoneW / 2);
    if (s.phase === 'result') {
      const diveRight = keeperZone > 2;
      ctx!.drawImage(keeper.dive[diveRight ? 0 : 1], keeperX - DIVE_W, goalY + goalH - 20, DIVE_W * 2, DIVE_H * 2);
    } else {
      ctx!.drawImage(
        keeper.run[2][0],
        goalX + goalW / 2 - PLAYER_W,
        goalY + goalH - 22,
        PLAYER_W * 2,
        PLAYER_H * 2
      );
    }
    const takerStrip = view.kits[s.turn];
    const taker = sprites.outfield(takerStrip.primary, takerStrip.trim);
    ctx!.drawImage(taker.run[0][0], FB_W / 2 - PLAYER_W, 172, PLAYER_W * 2, PLAYER_H * 2);

    // Power bar down the left, and the shrinking dive timer while defending.
    frame(ctx!, 8, 96, 12, 96, 2, PALETTE.hudRule);
    const barH = Math.round(92 * clamp(s.charge, 0, 1));
    fill(ctx!, 10, 190 - barH, 8, barH, PALETTE.menuBar);
    if (s.turn === 1 && s.phase === 'aim') {
      const t = clamp(s.timer / DIVE_WINDOW, 0, 1);
      fill(ctx!, 300, 190 - Math.round(92 * t), 12, Math.round(92 * t), PALETTE.marking);
      frame(ctx!, 298, 96, 16, 96, 2, PALETTE.hudRule);
    }

    // Kick tallies along the bottom: filled for scored, hollow for missed.
    drawTextCentred(ctx!, s.suddenDeath ? text.suddenDeath : text.shootout, FB_W / 2, 130, {
      color: PALETTE.marking,
      shadow: { color: PALETTE.bannerShadow, dx: 1, dy: 1 }
    });
    drawTextCentred(ctx!, `${view.teams[0].code} ${s.score[0]} - ${s.score[1]} ${view.teams[1].code}`, FB_W / 2, 144, {
      scale: 2,
      color: PALETTE.scoreText,
      outline: PALETTE.scoreOutline
    });
    for (let side = 0; side < 2; side++) {
      const kicks = s.kicks.filter(k => k.side === side);
      const ty = 200 + side * 12;
      drawText(ctx!, view.teams[side].code, 40, ty, { color: PALETTE.white });
      for (let i = 0; i < kicks.length; i++) {
        const tx = 70 + i * 12;
        if (kicks[i].result === 'scored') fill(ctx!, tx, ty, 8, 7, PALETTE.marking);
        else frame(ctx!, tx, ty, 8, 7, 1, PALETTE.marking);
      }
    }
  }

  function drawFullTime(view: FullTimeView): void {
    const m = view.match;
    clearTo(PALETTE.menuBg);
    highlightBar(0, 8, FB_W, 20);
    drawTextCentred(ctx!, text.fullTime, FB_W / 2, 12, { scale: 2, color: PALETTE.menuSelected });
    drawTextCentred(ctx!, `${m.teams[0].code}  ${m.score[0]} - ${m.score[1]}  ${m.teams[1].code}`, FB_W / 2, 44, {
      scale: 2,
      color: PALETTE.menuPanel
    });
    for (const side of SIDES) {
      const list = scorerList(m, side);
      const x = side === 0 ? 24 : 176;
      drawText(ctx!, m.teams[side].name, x, 74, { color: PALETTE.menuPanel });
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        // A goal is credited to the country, not to a man: `ITA 63'`. The
        // roster is real national sides and there are no real squads behind
        // them, so an invented surname under a real flag would read worse than
        // no name at all — and the squad index it used to draw ("NO 6") was
        // never a scorer in the first place.
        drawText(ctx!, m.teams[side].code, x, 90 + i * 12, { color: PALETTE.menuText });
        drawTextRight(ctx!, `${Math.round(g.minute)}'`, x + 112, 90 + i * 12, { color: PALETTE.menuText });
      }
    }
    drawTextCentred(ctx!, view.outcome, FB_W / 2, 150, {
      scale: 3,
      color: PALETTE.bannerText,
      shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
    });
    drawTextCentred(ctx!, `${text.score} ${view.runScore}`, FB_W / 2, 190, { color: PALETTE.menuPanel });
    drawTextCentred(ctx!, `${text.best} ${view.best}`, FB_W / 2, 202, { color: PALETTE.menuPanel });
  }

  function drawChampion(view: ChampionView): void {
    clearTo(PALETTE.menuPanel);
    // One static celebration: a trophy recoloured to the champion's kit, over
    // a confetti crowd — exactly the one-image-recoloured trick the original
    // used for its ending.
    crowdBlocks(ctx!, 0, 0, FB_W, 64, 91, 0.4);
    crowdBlocks(ctx!, 0, 64, FB_W, FB_H - 64, 93, 0.08);
    const cx = FB_W / 2;
    const kit = view.team.primary;
    // Cup: bowl, stem, base, handles.
    fill(ctx!, cx - 26, 70, 52, 8, kit);
    for (let row = 0; row < 22; row++) {
      const w = Math.round(52 - row * 1.6);
      fill(ctx!, cx - w / 2, 78 + row, w, 1, kit);
    }
    fill(ctx!, cx - 4, 100, 8, 16, PALETTE.trophyShade);
    fill(ctx!, cx - 20, 116, 40, 6, kit);
    fill(ctx!, cx - 26, 122, 52, 6, PALETTE.trophyShade);
    fill(ctx!, cx - 36, 74, 8, 20, kit);
    fill(ctx!, cx + 28, 74, 8, 20, kit);

    drawTextCentred(ctx!, text.champions, cx, 140, {
      scale: 3,
      color: PALETTE.bannerText,
      shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
    });
    drawTextCentred(ctx!, view.team.name, cx, 170, { scale: 2, color: view.team.primary, outline: PALETTE.black });
    // The totals sit on their own panel: confetti behind a one-pixel font is
    // the fastest way to make a number unreadable.
    fill(ctx!, 80, 190, 160, 26, PALETTE.hudPanel);
    frame(ctx!, 80, 190, 160, 26, 1, PALETTE.hudRule);
    drawTextCentred(ctx!, `${text.score} ${view.runScore}`, cx, 194, { color: PALETTE.white });
    drawTextCentred(ctx!, `${text.best} ${view.best}`, cx, 206, { color: PALETTE.hudDim });
  }

  function drawGameOver(view: GameOverView): void {
    drawTables({ run: view.run, heading: text.gameOver });
    drawTextCentred(ctx!, `${text.score} ${view.runScore}`, FB_W / 2, 194, { color: PALETTE.menuPanel });
    drawTextCentred(ctx!, `${text.best} ${view.best}`, FB_W / 2, 206, { color: PALETTE.menuPanel });
  }

  function drawPause(): void {
    // A 50 % checker of black is the era's dim: no alpha anywhere in the
    // pixel layer, so the screen behind still reads through it.
    dither50(ctx!, 0, 0, FB_W, FB_H, PALETTE.black);
    const w = textWidth(text.paused, 3) + 24;
    fill(ctx!, (FB_W - w) / 2, 96, w, 32, PALETTE.hudPanel);
    frame(ctx!, (FB_W - w) / 2, 96, w, 32, 2, PALETTE.hudRule);
    drawTextCentred(ctx!, text.paused, FB_W / 2, 102, {
      scale: 3,
      color: PALETTE.bannerText,
      shadow: { color: PALETTE.bannerShadow, dx: 2, dy: 2 }
    });
  }

  function blit(dest: CanvasRenderingContext2D, destW: number, destH: number): void {
    const scale = Math.max(1, Math.floor(Math.min(destW / FB_W, destH / FB_H)));
    const w = FB_W * scale;
    const h = FB_H * scale;
    dest.imageSmoothingEnabled = false;
    dest.drawImage(canvas, Math.floor((destW - w) / 2), Math.floor((destH - h) / 2), w, h);
  }

  return {
    canvas,
    ctx,
    camera,
    resetCamera(m) {
      camera.x = Math.round(clamp(m.ball.x - VIEW_W / 2, CAMERA_MIN_X, CAMERA_MAX_X));
      camera.y = Math.round(clamp(m.ball.y - VIEW_H / 2, CAMERA_MIN_Y, CAMERA_MAX_Y));
    },
    drawMatch,
    drawTitle,
    drawTeamSelect,
    drawTables,
    drawBracket,
    drawShootout,
    drawFullTime,
    drawChampion,
    drawGameOver,
    drawEffects,
    drawPause,
    blit
  };
}
