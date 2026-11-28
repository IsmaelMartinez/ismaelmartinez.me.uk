/**
 * HOTFIX's rules: one on-call shift in the city, DOM-free so the tests can
 * play a whole shift headlessly. `createRun(seed)` builds the shift and
 * `tickRun(run, input, dt)` advances it, returning the events the cabinet
 * turns into sound, floaters, toasts and HUD writes.
 *
 * The seed is the harness's determinism handle. It moves traffic, people,
 * the weather and the order the jobs come in, never the city or what a job
 * pays, and it is neither shown nor chosen.
 *
 * Rules worth knowing before changing anything:
 *   - cash is the score and nothing is ever subtracted from it. A mistake
 *     costs seconds off the shift clock and the multiplier, never money;
 *   - no person is ever hurt. People dive clear of a car and of gunfire,
 *     drivers get out and shake a fist, and what a car or a gun can destroy
 *     is bugs, rogue drones and cars. The one body that can be hurt is the
 *     player's own (`Player.hp`), by drone fire and by standing near a blast;
 *   - a shift is bounded: the clock starts at `SHIFT_SECONDS` and a finished
 *     job adds `JOB_BONUS_SECONDS`, which is less than any job takes, so a run
 *     always ends and needs no voluntary door;
 *   - the stick input (`mode: 'stick'`) is both the touch control and the
 *     interface the test bot drives through, so the two cannot drift apart.
 */
import { seededRng } from '../engine/math';
import {
  CITY,
  COLS,
  ROWS,
  T,
  TILE,
  clearLine,
  districtAt,
  isSolidTile,
  nearestNode,
  solidAt,
  surfaceGrip,
  tileAt,
  wayTo,
  type District,
  type PickupKind,
  type PlaceId,
  type Point
} from './map';
import { JOBS, type JobDef, type JobId, type Stage } from './jobs';
import { WEAPONS, WEAPON_IDS, type WeaponId } from './weapons';

export const SHIFT_SECONDS = 180;
export const JOB_BONUS_SECONDS = 15;
export const MAX_MULT = 6;
export const BUG_CASH = 10;
/** Seconds a bust or a wreck takes off the shift. */
export const BUST_SECONDS = 15;
export const WRECK_SECONDS = 10;
/** Seconds running out of health takes off the shift. */
export const WASTED_SECONDS = 15;
export const PLAYER_HP = 100;
export const DRONE_CASH = 40;
/** A bug-bash bug, and the bonus for clearing the lot inside the clock. */
export const BASH_CASH = 30;
export const BASH_BONUS = 400;
export const BASH_SECONDS = 30;
const BASH_BUGS = 12;
const DRONE_HP = 30;
const COFFEE_HP = 50;
/** Seconds before a taken crate is restocked. */
const RESTOCK_SECONDS = 40;
const WALK_SPEED = 82;
const CAR_R = 11;
const FOOT_R = 5;
const ENTER_RANGE = 30;
const ARRIVE_RANGE = 48;
/** Fastest a car may be going and still count as having arrived. */
const ARRIVE_SPEED = 130;
const WET_GRIP = 0.7;
const TRAFFIC = 11;
const PEOPLE = 26;
const AMBIENT_BUGS = 12;
const LANE = TILE / 2;
/** Cop within this many pixels of a slow or walking player fills the bust meter. */
const BUST_RANGE = 38;
export const BUST_FILL = 1.1;

export type CarKind = 'mini' | 'saloon' | 'taxi' | 'van' | 'coupe' | 'panda';

export interface CarSpec {
  accel: number;
  top: number;
  turn: number;
  grip: number;
  mass: number;
  hp: number;
}

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  mini: { accel: 190, top: 172, turn: 3.5, grip: 9, mass: 0.8, hp: 80 },
  saloon: { accel: 200, top: 196, turn: 3.1, grip: 7.5, mass: 1, hp: 100 },
  taxi: { accel: 205, top: 200, turn: 3.1, grip: 7.5, mass: 1.05, hp: 110 },
  van: { accel: 160, top: 162, turn: 2.7, grip: 7, mass: 1.5, hp: 140 },
  coupe: { accel: 270, top: 250, turn: 3.3, grip: 5.2, mass: 0.9, hp: 80 },
  panda: { accel: 250, top: 226, turn: 3.2, grip: 8, mass: 1.1, hp: 160 }
};

const CAR_COLORS = ['#e11d48', '#2563eb', '#f59e0b', '#10b981', '#f8fafc', '#7c3aed', '#94a3b8', '#0ea5e9', '#b45309'];
const TRAFFIC_KINDS: CarKind[] = ['mini', 'saloon', 'saloon', 'taxi', 'van', 'coupe', 'saloon', 'mini'];

export type Driver = 'none' | 'player' | 'ai' | 'cop';

export interface Car {
  id: number;
  kind: CarKind;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  driver: Driver;
  color: string;
  /** Seconds left before a burning car goes up; 0 when not burning. */
  burning: number;
  /** Seconds since it blew up; 0 while it is still a car. */
  dead: number;
  /** Road nodes an AI driver is travelling between. */
  from: number;
  to: number;
  cruise: number;
  blocked: number;
  stuck: number;
  reversing: number;
  /** Sideways speed last tick, for skid marks and tyre noise. */
  slide: number;
}

export interface Person {
  x: number;
  y: number;
  /** Where they are walking to. */
  tx: number;
  ty: number;
  tile: number;
  prevTile: number;
  state: 'walk' | 'dive' | 'down' | 'fist';
  timer: number;
  vx: number;
  vy: number;
  /** 0-1, picks a coat. */
  look: number;
  penguin: boolean;
  facing: number;
}

export interface Bug {
  x: number;
  y: number;
  angle: number;
  timer: number;
  /** A job's bug: counted by the job. */
  gold: boolean;
  /** A bug-bash bug: worth more, and counted by the bash. */
  bash?: boolean;
}

/** A delivery drone gone rogue: it keeps its distance and shoots. */
export interface Drone {
  x: number;
  y: number;
  hp: number;
  /** Seconds until it may fire again. */
  cool: number;
  /** Where it drifts back to when it has nobody to shoot at. */
  homeX: number;
  homeY: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pixels of flight left. */
  left: number;
  damage: number;
  /** Blast radius on impact; 0 for a bullet. */
  blast: number;
  hostile: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  kind: PickupKind;
  /** Seconds until it is back on its spot; 0 when it is there to be taken. */
  wait: number;
}

export interface ActiveJob {
  def: JobDef;
  stage: number;
  timeLeft: number;
  /** Places still to visit in a sweep stage. */
  remaining: PlaceId[];
  /** Things still to squash or collect in the current stage. */
  count: number;
  /** A butler job's share of the fee still standing, 1 down to 0.25. */
  care: number;
  /** A sonar stage's hidden place. */
  hidden: PlaceId | null;
}

export interface Player {
  x: number;
  y: number;
  angle: number;
  car: Car | null;
  stun: number;
  /** Distance walked, for the stride animation. */
  stride: number;
  hp: number;
  /** The gun in hand, or null with none. */
  weapon: WeaponId | null;
  ammo: Partial<Record<WeaponId, number>>;
  /** Seconds until the gun may fire again. */
  cool: number;
}

