import { describe, it, expect } from 'vitest';
import {
  ARENA,
  CANVAS_H,
  CANVAS_W,
  DEAD_ZONE,
  DIRS8,
  DOOR_W,
  SIDES,
  WALL,
  clampToArena,
  dist,
  doorCentre,
  doorRect,
  doorSpawnPoint,
  exitThrough,
  insideArena,
  snap8,
  type Side
} from '../../src/games/primetime/arena';
import { SPREAD_ANGLE, WEAPONS, WEAPON_IDS, shotVectors } from '../../src/games/primetime/weapons';
import {
  ENEMIES,
  MINE_BLAST,
  MINE_PLAYER_BLAST,
  SEGMENT_GAP,
  SHRAPNEL_SHARDS,
  SNAKE_SEGMENTS,
  contactPoints,
  followTail,
  shrapnelBurst,
  spawnEnemy,
  stepEnemy,
  type Flak
} from '../../src/games/primetime/enemies';
import { BOSSES, SCARFACE_CHARGE_SPEED, SCARFACE_PHASE, bossEntry, bossStage, spawnBoss, stepBoss } from '../../src/games/primetime/bosses';
import { DOME_KEYS, ITEMS, ITEM_R, SHIELD_SECONDS } from '../../src/games/primetime/items';
import {
  CIRCUITS,
  mix,
  neighbour,
  scriptEnemies,
  scriptLength,
  sideTo,
  type Circuit,
  type RoomDef
} from '../../src/games/primetime/rooms';
import {
  BOSS_ENTRANCE,
  DEATH_SECONDS,
  MAP_SECONDS,
  NO_INPUT,
  RESPAWN_INVULN,
  SAFE_SPAWN,
  SHOCK_RADIUS,
  START_LIVES,
  STREAK_KILLS,
  STREAK_WINDOW,
  createRun,
  fingerprint,
  jumpToRoom,
  tickRun,
  type RunEvent,
  type RunInput,
  type RunState
} from '../../src/games/primetime/run';
import { GAME_KEYS, composeInput, readGamepad, stickVector, STICK_RANGE } from '../../src/games/primetime/input';
import { seededRandom } from './seeded-random';
import { TICK, competent, idle, playRun, turret } from './primetime-policies';
import { ALL_SPRITES, GRUNT_KITS, validateSprite } from '../../src/games/primetime/sprites';

const rng = () => seededRandom(7);

/** Ticks a run `seconds` forward under one input. */
function advance(run: RunState, seconds: number, input: RunInput = NO_INPUT): RunEvent[] {
  const out: RunEvent[] = [];
  for (let i = 0; i < Math.round(seconds / TICK); i++) out.push(...tickRun(run, input, TICK));
  return out;
}

/** An empty floor to test one thing on: the start room with its script thrown away. */
function quietRoom(seed = 1): RunState {
  const run = createRun(seed);
  run.schedule = [];
  run.itemSchedule = [];
  run.enemies = [];
  run.player.invuln = 0;
  return run;
}

describe('the arena', () => {
  it('cuts one door in the middle of each wall, as deep as the wall', () => {
    for (const side of SIDES) {
      const r = doorRect(side);
      const c = doorCentre(side);
      if (side === 'n' || side === 's') {
        expect(r.w).toBe(DOOR_W);
        expect(r.h).toBe(WALL);
        expect(c.x).toBeCloseTo(CANVAS_W / 2);
      } else {
        expect(r.h).toBe(DOOR_W);
        expect(r.w).toBe(WALL);
        expect(c.y).toBeCloseTo(CANVAS_H / 2);
      }
    }
  });

  it('spawns a door arrival just outside the floor, spread across the door', () => {
    for (const side of SIDES) {
      const a = doorSpawnPoint(side, 0);
      const b = doorSpawnPoint(side, 1);
      expect(insideArena(a.x, a.y, 1)).toBe(false);
      expect(dist(a, b)).toBeGreaterThan(DOOR_W / 2);
      // Out of range `along` is clamped, never off the door.
      expect(doorSpawnPoint(side, 7)).toEqual(b);
    }
  });

  it('snaps a stick to the nearest of eight ways and reads the dead zone as centred', () => {
    expect(snap8(1, 0)).toEqual(DIRS8[0]);
    expect(snap8(0.7, 0.7)).toEqual(DIRS8[1]);
    expect(snap8(-1, 0.1)).toEqual(DIRS8[4]);
    expect(snap8(0, -1)).toEqual(DIRS8[6]);
    expect(snap8(DEAD_ZONE * 0.9, 0)).toBeNull();
    expect(snap8(0, 0)).toBeNull();
    for (const d of DIRS8) expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 5);
  });

  it('keeps a circle on the floor, and lets it through an open door only inside the door span', () => {
    const r = 11;
    const clamped = clampToArena(-50, 200, r);
    expect(clamped.x).toBe(ARENA.x + r);
    // Through the west door with the door open: the wall line may be crossed.
    const cy = ARENA.y + ARENA.h / 2;
    expect(clampToArena(-50, cy, r, ['w']).x).toBe(-50);
    // Open, but off the door's span: still a wall.
    expect(clampToArena(-50, cy + DOOR_W, r, ['w']).x).toBe(ARENA.x + r);
    // A closed door is a wall.
    expect(clampToArena(-50, cy, r, ['e']).x).toBe(ARENA.x + r);
  });

  it('counts an exit only once the centre is past the wall, through an open door', () => {
    const cy = ARENA.y + ARENA.h / 2;
    expect(exitThrough(ARENA.x + 5, cy, ['w'])).toBeNull();
    expect(exitThrough(0, cy, ['w'])).toBe('w');
    expect(exitThrough(0, cy, ['e'])).toBeNull();
    expect(exitThrough(CANVAS_W, cy, ['e'])).toBe('e');
    expect(exitThrough(CANVAS_W / 2, 0, ['n'])).toBe('n');
    expect(exitThrough(CANVAS_W / 2, CANVAS_H, ['s'])).toBe('s');
  });
});

