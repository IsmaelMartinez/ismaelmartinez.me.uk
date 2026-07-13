/**
 * Tank Duel — Scorched Earth style artillery game.
 *
 * Pure game rules live in terrain.ts / physics.ts / ai.ts / weapons.ts; this
 * module owns DOM wiring, the turn state machine, and canvas rendering. It
 * expects the markup defined in src/pages/[lang]/fun/tanks.astro.
 */
import {
  createGameLoop,
  loadScore,
  saveScore,
  initScoreboard,
  setupHiDpiCanvas,
  createGameAudio,
  wireSoundButton
} from '../engine';
import { generateTerrain, surfaceYAt, carveCrater } from './terrain';
import {
  launchProjectile,
  stepProjectile,
  stepFall,
  explosionDamage,
  matchScore,
  type Projectile
} from './physics';
import { chooseAiShot } from './ai';
import { WEAPONS, WEAPON_IDS, freshAmmo, splitCluster, type Ammo, type WeaponId } from './weapons';

const WIDTH = 800;
const HEIGHT = 450;
const TANK_W = 34;
const TANK_H = 14;
const BARREL_LEN = 24;
const EXPLOSION_TIME = 0.55;
const DIRECT_HIT_RADIUS = 14;
const MAX_WIND = 50;
const WINS_PER_MATCH = 3;
const CPU_DIFFICULTY = 0.72;
const CPU_THINK_TIME = 1.1;
const SAFE_DROP = 30; // px a tank can fall without damage
const SKY_MARGIN = 20; // backdrop overdraw so screen shake never shows an edge
const VICTORIES_KEY = 'tanks-victories';

interface Tank {
  x: number;
  y: number;
  hp: number;
  angle: number;
  power: number;
  color: string;
  weapon: WeaponId;
  ammo: Ammo;
  /** y where the current fall started, or null when grounded. */
  fallFrom: number | null;
  fallVy: number;
  /** Damage flash timer. */
  flash: number;
}

interface Shot {
  p: Projectile;
  weapon: WeaponId;
  canSplit: boolean;
  flightTime: number;
  trail: { x: number; y: number }[];
}