export interface RunState {
  rng: () => number;
  time: number;
  clock: number;
  cash: number;
  mult: number;
  heat: number;
  /** Seconds since the last offence. */
  calm: number;
  bust: number;
  player: Player;
  cars: Car[];
  people: Person[];
  bugs: Bug[];
  drones: Drone[];
  shots: Shot[];
  pickups: Pickup[];
  /** A bug bash under way: seconds left and bugs left. */
  bash: { timeLeft: number; left: number } | null;
  prevSwap: boolean;
  job: ActiveJob | null;
  deck: JobId[];
  deckAt: number;
  /** Seconds until the phones ring again after a job ends. */
  phoneWait: number;
  raining: boolean;
  weatherTimer: number;
  jobsDone: number;
  squashed: number;
  over: boolean;
  nextId: number;
  district: District;
  prevAction: boolean;
  copWait: number;
  warned: boolean;
}

export interface RunInput {
  /** Keys: left/right and up/down as -1, 0 or 1. Stick: the direction to go, any length up to 1. */
  moveX: number;
  moveY: number;
  mode: 'keys' | 'stick';
  handbrake: boolean;
  /** Get in or out. Acts on the press, not the hold. */
  action: boolean;
  horn: boolean;
  /** Fire the gun in hand. On foot only; it is the handbrake's button. */
  fire?: boolean;
  /** Change gun. Acts on the press. */
  swap?: boolean;
}

export const NO_INPUT: RunInput = { moveX: 0, moveY: 0, mode: 'keys', handbrake: false, action: false, horn: false };

export type RunEvent =
  | { type: 'cash'; x: number; y: number; amount: number }
  | { type: 'crash'; x: number; y: number; speed: number; player: boolean }
  | { type: 'squash'; x: number; y: number; gold: boolean }
  | { type: 'dive'; x: number; y: number }
  | { type: 'enter' }
  | { type: 'exit' }
  | { type: 'jack' }
  | { type: 'job'; id: JobId }
  | { type: 'stage'; index: number }
  | { type: 'jobDone'; id: JobId; pay: number }
  | { type: 'jobFailed'; id: JobId }
  | { type: 'heat'; level: number }
  | { type: 'busted' }
  | { type: 'burning' }
  | { type: 'explode'; x: number; y: number }
  | { type: 'wrecked' }
  | { type: 'rain'; on: boolean }
  | { type: 'wash' }
  | { type: 'collect'; x: number; y: number; left: number }
  | { type: 'checkpoint'; x: number; y: number; left: number }
  | { type: 'bump' }
  | { type: 'district'; id: District }
  | { type: 'horn' }
  | { type: 'shot'; weapon: WeaponId }
  | { type: 'pickup'; x: number; y: number; kind: PickupKind }
  | { type: 'zap'; x: number; y: number }
  | { type: 'hurt' }
  | { type: 'wasted' }
  | { type: 'bash'; state: 'start' | 'done' | 'over' }
  | { type: 'warn' }
  | { type: 'over' };

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export const heatLevel = (run: RunState): number => Math.min(4, Math.floor(run.heat));
export const carSpeed = (car: Car): number => Math.hypot(car.vx, car.vy);
/** Where the player is, on foot or at the wheel. */
export const playerPos = (run: RunState): Point => run.player.car ?? run.player;

function shuffle<V>(items: V[], rng: () => number): V[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeCar(run: RunState, kind: CarKind, x: number, y: number, angle: number, driver: Driver, color?: string): Car {
  const car: Car = {
    id: run.nextId++,
    kind,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    hp: CAR_SPECS[kind].hp,
    driver,
    color: color ?? (kind === 'taxi' ? '#111827' : kind === 'panda' ? '#f8fafc' : CAR_COLORS[Math.floor(run.rng() * CAR_COLORS.length)]),
    burning: 0,
    dead: 0,
    from: 0,
    to: 0,
    cruise: 78 + run.rng() * 34,
    blocked: 0,
    stuck: 0,
    reversing: 0,
    slide: 0
  };
  run.cars.push(car);
  return car;
}

/** A point on the left-hand lane from node `from` to node `to`, `s` pixels along it. */
function lanePoint(from: number, to: number, s: number): Point {
  const a = CITY.nodes[from];
  const b = CITY.nodes[to];
  const len = dist(a.x, a.y, b.x, b.y) || 1;
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  // This town drives on the left: the lane sits to the left of the direction of travel.
  return { x: a.x + dx * s + dy * LANE, y: a.y + dy * s - dx * LANE };
}

function spawnTraffic(run: RunState, minDist: number): boolean {
  const p = playerPos(run);
  const node = CITY.nodes[Math.floor(run.rng() * CITY.nodes.length)];
  const to = node.links[Math.floor(run.rng() * node.links.length)];
  const at = lanePoint(node.id, to, 40);
  if (dist(at.x, at.y, p.x, p.y) < minDist) return false;
  if (run.cars.some(c => dist(c.x, c.y, at.x, at.y) < 70)) return false;
  const b = CITY.nodes[to];
  const kind = TRAFFIC_KINDS[Math.floor(run.rng() * TRAFFIC_KINDS.length)];
  const car = makeCar(run, kind, at.x, at.y, Math.atan2(b.y - node.y, b.x - node.x), 'ai');
  car.from = node.id;
  car.to = to;
  return true;
}

const WALKABLE = new Set<number>([T.Pave, T.Plaza, T.Grass]);

function makePerson(run: RunState, x: number, y: number, penguin: boolean): Person {
  const tile = Math.floor(y / TILE) * COLS + Math.floor(x / TILE);
  const person: Person = {
    x,
    y,
    tx: x,
    ty: y,
    tile,
    prevTile: tile,
    state: 'walk',
    timer: 0,
    vx: 0,
    vy: 0,
    look: run.rng(),
    penguin,
    facing: 0
  };
  run.people.push(person);
  return person;
}

/** A free spot within `radius` of a point, or the point itself when none turns up. */
function spotNear(run: RunState, cx: number, cy: number, radius: number, margin = 8): Point {
  for (let tries = 0; tries < 40; tries++) {
    const a = run.rng() * Math.PI * 2;
    const r = 20 + run.rng() * (radius - 20);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (!solidAt(x, y) && !solidAt(x + margin, y) && !solidAt(x - margin, y) && !solidAt(x, y + margin) && !solidAt(x, y - margin)) {
      return { x, y };
    }
  }
  return { x: cx, y: cy };
}

function spawnAmbientBug(run: RunState, minDist: number): void {
  const p = playerPos(run);
  for (let tries = 0; tries < 8; tries++) {
    const tile = CITY.roads[Math.floor(run.rng() * CITY.roads.length)];
    const x = (tile % COLS) * TILE + TILE / 2;
    const y = Math.floor(tile / COLS) * TILE + TILE / 2;
    if (dist(x, y, p.x, p.y) < minDist) continue;
    run.bugs.push({ x, y, angle: run.rng() * Math.PI * 2, timer: run.rng(), gold: false });
    return;
  }
}

export function createRun(seed = 1): RunState {
  const rng = seededRng(seed);
  const home = CITY.places.home;
  const run: RunState = {
    rng,
    time: 0,
    clock: SHIFT_SECONDS,
    cash: 0,
    mult: 1,
    heat: 0,
    calm: 0,
    bust: 0,
    player: { x: home.x, y: home.y, angle: 0, car: null, stun: 0, stride: 0, hp: PLAYER_HP, weapon: null, ammo: {}, cool: 0 },
    cars: [],
    people: [],
    bugs: [],
    drones: [],
    shots: [],
    pickups: CITY.pickups.map(p => ({ ...p, wait: 0 })),
    bash: null,
    prevSwap: false,
    job: null,
    deck: [],
    deckAt: 0,
    phoneWait: 0,
    raining: false,
    weatherTimer: 35 + rng() * 25,
    jobsDone: 0,
    squashed: 0,
    over: false,
    nextId: 1,
    district: districtAt(home.x),
    prevAction: false,
    copWait: 0,
    warned: false
  };
  run.deck = shuffle(Object.keys(JOBS) as JobId[], rng);
  CITY.parked.forEach((spot, i) => {
    // The first spot is outside the flat: the player's own wee car, always the same.
    if (i === 0) makeCar(run, 'mini', spot.x, spot.y, spot.angle, 'none', '#14b8a6');
    else makeCar(run, TRAFFIC_KINDS[Math.floor(rng() * TRAFFIC_KINDS.length)], spot.x, spot.y, spot.angle, 'none');
  });
  for (let tries = 0, made = 0; made < TRAFFIC && tries < 400; tries++) if (spawnTraffic(run, 420)) made++;
  for (let i = 0; i < PEOPLE; i++) {
    const tile = CITY.pavements[Math.floor(rng() * CITY.pavements.length)];
    makePerson(run, (tile % COLS) * TILE + TILE / 2, Math.floor(tile / COLS) * TILE + TILE / 2, false);
  }
  for (let i = 0; i < AMBIENT_BUGS; i++) spawnAmbientBug(run, 200);
  return run;
}

// --- Physics -------------------------------------------------------------------

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Pushes a circle out of solid tiles, bouncing a little. Returns the hardest impact speed. */
function collideTiles(body: Body, r: number): number {
  let impact = 0;
  const x0 = Math.floor((body.x - r) / TILE);
  const x1 = Math.floor((body.x + r) / TILE);
  const y0 = Math.floor((body.y - r) / TILE);
  const y1 = Math.floor((body.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolidTile(tx, ty)) continue;
      const nx = clamp(body.x, tx * TILE, (tx + 1) * TILE);
      const ny = clamp(body.y, ty * TILE, (ty + 1) * TILE);
      let dx = body.x - nx;
      let dy = body.y - ny;
      let d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 0.001) {
        // Centre inside the tile: leave by the nearest face.
        const left = body.x - tx * TILE;
        const right = (tx + 1) * TILE - body.x;
        const up = body.y - ty * TILE;
        const down = (ty + 1) * TILE - body.y;
        const least = Math.min(left, right, up, down);
        dx = least === left ? -1 : least === right ? 1 : 0;
        dy = least === up ? -1 : least === down ? 1 : 0;
        if (dx !== 0) dy = 0;
        d = 0;
        body.x += dx * (least + r);
        body.y += dy * (least + r);
      } else {
        dx /= d;
        dy /= d;
        body.x += dx * (r - d);
        body.y += dy * (r - d);
      }
      const vn = body.vx * dx + body.vy * dy;
      if (vn < 0) {
        body.vx -= 1.3 * vn * dx;
        body.vy -= 1.3 * vn * dy;
        impact = Math.max(impact, -vn);
      }
    }
  }
  return impact;
}

