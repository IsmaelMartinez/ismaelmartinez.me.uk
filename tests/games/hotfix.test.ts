import { describe, it, expect } from 'vitest';
import { CITY, COLS, ROWS, T, TILE, clearLine, isSolidTile, route, solidAt, wayTo, type Point } from '../../src/games/hotfix/map';
import { JOBS, type JobId } from '../../src/games/hotfix/jobs';
import {
  BASH_BONUS,
  BASH_CASH,
  BUST_SECONDS,
  DRONE_CASH,
  PLAYER_HP,
  WASTED_SECONDS,
  CAR_SPECS,
  JOB_BONUS_SECONDS,
  NO_INPUT,
  SHIFT_SECONDS,
  carSpeed,
  createRun,
  heatLevel,
  nearestObjective,
  objective,
  sonarSignal,
  stickToCar,
  tickRun,
  type Car,
  type RunEvent,
  type RunInput,
  type RunState
} from '../../src/games/hotfix/run';
import { GAME_KEYS, composeInput, readGamepad } from '../../src/games/hotfix/input';
import { WEAPONS } from '../../src/games/hotfix/weapons';
import { bfsFrom } from '../../src/games/engine/pathfind';
import { TICK, competent, idle, playShift } from './hotfix-policies';

function advance(run: RunState, seconds: number, input: RunInput = NO_INPUT): RunEvent[] {
  const events: RunEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...tickRun(run, input, TICK));
  return events;
}

/** A shift with the streets emptied, so a test moves one thing at a time. */
function quietRun(seed = 1): RunState {
  const run = createRun(seed);
  run.cars = [];
  run.people = [];
  run.bugs = [];
  // Hold the weather, so grip is the same from one test to the next.
  run.weatherTimer = 1e9;
  return run;
}

/** Puts the player at the wheel of a fresh car on the long east-west road through the middle of town. */
function atTheWheel(run: RunState, kind: Car['kind'] = 'saloon', at: Point = { x: 20 * TILE, y: 15 * TILE + 8 }): Car {
  const car: Car = {
    id: 999,
    kind,
    x: at.x,
    y: at.y,
    angle: 0,
    vx: 0,
    vy: 0,
    hp: CAR_SPECS[kind].hp,
    driver: 'player',
    color: '#fff',
    burning: 0,
    dead: 0,
    from: 0,
    to: 0,
    cruise: 80,
    blocked: 0,
    stuck: 0,
    reversing: 0,
    slide: 0
  };
  run.cars.push(car);
  run.player.car = car;
  return car;
}

const tileOf = (p: Point): number => Math.floor(p.y / TILE) * COLS + Math.floor(p.x / TILE);
const GAS: RunInput = { ...NO_INPUT, moveY: -1 };

describe('the city', () => {
  const everywhere: [string, Point][] = [
    ...Object.entries(CITY.places),
    ...CITY.phones.map((p, i): [string, Point] => [`phone ${i}`, p]),
    ...CITY.washes.map((p, i): [string, Point] => [`wash ${i}`, p]),
    ...CITY.parked.map((p, i): [string, Point] => [`parked ${i}`, p]),
    ...CITY.pickups.map((p, i): [string, Point] => [`${p.kind} crate ${i}`, p])
  ];

  it('stands every place, phone box, car wash and parked car on open ground', () => {
    for (const [name, p] of everywhere) expect(solidAt(p.x, p.y), name).toBe(false);
  });

  it('can be driven from the flat to every one of them', () => {
    const field = bfsFrom(COLS, ROWS, i => !isSolidTile(i % COLS, Math.floor(i / COLS)), tileOf(CITY.places.home));
    for (const [name, p] of everywhere) expect(field.dist[tileOf(p)], name).toBeGreaterThan(0 - 1);
    for (const [name, p] of everywhere) expect(field.dist[tileOf(p)], name).not.toBe(-1);
  });

  it('joins every crossing to every other by road, and stands each on tarmac', () => {
    for (const node of CITY.nodes) {
      expect(CITY.tiles[tileOf(node)]).toBe(T.Road);
      expect(node.links.length).toBeGreaterThanOrEqual(2);
      const path = route(CITY.nodes[0].id, node.id);
      expect(path[path.length - 1]).toBe(node.id);
    }
  });

  it('walls the world in, so nothing can leave it', () => {
    for (let x = 0; x < COLS; x++) {
      expect(isSolidTile(x, 0)).toBe(true);
      expect(isSolidTile(x, ROWS - 1)).toBe(true);
    }
    for (let y = 0; y < ROWS; y++) {
      expect(isSolidTile(0, y)).toBe(true);
      expect(isSolidTile(COLS - 1, y)).toBe(true);
    }
  });

  it('only sends a job to places that exist, and has a phone to ring for it', () => {
    expect(CITY.phones.length).toBeGreaterThan(3);
    for (const job of Object.values(JOBS)) {
      for (const stage of job.stages) {
        const places = stage.type === 'sweep' || stage.type === 'sonar' ? stage.places : [stage.place];
        expect(places.length).toBeGreaterThan(0);
        for (const id of places) expect(CITY.places[id], `${job.id}: ${id}`).toBeDefined();
      }
    }
  });

  it('routes round a building rather than through it', () => {
    const from = CITY.places.castle;
    const to = CITY.places.datacentre;
    expect(clearLine(from.x, from.y, to.x, to.y)).toBe(false);
    const next = wayTo(from.x, from.y, to.x, to.y, 11);
    expect(clearLine(from.x, from.y, next.x, next.y, 11)).toBe(true);
    expect(Math.hypot(next.x - from.x, next.y - from.y)).toBeGreaterThan(TILE);
  });
});

