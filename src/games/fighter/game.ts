/**
 * STREET CHAMPION: the arcade's one-on-one fighter, after Street Fighter II:
 * The World Warrior (Capcom, 1991).
 *
 * The rules live in `fight.ts`, `arcade.ts` and their neighbours (DOM-free,
 * played headlessly by the tests); `render.ts` draws into a 384 x 224
 * framebuffer; `input.ts` reads the control panel; `music.ts`, `sound.ts` and
 * `announcer.ts` are the ears. This module owns the wiring: the page, the
 * integer-scaled canvas, the loop, which event becomes which spark, call,
 * sound or stinger, the scoreboard and the overlays. It expects the markup in
 * src/pages/[lang]/fun/fighter.astro.
 */
import { createGameAudio, createGameLoop, createToaster, initScoreboard, listenUntilSwap, mountCabinet, wireSoundToggles } from '../engine';
import { cpuInput, createCpu, type Cpu } from './ai';
import { createAnnouncer, type AnnouncerLine } from './announcer';
import {
  ENDING_FRAMES,
  continueCredit,
  createArcade,
  createDemo,
  opponent,
  tickArcade,
  type ArcadeEvent,
  type ArcadeState
} from './arcade';
import { drawTextCentred } from '../football/font';
import { createBonus, type FightState } from './fight';
import { createControlPanel } from './input';
import { ENDINGS, FIGHTER_MUSIC, SCENES, STINGERS, tempoFor, type MusicTheme } from './music';
import { ctx2d, makeCanvas } from './pix';
import { FB_H, FB_W, createRenderer, type FightView, type Labels } from './render';
import { FIGHTERS, type CharId } from './roster';
import { createFightSound } from './sound';
import { paintStage, type StageArt, type StageId } from './stages';

type Phase = 'title' | 'play' | 'paused' | 'over';

/** Which tune each home stage plays. */
const THEME_OF: Record<CharId, MusicTheme> = {
  kenji: 'japan',
  tora: 'japan',
  ace: 'usa',
  duke: 'usa',
  mei: 'china',
  boris: 'ussr',
  raj: 'india',
  rio: 'brazil',
  rocko: 'vegas',
  varga: 'spain',
  sakda: 'thailand',
  zar: 'final'
};

/** The largest whole multiple of the framebuffer that fits, in device pixels. */
export function integerScale(availW: number, availH: number, dpr: number): number {
  return Math.max(1, Math.min(Math.floor((availW * dpr) / FB_W), Math.floor((availH * dpr) / FB_H)));
}

