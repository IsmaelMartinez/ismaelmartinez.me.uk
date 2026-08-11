/**
 * CALCIO '90 — the arcade's top-down football cabinet.
 *
 * Pure rules live in pitch.ts / match.ts / ladder.ts; this module owns DOM
 * wiring, input (keyboard + a touch virtual stick with pass/shoot buttons),
 * and canvas rendering. It expects the markup defined in
 * src/pages/[lang]/fun/football.astro.
 *
 * Rendering splits two ways: the pitch (grass stripes, chalk lines, boxes,
 * goals, terrace crowd) is baked once into a static layer; players, ball,
 * markers, particles and popups draw per frame on top.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  createGameAudio,
  wireChannelButton,
  createToaster,
  createEffects,
  clamp,
  hash01 as hash
} from '../engine';
import {
  PITCH_W,
  PITCH_H,
  GOAL_TOP,
  GOAL_BOTTOM,
  BOX_DEPTH,
  BOX_HALF,
  TEAM_SIZE
} from './pitch';
import {
  createMatch,
  tickMatch,
  humanPass,
  humanShoot,
  type MatchState,
  type MatchEvent
} from './match';
import {
  createLadder,
  recordMatch,
  ladderScore,
  difficultyFor,
  ROUND_KEYS,
  OPPONENTS,
  GOAL_POINTS,
  type Ladder
} from './ladder';

const CANVAS_W = 640;
const CANVAS_H = 440;
const OX = (CANVAS_W - PITCH_W) / 2;
const OY = (CANVAS_H - PITCH_H) / 2;

/** Seconds of holding the shoot button for a full-power shot. */
const CHARGE_TIME = 0.9;

const HUMAN_SHIRT = '#2563eb';
const HUMAN_KEEPER_SHIRT = '#facc15';
const CPU_KEEPER_SHIRT = '#e2e8f0';

type Phase = 'idle' | 'play' | 'between' | 'over';