describe('driving', () => {
  it('tops out near the speed on the plate, and each kind at its own', () => {
    for (const kind of ['mini', 'coupe', 'van'] as const) {
      const run = quietRun();
      const car = atTheWheel(run, kind);
      let fastest = 0;
      for (let t = 0; t < 6; t += TICK) {
        tickRun(run, GAS, TICK);
        fastest = Math.max(fastest, carSpeed(car));
      }
      expect(fastest).toBeGreaterThan(CAR_SPECS[kind].top * 0.85);
      expect(fastest).toBeLessThanOrEqual(CAR_SPECS[kind].top * 1.01);
    }
  });

  it('never lets a car into a wall, however hard it is driven at one', () => {
    const run = quietRun();
    const car = atTheWheel(run, 'coupe');
    // North off the road, flat out, into the block beside it.
    car.angle = -Math.PI / 2;
    const events = advance(run, 4, GAS);
    expect(solidAt(car.x, car.y)).toBe(false);
    expect(Number.isFinite(car.x) && Number.isFinite(car.y)).toBe(true);
    expect(events.some(e => e.type === 'crash' && e.player)).toBe(true);
    expect(car.hp).toBeLessThan(CAR_SPECS.coupe.hp);
  });

  it('slides further on wet tarmac than on dry', () => {
    const slideOf = (wet: boolean): number => {
      const run = quietRun();
      run.raining = wet;
      const car = atTheWheel(run, 'saloon');
      advance(run, 2.5, GAS);
      let slid = 0;
      for (let t = 0; t < 0.6; t += TICK) {
        tickRun(run, { ...GAS, moveX: 1 }, TICK);
        slid = Math.max(slid, car.slide);
      }
      return slid;
    };
    expect(slideOf(true)).toBeGreaterThan(slideOf(false) * 1.15);
  });

  it('turns a stick into pedals: forward when it points ahead, reverse when it points behind a slow car', () => {
    const run = quietRun();
    const car = atTheWheel(run);
    expect(stickToCar(car, 1, 0)).toEqual({ throttle: 1, steer: 0 });
    expect(stickToCar(car, 0, 1).steer).toBeGreaterThan(0);
    expect(stickToCar(car, -1, 0.1).throttle).toBeLessThan(0);
    expect(stickToCar(car, 0.05, 0)).toEqual({ throttle: 0, steer: 0 });
  });

  it('sets a wrecked car on fire, and blows it up once the driver has had time to get out', () => {
    const run = quietRun();
    const car = atTheWheel(run);
    car.hp = 0;
    const clock = run.clock;
    const first = advance(run, 0.1);
    expect(first.some(e => e.type === 'burning')).toBe(true);
    // Out of the car and well away before it goes.
    tickRun(run, { ...NO_INPUT, action: true }, TICK);
    expect(run.player.car).toBeNull();
    advance(run, 2, { ...NO_INPUT, moveX: 1 });
    const rest = advance(run, 4);
    expect(rest.some(e => e.type === 'explode')).toBe(true);
    expect(rest.some(e => e.type === 'wrecked')).toBe(false);
    expect(clock - run.clock).toBeLessThan(7);
  });
});