/** Turns a stick direction into pedals and a wheel for a car. */
export function stickToCar(car: Car, mx: number, my: number): { throttle: number; steer: number } {
  const mag = Math.min(1, Math.hypot(mx, my));
  if (mag < 0.15) return { throttle: 0, steer: 0 };
  const diff = wrap(Math.atan2(my, mx) - car.angle);
  const vf = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  // Pointing the stick behind a slow car backs it up, wheel turned to swing the nose round.
  if (Math.abs(diff) > 2.2 && vf < 40) return { throttle: -mag, steer: diff > 0 ? -1 : 1 };
  return { throttle: mag * (Math.abs(diff) > 1.2 ? 0.5 : 1), steer: clamp(diff * 2.2, -1, 1) };
}

function driveCar(car: Car, throttle: number, steer: number, handbrake: boolean, dt: number, wet: boolean): void {
  const spec = CAR_SPECS[car.kind];
  const surface = surfaceGrip(car.x, car.y) * (wet ? WET_GRIP : 1);
  const limp = car.hp < spec.hp * 0.3 ? 0.75 : 1;
  const vfOld = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  car.angle = wrap(car.angle + steer * spec.turn * clamp(vfOld / 70, -1, 1) * (handbrake ? 1.35 : 1) * dt);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  let vl = -car.vx * fy + car.vy * fx;
  if (handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 240 * dt);
  else if (throttle > 0) vf += throttle * spec.accel * limp * (vf < 0 ? 2 : 1) * dt;
  else if (throttle < 0) vf += throttle * (vf > 0 ? 330 : spec.accel * 0.6) * dt;
  vf -= vf * (spec.accel / spec.top) * (surface < 0.6 ? 1.7 : 1) * dt;
  if (throttle === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 45 * dt);
  vf = Math.max(vf, -spec.top * 0.4);
  vl *= Math.exp(-spec.grip * surface * (handbrake ? 0.25 : 1) * dt);
  car.slide = Math.abs(vl);
  car.vx = fx * vf - fy * vl;
  car.vy = fy * vf + fx * vl;
}

// --- Tick --------------------------------------------------------------------------