export function initFighterGame(): void {
  const mounted = mountCabinet('fighter-root');
  if (!mounted) return;
  const { root, canvas, ctx, el } = mounted;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const versusBtn = el('versus-btn');
  const continueBtn = el('continue-btn');
  const againBtn = el('again-btn');
  const finalScoreEl = el('final-score');
  const overTitle = el('over-title');
  const overDesc = el('over-desc');
  const touchPad = document.getElementById('touch-pad');

  const t = (key: string): string => root.dataset[key] ?? '';
  const labels: Labels = JSON.parse(document.getElementById('fighter-labels')?.textContent || '{}');
  const strings = {
    paused: t('tPaused'),
    newRecord: t('tNewRecord'),
    gameOver: t('tGameOver'),
    gameOverDesc: t('tGameOverDesc'),
    champion: t('tChampion'),
    championDesc: t('tChampionDesc'),
    continueAgainst: t('tContinueAgainst')
  };
  const showToast = createToaster(document.getElementById('toast-area')).show;

  // --- The screen: a framebuffer blitted at a whole scale -----------------------
  const fb = makeCanvas(FB_W, FB_H);
  const fbCtx = ctx2d(fb);
  let scale = 0;
  let scaleDpr = 0;
  function fitCanvas(): void {
    const box = canvas.parentElement;
    const availW = box ? box.clientWidth : FB_W;
    const availH = Math.max(FB_H, window.innerHeight - 120);
    const dpr = window.devicePixelRatio || 1;
    const next = integerScale(availW, availH, dpr);
    if (next === scale && dpr === scaleDpr) return;
    scale = next;
    scaleDpr = dpr;
    canvas.width = FB_W * scale;
    canvas.height = FB_H * scale;
    ctx.imageSmoothingEnabled = false;
    canvas.style.width = `${(FB_W * scale) / dpr}px`;
    canvas.style.height = `${(FB_H * scale) / dpr}px`;
  }
  fitCanvas();
  listenUntilSwap(window, 'resize', fitCanvas);

  const renderer = createRenderer();
  const stageCache = new Map<StageId, StageArt>();
  const stageArt = (id: StageId): StageArt => {
    let art = stageCache.get(id);
    if (!art) {
      art = paintStage(id);
      stageCache.set(id, art);
    }
    return art;
  };

  // --- Sound ----------------------------------------------------------------------
  const audio = createGameAudio(FIGHTER_MUSIC);
  wireSoundToggles(audio);
  const sound = createFightSound(audio);
  const announcer = createAnnouncer(audio);
  document.addEventListener('astro:before-swap', () => announcer.dispose(), { once: true });
  document.getElementById('sfx-btn')?.addEventListener('click', () => announcer.refresh());
  let theme: MusicTheme = 'select';
  let danger = false;
  function setTheme(next: MusicTheme) {
    theme = next;
    danger = false;
    audio.setScene(SCENES[next]);
    audio.setTempo(tempoFor(next, false));
  }
  function setDanger(on: boolean) {
    if (on === danger) return;
    danger = on;
    audio.setTempo(tempoFor(theme, on));
  }
  const say = (line: AnnouncerLine) => announcer.say(line);

  // --- State ------------------------------------------------------------------------
  const board = initScoreboard(document.getElementById('highscores'));
  let phase: Phase = 'title';
  let arcade: ArcadeState = createDemo(Math.floor(Math.random() * 1e6));
  let clock = 0;
  let devInputs: ReturnType<typeof panel.read> | null = null;
  /** The #dev handle's CPU in player one's seat. */
  let autopilot: Cpu | null = null;
  let view: Omit<FightView, 'fight' | 'art' | 'alt' | 'clock' | 'score' | 'hi' | 'sides' | 'labels'> = freshView();
  /** Frames since the ending started, for when the board comes up. */
  let endingShownAt = -1;

  function freshView() {
    return {
      sparks: [] as FightView['sparks'],
      floaters: [] as FightView['floaters'],
      drain: [0, 0] as [number, number],
      shake: 0,
      call: null as FightView['call'],
      combo: null as FightView['combo'],
      tally: null as FightView['tally'],
      excite: 0,
      bonusResult: null as FightView['bonusResult']
    };
  }

  const panel = createControlPanel((target, type, handler) => listenUntilSwap(target, type, handler), () => phase === 'play', touchPad);

  function stageOf(s: ArcadeState): StageId {
    if (s.screen === 'bonus') return s.bonus === 'drums' ? 'drums' : 'car';
    const opp = s.screen === 'demo' ? s.chosen[1] : opponent(s);
    return (opp ?? 'kenji') as StageId;
  }

  // --- Lifecycle --------------------------------------------------------------------
  function startGame(mode: 'arcade' | 'versus') {
    arcade = createArcade(mode, Math.floor(Math.random() * 1e6));
    view = freshView();
    phase = 'play';
    panel.release();
    if (mode === 'arcade') board.beginRun();
    audio.setPaused(false);
    audio.start();
    setTheme('select');
    sound.play('confirm');
  }

  function endCredit(won: boolean) {
    phase = 'over';
    panel.release();
    if (!audio.playEnding(won ? ENDINGS.ending : ENDINGS.gameOver)) audio.stop();
    bank();
    finalScoreEl.textContent = arcade.score.toLocaleString('en-US');
    overTitle.textContent = won ? strings.champion : strings.gameOver;
    overDesc.textContent = won ? strings.championDesc : strings.gameOverDesc;
    const opp = opponent(arcade);
    continueBtn.style.display = won || !opp ? 'none' : '';
    if (opp) continueBtn.textContent = strings.continueAgainst.replace('{name}', FIGHTERS[opp].name);
    overOverlay.style.display = 'flex';
    board.show(arcade.score);
  }

  function bank() {
    if (arcade.mode !== 'arcade' || arcade.screen === 'demo') return;
    const { newRecord } = board.bank(arcade.score);
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
  }

  // --- Events -----------------------------------------------------------------------
  function call(text: string, kind: NonNullable<FightView['call']>['kind']) {
    view.call = { text, t: 0, kind };
  }

  function handle(events: ArcadeEvent[]) {
    const f = arcade.fight;
    const demo = arcade.screen === 'demo';
    const quiet = demo || phase !== 'play';
    for (const e of events) {
      switch (e.type) {
        case 'screen':
          view = freshView();
          if (e.screen === 'select') setTheme('select');
          if (e.screen === 'versus') {
            audio.playStinger(STINGERS.versus);
            if (arcade.mode === 'versus') setTheme(THEME_OF[arcade.chosen[1] as CharId]);
          }
          if (e.screen === 'map' && arcade.mode === 'arcade') setTheme('select');
          if (e.screen === 'fight') {
            if (arcade.mode === 'arcade') setTheme(THEME_OF[opponent(arcade) as CharId]);
            const fight = arcade.fight as FightState;
            view.drain = [fight.fighters[0].health, fight.fighters[1]?.health ?? 0];
          }
          if (e.screen === 'bonus') setTheme('bonus');
          if (e.screen === 'ending') {
            setTheme('ending');
            say('congratulations');
            endingShownAt = clock;
          }
          break;
        case 'cursor':
          sound.play('cursor');
          break;
        case 'chosen':
          sound.play('confirm');
          break;
        case 'roundCall':
          call(e.final ? 'FINAL ROUND' : `ROUND ${e.round}`, 'round');
          if (!quiet) {
            say(e.final ? 'finalRound' : (`round${Math.min(4, e.round)}` as AnnouncerLine));
            audio.playStinger(STINGERS.roundStart);
          }
          if (f) view.drain = [f.fighters[0].health, f.fighters[1]?.health ?? 0];
          if (!quiet) setDanger(false);
          break;
        case 'fight':
          call('FIGHT!', 'fight');
          if (!quiet) say('fight');
          break;
        case 'swing':
          if (!quiet) sound.play(e.strength === 2 ? 'swingHeavy' : 'swingLight');
          break;
        case 'hit': {
          const kind = e.blocked ? 'block' : e.strength === 2 || e.kind === 'throw' ? 'heavy' : e.strength === 1 ? 'medium' : 'light';
          view.sparks.push({ x: e.x, y: e.y, t: 0, kind, dir: 1, seed: clock });
          if (!quiet) sound.play(e.blocked ? 'block' : e.kind === 'projectile' ? 'projectileHit' : kind === 'heavy' ? 'hitHeavy' : kind === 'medium' ? 'hitMedium' : 'hitLight');
          if (!e.blocked) {
            view.shake = Math.max(view.shake, e.strength === 2 ? 3 : 1);
            view.excite = Math.min(1, view.excite + 0.25);
          }
          break;
        }
        case 'points':
          if (!demo && e.side === 0 && arcade.mode === 'arcade') view.floaters.push({ x: e.x, y: e.y + 20, t: 0, text: `+${e.points}`, colour: '#f8d818' });
          break;
        case 'combo':
          view.combo = { side: e.side, hits: e.hits, t: 0 };
          break;
        case 'special':
          if (quiet) break;
          if (e.kind === 'projectile') sound.play('projectile');
          else if (e.kind === 'breath') sound.play('flame');
          else if (e.kind === 'rapid' && f?.fighters[0]?.def.build === 'beast') sound.play('electric');
          else sound.play('swingHeavy');
          break;
        case 'clash':
          view.sparks.push({ x: e.x, y: e.y, t: 0, kind: 'clash', dir: 1, seed: clock });
          if (!quiet) sound.play('projectileClash');
          break;
        case 'land':
          if (!quiet) sound.play('land');
          break;
        case 'knockdown':
          view.sparks.push({ x: e.x, y: 0, t: 0, kind: 'dust', dir: 1, seed: clock });
          view.shake = Math.max(view.shake, 4);
          if (!quiet) sound.play('knockdown');
          break;
        case 'throw':
          if (!quiet) sound.play('throw');
          break;
        case 'dizzy':
          if (!quiet) sound.play('dizzy');
          break;
        case 'ko':
          break;
        case 'timeOver':
          call('TIME OVER', 'round');
          if (!quiet) say('timeOver');
          break;
        case 'roundEnd':
          if (!f) break;
          view.excite = 1;
          if (f.mode === 'bonus') break;
          break;
        case 'roundBonus':
          if (!demo && arcade.mode === 'arcade' && e.side === 0) view.tally = { time: e.time, vitality: e.vitality, perfect: e.perfect, t: 0 };
          break;
        case 'matchEnd':
          if (e.winner === null) {
            call('DRAW GAME', 'result');
            if (!quiet) say('drawGame');
          }
          break;
        case 'target':
          if (!quiet) sound.play(e.kind === 'drum' ? 'clank' : e.destroyed ? 'shatter' : 'crash');
          view.sparks.push({ x: e.x, y: e.y, t: 0, kind: e.destroyed ? 'debris' : 'heavy', dir: 1, seed: clock });
          view.shake = Math.max(view.shake, e.destroyed ? 5 : 2);
          break;
        case 'bonusEnd':
          view.bonusResult = { cleared: e.cleared, bonus: e.bonus, t: 0 };
          if (!quiet) {
            if (e.cleared) {
              audio.playStinger(STINGERS.bonusClear);
              say('perfect');
            } else say('timeOver');
          }
          break;
        case 'danger':
          if (!quiet) setDanger(e.on);
          break;
        case 'score':
          bank();
          break;
        case 'creditOver':
          if (!e.won) endCredit(false);
          break;
      }
    }
    // KO and round results are read from the fight's phase, which knows who fell.
    if (f && !demo) narrateRound(f, quiet);
  }

  /** The KO call, the slow fall, then the result, timed off the fight's own clock. */
  let narrated = '';
  function narrateRound(f: FightState, quiet: boolean) {
    const key = `${f.round}:${f.phase}`;
    if (f.phase === 'ko' && f.phaseFrame === 1 && narrated !== key) {
      narrated = key;
      const both = f.fighters.every(x => x && x.health <= 0);
      call(both ? 'DOUBLE K.O.' : 'K.O.', 'ko');
      view.shake = 8;
      if (!quiet) {
        sound.play('ko');
        say(both ? 'doubleKo' : 'ko');
        audio.playStinger(STINGERS.ko);
      }
    }
    if (f.phase === 'roundEnd' && f.phaseFrame === 50 && narrated !== key && f.mode === 'match') {
      narrated = key;
      const w = f.roundWinner;
      if (w === null) {
        call(f.doubleKo ? 'DOUBLE K.O.' : 'DRAW', 'result');
        return;
      }
      const name = (f.fighters[w] as NonNullable<FightState['fighters'][1]>).def.name;
      const text = f.perfect ? 'PERFECT' : arcade.mode === 'arcade' ? (w === 0 ? 'YOU WIN' : 'YOU LOSE') : `${name} WINS`;
      call(text, 'result');
      if (!quiet) {
        if (f.perfect) say('perfect');
        else if (arcade.mode === 'arcade') say(w === 0 ? 'youWin' : 'youLose');
        audio.playStinger(f.perfect ? STINGERS.perfect : arcade.mode === 'arcade' && w === 1 ? STINGERS.youLose : STINGERS.youWin);
      }
    }
  }

  // --- Pause ------------------------------------------------------------------------
  function setPaused(on: boolean) {
    if (on && phase === 'play') {
      phase = 'paused';
      panel.release();
      audio.setPaused(true);
      announcer.setPaused(true);
    } else if (!on && phase === 'paused') {
      phase = 'play';
      audio.setPaused(false);
      announcer.setPaused(false);
    }
  }
  listenUntilSwap(document, 'keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (phase === 'play') setPaused(true);
      else if (phase === 'paused') setPaused(false);
    }
  });
  const onVisibility = () => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:before-swap', () => document.removeEventListener('visibilitychange', onVisibility), { once: true });
  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (phase === 'play') setPaused(true);
    else if (phase === 'paused') setPaused(false);
  });
  canvas.addEventListener('pointerdown', () => {
    if (phase === 'paused') setPaused(false);
  });
  listenUntilSwap(window, 'blur', () => panel.release());

  // --- Loop ---------------------------------------------------------------------------
  function update() {
    clock++;
    for (const s of view.sparks) s.t++;
    view.sparks = view.sparks.filter(s => s.t < (s.kind === 'dust' ? 20 : s.kind === 'debris' ? 50 : 12));
    for (const fl of view.floaters) fl.t++;
    view.floaters = view.floaters.filter(fl => fl.t < 60);
    if (view.call) {
      view.call.t++;
      if (view.call.t > (view.call.kind === 'ko' ? 110 : view.call.kind === 'result' ? 120 : view.call.kind === 'fight' ? 40 : 66)) view.call = null;
    }
    if (view.combo && ++view.combo.t > 70) view.combo = null;
    if (view.tally) view.tally.t++;
    if (view.bonusResult) view.bonusResult.t++;
    view.shake = Math.max(0, view.shake - 0.4);
    view.excite = Math.max(0, view.excite - 0.004);
    const f = arcade.fight;
    if (f) {
      f.fighters.forEach((x, i) => {
        if (!x) return;
        if (view.drain[i] > x.health) view.drain[i] = Math.max(x.health, view.drain[i] - 0.7);
        else view.drain[i] = x.health;
      });
    }
    if (phase === 'paused' || phase === 'over') return;
    if (phase === 'title') {
      // Attract mode: the demo plays itself and the panel is ignored.
      handle(tickArcade(arcade, panel.read(false)));
      return;
    }
    if (panel.startPressed() && arcade.screen === 'ending' && clock - endingShownAt > ENDING_FRAMES) endCredit(true);
    if (arcade.screen === 'ending' && clock - endingShownAt === ENDING_FRAMES * 2) endCredit(true);
    let inputs = devInputs ?? panel.read(arcade.mode === 'versus');
    if (autopilot && arcade.fight && (arcade.screen === 'fight' || arcade.screen === 'bonus')) inputs = [cpuInput(autopilot, arcade.fight, 0), inputs[1]];
    handle(tickArcade(arcade, inputs));
    if (arcade.screen === 'ending' && clock - endingShownAt > ENDING_FRAMES && (inputs[0].pressed || inputs[1].pressed)) endCredit(true);
  }

  function render() {
    const s = arcade;
    const g = fbCtx;
    switch (s.screen) {
      case 'demo':
      case 'fight':
      case 'bonus': {
        const f = s.fight as FightState;
        const demo = s.screen === 'demo';
        renderer.fightScene(g, {
          ...view,
          fight: f,
          art: stageArt(stageOf(s)),
          alt: [s.alt[0], s.mode === 'versus' ? s.alt[1] : s.chosen[0] === s.chosen[1] ? !s.alt[0] : false],
          clock,
          score: s.score,
          hi: s.mode === 'arcade' ? Math.max(board.best(), s.score) : -1,
          sides: s.mode === 'versus' ? ['1P', '2P'] : demo ? ['CPU', 'CPU'] : ['1P', 'CPU'],
          labels
        });
        if (demo && phase === 'title' && clock % 60 < 40) renderer.title(g, clock, labels);
        break;
      }
      case 'select':
        renderer.select(g, s, clock, labels);
        break;
      case 'map':
        renderer.map(g, s, clock);
        break;
      case 'versus':
        renderer.versus(g, s, clock);
        break;
      case 'quote':
        renderer.quote(g, s, clock, labels);
        break;
      case 'continue':
        renderer.continueScreen(g, s, clock, labels, -1);
        break;
      case 'ending':
        renderer.ending(g, s, stageArt(s.chosen[0] as CharId), clock, labels);
        break;
    }
    if (phase === 'paused') {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, 0, FB_W, FB_H);
      drawTextCentred(g, strings.paused, FB_W / 2, FB_H / 2 - 7, { color: '#f8f8f8', outline: '#101010', scale: 2 });
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fb, 0, 0, canvas.width, canvas.height);
  }

  const loop = createGameLoop(update, render);

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startGame('arcade');
  });
  versusBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startGame('versus');
  });
  continueBtn.addEventListener('click', () => {
    board.hide();
    overOverlay.style.display = 'none';
    view = freshView();
    phase = 'play';
    board.beginRun();
    audio.start();
    handle(continueCredit(arcade));
  });
  againBtn.addEventListener('click', () => {
    board.hide();
    overOverlay.style.display = 'none';
    startGame('arcade');
  });

  loop.start();

  // A hand on the panel for the DOM suite and for play-testing bots, only
  // when the page is opened with #dev. Never read by the game itself.
  if (window.location.hash === '#dev') {
    const devWindow = window as unknown as Record<string, unknown>;
    devWindow.fighterDev = {
      getArcade: () => arcade,
      setInputs: (inputs: typeof devInputs) => {
        devInputs = inputs;
      },
      /** A CPU in player one's seat (null hands the panel back). */
      autoplay: (level: number | null) => {
        autopilot = level === null ? null : createCpu(level, 1);
      },
      /** Drop straight into a bonus stage with the chosen fighter. */
      bonus: (kind: 'car' | 'drums') => {
        arcade.fight = createBonus(arcade.chosen[0] ?? 'kenji', kind);
        arcade.bonus = kind;
        arcade.screen = 'bonus';
        arcade.frame = 0;
        handle([{ type: 'screen', screen: 'bonus' }]);
      },
      /** Skip the ladder to a rung (the next fight is against that opponent). */
      rung: (stage: number) => {
        arcade.stage = stage;
      }
    };
    document.addEventListener('astro:before-swap', () => delete devWindow.fighterDev, { once: true });
  }
}