interface Explosion {
  x: number;
  y: number;
  t: number;
  radius: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

type Phase = 'idle' | 'aim' | 'cpu-think' | 'fly' | 'round-over';

export function initTanksGame(): void {
  const root = document.getElementById('tanks-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  // Stamped only once wiring is certain to proceed — a root marked wired on
  // a failed getContext would block the after-swap retry for good.
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const roundOverlay = el('round-overlay');
  const roundEmoji = el('round-emoji');
  const roundMessage = el('round-message');
  const matchScoreEl = el('match-score');
  const nextRoundBtn = el('next-round-btn') as HTMLButtonElement;
  const playAgainBtn = el('play-again-btn') as HTMLButtonElement;
  const vsCpuBtn = el('vs-cpu-btn') as HTMLButtonElement;
  const twoPlayerBtn = el('two-player-btn') as HTMLButtonElement;
  const angleSlider = el('angle-slider') as HTMLInputElement;
  const powerSlider = el('power-slider') as HTMLInputElement;
  const angleValue = el('angle-value');
  const powerValue = el('power-value');
  const fireBtn = el('fire-btn') as HTMLButtonElement;
  const p1Label = el('p1-label');
  const p2Label = el('p2-label');
  const p1Wins = el('p1-wins');
  const p2Wins = el('p2-wins');
  const victoriesEl = el('victories');
  const weaponButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.weapon-btn'));

  const strings = {
    player1: root.dataset.tPlayer1 || 'Player 1',
    player2: root.dataset.tPlayer2 || 'Player 2',
    cpu: root.dataset.tCpu || 'CPU',
    winsRound: root.dataset.tWinsRound || 'wins the round!',
    winsMatch: root.dataset.tWinsMatch || 'wins the match!',
    draw: root.dataset.tDraw || 'Mutual destruction!',
    wind: root.dataset.tWind || 'Wind',
    matchScore: root.dataset.tMatchScore || 'Match score'
  };

  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT * 0.55,
    r: 0.5 + Math.random() * 1.2
  }));

  // Sky, stars, moon, and mountain silhouettes never change during a match,
  // so they're baked into a device-resolution layer once per DPR change
  // instead of re-filling gradients over the whole canvas every frame (same
  // pattern as Syndicate's scanlines+vignette overlay). The layer is aligned
  // exactly to the visible board — gradient dithering is anchored to device
  // pixels, so a margin-offset layer would land visibly-identical but not
  // byte-identical pixels; the SKY_MARGIN overdraw that keeps screen shake
  // from exposing a bare edge is filled live on the rare shaking frames.
  let backdrop: HTMLCanvasElement | null = null;
  const hiDpi = setupHiDpiCanvas(canvas, ctx, WIDTH, HEIGHT, {
    onApply(dpr) {
      backdrop = null;
      const layer = document.createElement('canvas');
      layer.width = WIDTH * dpr;
      layer.height = HEIGHT * dpr;
      const lctx = layer.getContext('2d');
      if (!lctx) return;
      lctx.scale(dpr, dpr);
      paintBackdrop(lctx);
      backdrop = layer;
    }
  });

  function makeSky(target: CanvasRenderingContext2D): CanvasGradient {
    const sky = target.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#0a0a20');
    sky.addColorStop(1, '#2b1a4e');
    return sky;
  }
  // Used only to flood the shake margin, so it never shows a bare edge.
  const skyFill = makeSky(ctx);

  function paintBackdrop(target: CanvasRenderingContext2D) {
    target.fillStyle = makeSky(target);
    target.fillRect(0, 0, WIDTH, HEIGHT);

    target.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (const star of stars) {
      target.beginPath();
      target.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      target.fill();
    }

    // Moon with a soft halo, tucked toward the top-right of the battlefield.
    const moonGlow = target.createRadialGradient(WIDTH - 110, 64, 4, WIDTH - 110, 64, 52);
    moonGlow.addColorStop(0, 'rgba(226, 232, 255, 0.4)');
    moonGlow.addColorStop(1, 'rgba(226, 232, 255, 0)');
    target.fillStyle = moonGlow;
    target.fillRect(WIDTH - 162, 12, 104, 104);
    target.fillStyle = '#e8ecff';
    target.beginPath();
    target.arc(WIDTH - 110, 64, 16, 0, Math.PI * 2);
    target.fill();
    target.fillStyle = 'rgba(170, 180, 215, 0.5)';
    target.beginPath();
    target.arc(WIDTH - 105, 60, 3.5, 0, Math.PI * 2);
    target.arc(WIDTH - 115, 69, 2.5, 0, Math.PI * 2);
    target.fill();

    // Two distant mountain silhouettes for parallax depth behind the terrain.
    for (const [amp, base, tone, seed] of [
      [46, 0.62, 'rgba(30, 24, 66, 0.9)', 1.7],
      [30, 0.72, 'rgba(22, 18, 48, 0.95)', 4.3]
    ] as const) {
      target.fillStyle = tone;
      target.beginPath();
      target.moveTo(0, HEIGHT);
      for (let x = 0; x <= WIDTH; x += 6) {
        const y =
          HEIGHT * base -
          Math.sin(x * 0.006 + seed) * amp * 0.6 -
          Math.sin(x * 0.017 + seed * 2.1) * amp * 0.4;
        target.lineTo(x, y);
      }
      target.lineTo(WIDTH, HEIGHT);
      target.closePath();
      target.fill();
    }
  }

  let ground: number[] = [];
  let tanks: Tank[] = [];
  let current = 0;
  let wind = 0;
  let mode: 'cpu' | '2p' = 'cpu';
  let wins = [0, 0];
  let phase: Phase = 'idle';
  let shots: Shot[] = [];
  let explosions: Explosion[] = [];
  let particles: Particle[] = [];
  let smoke: { x: number; y: number; r: number; vx: number; life: number; maxLife: number }[] = [];
  let floaters: Floater[] = [];
  let muzzleFlash: { x: number; y: number; t: number } | null = null;
  let shake = 0;
  let cpuTimer = 0;
  let cpuShotPending = false;
  let victories = loadScore(VICTORIES_KEY);
  victoriesEl.textContent = victories.toString();

  // High-score table for matches won against the CPU: round margin plus the
  // armour the player's tank finished on, so a clean sweep outranks a scrape.
  const board = initScoreboard(document.getElementById('highscores'));

  // Tense, martial battle march in A minor.
  const audio = createGameAudio({
    tempo: 116,
    wave: 'sawtooth',
    volume: 0.1,
    melody: [
      { freq: 220.0, beats: 0.75 },
      { freq: 220.0, beats: 0.25 },
      { freq: 261.63, beats: 0.5 },
      { freq: 329.63, beats: 0.5 },
      { freq: 293.66, beats: 0.75 },
      { freq: 220.0, beats: 0.25 },
      { freq: 246.94, beats: 0.5 },
      { freq: 196.0, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  const playerName = (i: number) =>
    i === 1 && mode === 'cpu' ? strings.cpu : i === 1 ? strings.player2 : strings.player1;

  const isHumanTurn = () => phase === 'aim' && !(mode === 'cpu' && current === 1);
  const tanksSettled = () => tanks.every(t => t.fallFrom === null);

  function syncWeapons() {
    const tank = tanks[current];
    const enabled = isHumanTurn();
    for (const btn of weaponButtons) {
      const id = btn.dataset.weapon as WeaponId;
      const ammo = tank ? tank.ammo[id] : WEAPONS[id].ammo;
      const ammoEl = btn.querySelector('.weapon-ammo');
      if (ammoEl) ammoEl.textContent = ammo === Infinity ? '∞' : `×${ammo}`;
      btn.classList.toggle('active', !!tank && tank.weapon === id);
      btn.disabled = !enabled || ammo <= 0;
    }
  }

  function syncControls() {
    const tank = tanks[current];
    if (tank) {
      angleSlider.value = Math.round(tank.angle).toString();
      powerSlider.value = Math.round(tank.power).toString();
      angleValue.textContent = `${Math.round(tank.angle)}°`;
      powerValue.textContent = Math.round(tank.power).toString();
    }
    const enabled = isHumanTurn();
    angleSlider.disabled = !enabled;
    powerSlider.disabled = !enabled;
    fireBtn.disabled = !enabled;
    syncWeapons();
  }

  function applyDamage(tank: Tank, amount: number) {
    if (amount <= 0 || tank.hp <= 0) return;
    tank.hp = Math.max(0, tank.hp - amount);
    tank.flash = 0.35;
    floaters.push({
      x: tank.x,
      y: tank.y - TANK_H - 30,
      text: `-${amount}`,
      color: '#f87171',
      life: 1
    });
  }

  function newWind() {
    wind = Math.round((Math.random() * 2 - 1) * MAX_WIND);
  }

  function makeTank(x: number, angle: number, color: string): Tank {
    return {
      x,
      y: surfaceYAt(ground, x),
      hp: 100,
      angle,
      power: 55,
      color,
      weapon: 'missile',
      ammo: freshAmmo(),
      fallFrom: null,
      fallVy: 0,
      flash: 0
    };
  }

  function newRound() {
    ground = generateTerrain(WIDTH, HEIGHT);
    const p1x = 70 + Math.random() * 90;
    const p2x = WIDTH - 70 - Math.random() * 90;
    tanks = [makeTank(p1x, 60, '#38bdf8'), makeTank(p2x, 120, '#f87171')];
    shots = [];
    explosions = [];
    particles = [];
    smoke = [];
    floaters = [];
    muzzleFlash = null;
    current = Math.random() < 0.5 ? 0 : 1;
    newWind();
    startTurn();
  }

  function startTurn() {
    const tank = tanks[current];
    if (tank.ammo[tank.weapon] <= 0) tank.weapon = 'missile';
    if (mode === 'cpu' && current === 1) {
      phase = 'cpu-think';
      cpuTimer = CPU_THINK_TIME;
      cpuShotPending = true;
    } else {
      phase = 'aim';
    }
    syncControls();
  }

  function startMatch(selectedMode: 'cpu' | '2p') {
    mode = selectedMode;
    wins = [0, 0];
    p1Label.textContent = strings.player1;
    p2Label.textContent = playerName(1);
    p1Wins.textContent = '0';
    p2Wins.textContent = '0';
    startOverlay.style.display = 'none';
    roundOverlay.style.display = 'none';
    audio.start();
    newRound();
  }

  function barrelTip(tank: Tank) {
    const rad = (tank.angle * Math.PI) / 180;
    return {
      x: tank.x + Math.cos(rad) * BARREL_LEN,
      y: tank.y - TANK_H - Math.sin(rad) * BARREL_LEN
    };
  }

  function cpuPickWeapon(tank: Tank): WeaponId {
    if (tank.ammo.heavy > 0 && Math.random() < 0.4) return 'heavy';
    if (tank.ammo.mirv > 0 && Math.random() < 0.3) return 'mirv';
    return 'missile';
  }

  function fire() {
    const tank = tanks[current];
    const weapon = WEAPONS[tank.weapon];
    if (tank.ammo[tank.weapon] <= 0) return;
    if (tank.ammo[tank.weapon] !== Infinity) tank.ammo[tank.weapon]--;
    const tip = barrelTip(tank);
    shots = [
      {
        p: launchProjectile(tip.x, tip.y, tank.angle, tank.power),
        weapon: tank.weapon,
        canSplit: weapon.cluster > 1,
        flightTime: 0,
        trail: []
      }
    ];
    muzzleFlash = { x: tip.x, y: tip.y, t: 0.12 };
    audio.playSfx('blip');
    phase = 'fly';
    syncControls();
  }

  function spawnDirt(x: number, y: number, radius: number) {
    const count = Math.round(radius / 3);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 60 + Math.random() * radius * 3.2;
      particles.push({
        x: x + (Math.random() - 0.5) * radius * 0.8,
        y,
        vx: Math.cos(angle) * speed + wind * 0.3,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        color: Math.random() < 0.5 ? '#34d399' : '#1e3a2f',
        size: 1.5 + Math.random() * 2
      });
    }
  }

  function impactAt(x: number, y: number, weaponId: WeaponId) {
    const weapon = WEAPONS[weaponId];
    explosions.push({ x, y, t: 0, radius: weapon.radius });
    audio.playSfx('explosion');
    carveCrater(ground, HEIGHT, x, y, weapon.radius);
    spawnDirt(x, y, weapon.radius);
    shake = Math.min(0.6, shake + weapon.radius / 160);
    for (const tank of tanks) {
      applyDamage(
        tank,
        explosionDamage(x, y, tank.x, tank.y - TANK_H / 2, weapon.radius, weapon.maxDamage)
      );
    }
  }

  function endTurn() {
    const dead = tanks.map(t => t.hp <= 0);
    if (dead[0] || dead[1]) {
      finishRound(dead[0] && dead[1] ? null : dead[0] ? 1 : 0);
      return;
    }
    current = current === 0 ? 1 : 0;
    newWind();
    startTurn();
  }

  function finishRound(winner: number | null) {
    phase = 'round-over';
    syncControls();
    if (winner !== null) {
      wins[winner]++;
      (winner === 0 ? p1Wins : p2Wins).textContent = wins[winner].toString();
    }
    const matchOver = winner !== null && wins[winner] >= WINS_PER_MATCH;
    if (matchOver) {
      audio.playSfx('gameover');
      audio.stop();
    }
    const playerWonMatch = matchOver && winner === 0 && mode === 'cpu';
    if (playerWonMatch) {
      victories++;
      saveScore(VICTORIES_KEY, victories);
      victoriesEl.textContent = victories.toString();
    }
    roundEmoji.textContent = matchOver ? '🏆' : winner === null ? '☠️' : '💥';
    roundMessage.textContent =
      winner === null
        ? strings.draw
        : `${playerName(winner)} ${matchOver ? strings.winsMatch : strings.winsRound}`;
    nextRoundBtn.style.display = matchOver ? 'none' : 'inline-block';
    playAgainBtn.style.display = matchOver ? 'inline-block' : 'none';
    // Winning the match surfaces the number that faces the table — round
    // margin × 100 plus surviving armour — so the score isn't a mystery.
    const finalScore = matchScore(wins[0], wins[1], tanks[0].hp);
    matchScoreEl.textContent = `🏅 ${strings.matchScore}: ${finalScore}`;
    matchScoreEl.style.display = playerWonMatch ? 'block' : 'none';
    roundOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    if (playerWonMatch) board.show(finalScore);
  }

  /** Tanks above the (possibly freshly cratered) surface fall and take damage. */
  function updateFalls(dt: number) {
    for (const tank of tanks) {
      const drop = stepFall(tank, surfaceYAt(ground, tank.x), dt);
      if (drop !== null && drop > SAFE_DROP) {
        applyDamage(tank, Math.min(30, Math.round((drop - SAFE_DROP) * 0.5)));
      }
    }
  }

  function stepShot(shot: Shot, dt: number, spawned: Shot[]): boolean {
    stepProjectile(shot.p, wind, dt);
    shot.flightTime += dt;
    const p = shot.p;
    shot.trail.push({ x: p.x, y: p.y });
    if (shot.trail.length > 40) shot.trail.shift();

    // MIRV splits at apex into a fan of warheads
    if (shot.canSplit && p.vy >= 0) {
      const parts = splitCluster(p, WEAPONS[shot.weapon].cluster);
      spawned.push(
        ...parts.map(part => ({
          p: part,
          weapon: shot.weapon,
          canSplit: false,
          flightTime: shot.flightTime,
          trail: [] as { x: number; y: number }[]
        }))
      );
      return false;
    }

    if (p.x < -100 || p.x > WIDTH + 100 || p.y > HEIGHT) return false;

    // Direct hit on a tank detonates mid-air (own tank only after clearing the barrel)
    const hitTank = tanks.find(
      (tank, idx) =>
        (idx !== current || shot.flightTime > 0.25) &&
        Math.hypot(p.x - tank.x, p.y - (tank.y - TANK_H / 2)) < DIRECT_HIT_RADIUS
    );
    if (hitTank) {
      impactAt(p.x, p.y, shot.weapon);
      return false;
    }
    if (p.x >= 0 && p.x < WIDTH && p.y >= surfaceYAt(ground, p.x)) {
      impactAt(p.x, p.y, shot.weapon);
      return false;
    }
    return true;
  }

  function update(dt: number) {
    shake = Math.max(0, shake - dt);
    if (muzzleFlash) {
      muzzleFlash.t -= dt;
      if (muzzleFlash.t <= 0) muzzleFlash = null;
    }
    for (const tank of tanks) tank.flash = Math.max(0, tank.flash - dt);

    particles = particles.filter(p => {
      p.life -= dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life > 0 && p.y < HEIGHT + 10;
    });
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 22 * dt;
      return f.life > 0;
    });
    // Battle damage: a badly mauled tank trails smoke until the round ends.
    for (const tank of tanks) {
      if (tank.hp > 0 && tank.hp <= 35 && Math.random() < dt * 7) {
        smoke.push({
          x: tank.x + (Math.random() - 0.5) * 10,
          y: tank.y - TANK_H - 4,
          r: 1.5 + Math.random() * 1.5,
          vx: 4 + Math.random() * 8,
          life: 1.1 + Math.random() * 0.6,
          maxLife: 1.7
        });
      }
    }
    smoke = smoke.filter(s => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y -= 20 * dt;
      s.r += 3.5 * dt;
      return s.life > 0;
    });
    explosions = explosions.filter(e => (e.t += dt) < EXPLOSION_TIME);

    if (phase === 'cpu-think' && cpuShotPending) {
      cpuTimer -= dt;
      if (cpuTimer <= 0) {
        cpuShotPending = false;
        const cpu = tanks[1];
        const shot = chooseAiShot(
          ground,
          WIDTH,
          HEIGHT,
          { x: cpu.x, y: cpu.y - TANK_H },
          { x: tanks[0].x, y: tanks[0].y },
          wind,
          CPU_DIFFICULTY
        );
        cpu.angle = shot.angle;
        cpu.power = shot.power;
        cpu.weapon = cpuPickWeapon(cpu);
        syncControls();
        fire();
      }
    }

    if (phase === 'fly') {
      const steps = 2;
      for (let i = 0; i < steps; i++) {
        const spawned: Shot[] = [];
        shots = shots.filter(shot => stepShot(shot, dt / steps, spawned));
        shots.push(...spawned);
      }
      updateFalls(dt);
      if (!shots.length && !explosions.length && tanksSettled()) {
        endTurn();
      }
    } else if (tanks.length) {
      updateFalls(dt);
    }
  }

  function drawTank(tank: Tank, index: number) {
    const destroyed = tank.hp <= 0;
    const flashing = tank.flash > 0 && Math.floor(tank.flash * 16) % 2 === 0;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    if (!destroyed) {
      const rad = (tank.angle * Math.PI) / 180;
      ctx.strokeStyle = flashing ? '#fff' : tank.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -TANK_H);
      ctx.lineTo(Math.cos(rad) * BARREL_LEN, -TANK_H - Math.sin(rad) * BARREL_LEN);
      ctx.stroke();
    }

    ctx.fillStyle = destroyed ? '#44403c' : flashing ? '#fff' : tank.color;
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2, -TANK_H, TANK_W, TANK_H, 5);
    ctx.fill();
    ctx.fillStyle = destroyed ? '#292524' : 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2, -5, TANK_W, 5, 2);
    ctx.fill();

    // HP bar + name
    const barW = 44;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-barW / 2, -TANK_H - 18, barW, 5);
    ctx.fillStyle = tank.hp > 50 ? '#4ade80' : tank.hp > 25 ? '#facc15' : '#ef4444';
    ctx.fillRect(-barW / 2, -TANK_H - 18, (barW * tank.hp) / 100, 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(playerName(index), 0, -TANK_H - 24);

    // Active-player marker
    if (index === current && (phase === 'aim' || phase === 'cpu-think')) {
      ctx.fillStyle = tank.color;
      ctx.font = '14px monospace';
      ctx.fillText('▼', 0, -TANK_H - 38);
    }
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
      ctx.fillStyle = skyFill;
      ctx.fillRect(-SKY_MARGIN, -SKY_MARGIN, WIDTH + SKY_MARGIN * 2, HEIGHT + SKY_MARGIN * 2);
    }

    // Logical destination size — the device-resolution layer maps 1:1 onto
    // backing pixels.
    if (backdrop) ctx.drawImage(backdrop, 0, 0, WIDTH, HEIGHT);
    else paintBackdrop(ctx);

    if (ground.length) {
      const dirt = ctx.createLinearGradient(0, HEIGHT * 0.3, 0, HEIGHT);
      dirt.addColorStop(0, '#1e3a2f');
      dirt.addColorStop(1, '#14241d');
      ctx.fillStyle = dirt;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      for (let x = 0; x < WIDTH; x++) ctx.lineTo(x, ground[x]);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, ground[0]);
      for (let x = 1; x < WIDTH; x++) ctx.lineTo(x, ground[x]);
      ctx.stroke();
    }

    // Wind indicator
    if (phase !== 'idle') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      const arrows = wind === 0 ? '·' : (wind > 0 ? '►' : '◄').repeat(Math.min(3, Math.ceil(Math.abs(wind) / 17)));
      ctx.fillText(`${strings.wind} ${arrows} ${Math.abs(wind)}`, WIDTH / 2, 24);
    }

    tanks.forEach((tank, index) => drawTank(tank, index));

    // Aim guide while a human is lining up a shot
    if (isHumanTurn()) {
      const tank = tanks[current];
      const rad = (tank.angle * Math.PI) / 180;
      const fromX = tank.x + Math.cos(rad) * BARREL_LEN;
      const fromY = tank.y - TANK_H - Math.sin(rad) * BARREL_LEN;
      const len = 14 + tank.power * 1.1;
      ctx.strokeStyle = `${tank.color}88`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + Math.cos(rad) * len, fromY - Math.sin(rad) * len);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (muzzleFlash) {
      ctx.fillStyle = `rgba(253, 224, 71, ${muzzleFlash.t / 0.12})`;
      ctx.beginPath();
      ctx.arc(muzzleFlash.x, muzzleFlash.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const shot of shots) {
      for (let i = 0; i < shot.trail.length; i++) {
        ctx.fillStyle = `rgba(253, 224, 71, ${(i / shot.trail.length) * 0.6})`;
        ctx.beginPath();
        ctx.arc(shot.trail[i].x, shot.trail[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(shot.p.x, shot.p.y, shot.weapon === 'heavy' ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of smoke) {
      ctx.globalAlpha = Math.max(0, (s.life / s.maxLife) * 0.4);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const explosion of explosions) {
      const progress = explosion.t / EXPLOSION_TIME;
      const radius = explosion.radius * Math.min(1, progress * 1.6);
      const glow = ctx.createRadialGradient(
        explosion.x, explosion.y, 0,
        explosion.x, explosion.y, radius
      );
      glow.addColorStop(0, `rgba(255, 237, 160, ${1 - progress})`);
      glow.addColorStop(0.4, `rgba(251, 146, 60, ${0.9 * (1 - progress)})`);
      glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // --- Input wiring ---

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  // Drag anywhere on the battlefield to aim: the vector from the turret to
  // the pointer sets angle and power. Touch-friendly; sliders fine-tune.
  let aiming = false;

  function aimFromPointer(e: PointerEvent) {
    const tank = tanks[current];
    if (!tank) return;
    const p = hiDpi.toLogical(e);
    const dx = p.x - tank.x;
    const dy = tank.y - TANK_H - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) return;
    tank.angle = clamp((Math.atan2(dy, dx) * 180) / Math.PI, 5, 175);
    tank.power = clamp(dist / 3.2, 10, 100);
    syncControls();
  }

  canvas.addEventListener('pointerdown', e => {
    if (!isHumanTurn()) return;
    aiming = true;
    canvas.setPointerCapture(e.pointerId);
    aimFromPointer(e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (aiming && isHumanTurn()) aimFromPointer(e);
  });
  canvas.addEventListener('pointerup', () => {
    aiming = false;
  });
  canvas.addEventListener('pointercancel', () => {
    aiming = false;
  });

  angleSlider.addEventListener('input', () => {
    if (!isHumanTurn()) return;
    tanks[current].angle = parseInt(angleSlider.value, 10);
    angleValue.textContent = `${angleSlider.value}°`;
  });

  powerSlider.addEventListener('input', () => {
    if (!isHumanTurn()) return;
    tanks[current].power = parseInt(powerSlider.value, 10);
    powerValue.textContent = powerSlider.value;
  });

  fireBtn.addEventListener('click', () => {
    if (isHumanTurn()) fire();
  });

  weaponButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isHumanTurn()) return;
      const id = btn.dataset.weapon as WeaponId;
      if (tanks[current].ammo[id] <= 0) return;
      tanks[current].weapon = id;
      syncWeapons();
    });
  });

  const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
  const isTextEntry = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      (target instanceof HTMLInputElement && target.type !== 'range'));

  const onKeydown = (e: KeyboardEvent) => {
    if (!isHumanTurn() || isTextEntry(e.target)) return;
    if (gameKeys.has(e.key)) e.preventDefault();
    const tank = tanks[current];
    const weaponIdx = ['1', '2', '3'].indexOf(e.key);
    if (weaponIdx >= 0) {
      const id = WEAPON_IDS[weaponIdx];
      if (tank.ammo[id] > 0) {
        tank.weapon = id;
        syncWeapons();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
        tank.angle = Math.min(175, tank.angle + 1);
        break;
      case 'ArrowRight':
        tank.angle = Math.max(5, tank.angle - 1);
        break;
      case 'ArrowUp':
        tank.power = Math.min(100, tank.power + 1);
        break;
      case 'ArrowDown':
        tank.power = Math.max(10, tank.power - 1);
        break;
      case ' ':
        fire();
        return;
      default:
        return;
    }
    syncControls();
  };
  document.addEventListener('keydown', onKeydown);
  // Document-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handler so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => document.removeEventListener('keydown', onKeydown),
    { once: true }
  );

  vsCpuBtn.addEventListener('click', () => startMatch('cpu'));
  twoPlayerBtn.addEventListener('click', () => startMatch('2p'));
  nextRoundBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    newRound();
  });
  playAgainBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    board.hide();
    startOverlay.style.display = 'flex';
    phase = 'idle';
  });

  // Idle backdrop so the canvas isn't empty behind the start overlay
  ground = generateTerrain(WIDTH, HEIGHT);
  syncControls();
  createGameLoop(update, render).start();
}
