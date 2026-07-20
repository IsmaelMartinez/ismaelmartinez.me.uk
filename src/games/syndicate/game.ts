/**
 * Syndicate — an isometric squad-action tribute to Bullfrog's classics.
 *
 * Pure rules live in map.ts / pathfind.ts / units.ts / sim.ts / missions.ts;
 * this module owns DOM wiring, input, the campaign flow, and canvas
 * rendering. It expects the markup defined in
 * src/pages/[lang]/fun/syndicate.astro.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  blockFaceCorners,
  faceBandPath,
  drawBlock,
  forEachTileBackToFront,
  shadeColor,
  createGameAudio,
  wireSoundButton,
  createToaster,
  createEffects,
  type IsoView,
  hash01 as hash
} from '../engine';
import { MAP_W, MAP_H, generateCity, type MapTile } from './map';
import type { Unit, WeaponId } from './units';
import {
  createWorld,
  stepWorld,
  commandMove,
  livingAgents,
  followerCount,
  persuadedCivilians,
  type World
} from './sim';
import { MISSIONS, SQUAD_SIZE, spawnMission, missionStatus, type MissionSpec } from './missions';

const VIEW: IsoView = { halfW: 16, halfH: 8, originX: MAP_H * 16, originY: 70 };
const CANVAS_W = (MAP_W + MAP_H) * VIEW.halfW;
const CANVAS_H = (MAP_W + MAP_H) * VIEW.halfH + VIEW.originY + 12;
const BOOST_DURATION = 4;
const BOOST_COOLDOWN = 14;
const EXTRACTION_RADIUS = 1.5;

const FACADES = ['#3c4566', '#46395c', '#35495c', '#4a3f55'];
const NEON = ['#22d3ee', '#38bdf8', '#818cf8', '#2dd4bf'];
const CIVILIAN_TINTS = ['#d8b4fe', '#86efac', '#fca5a5', '#fde68a', '#93c5fd', '#f9a8d4'];
const KILL_BOUNTY: Partial<Record<Unit['kind'], number>> = {
  enemy: 300,
  guard: 150,
  target: 500
};
const PERSUADE_BONUS: Partial<Record<Unit['kind'], number>> = {
  civilian: 50,
  guard: 200,
  enemy: 400
};
const SHOT_LIFE = 0.12;
const RAIN_DROPS = 90;

/**
 * Deterministic facade patterns, module-scope so drawWindows allocates no
 * closures per building per frame (it runs for every facade every frame).
 */
const facadeStrip = (i: number, f: number, r: number) => (i * 13 + f * 29 + r * 11) % 7 === 0;
const facadeLit = (i: number, f: number, r: number, c: number) =>
  (i * 31 + f * 17 + r * 7 + c * 13) % 5 < 3;

interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

type Phase = 'idle' | 'play' | 'debrief' | 'over';

