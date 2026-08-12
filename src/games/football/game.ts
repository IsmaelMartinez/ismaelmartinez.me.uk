/**
 * CALCIO '90 — the arcade's football cabinet.
 *
 * Every rule lives in the DOM-free modules beside this one (pitch, teams,
 * match, keeper, ai, setpieces, shootout, tournament) and every pixel is drawn
 * by render.ts into a 320 x 224 framebuffer. This module is the wiring: the
 * screen flow, the keyboard and touch input, the fixed-timestep loop, the
 * audio, the scoreboard, and the single integer-scaled blit that puts the
 * framebuffer on the page.
 *
 * It expects the markup in src/pages/[lang]/fun/football.astro.
 */
import {
  createGameLoop,
  createEffects,
  createGameAudio,
  createToaster,
  initScoreboard,
  setupHiDpiCanvas,
  wireChannelButton
} from '../engine';
import { createRenderer, type Renderer } from './render';
import { createMatch, tickMatch, type MatchEvent, type MatchInput, type MatchState } from './match';
import { attackGoalY, CENTRE_X, VIEW_H, VIEW_W } from './pitch';
import { TEAMS, teamByCode, type Team } from './teams';
import {
  createRun,
  difficultyFor,
  isKnockout,
  playerTeam,
  recordPlayerMatch,
  runScore,
  type RunState
} from './tournament';
import {
  createShootout,
  tickShootout,
  type ShootoutInput,
  type ShootoutState
} from './shootout';

/**
 * Logical size of the visible canvas. `blit` picks the largest integer scale of
 * the 320 x 224 framebuffer that fits, so this is exactly x3 and never lands on
 * a fractional pixel.
 */
const CANVAS_W = 960;
const CANVAS_H = 672;

type Screen =
  | 'title'
  | 'select'
  | 'match'
  | 'shootout'
  | 'fullTime'
  | 'tables'
  | 'bracket'
  | 'champion'
  | 'gameOver';