export function tickRun(run: RunState, input: RunInput, dt: number): RunEvent[] {
  const events: RunEvent[] = [];
  if (run.over) return events;
  run.time += dt;
  const player = run.player;

  const offence = (amount: number) => {
    const before = heatLevel(run);
    run.heat = Math.min(4.99, run.heat + amount);
    run.calm = 0;
    if (heatLevel(run) !== before) events.push({ type: 'heat', level: heatLevel(run) });
  };
  const award = (amount: number, x: number, y: number) => {
    if (amount <= 0) return;
    run.cash += amount;
    events.push({ type: 'cash', x, y, amount });
  };
  const failJob = () => {
    if (!run.job) return;
    events.push({ type: 'jobFailed', id: run.job.def.id });
    endJob(run);
  };
  const squash = (bug: Bug) => {
    const i = run.bugs.indexOf(bug);
    if (i < 0) return;
    run.bugs.splice(i, 1);
    run.squashed++;
    events.push({ type: 'squash', x: bug.x, y: bug.y, gold: bug.gold || !!bug.bash });
    award((bug.bash ? BASH_CASH : BUG_CASH) * run.mult, bug.x, bug.y);
    if (bug.gold && run.job) run.job.count--;
    if (bug.bash && run.bash) run.bash.left--;
  };
  const zap = (drone: Drone) => {
    const i = run.drones.indexOf(drone);
    if (i < 0) return;
    run.drones.splice(i, 1);
    events.push({ type: 'zap', x: drone.x, y: drone.y });
    award(DRONE_CASH * run.mult, drone.x, drone.y);
    if (run.job) run.job.count--;
  };
  const hurt = (amount: number) => {
    if (player.hp <= 0) return;
    player.hp -= amount;
    events.push({ type: 'hurt' });
  };
  /** Sends a person diving away from a point, unharmed. */
  const scatter = (person: Person, fromX: number, fromY: number) => {
    if (person.state === 'dive' || person.state === 'down') return;
    const d = dist(person.x, person.y, fromX, fromY) || 1;
    person.vx = ((person.x - fromX) / d) * 170;
    person.vy = ((person.y - fromY) / d) * 170;
    person.state = 'dive';
    person.timer = 0.16;
    events.push({ type: 'dive', x: person.x, y: person.y });
  };
  /** An explosion: wrecks cars and drones, flattens bugs, scatters people, and hurts a player caught on foot. */
  const blast = (x: number, y: number, radius: number, power: number, source: Car | null) => {
    events.push({ type: 'explode', x, y });
    for (const other of run.cars) {
      if (other === source || other.dead) continue;
      const d = dist(other.x, other.y, x, y);
      if (d > radius) continue;
      other.hp -= power;
      other.vx += ((other.x - x) / (d || 1)) * 120;
      other.vy += ((other.y - y) / (d || 1)) * 120;
    }
    for (const drone of [...run.drones]) if (dist(drone.x, drone.y, x, y) < radius) zap(drone);
    for (const bug of [...run.bugs]) if (dist(bug.x, bug.y, x, y) < radius) squash(bug);
    for (const person of run.people) if (!person.penguin && dist(person.x, person.y, x, y) < radius + 40) scatter(person, x, y);
    if (!player.car && dist(player.x, player.y, x, y) < radius * 0.8) {
      player.stun = Math.max(player.stun, 0.8);
      hurt(power * 0.5);
    }
  };

  // --- Getting in and out ------------------------------------------------------
  const pressed = input.action && !run.prevAction;
  run.prevAction = input.action;
  if (pressed && player.stun <= 0) {
    if (player.car) {
      const car = player.car;
      if (carSpeed(car) < 60) {
        // Step out on the offside, or the nearside when a wall is in the way.
        for (const side of [1, -1]) {
          const x = car.x - Math.sin(car.angle) * 17 * side;
          const y = car.y + Math.cos(car.angle) * 17 * side;
          if (solidAt(x, y)) continue;
          player.x = x;
          player.y = y;
          player.angle = car.angle;
          player.car = null;
          car.driver = 'none';
          events.push({ type: 'exit' });
          break;
        }
      }
    } else {
      let best: Car | null = null;
      let bestD = ENTER_RANGE;
      for (const car of run.cars) {
        if (car.dead || car.burning || car.driver === 'cop') continue;
        const d = dist(car.x, car.y, player.x, player.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) {
        if (best.driver === 'ai') {
          // The driver gets out, unhurt and unimpressed.
          const out = makePerson(run, best.x - Math.sin(best.angle) * 16, best.y + Math.cos(best.angle) * 16, false);
          out.state = 'fist';
          out.timer = 2.2;
          events.push({ type: 'jack' });
          offence(0.7);
        }
        best.driver = 'player';
        player.car = best;
        events.push({ type: 'enter' });
      }
    }
  }
  if (input.horn && player.car) events.push({ type: 'horn' });

  // --- The player ------------------------------------------------------------------
  player.stun = Math.max(0, player.stun - dt);
  let walking = false;
  if (!player.car) {
    const mag = Math.hypot(input.moveX, input.moveY);
    const body: Body = { x: player.x, y: player.y, vx: 0, vy: 0 };
    if (mag > 0.15 && player.stun <= 0) {
      const scale = Math.min(1, mag) / mag;
      body.vx = input.moveX * scale * WALK_SPEED;
      body.vy = input.moveY * scale * WALK_SPEED;
      player.angle = Math.atan2(input.moveY, input.moveX);
      player.stride += WALK_SPEED * dt;
      walking = true;
    }
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    collideTiles(body, FOOT_R);
    player.x = body.x;
    player.y = body.y;
  }

  // --- Cars ----------------------------------------------------------------------
  const pp = playerPos(run);
  const level = heatLevel(run);
  for (const car of run.cars) {
    if (car.dead) {
      car.dead += dt;
      car.vx *= Math.exp(-4 * dt);
      car.vy *= Math.exp(-4 * dt);
    } else if (car.driver === 'player') {
      const ctl =
        input.mode === 'stick' ? stickToCar(car, input.moveX, input.moveY) : { throttle: -input.moveY, steer: input.moveX };
      driveCar(car, ctl.throttle, ctl.steer, input.handbrake, dt, run.raining);
    } else if (car.driver === 'ai') {
      driveTraffic(run, car, dt);
    } else if (car.driver === 'cop') {
      driveCop(run, car, pp, dt);
    } else {
      driveCar(car, 0, 0, true, dt, run.raining);
    }
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    const impact = collideTiles(car, CAR_R);
    if (impact > 60 && !car.dead) {
      car.hp -= (impact - 60) * 0.28;
      const mine = car.driver === 'player';
      events.push({ type: 'crash', x: car.x, y: car.y, speed: impact, player: mine });
      if (mine) bumpButler(run, events);
    }
  }

  // Car against car.
  for (let i = 0; i < run.cars.length; i++) {
    const a = run.cars[i];
    for (let j = i + 1; j < run.cars.length; j++) {
      const b = run.cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= CAR_R * 2 || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      const ma = a.dead ? 6 : CAR_SPECS[a.kind].mass;
      const mb = b.dead ? 6 : CAR_SPECS[b.kind].mass;
      const overlap = CAR_R * 2 - d;
      a.x -= nx * overlap * (mb / (ma + mb));
      a.y -= ny * overlap * (mb / (ma + mb));
      b.x += nx * overlap * (ma / (ma + mb));
      b.y += ny * overlap * (ma / (ma + mb));
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel >= 0) continue;
      const jImp = (-1.4 * rel) / (1 / ma + 1 / mb);
      a.vx -= (jImp / ma) * nx;
      a.vy -= (jImp / ma) * ny;
      b.vx += (jImp / mb) * nx;
      b.vy += (jImp / mb) * ny;
      const hit = -rel;
      if (hit > 50) {
        const mine = a.driver === 'player' || b.driver === 'player';
        if (!a.dead) a.hp -= (hit - 50) * 0.2;
        if (!b.dead) b.hp -= (hit - 50) * 0.2;
        events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, speed: hit, player: mine });
        if (mine) {
          const other = a.driver === 'player' ? b : a;
          // A nudge in traffic is nobody's business; a proper shunt is, and a police car always is.
          if (!other.dead && (hit > 85 || other.driver === 'cop')) offence(other.driver === 'cop' ? 0.8 : 0.3 + Math.min(0.4, (hit - 85) / 200));
          bumpButler(run, events);
        }
      }
    }
  }

  // Fires and explosions.
  for (const car of run.cars) {
    if (car.dead) continue;
    if (car.hp <= 0 && car.burning === 0) {
      car.burning = 3.5;
      if (car.driver === 'player') events.push({ type: 'burning' });
      if (car.driver === 'ai' || car.driver === 'cop') car.driver = 'none';
    }
    if (car.burning > 0) {
      car.burning -= dt;
      if (car.burning <= 0) {
        car.burning = 0;
        car.dead = 0.001;
        const wasMine = player.car === car;
        if (wasMine) player.car = null;
        blast(car.x, car.y, 74, 55, car);
        if (wasMine) {
          // Thrown clear, singed, and late.
          player.x = car.x;
          player.y = car.y;
          const clear = spotNear(run, car.x, car.y, 46, 4);
          player.x = clear.x;
          player.y = clear.y;
          player.stun = 1.4;
          run.clock = Math.max(0, run.clock - WRECK_SECONDS);
          run.mult = 1;
          events.push({ type: 'wrecked' });
        }
        car.driver = 'none';
        if (dist(pp.x, pp.y, car.x, car.y) < 240) offence(1);
      }
    }
  }
  run.cars = run.cars.filter(c => c.dead < 25 && !(c.driver === 'ai' && dist(c.x, c.y, pp.x, pp.y) > 1150));
  if (run.cars.filter(c => c.driver === 'ai').length < TRAFFIC) spawnTraffic(run, 560);

  // A moving car shoves a walking player aside.
  if (!player.car) {
    for (const car of run.cars) {
      const d = dist(car.x, car.y, player.x, player.y);
      if (d >= CAR_R + FOOT_R || d < 0.001) continue;
      player.x += ((player.x - car.x) / d) * (CAR_R + FOOT_R - d);
      player.y += ((player.y - car.y) / d) * (CAR_R + FOOT_R - d);
      if (carSpeed(car) > 70) player.stun = Math.max(player.stun, 0.7);
    }
    const body: Body = { x: player.x, y: player.y, vx: 0, vy: 0 };
    collideTiles(body, FOOT_R);
    player.x = body.x;
    player.y = body.y;
  }

  // --- People and penguins ---------------------------------------------------------
  for (const person of [...run.people]) stepPerson(run, person, dt, events, offence);

  // --- Bugs ------------------------------------------------------------------------
  for (let i = run.bugs.length - 1; i >= 0; i--) {
    const bug = run.bugs[i];
    bug.timer -= dt;
    if (bug.timer <= 0) {
      bug.timer = 0.4 + run.rng() * 0.9;
      bug.angle += (run.rng() - 0.5) * 2.4;
      if (bug.gold && run.job) {
        // A job's bugs mill about where they were let loose.
        const stage = run.job.def.stages[run.job.stage];
        if (stage.type === 'squash') {
          const c = CITY.places[stage.place];
          if (dist(bug.x, bug.y, c.x, c.y) > 190) bug.angle = Math.atan2(c.y - bug.y, c.x - bug.x);
        }
      }
    }
    const nx = bug.x + Math.cos(bug.angle) * 36 * dt;
    const ny = bug.y + Math.sin(bug.angle) * 36 * dt;
    if (solidAt(nx + Math.cos(bug.angle) * 6, ny + Math.sin(bug.angle) * 6)) bug.angle += Math.PI * (0.6 + run.rng() * 0.8);
    else {
      bug.x = nx;
      bug.y = ny;
    }
    const car = player.car;
    // A bug is squashed by a moving car or a walking foot. Standing still earns nothing, so an idle shift banks nothing.
    const hit = car ? carSpeed(car) > 20 && dist(car.x, car.y, bug.x, bug.y) < 15 : walking && dist(player.x, player.y, bug.x, bug.y) < 10;
    if (hit) squash(bug);
  }
  if (run.bugs.filter(b => !b.gold && !b.bash).length < AMBIENT_BUGS) spawnAmbientBug(run, 520);

  // --- Guns, drones and crates ---------------------------------------------------------
  const swapped = !!input.swap && !run.prevSwap;
  run.prevSwap = !!input.swap;
  const held = WEAPON_IDS.filter(id => (player.ammo[id] ?? 0) > 0);
  if (player.weapon && !held.includes(player.weapon)) player.weapon = held[0] ?? null;
  if (swapped && held.length > 1 && player.weapon) player.weapon = held[(held.indexOf(player.weapon) + 1) % held.length];
  player.cool = Math.max(0, player.cool - dt);
  if (input.fire && !player.car && player.weapon && player.stun <= 0 && player.cool <= 0) {
    const id = player.weapon;
    const spec = WEAPONS[id];
    const aim = player.angle + (run.rng() * 2 - 1) * spec.spread;
    run.shots.push({
      x: player.x + Math.cos(player.angle) * 9,
      y: player.y + Math.sin(player.angle) * 9,
      vx: Math.cos(aim) * spec.speed,
      vy: Math.sin(aim) * spec.speed,
      left: spec.range,
      damage: spec.damage,
      blast: spec.blast,
      hostile: false
    });
    player.cool = spec.rate;
    player.ammo[id] = (player.ammo[id] ?? 1) - 1;
    events.push({ type: 'shot', weapon: id });
    // Gunfire in a street with people in it is the police's business.
    if (run.people.some(p => !p.penguin && dist(p.x, p.y, player.x, player.y) < 150)) offence(id === 'smg' ? 0.03 : 0.1);
  }

  for (let i = run.shots.length - 1; i >= 0; i--) {
    const shot = run.shots[i];
    const step = Math.hypot(shot.vx, shot.vy) * dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.left -= step;
    let spent = shot.left <= 0 || solidAt(shot.x, shot.y);
    if (!spent && shot.hostile) {
      const car = player.car;
      if (car && dist(car.x, car.y, shot.x, shot.y) < 12) {
        car.hp -= shot.damage * 0.6;
        spent = true;
      } else if (!car && dist(player.x, player.y, shot.x, shot.y) < 7) {
        hurt(shot.damage);
        spent = true;
      }
    } else if (!spent) {
      const drone = run.drones.find(d => dist(d.x, d.y, shot.x, shot.y) < 11);
      const bug = run.bugs.find(b => dist(b.x, b.y, shot.x, shot.y) < 9);
      const car = run.cars.find(c => !c.dead && dist(c.x, c.y, shot.x, shot.y) < 12);
      const person = run.people.find(p => !p.penguin && dist(p.x, p.y, shot.x, shot.y) < 9);
      if (drone) {
        drone.hp -= shot.damage;
        if (drone.hp <= 0) zap(drone);
        spent = true;
      } else if (bug) {
        squash(bug);
        spent = true;
      } else if (car) {
        car.hp -= shot.damage;
        if (car.driver === 'cop') offence(0.4);
        else if (car.driver === 'ai') offence(0.12);
        spent = true;
      } else if (person) {
        // Nobody is shot in this town: they see it coming and are already on the floor.
        scatter(person, shot.x - shot.vx, shot.y - shot.vy);
        offence(0.3);
      }
    }
    if (!spent) continue;
    run.shots.splice(i, 1);
    if (shot.blast) {
      blast(shot.x, shot.y, shot.blast, shot.damage, null);
      offence(0.6);
    }
  }

  for (const drone of [...run.drones]) {
    const d = dist(drone.x, drone.y, pp.x, pp.y);
    const car = player.car;
    if (car && d < 15 && carSpeed(car) > 50) {
      // A car is also an answer.
      car.hp -= 6;
      zap(drone);
      continue;
    }
    drone.cool -= dt;
    const sees = d < 280 && clearLine(drone.x, drone.y, pp.x, pp.y);
    // It hangs back at its own range, and goes home when it has lost its mark.
    const tx = sees ? pp.x : drone.homeX;
    const ty = sees ? pp.y : drone.homeY;
    const td = dist(drone.x, drone.y, tx, ty) || 1;
    const want = sees ? (d > 150 ? 1 : d < 95 ? -1 : 0) : td > 12 ? 0.6 : 0;
    const nx = drone.x + ((tx - drone.x) / td) * want * 58 * dt;
    const ny = drone.y + ((ty - drone.y) / td) * want * 58 * dt;
    if (!solidAt(nx, ny)) {
      drone.x = nx;
      drone.y = ny;
    }
    if (sees && d < 260 && drone.cool <= 0) {
      drone.cool = 1.3 + run.rng() * 0.7;
      const a = Math.atan2(pp.y - drone.y, pp.x - drone.x) + (run.rng() - 0.5) * 0.16;
      run.shots.push({ x: drone.x, y: drone.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, left: 300, damage: 12, blast: 0, hostile: true });
    }
  }

  for (const pickup of run.pickups) {
    if (pickup.wait > 0) {
      pickup.wait = Math.max(0, pickup.wait - dt);
      continue;
    }
    if (dist(pickup.x, pickup.y, pp.x, pp.y) > 17) continue;
    if (pickup.kind === 'coffee') {
      if (player.hp >= PLAYER_HP) continue;
      player.hp = Math.min(PLAYER_HP, player.hp + COFFEE_HP);
    } else if (pickup.kind === 'bash') {
      if (run.bash) continue;
      run.bash = { timeLeft: BASH_SECONDS, left: BASH_BUGS };
      for (let k = 0; k < BASH_BUGS; k++) {
        const at = spotNear(run, pp.x, pp.y, 170);
        run.bugs.push({ x: at.x, y: at.y, angle: run.rng() * Math.PI * 2, timer: run.rng(), gold: false, bash: true });
      }
      events.push({ type: 'bash', state: 'start' });
    } else {
      player.ammo[pickup.kind] = (player.ammo[pickup.kind] ?? 0) + WEAPONS[pickup.kind].ammo;
      player.weapon = pickup.kind;
    }
    pickup.wait = RESTOCK_SECONDS;
    events.push({ type: 'pickup', x: pickup.x, y: pickup.y, kind: pickup.kind });
  }

  if (run.bash) {
    run.bash.timeLeft -= dt;
    if (run.bash.left <= 0) {
      award(BASH_BONUS * run.mult, pp.x, pp.y);
      events.push({ type: 'bash', state: 'done' });
      run.bash = null;
    } else if (run.bash.timeLeft <= 0) {
      run.bugs = run.bugs.filter(b => !b.bash);
      events.push({ type: 'bash', state: 'over' });
      run.bash = null;
    }
  }

  if (player.hp <= 0) {
    // Out cold: patched up at the clinic, lighter by the guns, the bonus and some of the shift.
    const clinic = CITY.places.clinic;
    if (player.car) player.car.driver = 'none';
    player.car = null;
    player.x = clinic.x;
    player.y = clinic.y;
    player.hp = PLAYER_HP;
    player.ammo = {};
    player.weapon = null;
    player.stun = 1;
    run.heat = 0;
    run.mult = 1;
    run.clock = Math.max(0, run.clock - WASTED_SECONDS);
    run.cars = run.cars.filter(c => c.driver !== 'cop');
    run.shots = [];
    events.push({ type: 'wasted' }, { type: 'heat', level: 0 });
    failJob();
  }

  // --- Heat and the police -----------------------------------------------------------
  run.calm += dt;
  const cops = run.cars.filter(c => c.driver === 'cop');
  const seen = cops.some(c => dist(c.x, c.y, pp.x, pp.y) < 280);
  if (run.heat > 0 && (level === 0 || (!seen && run.calm > 4))) {
    run.heat = Math.max(0, run.heat - (level === 0 ? 0.06 : 0.24) * dt);
    if (heatLevel(run) !== level) events.push({ type: 'heat', level: heatLevel(run) });
  }
  if (heatLevel(run) === 0 && cops.length) standDown(run);
  run.copWait -= dt;
  if (cops.length < heatLevel(run) && run.copWait <= 0) {
    let best: Point | null = null;
    let bestD = Infinity;
    for (const node of CITY.nodes) {
      const d = dist(node.x, node.y, pp.x, pp.y);
      if (d > 500 && d < bestD && !run.cars.some(c => dist(c.x, c.y, node.x, node.y) < 60)) {
        bestD = d;
        best = node;
      }
    }
    if (best) {
      makeCar(run, 'panda', best.x, best.y, Math.atan2(pp.y - best.y, pp.x - best.x), 'cop');
      run.copWait = 2.5;
    }
  }
  const slow = player.car ? carSpeed(player.car) < 30 : true;
  const near = cops.some(c => dist(c.x, c.y, pp.x, pp.y) < BUST_RANGE);
  run.bust = clamp(run.bust + (slow && near ? dt : -dt * 0.6), 0, BUST_FILL);
  if (run.bust >= BUST_FILL) {
    run.bust = 0;
    run.heat = 0;
    run.mult = 1;
    run.clock = Math.max(0, run.clock - BUST_SECONDS);
    if (player.car) {
      player.car.driver = 'none';
      player.car = null;
    }
    const nick = CITY.places.nick;
    player.x = nick.x;
    player.y = nick.y;
    player.stun = 1;
    run.cars = run.cars.filter(c => c.driver !== 'cop');
    events.push({ type: 'busted' }, { type: 'heat', level: 0 });
    failJob();
  }

  // The car wash: drive through hot and come out clean, mended and a new colour.
  if (player.car && heatLevel(run) > 0) {
    const car = player.car;
    if (CITY.washes.some(w => dist(w.x, w.y, car.x, car.y) < 24)) {
      run.heat = 0;
      car.hp = CAR_SPECS[car.kind].hp;
      car.color = CAR_COLORS[(CAR_COLORS.indexOf(car.color) + 1 + Math.floor(run.rng() * 4)) % CAR_COLORS.length];
      standDown(run);
      events.push({ type: 'wash' }, { type: 'heat', level: 0 });
    }
  }

  // --- Jobs --------------------------------------------------------------------------
  const here = playerPos(run);
  const speed = player.car ? carSpeed(player.car) : 0;
  if (!run.job) {
    run.phoneWait = Math.max(0, run.phoneWait - dt);
    if (run.phoneWait <= 0 && speed < ARRIVE_SPEED && CITY.phones.some(ph => dist(ph.x, ph.y, here.x, here.y) < ARRIVE_RANGE)) {
      const def = JOBS[run.deck[run.deckAt % run.deck.length]];
      run.deckAt++;
      run.job = { def, stage: -1, timeLeft: def.time, remaining: [], count: 0, care: 1, hidden: null };
      events.push({ type: 'job', id: def.id });
      beginStage(run, 0);
    }
  } else {
    const job = run.job;
    job.timeLeft -= dt;
    const stage = job.def.stages[job.stage];
    let done = false;
    if (stage.type === 'goto' || stage.type === 'sonar') {
      const target = CITY.places[stage.type === 'sonar' ? (job.hidden as PlaceId) : stage.place];
      done = speed < ARRIVE_SPEED && dist(target.x, target.y, here.x, here.y) < ARRIVE_RANGE;
    } else if (stage.type === 'sweep') {
      for (let i = job.remaining.length - 1; i >= 0; i--) {
        const place = CITY.places[job.remaining[i]];
        if (dist(place.x, place.y, here.x, here.y) < ARRIVE_RANGE + 8) {
          job.remaining.splice(i, 1);
          events.push({ type: 'checkpoint', x: place.x, y: place.y, left: job.remaining.length });
        }
      }
      done = job.remaining.length === 0;
    } else {
      done = job.count <= 0;
    }
    if (done) {
      if (job.stage + 1 < job.def.stages.length) {
        beginStage(run, job.stage + 1);
        events.push({ type: 'stage', index: job.stage });
      } else {
        const pay = Math.round(((job.def.pay * job.care + Math.max(0, job.timeLeft) * 6) * run.mult) / 10) * 10;
        events.push({ type: 'jobDone', id: job.def.id, pay });
        award(pay, here.x, here.y);
        run.jobsDone++;
        run.mult = Math.min(MAX_MULT, run.mult + 1);
        run.clock += JOB_BONUS_SECONDS;
        endJob(run);
      }
    } else if (job.timeLeft <= 0) {
      failJob();
    }
  }

  // --- Weather, districts, the clock ---------------------------------------------------
  run.weatherTimer -= dt;
  if (run.weatherTimer <= 0) {
    run.raining = !run.raining;
    run.weatherTimer = run.raining ? 28 + run.rng() * 18 : 35 + run.rng() * 25;
    events.push({ type: 'rain', on: run.raining });
  }
  const district = districtAt(here.x);
  // A boundary runs down the middle of a road: only a clear step past it counts, or a drive along it flickers.
  if (district !== run.district && districtAt(here.x - 56) === district && districtAt(here.x + 56) === district) {
    run.district = district;
    events.push({ type: 'district', id: district });
  }
  run.clock -= dt;
  if (!run.warned && run.clock <= 10) {
    run.warned = true;
    events.push({ type: 'warn' });
  }
  if (run.clock > 12) run.warned = false;
  if (run.clock <= 0) {
    run.clock = 0;
    run.over = true;
    events.push({ type: 'over' });
  }
  return events;
}

