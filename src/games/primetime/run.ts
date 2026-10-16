/**
 * PRIME TIME's pure run: the contestant, the room, the crowd, the shots, the
 * prizes, the map between rooms, the bosses, the lives and the cash, all as
 * one state stepped by `tickRun` from a twin-stick `RunInput`. `game.ts` feeds
 * it the fixed step and renders whatever it says; `tests/games/primetime*.ts`
 * play whole runs through it headlessly with scripted contestants.
 *
 * Everything random draws from the run's own seeded stream, never from
 * `Math.random`, so a seed replays exactly; what the seed is allowed to move
 * is small on purpose (see `rooms.ts`).
 *
 * The one-hit rule is kept from Smash TV: a contestant who touches an enemy
 * or a hostile shot dies. What makes that fair is `respawn`: the floor around
 * the contestant is cleared by a shockwave, every hostile shot is swept, and
 * `RESPAWN_INVULN` seconds of invulnerability follow, so a death costs a life
 * and never, on its own, the next one.
 */
import {
  ARENA,
  CANVAS_H,
  CANVAS_W,
  SIDES,
  clampToArena,
  dist,
  doorCentre,
  doorSpawnPoint,
  exitThrough,
  insideArena,
  inwardOf,
  opposite,
  snap8,
  toward,
  type Pt,
  type Side
} from './arena';
import { seededRng } from '../engine/math';
import {
  ENEMIES,
  MINE_BLAST,
  MINE_PLAYER_BLAST,
  contactPoints,
  shrapnelBurst,
  spawnEnemy,
  stepEnemy,
  type BossKind,
  type Enemy,
  type EnemyKind,
  type Flak
} from './enemies';
import { resetBoss, spawnBoss, stepBoss } from './bosses';
import {
  BOOTS_FACTOR,
  BOOTS_SECONDS,
  DOME_KEYS,
  ITEMS,
  ITEM_R,
  KEY_BONUS,
  SHIELD_SECONDS,
  type Item,
  type ItemId
} from './items';
import { CIRCUITS, DOME_DROP_EVERY, DOME_SECONDS, neighbour, type RoomDef, type SpawnEntry } from './rooms';
import { WEAPONS, shotVectors, type WeaponId } from './weapons';

/** Both sticks, as raw vectors in -1..1; the run snaps them to eight ways. */
export interface RunInput {
  moveX: number;
  moveY: number;
  fireX: number;
  fireY: number;
}

export const NO_INPUT: RunInput = { moveX: 0, moveY: 0, fireX: 0, fireY: 0 };

export type Phase = 'room' | 'cleared' | 'map' | 'dying' | 'dome' | 'over' | 'won';

export interface Player {
  x: number;
  y: number;
  r: number;
  /** Seconds of post-respawn invulnerability left. */
  invuln: number;
  /** Seconds of shield left. */
  shield: number;
  /** Seconds of speed boots left. */
  boots: number;
  weapon: WeaponId;
  /** Shots left in a pickup gun; meaningless for the machine gun. */
  ammo: number;
  /** Seconds until the next shot may fire. */
  cooldown: number;
  /** The last direction fired in, for the sprite; east at the start. */
  aim: Pt;
  /** The last direction moved in, for the sprite. */
  facing: Pt;
  moving: boolean;
  firing: boolean;
}

/** The contestant's shot. */
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  weapon: WeaponId;
  damage: number;
  pierce: number;
  blast: number;
  /** Seconds left; a grenade's fuse, or a backstop for the rest. */
  life: number;
  /** Enemy ids this shot has already hurt, so a piercing shot hits each once. */
  hit: number[];
}

/** A spawn entry in progress: what is left of it and when its next enemy is due. */
interface Scheduled {
  entry: SpawnEntry;
  left: number;
  next: number;
}

interface ScheduledItem {
  item: ItemId;
  at: number;
}

export type HostLine = 'bigMoney' | 'bigPrizes' | 'loveIt' | 'carnage' | 'goodLuck' | 'newCar' | 'noKeys' | 'extraLife';