describe('getting in and out', () => {
  it('takes the wheel of a parked car on a press, not on a hold', () => {
    const run = createRun(3);
    const mine = run.cars[0];
    run.player.x = mine.x;
    run.player.y = mine.y + 16;
    const events = tickRun(run, { ...NO_INPUT, action: true }, TICK);
    expect(run.player.car).toBe(mine);
    expect(events.some(e => e.type === 'enter')).toBe(true);
    // Still held: it must not throw the player straight back out.
    tickRun(run, { ...NO_INPUT, action: true }, TICK);
    expect(run.player.car).toBe(mine);
    tickRun(run, NO_INPUT, TICK);
    tickRun(run, { ...NO_INPUT, action: true }, TICK);
    expect(run.player.car).toBeNull();
    expect(solidAt(run.player.x, run.player.y)).toBe(false);
  });

  it('turns the driver of a borrowed car out unhurt, and the police take an interest', () => {
    const run = createRun(3);
    const taken = run.cars.find(c => c.driver === 'ai') as Car;
    const people = run.people.length;
    run.player.x = taken.x;
    run.player.y = taken.y + 14;
    const events = tickRun(run, { ...NO_INPUT, action: true }, TICK);
    expect(events.some(e => e.type === 'jack')).toBe(true);
    expect(run.player.car).toBe(taken);
    expect(run.people.length).toBe(people + 1);
    expect(run.heat).toBeGreaterThan(0);
  });
});

describe('the people of the town', () => {
  it('dive clear of a car and get up again: nobody is ever run over', () => {
    const run = quietRun();
    const car = atTheWheel(run);
    const tile = tileOf({ x: car.x + 150, y: car.y });
    // Stood in the lane and not about to wander off it: a driver just turned out of a car.
    run.people.push({
      x: car.x + 150,
      y: car.y,
      tx: car.x + 150,
      ty: car.y,
      tile,
      prevTile: tile,
      state: 'fist',
      timer: 30,
      vx: 0,
      vy: 0,
      look: 0.5,
      penguin: false,
      facing: 0
    });
    const events = advance(run, 3, GAS);
    expect(events.filter(e => e.type === 'dive').length).toBeGreaterThanOrEqual(1);
    expect(run.people.length).toBe(1);
    // Clear of the car's path, and never under it.
    expect(Math.abs(run.people[0].y - car.y)).toBeGreaterThan(12);
    advance(run, 2);
    expect(run.people[0].state).toBe('walk');
    expect(run.cash).toBe(0);
  });

  it('pays for a squashed bug at the multiplier, on wheels or on foot', () => {
    const run = quietRun();
    run.mult = 3;
    run.bugs.push({ x: run.player.x + 4, y: run.player.y, angle: 0, timer: 9, gold: false });
    // Standing still is not a stomp: the bug has to be walked on.
    expect(advance(run, 0.1).some(e => e.type === 'squash')).toBe(false);
    const events = advance(run, 0.1, { ...NO_INPUT, moveX: 1 });
    expect(events.some(e => e.type === 'squash')).toBe(true);
    expect(run.cash).toBe(30);
    expect(run.squashed).toBe(1);
  });
});