/** Every chasing police car goes back to being traffic. */
function standDown(run: RunState): void {
  for (const car of run.cars) {
    if (car.driver !== 'cop') continue;
    car.driver = 'ai';
    const node = nearestNode(car.x, car.y);
    car.from = node.id;
    car.to = node.links[0];
    car.cruise = 80;
  }
}

function bumpButler(run: RunState, events: RunEvent[]): void {
  const job = run.job;
  if (!job || !job.def.fragile || job.stage === 0 || job.care <= 0.25) return;
  job.care = Math.max(0.25, job.care - 0.15);
  events.push({ type: 'bump' });
}

function endJob(run: RunState): void {
  run.job = null;
  run.phoneWait = 2.5;
  run.bugs = run.bugs.filter(b => !b.gold);
  run.people = run.people.filter(p => !p.penguin);
  run.drones = [];
}

function beginStage(run: RunState, index: number): void {
  const job = run.job as ActiveJob;
  job.stage = index;
  const stage: Stage = job.def.stages[index];
  if (stage.type === 'sweep') job.remaining = [...stage.places];
  if (stage.type === 'sonar') job.hidden = stage.places[Math.floor(run.rng() * stage.places.length)];
  if (stage.type === 'squash' || stage.type === 'collect' || stage.type === 'purge') {
    job.count = stage.count;
    const c = CITY.places[stage.place];
    for (let i = 0; i < stage.count; i++) {
      const at = spotNear(run, c.x, c.y, 150);
      if (stage.type === 'purge') run.drones.push({ x: at.x, y: at.y, hp: DRONE_HP, cool: 1 + run.rng(), homeX: at.x, homeY: at.y });
      else if (stage.type === 'squash') run.bugs.push({ x: at.x, y: at.y, angle: run.rng() * Math.PI * 2, timer: run.rng(), gold: true });
      else makePerson(run, at.x, at.y, true);
    }
  }
}