export function initSyndicateGame(): void {
  const root = document.getElementById('syndicate-root');
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
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const nextBtn = el('next-btn');
  const briefTitle = el('brief-title');
  const briefText = el('brief-text');
  const overIcon = el('over-icon');
  const overTitle = el('over-title');
  const overDesc = el('over-desc');
  const finalCashEl = el('final-cash');
  const moneyEl = el('money');
  const followersEl = el('followers');
  const missionEl = el('mission-num');
  const recordEl = el('record');
  const objectiveEl = el('objective-text');
  const boostBtn = el('boost-btn') as HTMLButtonElement;
  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea);
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.agent-chip'));
  const allBtn = el('select-all') as HTMLButtonElement;

  const s = (key: string, fallback: string) => root.dataset[key] || fallback;
  const strings = {
    missionNames: [s('tMission1Name', 'Hostile Takeover'), s('tMission2Name', 'Hearts & Minds'), s('tMission3Name', 'Regicide')],
    missionBriefs: [s('tMission1Brief', ''), s('tMission2Brief', ''), s('tMission3Brief', '')],
    objectiveEliminate: s('tObjectiveEliminate', 'Eliminate the rival agents'),
    objectivePersuade: s('tObjectivePersuade', 'Persuade civilians'),
    objectiveExtract: s('tObjectiveExtract', 'Reach the extraction point'),
    objectiveAssassinate: s('tObjectiveAssassinate', 'Assassinate the rival executive'),
    missionComplete: s('tMissionComplete', 'Mission complete'),
    nextMission: s('tNextMission', 'Next contract'),
    gameOver: s('tGameOver', 'Squad eliminated'),
    gameOverDesc: s('tGameOverDesc', 'Your agents were lost in the field.'),
    victory: s('tVictory', 'Campaign complete'),
    victoryDesc: s('tVictoryDesc', 'The city belongs to your syndicate now.'),
    playAgain: s('tPlayAgain', 'New campaign'),
    agentDown: s('tAgentDown', 'Agent down!'),
    joined: s('tJoined', 'joined your syndicate'),
    newRecord: s('tNewRecord', 'New cash record!'),
    weaponNames: {
      pistol: s('tWeaponPistol', 'Pistol'),
      uzi: s('tWeaponUzi', 'Uzi'),
      minigun: s('tWeaponMinigun', 'Minigun')
    } as Record<WeaponId, string>,
    kinds: {
      guard: s('tKindGuard', 'Guard'),
      enemy: s('tKindEnemy', 'Rival agent')
    } as Partial<Record<Unit['kind'], string>>
  };

  // Declared ahead of the static layers: the ground bake's paint closure
  // reads it, and onApply rebuilds the layers during setup below.
  let tiles: MapTile[] = generateCity(Math.random);

  // Pre-rendered scanlines + vignette overlay (both are static, so drawing
  // them every frame would waste a full-canvas gradient fill), rebuilt at
  // device resolution whenever the DPR changes so the 1px CRT lines stay
  // crisp instead of being blur-upscaled from a 1:1 bitmap.
  const atmosphere = createStaticLayer(CANVAS_W, CANVAS_H, target => {
    target.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < CANVAS_H; y += 3) target.fillRect(0, y, CANVAS_W, 1);
    const vig = target.createRadialGradient(
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_H * 0.35,
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_H * 0.85
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    target.fillStyle = vig;
    target.fillRect(0, 0, CANVAS_W, CANVAS_H);
  });
  // The flat city floor — roads with their dashes and lamps, pavement
  // checkerboard, plazas, and the dark ground under buildings — never
  // changes within a mission, so it bakes once instead of ~680 fills and
  // dashed strokes per frame. Drawn first each frame, it sits behind
  // everything; buildings and units still paint over it in painter order.
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, g => {
    for (let i = 0; i < tiles.length; i++) {
      const x = i % MAP_W;
      const y = Math.floor(i / MAP_W);
      const tile = tiles[i];
      if (tile.kind === 'road') {
        drawRoad(g, i, x, y);
        if (hash(i, 7) < 0.05) drawLampPool(g, x, y);
      } else if (tile.kind === 'pavement') {
        fillTile(g, VIEW, x, y, (x + y) % 2 === 0 ? '#30374a' : '#343b4d');
      } else if (tile.kind === 'plaza') {
        fillTile(g, VIEW, x, y, '#283148');
      } else {
        fillTile(g, VIEW, x, y, '#10141f');
      }
    }
  });
  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, {
    onApply: dpr => {
      atmosphere.rebuild(dpr);
      ground.rebuild(dpr);
    }
  });
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  let phase: Phase = 'idle';
  let world: World = createWorld(tiles, [], Math.random);
  let missionIdx = 0;
  let spec: MissionSpec = MISSIONS[0];
  let extraction = -1;
  let money = 0;
  const board = initScoreboard(document.getElementById('highscores'));
  let agentWeapons: WeaponId[] = Array(SQUAD_SIZE).fill('pistol');
  let selected = new Set<number>([0, 1, 2, 3]);
  let boostCooldown = 0;
  let clock = 0;
  let moveMarker: { tile: number; t: number } | null = null;
  let extractionAnnounced = false;
  const fx = createEffects({
    gravityScale: 120,
    launchKick: 20,
    burstSpeed: 60,
    burstSize: 1.6,
    glowBlur: 4,
    floaterSize: 10,
    floaterRise: 16,
    floaterLife: 1.1
  });
  let decals: Decal[] = [];
  // Last screen position per unit id, so the renderer can face them and the
  // gun points the way they walk.
  const facing = new Map<number, { x: number; y: number; dir: number }>();
  // Rain streaks in screen space, recycled as they fall off the bottom.
  const rain = Array.from({ length: RAIN_DROPS }, () => ({
    x: Math.random() * CANVAS_W,
    y: Math.random() * CANVAS_H,
    len: 6 + Math.random() * 8,
    speed: 320 + Math.random() * 220
  }));

  // The record readout shows the table's best, beaten live by the current campaign.
  recordEl.textContent = `£${board.best()}`;

  // Dark, brooding cyber-noir bassline in E minor.
  const audio = createGameAudio({
    tempo: 96,
    wave: 'sawtooth',
    volume: 0.1,
    melody: [
      { freq: 164.81, beats: 1 },
      { freq: 196.0, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 246.94, beats: 1 },
      { freq: 196.0, beats: 1 },
      { freq: 130.81, beats: 1 },
      { freq: 146.83, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 123.47, beats: 1 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  const squad = (): Unit[] => world.units.filter(u => u.kind === 'agent');

  const spawnBurst = fx.burst;

  function spawnDeath(wx: number, wy: number, kind: Unit['kind']) {
    const p = isoProject(VIEW, wx, wy);
    const blood = kind === 'agent' ? '#67e8f9' : kind === 'civilian' ? '#fca5a5' : '#f87171';
    spawnBurst(p.x, p.y - 7, 14, blood, { speed: 90, life: 0.6, size: 1.8, gravity: 1, glow: true });
    spawnBurst(p.x, p.y - 7, 6, '#fde68a', { speed: 50, life: 0.35, size: 1.2, glow: true });
    decals.push({ x: wx, y: wy, r: 3.5 + Math.random() * 1.5, color: blood, life: 9, maxLife: 9 });
  }

  function spawnSparkle(wx: number, wy: number, color = '#67e8f9') {
    const p = isoProject(VIEW, wx, wy);
    spawnBurst(p.x, p.y - 10, 10, color, { speed: 40, life: 0.7, size: 1.4, glow: true });
  }

  function addFloater(x: number, y: number, text: string, color: string) {
    const p = isoProject(VIEW, x, y);
    fx.floater(p.x, p.y - 18, text, color);
  }

  function startMission(index: number) {
    missionIdx = index;
    spec = MISSIONS[index];
    tiles = generateCity(Math.random);
    // Content changed, resolution didn't: re-bake at the last-known dpr.
    ground.rebuild();
    const setup = spawnMission(spec, tiles, agentWeapons, Math.random);
    world = createWorld(tiles, setup.units, Math.random);
    extraction = setup.extraction;
    selected = new Set([0, 1, 2, 3]);
    boostCooldown = 0;
    moveMarker = null;
    extractionAnnounced = false;
    fx.clear();
    decals = [];
    facing.clear();
    missionEl.textContent = `${index + 1}/${MISSIONS.length}`;
    phase = 'play';
    audio.start();
  }

  function rememberWeapons() {
    squad().forEach((agent, n) => {
      agentWeapons[n] = agent.alive ? (agent.weapon ?? 'pistol') : 'pistol';
    });
  }

  /** Banks the takings; announces (once per campaign) a beaten table best. */
  function bankTakings() {
    const { best, newRecord } = board.bank(Math.floor(money));
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
    recordEl.textContent = `£${best}`;
  }

  function endCampaign(victory: boolean) {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    bankTakings();
    overIcon.textContent = victory ? '🏆' : '☠️';
    overTitle.textContent = victory ? strings.victory : strings.gameOver;
    overDesc.textContent = victory ? strings.victoryDesc : strings.gameOverDesc;
    finalCashEl.textContent = `£${Math.floor(money)}`;
    nextBtn.textContent = strings.playAgain;
    overOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    board.show(Math.floor(money));
  }

  function completeMission() {
    money += spec.reward;
    rememberWeapons();
    if (missionIdx + 1 >= MISSIONS.length) {
      endCampaign(true);
      return;
    }
    phase = 'debrief';
    // Banking persists the campaign's takings at each debrief, like the old
    // record key did, so quitting mid-campaign keeps the run on the table.
    bankTakings();
    overIcon.textContent = '💼';
    overTitle.textContent = `${strings.missionComplete} · +£${spec.reward}`;
    overDesc.textContent = `${strings.missionNames[missionIdx + 1]} — ${strings.missionBriefs[missionIdx + 1]}`;
    finalCashEl.textContent = `£${Math.floor(money)}`;
    nextBtn.textContent = strings.nextMission;
    overOverlay.style.display = 'flex';
  }

  function handleEvents(events: ReturnType<typeof stepWorld>) {
    for (const event of events) {
      if (event.type === 'kill') {
        spawnDeath(event.x, event.y, event.kind);
        if (event.by === 'player') {
          if (event.kind === 'civilian') {
            money -= 100;
            addFloater(event.x, event.y, '-£100', '#f87171');
          } else {
            const bounty = KILL_BOUNTY[event.kind] ?? 0;
            money += bounty;
            addFloater(event.x, event.y, `+£${bounty}`, '#4ade80');
          }
        }
      } else if (event.type === 'agentDown') {
        spawnDeath(event.x, event.y, 'agent');
        addFloater(event.x, event.y, '☠', '#f87171');
        showToast(`☠️ ${strings.agentDown}`);
      } else if (event.type === 'persuade') {
        spawnSparkle(event.x, event.y);
        const bonus = PERSUADE_BONUS[event.kind] ?? 0;
        money += bonus;
        addFloater(event.x, event.y, `+£${bonus}`, '#67e8f9');
        const kindName = strings.kinds[event.kind];
        if (kindName) showToast(`🧠 ${kindName} ${strings.joined}`);
      } else if (event.type === 'pickup') {
        spawnSparkle(event.x, event.y, '#fde68a');
        if (event.role === 'follower') {
          addFloater(event.x, event.y, `🔫 ${strings.weaponNames[event.weapon]}`, '#fde68a');
        } else if (event.upgraded) {
          showToast(`🔫 ${strings.weaponNames[event.weapon]}!`);
        } else {
          money += 25;
          addFloater(event.x, event.y, '+£25', '#4ade80');
        }
      }
    }
  }

  function agentAtExtraction(): boolean {
    if (extraction < 0) return false;
    const ex = (extraction % MAP_W) + 0.5;
    const ey = Math.floor(extraction / MAP_W) + 0.5;
    return livingAgents(world).some(a => Math.hypot(a.x - ex, a.y - ey) <= EXTRACTION_RADIUS);
  }

  function update(dt: number) {
    clock += dt;
    fx.update(dt);
    decals = decals.filter(d => (d.life -= dt) > 0);
    for (const drop of rain) {
      drop.y += drop.speed * dt;
      drop.x -= drop.speed * 0.25 * dt;
      if (drop.y > CANVAS_H || drop.x < 0) {
        drop.y = -drop.len;
        drop.x = Math.random() * CANVAS_W;
      }
    }
    if (moveMarker && (moveMarker.t -= dt) <= 0) moveMarker = null;
    if (phase !== 'play') return;

    boostCooldown = Math.max(0, boostCooldown - dt);
    handleEvents(stepWorld(world, dt));

    // Muzzle flashes and impact sparks for shots fired this very step
    // (brand-new shots still hold their full life before the next tick).
    let firedThisStep = false;
    for (const shot of world.shots) {
      if (shot.life < SHOT_LIFE - 1e-6) continue;
      const from = isoProject(VIEW, shot.fx, shot.fy);
      const to = isoProject(VIEW, shot.tx, shot.ty);
      const flash = shot.faction === 'player' ? '#a5f3fc' : '#fecaca';
      spawnBurst(from.x, from.y - 8, 4, flash, { speed: 70, life: 0.1, size: 1.4, glow: true });
      spawnBurst(to.x, to.y - 8, 5, '#fde68a', { speed: 80, life: 0.18, size: 1.3, glow: true });
      if (shot.faction === 'player') firedThisStep = true;
    }
    // One blip per step keeps rapid-fire weapons from machine-gunning the mixer.
    if (firedThisStep) audio.playSfx('blip');

    if (
      spec.objective === 'persuade' &&
      !extractionAnnounced &&
      persuadedCivilians(world) >= spec.persuadeQuota
    ) {
      extractionAnnounced = true;
      showToast(`🚁 ${strings.objectiveExtract}`);
    }

    const status = missionStatus(spec, world.units, persuadedCivilians(world), agentAtExtraction());
    if (status === 'won') completeMission();
    else if (status === 'lost') endCampaign(false);
  }

  // --- Rendering ---

  function drawRoad(g: CanvasRenderingContext2D, i: number, x: number, y: number) {
    fillTile(g, VIEW, x, y, '#262c3a');
    g.strokeStyle = 'rgba(250, 204, 21, 0.22)';
    g.lineWidth = 1.5;
    g.setLineDash([3, 5]);
    const centre = isoProject(VIEW, x + 0.5, y + 0.5);
    const links: Array<[boolean, number, number]> = [
      [x > 0 && tiles[i - 1].kind === 'road', x, y + 0.5],
      [x < MAP_W - 1 && tiles[i + 1].kind === 'road', x + 1, y + 0.5],
      [y > 0 && tiles[i - MAP_W].kind === 'road', x + 0.5, y],
      [y < MAP_H - 1 && tiles[i + MAP_W].kind === 'road', x + 0.5, y + 1]
    ];
    for (const [connected, tx, ty] of links) {
      if (!connected) continue;
      const edge = isoProject(VIEW, tx, ty);
      g.beginPath();
      g.moveTo(centre.x, centre.y);
      g.lineTo(edge.x, edge.y);
      g.stroke();
    }
    g.setLineDash([]);
  }

  function drawWindows(x: number, y: number, i: number, height: number) {
    const { w, s: sCorner, e } = blockFaceCorners(VIEW, x, y);
    const rows = Math.floor(height / 8);
    const faces: [{ x: number; y: number }, { x: number; y: number }][] = [
      [w, sCorner],
      [sCorner, e]
    ];
    // Batched passes: every window's category accumulates into one path,
    // one fill/stroke per category per building instead of per window —
    // Syndicate draws ~300 facades a frame, so draw-call count, not the
    // arithmetic, is the budget. (Positions are recomputed per pass; the
    // math is cheap, the state changes are not.)

    // Frames go only under lit windows — a dark frame on a dark facade
    // paints pixels nobody sees, and the facades are the frame budget.
    ctx.fillStyle = 'rgba(5, 8, 18, 0.7)';
    ctx.beginPath();
    faces.forEach(([a, b], f) => {
      for (let r = 0; r < rows; r++) {
        if (facadeStrip(i, f, r)) continue;
        for (let c = 0; c < 2; c++) {
          if (!facadeLit(i, f, r, c)) continue;
          const t = 0.3 + c * 0.4;
          const bx = a.x + (b.x - a.x) * t;
          const by = a.y + (b.y - a.y) * t - height * ((r + 0.5) / rows);
          ctx.rect(bx - 1.3, by - 1.9, 2.6, 3.8);
        }
      }
    });
    ctx.fill();

    // Panes: lit glass as two half-panes (the gap reads as a mullion
    // without a third pass), unlit as a single dark pane.
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? 'rgba(165, 243, 252, 0.55)' : 'rgba(28, 38, 58, 0.65)';
      ctx.beginPath();
      faces.forEach(([a, b], f) => {
        for (let r = 0; r < rows; r++) {
          if (facadeStrip(i, f, r)) continue;
          for (let c = 0; c < 2; c++) {
            const on = facadeLit(i, f, r, c);
            if (pass === 0 ? !on : on) continue;
            const t = 0.3 + c * 0.4;
            const bx = a.x + (b.x - a.x) * t;
            const by = a.y + (b.y - a.y) * t - height * ((r + 0.5) / rows);
            if (pass === 0) {
              ctx.rect(bx - 1, by - 1.5, 0.8, 3);
              ctx.rect(bx + 0.2, by - 1.5, 0.8, 3);
            } else {
              ctx.rect(bx - 1, by - 1.5, 2, 3);
            }
          }
        }
      });
      ctx.fill();
    }

    // Late-shift floors: one wide lit office strip instead of panes.
    ctx.fillStyle = 'rgba(165, 243, 252, 0.32)';
    ctx.beginPath();
    faces.forEach(([a, b], f) => {
      for (let r = 0; r < rows; r++) {
        if (!facadeStrip(i, f, r)) continue;
        const sy = height * ((r + 0.5) / rows);
        faceBandPath(ctx, a, b, 0.18, 0.82, sy + 1.5, sy - 1.5);
      }
    });
    ctx.fill();
  }

  /**
   * Warm shopfront glow at the base of low-rise faces that meet a street
   * tile — a lit doorway with a neon sign dot. Hashed so only some blocks
   * trade.
   */
  function drawStorefront(x: number, y: number, i: number, height: number, palette: number) {
    // Only a minority of low-rise blocks trade — most of the city sleeps.
    if (height >= 24 || hash(i, 8) < 0.65) return;
    const { w, s: sCorner, e } = blockFaceCorners(VIEW, x, y);
    for (let f = 0; f < 2; f++) {
      const open =
        f === 0
          ? y + 1 < MAP_H && tiles[i + MAP_W].kind !== 'building'
          : x + 1 < MAP_W && tiles[i + 1].kind !== 'building';
      if (!open) continue;
      const a = f === 0 ? w : sCorner;
      const b = f === 0 ? sCorner : e;
      ctx.fillStyle = 'rgba(253, 224, 130, 0.22)';
      ctx.beginPath();
      faceBandPath(ctx, a, b, 0.15, 0.85, 0.5, 4);
      ctx.fill();
      // Doorway and a neon sign dot beside it.
      const dx = a.x + (b.x - a.x) * 0.5;
      const dy = a.y + (b.y - a.y) * 0.5;
      ctx.fillStyle = 'rgba(255, 236, 180, 0.6)';
      ctx.fillRect(dx - 1, dy - 4.2, 2, 4.2);
      ctx.fillStyle = NEON[palette];
      ctx.fillRect(dx + 2.2, dy - 5.2, 1, 1);
    }
  }

  function drawNeonTrim(x: number, y: number, height: number, palette: number) {
    const { n, e, s: sCorner, w } = blockFaceCorners(VIEW, x, y);
    ctx.strokeStyle = NEON[palette];
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - height);
    ctx.lineTo(e.x, e.y - height);
    ctx.lineTo(sCorner.x, sCorner.y - height);
    ctx.lineTo(w.x, w.y - height);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Tracks heading from frame-to-frame screen motion; +1 faces right. */
  function headingOf(u: Unit, px: number, py: number): number {
    const prev = facing.get(u.id);
    let dir = prev?.dir ?? (u.x + u.y > MAP_W ? -1 : 1);
    if (prev) {
      const dx = px - prev.x;
      if (Math.abs(dx) > 0.15) dir = dx > 0 ? 1 : -1;
    }
    facing.set(u.id, { x: px, y: py, dir });
    return dir;
  }

  function drawUnit(u: Unit) {
    const p = isoProject(VIEW, u.x, u.y);
    const dir = headingOf(u, p.x, p.y);
    const moving = u.path.length > 0;
    const stride = moving ? Math.sin(clock * 11 + u.id) * 1.4 : 0;

    // Contact shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, 4.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (u.kind === 'agent' && selected.has(squad().indexOf(u))) {
      ctx.strokeStyle = `rgba(103, 232, 249, ${0.65 + 0.25 * Math.sin(clock * 6)})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, 7, 3.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let coat = '#3b4a66';
    let trim = '#5870a0';
    let head = '#caa07a';
    let visor: string | null = null;
    let cap: string | null = null;
    if (u.kind === 'agent') {
      coat = '#37445e';
      trim = '#5fd0e6';
      head = '#222a3a';
      visor = '#67e8f9';
    } else if (u.kind === 'enemy') {
      coat = '#4a2330';
      trim = '#b34a5c';
      head = '#241420';
      visor = '#f87171';
    } else if (u.kind === 'guard') {
      coat = '#2f4f8f';
      trim = '#5b82c8';
      head = '#caa07a';
      cap = '#1f3361';
    } else if (u.kind === 'target') {
      coat = '#9a7b22';
      trim = '#f5c84b';
      head = '#caa07a';
    } else {
      coat = CIVILIAN_TINTS[u.tint % CIVILIAN_TINTS.length];
      trim = shadeColor(coat, 0.8);
      head = '#caa07a';
    }

    // Legs (stride animates when walking)
    ctx.strokeStyle = shadeColor(coat, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x - 1.3, p.y - 3);
    ctx.lineTo(p.x - 1.3 + stride * 0.4, p.y);
    ctx.moveTo(p.x + 1.3, p.y - 3);
    ctx.lineTo(p.x + 1.3 - stride * 0.4, p.y);
    ctx.stroke();

    // Torso — each kind cuts a distinct silhouette on the shared skeleton.
    ctx.fillStyle = coat;
    ctx.beginPath();
    if (u.kind === 'agent') {
      // Long trench coat flaring past the hip, with a belt line.
      ctx.moveTo(p.x - 3.4, p.y - 2.2);
      ctx.lineTo(p.x + 3.4, p.y - 2.2);
      ctx.lineTo(p.x + 2.3, p.y - 9.5);
      ctx.lineTo(p.x - 2.3, p.y - 9.5);
    } else if (u.kind === 'enemy') {
      // Broader rival build with armoured shoulders.
      ctx.moveTo(p.x - 3.4, p.y - 3.5);
      ctx.lineTo(p.x + 3.4, p.y - 3.5);
      ctx.lineTo(p.x + 3, p.y - 9.2);
      ctx.lineTo(p.x - 3, p.y - 9.2);
    } else if (u.kind === 'civilian') {
      // Slighter frame; coat length varies with the tint roll.
      const hem = p.y - 3.2 - (u.tint % 3) * 0.5;
      ctx.moveTo(p.x - 2.6, hem);
      ctx.lineTo(p.x + 2.6, hem);
      ctx.lineTo(p.x + 2.1, p.y - 9.3);
      ctx.lineTo(p.x - 2.1, p.y - 9.3);
    } else {
      ctx.moveTo(p.x - 3, p.y - 3.5);
      ctx.lineTo(p.x + 3, p.y - 3.5);
      ctx.lineTo(p.x + 2.4, p.y - 9.5);
      ctx.lineTo(p.x - 2.4, p.y - 9.5);
    }
    ctx.closePath();
    ctx.fill();
    // Lit edge down the facing side
    ctx.fillStyle = trim;
    ctx.fillRect(p.x + dir * 2 - 0.5, p.y - 9.5, 1, 6);
    if (u.kind === 'agent') {
      // Belt over the trench coat.
      ctx.fillStyle = shadeColor(coat, 0.45);
      ctx.fillRect(p.x - 2.7, p.y - 5.6, 5.4, 1);
    } else if (u.kind === 'enemy') {
      // Shoulder spikes silhouette the rivals even at a glance.
      ctx.fillStyle = shadeColor(coat, 1.5);
      ctx.beginPath();
      ctx.moveTo(p.x - 3.6, p.y - 9);
      ctx.lineTo(p.x - 1.9, p.y - 9);
      ctx.lineTo(p.x - 3.2, p.y - 11.4);
      ctx.closePath();
      ctx.moveTo(p.x + 3.6, p.y - 9);
      ctx.lineTo(p.x + 1.9, p.y - 9);
      ctx.lineTo(p.x + 3.2, p.y - 11.4);
      ctx.closePath();
      ctx.fill();
    } else if (u.kind === 'guard') {
      // Baton on the off-hand hip.
      ctx.strokeStyle = '#1b2230';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - dir * 2.5, p.y - 4.2);
      ctx.lineTo(p.x - dir * 3.5, p.y - 1.6);
      ctx.stroke();
    } else if (u.kind === 'target') {
      // Pinstripe suit: shirt wedge and a briefcase in hand.
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath();
      ctx.moveTo(p.x + dir * 0.2, p.y - 9);
      ctx.lineTo(p.x + dir * 1.6, p.y - 8.6);
      ctx.lineTo(p.x + dir * 0.4, p.y - 6.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a2c18';
      ctx.fillRect(p.x + dir * 2.6 - 1.3, p.y - 3.6, 2.6, 2);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(p.x + dir * 2.6 - 0.25, p.y - 3.2, 0.5, 0.5);
    }

    // Weapon arm — armed units level their actual hardware in their heading.
    if (u.weapon) {
      ctx.strokeStyle = '#1b2230';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x + dir * 4, p.y - 6.6);
      ctx.stroke();
      if (u.weapon === 'pistol') {
        ctx.fillStyle = '#11161f';
        ctx.fillRect(dir > 0 ? p.x + 3.6 : p.x - 5.8, p.y - 7.4, 2.2, 1.4);
      } else if (u.weapon === 'uzi') {
        ctx.fillStyle = '#11161f';
        ctx.fillRect(dir > 0 ? p.x + 3.2 : p.x - 6.6, p.y - 7.6, 3.4, 1.6);
        // Hanging magazine
        ctx.fillRect(dir > 0 ? p.x + 4.4 : p.x - 5.2, p.y - 6, 1.2, 2);
      } else {
        // Minigun: heavy receiver and twin barrels
        ctx.fillStyle = '#0d1119';
        ctx.fillRect(dir > 0 ? p.x + 2.6 : p.x - 5.4, p.y - 8.4, 2.8, 2.8);
        ctx.fillStyle = '#2a3242';
        ctx.fillRect(dir > 0 ? p.x + 5.2 : p.x - 9.4, p.y - 8.2, 4.2, 1);
        ctx.fillRect(dir > 0 ? p.x + 5.2 : p.x - 9.4, p.y - 6.8, 4.2, 1);
      }
    }

    // Head
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 11, 2.3, 0, Math.PI * 2);
    ctx.fill();
    if (cap) {
      ctx.fillStyle = cap;
      ctx.fillRect(p.x - 2.3, p.y - 12.6, 4.6, 1.6);
      // Cap brim on the facing side
      ctx.fillRect(dir > 0 ? p.x + 2.3 : p.x - 3.5, p.y - 12.2, 1.2, 0.8);
    }
    if (visor) {
      ctx.save();
      ctx.shadowColor = visor;
      ctx.shadowBlur = 5;
      ctx.fillStyle = visor;
      ctx.fillRect(p.x - 1.6, p.y - 11.6, 3.2, 1.3);
      ctx.restore();
    }

    if (u.persuaded) {
      const bob = Math.sin(clock * 5 + u.id) * 1.1;
      ctx.save();
      ctx.shadowColor = '#67e8f9';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#a5f3fc';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16 + bob, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (u.kind === 'target') {
      ctx.font = '8px serif';
      ctx.fillText('👑', p.x, p.y - 16 + Math.sin(clock * 3) * 1);
    }

    if (u.hp < u.maxHp && u.alive) {
      const frac = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(p.x - 5, p.y - 17, 10, 1.8);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      ctx.fillRect(p.x - 5, p.y - 17, 10 * frac, 1.8);
    }
  }

  function drawPickup(pickup: { x: number; y: number }) {
    const p = isoProject(VIEW, pickup.x, pickup.y);
    const bob = Math.sin(clock * 4 + pickup.x * 3) * 1.3;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5 + pickup.y);
    const halo = ctx.createRadialGradient(p.x, p.y - 3, 0, p.x, p.y - 3, 9);
    halo.addColorStop(0, `rgba(253, 230, 138, ${0.35 + pulse * 0.25})`);
    halo.addColorStop(1, 'rgba(253, 230, 138, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '10px serif';
    ctx.fillText('🔫', p.x, p.y - 6 + bob);
  }

  function drawRooftop(x: number, y: number, i: number, height: number, palette: number) {
    if (height < 18) return;
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    const ty = c.y - height;
    // Two extra clutter variants over the original three; the helipad is
    // reserved for the tall band so it reads at scale.
    const variant = Math.floor(hash(i, 1) * (height >= 30 ? 5 : 4));
    if (variant === 3) {
      // Vent cluster with a stub exhaust pipe
      ctx.fillStyle = shadeColor(FACADES[palette], 0.55);
      ctx.fillRect(c.x - 4.5, ty - 2, 3, 2);
      ctx.fillRect(c.x - 0.5, ty - 2.6, 2.6, 2.6);
      ctx.fillRect(c.x + 3, ty - 1.8, 2.2, 1.8);
      ctx.strokeStyle = shadeColor(FACADES[palette], 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x + 0.8, ty - 2.6);
      ctx.lineTo(c.x + 0.8, ty - 5.5);
      ctx.stroke();
      return;
    }
    if (variant === 4) {
      // Helipad ring with an H
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, ty, 6.5, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
      ctx.fillRect(c.x - 2, ty - 1.6, 1, 3.2);
      ctx.fillRect(c.x + 1, ty - 1.6, 1, 3.2);
      ctx.fillRect(c.x - 1, ty - 0.5, 2, 1);
      return;
    }
    if (variant === 0) {
      // Antenna with a blinking aircraft light
      ctx.strokeStyle = '#0b0f17';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, ty);
      ctx.lineTo(c.x, ty - 7);
      ctx.stroke();
      if (Math.floor(clock * 1.5 + i) % 2 === 0) {
        ctx.save();
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(c.x, ty - 7, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (variant === 1) {
      // Rooftop unit (AC/water tank)
      ctx.fillStyle = shadeColor(FACADES[palette], 0.5);
      ctx.fillRect(c.x - 3, ty - 3, 6, 3);
    } else {
      // Glowing holo-billboard
      ctx.save();
      ctx.shadowColor = NEON[palette];
      ctx.shadowBlur = 6;
      ctx.fillStyle = NEON[palette];
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(clock * 2 + i);
      ctx.fillRect(c.x - 2.5, ty - 8, 5, 6);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** The lamp's flat light pool — ground content, safe to bake. */
  function drawLampPool(g: CanvasRenderingContext2D, x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    const pool = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, VIEW.halfW * 1.3);
    pool.addColorStop(0, 'rgba(253, 224, 130, 0.16)');
    pool.addColorStop(1, 'rgba(253, 224, 130, 0)');
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(c.x, c.y, VIEW.halfW * 1.3, VIEW.halfH * 1.3, 0, 0, Math.PI * 2);
    g.fill();
  }

  /**
   * The standing post and bulb — vertical scenery, so it draws in the
   * back-to-front sweep (NOT the ground bake) to keep painter occlusion:
   * a building south-east of the lamp must still paint over the post.
   */
  function drawLampPost(x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    ctx.strokeStyle = '#0b0f17';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - 11);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#fde68a';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 11, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawExtraction() {
    if (extraction < 0 || spec.objective !== 'persuade' || phase !== 'play') return;
    const x = extraction % MAP_W;
    const y = Math.floor(extraction / MAP_W);
    const open = persuadedCivilians(world) >= spec.persuadeQuota;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
    const colour = open ? '#4ade80' : '#94a3b8';

    ctx.globalAlpha = open ? 0.55 + pulse * 0.45 : 0.45 + pulse * 0.2;
    strokeTile(ctx, VIEW, x, y, colour, 2.5);

    // Vertical light beam so the pad reads from anywhere on the map
    const p = isoProject(VIEW, x + 0.5, y + 0.5);
    const beamH = 96;
    const beam = ctx.createLinearGradient(0, p.y - beamH, 0, p.y);
    beam.addColorStop(0, 'rgba(74, 222, 128, 0)');
    beam.addColorStop(1, open ? 'rgba(74, 222, 128, 0.5)' : 'rgba(148, 163, 184, 0.35)');
    ctx.fillStyle = beam;
    ctx.globalAlpha = 0.5 + pulse * 0.5;
    ctx.fillRect(p.x - VIEW.halfW * 0.5, p.y - beamH, VIEW.halfW, beamH);
    ctx.globalAlpha = 1;

    ctx.font = '16px serif';
    ctx.fillText('🚁', p.x, p.y - beamH - 6 - pulse * 3);
  }

  // The sky fill doubles as the frame clear; the gradient itself never
  // changes, so build it once instead of once per frame.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#070a14');
  sky.addColorStop(1, '#0b0f1c');

  function render() {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ground.draw(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Units and pickups draw interleaved with their diagonal so towers
    // occlude them correctly (same trick as Microcity's cars).
    const diagonals = MAP_W + MAP_H - 1;
    const unitsByDiag: Unit[][] = Array.from({ length: diagonals }, () => []);
    for (const u of world.units) {
      if (!u.alive) continue;
      const d = Math.min(diagonals - 1, Math.max(0, Math.floor(u.x) + Math.floor(u.y)));
      unitsByDiag[d].push(u);
    }
    const pickupsByDiag: { x: number; y: number }[][] = Array.from({ length: diagonals }, () => []);
    for (const pickup of world.pickups) {
      const d = Math.min(diagonals - 1, Math.max(0, Math.floor(pickup.x) + Math.floor(pickup.y)));
      pickupsByDiag[d].push(pickup);
    }

    // Group decals by the tile they fell on up front — scanning the whole
    // decal list once per tile turns a bloody mission into an
    // O(tiles × decals) render. Per-tile insertion order matches the array,
    // so the composite is unchanged.
    const decalsByTile = new Map<number, Decal[]>();
    for (const d of decals) {
      const dx = Math.floor(d.x);
      const dy = Math.floor(d.y);
      if (dx < 0 || dx >= MAP_W || dy < 0 || dy >= MAP_H) continue;
      const tile = dy * MAP_W + dx;
      const group = decalsByTile.get(tile);
      if (group) group.push(d);
      else decalsByTile.set(tile, [d]);
    }

    let lastDiag = -1;
    forEachTileBackToFront(MAP_W, MAP_H, (x, y, i, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) {
          pickupsByDiag[lastDiag].forEach(drawPickup);
          unitsByDiag[lastDiag].forEach(drawUnit);
        }
        lastDiag = diag;
      }
      // Flat ground (roads, pavement, plazas, lamp light pools) comes
      // pre-baked from the `ground` layer — buildings and standing lamp
      // posts still paint in the sweep so occlusion stays correct.
      const tile = tiles[i];
      if (tile.kind === 'road') {
        if (hash(i, 7) < 0.05) drawLampPost(x, y);
      } else if (tile.kind === 'building') {
        drawBlock(ctx, VIEW, x, y, tile.height, FACADES[tile.palette]);
        drawWindows(x, y, i, tile.height);
        drawStorefront(x, y, i, tile.height, tile.palette);
        drawNeonTrim(x, y, tile.height, tile.palette);
        drawRooftop(x, y, i, tile.height, tile.palette);
      }
      // Ground decals (blood/scorch) sit on the tile they fell on. The
      // no-decal path must stay allocation-free — it runs per tile per frame.
      const tileDecals = decalsByTile.get(i);
      if (tileDecals) {
        for (const d of tileDecals) {
          const dp = isoProject(VIEW, d.x, d.y);
          ctx.globalAlpha = Math.min(0.5, (d.life / d.maxLife) * 0.5);
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.ellipse(dp.x, dp.y, d.r, d.r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (moveMarker && moveMarker.tile === i) {
        ctx.globalAlpha = Math.min(1, moveMarker.t / 0.4);
        strokeTile(ctx, VIEW, x, y, 'rgba(103, 232, 249, 0.9)', 1.5);
        ctx.globalAlpha = 1;
      }
    });
    if (lastDiag >= 0) {
      pickupsByDiag[lastDiag].forEach(drawPickup);
      unitsByDiag[lastDiag].forEach(drawUnit);
    }

    // The beacon draws over the city — a tower must never hide the way out
    drawExtraction();

    // Weapon tracers on top of everything
    for (const shot of world.shots) {
      const from = isoProject(VIEW, shot.fx, shot.fy);
      const to = isoProject(VIEW, shot.tx, shot.ty);
      ctx.globalAlpha = Math.max(0, shot.life / 0.12);
      ctx.strokeStyle = shot.faction === 'player' ? '#67e8f9' : '#f87171';
      ctx.lineWidth = shot.weapon === 'minigun' ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 8);
      ctx.lineTo(to.x, to.y - 8);
      ctx.stroke();
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(from.x, from.y - 8, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Particles (sparks, blood, muzzle flashes), then floaters over them.
    fx.draw(ctx);

    drawAtmosphere();
    refreshHud();
  }

  function drawAtmosphere() {
    // Rain streaks
    ctx.strokeStyle = 'rgba(148, 197, 230, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const drop of rain) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.len * 0.25, drop.y + drop.len);
    }
    ctx.stroke();

    // Scanlines + vignette for the CRT-arcade feel.
    atmosphere.draw(ctx);
  }

  function refreshHud() {
    moneyEl.textContent = `£${Math.floor(money)}`;
    followersEl.textContent = followerCount(world).toString();

    if (phase === 'play') {
      if (spec.objective === 'eliminate') {
        const left = world.units.filter(
          u => u.kind === 'enemy' && u.alive && u.faction === 'hostile'
        ).length;
        objectiveEl.textContent = `🎯 ${strings.objectiveEliminate} (${left})`;
      } else if (spec.objective === 'persuade') {
        const count = persuadedCivilians(world);
        objectiveEl.textContent =
          count >= spec.persuadeQuota
            ? `🚁 ${strings.objectiveExtract}`
            : `🧠 ${strings.objectivePersuade} (${count}/${spec.persuadeQuota})`;
      } else {
        objectiveEl.textContent = `🎯 ${strings.objectiveAssassinate}`;
      }
    }

    const members = squad();
    chips.forEach((chip, n) => {
      const agent = members[n];
      const fill = chip.querySelector<HTMLElement>('.chip-hp-fill');
      const weaponEl = chip.querySelector<HTMLElement>('.chip-weapon');
      if (!agent) return;
      if (fill) {
        const frac = agent.alive ? Math.max(0, agent.hp / agent.maxHp) : 0;
        fill.style.width = `${frac * 100}%`;
        fill.style.background = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      }
      if (weaponEl) weaponEl.textContent = agent.weapon ? strings.weaponNames[agent.weapon] : '—';
      chip.classList.toggle('down', !agent.alive);
      chip.classList.toggle('active', selected.has(n) && agent.alive);
    });
    allBtn.classList.toggle('active', selected.size === SQUAD_SIZE);

    const ready = boostCooldown <= 0 && phase === 'play';
    boostBtn.disabled = !ready;
    boostBtn.classList.toggle('boosting', world.boost > 0);
    const fillEl = boostBtn.querySelector<HTMLElement>('.boost-fill');
    if (fillEl) fillEl.style.width = `${(1 - boostCooldown / BOOST_COOLDOWN) * 100}%`;
  }

  // --- Input wiring ---

  function tileFromEvent(e: MouseEvent): number {
    // Logical (not backing-store) coordinates: the backing store is
    // DPR-scaled, so canvas.width/rect.width would land tiles wide.
    const p = hiDpi.toLogical(e);
    return isoTileFromPoint(VIEW, p.x, p.y, MAP_W, MAP_H);
  }

  canvas.addEventListener('click', e => {
    if (phase !== 'play') return;
    const tile = tileFromEvent(e);
    if (tile < 0) return;
    const members = squad().filter((agent, n) => agent.alive && selected.has(n));
    if (!members.length) return;
    commandMove(world, tile, members);
    moveMarker = { tile, t: 0.8 };
  });

  function selectAgent(n: number | 'all') {
    if (n === 'all') {
      selected = new Set(squad().map((_, i) => i));
    } else if (squad()[n]?.alive) {
      selected = new Set([n]);
    }
  }

  chips.forEach((chip, n) => chip.addEventListener('click', () => selectAgent(n)));
  allBtn.addEventListener('click', () => selectAgent('all'));

  function triggerBoost() {
    if (phase !== 'play' || boostCooldown > 0) return;
    world.boost = BOOST_DURATION;
    boostCooldown = BOOST_COOLDOWN;
    showToast('⚡');
  }
  boostBtn.addEventListener('click', triggerBoost);

  const onKeydown = (e: KeyboardEvent) => {
    if (phase !== 'play') return;
    if (e.key >= '1' && e.key <= '4') selectAgent(parseInt(e.key, 10) - 1);
    else if (e.key === '0' || e.key.toLowerCase() === 'a') selectAgent('all');
    else if (e.key === ' ') {
      e.preventDefault();
      triggerBoost();
    }
  };
  window.addEventListener('keydown', onKeydown);
  // Window-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handler so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => window.removeEventListener('keydown', onKeydown),
    { once: true }
  );

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    money = 0;
    agentWeapons = Array(SQUAD_SIZE).fill('pistol');
    board.beginRun();
    startMission(0);
  });

  nextBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    board.hide();
    if (phase === 'debrief') {
      startMission(missionIdx + 1);
    } else {
      money = 0;
      agentWeapons = Array(SQUAD_SIZE).fill('pistol');
      board.beginRun();
      startMission(0);
    }
  });

  briefTitle.textContent = strings.missionNames[0];
  briefText.textContent = strings.missionBriefs[0];

  createGameLoop(update, render).start();
}