describe('the police', () => {
  /** A hot player sat still with a police car on the bumper. */
  function cornered(): RunState {
    const run = quietRun();
    const car = atTheWheel(run);
    run.heat = 2.5;
    run.cars.push({ ...car, id: 1000, kind: 'panda', x: car.x - 24, driver: 'cop', hp: CAR_SPECS.panda.hp });
    return run;
  }

  it('bust a player who sits still beside them, for seconds and the multiplier and never for money', () => {
    const run = cornered();
    run.cash = 500;
    run.mult = 4;
    const clock = run.clock;
    const events = advance(run, 3);
    expect(events.some(e => e.type === 'busted')).toBe(true);
    expect(run.cash).toBe(500);
    expect(run.mult).toBe(1);
    expect(heatLevel(run)).toBe(0);
    expect(clock - run.clock).toBeGreaterThanOrEqual(BUST_SECONDS);
    expect(run.player.car).toBeNull();
    expect(Math.hypot(run.player.x - CITY.places.nick.x, run.player.y - CITY.places.nick.y)).toBeLessThan(40);
    expect(run.cars.some(c => c.driver === 'cop')).toBe(false);
  });

  it('send more cars the hotter it gets, and lose interest once the player is out of sight and behaving', () => {
    const run = quietRun();
    atTheWheel(run);
    run.heat = 3.2;
    let most = 0;
    for (let t = 0; t < 9; t += TICK) {
      tickRun(run, NO_INPUT, TICK);
      // This test is about how many come, not what they do on arrival: nobody gets nicked.
      run.bust = 0;
      run.heat = 3.2;
      most = Math.max(most, run.cars.filter(c => c.driver === 'cop').length);
    }
    expect(most).toBe(3);
    // Take the police away and behave: the heat drains on its own.
    run.cars = run.cars.filter(c => c.driver !== 'cop');
    run.heat = 1.2;
    run.calm = 10;
    run.copWait = 1e9;
    advance(run, 8);
    expect(heatLevel(run)).toBe(0);
  });

  it('forget a car that has been through the wash', () => {
    const run = quietRun();
    const car = atTheWheel(run, 'saloon', CITY.washes[0]);
    car.hp = 20;
    run.heat = 3;
    const before = car.color;
    const events = advance(run, 0.1);
    expect(events.some(e => e.type === 'wash')).toBe(true);
    expect(heatLevel(run)).toBe(0);
    expect(car.hp).toBe(CAR_SPECS.saloon.hp);
    expect(car.color).not.toBe(before);
  });
});

