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
  loadScore,
  saveScore,
  seededRng,
  wireChannelButton
} from '../engine';
import { BASE_TEMPO, FOOTBALL_MUSIC } from './music';
import { CROWD_COLOURS, PALETTE, createRenderer, integerScale, FB_H, FB_W, type Renderer } from './render';
import { createMatch, tickMatch, type MatchEvent, type MatchInput, type MatchState } from './match';
import { attackGoalY, CENTRE_X, VIEW_H, VIEW_W } from './pitch';
import { ALL_TEAMS, TEAMS, teamByCode, type Team } from './teams';
import {
  ATTRACT_DELAY,
  DEMO_DIFFICULTY,
  DEMO_HALF_SECONDS,
  createDemoDriver,
  demoPairing,
  type DemoDriver
} from './demo';
import {
  SCORE_GOAL,
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

type Screen =
  | 'title'
  | 'attract'
  | 'select'
  | 'match'
  | 'shootout'
  | 'fullTime'
  | 'tables'
  | 'bracket'
  | 'champion'
  | 'gameOver';

/**
 * The hidden side, remembered across visits. `arcade-` prefixed like every
 * other key the cabinets write (`arcade-best-*`, `arcade-initials`,
 * `arcade-music-muted`), and read through the engine's guarded storage helpers
 * so a blocked-cookies browser simply starts locked every time.
 */
const UNLOCK_KEY = 'arcade-unlock-football';

/**
 * Up up down down left right left right B A — on **the cabinet's** B and A.
 *
 * Each step lists every key that satisfies it. The last two steps are the
 * point: this cabinet's B button is `X` or `K` and its A button is `Z` or `J`,
 * which is what the control legend under the canvas tells the player, so those
 * are the keys the code answers to. The letters `b` and `a` stay in as well —
 * they cost nothing, they are what a player who knows the code from elsewhere
 * will reach for, and `a` is already the WASD left key, which only moves the
 * select cursor.
 */
const KONAMI: readonly (readonly string[])[] = [
  ['ArrowUp'],
  ['ArrowUp'],
  ['ArrowDown'],
  ['ArrowDown'],
  ['ArrowLeft'],
  ['ArrowRight'],
  ['ArrowLeft'],
  ['ArrowRight'],
  ['x', 'k', 'b'],
  ['z', 'j', 'a']
];

/**
 * The index at which the code stops being directions and starts being buttons.
 *
 * A key that satisfies one of those two steps is *consumed* by the code: the A
 * button is also the cabinet's confirm, so without this the press that unlocks
 * the hidden side would open the team's YES / NO box underneath the unlock
 * banner at the same instant.
 */
const KONAMI_BUTTONS = 8;

/** Seconds the unlock banner holds over the select grid. */
const UNLOCK_FLASH = 2.4;

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
    attract: s('tAttract', 'PRESS SPACE TO PLAY'),
    unlocked: s('tUnlocked', 'SECRET TEAM UNLOCKED'),
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
      attract: strings.attract,
      unlocked: strings.unlocked,
      ratings
    }
  });

  /**
   * How much of the viewport's height the page keeps for itself, in CSS px.
   *
   * Upright, that is the sticky nav, the section padding, the header row, the
   * tagline, the hint and the instructions, and the number only has to be
   * generous because height is not the binding constraint in a column layout.
   *
   * The landscape block in `football.astro` hides the h1, the tagline, the
   * hint and the instructions and lets the nav scroll away, so what is left is
   * the 44 px header row plus its 4 px margin and the section's 4 px of
   * padding at each end: 56, measured. Reserving 160 there over-reserved by a
   * hundred pixels, and on a 390 px-tall phone that cost a whole integer step
   * — the screen came out at 3x (320 x 224 CSS) inside a wide black bezel when
   * 4x needs only 299 px of the 390.
   *
   * 60 rather than 56 so a rounding or a font metric cannot push the cabinet
   * off the bottom of the fold, and no lower: 54 would buy a third step at
   * dpr 2 as well, and 54 is less than the chrome actually measures.
   *
   * The query is the stylesheet's own and has to stay in step with it.
   */
  const RESERVE = 160;
  const RESERVE_LANDSCAPE = 60;
  const LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';
  const reserve = () => (window.matchMedia(LANDSCAPE).matches ? RESERVE_LANDSCAPE : RESERVE);

  /**
   * Size the visible canvas so one framebuffer pixel is always the same whole
   * block of device pixels.
   *
   * The engine's `setupHiDpiCanvas` is the right tool for a game that draws in
   * logical units and lets CSS own the box — but this cabinet's whole premise
   * is that CSS must *not* own the box. Its contract sizes the backing store
   * from whatever width the stylesheet ended up with (and clamps the ratio at
   * 3), which is exactly how a 960-wide framebuffer came to be painted into a
   * 716 px box and lost a quarter of its rows to the browser's resampler. So
   * the box is computed here instead: pick the largest whole scale that fits
   * the container in device pixels, make the backing store exactly that, and
   * hand CSS the matching size in CSS pixels. The canvas is centred by the
   * stylesheet, and the black `.game-area` behind it is the letterbox.
   */
  let scale = 0;
  let scaleDpr = 0;
  function fitCanvas(): void {
    const box = canvas.parentElement;
    const availW = box ? box.clientWidth : FB_W;
    // Height is never the binding constraint at 320:224 inside a column
    // layout, but a landscape phone is exactly where it would be.
    const availH = Math.max(FB_H, window.innerHeight - reserve());
    const dpr = window.devicePixelRatio || 1;
    const next = integerScale(availW, availH, dpr);
    // The ratio is part of the answer, not just the scale: the same whole
    // scale at a different dpr is a different CSS box.
    if (next === scale && dpr === scaleDpr) return;
    scale = next;
    scaleDpr = dpr;
    canvas.width = FB_W * scale;
    canvas.height = FB_H * scale;
    // Assigning width wipes the context state, smoothing included.
    ctx.imageSmoothingEnabled = false;
    // The CSS box is the backing store divided by the device ratio, so it
    // covers exactly `FB_W * scale` device pixels — a 1:1 blit, no resampling.
    canvas.style.width = `${(FB_W * scale) / dpr}px`;
    canvas.style.height = `${(FB_H * scale) / dpr}px`;
  }
  fitCanvas();

  // devicePixelRatio changes on zoom (which fires resize) but also when the
  // window moves to a different-DPR monitor at the same CSS size, which fires
  // nothing else — the same matchMedia trick the engine helper uses, re-armed
  // after each change, and unhooked with the DOM it measures.
  let dprQuery: MediaQueryList | null = null;
  const onDisplayChange = () => {
    if (!canvas.isConnected) {
      unhookDisplay();
      return;
    }
    fitCanvas();
    watchDpr();
  };
  function watchDpr(): void {
    const query = `(resolution: ${window.devicePixelRatio || 1}dppx)`;
    if (dprQuery?.matches && dprQuery.media === query) return;
    dprQuery?.removeEventListener('change', onDisplayChange);
    dprQuery = window.matchMedia(query);
    dprQuery.addEventListener('change', onDisplayChange, { once: true });
  }
  function unhookDisplay(): void {
    window.removeEventListener('resize', onDisplayChange);
    dprQuery?.removeEventListener('change', onDisplayChange);
    document.removeEventListener('astro:before-swap', unhookDisplay);
  }
  watchDpr();
  window.addEventListener('resize', onDisplayChange);
  document.addEventListener('astro:before-swap', unhookDisplay);

  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea as HTMLElement);
  const board = initScoreboard(el('highscores'));

  /**
   * The engine owns the celebration's physics; `render.ts` owns its pixels.
   *
   * Particles and floaters land in the framebuffer, before the blit, so a goal
   * burst is the same chunky size as everything else on screen — but the
   * engine draws floaters with `ctx.fillText` in a system font and fades both
   * kinds under `globalAlpha`, and 8.1 forbids anti-aliasing and alpha
   * blending in the pixel layer. So `burst`, `emit`, `update` and `clear` are
   * the engine's as the shared channel requires, and `renderer.drawEffects`
   * reads its arrays and rasterises them as whole-pixel squares and bitmap
   * words. `size: 1` makes a particle a 2 x 2 block of framebuffer pixels.
   */
  const fx = createEffects({
    gravityScale: 200,
    burstSpeed: 60,
    burstSize: 1,
    glowBlur: 0,
    floaterRise: 14,
    floaterLife: 1.4
  });

  /**
   * One arrangement, wound up stage by stage with `setTempo`.
   *
   * The specification asks for three separate match tracks. `createGameAudio`
   * fixes its voices at construction and owns an AudioContext, so three of them
   * would mean three contexts and a mute toggle that has to be re-wired every
   * time the stage changes; the anthem stays and the knockout rounds lean on
   * the tempo, which is the part of "the run has an arc" a player actually
   * hears. The score itself lives in `music.ts`, as every cabinet's does.
   */
  const audio = createGameAudio(FOOTBALL_MUSIC);
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
  /**
   * Whether the match just finished was a knockout tie. `recordPlayerMatch`
   * advances the stage, so by the time the full-time screen asks, the run no
   * longer remembers what it was watching.
   */
  let lastKnockout = false;
  /** Set once the finished run has been handed to the scoreboard. */
  let submitted = false;
  /**
   * The attract-mode demo. Deliberately its own variable rather than `match`:
   * nothing that settles a match, banks a score or touches the scoreboard can
   * reach a demo, because a demo has no `RunState` to settle into.
   */
  let demo: MatchState | null = null;
  let driveDemo: DemoDriver = createDemoDriver();
  /** Idle seconds on the title screen; at ATTRACT_DELAY the demo starts. */
  let idle = 0;
  /** True once the Konami code has revealed the thirteenth side. */
  let unlocked = loadScore(UNLOCK_KEY) === 1;
  /** Counts the unlock banner down over the select grid. */
  let unlockFlash = 0;
  /** How far into the Konami sequence the select screen has got. */
  let konami = 0;

  /** The roster the select grid is showing: twelve, or thirteen once unlocked. */
  const roster = (): readonly Team[] => (unlocked ? ALL_TEAMS : TEAMS);

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
   * Set when the Konami code eats a press of the A button, cleared when the
   * confirm is released: the unlock and the team's YES / NO box share a key,
   * and only one of them may answer a given press.
   */
  let swallowConfirm = false;
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
  /**
   * Keys the cabinet swallows outright: everything it steers or fires with,
   * plus `b`, which is only here because the layout's site-wide Konami code
   * would otherwise be listening over the cabinet's own.
   */
  const SWALLOWED = new Set([...HELD, 'b']);

  /**
   * True while the keystroke belongs to the page rather than the cabinet.
   *
   * Capturing keys before they reach the document is what keeps the layout's
   * site-wide Konami handler out of a match, but the same capture must not eat
   * the page's own keyboard. A text field (the high-score initials box) owns
   * every key it is given. A focused button or link owns only the two keys
   * that activate it, so the sound toggles and the back link still work from
   * the keyboard while the arrows and the action keys keep steering the game.
   */
  const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const ACTIVATE_KEYS = new Set([' ', 'Enter']);
  function pageOwnsKey(target: EventTarget | null, key: string): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (TEXT_TAGS.has(target.tagName) || target.isContentEditable) return true;
    return ACTIVATE_KEYS.has(key) && (target.tagName === 'BUTTON' || target.tagName === 'A');
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (pageOwnsKey(e.target, e.key)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (SWALLOWED.has(e.key) || SWALLOWED.has(key)) {
      e.preventDefault();
      // Capture-phase, so this is the cabinet claiming the key before it can
      // reach anything else on the page — specifically the layout's own Konami
      // handler, which listens on `document` and would otherwise fire its
      // arcade overlay in the middle of a match. The guard above keeps the
      // high-score initials box typable.
      e.stopPropagation();
    }
    if (!e.repeat) {
      // The code is fed first: a press it consumes is not also a confirm, and
      // it stays swallowed until the key comes back up so neither the tap nor
      // the held-edge path can open the YES / NO box behind the unlock.
      const konamiTook = feedKonami(e.key.length === 1 ? key : e.key);
      if (konamiTook) swallowConfirm = true;
      if (CONFIRM_KEYS.has(key) && !konamiTook) tapped.confirm = true;
      if (PAUSE_KEYS.has(key)) tapped.pause = true;
    }
    keys.add(key);
  };
  // Releases are never filtered: a key that went down on the canvas and came
  // up over a focused button would otherwise stay "held" forever, which reads
  // as a player at the controls and would keep attract mode from ever running.
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  // Window-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handlers so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    },
    { once: true }
  );

  /**
   * The cabinet's own Konami code, live on the team-select screen only.
   *
   * It shares its ten keys with the site-wide easter egg in `Layout.astro`,
   * which is why `onKeyDown` captures and stops those keys: on this page the
   * cabinet answers the code, and the site's arcade overlay stays shut.
   */
  function feedKonami(key: string): boolean {
    if (screen !== 'select') {
      konami = 0;
      return false;
    }
    const matched = KONAMI[konami].includes(key);
    if (matched) konami += 1;
    else konami = KONAMI[0].includes(key) ? 1 : 0;
    // A button step the code has just eaten belongs to the code, not to the
    // screen underneath it.
    const consumed = matched && konami > KONAMI_BUTTONS;
    if (konami >= KONAMI.length) {
      konami = 0;
      revealSecretTeam();
    }
    return consumed;
  }

  /** Put the thirteenth side on the grid, remember it, and make a fuss. */
  function revealSecretTeam(): void {
    if (!unlocked) {
      unlocked = true;
      saveScore(UNLOCK_KEY, 1);
    }
    confirming = false;
    cursor = roster().length - 1;
    unlockFlash = UNLOCK_FLASH;
    audio.playSfx('rescue');
  }

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
    run = createRun(Math.random, roster()[cursor].code);
    submitted = false;
    board.hide();
    board.beginRun();
    bank();
    startMatch();
  }

  /**
   * Tempo lifts stage by stage, so the run is audibly getting harder.
   *
   * The ramp is policy about the game and stays here; the pace the score was
   * written at is a property of the arrangement and comes from `music.ts` as
   * `BASE_TEMPO`, the same split Cascade uses. Changing stage mid-loop is safe:
   * the engine's `setTempo` rescales every pending voice cursor by the tempo
   * ratio, so the sustained choir re-times with the plucked voices instead of
   * sliding behind them.
   */
  function stageTempo(state: RunState): number {
    if (state.stage === 'final') return 152;
    if (state.stage === 'semi') return 143;
    return BASE_TEMPO;
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

  /* ---------------------------------------------------------------- */
  /* attract mode                                                      */

  /**
   * Start the cabinet demoing itself: an ordinary match with an AI driver on
   * the stick, seeded so the same demo replays from the same number.
   *
   * It borrows nothing from the run and gives nothing back — no `RunState`, no
   * `bank()`, no `board` call anywhere in the attract path — so a demo can
   * neither submit a score nor move the personal best.
   */
  function enterAttract(): void {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const rng = seededRng(seed);
    const [home, away] = demoPairing(rng, TEAMS);
    demo = createMatch({
      rng,
      difficulty: DEMO_DIFFICULTY,
      teams: [TEAMS[home], TEAMS[away]],
      halfSeconds: DEMO_HALF_SECONDS
    });
    driveDemo = createDemoDriver();
    fx.clear();
    renderer.resetCamera(demo);
    screen = 'attract';
    idle = 0;
  }

  /** Drop the demo on the floor. Any input at all does this. */
  function exitAttract(): void {
    demo = null;
    fx.clear();
    screen = 'title';
    idle = 0;
  }

  /** The one "yes" every static screen listens for. */
  function advance(): void {
    switch (screen) {
      case 'attract':
        exitAttract();
        cursor = 0;
        confirming = false;
        confirmYes = true;
        screen = 'select';
        audio.playSfx('blip');
        return;
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
          // The box always opens on YES. Leaving the last answer in place
          // meant that backing out of one team opened the next one pre-set to
          // NO, so the obvious second press cancelled it too — a cursor that
          // remembers a *refusal* is a cursor that punishes changing your
          // mind.
          confirmYes = true;
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

  /**
   * The goal moment: the loudest thing the cabinet does.
   *
   * Three layers, all of them pixels. Confetti bursts out of the goalmouth the
   * ball has just crossed, in the scoring side's own kit colours so you can
   * see whose goal it was without reading the score. A second shower rains
   * down the full width of the playfield from above the top of the screen,
   * which is the terrace emptying its confetti onto the pitch. And the points
   * the goal is worth float up in the bitmap font over the mouth, because
   * every point gain is announced where it lands. The big `GOAL!` banner over
   * the middle comes free with the match's own `goal` phase.
   */
  function celebrate(side: 0 | 1, m: MatchState): void {
    audio.playSfx(side === 0 ? 'rescue' : 'hit');
    const kit = m.teams[side];
    const goalY = attackGoalY(side, m.swapped);
    const mouthX = CENTRE_X - renderer.camera.x;
    const mouthY = goalY - renderer.camera.y;
    for (let i = 0; i < 36; i++) {
      fx.burst(
        Math.round(mouthX + (Math.random() - 0.5) * 76),
        Math.round(mouthY + (Math.random() - 0.5) * 12),
        1,
        i % 3 === 0 ? PALETTE.white : i % 3 === 1 ? kit.primary : kit.trim,
        { speed: 78, life: 1, gravity: 1 }
      );
    }
    // The terrace shower: slow, wide, and drawn over the whole playfield.
    for (let i = 0; i < 26; i++) {
      fx.emit({
        x: Math.round(Math.random() * VIEW_W),
        y: -Math.round(Math.random() * 40),
        vx: (Math.random() - 0.5) * 18,
        vy: 40 + Math.random() * 40,
        life: 1.6,
        color: CROWD_COLOURS[i % CROWD_COLOURS.length],
        gravity: 0.4
      });
    }
    // Only the player's own goals pay: a conceded one earns nothing, and a
    // demo earns nothing at all, so neither claims a number it did not bank.
    if (side === 0 && run && !demo) {
      fx.floater(
        Math.round(Math.min(Math.max(mouthX, 40), VIEW_W - 40)),
        Math.round(Math.min(Math.max(mouthY, 40), VIEW_H - 40)),
        `+${SCORE_GOAL}`,
        PALETTE.bannerText
      );
    }
  }

  function handleMatchEvents(events: MatchEvent[], m: MatchState): void {
    for (const event of events) {
      switch (event.type) {
        case 'goal': {
          if (event.side === 0 && run) {
            run.liveGoals = m.score[0];
            bank();
          }
          celebrate(event.side, m);
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
    if (!confirmDown) swallowConfirm = false;
    const confirmEdge = !swallowConfirm && (tapped.confirm || (confirmDown && !prevConfirm.down));
    prevConfirm.down = confirmDown;
    tapped.confirm = false;

    if (paused) return;
    fx.update(dt);

    if (screen === 'select') {
      unlockFlash = Math.max(0, unlockFlash - dt);
      const size = roster().length;
      // The stick steps the grid once per push rather than scrolling it.
      const stepX = Math.abs(input.x) > 0.5 ? Math.sign(input.x) : 0;
      const stepY = Math.abs(input.y) > 0.5 ? Math.sign(input.y) : 0;
      if (!confirming) {
        if (stepX !== 0 && prevCursor.x === 0) {
          cursor = (cursor + stepX + size) % size;
          audio.playSfx('blip');
        }
        if (stepY !== 0 && prevCursor.y === 0) {
          cursor = (cursor + stepY * 4 + size) % size;
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

    // Attract mode. Any input at all drops the demo; a confirming one carries
    // straight on into team select through the title case below, which is what
    // "press start and you are playing" means on a cabinet.
    if (screen === 'attract') {
      if (touched(input) || confirmEdge) exitAttract();
      else if (demo) {
        // A hidden tab gets no simulation: rAF is already throttled there, and
        // a demo nobody can see should cost nothing when it resumes either.
        if (document.hidden) return;
        handleMatchEvents(tickMatch(demo, dt, driveDemo(demo, dt)), demo);
        if (demo.phase === 'over') exitAttract();
        return;
      }
    }

    if (confirmEdge) advance();

    // The idle clock only runs on the title screen, and any touch resets it.
    if (screen === 'title') {
      if (touched(input) || confirmEdge) idle = 0;
      else idle += dt;
      if (idle >= ATTRACT_DELAY) enterAttract();
    }
  }

  /** True when the player is doing anything at all this frame. */
  function touched(input: MatchInput): boolean {
    return (
      keys.size > 0 ||
      pads.a ||
      pads.b ||
      pads.c ||
      stick.active ||
      input.a ||
      input.b ||
      input.c ||
      input.x !== 0 ||
      input.y !== 0
    );
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
      case 'attract':
        if (demo) {
          // The demo's HUD is the real HUD: clock, codes, score and radar all
          // live. Only the run totals are zero, because a demo banks nothing.
          renderer.drawMatch(demo, { dt: 1 / 60, runScore: 0, best, attract: true });
          renderer.drawEffects(fx);
        }
        break;
      case 'select':
        renderer.drawTeamSelect({ clock, cursor, confirming, confirmYes, unlocked, unlockFlash });
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
          renderer.drawEffects(fx);
        }
        break;
      case 'shootout':
        if (shootout && match) renderer.drawShootout(shootout, { teams: match.teams, kits: match.kits });
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
    // The backing store is exactly FB x scale, so this blit is one whole-pixel
    // copy with nothing left over to letterbox.
    renderer.blit(ctx, canvas.width, canvas.height);
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