describe('the guns', () => {
  it('fires the machine gun from a bottomless belt and every pickup from a finite one', () => {
    expect(WEAPONS.machine.ammo).toBe(0);
    for (const id of WEAPON_IDS.filter(w => w !== 'machine')) expect(WEAPONS[id].ammo).toBeGreaterThan(0);
  });

  it('fans the spread gun into three shots, the aim and one each side', () => {
    const shots = shotVectors('spread', DIRS8[0]);
    expect(shots).toHaveLength(3);
    expect(shots[1]).toEqual(DIRS8[0]);
    expect(Math.atan2(shots[0].y, shots[0].x)).toBeCloseTo(-SPREAD_ANGLE);
    expect(Math.atan2(shots[2].y, shots[2].x)).toBeCloseTo(SPREAD_ANGLE);
    for (const id of WEAPON_IDS.filter(w => w !== 'spread')) expect(shotVectors(id, DIRS8[3])).toEqual([DIRS8[3]]);
  });

  it('gives the grenade a blast and a fuse, the rocket a pierce, and the rest neither', () => {
    expect(WEAPONS.grenade.blast).toBeGreaterThan(0);
    expect(WEAPONS.grenade.fuse).toBeGreaterThan(0);
    expect(WEAPONS.rocket.pierce).toBeGreaterThan(1);
    expect(WEAPONS.machine.pierce).toBe(1);
    expect(WEAPONS.machine.blast).toBe(0);
  });
});

describe('the crowd', () => {
  const player = { x: 300, y: 200 };

  it('sends a grunt at the contestant, with a wobble that never turns it back', () => {
    const g = spawnEnemy(1, 'grunt', 100, 200, rng());
    const before = dist(g, player);
    for (let i = 0; i < 60; i++) stepEnemy(g, player, TICK, []);
    expect(dist(g, player)).toBeLessThan(before - 60);
  });

  it('rounds an orb on the contestant at a limited turn rate, so it can be outrun across its path', () => {
    const o = spawnEnemy(1, 'orb', 100, 200, rng());
    stepEnemy(o, player, TICK, []);
    // Heading east at the contestant; now the contestant is straight north.
    const north = { x: 100 + o.vx * TICK, y: -200 };
    const heading0 = Math.atan2(o.vy, o.vx);
    stepEnemy(o, north, TICK, []);
    const heading1 = Math.atan2(o.vy, o.vx);
    expect(Math.abs(heading1 - heading0)).toBeLessThan(0.1);
    expect(Math.abs(heading1 - heading0)).toBeGreaterThan(0);
  });

  it('arms an orb only when its room says so', () => {
    const out: Flak[] = [];
    const quiet = spawnEnemy(1, 'orb', 100, 200, rng(), false);
    const armed = spawnEnemy(2, 'orb', 100, 200, rng(), true);
    for (let i = 0; i < 300; i++) {
      stepEnemy(quiet, player, TICK, out);
    }
    expect(out).toHaveLength(0);
    // From well out of its minimum range it fires; inside it, it holds.
    const far = { x: 600, y: 200 };
    for (let i = 0; i < 300; i++) stepEnemy(armed, far, TICK, out);
    expect(out.length).toBeGreaterThan(0);
    const close = spawnEnemy(3, 'orb', 100, 200, rng(), true);
    const held: Flak[] = [];
    for (let i = 0; i < 300; i++) stepEnemy(close, { x: close.x + 40, y: close.y }, TICK, held);
    expect(held).toHaveLength(0);
  });

  it('shells the contestant from a tank on a clock', () => {
    const out: Flak[] = [];
    const tank = spawnEnemy(1, 'tank', 40, 200, rng());
    // Five seconds: two shells, with the tank still well west of the contestant.
    for (let i = 0; i < 300; i++) stepEnemy(tank, player, TICK, out);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(tank.x).toBeLessThan(player.x - 50);
    // Every shell heads toward the contestant.
    for (const f of out) expect(f.vx).toBeGreaterThan(0);
  });

  it('bursts a shrapnel man into eight shards, one per compass point', () => {
    const shards = shrapnelBurst({ x: 10, y: 10 });
    expect(shards).toHaveLength(SHRAPNEL_SHARDS);
    const angles = shards.map(s => Math.round((Math.atan2(s.vy, s.vx) * 180) / Math.PI));
    expect(new Set(angles).size).toBe(SHRAPNEL_SHARDS);
  });

  it('drags a snake tail at a fixed gap and counts every segment as a thing that kills', () => {
    const snake = spawnEnemy(1, 'snake', 100, 200, rng());
    for (let i = 0; i < 120; i++) stepEnemy(snake, player, TICK, []);
    const tail = snake.tail!;
    expect(tail).toHaveLength(SNAKE_SEGMENTS);
    // Each segment is dragged to its gap and never stretched past it; the
    // weaving head can swing back toward one, so a gap may close but not open.
    expect(dist(snake, tail[0])).toBeLessThanOrEqual(SEGMENT_GAP + 0.01);
    for (let i = 1; i < tail.length; i++) expect(dist(tail[i - 1], tail[i])).toBeLessThanOrEqual(SEGMENT_GAP + 0.01);
    expect(dist(snake, tail[tail.length - 1])).toBeGreaterThan(SEGMENT_GAP * 3);
    expect(contactPoints(snake)).toHaveLength(SNAKE_SEGMENTS + 1);
    // A tail that is already close enough does not move.
    const still = [{ x: 5, y: 0 }];
    followTail({ x: 0, y: 0 }, still, 10);
    expect(still[0]).toEqual({ x: 5, y: 0 });
  });

  it('prices every kind and leaves the mine standing still', () => {
    for (const def of Object.values(ENEMIES)) {
      expect(def.worth).toBeGreaterThan(0);
      expect(def.hp).toBeGreaterThan(0);
    }
    expect(ENEMIES.mine.speed).toBe(0);
    const mine = spawnEnemy(1, 'mine', 100, 200, rng());
    stepEnemy(mine, player, 1, []);
    expect([mine.x, mine.y]).toEqual([100, 200]);
  });
});