describe('jobs', () => {
  /** Answers the nearest phone with `id` on top of the deck. */
  function onJob(id: JobId): RunState {
    const run = quietRun();
    run.deck = [id];
    const phone = CITY.phones[0];
    run.player.x = phone.x;
    run.player.y = phone.y;
    const events = advance(run, 0.1);
    expect(events.some(e => e.type === 'job' && e.id === id)).toBe(true);
    return run;
  }
  const standAt = (run: RunState, p: Point) => {
    run.player.x = p.x;
    run.player.y = p.y;
  };

  it('rings the phones until one is answered, and again a moment after the job ends', () => {
    const run = quietRun();
    expect(objective(run).phone).toBe(true);
    expect(objective(run).points.length).toBe(CITY.phones.length);
    const busy = onJob('prodDown');
    expect(objective(busy).phone).toBe(false);
    standAt(busy, CITY.places.datacentre);
    advance(busy, 0.1);
    expect(busy.job).toBeNull();
    expect(objective(busy).points.length).toBe(0);
    advance(busy, 3);
    expect(objective(busy).points.length).toBe(CITY.phones.length);
  });

  it('pays the fee and what is left of the clock, times the multiplier, then raises it and adds to the shift', () => {
    const run = onJob('prodDown');
    run.mult = 2;
    const clock = run.clock;
    standAt(run, CITY.places.datacentre);
    const events = advance(run, TICK);
    const done = events.find(e => e.type === 'jobDone');
    expect(done).toBeDefined();
    const pay = (done as Extract<RunEvent, { type: 'jobDone' }>).pay;
    // 400 for the job and about 45 s of clock at 6 a second, doubled.
    expect(pay).toBeGreaterThan(2 * 400 + 2 * 6 * 40);
    expect(pay % 10).toBe(0);
    expect(run.cash).toBe(pay);
    expect(run.mult).toBe(3);
    expect(run.jobsDone).toBe(1);
    expect(run.clock).toBeGreaterThan(clock + JOB_BONUS_SECONDS - 1);
  });

  it('fails a job that runs out of time, and takes nothing for it', () => {
    const run = onJob('lighthouse');
    run.mult = 3;
    standAt(run, CITY.places.home);
    const events = advance(run, JOBS.lighthouse.time + 1);
    expect(events.some(e => e.type === 'jobFailed')).toBe(true);
    expect(run.cash).toBe(0);
    expect(run.mult).toBe(3);
    expect(run.job).toBeNull();
  });

  it('wants every hotspot passed in a sweep, in any order', () => {
    const run = onJob('wardrive');
    for (const place of ['docks', 'pub'] as const) {
      standAt(run, CITY.places[place]);
      advance(run, TICK * 2);
      expect(run.job).not.toBeNull();
    }
    expect(run.job?.remaining).toEqual(['mercat']);
    standAt(run, CITY.places.mercat);
    expect(advance(run, TICK * 2).some(e => e.type === 'jobDone')).toBe(true);
  });

  it('lets penguins be rounded up on foot and never from a car', () => {
    const run = onJob('penguins');
    const penguins = () => run.people.filter(p => p.penguin);
    expect(penguins().length).toBe(5);
    const first = penguins()[0];
    const car = atTheWheel(run, 'mini', { x: first.x, y: first.y });
    advance(run, TICK * 3);
    expect(penguins().length).toBe(5);
    run.cars.splice(run.cars.indexOf(car), 1);
    run.player.car = null;
    for (const penguin of [...penguins()]) {
      standAt(run, penguin);
      advance(run, TICK * 2);
    }
    expect(penguins().length).toBe(0);
    // The second stage: the hall.
    expect(run.job?.stage).toBe(1);
    standAt(run, CITY.places.hall);
    expect(advance(run, TICK * 2).some(e => e.type === 'jobDone')).toBe(true);
    expect(run.people.some(p => p.penguin)).toBe(false);
  });

  it('counts only the golden bugs for the triage job, and clears up the ones left over', () => {
    const run = onJob('triage');
    expect(run.bugs.filter(b => b.gold).length).toBe(8);
    for (const bug of run.bugs.filter(b => b.gold).slice(0, 7)) {
      standAt(run, { x: bug.x - 2, y: bug.y });
      tickRun(run, { ...NO_INPUT, moveX: 1 }, TICK);
    }
    expect(run.job?.count).toBe(1);
    run.job!.timeLeft = 0.01;
    advance(run, 0.1);
    expect(run.bugs.some(b => b.gold)).toBe(false);
  });

  it('docks the butler job for every bump once Reginald is aboard, down to a quarter and no further', () => {
    const run = onJob('butler');
    const car = atTheWheel(run, 'van', CITY.places.castle);
    advance(run, TICK * 2);
    expect(run.job?.stage).toBe(1);
    let bumps = 0;
    for (let i = 0; i < 12; i++) {
      // Into the castle wall, again and again.
      car.x = CITY.places.castle.x;
      car.y = CITY.places.castle.y;
      car.angle = Math.PI;
      car.vx = -160;
      car.vy = 0;
      car.hp = 999;
      bumps += advance(run, 0.4).filter(e => e.type === 'bump').length;
    }
    expect(bumps).toBe(5);
    expect(run.job?.care).toBeCloseTo(0.25);
  });

  it('hides the sonar job from the arrow and gives a signal that grows on the way there', () => {
    const run = onJob('audiogram');
    expect(sonarSignal(run)).toBe(0);
    standAt(run, CITY.places.clinic);
    advance(run, TICK * 2);
    expect(run.job?.stage).toBe(1);
    expect(objective(run).hidden).toBe(true);
    const target = nearestObjective(run) as Point;
    const from = { x: run.player.x, y: run.player.y };
    const signals = [0, 0.25, 0.5, 0.75, 1].map(t => {
      standAt(run, { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t });
      return sonarSignal(run);
    });
    for (let i = 1; i < signals.length; i++) expect(signals[i]).toBeGreaterThan(signals[i - 1]);
    expect(signals[signals.length - 1]).toBe(1);
  });
});

