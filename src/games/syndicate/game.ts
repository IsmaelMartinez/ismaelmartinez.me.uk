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
  initScoreboard,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  drawBlock,
  forEachTileBackToFront,
  shadeColor,
  createGameAudio,
  wireSoundButton,
  type IsoView
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  glow: boolean;
}

interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

/** Cheap deterministic 0–1 hash so building props stay stable per tile. */
function hash(i: number, salt: number): number {
  const n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

type Phase = 'idle' | 'play' | 'debrief' | 'over';

export function initSyndicateGame(): void {
  const root = document.getElementById('syndicate-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;

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

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const scroller = document.getElementById('canvas-scroll');
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

  // Pre-rendered scanline overlay (cheaper than drawing lines every frame).
  let scanlines: HTMLCanvasElement | null = null;
  const scan = document.createElement('canvas');
  scan.width = CANVAS_W;
  scan.height = CANVAS_H;
  const scanCtx = scan.getContext('2d');
  if (scanCtx) {
    scanCtx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < CANVAS_H; y += 3) scanCtx.fillRect(0, y, CANVAS_W, 1);
    scanlines = scan;
  }

  let phase: Phase = 'idle';
  let tiles: MapTile[] = generateCity(Math.random);
  let world: World = createWorld(tiles, [], Math.random);
  let missionIdx = 0;
  let spec: MissionSpec = MISSIONS[0];
  let extraction = -1;
  let money = 0;
  const board = initScoreboard(document.getElementById('highscores'));
  // The record readout shows the table's best, beaten live by the current campaign.
  let record = board.top()?.score ?? 0;
  let agentWeapons: WeaponId[] = Array(SQUAD_SIZE).fill('pistol');
  let selected = new Set<number>([0, 1, 2, 3]);
  let boostCooldown = 0;
  let clock = 0;
  let moveMarker: { tile: number; t: number } | null = null;
  let extractionAnnounced = false;
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];
  let particles: Particle[] = [];
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

  recordEl.textContent = `£${record}`;

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

  function spawnBurst(
    sx: number,
    sy: number,
    count: number,
    color: string,
    opts: { speed?: number; life?: number; size?: number; gravity?: number; glow?: boolean } = {}
  ) {
    const speed = opts.speed ?? 60;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (opts.gravity ? 20 : 0),
        life: opts.life ?? 0.5,
        maxLife: opts.life ?? 0.5,
        size: opts.size ?? 1.6,
        color,
        gravity: opts.gravity ?? 0,
        glow: opts.glow ?? false
      });
    }
  }

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

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.removeChild(toastArea.firstChild!);
    setTimeout(() => toast.remove(), 2400);
  }

  function addFloater(x: number, y: number, text: string, color: string) {
    const p = isoProject(VIEW, x, y);
    floaters.push({ x: p.x, y: p.y - 18, text, color, life: 1.1 });
  }

  function startMission(index: number) {
    missionIdx = index;
    spec = MISSIONS[index];
    tiles = generateCity(Math.random);
    const setup = spawnMission(spec, tiles, agentWeapons, Math.random);
    world = createWorld(tiles, setup.units, Math.random);
    extraction = setup.extraction;
    selected = new Set([0, 1, 2, 3]);
    boostCooldown = 0;
    moveMarker = null;
    extractionAnnounced = false;
    floaters = [];
    particles = [];
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

  function endCampaign(victory: boolean) {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    record = Math.max(record, Math.floor(money));
    recordEl.textContent = `£${record}`;
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
    record = Math.max(record, Math.floor(money));
    recordEl.textContent = `£${record}`;
    // Persist the campaign's takings at each debrief, like the old record
    // key did, so quitting mid-campaign keeps the run on the table.
    board.stash(Math.floor(money));
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
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 16 * dt;
      return f.life > 0;
    });
    particles = particles.filter(part => {
      part.life -= dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += part.gravity * 120 * dt;
      return part.life > 0;
    });
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

  function drawRoad(i: number, x: number, y: number) {
    fillTile(ctx, VIEW, x, y, '#262c3a');
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
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
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawWindows(x: number, y: number, i: number, height: number) {
    const inset = 0.08;
    const w = isoProject(VIEW, x + inset, y + 1 - inset);
    const sCorner = isoProject(VIEW, x + 1 - inset, y + 1 - inset);
    const e = isoProject(VIEW, x + 1 - inset, y + inset);
    const rows = Math.floor(height / 8);
    const faces: [{ x: number; y: number }, { x: number; y: number }][] = [
      [w, sCorner],
      [sCorner, e]
    ];
    faces.forEach(([a, b], f) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          const t = 0.3 + c * 0.4;
          const bx = a.x + (b.x - a.x) * t;
          const by = a.y + (b.y - a.y) * t - height * ((r + 0.5) / rows);
          const lit = (i * 31 + f * 17 + r * 7 + c * 13) % 5 < 3;
          ctx.fillStyle = lit ? 'rgba(165, 243, 252, 0.5)' : 'rgba(5, 8, 18, 0.6)';
          ctx.fillRect(bx - 1, by - 1.5, 2, 3);
        }
      }
    });
  }

  function drawNeonTrim(x: number, y: number, height: number, palette: number) {
    const inset = 0.08;
    const n = isoProject(VIEW, x + inset, y + inset);
    const e = isoProject(VIEW, x + 1 - inset, y + inset);
    const sCorner = isoProject(VIEW, x + 1 - inset, y + 1 - inset);
    const w = isoProject(VIEW, x + inset, y + 1 - inset);
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

    // Torso / coat — a tapered silhouette
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y - 3.5);
    ctx.lineTo(p.x + 3, p.y - 3.5);
    ctx.lineTo(p.x + 2.4, p.y - 9.5);
    ctx.lineTo(p.x - 2.4, p.y - 9.5);
    ctx.closePath();
    ctx.fill();
    // Lit edge down the facing side
    ctx.fillStyle = trim;
    ctx.fillRect(p.x + dir * 2 - 0.5, p.y - 9.5, 1, 6);

    // Weapon arm — armed units level a gun in their heading
    if (u.weapon) {
      ctx.strokeStyle = '#1b2230';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x + dir * 5, p.y - 6.5);
      ctx.stroke();
      ctx.fillStyle = '#11161f';
      ctx.fillRect(dir > 0 ? p.x + 4 : p.x - 6.5, p.y - 7.4, 2.5, 1.8);
    }

    // Head
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 11, 2.3, 0, Math.PI * 2);
    ctx.fill();
    if (cap) {
      ctx.fillStyle = cap;
      ctx.fillRect(p.x - 2.3, p.y - 12.6, 4.6, 1.6);
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
    const variant = Math.floor(hash(i, 1) * 3);
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

  function drawLamp(x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    const pool = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, VIEW.halfW * 1.3);
    pool.addColorStop(0, 'rgba(253, 224, 130, 0.16)');
    pool.addColorStop(1, 'rgba(253, 224, 130, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, VIEW.halfW * 1.3, VIEW.halfH * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
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

  function render() {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#070a14');
    sky.addColorStop(1, '#0b0f1c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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

    let lastDiag = -1;
    forEachTileBackToFront(MAP_W, MAP_H, (x, y, i, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) {
          pickupsByDiag[lastDiag].forEach(drawPickup);
          unitsByDiag[lastDiag].forEach(drawUnit);
        }
        lastDiag = diag;
      }
      const tile = tiles[i];
      if (tile.kind === 'road') {
        drawRoad(i, x, y);
        if (hash(i, 7) < 0.05) drawLamp(x, y);
      } else if (tile.kind === 'pavement') {
        fillTile(ctx, VIEW, x, y, (x + y) % 2 === 0 ? '#30374a' : '#343b4d');
      } else if (tile.kind === 'plaza') {
        fillTile(ctx, VIEW, x, y, '#283148');
      } else {
        fillTile(ctx, VIEW, x, y, '#10141f');
        drawBlock(ctx, VIEW, x, y, tile.height, FACADES[tile.palette]);
        drawWindows(x, y, i, tile.height);
        drawNeonTrim(x, y, tile.height, tile.palette);
        drawRooftop(x, y, i, tile.height, tile.palette);
      }
      // Ground decals (blood/scorch) sit on the tile they fell on
      for (const d of decals) {
        if (Math.floor(d.x) !== x || Math.floor(d.y) !== y) continue;
        const dp = isoProject(VIEW, d.x, d.y);
        ctx.globalAlpha = Math.min(0.5, (d.life / d.maxLife) * 0.5);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(dp.x, dp.y, d.r, d.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
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

    // Particles — sparks, blood, muzzle flashes
    for (const part of particles) {
      const a = Math.max(0, part.life / part.maxLife);
      ctx.globalAlpha = a;
      if (part.glow) {
        ctx.save();
        ctx.shadowColor = part.color;
        ctx.shadowBlur = 4;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = part.color;
        ctx.fillRect(part.x - part.size, part.y - part.size, part.size * 2, part.size * 2);
      }
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 10px monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

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

    // Scanlines for the CRT-arcade feel
    if (scanlines) ctx.drawImage(scanlines, 0, 0);

    // Vignette
    const vig = ctx.createRadialGradient(
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_H * 0.35,
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_H * 0.85
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    return isoTileFromPoint(VIEW, sx, sy, MAP_W, MAP_H);
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

  window.addEventListener('keydown', e => {
    if (phase !== 'play') return;
    if (e.key >= '1' && e.key <= '4') selectAgent(parseInt(e.key, 10) - 1);
    else if (e.key === '0' || e.key.toLowerCase() === 'a') selectAgent('all');
    else if (e.key === ' ') {
      e.preventDefault();
      triggerBoost();
    }
  });

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    money = 0;
    agentWeapons = Array(SQUAD_SIZE).fill('pistol');
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
      startMission(0);
    }
  });

  briefTitle.textContent = strings.missionNames[0];
  briefText.textContent = strings.missionBriefs[0];

  createGameLoop(update, render).start();
}