/** How long the goal celebration holds the crowd roar and the burst. */
const GOAL_FX_TIME = 1.2;

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

  const el = (id: string) => document.getElementById(id);
  const s = (key: string, fallback: string) => root.dataset[key] || fallback;

  /** Runtime-composed copy rides in on data attributes, per repo convention. */
  const strings = {
    kickoff: s('tKickoff', 'KICKOFF'),
    goal: s('tGoal', 'GOAL!'),
    throwIn: s('tThrowIn', 'THROW IN'),
    corner: s('tCorner', 'CORNER KICK'),
    goalKick: s('tGoalKick', 'GOAL KICK'),
    halfTime: s('tHalfTime', 'HALF TIME'),
    fullTime: s('tFullTime', 'FULL TIME'),
    paused: s('tPaused', 'PAUSED'),
    pressStart: s('tPressStart', 'PRESS START'),
    selectTeam: s('tSelectTeam', 'SELECT TEAM'),
    score: s('tScore', 'SCORE'),
    best: s('tBest', 'BEST'),
    group: s('tGroup', 'GROUP'),
    tables: s('tTables', 'GROUP TABLES'),
    through: s('tThrough', 'THROUGH'),
    penalties: s('tPenalties', 'PENALTIES'),
    gameOver: s('tGameOver', 'GAME OVER'),
    champions: s('tChampions', 'CHAMPIONS'),
    semiFinal: s('tSemiFinal', 'SEMI FINAL'),
    final: s('tFinal', 'FINAL'),
    bracket: s('tBracket', 'KNOCKOUT'),
    yes: s('tYes', 'YES'),
    no: s('tNo', 'NO'),
    shootout: s('tShootout', 'PENALTIES'),
    suddenDeath: s('tSuddenDeath', 'SUDDEN DEATH'),
    credit: s('tCredit', 'A PIXEL FOOTBALL CABINET'),
    newRecord: s('tNewRecord', 'New record!'),
    ratings: (s('tRatings', 'SPD,SKL,DEF,GK').split(',') as string[]).slice(0, 4)
  };
  const ratings: [string, string, string, string] = [
    strings.ratings[0] ?? 'SPD',
    strings.ratings[1] ?? 'SKL',
    strings.ratings[2] ?? 'DEF',
    strings.ratings[3] ?? 'GK'
  ];

  const renderer: Renderer = createRenderer({
    text: {
      kickoff: strings.kickoff,
      goal: strings.goal,
      throwIn: strings.throwIn,
      corner: strings.corner,
      goalKick: strings.goalKick,
      halfTime: strings.halfTime,
      fullTime: strings.fullTime,
      paused: strings.paused,
      pressStart: strings.pressStart,
      selectTeam: strings.selectTeam,
      score: strings.score,
      best: strings.best,
      group: strings.group,
      tables: strings.tables,
      through: strings.through,
      penalties: strings.penalties,
      gameOver: strings.gameOver,
      champions: strings.champions,
      semiFinal: strings.semiFinal,
      final: strings.final,
      bracket: strings.bracket,
      yes: strings.yes,
      no: strings.no,
      shootout: strings.shootout,
      suddenDeath: strings.suddenDeath,
      credit: strings.credit,
      ratings
    }
  });
  setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { smoothing: false });

  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea as HTMLElement);
  const board = initScoreboard(el('highscores'));

  // Particles and floaters land in the framebuffer, before the blit, so a goal
  // burst is the same chunky pixel size as everything else on screen.
  const fx = createEffects({
    gravityScale: 200,
    burstSpeed: 60,
    burstSize: 1,
    glowBlur: 0,
    floaterSize: 9,
    floaterRise: 16,
    floaterLife: 0.9
  });

  /**
   * One arrangement, wound up stage by stage with `setTempo`.
   *
   * The specification asks for three separate match tracks. `createGameAudio`
   * fixes its voices at construction and owns an AudioContext, so three of them
   * would mean three contexts and a mute toggle that has to be re-wired every
   * time the stage changes; the samba stays and the knockout rounds lean on the
   * tempo, which is the part of "the run has an arc" a player actually hears.
   */
  const audio = createGameAudio({
    tempo: 132,
    volume: 0.1,
    echo: { time: 0.18, feedback: 0.3, mix: 0.25 },
    tracks: [
      {
        // LEAD — a bright samba-flavoured square line.
        wave: 'square',
        volume: 1,
        detune: 8,
        melody: [
          { freq: 587.33, beats: 0.5 },
          { freq: 698.46, beats: 0.5 },
          { freq: 880.0, beats: 1 },
          { freq: 783.99, beats: 0.5 },
          { freq: 698.46, beats: 0.5 },
          { freq: 587.33, beats: 1 },
          { freq: 523.25, beats: 0.5 },
          { freq: 587.33, beats: 0.5 },
          { freq: 698.46, beats: 1 },
          { freq: 880.0, beats: 0.5 },
          { freq: 987.77, beats: 0.5 },
          { freq: 880.0, beats: 1 },
          { freq: 783.99, beats: 0.5 },
          { freq: 698.46, beats: 0.5 },
          { freq: 659.25, beats: 1 },
          { freq: 587.33, beats: 1 }
        ]
      },
      {
        // BASS — a walking triangle under the lead.
        wave: 'triangle',
        volume: 0.85,
        melody: [
          { freq: 146.83, beats: 1 },
          { freq: 110.0, beats: 1 },
          { freq: 130.81, beats: 1 },
          { freq: 98.0, beats: 1 },
          { freq: 146.83, beats: 1 },
          { freq: 174.61, beats: 1 },
          { freq: 130.81, beats: 1 },
          { freq: 110.0, beats: 1 }
        ]
      },
      {
        // PAD — off-beat sustained chords, the terrace bed.
        wave: 'sawtooth',
        volume: 0.3,
        envelope: 'pad',
        octaveShift: -1,
        melody: [
          { freq: 0, beats: 0.5 },
          { freq: 587.33, beats: 1.5 },
          { freq: 0, beats: 0.5 },
          { freq: 523.25, beats: 1.5 },
          { freq: 0, beats: 0.5 },
          { freq: 493.88, beats: 1.5 },
          { freq: 0, beats: 0.5 },
          { freq: 440.0, beats: 1.5 }
        ]
      }
    ]
  });
  wireChannelButton(el('music-btn'), audio, 'music');
  wireChannelButton(el('sfx-btn'), audio, 'sfx');

  /* ---------------------------------------------------------------- */
  /* state                                                             */

  let screen: Screen = 'title';
  let paused = false;
  let clock = 0;
  let run: RunState | null = null;
  let match: MatchState | null = null;
  let shootout: ShootoutState | null = null;
  let cursor = 0;
  let confirming = false;
  let confirmYes = true;
  /** Counts down the goal celebration's effects; the sim runs its own pause. */
  let goalFx = 0;
  /**
   * Whether the match just finished was a knockout tie. `recordPlayerMatch`
   * advances the stage, so by the time the full-time screen asks, the run no
   * longer remembers what it was watching.
   */
  let lastKnockout = false;
  /** Set once the finished run has been handed to the scoreboard. */
  let submitted = false;

  const score = () => (run ? runScore(run) : 0);

  /** The run's total, banked so a closed tab keeps it, with the record toast. */
  function bank(): void {
    if (!run) return;
    if (board.bank(runScore(run)).newRecord) showToast(`🏅 ${strings.newRecord}`);
  }

  /* ---------------------------------------------------------------- */
  /* input                                                             */

  const keys = new Set<string>();
  /** Analog stick from the touch pad; the keyboard contributes 8-way. */
  const stick = { x: 0, y: 0, active: false };
  const pads = { a: false, b: false, c: false };
  const prevConfirm = { down: false };
  const prevPause = { down: false };
  /**
   * A key tapped and released inside a single frame still counts. Sampling the
   * held state once a frame drops a quick press entirely, which on the static
   * screens means a tap on START doing nothing at all.
   */
  const tapped = { confirm: false, pause: false };
  /** Rising edge on the team-select cursor, so a held stick steps once. */
  const prevCursor = { x: 0, y: 0 };

  const HELD = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'w',
    'a',
    's',
    'd',
    'z',
    'x',
    'c',
    'j',
    'k',
    'l',
    'p',
    ' ',
    'Enter',
    'Escape'
  ]);

  function keyDown(key: string): boolean {
    return keys.has(key) || keys.has(key.toUpperCase());
  }

  function readInput(): MatchInput {
    let kx = 0;
    let ky = 0;
    if (keyDown('ArrowLeft') || keyDown('a')) kx -= 1;
    if (keyDown('ArrowRight') || keyDown('d')) kx += 1;
    if (keyDown('ArrowUp') || keyDown('w')) ky -= 1;
    if (keyDown('ArrowDown') || keyDown('s')) ky += 1;
    let x = kx;
    let y = ky;
    if (stick.active && (kx === 0 && ky === 0)) {
      x = stick.x;
      y = stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return {
      x,
      y,
      a: pads.a || keyDown('z') || keyDown('j') || keys.has(' '),
      b: pads.b || keyDown('x') || keyDown('k'),
      c: pads.c || keyDown('c') || keyDown('l')
    };
  }

  /** Enter, Space, or the A button: the one "yes" every screen listens for. */
  function confirmHeld(): boolean {
    return keys.has('Enter') || keys.has(' ') || pads.a || keyDown('z') || keyDown('j');
  }

  const CONFIRM_KEYS = new Set(['Enter', ' ', 'z', 'j']);
  const PAUSE_KEYS = new Set(['p', 'Escape']);
  const onKeyDown = (e: KeyboardEvent) => {
    if (HELD.has(e.key) || HELD.has(e.key.toLowerCase())) e.preventDefault();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!e.repeat) {
      if (CONFIRM_KEYS.has(key)) tapped.confirm = true;
      if (PAUSE_KEYS.has(key)) tapped.pause = true;
    }
    keys.add(key);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  // Document-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handlers so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },
    { once: true }
  );

  /** Round action button: press and release are reported separately. */
  function wirePad(id: string, key: 'a' | 'b' | 'c'): void {
    const btn = el(id);
    if (!btn) return;
    const press = (e: Event) => {
      e.preventDefault();
      pads[key] = true;
      if (btn instanceof HTMLElement && 'setPointerCapture' in btn && e instanceof PointerEvent) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety, not a requirement */
        }
      }
    };
    const release = () => {
      pads[key] = false;
    };
    btn.addEventListener('pointerdown', press);
    for (const evt of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      btn.addEventListener(evt, release);
    }
    // Keyboard and switch activation fires click with detail 0 and never a
    // pointer event, so without this the aria-labelled buttons are announced
    // and dead. One frame of "held" is enough to register a press-and-release.
    btn.addEventListener('click', e => {
      if ((e as MouseEvent).detail !== 0) return;
      pads[key] = true;
      setTimeout(release, 90);
    });
  }
  wirePad('btn-shoot', 'a');
  wirePad('btn-cross', 'b');
  wirePad('btn-pass', 'c');

  /** Virtual stick: touch anywhere in the pad to set the origin, drag to steer. */
  const stickEl = el('stick');
  const nub = el('stick-nub');
  const DEAD_R = 8;
  const FULL_R = 44;
  if (stickEl) {
    let origin: { x: number; y: number } | null = null;
    let pointer = -1;
    const place = (e: PointerEvent) => {
      const rect = stickEl.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const move = (e: PointerEvent) => {
      if (!origin || e.pointerId !== pointer) return;
      const at = place(e);
      const dx = at.x - origin.x;
      const dy = at.y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len <= DEAD_R) {
        stick.x = 0;
        stick.y = 0;
      } else {
        const mag = Math.min(1, (len - DEAD_R) / (FULL_R - DEAD_R));
        stick.x = (dx / len) * mag;
        stick.y = (dy / len) * mag;
      }
      if (nub) nub.style.transform = `translate(${stick.x * FULL_R}px, ${stick.y * FULL_R}px)`;
    };
    const lift = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      origin = null;
      pointer = -1;
      stick.active = false;
      stick.x = 0;
      stick.y = 0;
      if (nub) nub.style.transform = '';
    };
    stickEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      origin = place(e);
      pointer = e.pointerId;
      stick.active = true;
      try {
        stickEl.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    });
    stickEl.addEventListener('pointermove', move);
    for (const evt of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      stickEl.addEventListener(evt, lift);
    }
  }

  el('btn-pause')?.addEventListener('click', () => togglePause());
  // A tap on the canvas is the arcade's start button on every static screen.
  canvas.addEventListener('click', () => {
    if (screen !== 'match' && screen !== 'shootout') advance();
  });

  function togglePause(): void {
    if (screen !== 'match' && screen !== 'shootout') return;
    paused = !paused;
    if (paused) audio.stop();
    else audio.start();
  }

  /* ---------------------------------------------------------------- */
  /* screen flow                                                       */

  function startRun(): void {
    run = createRun(Math.random, TEAMS[cursor].code);
    submitted = false;
    board.hide();
    board.beginRun();
    bank();
    startMatch();
  }

  /** Tempo lifts stage by stage, so the run is audibly getting harder. */
  function stageTempo(state: RunState): number {
    if (state.stage === 'final') return 152;
    if (state.stage === 'semi') return 143;
    return 132;
  }

  function startMatch(): void {
    if (!run || !run.opponent) return;
    const teams: [Team, Team] = [playerTeam(run), teamByCode(run.opponent)];
    match = createMatch({
      difficulty: difficultyFor(run),
      teams,
      knockout: isKnockout(run)
    });
    shootout = null;
    lastKnockout = isKnockout(run);
    goalFx = 0;
    fx.clear();
    renderer.resetCamera(match);
    screen = 'match';
    paused = false;
    audio.setTempo(stageTempo(run));
    audio.start();
  }

  /** Fold the finished match into the run and move to the full-time screen. */
  function settleMatch(wonOnPenalties: boolean): void {
    if (!run || !match) return;
    audio.stop();
    recordPlayerMatch(run, {
      goalsFor: match.score[0],
      goalsAgainst: match.score[1],
      wonOnPenalties
    });
    bank();
    screen = 'fullTime';
  }

  function finishRun(): void {
    if (!run || submitted) return;
    submitted = true;
    bank();
    audio.playSfx(run.champion ? 'rescue' : 'gameover');
    board.show(runScore(run));
  }

  /** The one "yes" every static screen listens for. */
  function advance(): void {
    switch (screen) {
      case 'title':
        cursor = 0;
        confirming = false;
        confirmYes = true;
        screen = 'select';
        audio.playSfx('blip');
        return;
      case 'select':
        if (!confirming) {
          confirming = true;
          audio.playSfx('blip');
          return;
        }
        if (confirmYes) startRun();
        else confirming = false;
        audio.playSfx('blip');
        return;
      case 'fullTime':
        if (!run) return;
        if (run.over) {
          screen = run.champion ? 'champion' : 'gameOver';
          finishRun();
        } else {
          // A group matchday shows the tables; a won knockout shows the bracket.
          screen = run.stage === 'group' ? 'tables' : 'bracket';
        }
        audio.playSfx('blip');
        return;
      case 'tables':
      case 'bracket':
        startMatch();
        return;
      case 'champion':
      case 'gameOver':
        board.hide();
        run = null;
        match = null;
        screen = 'title';
        return;
      default:
    }
  }

  /* ---------------------------------------------------------------- */
  /* match events                                                      */

  function handleMatchEvents(events: MatchEvent[], m: MatchState): void {
    for (const event of events) {
      switch (event.type) {
        case 'goal': {
          if (event.side === 0 && run) {
            run.liveGoals = m.score[0];
            bank();
          }
          goalFx = GOAL_FX_TIME;
          audio.playSfx(event.side === 0 ? 'rescue' : 'hit');
          // Confetti out of the goalmouth the ball has just crossed.
          const goalY = attackGoalY(event.side, m.swapped);
          for (let i = 0; i < 22; i++) {
            fx.burst(
              CENTRE_X - renderer.camera.x + (Math.random() - 0.5) * 70,
              goalY - renderer.camera.y + (Math.random() - 0.5) * 10,
              1,
              i % 2 === 0 ? '#FFDB00' : '#FFFFFF',
              { speed: 70, life: 0.9, gravity: 1 }
            );
          }
          fx.floater(
            Math.round(VIEW_W / 2),
            Math.round(VIEW_H / 2) - 30,
            strings.goal,
            '#B6FFDB',
            { size: 12, life: 1.3, rise: 10 }
          );
          break;
        }
        case 'save':
          audio.playSfx('blip');
          break;
        case 'post':
          audio.playSfx('blip');
          break;
        case 'shot':
          if (!event.onTarget) audio.playSfx('hit');
          break;
        case 'kickoff':
          renderer.resetCamera(m);
          break;
        case 'halfTime':
        case 'end':
          audio.playSfx('blip');
          break;
        default:
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* update                                                            */

  function update(dt: number): void {
    clock += dt;
    const input = readInput();

    const pauseDown = keys.has('p') || keys.has('Escape');
    if (tapped.pause || (pauseDown && !prevPause.down)) togglePause();
    prevPause.down = pauseDown;
    tapped.pause = false;

    const confirmDown = confirmHeld();
    const confirmEdge = tapped.confirm || (confirmDown && !prevConfirm.down);
    prevConfirm.down = confirmDown;
    tapped.confirm = false;

    if (paused) return;
    goalFx = Math.max(0, goalFx - dt);
    fx.update(dt);

    if (screen === 'select') {
      // The stick steps the grid once per push rather than scrolling it.
      const stepX = Math.abs(input.x) > 0.5 ? Math.sign(input.x) : 0;
      const stepY = Math.abs(input.y) > 0.5 ? Math.sign(input.y) : 0;
      if (!confirming) {
        if (stepX !== 0 && prevCursor.x === 0) {
          cursor = (cursor + stepX + TEAMS.length) % TEAMS.length;
          audio.playSfx('blip');
        }
        if (stepY !== 0 && prevCursor.y === 0) {
          cursor = (cursor + stepY * 4 + TEAMS.length) % TEAMS.length;
          audio.playSfx('blip');
        }
      } else if (stepX !== 0 && prevCursor.x === 0) {
        confirmYes = !confirmYes;
        audio.playSfx('blip');
      }
      prevCursor.x = stepX;
      prevCursor.y = stepY;
    } else {
      prevCursor.x = 0;
      prevCursor.y = 0;
    }

    if (screen === 'match' && match && run) {
      handleMatchEvents(tickMatch(match, dt, input), match);
      if (match.phase === 'over') {
        if (match.pendingShootout) {
          shootout = createShootout({ difficulty: difficultyFor(run) });
          screen = 'shootout';
          audio.stop();
        } else {
          settleMatch(false);
        }
      }
      return;
    }

    if (screen === 'shootout' && shootout) {
      const kick: ShootoutInput = { x: input.x, y: input.y, a: input.a };
      for (const event of tickShootout(shootout, dt, kick)) {
        if (event.type === 'kick') {
          audio.playSfx(event.kick.result === 'scored' ? 'score' : 'blip');
        } else {
          settleMatch(event.winner === 0);
        }
      }
      return;
    }

    if (confirmEdge) advance();
  }

  /* ---------------------------------------------------------------- */
  /* render                                                            */

  function render(): void {
    const total = score();
    const best = board.best();
    switch (screen) {
      case 'title':
        renderer.drawTitle({ clock });
        break;
      case 'select':
        renderer.drawTeamSelect({ clock, cursor, confirming, confirmYes });
        break;
      case 'match':
        if (match) {
          const stick = readInput();
          renderer.drawMatch(match, {
            dt: 1 / 60,
            runScore: total,
            best,
            aimX: stick.x
          });
          if (goalFx > 0) fx.draw(renderer.ctx);
        }
        break;
      case 'shootout':
        if (shootout && match) renderer.drawShootout(shootout, { teams: match.teams });
        break;
      case 'fullTime':
        if (match && run) {
          renderer.drawFullTime({
            match,
            outcome: outcomeWord(),
            runScore: total,
            best
          });
        }
        break;
      case 'tables':
        if (run) renderer.drawTables({ run });
        break;
      case 'bracket':
        if (run) renderer.drawBracket({ run });
        break;
      case 'champion':
        if (run) renderer.drawChampion({ team: playerTeam(run), runScore: total, best });
        break;
      case 'gameOver':
        if (run) renderer.drawGameOver({ run, runScore: total, best });
        break;
      default:
    }
    if (paused) renderer.drawPause();
    renderer.blit(ctx, CANVAS_W, CANVAS_H);
  }

  /**
   * The word under the full-time scorers. A group fixture is none of the three
   * the specification lists — you are not "through" for winning one — so it
   * gets no word and the table screen behind it does the talking.
   */
  function outcomeWord(): string {
    if (!run || !match) return '';
    if (run.over) return run.champion ? strings.champions : strings.gameOver;
    if (!lastKnockout) return '';
    return match.score[0] === match.score[1] ? strings.penalties : strings.through;
  }

  createGameLoop(update, render).start();
}