describe('guns', () => {
  const FIRE: RunInput = { ...NO_INPUT, fire: true };
  /** On foot on the long road, facing east, with a full pistol. */
  function armed(weapon: 'pistol' | 'smg' | 'rocket' = 'pistol'): RunState {
    const run = quietRun();
    run.pickups = [];
    run.player.x = 20 * TILE;
    run.player.y = 15 * TILE + 8;
    run.player.angle = 0;
    run.player.weapon = weapon;
    run.player.ammo = { [weapon]: WEAPONS[weapon].ammo };
    return run;
  }
  const drone = (run: RunState, dx: number) => {
    const d = { x: run.player.x + dx, y: run.player.y, hp: 30, cool: 99, homeX: run.player.x + dx, homeY: run.player.y };
    run.drones.push(d);
    return d;
  };

  it('come out of crates, which restock, and the newest is the one in hand', () => {
    const run = quietRun();
    const crate = run.pickups.find(p => p.kind === 'smg')!;
    run.player.x = crate.x;
    run.player.y = crate.y;
    const events = advance(run, TICK);
    expect(events.some(e => e.type === 'pickup' && e.kind === 'smg')).toBe(true);
    expect(run.player.weapon).toBe('smg');
    expect(run.player.ammo.smg).toBe(WEAPONS.smg.ammo);
    expect(crate.wait).toBeGreaterThan(0);
    // Stood on the empty spot, nothing more comes of it until it is restocked.
    advance(run, 1);
    expect(run.player.ammo.smg).toBe(WEAPONS.smg.ammo);
    advance(run, 45);
    expect(run.player.ammo.smg).toBe(WEAPONS.smg.ammo * 2);
  });

  it('fire on foot at their own rate, spend ammo, and are put away when empty', () => {
    const run = armed();
    run.player.ammo.pistol = 3;
    const events = advance(run, 3, FIRE);
    expect(events.filter(e => e.type === 'shot').length).toBe(3);
    expect(run.player.weapon).toBeNull();
    // An empty hand fires nothing.
    expect(advance(run, 1, FIRE).some(e => e.type === 'shot')).toBe(false);
  });

  it('cannot be fired from behind the wheel', () => {
    const run = armed();
    atTheWheel(run);
    expect(advance(run, 1, FIRE).some(e => e.type === 'shot')).toBe(false);
    expect(run.player.ammo.pistol).toBe(WEAPONS.pistol.ammo);
  });

  it('change on a press of the swap button, round the guns that have rounds in them', () => {
    const run = armed();
    run.player.ammo = { pistol: 5, rocket: 2 };
    tickRun(run, { ...NO_INPUT, swap: true }, TICK);
    expect(run.player.weapon).toBe('rocket');
    tickRun(run, { ...NO_INPUT, swap: true }, TICK);
    expect(run.player.weapon).toBe('rocket');
    tickRun(run, NO_INPUT, TICK);
    tickRun(run, { ...NO_INPUT, swap: true }, TICK);
    expect(run.player.weapon).toBe('pistol');
  });

  it('shoot down a drone and pay for it at the multiplier', () => {
    const run = armed();
    run.mult = 2;
    drone(run, 120);
    const events = advance(run, 2, FIRE);
    expect(events.some(e => e.type === 'zap')).toBe(true);
    expect(run.drones.length).toBe(0);
    expect(run.cash).toBe(DRONE_CASH * 2);
  });

  it('squash a bug at range', () => {
    const run = armed();
    run.bugs.push({ x: run.player.x + 100, y: run.player.y, angle: 0, timer: 99, gold: false });
    advance(run, 1, FIRE);
    expect(run.squashed).toBe(1);
    expect(run.cash).toBe(10);
  });

  it('never hit a person: whoever is in the line of fire is on the floor before it arrives, and gets up', () => {
    const run = armed('smg');
    const tile = tileOf({ x: run.player.x + 90, y: run.player.y });
    run.people.push({
      x: run.player.x + 90,
      y: run.player.y,
      tx: run.player.x + 90,
      ty: run.player.y,
      tile,
      prevTile: tile,
      state: 'fist',
      timer: 30,
      vx: 0,
      vy: 0,
      look: 0.5,
      penguin: false,
      facing: 0
    });
    const events = advance(run, 2, FIRE);
    expect(events.some(e => e.type === 'dive')).toBe(true);
    expect(run.people.length).toBe(1);
    expect(run.heat).toBeGreaterThan(0);
    advance(run, 2);
    expect(run.people[0].state).toBe('walk');
  });

  it('set a car alight, and a rocket takes out what stands round where it lands', () => {
    const run = armed('rocket');
    const car = atTheWheel(run, 'mini', { x: run.player.x + 150, y: run.player.y });
    run.player.car = null;
    car.driver = 'none';
    drone(run, 170);
    run.bugs.push({ x: run.player.x + 140, y: run.player.y + 20, angle: 0, timer: 99, gold: false });
    // One rocket, and time for it to get there.
    const events = [...advance(run, 0.3, FIRE), ...advance(run, 0.9)];
    expect(events.filter(e => e.type === 'explode').length).toBe(1);
    expect(run.drones.length).toBe(0);
    expect(run.squashed).toBe(1);
    expect(car.hp).toBeLessThanOrEqual(0);
    expect(advance(run, 5).filter(e => e.type === 'explode').length).toBe(1);
  });
});

