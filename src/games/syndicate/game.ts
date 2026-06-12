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
  loadScore,
  recordHighScore,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  drawBlock,
  forEachTileBackToFront,
  shadeColor,
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
const RECORD_KEY = 'syndicate-record-cash';
const BOOST_DURATION = 4;
const BOOST_COOLDOWN = 14;
const EXTRACTION_RADIUS = 1.5;

const FACADES = ['#3c4566', '#46395c', '#35495c', '#4a3f55'];
const NEON = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24'];
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

  let phase: Phase = 'idle';
  let tiles: MapTile[] = generateCity(Math.random);
  let world: World = createWorld(tiles, [], Math.random);
  let missionIdx = 0;
  let spec: MissionSpec = MISSIONS[0];
  let extraction = -1;
  let money = 0;
  let record = loadScore(RECORD_KEY);
  let agentWeapons: WeaponId[] = Array(SQUAD_SIZE).fill('pistol');
  let selected = new Set<number>([0, 1, 2, 3]);
  let boostCooldown = 0;
  let clock = 0;
  let moveMarker: { tile: number; t: number } | null = null;
  let extractionAnnounced = false;
  let floaters: { x: number; y: number; text: string; color: string; life: number }[] = [];

  recordEl.textContent = `£${record}`;

  const squad = (): Unit[] => world.units.filter(u => u.kind === 'agent');

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
    missionEl.textContent = `${index + 1}/${MISSIONS.length}`;
    phase = 'play';
  }

  function rememberWeapons() {
    squad().forEach((agent, n) => {
      agentWeapons[n] = agent.alive ? (agent.weapon ?? 'pistol') : 'pistol';
    });
  }

  function endCampaign(victory: boolean) {
    phase = 'over';
    record = recordHighScore(RECORD_KEY, Math.floor(money));
    recordEl.textContent = `£${record}`;
    overIcon.textContent = victory ? '🏆' : '☠️';
    overTitle.textContent = victory ? strings.victory : strings.gameOver;
    overDesc.textContent = victory ? strings.victoryDesc : strings.gameOverDesc;
    finalCashEl.textContent = `£${Math.floor(money)}`;
    nextBtn.textContent = strings.playAgain;
    overOverlay.style.display = 'flex';
  }

  function completeMission() {
    money += spec.reward;
    rememberWeapons();
    if (missionIdx + 1 >= MISSIONS.length) {
      endCampaign(true);
      return;
    }
    phase = 'debrief';
    record = recordHighScore(RECORD_KEY, Math.floor(money));
    recordEl.textContent = `£${record}`;
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
        addFloater(event.x, event.y, '☠', '#f87171');
        showToast(`☠️ ${strings.agentDown}`);
      } else if (event.type === 'persuade') {
        const bonus = PERSUADE_BONUS[event.kind] ?? 0;
        money += bonus;
        addFloater(event.x, event.y, `+£${bonus}`, '#67e8f9');
        const kindName = strings.kinds[event.kind];
        if (kindName) showToast(`🧠 ${kindName} ${strings.joined}`);
      } else if (event.type === 'pickup') {
        if (event.upgraded) {
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
    if (moveMarker && (moveMarker.t -= dt) <= 0) moveMarker = null;
    if (phase !== 'play') return;

    boostCooldown = Math.max(0, boostCooldown - dt);
    handleEvents(stepWorld(world, dt));

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

  function drawUnit(u: Unit) {
    const p = isoProject(VIEW, u.x, u.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const isSquad = u.kind === 'agent';
    if (isSquad && selected.has(squad().indexOf(u))) {
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, 7, 3.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let body = '#39455e';
    let head = '#e8c39e';
    let visor: string | null = null;
    if (u.kind === 'agent') {
      body = '#39455e';
      head = '#2b3344';
      visor = '#67e8f9';
    } else if (u.kind === 'enemy') {
      body = '#4a2330';
      head = '#2b1722';
      visor = '#f87171';
    } else if (u.kind === 'guard') {
      body = '#2f4f8f';
    } else if (u.kind === 'target') {
      body = '#a8862c';
      head = '#e8c39e';
    } else {
      body = CIVILIAN_TINTS[u.tint % CIVILIAN_TINTS.length];
    }

    ctx.fillStyle = shadeColor(body, 0.7);
    ctx.fillRect(p.x - 2.5, p.y - 4, 5, 4);
    ctx.fillStyle = body;
    ctx.fillRect(p.x - 3, p.y - 9, 6, 5.5);
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 11, 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (visor) {
      ctx.fillStyle = visor;
      ctx.fillRect(p.x - 2, p.y - 11.5, 4, 1.2);
    }

    if (u.persuaded) {
      const bob = Math.sin(clock * 5 + u.id) * 1.2;
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 17 + bob, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (u.hp < u.maxHp) {
      const frac = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(p.x - 5, p.y - 16, 10, 2);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      ctx.fillRect(p.x - 5, p.y - 16, 10 * frac, 2);
    }
  }

  function drawPickup(pickup: { x: number; y: number }) {
    const p = isoProject(VIEW, pickup.x, pickup.y);
    const bob = Math.sin(clock * 4 + pickup.x * 3) * 1.5;
    ctx.font = '9px serif';
    ctx.fillText('🔫', p.x, p.y - 6 + bob);
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
      } else if (tile.kind === 'pavement') {
        fillTile(ctx, VIEW, x, y, (x + y) % 2 === 0 ? '#30374a' : '#343b4d');
      } else if (tile.kind === 'plaza') {
        fillTile(ctx, VIEW, x, y, '#283148');
      } else {
        fillTile(ctx, VIEW, x, y, '#10141f');
        drawBlock(ctx, VIEW, x, y, tile.height, FACADES[tile.palette]);
        drawWindows(x, y, i, tile.height);
        drawNeonTrim(x, y, tile.height, tile.palette);
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

    ctx.font = 'bold 10px monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    refreshHud();
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