describe('the bosses', () => {
  const player = { x: 120, y: 200 };

  it('tightens every boss at half health', () => {
    for (const kind of ['mutoid', 'scarface', 'cobra'] as const) {
      const b = spawnBoss(1, kind, rng());
      expect(bossStage(b)).toBe(0);
      b.hp = Math.floor(b.maxHp / 2);
      expect(bossStage(b)).toBe(1);
    }
  });

  it('has Mutoid Man fan shots at the contestant and call grunts in', () => {
    const b = spawnBoss(1, 'mutoid', rng());
    const out: Flak[] = [];
    let grunts = 0;
    for (let i = 0; i < 600; i++) grunts += stepBoss(b, player, TICK, out).grunts;
    expect(out.length).toBeGreaterThanOrEqual(8);
    expect(grunts).toBeGreaterThan(0);
    // The fan is centred on the contestant: all its shots head west.
    for (const f of out) expect(f.vx).toBeLessThan(0);
  });

  it('has Scarface hover, wind up (telegraphing the charge) and then charge', () => {
    const b = spawnBoss(1, 'scarface', rng());
    const out: Flak[] = [];
    const seen: number[] = [];
    for (let i = 0; i < 300; i++) {
      stepBoss(b, player, TICK, out);
      if (seen[seen.length - 1] !== b.phase) seen.push(b.phase);
    }
    expect(seen.slice(0, 3)).toEqual([SCARFACE_PHASE.hover, SCARFACE_PHASE.windup, SCARFACE_PHASE.charge]);
    // In its first stage it does not shoot.
    expect(out).toHaveLength(0);
  });

  it('has Cobra Death weave at the contestant with its body in tow, shooting bursts', () => {
    const b = spawnBoss(1, 'cobra', rng());
    const out: Flak[] = [];
    for (let i = 0; i < 240; i++) stepBoss(b, player, TICK, out);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(b.tail!.length).toBeGreaterThan(SNAKE_SEGMENTS);
    expect(insideArena(b.x, b.y, b.r)).toBe(true);
  });

  it('prices the bosses in rising order and worth more than any crowd', () => {
    expect(BOSSES.mutoid.worth).toBeLessThan(BOSSES.scarface.worth);
    expect(BOSSES.scarface.worth).toBeLessThan(BOSSES.cobra.worth);
    expect(BOSSES.mutoid.worth).toBeGreaterThan(ENEMIES.tank.worth * 5);
  });
});

describe('the studios', () => {
  const rooms = (c: Circuit): RoomDef[] => Object.values(c.rooms);

  it('has three studios, each with a start and a boss room', () => {
    expect(CIRCUITS).toHaveLength(3);
    CIRCUITS.forEach((c, i) => {
      expect(c.studio).toBe(i + 1);
      expect(c.rooms[c.start]).toBeDefined();
      expect(c.rooms[c.boss].boss).toBeDefined();
      for (const r of rooms(c)) if (r.key !== c.boss) expect(r.boss).toBeUndefined();
    });
  });

  it.each(CIRCUITS)('studio $studio: every exit leads to a real neighbour and the boss room exits east off the map', c => {
    for (const r of rooms(c)) {
      if (r.boss) {
        expect(r.exits).toEqual(['e']);
        continue;
      }
      for (const side of r.exits) {
        const next = neighbour(c, r, side);
        expect(next, `${r.key} exits ${side} into nothing`).not.toBeNull();
        expect(sideTo(r, next!)).toBe(side);
      }
    }
  });

  it.each(CIRCUITS)('studio $studio: the map is a DAG from the start that reaches the boss from every room', c => {
    const forward = (r: RoomDef): RoomDef[] => (r.boss ? [] : r.exits.map(s => neighbour(c, r, s)!));
    // No cycles: a depth-first walk never meets a room on its own stack.
    const visiting = new Set<string>();
    const done = new Set<string>();
    const walk = (r: RoomDef): void => {
      expect(visiting.has(r.key), `cycle through ${r.key}`).toBe(false);
      if (done.has(r.key)) return;
      visiting.add(r.key);
      for (const n of forward(r)) walk(n);
      visiting.delete(r.key);
      done.add(r.key);
    };
    walk(c.rooms[c.start]);
    // Every room is reached from the start, and every room reaches the boss:
    // no dead ends, so a contestant can never be stuck for a door.
    expect([...done].sort()).toEqual(Object.keys(c.rooms).sort());
    const reachesBoss = (r: RoomDef, seen = new Set<string>()): boolean => {
      if (r.boss) return true;
      if (seen.has(r.key)) return false;
      seen.add(r.key);
      return forward(r).some(n => reachesBoss(n, seen));
    };
    for (const r of rooms(c)) expect(reachesBoss(r), `${r.key} cannot reach the boss`).toBe(true);
  });

  it('sends more enemies a room with each studio, and finishes every script inside a minute', () => {
    const means = CIRCUITS.map(c => {
      const fights = rooms(c).filter(r => !r.boss);
      return fights.reduce((n, r) => n + scriptEnemies(r.script), 0) / fights.length;
    });
    expect(means[0]).toBeLessThan(means[1]);
    expect(means[1]).toBeLessThan(means[2]);
    expect(means[0]).toBeGreaterThan(25);
    for (const c of CIRCUITS) for (const r of rooms(c)) expect(scriptLength(r.script)).toBeLessThan(60);
  });

  it('builds a room from its knobs: three grunt streams, mines first, items spaced through the fight', () => {
    const script = mix({ grunts: 40, mines: 2, orbs: 3, items: ['cash', 'spread'] });
    const grunts = script.spawns.filter(s => s.kind === 'grunt');
    expect(grunts).toHaveLength(3);
    expect(grunts.reduce((n, s) => n + s.count, 0)).toBe(40);
    expect(grunts[0].at).toBeLessThan(grunts[1].at);
    expect(grunts[1].at).toBeLessThan(grunts[2].at);
    expect(script.spawns.find(s => s.kind === 'mine')!.door).toBe('floor');
    expect(script.items.map(i => i.at)).toEqual([3, 9]);
  });

  it('keeps every studio playable for the keys: at least DOME_KEYS keys lie on some route through the three', () => {
    const keysOnRoute = CIRCUITS.reduce((n, c) => {
      // The most keys any single route collects, by walking every path.
      const best = (r: RoomDef): number => {
        const own = r.script.items.filter(i => i.item === 'key').length;
        if (r.boss) return own;
        return own + Math.max(...r.exits.map(s => best(neighbour(c, r, s)!)));
      };
      return n + best(c.rooms[c.start]);
    }, 0);
    expect(keysOnRoute).toBeGreaterThanOrEqual(DOME_KEYS);
  });
});