describe('drones, health and the bug bash', () => {
  it('lets a drone hurt a player on foot, and a coffee mend them', () => {
    const run = quietRun();
    run.player.x = 20 * TILE;
    run.player.y = 15 * TILE + 8;
    run.drones.push({ x: run.player.x + 120, y: run.player.y, hp: 30, cool: 0, homeX: run.player.x + 120, homeY: run.player.y });
    const events = advance(run, 4);
    expect(events.some(e => e.type === 'hurt')).toBe(true);
    expect(run.player.hp).toBeLessThan(PLAYER_HP);
    const hp = run.player.hp;
    run.drones = [];
    run.shots = [];
    const coffee = run.pickups.find(p => p.kind === 'coffee')!;
    run.player.x = coffee.x;
    run.player.y = coffee.y;
    advance(run, TICK);
    expect(run.player.hp).toBeGreaterThan(hp);
    expect(run.player.hp).toBeLessThanOrEqual(PLAYER_HP);
  });

  it('leaves a coffee on its spot for someone who does not need it', () => {
    const run = quietRun();
    const coffee = run.pickups.find(p => p.kind === 'coffee')!;
    run.player.x = coffee.x;
    run.player.y = coffee.y;
    advance(run, 0.2);
    expect(coffee.wait).toBe(0);
  });

  it('knocks a player with no health left out cold: seconds, the bonus and the guns, never money', () => {
    const run = quietRun();
    run.cash = 700;
    run.mult = 5;
    run.player.ammo = { pistol: 9 };
    run.player.weapon = 'pistol';
    run.player.hp = 0;
    const clock = run.clock;
    const events = advance(run, TICK);
    expect(events.some(e => e.type === 'wasted')).toBe(true);
    expect(run.cash).toBe(700);
    expect(run.mult).toBe(1);
    expect(run.player.hp).toBe(PLAYER_HP);
    expect(run.player.weapon).toBeNull();
    expect(clock - run.clock).toBeGreaterThanOrEqual(WASTED_SECONDS);
    expect(Math.hypot(run.player.x - CITY.places.clinic.x, run.player.y - CITY.places.clinic.y)).toBeLessThan(2);
    // Once, not every tick after.
    expect(advance(run, 1).some(e => e.type === 'wasted')).toBe(false);
  });

  it('runs a car through a drone as well as a bullet would', () => {
    const run = quietRun();
    const car = atTheWheel(run);
    run.drones.push({ x: car.x + 160, y: car.y, hp: 30, cool: 99, homeX: car.x + 160, homeY: car.y });
    const events = advance(run, 3, GAS);
    expect(events.some(e => e.type === 'zap')).toBe(true);
    expect(run.cash).toBe(DRONE_CASH);
  });

  it('pays a bonus for a bug bash cleared in time, and sweeps up one that was not', () => {
    const start = (): RunState => {
      const run = quietRun();
      const token = run.pickups.find(p => p.kind === 'bash')!;
      run.player.x = token.x;
      run.player.y = token.y;
      expect(advance(run, TICK).some(e => e.type === 'bash' && e.state === 'start')).toBe(true);
      return run;
    };
    const cleared = start();
    const bugs = cleared.bugs.filter(b => b.bash);
    expect(bugs.length).toBe(12);
    let events: RunEvent[] = [];
    for (const bug of bugs) {
      cleared.player.x = bug.x - 2;
      cleared.player.y = bug.y;
      events = events.concat(tickRun(cleared, { ...NO_INPUT, moveX: 1 }, TICK));
    }
    events = events.concat(advance(cleared, TICK * 2));
    expect(events.some(e => e.type === 'bash' && e.state === 'done')).toBe(true);
    expect(cleared.cash).toBe(12 * BASH_CASH + BASH_BONUS);
    expect(cleared.bash).toBeNull();

    const missed = start();
    missed.player.x = CITY.places.home.x;
    missed.player.y = CITY.places.home.y;
    expect(advance(missed, 31).some(e => e.type === 'bash' && e.state === 'over')).toBe(true);
    expect(missed.bugs.some(b => b.bash)).toBe(false);
    expect(missed.cash).toBe(0);
  });
});

