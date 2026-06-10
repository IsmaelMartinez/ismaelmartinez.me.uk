/**
 * Tank Duel — Scorched Earth style artillery game.
 *
 * Pure game rules live in terrain.ts / physics.ts / ai.ts; this module owns
 * DOM wiring, the turn state machine, and canvas rendering. It expects the
 * markup defined in src/pages/[lang]/fun/tanks.astro.
 */
import { createGameLoop, loadScore, saveScore } from '../engine';
import { generateTerrain, surfaceYAt, carveCrater } from './terrain';
import {
  launchProjectile,
  stepProjectile,
  explosionDamage,
  type Projectile
} from './physics';
import { chooseAiShot } from './ai';

const WIDTH = 800;
const HEIGHT = 450;
const TANK_W = 34;
const TANK_H = 14;
const BARREL_LEN = 24;
const EXPLOSION_RADIUS = 45;
const EXPLOSION_TIME = 0.55;
const MAX_DAMAGE = 55;
const DIRECT_HIT_RADIUS = 14;
const MAX_WIND = 50;
const WINS_PER_MATCH = 3;
const CPU_DIFFICULTY = 0.72;
const CPU_THINK_TIME = 1.1;
const VICTORIES_KEY = 'tanks-victories';

interface Tank {
  x: number;
  y: number;
  hp: number;
  angle: number;
  power: number;
  color: string;
}

type Phase = 'idle' | 'aim' | 'cpu-think' | 'fly' | 'explode' | 'round-over';