function driveTraffic(run: RunState, car: Car, dt: number): void {
  const a = CITY.nodes[car.from];
  const b = CITY.nodes[car.to];
  const len = dist(a.x, a.y, b.x, b.y) || 1;
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  let s = (car.x - a.x) * dx + (car.y - a.y) * dy;
  if (s > len - 22) {
    // At the crossing: take any road but the one just driven, unless it is a dead end.
    const options = b.links.filter(id => id !== car.from);
    const next = options.length ? options[Math.floor(run.rng() * options.length)] : car.from;
    car.from = car.to;
    car.to = next;
    s = 0;
  }
  const target = lanePoint(car.from, car.to, Math.max(26, (car.from === a.id ? s : 0) + 40));
  const diff = wrap(Math.atan2(target.y - car.y, target.x - car.x) - car.angle);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const vf = car.vx * fx + car.vy * fy;

  // Brake for whatever is in the lane ahead.
  const reach = 40 + Math.max(0, vf) * 0.3;
  const inWay = (x: number, y: number, half: number): boolean => {
    const ahead = (x - car.x) * fx + (y - car.y) * fy;
    return ahead > 6 && ahead < reach && Math.abs(-(x - car.x) * fy + (y - car.y) * fx) < half;
  };
  let blocked = false;
  for (const other of run.cars) if (other !== car && inWay(other.x, other.y, 15)) blocked = true;
  if (!run.player.car && inWay(run.player.x, run.player.y, 12)) blocked = true;
  for (const person of run.people) if (inWay(person.x, person.y, 10)) blocked = true;
  car.blocked = blocked ? car.blocked + dt : 0;
  // Patience runs out after a few seconds, which is what unpicks a jam.
  if (blocked && car.blocked % 6 < 4) {
    driveCar(car, vf > 4 ? -1 : 0, clamp(diff * 3, -1, 1), vf <= 4, dt, run.raining);
    return;
  }
  const want = car.cruise * (Math.abs(diff) > 0.5 ? 0.5 : 1) * (blocked ? 0.4 : 1);
  driveCar(car, vf < want ? 0.7 : vf > want + 25 ? -0.5 : 0, clamp(diff * 3, -1, 1), false, dt, run.raining);
}

