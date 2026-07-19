/**
 * Shared canvas effects: particle bursts and floating score/text popups.
 * They always travel together — every point gain is announced where it
 * lands (see CLAUDE.md's scoring conventions), usually with both.
 *
 * The per-game copies this replaces differed only in numeric constants;
 * every divergence is an option with the old per-game value passed at
 * construction, so no game's feel changes. Games whose spawn math is
 * genuinely different (Tank Duel's directional dirt cones, Snake's
 * drag-slowed food pops) keep that math local and hand the finished
 * particle to `emit()` — physics, drawing, and culling stay shared.
 *
 * `update` is pure math over internal arrays (unit-tested); `draw` is
 * covered by browser smoke checks. Draw order: a combined `draw()` paints
 * particles then floaters; games that layer other art between the two
 * (explosions, tornadoes) call `drawParticles`/`drawFloaters` separately.
 */

export interface EffectsParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Multiplied by the system's gravityScale into px/s². */
  gravity: number;
  glow: boolean;
  /** Per-second velocity damping (Snake's food pops). 0 = none. */
  drag: number;
  /** Squares are the default; glow particles always render as circles. */
  shape: 'square' | 'circle';
}

export interface EffectsFloater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  /** Font px. */
  size: number;
  /** Upward drift in px/s. */
  rise: number;
  glow: boolean;
}

export interface EffectsOptions {
  /** Multiplies each particle's `gravity` into px/s². */
  gravityScale?: number;
  /** Vertical launch-velocity squash, for isometric perspective. */
  vySquash?: number;
  /** Upward kick (px/s) added to gravity-affected bursts at launch. */
  launchKick?: number;
  /** Default burst speed; a particle leaves at 0.4–1.0× this. */
  burstSpeed?: number;
  /** Default burst particle half-size in px (squares are 2× this). */
  burstSize?: number;
  /** Default burst particle lifetime in seconds. */
  burstLife?: number;
  /** shadowBlur radius for glow particles. */
  glowBlur?: number;
  /** Cull particles once below this y (off-screen debris), if set. */
  cullBelowY?: number;
  /** Default floater font px. */
  floaterSize?: number;
  /** Default floater rise in px/s. */
  floaterRise?: number;
  /** Default floater lifetime in seconds. */
  floaterLife?: number;
  /** shadowBlur radius for glow floaters. */
  floaterGlowBlur?: number;
}

export interface BurstOptions {
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  glow?: boolean;
}

export interface FloaterOptions {
  size?: number;
  rise?: number;
  life?: number;
  glow?: boolean;
}

/** Seconds over which a floater fades out at the end of its life. */
const FLOATER_FADE = 0.4;

export interface Effects {
  /** Radial burst of `count` particles at (x, y). */
  burst(x: number, y: number, count: number, color: string, opts?: BurstOptions): void;
  /** Push one particle with game-computed kinematics; physics stay shared. */
  emit(particle: Partial<EffectsParticle> & Pick<EffectsParticle, 'x' | 'y' | 'vx' | 'vy' | 'life' | 'color'>): void;
  /** Floating text popup at (x, y), drifting up and fading out. */
  floater(x: number, y: number, text: string, color: string, opts?: FloaterOptions): void;
  /** Advance and cull both arrays. Pure math — no DOM, no canvas. */
  update(dt: number): void;
  drawParticles(ctx: CanvasRenderingContext2D): void;
  drawFloaters(ctx: CanvasRenderingContext2D): void;
  /** drawParticles then drawFloaters. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Drop everything (call from startRun). */
  clear(): void;
  /** Live internal arrays, exposed for unit tests. */
  readonly particles: readonly EffectsParticle[];
  readonly floaters: readonly EffectsFloater[];
}

export function createEffects(options: EffectsOptions = {}): Effects {
  const gravityScale = options.gravityScale ?? 130;
  const vySquash = options.vySquash ?? 1;
  const launchKick = options.launchKick ?? 20;
  const burstSpeed = options.burstSpeed ?? 60;
  const burstSize = options.burstSize ?? 1.6;
  const burstLife = options.burstLife ?? 0.5;
  const glowBlur = options.glowBlur ?? 4;
  const cullBelowY = options.cullBelowY;
  const floaterSize = options.floaterSize ?? 11;
  const floaterRise = options.floaterRise ?? 16;
  const floaterLife = options.floaterLife ?? 1.1;
  const floaterGlowBlur = options.floaterGlowBlur ?? 10;

  let particles: EffectsParticle[] = [];
  let floaters: EffectsFloater[] = [];

  return {
    get particles() {
      return particles;
    },
    get floaters() {
      return floaters;
    },
    burst(x, y, count, color, opts = {}) {
      const speed = opts.speed ?? burstSpeed;
      const life = opts.life ?? burstLife;
      for (let n = 0; n < count; n++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * vySquash - (opts.gravity ? launchKick : 0),
          life,
          maxLife: life,
          size: opts.size ?? burstSize,
          color,
          gravity: opts.gravity ?? 0,
          glow: opts.glow ?? false,
          drag: 0,
          shape: 'square'
        });
      }
    },
    emit(particle) {
      particles.push({
        maxLife: particle.life,
        size: burstSize,
        gravity: 0,
        glow: false,
        drag: 0,
        shape: 'square',
        ...particle
      });
    },
    floater(x, y, text, color, opts = {}) {
      floaters.push({
        x,
        y,
        text,
        color,
        life: opts.life ?? floaterLife,
        size: opts.size ?? floaterSize,
        rise: opts.rise ?? floaterRise,
        glow: opts.glow ?? false
      });
    },
    update(dt) {
      particles = particles.filter(part => {
        part.life -= dt;
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.vy += part.gravity * gravityScale * dt;
        if (part.drag > 0) {
          part.vx *= 1 - part.drag * dt;
          part.vy *= 1 - part.drag * dt;
        }
        return part.life > 0 && (cullBelowY === undefined || part.y < cullBelowY);
      });
      floaters = floaters.filter(f => {
        f.life -= dt;
        f.y -= f.rise * dt;
        return f.life > 0;
      });
    },
    drawParticles(ctx) {
      for (const part of particles) {
        ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
        if (part.glow) {
          ctx.save();
          ctx.shadowColor = part.color;
          ctx.shadowBlur = glowBlur;
          ctx.fillStyle = part.color;
          ctx.beginPath();
          ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (part.shape === 'circle') {
          ctx.fillStyle = part.color;
          ctx.beginPath();
          ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = part.color;
          ctx.fillRect(part.x - part.size, part.y - part.size, part.size * 2, part.size * 2);
        }
      }
      ctx.globalAlpha = 1;
    },
    drawFloaters(ctx) {
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life / FLOATER_FADE));
        ctx.font = `bold ${f.size}px monospace`;
        if (f.glow) {
          ctx.save();
          ctx.shadowColor = f.color;
          ctx.shadowBlur = floaterGlowBlur;
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
          ctx.restore();
        } else {
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        }
      }
      ctx.globalAlpha = 1;
    },
    draw(ctx) {
      this.drawParticles(ctx);
      this.drawFloaters(ctx);
    },
    clear() {
      particles = [];
      floaters = [];
    }
  };
}
