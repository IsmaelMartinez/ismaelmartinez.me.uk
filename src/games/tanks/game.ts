/**
 * Tank Duel — Scorched Earth style artillery game.
 *
 * Pure game rules live in terrain.ts / physics.ts / ai.ts / weapons.ts, and the
 * match itself — rounds, turns, when a round ends, when the match ends, how the
 * ledger is fed — in the DOM-free match.ts. This module owns DOM wiring,
 * presentation and canvas rendering: it drives the match, draws whatever it
 * says, and turns its events into floaters, sound, shake and overlays. It
 * expects the markup defined in src/pages/[lang]/fun/tanks.astro.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  createGameAudio,
  wireChannelButton,
  createEffects,
  createToaster,
  shadeColor,
  clamp
} from '../engine';
import { TANKS_MUSIC } from './music';
import { markDone } from '../engine/progress';
import type { ArenaType } from './terrain';
import { submitsToBoard, type TankMode } from './scoring';
import type { Difficulty } from './ai';
import { WEAPONS, WEAPON_IDS, type WeaponId } from './weapons';
import {
  createMatch,
  resetMatch,
  rollTerrain,
  startRound,
  tickMatch,
  fire,
  isHumanTurn,
  WIDTH,
  HEIGHT,
  TANK_W,
  TANK_H,
  BARREL_LEN,
  EXPLOSION_TIME,
  type Award,
  type MatchEvent,
  type Shot,
  type Tank
} from './match';

const SKY_MARGIN = 20; // backdrop overdraw so screen shake never shows an edge
/** Colour of the "+NN" award floaters, kept clear of the red damage popups. */
const AWARD_COLOR = '#fbbf24';
/** Team colours by tank index. Presentation, so the match knows nothing of them. */
const TANK_COLORS = ['#38bdf8', '#f87171'];

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
  const scoreEl = el('score');
  const score2Item = el('score2-item');
  const score2El = el('score2');
  const bestItem = el('best-item');
  const bestEl = el('best');
  const localScoresEl = el('local-scores');
  const localP1El = el('local-p1');
  const localP2El = el('local-p2');
  const { show: showToast } = createToaster(el('toast-area'));
  const weaponButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.weapon-btn'));
  const difficultyButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('.difficulty-btn')
  );
  const arenaButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('.arena-btn')
  );

  const strings = {
    player1: root.dataset.tPlayer1 || 'Player 1',
    player2: root.dataset.tPlayer2 || 'Player 2',
    cpu: root.dataset.tCpu || 'CPU',
    winsRound: root.dataset.tWinsRound || 'wins the round!',
    winsMatch: root.dataset.tWinsMatch || 'wins the match!',
    draw: root.dataset.tDraw || 'Mutual destruction!',
    wind: root.dataset.tWind || 'Wind',
    matchScore: root.dataset.tMatchScore || 'Match score',
    newRecord: root.dataset.tNewRecord || 'New record!'
  };

  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT * 0.55,
    r: 0.5 + Math.random() * 1.2
  }));

  // The whole backdrop (sky, stars, moon, mountains) plus the terrain bakes
  // into one static layer, rebuilt only when it actually changes — a DPR change
  // or a crater reshaping the ground — instead of re-filling gradients and
  // re-tessellating the terrain (~1,600 lineTo calls) every frame. The terrain
  // is painted *onto* the opaque backdrop inside the layer, so blitting the
  // finished opaque layer reproduces the old "backdrop blit + terrain draw"
  // pixel-for-pixel (a transparent terrain-only layer would fringe the
  // anti-aliased ground edge by a LSB and break the byte-identical bake). The
  // SKY_MARGIN overdraw that keeps screen shake from exposing a bare edge is
  // filled live on the rare shaking frames, so the layer stays board-aligned
  // (see createStaticLayer). The match — which owns the heightmap and the
  // uncarveable mask beside it — is created before setupHiDpiCanvas so
  // scene.rebuild can read its terrain in onApply; paintTerrain guards the
  // empty pre-round ground. Creating it draws no randomness, so it costs the
  // seeded sequence nothing to stand this early.
  const match = createMatch({ onEvent: handleEvent });
  const scene = createStaticLayer(WIDTH, HEIGHT, paintScene);
  const hiDpi = setupHiDpiCanvas(canvas, ctx, WIDTH, HEIGHT, {
    onApply: scene.rebuild
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

  // Baked terrain: the dirt polygon + green surface line, identical to the old
  // per-frame render. Repainted only when `ground` changes (crater / new round).
  function paintTerrain(target: CanvasRenderingContext2D) {
    const { ground, solid } = match;
    if (!ground.length) return;
    const dirt = target.createLinearGradient(0, HEIGHT * 0.3, 0, HEIGHT);
    dirt.addColorStop(0, '#1e3a2f');
    dirt.addColorStop(1, '#14241d');
    target.fillStyle = dirt;
    target.beginPath();
    target.moveTo(0, HEIGHT);
    for (let x = 0; x < WIDTH; x++) target.lineTo(x, ground[x]);
    target.lineTo(WIDTH, HEIGHT);
    target.closePath();
    target.fill();

    target.strokeStyle = '#34d399';
    target.lineWidth = 2;
    target.beginPath();
    target.moveTo(0, ground[0]);
    for (let x = 1; x < WIDTH; x++) target.lineTo(x, ground[x]);
    target.stroke();

    // Indestructible cover: overlay each contiguous run of solid columns in
    // stone, so the bunker pillar reads as rock the crater can't touch rather
    // than the carveable dirt around it.
    if (solid.some(Boolean)) {
      let x = 0;
      while (x < WIDTH) {
        if (!solid[x]) { x++; continue; }
        let end = x;
        let topY = ground[x];
        while (end < WIDTH && solid[end]) { topY = Math.min(topY, ground[end]); end++; }
        const stone = target.createLinearGradient(0, topY, 0, HEIGHT);
        stone.addColorStop(0, '#6b7280');
        stone.addColorStop(1, '#3b414b');
        target.fillStyle = stone;
        target.fillRect(x, topY, end - x, HEIGHT - topY);
        target.strokeStyle = '#9aa3af';
        target.lineWidth = 2;
        target.beginPath();
        target.moveTo(x, topY);
        target.lineTo(end, topY);
        target.stroke();
        x = end;
      }
    }
  }

  // The baked scene: backdrop first, then the terrain painted over it, so the
  // layer is fully opaque and blits to an exact copy of the old draw order.
  function paintScene(target: CanvasRenderingContext2D) {
    paintBackdrop(target);
    paintTerrain(target);
  }

  const fx = createEffects({
    gravityScale: 420,
    cullBelowY: HEIGHT + 10,
    floaterSize: 13,
    floaterRise: 22,
    floaterLife: 1
  });
  let smoke: { x: number; y: number; r: number; vx: number; life: number; maxLife: number }[] = [];
  let muzzleFlash: { x: number; y: number; t: number } | null = null;
  let shake = 0;
  /** Damage-flash timer per tank index; a render cue, so it stays out here. */
  const flash = [0, 0];
  // Player 0's ledger total is what the header shows and what a vs-CPU match
  // submits — the same number by construction. The ledger itself belongs to the
  // match, which is the only thing that pays into it.
  const ledger = match.ledger;

  const board = initScoreboard(document.getElementById('highscores'));

  const audio = createGameAudio(TANKS_MUSIC);
  wireChannelButton(document.getElementById('music-btn'), audio, 'music');
  wireChannelButton(document.getElementById('sfx-btn'), audio, 'sfx');

  const playerName = (i: number) =>
    i === 1 && match.mode === 'cpu' ? strings.cpu : i === 1 ? strings.player2 : strings.player1;

  function syncWeapons() {
    const tank = match.tanks[match.current];
    const enabled = isHumanTurn(match);
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
    const tank = match.tanks[match.current];
    if (tank) {
      angleSlider.value = Math.round(tank.angle).toString();
      powerSlider.value = Math.round(tank.power).toString();
      angleValue.textContent = `${Math.round(tank.angle)}°`;
      powerValue.textContent = Math.round(tank.power).toString();
    }
    const enabled = isHumanTurn(match);
    angleSlider.disabled = !enabled;
    powerSlider.disabled = !enabled;
    fireBtn.disabled = !enabled;
    syncWeapons();
  }

  /** Repaints both score readouts and, for the player's own gains vs the CPU,
   *  banks the run so a closed tab keeps the record. */
  function syncScores(player: number) {
    scoreEl.textContent = ledger.total(0).toString();
    score2El.textContent = ledger.total(1).toString();
    // Only a vs-CPU run banks. Two-player totals are farmable (one person can
    // drive both tanks), so they must never touch the personal best that feeds
    // the arcade floor's attract screens, any more than the world board.
    if (player !== 0 || !submitsToBoard(match.mode)) return;
    const { best, newRecord } = board.bank(ledger.total(0));
    bestEl.textContent = best.toString();
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
  }

  /** Whether a player's running total is on the header. The CPU's is not (its
   *  readout is the one `startMatch` hides vs the CPU), so its gains move a
   *  number nobody can see and are banked without announcing themselves. */
  const scoreShown = (player: number) => player === 0 || !score2Item.hidden;

  /**
   * Announces a gain over the tank that earned it and folds it into the
   * readouts. The floater says "your score moved", so it belongs to the
   * scorer's tank — drawn over the tank that was hit it read as the victim
   * being paid. `rise` lifts it clear of the one already in flight when a
   * single shell pays twice (a direct hit and then its blast damage).
   */
  function award(player: number | null, points: number, rise = 30) {
    if (player === null || points <= 0) return;
    if (scoreShown(player)) {
      const tank = match.tanks[player];
      fx.floater(tank.x, tank.y - TANK_H - rise, `+${points}`, AWARD_COLOR, { glow: true });
    }
    syncScores(player);
  }

  /**
   * The header as the start screen should read: no running totals, the shared
   * best on show and the second player's score put away. Called at init and
   * again whenever the start overlay comes back, since the mode-dependent
   * layout `startMatch` sets would otherwise still be advertising the last
   * match's "P2 SCORE" over the start screen.
   */
  function idleScores() {
    scoreEl.textContent = '0';
    score2El.textContent = '0';
    bestEl.textContent = board.best().toString();
    score2Item.hidden = true;
    bestItem.hidden = false;
  }

  function startMatch(selectedMode: TankMode) {
    resetMatch(match, selectedMode);
    // A best-of-five match is a long run: beginRun arms the one-time record
    // celebration, and banking every award means walking away at 2–0 still
    // keeps whatever the run was worth. Both modes begin a run; only vs-CPU
    // banks into it (see syncScores).
    board.beginRun();
    p1Label.textContent = strings.player1;
    p2Label.textContent = playerName(1);
    p1Wins.textContent = '0';
    p2Wins.textContent = '0';
    scoreEl.textContent = '0';
    score2El.textContent = '0';
    bestEl.textContent = board.best().toString();
    // The second score belongs to the other human; the shared best has nothing
    // to say about a two-player match, so they swap places.
    score2Item.hidden = match.mode === 'cpu';
    bestItem.hidden = match.mode === '2p';
    startOverlay.style.display = 'none';
    roundOverlay.style.display = 'none';
    audio.start();
    startRound(match);
  }

  function spawnDirt(x: number, y: number, radius: number) {
    // A directional wind-blown cone, not the shared radial burst — the
    // spawn math stays local and hands finished particles to emit().
    // emit() draws squares 2× its size, so halve the old side length.
    const count = Math.round(radius / 3);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 60 + Math.random() * radius * 3.2;
      fx.emit({
        x: x + (Math.random() - 0.5) * radius * 0.8,
        y,
        vx: Math.cos(angle) * speed + match.wind * 0.3,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        color: Math.random() < 0.5 ? '#34d399' : '#1e3a2f',
        size: (1.5 + Math.random() * 2) / 2,
        gravity: 1
      });
    }
  }

  /**
   * The presentation half of every match event, called by the match at the
   * exact moment the old inline code ran. That timing is the contract: the
   * dirt burst an impact spawns draws from the same `Math.random` the terrain
   * roll and the wind draw from, so an event handled a step late would move
   * those draws and change the seeded battlefield. Nothing here may write back
   * into the match.
   */
  function handleEvent(event: MatchEvent) {
    switch (event.type) {
      case 'roundStart':
        scene.rebuild();
        fx.clear();
        smoke = [];
        muzzleFlash = null;
        flash[0] = 0;
        flash[1] = 0;
        return;
      case 'turn':
        syncControls();
        return;
      case 'fire':
        muzzleFlash = { x: event.x, y: event.y, t: 0.12 };
        audio.playSfx('blip');
        syncControls();
        return;
      case 'bounce':
        audio.playSfx('blip');
        return;
      case 'impact':
        audio.playSfx('explosion');
        scene.rebuild(); // re-bake the reshaped terrain
        spawnDirt(event.x, event.y, event.radius);
        shake = Math.min(0.6, shake + event.radius / 160);
        return;
      case 'damage': {
        const tank = match.tanks[event.target];
        flash[event.target] = 0.35;
        fx.floater(tank.x, tank.y - TANK_H - 30, `-${event.amount}`, '#f87171');
        // The red loss floats over the tank that took it; the gold gain floats
        // over the tank that earned it, a little higher than the direct-hit
        // bonus that may have preceded it on the same shell.
        award(event.shooter, event.points, 46);
        return;
      }
      case 'directHit':
        award(event.shooter, event.points);
        return;
      case 'roundOver':
        showRoundOver(event.winner, event.matchOver, event.awards);
    }
  }

  function showRoundOver(winner: number | null, matchOver: boolean, awards: Award[]) {
    if (winner !== null) {
      (winner === 0 ? p1Wins : p2Wins).textContent = match.wins[winner].toString();
    }
    if (matchOver) {
      audio.playSfx('gameover');
      audio.stop();
    }
    // In the order the ledger paid them: the round bonus, then the surviving
    // armour a finished match folds in.
    for (const { player, points } of awards) award(player, points);
    // Two-player only. A vs-CPU match reaches the board below whatever its
    // result, and `commit()` marks the chain from there, so the rule for this
    // cabinet is the same as every other one: score something and the next
    // cabinet appears. A completed 2P match never submits, so it needs this
    // direct call or the chain's first link would stall for anyone who only
    // ever plays two-player (the score argument is a sentinel — markDone only
    // needs it above zero).
    if (matchOver && match.mode === '2p') markDone('tanks', 1);
    // A trophy is for someone in this room. When the CPU takes the match it
    // used to raise one too, which read as congratulating the player on losing.
    const cpuTookMatch = matchOver && match.mode === 'cpu' && winner === 1;
    roundEmoji.textContent = matchOver
      ? cpuTookMatch
        ? '🤖'
        : '🏆'
      : winner === null
        ? '☠️'
        : '💥';
    roundMessage.textContent =
      winner === null
        ? strings.draw
        : `${playerName(winner)} ${matchOver ? strings.winsMatch : strings.winsRound}`;
    nextRoundBtn.style.display = matchOver ? 'none' : 'inline-block';
    playAgainBtn.style.display = matchOver ? 'inline-block' : 'none';
    // The number the run submits is the one the player watched accumulate.
    const finalScore = ledger.total(0);
    // Vs the CPU it is shown at every match end, won or lost: a losing run that
    // earned 900 points is still a finished run worth that much.
    const submits = matchOver && submitsToBoard(match.mode);
    matchScoreEl.textContent = `🏅 ${strings.matchScore}: ${finalScore}`;
    matchScoreEl.style.display = submits ? 'block' : 'none';
    // Two-player ends on both totals side by side instead, under a note saying
    // where they stop.
    localP1El.textContent = `${strings.player1}: ${ledger.total(0)}`;
    localP2El.textContent = `${strings.player2}: ${ledger.total(1)}`;
    localScoresEl.style.display = matchOver && match.mode === '2p' ? 'block' : 'none';
    roundOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus. The
    // gate is vs-CPU alone and is load-bearing: two-player scores can be farmed
    // trivially (one person drives both tanks), so they never reach the shared
    // board. It is deliberately NOT also gated on winning — `qualifies()`
    // decides whether to interrupt for initials, never whether a run counts.
    // Floor progress is marked above, independent of this gate.
    if (submits) board.show(finalScore);
  }

  function update(dt: number) {
    shake = Math.max(0, shake - dt);
    if (muzzleFlash) {
      muzzleFlash.t -= dt;
      if (muzzleFlash.t <= 0) muzzleFlash = null;
    }
    for (let i = 0; i < flash.length; i++) flash[i] = Math.max(0, flash[i] - dt);

    fx.update(dt);
    // Battle damage: a badly mauled tank trails smoke until the round ends.
    for (const tank of match.tanks) {
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

    // Blasts, the CPU's turn, shells and falls — everything that decides what
    // happens next — belong to the match, which calls back into handleEvent as
    // it goes. It runs last so the smoke above keeps drawing from the same
    // point in the random sequence it always did.
    tickMatch(match, dt);
  }

  function drawTank(tank: Tank, index: number) {
    const destroyed = tank.hp <= 0;
    const flashing = flash[index] > 0 && Math.floor(flash[index] * 16) % 2 === 0;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Value ramp off the team colour: a dark grounding edge and a lit top rim
    // over the base fill (the drawBlock recipe), so the hull reads as armour.
    const body = destroyed ? '#44403c' : flashing ? '#fff' : TANK_COLORS[index];
    const dark = destroyed ? '#292524' : shadeColor(body, 0.45);
    const lit = flashing ? '#fff' : shadeColor(body, 1.4);

    // --- Tread band: a dark rounded track with road wheels showing through
    // and a heftier drive sprocket at each end. ---
    ctx.fillStyle = destroyed ? '#1c1917' : '#1f2937';
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2, -6, TANK_W, 6, 3);
    ctx.fill();
    ctx.fillStyle = destroyed ? '#0c0a09' : shadeColor(body, 0.5);
    const wheels = 5;
    for (let i = 0; i < wheels; i++) {
      const wx = -TANK_W / 2 + 5 + (i * (TANK_W - 10)) / (wheels - 1);
      const r = i === 0 || i === wheels - 1 ? 2.6 : 1.7;
      ctx.beginPath();
      ctx.arc(wx, -3, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Barrel (drawn before the turret so its root is capped) ---
    if (!destroyed) {
      const rad = (tank.angle * Math.PI) / 180;
      const tipX = Math.cos(rad) * BARREL_LEN;
      const tipY = -TANK_H - Math.sin(rad) * BARREL_LEN;
      ctx.lineCap = 'round';
      ctx.strokeStyle = flashing ? '#fff' : dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -TANK_H);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = body;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -TANK_H);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Muzzle lip
      ctx.fillStyle = flashing ? '#fff' : dark;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Hull: body + lit top rim + dark grounding outline ---
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2 + 1, -TANK_H, TANK_W - 2, TANK_H - 4, 4);
    ctx.fill();
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2 + 3, -TANK_H + 1, TANK_W - 6, 2.5, 1.5);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-TANK_W / 2 + 1, -TANK_H, TANK_W - 2, TANK_H - 4, 4);
    ctx.stroke();

    // --- Turret: a rounded mound the barrel springs from, seated on the hull
    // top with its own rim + edge. ---
    if (!destroyed) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(-7, -TANK_H - 4, 14, 7, 3.5);
      ctx.fill();
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.roundRect(-5, -TANK_H - 3, 10, 1.8, 0.9);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-7, -TANK_H - 4, 14, 7, 3.5);
      ctx.stroke();
    }

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
    if (index === match.current && (match.phase === 'aim' || match.phase === 'cpu-think')) {
      ctx.fillStyle = TANK_COLORS[index];
      ctx.font = '14px monospace';
      ctx.fillText('▼', 0, -TANK_H - 38);
    }
    ctx.restore();
  }

  /** A drawn shell per weapon, oriented to its velocity (replaces the emoji /
   * plain-circle projectile): the missile a finned nose-cone, the heavy a dark
   * finned bomb, the MIRV a segmented cluster shell. */
  function drawShell(shot: Shot) {
    const p = shot.p;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    if (shot.weapon === 'heavy') {
      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#52525b'; // tail fins
      ctx.beginPath();
      ctx.moveTo(-5, -1);
      ctx.lineTo(-8.5, -4);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-8.5, 4);
      ctx.lineTo(-5, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fbbf24'; // hot nose cap
      ctx.beginPath();
      ctx.arc(4.6, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (shot.weapon === 'mirv') {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.5, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 53, 15, 0.6)'; // cluster banding bumps
      for (const sx of [-2.2, 0, 2.2]) {
        ctx.beginPath();
        ctx.arc(sx, 0, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fef08a'; // pointed nose
      ctx.beginPath();
      ctx.moveTo(4.5, -2.2);
      ctx.lineTo(8, 0);
      ctx.lineTo(4.5, 2.2);
      ctx.closePath();
      ctx.fill();
    } else if (shot.weapon === 'bounce') {
      // Skipper: a round rubberised ball that skips off the ground.
      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bef264'; // highlight
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#365314'; // seam
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(2.5, 0, 4.5, 2.3, 4, false);
      ctx.stroke();
    } else {
      // Missile: a finned nose-cone shell.
      ctx.fillStyle = '#eab308'; // tail fins
      ctx.beginPath();
      ctx.moveTo(-4, -2.5);
      ctx.lineTo(-6.5, -4);
      ctx.lineTo(-4, -1);
      ctx.moveTo(-4, 2.5);
      ctx.lineTo(-6.5, 4);
      ctx.lineTo(-4, 1);
      ctx.fill();
      ctx.fillStyle = '#fde047'; // body
      ctx.beginPath();
      ctx.moveTo(5.5, 0);
      ctx.lineTo(1, -3);
      ctx.lineTo(-4, -2.5);
      ctx.lineTo(-4, 2.5);
      ctx.lineTo(1, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f87171'; // nose tip
      ctx.beginPath();
      ctx.moveTo(5.5, 0);
      ctx.lineTo(2, -1.6);
      ctx.lineTo(2, 1.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (shake > 0) {
      // Whole-pixel jitter keeps the backdrop blit on the device-pixel grid
      // (a fractional offset would bilinear-blur the baked layer), and only
      // the exposed margin strips need the sky fill — the blit repaints the
      // whole interior anyway.
      ctx.translate(
        Math.round((Math.random() - 0.5) * shake * 18),
        Math.round((Math.random() - 0.5) * shake * 18)
      );
      ctx.fillStyle = skyFill;
      ctx.fillRect(-SKY_MARGIN, -SKY_MARGIN, WIDTH + SKY_MARGIN * 2, SKY_MARGIN);
      ctx.fillRect(-SKY_MARGIN, HEIGHT, WIDTH + SKY_MARGIN * 2, SKY_MARGIN);
      ctx.fillRect(-SKY_MARGIN, 0, SKY_MARGIN, HEIGHT);
      ctx.fillRect(WIDTH, 0, SKY_MARGIN, HEIGHT);
    }

    scene.draw(ctx);

    // Wind indicator
    const wind = match.wind;
    if (match.phase !== 'idle') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      const arrows = wind === 0 ? '·' : (wind > 0 ? '►' : '◄').repeat(Math.min(3, Math.ceil(Math.abs(wind) / 17)));
      ctx.fillText(`${strings.wind} ${arrows} ${Math.abs(wind)}`, WIDTH / 2, 24);
    }

    match.tanks.forEach((tank, index) => drawTank(tank, index));

    // Aim guide while a human is lining up a shot
    if (isHumanTurn(match)) {
      const tank = match.tanks[match.current];
      const rad = (tank.angle * Math.PI) / 180;
      const fromX = tank.x + Math.cos(rad) * BARREL_LEN;
      const fromY = tank.y - TANK_H - Math.sin(rad) * BARREL_LEN;
      const len = 14 + tank.power * 1.1;
      ctx.strokeStyle = `${TANK_COLORS[match.current]}88`;
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

    for (const shot of match.shots) {
      for (let i = 0; i < shot.trail.length; i++) {
        ctx.fillStyle = `rgba(253, 224, 71, ${(i / shot.trail.length) * 0.6})`;
        ctx.beginPath();
        ctx.arc(shot.trail[i].x, shot.trail[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      drawShell(shot);
    }

    for (const s of smoke) {
      ctx.globalAlpha = Math.max(0, (s.life / s.maxLife) * 0.4);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    fx.drawParticles(ctx);

    for (const explosion of match.blasts) {
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

    ctx.textAlign = 'center';
    fx.drawFloaters(ctx);

    ctx.restore();
  }

  // --- Input wiring ---

  // Drag anywhere on the battlefield to aim: the vector from the turret to
  // the pointer sets angle and power. Touch-friendly; sliders fine-tune.
  let aiming = false;

  function aimFromPointer(e: PointerEvent) {
    const tank = match.tanks[match.current];
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
    if (!isHumanTurn(match)) return;
    aiming = true;
    canvas.setPointerCapture(e.pointerId);
    aimFromPointer(e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (aiming && isHumanTurn(match)) aimFromPointer(e);
  });
  canvas.addEventListener('pointerup', () => {
    aiming = false;
  });
  canvas.addEventListener('pointercancel', () => {
    aiming = false;
  });

  angleSlider.addEventListener('input', () => {
    if (!isHumanTurn(match)) return;
    match.tanks[match.current].angle = parseInt(angleSlider.value, 10);
    angleValue.textContent = `${angleSlider.value}°`;
  });

  powerSlider.addEventListener('input', () => {
    if (!isHumanTurn(match)) return;
    match.tanks[match.current].power = parseInt(powerSlider.value, 10);
    powerValue.textContent = powerSlider.value;
  });

  fireBtn.addEventListener('click', () => {
    if (isHumanTurn(match)) fire(match);
  });

  weaponButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isHumanTurn(match)) return;
      const id = btn.dataset.weapon as WeaponId;
      if (match.tanks[match.current].ammo[id] <= 0) return;
      match.tanks[match.current].weapon = id;
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
    if (!isHumanTurn(match) || isTextEntry(e.target)) return;
    if (gameKeys.has(e.key)) e.preventDefault();
    const tank = match.tanks[match.current];
    const weaponIdx = ['1', '2', '3', '4'].indexOf(e.key);
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
        fire(match);
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

  const isDifficulty = (v: string | undefined): v is Difficulty =>
    v === 'rookie' || v === 'gunner' || v === 'veteran';
  difficultyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const picked = btn.dataset.difficulty;
      if (isDifficulty(picked)) match.difficulty = picked;
      for (const other of difficultyButtons) {
        other.classList.toggle('active', other === btn);
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      }
    });
  });

  const isArena = (v: string | undefined): v is ArenaType =>
    v === 'hills' || v === 'canyon' || v === 'mesa' || v === 'ridges' || v === 'bunker';
  arenaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const picked = btn.dataset.arena;
      if (isArena(picked)) match.arena = picked;
      for (const other of arenaButtons) {
        other.classList.toggle('active', other === btn);
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      }
      // Repaint the idle backdrop so the picked arena previews immediately.
      rollTerrain(match);
      scene.rebuild();
    });
  });

  vsCpuBtn.addEventListener('click', () => startMatch('cpu'));
  twoPlayerBtn.addEventListener('click', () => startMatch('2p'));
  nextRoundBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    startRound(match);
  });
  playAgainBtn.addEventListener('click', () => {
    roundOverlay.style.display = 'none';
    localScoresEl.style.display = 'none';
    board.hide();
    idleScores();
    startOverlay.style.display = 'flex';
    match.phase = 'idle';
  });

  // Idle backdrop so the canvas isn't empty behind the start overlay
  idleScores();
  rollTerrain(match);
  scene.rebuild();
  syncControls();
  createGameLoop(update, render).start();
}