function driveCop(run: RunState, car: Car, pp: Point, dt: number): void {
  const to = wayTo(car.x, car.y, pp.x, pp.y, CAR_R);
  const tx = to.x;
  const ty = to.y;
  const speed = carSpeed(car);
  car.stuck = speed < 12 ? car.stuck + dt : 0;
  if (car.stuck > 1.2) {
    car.stuck = 0;
    car.reversing = 0.9;
  }
  if (car.reversing > 0) {
    car.reversing -= dt;
    driveCar(car, -1, 0.6, false, dt, run.raining);
    return;
  }
  const d = dist(car.x, car.y, pp.x, pp.y);
  const ctl = stickToCar(car, tx - car.x, ty - car.y);
  // Ease off on top of the player, so a stop is a block and not a ram.
  driveCar(car, d < 46 ? Math.min(ctl.throttle, 0.2) : ctl.throttle, ctl.steer, false, dt, run.raining);
}

function stepPerson(
  run: RunState,
  person: Person,
  dt: number,
  events: RunEvent[],
  offence: (amount: number) => void
): void {
  const player = run.player;
  if (person.state === 'dive') {
    const nx = person.x + person.vx * dt;
    const ny = person.y + person.vy * dt;
    if (!solidAt(nx, ny)) {
      person.x = nx;
      person.y = ny;
    }
    person.timer -= dt;
    if (person.timer <= 0) {
      person.state = 'down';
      person.timer = 0.9;
    }
    return;
  }
  // Whatever else they are doing, nobody stays under a car: a body in the way is slid aside.
  for (const car of run.cars) {
    const d = dist(car.x, car.y, person.x, person.y);
    if (d >= 13 || d < 0.001) continue;
    const nx = person.x + ((person.x - car.x) / d) * (13 - d);
    const ny = person.y + ((person.y - car.y) / d) * (13 - d);
    if (!solidAt(nx, ny)) {
      person.x = nx;
      person.y = ny;
    }
  }
  if (person.state === 'down') {
    person.timer -= dt;
    if (person.timer <= 0) {
      person.state = 'walk';
      person.tx = person.x;
      person.ty = person.y;
      person.tile = Math.floor(person.y / TILE) * COLS + Math.floor(person.x / TILE);
    }
    return;
  }

  // Leap clear of any car bearing down.
  for (const car of run.cars) {
    const speed = carSpeed(car);
    if (speed < 50) continue;
    const rx = person.x - car.x;
    const ry = person.y - car.y;
    const ahead = (rx * car.vx + ry * car.vy) / speed;
    if (ahead < -4 || ahead > 40) continue;
    const side = (-rx * car.vy + ry * car.vx) / speed;
    if (Math.abs(side) > 15) continue;
    const dir = side >= 0 ? 1 : -1;
    person.vx = (-car.vy / speed) * 170 * dir;
    person.vy = (car.vx / speed) * 170 * dir;
    if (solidAt(person.x + person.vx * 0.16, person.y + person.vy * 0.16)) {
      person.vx = -person.vx;
      person.vy = -person.vy;
    }
    person.state = 'dive';
    person.timer = 0.16;
    events.push({ type: 'dive', x: person.x, y: person.y });
    if (car.driver === 'player' && !person.penguin) offence(0.2);
    return;
  }

  if (person.state === 'fist') {
    // A driver turned out of a car stands and says so for a moment, then walks off.
    person.timer -= dt;
    if (person.timer <= 0) {
      person.state = 'walk';
      person.tx = person.x;
      person.ty = person.y;
      person.tile = Math.floor(person.y / TILE) * COLS + Math.floor(person.x / TILE);
    }
    return;
  }

  if (person.penguin) {
    // Penguins come along quietly once someone walks up to them.
    if (!player.car && dist(player.x, player.y, person.x, person.y) < 14 && run.job) {
      run.job.count--;
      events.push({ type: 'collect', x: person.x, y: person.y, left: run.job.count });
      run.people.splice(run.people.indexOf(person), 1);
      return;
    }
  }

  const d = dist(person.x, person.y, person.tx, person.ty);
  if (d < 2) {
    if (person.penguin) {
      const stage = run.job?.def.stages[run.job.stage];
      const c = stage && stage.type === 'collect' ? CITY.places[stage.place] : person;
      const at = spotNear(run, c.x, c.y, 150);
      person.tx = at.x;
      person.ty = at.y;
      if (!clearLine(person.x, person.y, at.x, at.y)) {
        person.tx = person.x;
        person.ty = person.y;
      }
    } else {
      const tx = person.tile % COLS;
      const ty = Math.floor(person.tile / COLS);
      const options: number[] = [];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + ox;
        const ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (WALKABLE.has(tileAt(nx, ny))) options.push(ny * COLS + nx);
      }
      const fresh = options.filter(o => o !== person.prevTile);
      const pick = fresh.length ? fresh : options;
      if (pick.length) {
        person.prevTile = person.tile;
        person.tile = pick[Math.floor(run.rng() * pick.length)];
        person.tx = (person.tile % COLS) * TILE + 6 + run.rng() * (TILE - 12);
        person.ty = Math.floor(person.tile / COLS) * TILE + 6 + run.rng() * (TILE - 12);
      } else {
        // Stranded off the pavement (a driver turned out of a car): make for the nearest one.
        let best = person.tile;
        let bestD = Infinity;
        for (const tile of CITY.pavements) {
          const dd = Math.abs((tile % COLS) - tx) + Math.abs(Math.floor(tile / COLS) - ty);
          if (dd < bestD) {
            bestD = dd;
            best = tile;
          }
        }
        person.prevTile = person.tile;
        person.tile = best;
        person.tx = (best % COLS) * TILE + TILE / 2;
        person.ty = Math.floor(best / COLS) * TILE + TILE / 2;
      }
    }
    return;
  }
  const pace = person.penguin ? 20 : 26 + person.look * 10;
  person.facing = Math.atan2(person.ty - person.y, person.tx - person.x);
  person.x += ((person.tx - person.x) / d) * Math.min(d, pace * dt);
  person.y += ((person.ty - person.y) / d) * Math.min(d, pace * dt);
}