describe('controls', () => {
  const none = { action: false, handbrake: false, horn: false };

  it('reads the arrows and WASD as the same pedals and wheel', () => {
    expect(composeInput(new Set(['ArrowUp', 'ArrowRight']), null, none)).toMatchObject({ moveX: 1, moveY: -1, mode: 'keys' });
    expect(composeInput(new Set(['w', 'd']), null, none)).toMatchObject({ moveX: 1, moveY: -1, mode: 'keys' });
    expect(composeInput(new Set(['ArrowLeft', 'ArrowRight']), null, none).moveX).toBe(0);
    expect(composeInput(new Set([' ', 'e', 'h']), null, none)).toMatchObject({ handbrake: true, action: true, horn: true, fire: true });
    expect(composeInput(new Set(['q']), null, none)).toMatchObject({ swap: true, horn: false });
  });

  it('lets a pushed stick take over from the keys, and a resting one leave them alone', () => {
    expect(composeInput(new Set(['ArrowUp']), { x: 0.6, y: 0.6 }, none)).toMatchObject({ moveX: 0.6, moveY: 0.6, mode: 'stick' });
    expect(composeInput(new Set(['ArrowUp']), { x: 0.05, y: 0 }, none)).toMatchObject({ moveY: -1, mode: 'keys' });
  });

  it('claims only the keys it uses', () => {
    for (const key of ['ArrowUp', 'w', ' ', 'Enter', 'h']) expect(GAME_KEYS.has(key)).toBe(true);
    for (const key of ['Tab', 'F5', 'r']) expect(GAME_KEYS.has(key)).toBe(false);
  });

  it('reads a pad: the stick or the D-pad to go, A for the door', () => {
    const pad = (axes: number[], pressed: number[]) =>
      ({ connected: true, axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) }) as unknown as Gamepad;
    expect(readGamepad([null])).toBeNull();
    expect(readGamepad([pad([0.5, -0.5], [0])])).toMatchObject({ stick: { x: 0.5, y: -0.5 }, buttons: { action: true, handbrake: false } });
    expect(readGamepad([pad([0, 0], [14, 1])])).toMatchObject({ stick: { x: -1, y: 0 }, buttons: { handbrake: true } });
  });
});

describe('a whole shift', () => {
  it('ends on the clock with nothing banked when nobody answers the phone', () => {
    const { run, events, seconds } = playShift(1, idle());
    expect(run.over).toBe(true);
    expect(events[events.length - 1].type).toBe('over');
    expect(seconds).toBeGreaterThan(SHIFT_SECONDS - 1);
    expect(seconds).toBeLessThan(SHIFT_SECONDS + 1);
    expect(run.cash).toBe(0);
  });

  it('plays out the same from the same seed, and differently from another', { timeout: 60_000 }, () => {
    const a = playShift(42, competent());
    const b = playShift(42, competent());
    const c = playShift(43, competent());
    expect(b.run.cash).toBe(a.run.cash);
    expect(b.seconds).toBe(a.seconds);
    expect(b.events.length).toBe(a.events.length);
    expect(c.events.length).not.toBe(a.events.length);
  });

  // The cabinet's playthrough test (AGENTS.md: every cabinet has one that
  // plays to completion and asserts a player-visible outcome). The guard is a
  // plain literal, derived from nothing under test.
  it('is played to its end by a courier who earns a living and is never paid backwards', { timeout: 60_000 }, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = createRun(seed);
      const policy = competent();
      let ticks = 0;
      let last = 0;
      let warned = false;
      while (!run.over && ticks < 60 * 1500) {
        for (const e of tickRun(run, policy(run), TICK)) if (e.type === 'warn') warned = true;
        // Cash is the score, and nothing is ever taken off it.
        expect(run.cash).toBeGreaterThanOrEqual(last);
        last = run.cash;
        ticks++;
      }
      expect(run.over, `seed ${seed} ended`).toBe(true);
      expect(run.jobsDone, `seed ${seed} jobs`).toBeGreaterThanOrEqual(4);
      expect(run.cash, `seed ${seed} cash`).toBeGreaterThan(3000);
      // Finished jobs bought more shift, so it outran its first clock.
      expect(ticks * TICK).toBeGreaterThan(SHIFT_SECONDS + 1);
      expect(warned).toBe(true);
    }
  });

  it.each(Object.keys(JOBS) as JobId[])('can finish "%s" inside its own clock', { timeout: 30_000 }, id => {
    // One seed may strand a courier behind a jam; a job that no seed can finish is broken.
    const finished = [11, 12, 13].some(seed => {
      const { events } = playShift(seed, competent(), 240, [id]);
      const first = events.find(e => e.type === 'jobDone' || e.type === 'jobFailed');
      return first?.type === 'jobDone';
    });
    expect(finished).toBe(true);
  });
});