export type RunEvent =
  | { type: 'cash'; amount: number; x: number; y: number; reason: 'kill' | 'prize' | 'boss' | 'bonus' }
  /** `dx`/`dy` is the way the killing blow travelled (a unit vector), for the body to tumble along; zero when it has none. */
  | { type: 'kill'; kind: Enemy['kind']; x: number; y: number; dx: number; dy: number; armed: boolean }
  | { type: 'shot'; weapon: WeaponId; x: number; y: number }
  | { type: 'hit'; x: number; y: number; id: number }
  | { type: 'blast'; x: number; y: number; radius: number }
  | { type: 'pickup'; item: ItemId; x: number; y: number }
  | { type: 'death'; x: number; y: number }
  | { type: 'respawn'; x: number; y: number; radius: number }
  | { type: 'roomClear'; key: string }
  | { type: 'doorsOpen'; sides: Side[] }
  | { type: 'exit'; side: Side }
  | { type: 'enterRoom'; circuit: number; key: string; boss: BossKind | null }
  | { type: 'bossStage'; stage: number }
  | { type: 'bossDown'; kind: BossKind; x: number; y: number }
  | { type: 'studioClear'; studio: number; keys: number; bonus: number }
  | { type: 'host'; line: HostLine }
  | { type: 'bomb' }
  | { type: 'dome' }
  | { type: 'gameOver' }
  | { type: 'won' };

export interface RunState {
  seed: number;
  rng: () => number;
  /** Seconds since the run began. */
  t: number;
  phase: Phase;
  /** Seconds in the current phase. */
  phaseT: number;
  circuit: number;
  roomKey: string;
  visited: string[];
  player: Player;
  alive: boolean;
  lives: number;
  cash: number;
  keys: number;
  /** Keys picked up in the current studio, paid out when it is cleared. */
  studioKeys: number;
  kills: number;
  enemies: Enemy[];
  shots: Shot[];
  flak: Flak[];
  items: Item[];
  schedule: Scheduled[];
  itemSchedule: ScheduledItem[];
  /** Seconds since the room began. */
  roomT: number;
  /** Doors standing open (the room's exits once it is cleared). */
  openDoors: Side[];
  /** The door the contestant left by, while the map slides. */
  exitSide: Side | null;
  /** The room the map is sliding to, or 'next-studio' past a boss. */
  mapTarget: string | null;
  /** The boss in the room, while it lives. */
  boss: Enemy | null;
  bossStage: number;
  /** Rooms cleared this run, bosses included. */
  roomsCleared: number;
  deaths: number;
  /** A carnage streak: kills in the last couple of seconds. */
  streak: { count: number; since: number };
  /** Rotates the room-clear host lines. */
  hostIndex: number;
  nextId: number;
  domeNext: number;
  /** Every room has been fought; set with `won`. */
  finished: boolean;
}

export const START_LIVES = 3;
export const PLAYER_R = 11;
export const PLAYER_SPEED = 172;
/** Seconds the death freeze lasts before the respawn or the game over. */
export const DEATH_SECONDS = 1.1;
export const RESPAWN_INVULN = 2.5;
/** Radius of the respawn shockwave that clears the floor around the contestant. */
export const SHOCK_RADIUS = 120;
/** Seconds the map screen takes to slide to the next room. */
export const MAP_SECONDS = 1.6;
/** Nothing spawns inside this distance of the contestant, by door or on the floor. */
export const SAFE_SPAWN = 150;
/** A kill every so many drops a cash prize where the enemy fell. */
export const DROP_EVERY_KILLS = 12;
/** A streak of kills, none more than `STREAK_WINDOW` seconds after the last, that earns the carnage line. */
export const STREAK_KILLS = 20;
export const STREAK_WINDOW = 0.6;
/** Mines do this much to a boss caught in their blast. */
const MINE_BOSS_DAMAGE = 10;
/** Seconds a boss waits after its entrance before it starts. */
export const BOSS_ENTRANCE = 1.4;
/** Shots the renderer and the tests may count on being swept past the walls. */
const SHOT_MARGIN = 12;

const DOME_PRIZES: { item: ItemId; weight: number }[] = [
  { item: 'cash', weight: 40 },
  { item: 'toaster', weight: 28 },
  { item: 'vcr', weight: 22 },
  { item: 'car', weight: 10 }
];