describe('the run', () => {
  it('starts in the first studio with the contestant mid-floor and three lives', () => {
    const run = createRun(5);
    expect(run.circuit).toBe(0);
    expect(run.roomKey).toBe(CIRCUITS[0].start);
    expect(run.lives).toBe(START_LIVES);
    expect(run.cash).toBe(0);
    expect(run.player.x).toBeCloseTo(ARENA.x + ARENA.w / 2);
    expect(run.phase).toBe('room');
  });

  it('never spawns inside reach of the contestant, by door or on the floor', () => {
    for (const seed of [1, 2, 3]) {
      const run = createRun(seed);
      // Hold the contestant at a door's centre, where the nearest door would spawn in their face.
      const west = doorCentre('w');
      run.player.x = west.x + 30;
      run.player.y = west.y;
      const seen = new Set<number>();
      for (let i = 0; i < 60 * 25; i++) {
        tickRun(run, NO_INPUT, TICK);
        run.player.x = west.x + 30;
        run.player.y = west.y;
        run.player.invuln = 10;
        for (const e of run.enemies) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          expect(dist(e, run.player), `${e.kind} spawned ${dist(e, run.player).toFixed(0)} px from the contestant`).toBeGreaterThan(SAFE_SPAWN - 30);
        }
      }
      expect(seen.size).toBeGreaterThan(10);
    }
  });

  it('kills on contact, pays the shot, and a death costs a life after the freeze', () => {
    const run = quietRoom();
    const g = spawnEnemy(99, 'grunt', run.player.x + 40, run.player.y, rng());
    run.enemies.push(g);
    // Shooting east kills it and pays.
    const events = advance(run, 0.5, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    const cash = events.filter(e => e.type === 'cash');
    expect(cash.length).toBe(1);
    // The dollars land where the grunt fell, on the shot's line east of the contestant.
    expect(cash[0]).toMatchObject({ amount: ENEMIES.grunt.worth, reason: 'kill' });
    if (cash[0].type === 'cash') {
      expect(cash[0].y).toBeCloseTo(run.player.y, 0);
      expect(cash[0].x).toBeGreaterThan(run.player.x);
    }
    expect(run.cash).toBe(ENEMIES.grunt.worth);
    // A grunt on top of the contestant kills them.
    run.enemies.push(spawnEnemy(100, 'grunt', run.player.x, run.player.y, rng()));
    const death = advance(run, TICK);
    expect(death.map(e => e.type)).toContain('death');
    expect(run.phase).toBe('dying');
    expect(run.lives).toBe(START_LIVES);
    const after = advance(run, DEATH_SECONDS + TICK);
    expect(after.map(e => e.type)).toContain('respawn');
    expect(run.lives).toBe(START_LIVES - 1);
    expect(run.player.invuln).toBeCloseTo(RESPAWN_INVULN, 1);
  });

  it('clears the floor around a respawn without paying, sweeps every hostile shot, and leaves the boss', () => {
    const run = jumpAndQuiet(0, 'X');
    const boss = run.enemies[0];
    boss.x = run.player.x + 40;
    boss.y = run.player.y;
    run.enemies.push(spawnEnemy(201, 'grunt', run.player.x + 50, run.player.y + 50, rng()));
    run.enemies.push(spawnEnemy(202, 'grunt', run.player.x + SHOCK_RADIUS + 60, run.player.y, rng()));
    run.flak.push({ x: 50, y: 50, vx: 0, vy: 0, r: 4, life: 5 });
    const cashBefore = run.cash;
    // The boss body is on the contestant: a death.
    const events = advance(run, DEATH_SECONDS + 2 * TICK);
    expect(events.map(e => e.type)).toContain('respawn');
    expect(run.enemies.map(e => e.id)).toEqual([boss.id, 202]);
    expect(run.flak).toEqual([]);
    expect(run.cash).toBe(cashBefore);
  });

  it('ends the run on the third death with a game over, and the cash stands', () => {
    const run = quietRoom();
    for (let life = 0; life < START_LIVES; life++) {
      run.player.invuln = 0;
      run.enemies.push(spawnEnemy(300 + life, 'grunt', run.player.x, run.player.y, rng()));
      advance(run, DEATH_SECONDS + 2 * TICK);
    }
    expect(run.phase).toBe('over');
    expect(run.lives).toBe(0);
    // Nothing moves after the end.
    expect(advance(run, 1)).toEqual([]);
  });

  it('is invulnerable through the respawn grace, and a shot that meets it is spent', () => {
    const run = quietRoom();
    run.player.invuln = RESPAWN_INVULN;
    run.flak.push({ x: run.player.x, y: run.player.y, vx: 0, vy: 0, r: 4, life: 5 });
    const events = advance(run, TICK);
    expect(events.map(e => e.type)).not.toContain('death');
    expect(run.flak).toEqual([]);
  });

  it('opens the exits once the crowd is dead and mines do not count, then walks the contestant to the map', () => {
    const run = createRun(3);
    const room = CIRCUITS[0].rooms[run.roomKey];
    run.schedule = [];
    run.itemSchedule = [];
    run.enemies = [spawnEnemy(1, 'mine', 100, 100, rng())];
    const events = advance(run, TICK);
    expect(events.find(e => e.type === 'doorsOpen')).toMatchObject({ sides: room.exits });
    expect(events.map(e => e.type)).toContain('roomClear');
    expect(run.phase).toBe('cleared');
    // The mine stays on the floor as a hazard.
    expect(run.enemies).toHaveLength(1);
    // Walk out of the east door.
    const door = doorCentre('e');
    run.player.x = door.x - 30;
    run.player.y = door.y;
    const out = advance(run, 1.2, { moveX: 1, moveY: 0, fireX: 0, fireY: 0 });
    expect(out.find(e => e.type === 'exit')).toMatchObject({ side: 'e' });
    expect(run.phase).toBe('map');
    const arrive = advance(run, MAP_SECONDS + TICK);
    const entered = arrive.find(e => e.type === 'enterRoom');
    expect(entered).toMatchObject({ circuit: 0, key: 'B' });
    // Arrived through the west door of B, inside the floor.
    expect(run.player.x).toBeLessThan(ARENA.x + 80);
    expect(insideArena(run.player.x, run.player.y, run.player.r)).toBe(true);
  });

  it("will not let the contestant through a door that is not an exit", () => {
    const run = quietRoom();
    const door = doorCentre('n');
    run.player.x = door.x;
    run.player.y = door.y + 20;
    advance(run, 1, { moveX: 0, moveY: -1, fireX: 0, fireY: 0 });
    // The start room's only exit is east.
    expect(run.phase).toBe('cleared');
    expect(run.player.y).toBeGreaterThanOrEqual(ARENA.y + run.player.r - 0.01);
  });

  it('hands over a gun with its ammo on pickup and falls back to the machine gun when it is spent', () => {
    const run = quietRoom();
    run.items.push({ id: 1, item: 'spread', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    advance(run, TICK);
    expect(run.player.weapon).toBe('spread');
    expect(run.player.ammo).toBe(WEAPONS.spread.ammo);
    let shots = 0;
    for (let i = 0; i < 60 * 20 && run.player.weapon === 'spread'; i++) {
      shots += tickRun(run, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 }, TICK).filter(e => e.type === 'shot').length;
    }
    expect(shots).toBe(WEAPONS.spread.ammo);
    expect(run.player.weapon).toBe('machine');
  });

  it('pays prizes where they lie, counts keys, and announces a car', () => {
    const run = quietRoom();
    const at = { x: run.player.x, y: run.player.y };
    run.items.push({ id: 1, item: 'car', ...at, ttl: 9, r: ITEM_R });
    run.items.push({ id: 2, item: 'key', ...at, ttl: 9, r: ITEM_R });
    const events = advance(run, TICK);
    expect(run.cash).toBe(ITEMS.car.worth + ITEMS.key.worth);
    expect(run.keys).toBe(1);
    expect(events).toContainEqual({ type: 'host', line: 'newCar' });
    const cash = events.filter(e => e.type === 'cash');
    for (const c of cash) if (c.type === 'cash') expect([c.x, c.y]).toEqual([at.x, at.y]);
  });

  it('makes a shielded contestant a battering ram and times the shield out', () => {
    const run = quietRoom();
    run.items.push({ id: 1, item: 'shield', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    advance(run, TICK);
    expect(run.player.shield).toBeCloseTo(SHIELD_SECONDS, 1);
    run.enemies.push(spawnEnemy(5, 'grunt', run.player.x, run.player.y, rng()));
    const events = advance(run, TICK);
    expect(events.map(e => e.type)).toContain('kill');
    expect(events.map(e => e.type)).not.toContain('death');
    advance(run, SHIELD_SECONDS);
    expect(run.player.shield).toBe(0);
  });

  it('clears the floor with a smart bomb, paying for every kill, and spares a boss', () => {
    const run = jumpAndQuiet(0, 'X');
    const boss = run.enemies[0];
    for (let i = 0; i < 10; i++) run.enemies.push(spawnEnemy(500 + i, 'grunt', 100 + i * 20, 100, rng()));
    run.items.push({ id: 1, item: 'bomb', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    const events = advance(run, TICK);
    expect(events.map(e => e.type)).toContain('bomb');
    expect(events.filter(e => e.type === 'kill')).toHaveLength(10);
    expect(run.enemies).toEqual([boss]);
    expect(run.cash).toBe(10 * ENEMIES.grunt.worth);
  });

  it('bursts a grenade on everything inside its blast', () => {
    const run = quietRoom();
    run.items.push({ id: 1, item: 'grenade', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    advance(run, TICK);
    for (let i = 0; i < 5; i++) run.enemies.push(spawnEnemy(600 + i, 'grunt', run.player.x + 120 + i * 12, run.player.y + (i - 2) * 14, rng()));
    const events = advance(run, 1, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    expect(events.map(e => e.type)).toContain('blast');
    expect(events.filter(e => e.type === 'kill').length).toBeGreaterThanOrEqual(4);
  });

  it('bursts a grenade against a wall it reaches before its fuse, on the crowd in the doorway', () => {
    const run = quietRoom();
    run.items.push({ id: 1, item: 'grenade', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    advance(run, TICK);
    // Stand near the east wall and lob at it: the fuse would carry the shot
    // off the canvas, where it used to vanish without bursting.
    run.player.x = ARENA.x + ARENA.w - 40;
    // A grunt beside the door, off the shot's line but inside its blast; the
    // grace keeps the contestant alive long enough for the lob to land.
    run.player.invuln = 5;
    run.enemies.push(spawnEnemy(650, 'grunt', ARENA.x + ARENA.w - 12, run.player.y + 30, rng()));
    const events = advance(run, 0.6, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    const blasts = events.filter(e => e.type === 'blast');
    expect(blasts.length).toBeGreaterThan(0);
    for (const b of blasts) if (b.type === 'blast') expect(b.x).toBeLessThanOrEqual(ARENA.x + ARENA.w);
    expect(events.filter(e => e.type === 'kill')).toHaveLength(1);
  });

  it('detonates a shot mine on the crowd around it, and on a contestant only when they stand on it', () => {
    for (const standOnIt of [false, true]) {
      const run = quietRoom();
      const gap = standOnIt ? MINE_PLAYER_BLAST + run.player.r - 2 : MINE_PLAYER_BLAST + run.player.r + 12;
      const mine = spawnEnemy(700, 'mine', run.player.x + gap, run.player.y, rng());
      run.enemies.push(mine);
      run.enemies.push(spawnEnemy(701, 'grunt', mine.x + 30, mine.y, rng()));
      run.enemies.push(spawnEnemy(702, 'grunt', mine.x + MINE_BLAST + 130, mine.y, rng()));
      const events = advance(run, 0.4, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
      const kills = events.filter(e => e.type === 'kill').map(e => (e.type === 'kill' ? e.kind : ''));
      expect(kills).toContain('mine');
      expect(kills.filter(k => k === 'grunt')).toHaveLength(1);
      // Inside the crowd radius but off the mine itself, a stray round that
      // set it off costs nothing; standing on it, everything.
      expect(events.map(e => e.type).includes('death')).toBe(standOnIt);
    }
  });

  it('never lets a smart bomb or a respawn shockwave kill the contestant through a mine beside them', () => {
    const run = quietRoom();
    run.enemies.push(spawnEnemy(710, 'mine', run.player.x + 20, run.player.y, rng()));
    run.items.push({ id: 1, item: 'bomb', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    const bombed = advance(run, TICK);
    expect(bombed.map(e => e.type)).toContain('blast');
    expect(bombed.map(e => e.type)).not.toContain('death');
    expect(run.enemies).toEqual([]);
    // Now a death beside a mine: the shockwave sets it off, harmlessly.
    run.enemies.push(spawnEnemy(711, 'mine', run.player.x + 20, run.player.y, rng()));
    run.enemies.push(spawnEnemy(712, 'grunt', run.player.x, run.player.y, rng()));
    const events = advance(run, DEATH_SECONDS + 2 * TICK);
    expect(events.filter(e => e.type === 'death')).toHaveLength(1);
    expect(events.map(e => e.type)).toContain('respawn');
    expect(run.enemies).toEqual([]);
    expect(run.alive).toBe(true);
  });

  it('spares a boss from the mines a respawn shockwave sets off, and still lets a smart bomb hurt him through one', () => {
    // A boss on his last ten points beside a mine beside the contestant, and
    // a grunt on the contestant: the death's shockwave chains the mine, and
    // the boss must come out of it with his health untouched and reset to his
    // entrance rather than dead for nothing.
    const run = quietRoom();
    const boss = spawnBoss(730, 'scarface', rng());
    boss.x = run.player.x + 50;
    boss.y = run.player.y;
    boss.hp = 10;
    run.boss = boss;
    run.enemies.push(boss, spawnEnemy(731, 'mine', run.player.x + 25, run.player.y, rng()), spawnEnemy(732, 'grunt', run.player.x, run.player.y, rng()));
    const events = advance(run, DEATH_SECONDS + 2 * TICK);
    expect(events.map(e => e.type)).toContain('respawn');
    expect(events.map(e => e.type)).not.toContain('bossDown');
    expect(run.boss).toBe(boss);
    expect(boss.hp).toBe(10);
    expect(run.enemies.filter(e => e.kind === 'mine')).toEqual([]);
    expect(run.enemies).toContain(boss);
    // A bomb is a weapon: its mine chain still damages him, and pays.
    boss.x = run.player.x + 50;
    boss.y = run.player.y;
    run.player.invuln = 99;
    run.enemies.push(spawnEnemy(733, 'mine', run.player.x + 25, run.player.y, rng()));
    run.items.push({ id: 2, item: 'bomb', x: run.player.x, y: run.player.y, ttl: 9, r: ITEM_R });
    const cashBefore = run.cash;
    const bombed = advance(run, TICK);
    expect(bombed.map(e => e.type)).toContain('bossDown');
    expect(run.boss).toBeNull();
    expect(run.cash - cashBefore).toBeGreaterThanOrEqual(BOSSES.scarface.worth);
  });

  it('keeps an enemy inside the walls once it has entered, so it can never circle out of reach', () => {
    const run = quietRoom();
    // An orb heading straight at the far wall from mid-floor.
    const orb = spawnEnemy(720, 'orb', run.player.x, run.player.y + 100, rng());
    run.enemies.push(orb);
    run.player.invuln = 60;
    run.player.x = ARENA.x + 30;
    for (let i = 0; i < 60 * 8; i++) {
      tickRun(run, NO_INPUT, TICK);
      // The contestant stays glued to the west wall; the orb must still be on the floor.
      run.player.x = ARENA.x + 30;
      expect(insideArena(orb.x, orb.y, orb.r)).toBe(true);
    }
  });

  it('keeps the doors open through a death in a cleared room', () => {
    const run = createRun(3);
    run.schedule = [];
    run.itemSchedule = [];
    run.enemies = [];
    advance(run, TICK);
    expect(run.phase).toBe('cleared');
    const doors = [...run.openDoors];
    run.player.invuln = 0;
    run.enemies.push(spawnEnemy(730, 'grunt', run.player.x, run.player.y, rng()));
    advance(run, DEATH_SECONDS + 2 * TICK);
    expect(run.alive).toBe(true);
    expect(run.phase).toBe('cleared');
    expect(run.openDoors).toEqual(doors);
  });

  it('sends a boss back to its entrance to stand for a beat on a respawn, its charge and clocks reset', () => {
    const run = jumpAndQuiet(1, 'X');
    const boss = run.enemies.find(e => e.boss)!;
    // Scarface mid-charge, on top of the contestant.
    boss.phase = SCARFACE_PHASE.charge;
    boss.vx = -SCARFACE_CHARGE_SPEED;
    boss.vy = 0;
    boss.x = run.player.x;
    boss.y = run.player.y;
    boss.t = 20;
    const events = advance(run, DEATH_SECONDS + 2 * TICK);
    expect(events.map(e => e.type)).toContain('respawn');
    const entry = bossEntry('scarface');
    expect([boss.x, boss.y]).toEqual([entry.x, entry.y]);
    expect(boss.phase).toBe(SCARFACE_PHASE.hover);
    expect([boss.vx, boss.vy]).toEqual([0, 0]);
    // And he stands there through the entrance pause before moving again.
    advance(run, BOSS_ENTRANCE - 2 * TICK);
    expect([boss.x, boss.y]).toEqual([entry.x, entry.y]);
    advance(run, 0.5);
    expect(dist(boss, entry)).toBeGreaterThan(5);
  });

  it('holds the room clear back until the last hostile shot has left the floor', () => {
    const run = createRun(3);
    run.schedule = [];
    run.itemSchedule = [];
    run.enemies = [];
    run.flak.push({ x: ARENA.x + 40, y: ARENA.y + 40, vx: -200, vy: 0, r: 4, life: 5 });
    advance(run, TICK);
    expect(run.phase).toBe('room');
    advance(run, 0.5);
    expect(run.phase).toBe('cleared');
  });

  it('calls a streak of fast kills carnage, and a slow trickle not', () => {
    const run = quietRoom();
    // A wall of grunts queued on the shot's line, one every 30 px: the machine
    // gun takes them down several a second.
    for (let i = 0; i < STREAK_KILLS + 4; i++) run.enemies.push(spawnEnemy(800 + i, 'grunt', run.player.x + 80 + i * 24, run.player.y, rng()));
    run.player.invuln = 30;
    const events = advance(run, 4, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    expect(events).toContainEqual({ type: 'host', line: 'carnage' });
    const slow = quietRoom();
    slow.player.invuln = 90;
    let lines = 0;
    for (let i = 0; i < STREAK_KILLS + 4; i++) {
      slow.enemies.push(spawnEnemy(900 + i, 'grunt', slow.player.x + 60, slow.player.y, rng()));
      lines += advance(slow, STREAK_WINDOW + 0.3, { moveX: 0, moveY: 0, fireX: 1, fireY: 0 }).filter(
        e => e.type === 'host' && e.line === 'carnage'
      ).length;
    }
    expect(lines).toBe(0);
  });

  it('pays the studio out and adds a life when the contestant leaves a boss room', () => {
    const run = jumpAndQuiet(0, 'X');
    run.enemies = [];
    run.studioKeys = 3;
    run.keys = 3;
    const lives = run.lives;
    advance(run, TICK);
    expect(run.phase).toBe('cleared');
    const door = doorCentre('e');
    run.player.x = door.x - 30;
    run.player.y = door.y;
    const events = advance(run, 1.5, { moveX: 1, moveY: 0, fireX: 0, fireY: 0 });
    expect(events.find(e => e.type === 'studioClear')).toMatchObject({ studio: 1, keys: 3, bonus: 3000 });
    expect(run.lives).toBe(lives + 1);
    advance(run, MAP_SECONDS + TICK);
    expect(run.circuit).toBe(1);
    expect(run.roomKey).toBe(CIRCUITS[1].start);
  });

  it('opens the prize room after the last boss only with enough keys, and wins either way', () => {
    for (const keys of [DOME_KEYS, DOME_KEYS - 1]) {
      const run = jumpAndQuiet(2, 'X');
      run.enemies = [];
      run.keys = keys;
      advance(run, TICK);
      const door = doorCentre('e');
      run.player.x = door.x - 30;
      run.player.y = door.y;
      const events = advance(run, 1.5 + MAP_SECONDS, { moveX: 1, moveY: 0, fireX: 0, fireY: 0 });
      if (keys >= DOME_KEYS) {
        expect(events.map(e => e.type)).toContain('dome');
        expect(run.phase).toBe('dome');
        // Prizes rain and the contestant can walk into them; the gun is silent here.
        const rain = advance(run, 5, { moveX: 1, moveY: 0, fireX: 1, fireY: 0 });
        expect(rain.map(e => e.type)).not.toContain('shot');
        expect(run.items.length + rain.filter(e => e.type === 'pickup').length).toBeGreaterThan(3);
        advance(run, 12);
        expect(run.phase).toBe('won');
      } else {
        expect(events).toContainEqual({ type: 'host', line: 'noKeys' });
        expect(run.phase).toBe('won');
      }
    }
  });

  it('replays a seed exactly, and a different seed differently', () => {
    const a = createRun(2026);
    const b = createRun(2026);
    const c = createRun(2027);
    for (let i = 0; i < 60 * 20; i++) {
      tickRun(a, competent(a), TICK);
      tickRun(b, competent(b), TICK);
      tickRun(c, competent(c), TICK);
    }
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).not.toBe(fingerprint(c));
  });
});

/** A run dropped into one room with its script and items thrown away, boss kept. */
function jumpAndQuiet(circuit: number, key: string): RunState {
  const run = createRun(11);
  jumpToRoom(run, circuit, key);
  run.schedule = [];
  run.itemSchedule = [];
  run.player.invuln = 0;
  return run;
}

describe('the sticks', () => {
  it('reads WASD as the move stick and the arrows or IJKL as the fire stick', () => {
    const base = { pad: null, mouse: null, move: null, fire: null };
    expect(composeInput({ ...base, keys: new Set(['w', 'd']) })).toEqual({ moveX: 1, moveY: -1, fireX: 0, fireY: 0 });
    expect(composeInput({ ...base, keys: new Set(['ArrowLeft']) })).toEqual({ moveX: 0, moveY: 0, fireX: -1, fireY: 0 });
    expect(composeInput({ ...base, keys: new Set(['k']) })).toEqual({ moveX: 0, moveY: 0, fireX: 0, fireY: 1 });
    // Opposite keys cancel.
    expect(composeInput({ ...base, keys: new Set(['a', 'd']) }).moveX).toBe(0);
  });

  it('lets a live gamepad, the mouse or a touch stick take a stick the keyboard leaves centred', () => {
    const keys = new Set<string>();
    expect(composeInput({ keys, pad: { moveX: 0.8, moveY: 0, fireX: 0, fireY: -0.9 }, mouse: null, move: null, fire: null })).toEqual({
      moveX: 0.8,
      moveY: 0,
      fireX: 0,
      fireY: -0.9
    });
    // A centred pad yields to the mouse for fire.
    const m = composeInput({ keys, pad: { moveX: 0, moveY: 0, fireX: 0.1, fireY: 0 }, mouse: { down: true, dx: 50, dy: -50 }, move: null, fire: null });
    expect(m.fireX).toBe(50);
    expect(m.fireY).toBe(-50);
    const stick = { anchor: { x: 100, y: 100 }, at: { x: 100 + STICK_RANGE, y: 100 }, pointerId: 1 };
    expect(stickVector(stick)).toEqual({ x: 1, y: 0 });
    expect(stickVector({ ...stick, at: { x: 100 + STICK_RANGE * 3, y: 100 } })).toEqual({ x: 1, y: 0 });
    expect(composeInput({ keys, pad: null, mouse: null, move: stick, fire: null }).moveX).toBe(1);
    // The keyboard wins while it is live.
    expect(composeInput({ keys: new Set(['a']), pad: null, mouse: null, move: stick, fire: null }).moveX).toBe(-1);
  });

  it('leaves Space alone, so a focused header button can still be pressed mid-game', () => {
    expect(GAME_KEYS.has(' ')).toBe(false);
    expect(GAME_KEYS.has('w')).toBe(true);
    expect(GAME_KEYS.has('ArrowLeft')).toBe(true);
  });

  it('folds the d-pad into the left stick and ignores a disconnected pad', () => {
    const pad = {
      connected: true,
      axes: [0, 0, 0.5, 0.5],
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 15 }))
    } as unknown as Gamepad;
    expect(readGamepad([pad])).toEqual({ moveX: 1, moveY: 0, fireX: 0.5, fireY: 0.5 });
    expect(readGamepad([{ ...pad, connected: false } as Gamepad])).toBeNull();
    expect(readGamepad(undefined)).toBeNull();
  });
});

/**
 * The playthroughs: a cabinet needs a test that plays it to the end and says
 * something a player would see (CLAUDE.md). The guards are literals, not
 * derived from anything under test.
 */
describe('playing PRIME TIME', () => {
  const SEEDS = [11, 23, 42, 101, 303, 777, 1990, 2026, 4242, 9001];

  it('kills a contestant who stands still in the first room inside thirty seconds, three times over', () => {
    const r = playRun(1, idle, 60 * 60);
    expect(r.run.phase).toBe('over');
    expect(r.run.roomKey).toBe(CIRCUITS[0].start);
    expect(r.run.roomsCleared).toBe(0);
    expect(r.ticks).toBeLessThan(30 * 60);
    expect(r.run.cash).toBe(0);
  });

  it('lets a turret who never moves clear the teaching room, but the doors never come to them', () => {
    const r = playRun(1, turret, 60 * 60 * 3);
    expect(r.run.roomsCleared).toBe(1);
    expect(r.run.cash).toBeGreaterThan(0);
    expect(r.run.phase).toBe('cleared');
    expect(r.run.roomKey).toBe(CIRCUITS[0].start);
  });

  it('ends every competent run, won or over, with cash on the board, and clears studio 1 on most seeds', () => {
    const results = SEEDS.map(seed => playRun(seed, competent, 120000));
    for (const r of results) {
      expect(['over', 'won']).toContain(r.run.phase);
      expect(r.run.cash).toBeGreaterThan(0);
      expect(r.ticks).toBeLessThan(120000);
    }
    const pastStudio1 = results.filter(r => r.run.circuit >= 1 || r.run.phase === 'won').length;
    expect(pastStudio1).toBeGreaterThanOrEqual(6);
  });

  it('never takes a life inside the respawn grace, and every death is a lost life', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const run = createRun(seed);
      let ticks = 0;
      let deaths = 0;
      let lostLives = 0;
      let livesBefore = run.lives;
      let invulnBefore = 0;
      while (run.phase !== 'over' && run.phase !== 'won' && ticks < 120000) {
        invulnBefore = run.player.invuln;
        const events = tickRun(run, competent(run), TICK);
        for (const ev of events) {
          if (ev.type === 'death') {
            deaths++;
            expect(invulnBefore).toBe(0);
          }
          if (ev.type === 'respawn' || ev.type === 'gameOver') {
            lostLives += livesBefore - run.lives;
          }
        }
        livesBefore = run.lives;
        ticks++;
      }
      // Every death took exactly one life; extra lives are the only gains.
      expect(lostLives).toBe(deaths);
      expect(deaths).toBeGreaterThan(0);
    }
  });

  it('plays the third studio through to its end with a deep pocket of lives, dome included when the keys allow', () => {
    let finished = 0;
    let domes = 0;
    for (const seed of SEEDS) {
      const run = createRun(seed);
      jumpToRoom(run, 2, CIRCUITS[2].start);
      run.lives = 12;
      // Arriving from two studios with a few keys in hand, as a player would.
      run.keys = DOME_KEYS - 2;
      let ticks = 0;
      let dome = false;
      while (run.phase !== 'over' && run.phase !== 'won' && ticks < 60 * 60 * 12) {
        for (const ev of tickRun(run, competent(run), TICK)) if (ev.type === 'dome') dome = true;
        ticks++;
      }
      expect(['over', 'won']).toContain(run.phase);
      if (run.phase === 'won') finished++;
      if (dome) domes++;
      expect(run.cash).toBeGreaterThan(50000);
    }
    expect(finished).toBeGreaterThanOrEqual(7);
    // Every studio-3 route carries DOME_KEYS keys of its own; two of them under fire is the usual haul.
    expect(domes).toBeGreaterThanOrEqual(2);
  });

  it.each(['mutoid', 'scarface', 'cobra'] as const)('can beat %s: the competent contestant wins the fight on most seeds', kind => {
    const circuit = kind === 'mutoid' ? 0 : kind === 'scarface' ? 1 : 2;
    let wins = 0;
    for (const seed of SEEDS) {
      const run = createRun(seed);
      jumpToRoom(run, circuit, CIRCUITS[circuit].boss);
      run.lives = START_LIVES;
      let ticks = 0;
      while (run.phase === 'room' || run.phase === 'dying') {
        tickRun(run, competent(run), TICK);
        if (++ticks > 60 * 180) break;
      }
      if (run.phase === 'cleared') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });
});

export type { Side };

describe('sprites', () => {
  it('every bitmap has rows of one width and a colour for every letter', () => {
    // sprite() runs the same check before drawing, but only on a page: this
    // is what turns a slipped pixel in sprites.ts into a failing test.
    expect(Object.keys(ALL_SPRITES).length).toBeGreaterThan(40);
    for (const [name, def] of Object.entries(ALL_SPRITES)) {
      expect(() => validateSprite(name, def)).not.toThrow();
      expect(def.scale).toBeGreaterThanOrEqual(1);
    }
    expect(GRUNT_KITS.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a sheared row and an unnamed colour', () => {
    expect(() => validateSprite('bad', { scale: 2, palette: { k: '#000' }, rows: ['kk', 'k'] })).toThrow(/2 wide|1 wide/);
    expect(() => validateSprite('bad', { scale: 2, palette: { k: '#000' }, rows: ['kz'] })).toThrow(/no colour for "z"/);
  });
});