/** What the player is being sent to: the points to mark, and whether the arrow may show them. */
export function objective(run: RunState): { points: Point[]; hidden: boolean; phone: boolean } {
  const job = run.job;
  if (!job) return { points: run.phoneWait > 0 ? [] : CITY.phones, hidden: false, phone: true };
  const stage = job.def.stages[job.stage];
  if (stage.type === 'goto') return { points: [CITY.places[stage.place]], hidden: false, phone: false };
  if (stage.type === 'sonar') return { points: [CITY.places[job.hidden as PlaceId]], hidden: true, phone: false };
  if (stage.type === 'sweep') return { points: job.remaining.map(id => CITY.places[id]), hidden: false, phone: false };
  if (stage.type === 'squash') return { points: run.bugs.filter(b => b.gold), hidden: false, phone: false };
  if (stage.type === 'purge') return { points: run.drones, hidden: false, phone: false };
  return { points: run.people.filter(p => p.penguin), hidden: false, phone: false };
}

/** The nearest of the objective's points to the player, or null with nothing to chase. */
export function nearestObjective(run: RunState): Point | null {
  const here = playerPos(run);
  let best: Point | null = null;
  let bestD = Infinity;
  for (const point of objective(run).points) {
    const d = dist(point.x, point.y, here.x, here.y);
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

/** How strong a sonar job's signal is where the player stands, 0 far to 1 on top of it; 0 off a sonar stage. */
export function sonarSignal(run: RunState): number {
  const job = run.job;
  if (!job || job.def.stages[job.stage].type !== 'sonar') return 0;
  const target = CITY.places[job.hidden as PlaceId];
  const here = playerPos(run);
  return clamp(1 - dist(target.x, target.y, here.x, here.y) / 1100, 0.02, 1);
}