export function createRun(seed = 1990): RunState {
  const run: RunState = {
    seed,
    rng: seededRng(seed),
    t: 0,
    phase: 'room',
    phaseT: 0,
    circuit: 0,
    roomKey: '',
    visited: [],
    player: {
      x: ARENA.x + ARENA.w / 2,
      y: ARENA.y + ARENA.h / 2,
      r: PLAYER_R,
      invuln: 0,
      shield: 0,
      boots: 0,
      weapon: 'machine',
      ammo: 0,
      cooldown: 0,
      aim: { x: 1, y: 0 },
      facing: { x: 1, y: 0 },
      moving: false,
      firing: false
    },
    alive: true,
    lives: START_LIVES,
    cash: 0,
    keys: 0,
    studioKeys: 0,
    kills: 0,
    enemies: [],
    shots: [],
    flak: [],
    items: [],
    schedule: [],
    itemSchedule: [],
    roomT: 0,
    openDoors: [],
    exitSide: null,
    mapTarget: null,
    boss: null,
    bossStage: 0,
    roomsCleared: 0,
    deaths: 0,
    streak: { count: 0, since: 0 },
    hostIndex: 0,
    nextId: 1,
    domeNext: 0,
    finished: false
  };
  enterRoom(run, CIRCUITS[0].start, null, []);
  return run;
}

export const currentRoom = (run: RunState): RoomDef => CIRCUITS[run.circuit].rooms[run.roomKey];

/** The contestant is in the bonus prize room (which is no room of a studio). */
export const inDome = (run: RunState): boolean => run.phase === 'dome';

/**
 * Enters a room: the contestant appears at the door opposite the one they
 * left by (the centre of the floor for a studio's first room), the script is
 * armed, the floor is clean, and a boss room's boss makes its entrance.
 */
function enterRoom(run: RunState, key: string, from: Side | null, events: RunEvent[]): void {
  const room = CIRCUITS[run.circuit].rooms[key];
  run.roomKey = key;
  run.visited.push(`${run.circuit}:${key}`);
  run.enemies = [];
  run.shots = [];
  run.flak = [];
  run.items = [];
  run.openDoors = [];
  run.exitSide = null;
  run.mapTarget = null;
  run.roomT = 0;
  run.boss = null;
  run.bossStage = 0;
  run.phase = 'room';
  run.phaseT = 0;
  run.player.cooldown = 0;
  if (from) {
    const arrive = opposite(from);
    const c = doorCentre(arrive);
    const inward = inwardOf(arrive);
    run.player.x = c.x + inward.x * 46;
    run.player.y = c.y + inward.y * 46;
  } else {
    run.player.x = ARENA.x + ARENA.w / 2;
    run.player.y = ARENA.y + ARENA.h / 2;
  }
  // A new room is a moment of calm: a short grace so the first grunt through
  // the door is seen coming.
  run.player.invuln = Math.max(run.player.invuln, 1);
  run.schedule = room.script.spawns.map(entry => ({ entry, left: entry.count, next: entry.at }));
  run.itemSchedule = room.script.items.map(i => ({ ...i }));
  if (room.boss) {
    const boss = spawnBoss(run.nextId++, room.boss, run.rng);
    boss.timer = BOSS_ENTRANCE;
    run.enemies.push(boss);
    run.boss = boss;
    events.push({ type: 'host', line: 'goodLuck' });
  }
  events.push({ type: 'enterRoom', circuit: run.circuit, key, boss: room.boss ?? null });
}

/** A door at least `SAFE_SPAWN` from the contestant, or any door when they stand mid-floor. */
function pickDoor(run: RunState): Side {
  const far = SIDES.filter(s => dist(doorCentre(s), run.player) > SAFE_SPAWN);
  const pool = far.length > 0 ? far : SIDES;
  return pool[Math.floor(run.rng() * pool.length)];
}

/**
 * A floor point clear of the walls and at least `safe` from the contestant;
 * the best of a few tries when the floor is crowded. Spawns keep the full
 * `SAFE_SPAWN`; the prize room, where nothing hostile lands, only keeps a
 * prize off the contestant's own square so it is seen landing.
 */