export function initFootballGame(): void {
  const root = document.getElementById('football-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const nextOverlay = el('next-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const nextBtn = el('next-btn');
  const againBtn = el('again-btn');
  const nextRoundEl = el('next-round');
  const overWin = el('over-win');
  const overLoss = el('over-loss');
  const finalScoreEl = el('final-score');
  const matchScoreEl = el('match-score');
  const clockEl = el('clock');
  const runScoreEl = el('run-score');
  const recordEl = el('record');
  const roundLabelEl = el('round-label');
  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea);

  const s = (key: string, fallback: string) => root.dataset[key] || fallback;
  // Round names travel as one pipe-joined data attribute (a hyphen-digit
  // dataset key would not camelise cleanly).
  const roundNames = s('tRounds', '').split('|');
  const strings = {
    goal: s('tGoal', 'GOAL!'),
    golden: s('tGolden', 'Golden goal!'),
    roundWon: s('tRoundWon', 'Through!'),
    newRecord: s('tNewRecord', 'New record!'),
    vs: s('tVs', 'vs {team}'),
    rounds: roundNames.length === ROUND_KEYS.length ? roundNames : [...ROUND_KEYS]
  };

  // --- Static pitch bake ----------------------------------------------------
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, target => {
    // Terrace band around the pitch: night-match dark with a speckled crowd.
    target.fillStyle = '#101826';
    target.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const CROWD_COLORS = ['#64748b', '#94a3b8', '#f1f5f9', '#fca5a5', '#93c5fd', '#fde68a'];
    for (let i = 0; i < 420; i++) {
      const x = hash(i, 1) * CANVAS_W;
      const y = hash(i, 2) * CANVAS_H;
      // Keep the crowd off the grass.
      if (x > OX - 8 && x < OX + PITCH_W + 8 && y > OY - 8 && y < OY + PITCH_H + 8) continue;
      target.globalAlpha = 0.35 + hash(i, 3) * 0.5;
      target.fillStyle = CROWD_COLORS[Math.floor(hash(i, 4) * CROWD_COLORS.length)];
      target.fillRect(x, y, 2, 2);
    }
    target.globalAlpha = 1;

    // Mown stripes goal to goal.
    const STRIPES = 8;
    const stripeW = PITCH_W / STRIPES;
    for (let i = 0; i < STRIPES; i++) {
      target.fillStyle = i % 2 === 0 ? '#2f9e44' : '#2b8a3e';
      target.fillRect(OX + i * stripeW, OY, stripeW, PITCH_H);
    }

    // Chalk. All lines share one style pass.
    target.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    target.lineWidth = 2;
    target.strokeRect(OX, OY, PITCH_W, PITCH_H);
    // Halfway line and centre circle.
    target.beginPath();
    target.moveTo(OX + PITCH_W / 2, OY);
    target.lineTo(OX + PITCH_W / 2, OY + PITCH_H);
    target.stroke();
    target.beginPath();
    target.arc(OX + PITCH_W / 2, OY + PITCH_H / 2, 50, 0, Math.PI * 2);
    target.stroke();
    target.fillStyle = 'rgba(255, 255, 255, 0.85)';
    target.beginPath();
    target.arc(OX + PITCH_W / 2, OY + PITCH_H / 2, 3, 0, Math.PI * 2);
    target.fill();
    // Boxes, six-yard boxes, spots and arcs at both ends.
    for (const side of [0, 1] as const) {
      const goalX = side === 0 ? OX : OX + PITCH_W;
      const dir = side === 0 ? 1 : -1;
      const cy = OY + PITCH_H / 2;
      target.strokeRect(
        side === 0 ? goalX : goalX - BOX_DEPTH,
        cy - BOX_HALF,
        BOX_DEPTH,
        BOX_HALF * 2
      );
      target.strokeRect(side === 0 ? goalX : goalX - 26, cy - 46, 26, 92);
      target.beginPath();
      target.arc(goalX + dir * 48, cy, 2.5, 0, Math.PI * 2);
      target.fill();
      target.beginPath();
      target.arc(goalX + dir * 48, cy, 26, 0, Math.PI * 2);
      // Only the arc outside the box shows; clip cheaply by redrawing grass.
      target.stroke();
      target.fillStyle = side === 0 ? '#2f9e44' : '#2b8a3e';
      target.fillRect(
        side === 0 ? goalX + 2 : goalX - BOX_DEPTH + 1,
        cy - BOX_HALF + 2,
        BOX_DEPTH - 3,
        BOX_HALF * 2 - 4
      );
      // Redo the stripes the patch flattened inside the box.
      const stripeStart = Math.floor(((side === 0 ? 0 : PITCH_W - BOX_DEPTH) / PITCH_W) * STRIPES);
      for (let i = stripeStart; i <= stripeStart + Math.ceil(BOX_DEPTH / stripeW); i++) {
        if (i < 0 || i >= STRIPES) continue;
        target.fillStyle = i % 2 === 0 ? '#2f9e44' : '#2b8a3e';
        const sx = Math.max(OX + i * stripeW, side === 0 ? goalX + 2 : goalX - BOX_DEPTH + 1);
        const ex = Math.min(OX + (i + 1) * stripeW, side === 0 ? goalX + BOX_DEPTH - 1 : goalX - 2);
        if (ex > sx) target.fillRect(sx, cy - BOX_HALF + 2, ex - sx, BOX_HALF * 2 - 4);
      }
      // Re-stroke the box over the patched grass.
      target.strokeRect(
        side === 0 ? goalX : goalX - BOX_DEPTH,
        cy - BOX_HALF,
        BOX_DEPTH,
        BOX_HALF * 2
      );
      target.strokeRect(side === 0 ? goalX : goalX - 26, cy - 46, 26, 92);
      target.fillStyle = 'rgba(255, 255, 255, 0.85)';
      target.beginPath();
      target.arc(goalX + dir * 48, cy, 2.5, 0, Math.PI * 2);
      target.fill();

      // The goal itself: posts and a hatched net outside the line.
      const netX = side === 0 ? goalX - 13 : goalX;
      target.fillStyle = 'rgba(15, 23, 42, 0.55)';
      target.fillRect(netX, OY + GOAL_TOP, 13, GOAL_BOTTOM - GOAL_TOP);
      target.strokeStyle = 'rgba(226, 232, 240, 0.5)';
      target.lineWidth = 1;
      for (let n = 1; n < 4; n++) {
        target.beginPath();
        target.moveTo(netX + (n * 13) / 4, OY + GOAL_TOP);
        target.lineTo(netX + (n * 13) / 4, OY + GOAL_BOTTOM);
        target.stroke();
      }
      for (let n = 1; n < 8; n++) {
        target.beginPath();
        target.moveTo(netX, OY + GOAL_TOP + (n * (GOAL_BOTTOM - GOAL_TOP)) / 8);
        target.lineTo(netX + 13, OY + GOAL_TOP + (n * (GOAL_BOTTOM - GOAL_TOP)) / 8);
        target.stroke();
      }
      target.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      target.lineWidth = 3;
      target.beginPath();
      target.moveTo(goalX, OY + GOAL_TOP - 1);
      target.lineTo(netX + (side === 0 ? 0 : 13), OY + GOAL_TOP - 1);
      target.moveTo(goalX, OY + GOAL_BOTTOM + 1);
      target.lineTo(netX + (side === 0 ? 0 : 13), OY + GOAL_BOTTOM + 1);
      target.stroke();
      // Restore the shared chalk style for the next side's boxes.
      target.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      target.lineWidth = 2;
    }
    // Corner arcs.
    for (const [cx2, cy2, a0, a1] of [
      [OX, OY, 0, Math.PI / 2],
      [OX + PITCH_W, OY, Math.PI / 2, Math.PI],
      [OX + PITCH_W, OY + PITCH_H, Math.PI, Math.PI * 1.5],
      [OX, OY + PITCH_H, Math.PI * 1.5, Math.PI * 2]
    ] as const) {
      target.beginPath();
      target.arc(cx2, cy2, 8, a0, a1);
      target.stroke();
    }
  });
  setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { onApply: ground.rebuild });

  // --- Game state -----------------------------------------------------------
  let phase: Phase = 'idle';
  let ladder: Ladder = createLadder();
  let match: MatchState = createMatch(0, Math.random);
  const fx = createEffects({
    gravityScale: 200,
    launchKick: 30,
    burstSpeed: 90,
    burstSize: 2,
    glowBlur: 6,
    floaterSize: 14,
    floaterRise: 20,
    floaterLife: 1.2
  });
  /** Last values written to the HUD, so render skips redundant DOM writes. */
  const hud = { score: '', clock: '', run: -1 };

  const board = initScoreboard(document.getElementById('highscores'));
  recordEl.textContent = `${board.best()}`;

  // An anthemic terrace-chant arrangement: a proud square-wave chant over a
  // pumping bass and a warm sustained pad, with a touch of stadium echo. Two
  // 16-beat phrases; all three voices span 32 beats so the loop restarts
  // together.
  const audio = createGameAudio({
    tempo: 112,
    volume: 0.12,
    echo: { time: 0.28, feedback: 0.25, mix: 0.18 },
    tracks: [
      {
        // CHANT — the terrace lead.
        wave: 'square',
        volume: 1.0,
        melody: [
          // Phrase A.
          { freq: 659.25, beats: 1 }, // E5
          { freq: 659.25, beats: 0.5 },
          { freq: 659.25, beats: 0.5 },
          { freq: 698.46, beats: 1 }, // F5
          { freq: 783.99, beats: 1 }, // G5
          { freq: 783.99, beats: 0.5 },
          { freq: 698.46, beats: 0.5 },
          { freq: 659.25, beats: 0.5 },
          { freq: 587.33, beats: 0.5 }, // D5
          { freq: 659.25, beats: 2 },
          { freq: 523.25, beats: 1 }, // C5
          { freq: 523.25, beats: 0.5 },
          { freq: 523.25, beats: 0.5 },
          { freq: 587.33, beats: 1 },
          { freq: 659.25, beats: 1 },
          { freq: 587.33, beats: 0.5 },
          { freq: 523.25, beats: 0.5 },
          { freq: 587.33, beats: 0.5 },
          { freq: 659.25, beats: 0.5 },
          { freq: 587.33, beats: 1 },
          { freq: 0, beats: 1 },
          // Phrase B — higher, the whole end singing.
          { freq: 783.99, beats: 1 }, // G5
          { freq: 783.99, beats: 0.5 },
          { freq: 783.99, beats: 0.5 },
          { freq: 880.0, beats: 1 }, // A5
          { freq: 783.99, beats: 1 },
          { freq: 698.46, beats: 0.5 },
          { freq: 659.25, beats: 0.5 },
          { freq: 698.46, beats: 0.5 },
          { freq: 783.99, beats: 0.5 },
          { freq: 698.46, beats: 2 },
          { freq: 659.25, beats: 1 },
          { freq: 587.33, beats: 1 },
          { freq: 523.25, beats: 1 },
          { freq: 587.33, beats: 1 },
          { freq: 659.25, beats: 1 },
          { freq: 587.33, beats: 0.5 },
          { freq: 523.25, beats: 0.5 },
          { freq: 523.25, beats: 2 }
        ]
      },
      {
        // BASS — pumping quarter-note roots and fifths, one bar per chord:
        // C, Am, F, G, C, F, G, C.
        wave: 'triangle',
        volume: 0.85,
        melody: [
          { freq: 65.41, beats: 1 }, { freq: 98.0, beats: 1 }, { freq: 65.41, beats: 1 }, { freq: 98.0, beats: 1 },
          { freq: 110.0, beats: 1 }, { freq: 164.81, beats: 1 }, { freq: 110.0, beats: 1 }, { freq: 164.81, beats: 1 },
          { freq: 87.31, beats: 1 }, { freq: 130.81, beats: 1 }, { freq: 87.31, beats: 1 }, { freq: 130.81, beats: 1 },
          { freq: 98.0, beats: 1 }, { freq: 146.83, beats: 1 }, { freq: 98.0, beats: 1 }, { freq: 146.83, beats: 1 },
          { freq: 65.41, beats: 1 }, { freq: 98.0, beats: 1 }, { freq: 65.41, beats: 1 }, { freq: 98.0, beats: 1 },
          { freq: 87.31, beats: 1 }, { freq: 130.81, beats: 1 }, { freq: 87.31, beats: 1 }, { freq: 130.81, beats: 1 },
          { freq: 98.0, beats: 1 }, { freq: 146.83, beats: 1 }, { freq: 98.0, beats: 1 }, { freq: 146.83, beats: 1 },
          { freq: 65.41, beats: 2 }, { freq: 98.0, beats: 2 }
        ]
      },
      {
        // PAD — one warm sustained third per bar, detuned for width.
        wave: 'sine',
        volume: 0.5,
        envelope: 'pad',
        detune: 8,
        melody: [
          { freq: 329.63, beats: 4 }, // E4
          { freq: 261.63, beats: 4 }, // C4
          { freq: 220.0, beats: 4 }, // A3
          { freq: 246.94, beats: 4 }, // B3
          { freq: 329.63, beats: 4 },
          { freq: 220.0, beats: 4 },
          { freq: 246.94, beats: 4 },
          { freq: 261.63, beats: 4 } // C4
        ]
      }
    ]
  });
  wireChannelButton(document.getElementById('music-btn'), audio, 'music');
  wireChannelButton(document.getElementById('sfx-btn'), audio, 'sfx');

  const px = (x: number, y: number) => ({ x: OX + x, y: OY + y });

  /** The run's submittable score right now: banked rounds plus this match's goals. */
  function currentScore(): number {
    return ladderScore(ladder) + match.score[0] * GOAL_POINTS;
  }

  /** Banks the growing run; announces (once per run) a beaten personal best. */
  function bankScore() {
    const { best, newRecord } = board.bank(currentScore());
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
    recordEl.textContent = `${best}`;
  }

  function formatClock(seconds: number): string {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function roundLabel(round: number): string {
    const opponent = OPPONENTS[Math.min(round, OPPONENTS.length - 1)];
    return `${strings.rounds[round]} · ${strings.vs.replace('{team}', opponent.name.toUpperCase())}`;
  }

  function startMatch() {
    match = createMatch(difficultyFor(ladder.round), Math.random);
    fx.clear();
    charge = -1;
    roundLabelEl.textContent = roundLabel(ladder.round);
    phase = 'play';
    audio.start();
  }

  function startRun() {
    ladder = createLadder();
    board.beginRun();
    recordEl.textContent = `${board.best()}`;
    hud.run = -1;
    startMatch();
  }

  function endRun(champion: boolean) {
    phase = 'over';
    audio.stop();
    audio.playSfx(champion ? 'rescue' : 'gameover');
    bankScore();
    const score = currentScoreFinal();
    finalScoreEl.textContent = `${score}`;
    overWin.hidden = !champion;
    overLoss.hidden = champion;
    overOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    board.show(score);
  }

  /** After recordMatch the ladder already folded this match's goals in. */
  const currentScoreFinal = () => ladderScore(ladder);

  function handleEvents(events: MatchEvent[]) {
    for (const event of events) {
      if (event.type === 'goal') {
        const goal = px(event.side === 0 ? PITCH_W : 0, PITCH_H / 2);
        const colour = event.side === 0 ? '#fbbf24' : '#f87171';
        for (let n = 0; n < 26; n++) {
          fx.burst(goal.x, goal.y + (Math.random() - 0.5) * 60, 2, colour, {
            speed: 130,
            life: 0.8,
            gravity: 1,
            glow: true
          });
        }
        fx.floater(px(PITCH_W / 2, PITCH_H * 0.4).x, px(0, PITCH_H * 0.4).y, strings.goal, colour, {
          size: 30,
          life: 1.6,
          rise: 8,
          glow: true
        });
        if (event.side === 0) {
          audio.playSfx('score');
          fx.floater(goal.x - 30, goal.y - 40, `+${GOAL_POINTS}`, '#fbbf24', { size: 16 });
          // Bank the run as it grows so a closed tab keeps the record.
          bankScore();
        } else {
          audio.playSfx('hit');
        }
      } else if (event.type === 'shot') {
        audio.playSfx('hit');
      } else if (event.type === 'save') {
        audio.playSfx('blip');
      } else if (event.type === 'goldenGoal') {
        audio.playSfx('rescue');
        fx.floater(px(PITCH_W / 2, PITCH_H * 0.55).x, px(0, PITCH_H * 0.55).y, strings.golden, '#fde047', {
          size: 22,
          life: 1.8,
          rise: 6,
          glow: true
        });
      } else if (event.type === 'end') {
        const won = event.winner === 0;
        recordMatch(ladder, won, match.score[0]);
        if (!won) {
          endRun(false);
        } else if (ladder.champion) {
          endRun(true);
        } else {
          phase = 'between';
          audio.playSfx('rescue');
          showToast(`⚽ ${strings.roundWon}`);
          bankScore();
          nextRoundEl.textContent = roundLabel(ladder.round);
          nextOverlay.style.display = 'flex';
        }
      }
    }
  }

  // --- Input ----------------------------------------------------------------
  const keys = new Set<string>();
  /** Virtual-stick vector, each axis -1..1; zero when released. */
  const stick = { x: 0, y: 0 };
  /** Shot charge 0..1 while the button is held; -1 when idle. */
  let charge = -1;

  function inputVector(): { x: number; y: number } {
    let x = stick.x;
    let y = stick.y;
    if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) x += 1;
    if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) y += 1;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  function doPass() {
    if (phase !== 'play') return;
    if (humanPass(match)) audio.playSfx('blip');
  }

  function beginCharge() {
    if (phase !== 'play') return;
    charge = 0;
  }

  function releaseCharge() {
    if (charge < 0) return;
    const power = 0.3 + 0.7 * charge;
    charge = -1;
    if (phase !== 'play') return;
    if (humanShoot(match, power, inputVector().y)) audio.playSfx('hit');
  }

  const GAME_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    ' ',
    'x',
    'X',
    'a',
    'd',
    'w',
    's'
  ]);

  const onKeydown = (e: KeyboardEvent) => {
    if (phase !== 'play') return;
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'x' || e.key === 'X') doPass();
    else if (e.key === ' ') beginCharge();
    else keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  const onKeyup = (e: KeyboardEvent) => {
    if (e.key === ' ') releaseCharge();
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('keyup', onKeyup);
  // Document-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handlers so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('keyup', onKeyup);
    },
    { once: true }
  );

  // Virtual stick: one pointer drives a normalized vector from the pad centre.
  const stickEl = el('stick');
  const nubEl = el('stick-nub');
  const STICK_RADIUS = 40;
  let stickPointer: number | null = null;
  function stickMove(e: PointerEvent) {
    const rect = stickEl.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const capped = Math.min(len, STICK_RADIUS);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    // A small deadzone so a resting thumb doesn't creep the player around.
    const mag = capped < 10 ? 0 : capped / STICK_RADIUS;
    stick.x = nx * mag;
    stick.y = ny * mag;
    nubEl.style.transform = `translate(${nx * capped}px, ${ny * capped}px)`;
  }
  function stickRelease() {
    stickPointer = null;
    stick.x = 0;
    stick.y = 0;
    nubEl.style.transform = '';
  }
  stickEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    stickPointer = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    stickMove(e);
  });
  stickEl.addEventListener('pointermove', e => {
    if (e.pointerId === stickPointer) stickMove(e);
  });
  for (const evt of ['pointerup', 'pointercancel'] as const) {
    stickEl.addEventListener(evt, e => {
      if (e.pointerId === stickPointer) stickRelease();
    });
  }

  // Action buttons. `click` with detail 0 is keyboard/AT activation — those
  // fire no pointerdown, so without it the aria-labelled buttons would be
  // announced but dead to a switch or keyboard user.
  const passBtn = el('btn-pass');
  passBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    doPass();
  });
  passBtn.addEventListener('click', e => {
    if (e.detail === 0) doPass();
  });
  const shootBtn = el('btn-shoot');
  shootBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    beginCharge();
  });
  for (const evt of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    shootBtn.addEventListener(evt, () => releaseCharge());
  }
  shootBtn.addEventListener('click', e => {
    if (e.detail === 0) {
      // One keyboard activation = a fixed mid-power shot.
      if (phase === 'play' && humanShoot(match, 0.7, 0)) audio.playSfx('hit');
    }
  });

  // --- Update ---------------------------------------------------------------
  function update(dt: number) {
    fx.update(dt);
    if (phase !== 'play') return;
    if (charge >= 0) charge = Math.min(1, charge + dt / CHARGE_TIME);
    handleEvents(tickMatch(match, dt, inputVector()));
  }

  // --- Rendering ------------------------------------------------------------
  function drawPlayer(p: { x: number; y: number }, shirt: string, outline: string) {
    const c = px(p.x, p.y);
    // Grounding shadow.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 5, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#fcd9b8';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    ground.draw(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const opponent = OPPONENTS[Math.min(ladder.round, OPPONENTS.length - 1)];

    // Controlled-player marker under everything else.
    const sel = match.players[0][match.controlled];
    const selPx = px(sel.x, sel.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(selPx.x, selPx.y + 2, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Players, both teams, in y order so nearer bodies overlap farther ones.
    const all: Array<{ y: number; draw: () => void }> = [];
    for (const side of [0, 1] as const) {
      for (let idx = 0; idx < TEAM_SIZE; idx++) {
        const p = match.players[side][idx];
        const shirt =
          side === 0
            ? idx === 0
              ? HUMAN_KEEPER_SHIRT
              : HUMAN_SHIRT
            : idx === 0
              ? CPU_KEEPER_SHIRT
              : opponent.color;
        all.push({ y: p.y, draw: () => drawPlayer(p, shirt, side === 0 ? '#1e3a8a' : '#1f2937') });
      }
    }
    all.sort((a, b) => a.y - b.y);
    for (const entry of all) entry.draw();

    // Ball with shadow.
    const b = px(match.ball.x, match.ball.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(b.x + 1.5, b.y + 2.5, 3.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Shot-power bar over the controlled player while the button is held.
    if (charge >= 0 && phase === 'play') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(selPx.x - 14, selPx.y - 20, 28, 5);
      ctx.fillStyle = charge > 0.85 ? '#f87171' : '#fbbf24';
      ctx.fillRect(selPx.x - 13, selPx.y - 19, 26 * charge, 3);
    }

    fx.draw(ctx);

    // HUD writes only when a value moved.
    const scoreLine = `${match.score[0]}–${match.score[1]}`;
    if (hud.score !== scoreLine) {
      hud.score = scoreLine;
      matchScoreEl.textContent = scoreLine;
    }
    const clockLine = formatClock(match.timeLeft);
    if (hud.clock !== clockLine) {
      hud.clock = clockLine;
      clockEl.textContent = clockLine;
      clockEl.classList.toggle('golden', match.golden);
    }
    const run = currentScore();
    if (hud.run !== run) {
      hud.run = run;
      runScoreEl.textContent = `${run}`;
    }
  }

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startRun();
  });

  nextBtn.addEventListener('click', () => {
    nextOverlay.style.display = 'none';
    startMatch();
  });

  againBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    board.hide();
    startRun();
  });

  // Cheat-mode handle, only when the page is opened with #dev: exposes the
  // live match and the real input paths so a bot (or a curious player) can
  // drive full runs in a real browser. Retired with the page it drives.
  if (window.location.hash === '#dev') {
    const devWindow = window as unknown as Record<string, unknown>;
    devWindow.footballDev = {
      getMatch: () => match,
      getLadder: () => ladder,
      pass: () => doPass(),
      shoot: (power: number) => phase === 'play' && humanShoot(match, power, 0),
      setStick: (x: number, y: number) => {
        stick.x = x;
        stick.y = y;
      }
    };
    document.addEventListener('astro:before-swap', () => delete devWindow.footballDev, {
      once: true
    });
  }

  createGameLoop(update, render).start();
}