export function initTanksGame(): void {
  const root = document.getElementById('tanks-root');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const roundOverlay = el('round-overlay');
  const roundEmoji = el('round-emoji');
  const roundMessage = el('round-message');
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

  const strings = {
    player1: root.dataset.tPlayer1 || 'Player 1',
    player2: root.dataset.tPlayer2 || 'Player 2',
    cpu: root.dataset.tCpu || 'CPU',
    winsRound: root.dataset.tWinsRound || 'wins the round!',
    winsMatch: root.dataset.tWinsMatch || 'wins the match!',
    draw: root.dataset.tDraw || 'Mutual destruction!',
    wind: root.dataset.tWind || 'Wind'
  };

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  let ground: number[] = [];
  let tanks: Tank[] = [];
  let current = 0;
  let wind = 0;
  let mode: 'cpu' | '2p' = 'cpu';
  let wins = [0, 0];
  let phase: Phase = 'idle';
  let projectile: Projectile | null = null;
  let flightTime = 0;
  let trail: { x: number; y: number }[] = [];
  let explosion: { x: number; y: number; t: number } | null = null;
  let cpuTimer = 0;
  let cpuShotPending = false;
  let victories = loadScore(VICTORIES_KEY);
  victoriesEl.textContent = victories.toString();

  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT * 0.55,
    r: 0.5 + Math.random() * 1.2
  }));

  const playerName = (i: number) =>
    i === 1 && mode === 'cpu' ? strings.cpu : i === 1 ? strings.player2 : strings.player1;

  const isHumanTurn = () => phase === 'aim' && !(mode === 'cpu' && current === 1);

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
  }

  function settleTank(tank: Tank) {
    const newY = surfaceYAt(ground, tank.x);
    const drop = newY - tank.y;
    if (drop > 30) {
      tank.hp = Math.max(0, tank.hp - Math.min(30, Math.round((drop - 30) * 0.5)));
    }
    if (drop > 0) tank.y = newY;
  }

  function newWind() {
    wind = Math.round((Math.random() * 2 - 1) * MAX_WIND);
  }

  function newRound() {
    ground = generateTerrain(WIDTH, HEIGHT);
    const p1x = 70 + Math.random() * 90;
    const p2x = WIDTH - 70 - Math.random() * 90;
    tanks = [
      { x: p1x, y: surfaceYAt(ground, p1x), hp: 100, angle: 60, power: 55, color: '#38bdf8' },
      { x: p2x, y: surfaceYAt(ground, p2x), hp: 100, angle: 120, power: 55, color: '#f87171' }
    ];
    projectile = null;
    explosion = null;
    trail = [];
    current = Math.random() < 0.5 ? 0 : 1;
    newWind();
    startTurn();
  }

  function startTurn() {
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
    newRound();
  }

  function barrelTip(tank: Tank) {
    const rad = (tank.angle * Math.PI) / 180;
    return {
      x: tank.x + Math.cos(rad) * BARREL_LEN,
      y: tank.y - TANK_H - Math.sin(rad) * BARREL_LEN
    };
  }

  function fire() {
    const tank = tanks[current];
    const tip = barrelTip(tank);
    projectile = launchProjectile(tip.x, tip.y, tank.angle, tank.power);
    flightTime = 0;
    trail = [];
    phase = 'fly';
    syncControls();
  }

  function impactAt(x: number, y: number) {
    explosion = { x, y, t: 0 };
    projectile = null;
    carveCrater(ground, HEIGHT, x, y, EXPLOSION_RADIUS);
    for (const tank of tanks) {
      tank.hp = Math.max(
        0,
        tank.hp - explosionDamage(x, y, tank.x, tank.y - TANK_H / 2, EXPLOSION_RADIUS, MAX_DAMAGE)
      );
      settleTank(tank);
    }
    phase = 'explode';
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
    if (matchOver && winner === 0 && mode === 'cpu') {
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
    roundOverlay.style.display = 'flex';
  }

  function update(dt: number) {
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
        syncControls();
        fire();
      }
    }

    if (phase === 'fly' && projectile) {
      const steps = 2;
      for (let i = 0; i < steps && projectile; i++) {
        stepProjectile(projectile, wind, dt / steps);
        flightTime += dt / steps;
        const p = projectile;
        trail.push({ x: p.x, y: p.y });
        if (trail.length > 40) trail.shift();

        if (p.x < -100 || p.x > WIDTH + 100 || p.y > HEIGHT) {
          projectile = null;
          endTurn();
          break;
        }
        // Direct hit on a tank detonates mid-air (own tank only after clearing the barrel)
        const hitTank = tanks.find(
          (tank, idx) =>
            (idx !== current || flightTime > 0.25) &&
            Math.hypot(p.x - tank.x, p.y - (tank.y - TANK_H / 2)) < DIRECT_HIT_RADIUS
        );
        if (hitTank) {
          impactAt(p.x, p.y);
          break;
        }
        if (p.x >= 0 && p.x < WIDTH && p.y >= surfaceYAt(ground, p.x)) {
          impactAt(p.x, p.y);
          break;
        }
      }
    }

    if (phase === 'explode' && explosion) {
      explosion.t += dt;
      if (explosion.t >= EXPLOSION_TIME) {
        explosion = null;
        endTurn();
      }
    }
  }

  function drawTank(tank: Tank, index: number) {
    const destroyed = tank.hp <= 0;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    if (!destroyed) {
      const rad = (tank.angle * Math.PI) / 180;
      ctx.strokeStyle = tank.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -TANK_H);
      ctx.lineTo(Math.cos(rad) * BARREL_LEN, -TANK_H - Math.sin(rad) * BARREL_LEN);
      ctx.stroke();
    }

    ctx.fillStyle = destroyed ? '#44403c' : tank.color;
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
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#0a0a20');
    sky.addColorStop(1, '#2b1a4e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

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

    if (trail.length && (phase === 'fly' || phase === 'explode')) {
      for (let i = 0; i < trail.length; i++) {
        ctx.fillStyle = `rgba(253, 224, 71, ${(i / trail.length) * 0.6})`;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (projectile) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (explosion) {
      const progress = explosion.t / EXPLOSION_TIME;
      const radius = EXPLOSION_RADIUS * Math.min(1, progress * 1.6);
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
  }

  // --- Input wiring ---

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

  const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
  document.addEventListener('keydown', e => {
    if (gameKeys.has(e.key)) e.preventDefault();
    if (!isHumanTurn()) return;
    const tank = tanks[current];
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
  });

  vsCpuBtn.addEventListener('click', () => startMatch('cpu'));
  twoPlayerBtn.addEventListener('click', () => startMatch('2p'));
  nextRoundBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    newRound();
  });
  playAgainBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    startOverlay.style.display = 'flex';
    phase = 'idle';
  });

  // Idle backdrop so the canvas isn't empty behind the start overlay
  ground = generateTerrain(WIDTH, HEIGHT);
  syncControls();
  createGameLoop(update, render).start();
}