function floorPoint(run: RunState, margin = 40, safe = SAFE_SPAWN): Pt {
  let best: Pt = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
  let bestD = -1;
  for (let tries = 0; tries < 12; tries++) {
    const p = {
      x: ARENA.x + margin + run.rng() * (ARENA.w - margin * 2),
      y: ARENA.y + margin + run.rng() * (ARENA.h - margin * 2)
    };
    const d = dist(p, run.player);
    if (d > safe) return p;
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function spawnFrom(run: RunState, entry: SpawnEntry): void {
  if (entry.door === 'floor') {
    const p = floorPoint(run);
    run.enemies.push(spawnEnemy(run.nextId++, entry.kind, p.x, p.y, run.rng, entry.armed));
    return;
  }
  const side: Side = entry.door === 'any' ? pickDoor(run) : entry.door;
  const p = doorSpawnPoint(side, run.rng());
  run.enemies.push(spawnEnemy(run.nextId++, entry.kind, p.x, p.y, run.rng, entry.armed));
}

function dropItem(run: RunState, item: ItemId, at: Pt): void {
  const p = clampToArena(at.x, at.y, ITEM_R + 6);
  run.items.push({ id: run.nextId++, item, x: p.x, y: p.y, ttl: ITEMS[item].ttl, r: ITEM_R });
}

function pay(run: RunState, amount: number, at: Pt, reason: 'kill' | 'prize' | 'boss' | 'bonus', events: RunEvent[]): void {
  if (amount <= 0) return;
  run.cash += amount;
  events.push({ type: 'cash', amount, x: at.x, y: at.y, reason });
}

/**
 * An enemy dies: cash, the drop every so many kills, a shrapnel man's shards,
 * a mine's blast, a boss's fall. Blasts can chain, so kills queue rather than
 * recurse. `harmless` is for the smart bomb and the respawn shockwave: a mine
 * they set off clears the crowd as any mine does but never kills the
 * contestant, since both exist to save them (a bomb taken beside a mine was
 * a death before this flag).
 */
function kill(run: RunState, e: Enemy, events: RunEvent[], paid = true, harmless = false, from: Pt = { x: 0, y: 0 }): void {
  const queue: Enemy[] = [e];
  while (queue.length > 0) {
    const victim = queue.shift()!;
    if (victim.hp === -Infinity) continue;
    victim.hp = -Infinity;
    // Blast victims tumble away from the blast; the first body along the blow.
    const away = victim === e ? from : toward(e, victim);
    events.push({ type: 'kill', kind: victim.kind, x: victim.x, y: victim.y, dx: away.x, dy: away.y, armed: victim.armed });
    if (paid) {
      run.kills++;
      pay(run, victim.worth, victim, victim.boss ? 'boss' : 'kill', events);
      if (!victim.boss && run.kills % DROP_EVERY_KILLS === 0) dropItem(run, 'cash', victim);
      // A streak is kills that keep coming: the window rolls from the last kill.
      if (run.t - run.streak.since > STREAK_WINDOW) run.streak.count = 0;
      run.streak.since = run.t;
      run.streak.count++;
      if (run.streak.count === STREAK_KILLS) events.push({ type: 'host', line: 'carnage' });
    }
    if (victim.kind === 'shrapnel') run.flak.push(...shrapnelBurst(victim));
    if (victim.kind === 'mine') {
      events.push({ type: 'blast', x: victim.x, y: victim.y, radius: MINE_BLAST });
      for (const other of run.enemies) {
        if (other.hp === -Infinity || other === victim) continue;
        if (dist(other, victim) > MINE_BLAST + other.r) continue;
        if (other.boss) {
          other.hp -= MINE_BOSS_DAMAGE;
          if (other.hp <= 0) queue.push(other);
        } else {
          queue.push(other);
        }
      }
      if (!harmless && run.alive && !protectedPlayer(run) && dist(run.player, victim) <= MINE_PLAYER_BLAST + run.player.r) {
        die(run, events);
      }
    }
    if (victim.boss) {
      events.push({ type: 'bossDown', kind: victim.kind as BossKind, x: victim.x, y: victim.y });
      run.boss = null;
    }
  }
  run.enemies = run.enemies.filter(x => x.hp !== -Infinity);
}

const protectedPlayer = (run: RunState): boolean => run.player.invuln > 0 || run.player.shield > 0;

function die(run: RunState, events: RunEvent[]): void {
  if (!run.alive) return;
  run.alive = false;
  run.deaths++;
  run.phase = 'dying';
  run.phaseT = 0;
  run.player.firing = false;
  run.player.moving = false;
  events.push({ type: 'death', x: run.player.x, y: run.player.y });
}

/** The respawn, or the end: a life is spent here and nowhere else. */
function afterDeath(run: RunState, events: RunEvent[]): void {
  run.lives--;
  if (run.lives <= 0) {
    run.phase = 'over';
    run.phaseT = 0;
    events.push({ type: 'gameOver' });
    return;
  }
  run.alive = true;
  // Back to the room as it was: the doors stay open if they were.
  run.phase = run.openDoors.length > 0 ? 'cleared' : 'room';
  run.phaseT = 0;
  run.player.invuln = RESPAWN_INVULN;
  run.player.shield = 0;
  run.player.boots = 0;
  run.player.weapon = 'machine';
  run.player.ammo = 0;
  // The shockwave: every ordinary enemy within reach dies unpaid, and every
  // hostile shot on the floor is swept, so the respawn is never into a death.
  for (const e of [...run.enemies]) {
    if (e.boss || e.hp === -Infinity) continue;
    if (dist(e, run.player) <= SHOCK_RADIUS + e.r) kill(run, e, events, false, true);
  }
  run.flak = [];
  // A boss cannot be killed by the shockwave, so it is sent back to its
  // entrance and made to stand for a beat: left where it was it would be on
  // the contestant the moment the grace ran out, and the second life would go
  // the way of the first with nothing the contestant could do about it.
  if (run.boss) resetBoss(run.boss, BOSS_ENTRANCE);
  events.push({ type: 'respawn', x: run.player.x, y: run.player.y, radius: SHOCK_RADIUS });
  // The shockwave may have finished the room.
  if (run.phase === 'room' && roomDone(run)) clearRoom(run, events);
}

function pickUp(run: RunState, item: Item, events: RunEvent[]): void {
  const def = ITEMS[item.item];
  events.push({ type: 'pickup', item: item.item, x: item.x, y: item.y });
  pay(run, def.worth, item, 'prize', events);
  if (def.weapon) {
    run.player.weapon = def.weapon;
    run.player.ammo = WEAPONS[def.weapon].ammo;
    run.player.cooldown = 0;
  }
  switch (item.item) {
    case 'key':
      run.keys++;
      run.studioKeys++;
      break;
    case 'shield':
      run.player.shield = SHIELD_SECONDS;
      break;
    case 'boots':
      run.player.boots = BOOTS_SECONDS;
      break;
    case 'life':
      run.lives++;
      events.push({ type: 'host', line: 'extraLife' });
      break;
    case 'car':
      events.push({ type: 'host', line: 'newCar' });
      break;
    case 'bomb':
      events.push({ type: 'bomb' });
      for (const e of [...run.enemies]) {
        if (e.boss || e.hp === -Infinity) continue;
        kill(run, e, events, true, true);
      }
      run.flak = [];
      break;
  }
}

/** A blast from a grenade or a mine: damage to every enemy inside it. */
function blast(run: RunState, at: Pt, radius: number, damage: number, events: RunEvent[]): void {
  events.push({ type: 'blast', x: at.x, y: at.y, radius });
  for (const e of [...run.enemies]) {
    if (e.hp === -Infinity) continue;
    if (dist(e, at) > radius + e.r) continue;
    e.hp -= damage;
    if (e.hp <= 0) kill(run, e, events, true, false, toward(at, e));
  }
}

function stepPlayer(run: RunState, input: RunInput, dt: number, events: RunEvent[]): void {
  const p = run.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.shield = Math.max(0, p.shield - dt);
  p.boots = Math.max(0, p.boots - dt);
  const move = snap8(input.moveX, input.moveY);
  p.moving = move !== null;
  if (move) {
    p.facing = move;
    const speed = PLAYER_SPEED * (p.boots > 0 ? BOOTS_FACTOR : 1);
    const next = clampToArena(p.x + move.x * speed * dt, p.y + move.y * speed * dt, p.r, run.openDoors);
    p.x = next.x;
    p.y = next.y;
  }
  const fire = snap8(input.fireX, input.fireY);
  p.firing = fire !== null;
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (fire && run.phase !== 'dome') {
    p.aim = fire;
    if (p.cooldown <= 0) {
      const w = WEAPONS[p.weapon];
      p.cooldown += 1 / w.rate;
      for (const v of shotVectors(p.weapon, fire)) {
        run.shots.push({
          x: p.x + v.x * (p.r + 4),
          y: p.y + v.y * (p.r + 4),
          vx: v.x * w.speed,
          vy: v.y * w.speed,
          r: w.r,
          weapon: p.weapon,
          damage: w.damage,
          pierce: w.pierce,
          blast: w.blast,
          life: w.fuse > 0 ? w.fuse / w.speed : 3,
          hit: []
        });
      }
      events.push({ type: 'shot', weapon: p.weapon, x: p.x, y: p.y });
      if (w.ammo > 0) {
        p.ammo--;
        if (p.ammo <= 0) {
          p.weapon = 'machine';
          p.ammo = 0;
        }
      }
    }
  }
}

function stepSchedule(run: RunState, dt: number): void {
  run.roomT += dt;
  for (const s of run.schedule) {
    while (s.left > 0 && run.roomT >= s.next) {
      spawnFrom(run, s.entry);
      s.left--;
      s.next += s.entry.every;
    }
  }
  run.schedule = run.schedule.filter(s => s.left > 0);
  for (const i of run.itemSchedule) {
    if (run.roomT >= i.at) dropItem(run, i.item, floorPoint(run, 50));
  }
  run.itemSchedule = run.itemSchedule.filter(i => run.roomT < i.at);
}

function stepEnemies(run: RunState, dt: number, events: RunEvent[]): void {
  const out: Flak[] = [];
  let summoned = 0;
  for (const e of run.enemies) {
    if (e.boss) {
      // The entrance: a boss stands for a beat before it starts.
      if (e.t < BOSS_ENTRANCE) {
        e.t += dt;
        continue;
      }
      const call = stepBoss(e, run.player, dt, out);
      summoned += call.grunts;
      const stage = e.hp * 2 <= e.maxHp ? 1 : 0;
      if (stage !== run.bossStage) {
        run.bossStage = stage;
        events.push({ type: 'bossStage', stage });
      }
    } else {
      stepEnemy(e, run.player, dt, out);
      if (!e.entered) e.entered = insideArena(e.x, e.y, e.r);
      else if (e.kind !== 'mine') {
        const kept = clampToArena(e.x, e.y, e.r);
        e.x = kept.x;
        e.y = kept.y;
      }
    }
  }
  run.flak.push(...out);
  for (let i = 0; i < summoned; i++) spawnFrom(run, { kind: 'grunt', count: 1, at: 0, every: 0, door: 'any' });
}

function stepShots(run: RunState, dt: number, events: RunEvent[]): void {
  const kept: Shot[] = [];
  for (const s of run.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    let spent = false;
    for (const e of run.enemies) {
      if (e.hp === -Infinity || e.hp <= 0) continue;
      if (s.hit.includes(e.id)) continue;
      if (dist(s, e) > s.r + e.r) continue;
      if (s.blast > 0) {
        blast(run, s, s.blast, s.damage, events);
        spent = true;
        break;
      }
      s.hit.push(e.id);
      e.hp -= s.damage;
      events.push({ type: 'hit', x: s.x, y: s.y, id: e.id });
      if (e.hp <= 0) {
        const speed = Math.hypot(s.vx, s.vy) || 1;
        kill(run, e, events, true, false, { x: s.vx / speed, y: s.vy / speed });
      }
      if (s.hit.length >= s.pierce) {
        spent = true;
        break;
      }
    }
    if (spent) continue;
    const off = s.x < -SHOT_MARGIN || s.x > CANVAS_W + SHOT_MARGIN || s.y < -SHOT_MARGIN || s.y > CANVAS_H + SHOT_MARGIN;
    if (s.life <= 0 || off) {
      // A grenade whose fuse ran out bursts where it is; one that reached a
      // wall first bursts against the wall, never past it, so a grenade
      // lobbed at a crowd in a doorway is not swallowed by the margin.
      if (s.blast > 0) {
        const at = off ? clampToArena(s.x, s.y, 0) : s;
        blast(run, at, s.blast, s.damage, events);
      }
      continue;
    }
    kept.push(s);
  }
  run.shots = kept;
}

function stepFlak(run: RunState, dt: number): void {
  run.flak = run.flak.filter(f => {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.life -= dt;
    return f.life > 0 && f.x > -SHOT_MARGIN && f.x < CANVAS_W + SHOT_MARGIN && f.y > -SHOT_MARGIN && f.y < CANVAS_H + SHOT_MARGIN;
  });
}

function stepItems(run: RunState, dt: number, events: RunEvent[]): void {
  const kept: Item[] = [];
  for (const it of run.items) {
    it.ttl -= dt;
    if (it.ttl <= 0) continue;
    if (run.alive && dist(it, run.player) <= it.r + run.player.r) {
      pickUp(run, it, events);
      continue;
    }
    kept.push(it);
  }
  run.items = kept;
}

/** Contact: the crowd against the contestant, and hostile shots against them. */
function stepContact(run: RunState, events: RunEvent[]): void {
  if (!run.alive) return;
  const p = run.player;
  const shielded = p.shield > 0;
  for (const e of [...run.enemies]) {
    if (e.hp === -Infinity) continue;
    for (const c of contactPoints(e)) {
      if (dist(c, p) > c.r + p.r) continue;
      if (shielded && !e.boss) {
        // A shielded contestant is a battering ram: Smash TV let you walk
        // through the crowd, and so does this.
        kill(run, e, events);
        break;
      }
      if (protectedPlayer(run)) break;
      die(run, events);
      return;
    }
  }
  if (!run.alive) return;
  const left: Flak[] = [];
  for (const f of run.flak) {
    if (dist(f, p) <= f.r + p.r) {
      if (!protectedPlayer(run)) {
        die(run, events);
        return;
      }
      // A shot that meets a shield or the respawn grace is spent on it.
      continue;
    }
    left.push(f);
  }
  run.flak = left;
}

/**
 * The room's work is done: no spawns left and nothing alive that moves. Mines
 * do not count: they are hazards to walk round or shoot for the cash, not
 * objectives, since an eight-way gun cannot be sure of hitting one from where
 * the contestant happens to stand, and a room that waited on the last mine
 * once stalled a run for good. They stay on the floor until the exit.
 */
function roomDone(run: RunState): boolean {
  // The last shrapnel shards or a tank's final shell still crossing the floor
  // hold the celebration back too: they leave the canvas inside three seconds,
  // and a death during BIG MONEY would be a sour one.
  return run.schedule.length === 0 && run.flak.length === 0 && run.enemies.every(e => e.kind === 'mine');
}

const CLEAR_LINES: HostLine[] = ['bigMoney', 'bigPrizes', 'loveIt'];

function clearRoom(run: RunState, events: RunEvent[]): void {
  const room = currentRoom(run);
  run.phase = 'cleared';
  run.phaseT = 0;
  run.roomsCleared++;
  run.openDoors = [...room.exits];
  events.push({ type: 'roomClear', key: room.key });
  events.push({ type: 'host', line: CLEAR_LINES[run.hostIndex++ % CLEAR_LINES.length] });
  events.push({ type: 'doorsOpen', sides: run.openDoors });
}

/** The contestant has walked out: the map slides, and a boss room's exit ends the studio. */
function leaveRoom(run: RunState, side: Side, events: RunEvent[]): void {
  const circuit = CIRCUITS[run.circuit];
  const room = currentRoom(run);
  run.exitSide = side;
  run.phase = 'map';
  run.phaseT = 0;
  events.push({ type: 'exit', side });
  if (room.boss) {
    const bonus = run.studioKeys * KEY_BONUS;
    pay(run, bonus, run.player, 'bonus', events);
    events.push({ type: 'studioClear', studio: circuit.studio, keys: run.studioKeys, bonus });
    run.studioKeys = 0;
    // A studio cleared is a life earned, the show's one kindness.
    run.lives++;
    run.mapTarget = 'next-studio';
    return;
  }
  const next = neighbour(circuit, room, side);
  run.mapTarget = next ? next.key : circuit.start;
}

/** The map has slid: the next room, the next studio, the bonus room, or the win. */
function arrive(run: RunState, events: RunEvent[]): void {
  const side = run.exitSide;
  if (run.mapTarget === 'next-studio') {
    if (run.circuit + 1 < CIRCUITS.length) {
      run.circuit++;
      enterRoom(run, CIRCUITS[run.circuit].start, null, events);
      return;
    }
    run.finished = true;
    if (run.keys >= DOME_KEYS) {
      startDome(run, events);
    } else {
      events.push({ type: 'host', line: 'noKeys' });
      win(run, events);
    }
    return;
  }
  enterRoom(run, run.mapTarget as string, side, events);
}

function startDome(run: RunState, events: RunEvent[]): void {
  run.phase = 'dome';
  run.phaseT = 0;
  run.enemies = [];
  run.shots = [];
  run.flak = [];
  run.items = [];
  run.schedule = [];
  run.itemSchedule = [];
  run.openDoors = [];
  run.boss = null;
  run.player.x = ARENA.x + ARENA.w / 2;
  run.player.y = ARENA.y + ARENA.h / 2;
  run.player.invuln = 0;
  run.domeNext = 0.3;
  events.push({ type: 'dome' });
}

function stepDome(run: RunState, input: RunInput, dt: number, events: RunEvent[]): void {
  stepPlayer(run, input, dt, events);
  stepItems(run, dt, events);
  run.domeNext -= dt;
  if (run.domeNext <= 0 && run.phaseT < DOME_SECONDS - 3) {
    run.domeNext = DOME_DROP_EVERY;
    let roll = run.rng() * DOME_PRIZES.reduce((s, p) => s + p.weight, 0);
    let pick: ItemId = 'cash';
    for (const p of DOME_PRIZES) {
      roll -= p.weight;
      if (roll <= 0) {
        pick = p.item;
        break;
      }
    }
    const at = floorPoint(run, 44, 40);
    run.items.push({ id: run.nextId++, item: pick, x: at.x, y: at.y, ttl: 4, r: ITEM_R });
  }
  if (run.phaseT >= DOME_SECONDS) win(run, events);
}

function win(run: RunState, events: RunEvent[]): void {
  run.phase = 'won';
  run.phaseT = 0;
  run.finished = true;
  events.push({ type: 'won' });
}

/**
 * One fixed step of the run. Returns what happened for the presentation layer
 * to announce; the state itself is mutated in place.
 */
export function tickRun(run: RunState, input: RunInput, dt: number): RunEvent[] {
  const events: RunEvent[] = [];
  if (run.phase === 'over' || run.phase === 'won') return events;
  run.t += dt;
  run.phaseT += dt;
  switch (run.phase) {
    case 'dying':
      if (run.phaseT >= DEATH_SECONDS) afterDeath(run, events);
      break;
    case 'map':
      if (run.phaseT >= MAP_SECONDS) arrive(run, events);
      break;
    case 'dome':
      stepDome(run, input, dt, events);
      break;
    case 'room':
    case 'cleared': {
      stepPlayer(run, input, dt, events);
      stepSchedule(run, dt);
      stepEnemies(run, dt, events);
      stepShots(run, dt, events);
      stepFlak(run, dt);
      stepItems(run, dt, events);
      stepContact(run, events);
      if (!run.alive) break;
      if (run.phase === 'room' && roomDone(run)) clearRoom(run, events);
      if (run.phase === 'cleared') {
        const side = exitThrough(run.player.x, run.player.y, run.openDoors);
        if (side) leaveRoom(run, side, events);
      }
      break;
    }
  }
  return events;
}

/**
 * The harness's door: drops a run straight into a room of a studio, as if the
 * contestant had just walked in through the west door, with the floor clean.
 * For the tests that fight one boss at a time, and the playtesting bots; the
 * game never calls it.
 */
export function jumpToRoom(run: RunState, circuit: number, key: string): RunEvent[] {
  const events: RunEvent[] = [];
  run.circuit = circuit;
  run.phase = 'room';
  run.alive = true;
  enterRoom(run, key, 'e', events);
  return events;
}

/** The enemy nearest the contestant, bosses included, or null on an empty floor. */
export function nearestEnemy(run: RunState): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of run.enemies) {
    const d = dist(e, run.player) - e.r;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** The side of the room's doors a contestant should walk to for an exit (the first open one). */
export function exitTarget(run: RunState): Pt | null {
  if (run.openDoors.length === 0) return null;
  const side = run.openDoors[0];
  const c = doorCentre(side);
  const inward = inwardOf(side);
  // Just past the wall line, which is where `exitThrough` fires.
  return { x: c.x - inward.x * (ARENA.x + 2), y: c.y - inward.y * (ARENA.y + 2) };
}

/**
 * A stable fingerprint of a run for the determinism test: every number that
 * moves, ids included (they come from the run's own counter).
 */
export function fingerprint(run: RunState): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  const parts = [
    run.t,
    run.phase,
    run.circuit,
    run.roomKey,
    run.lives,
    run.cash,
    run.keys,
    run.kills,
    n(run.player.x),
    n(run.player.y),
    run.player.weapon,
    run.player.ammo,
    ...run.enemies.map(e => `${e.id}:${e.kind}:${n(e.x)}:${n(e.y)}:${e.hp}`),
    ...run.shots.map(s => `${n(s.x)}:${n(s.y)}`),
    ...run.flak.map(f => `${n(f.x)}:${n(f.y)}`),
    ...run.items.map(i => `${i.item}:${n(i.x)}:${n(i.y)}`)
  ];
  return parts.join('|');
}

export { toward, ENEMIES, type EnemyKind };
