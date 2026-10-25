/**
 * The CPU fighter. It plays through the same `FrameInput` a player does, so
 * every special it throws is a motion it actually performs on the stick and
 * every block is a held direction: nothing is granted to it that the rules
 * would refuse a player.
 *
 * DOM-free and seeded: a `Cpu` owns its own `seededRng` stream, so a match
 * between two seeded CPUs plays out identically every time, which is what the
 * playthrough tests stand on. `level` (0 to 1) is the difficulty the ladder
 * ramps: how quickly it reacts, how often it guards, anti-airs and punishes,
 * and how much it trusts its specials.
 */
import { seededRng } from '../engine/math';
import { charged, hurtboxes, isAirborne, type FightState, type FighterState } from './fight';
import { HK, HP, LK, LP, MK, MP, type FrameInput } from './motion';
import { specialOf } from './roster';

interface Step {
  /** Numpad direction relative to facing. */
  dir: number;
  press: number;
}

export interface Cpu {
  level: number;
  rng: () => number;
  queue: Step[];
  /** Direction held while idle between decisions (a charge, a guard). */
  hold: number;
  /** Frames until the next decision. */
  wait: number;
  /** Frames until a seen threat is answered (the reaction time). */
  react: number;
  /** The threat being reacted to, so one jump is judged once. */
  seen: string;
  /** Whether this threat will be guarded, decided once when it is seen. */
  willGuard: boolean;
  lastHeld: number;
}

export function createCpu(level: number, seed = 1): Cpu {
  return { level: Math.max(0, Math.min(1, level)), rng: seededRng(seed), queue: [], hold: 5, wait: 0, react: 0, seen: '', willGuard: false, lastHeld: 0 };
}

const HORIZ = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
const VERT = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];

function toInput(step: Step, facing: 1 | -1, lastHeld: number): FrameInput {
  const x = (HORIZ[step.dir] * facing) as -1 | 0 | 1;
  const y = VERT[step.dir] as -1 | 0 | 1;
  return { x, y, held: step.press, pressed: step.press & ~lastHeld };
}

const seq = (dirs: number[], press: number): Step[] => dirs.map((dir, i) => ({ dir, press: i === dirs.length - 1 ? press : 0 }));
const BUTTONS = { P: [LP, MP, HP], K: [LK, MK, HK] } as const;

/** Pick a strength, leaning heavy as the CPU gets better. */
function strengthPick(cpu: Cpu): 0 | 1 | 2 {
  const r = cpu.rng();
  return r < 0.4 - cpu.level * 0.2 ? 0 : r < 0.75 ? 1 : 2;
}

/** The steps that perform a special, or null when this fighter cannot right now. */
function specialSteps(cpu: Cpu, f: FighterState, kind: string, strength: 0 | 1 | 2): Step[] | null {
  const s = f.def.specials.find(x => x.kind === kind);
  if (!s) return null;
  const button = BUTTONS[s.button][strength];
  switch (s.motion) {
    case 'qcf':
      return seq([2, 3, 6, 6], button);
    case 'qcb':
      return seq([2, 1, 4, 4], button);
    case 'dp':
      return seq([6, 2, 3, 3], button);
    case 'hcb':
      return seq([6, 3, 2, 1, 4, 4], button);
    case 'chargeBF':
      return charged(f, 'chargeBF') ? seq([6, 6], button) : null;
    case 'chargeDU':
      return charged(f, 'chargeDU') ? seq([8, 8], button) : null;
    case 'mash': {
      const out: Step[] = [];
      for (let i = 0; i < 6; i++) out.push({ dir: 5, press: button }, { dir: 5, press: 0 }, { dir: 5, press: 0 });
      return out;
    }
    case 'ppp':
      return seq([5, 5], LP | MP | HP);
  }
}

function threatKey(fight: FightState, o: FighterState): string {
  if (o.state === 'jump') return `jump${fight.clock - o.frame}`;
  if (o.state === 'attack' || o.state === 'special') return `atk${fight.clock - o.frame}`;
  const p = fight.projectiles.find(q => q.side === o.side);
  if (p) return `proj${fight.clock - p.t}`;
  return '';
}

/**
 * The CPU's hands for this frame. Call once per frame for the side it plays.
 */
export function cpuInput(cpu: Cpu, fight: FightState, side: 0 | 1): FrameInput {
  const f = fight.fighters[side];
  const o = fight.fighters[side === 0 ? 1 : 0];
  if (!f) return { x: 0, y: 0, held: 0, pressed: 0 };
  const out = (step: Step): FrameInput => {
    const inp = toInput(step, f.facing, cpu.lastHeld);
    cpu.lastHeld = inp.held;
    return inp;
  };
  if (fight.phase !== 'fight') {
    cpu.queue = [];
    return out({ dir: 5, press: 0 });
  }
  // Seeing stars: wiggle and mash, harder the better it is.
  if (f.state === 'dizzy') return out({ dir: cpu.rng() < 0.5 ? 4 : 6, press: cpu.rng() < 0.15 + cpu.level * 0.4 ? LP : 0 });
  if (!o) return bonusInput(cpu, fight, f, out);
  if (cpu.queue.length) return out(cpu.queue.shift() as Step);

  const dist = Math.abs(o.x - f.x);
  const lv = cpu.level;
  const charger = f.def.specials.some(s => s.motion === 'chargeBF' || s.motion === 'chargeDU');
  // Chargers sit back to charge, which also guards; everyone else stands
  // neutral or creeps in, guarding between moves only as often as the
  // difficulty allows.
  const idleHold = charger
    ? f.def.specials.some(s => s.motion === 'chargeDU') && cpu.rng() < 0.5
      ? 1
      : 4
    : cpu.rng() < lv * 0.5
      ? 4
      : 5;

  // --- Defence: something is coming. ---
  const key = threatKey(fight, o);
  if (key && key !== cpu.seen) {
    cpu.seen = key;
    cpu.react = Math.round(16 - lv * 12 + cpu.rng() * 6);
    cpu.willGuard = cpu.rng() < 0.35 + lv * 0.55;
  }
  if (!key) cpu.seen = '';
  const free = f.state === 'stand' || f.state === 'walk' || f.state === 'crouch' || f.state === 'guard' || f.state === 'blockstun';
  if (key && free) {
    if (cpu.react > 0) {
      cpu.react--;
      return out({ dir: cpu.hold, press: 0 });
    }
    // A jump-in: anti-air it, or guard high.
    if (o.state === 'jump' && dist < 130) {
      const coming = o.vy < 1 && dist < 100;
      if (coming && cpu.rng() < 0.2 + lv * 0.6) {
        const aa =
          specialSteps(cpu, f, 'rising', 2) ??
          specialSteps(cpu, f, 'flip', 2) ??
          seq([2], HP);
        cpu.queue = aa.slice(1);
        cpu.seen = key + 'answered';
        return out(aa[0]);
      }
      if (cpu.willGuard) return out({ dir: 4, press: 0 });
    }
    // A projectile: clash it, jump it, or guard.
    const proj = fight.projectiles.find(p => p.side !== side && Math.abs(p.x - f.x) < 150 && Math.sign(p.vx) === -f.facing);
    if (proj) {
      const r = cpu.rng();
      if (r < lv * 0.3 && !f.projectileOut) {
        const fire = specialSteps(cpu, f, 'projectile', strengthPick(cpu));
        if (fire) {
          cpu.queue = fire.slice(1);
          return out(fire[0]);
        }
      }
      if (r < 0.15 + lv * 0.25 && Math.abs(proj.x - f.x) > 60 && proj.guard !== 'low') {
        cpu.queue = [{ dir: 9, press: 0 }, { dir: 9, press: 0 }];
        return out({ dir: 9, press: 0 });
      }
      if (cpu.willGuard) return out({ dir: proj.guard === 'low' ? 1 : 4, press: 0 });
    }
    // A normal or special in range.
    if ((o.state === 'attack' || o.state === 'special') && dist < 120 && cpu.willGuard) {
      const low = o.action?.normal?.guard === 'low' || o.action?.special?.guard === 'low' || (o.action?.posture === 'crouch');
      return out({ dir: low ? 1 : 4, press: 0 });
    }
  }

  if (!(f.state === 'stand' || f.state === 'walk' || f.state === 'crouch' || f.state === 'guard')) return out({ dir: idleHold, press: 0 });

  // --- Punish: the opponent is stuck in a recovery. ---
  const recovering =
    (o.state === 'attack' && o.action?.normal && o.frame >= o.action.normal.startup + o.action.normal.active) ||
    (o.state === 'special' && o.action && o.action.t > 20) ||
    o.state === 'land' ||
    o.state === 'dizzy';
  if (recovering && dist < 90 && cpu.rng() < 0.15 + lv * 0.6) {
    const big = specialSteps(cpu, f, 'rising', 2) ?? specialSteps(cpu, f, 'rush', 2) ?? specialSteps(cpu, f, 'grab', 2);
    if (big && cpu.rng() < 0.5) {
      cpu.queue = big.slice(1);
      return out(big[0]);
    }
    cpu.queue = [{ dir: 2, press: 0 }];
    return out({ dir: 2, press: cpu.rng() < 0.5 ? HK : MK });
  }

  if (cpu.wait > 0) {
    cpu.wait--;
    // Drift toward a comfortable range between decisions.
    const want = charger ? 110 : specialOf(f.def, 'grab') ? 40 : 80;
    if (dist > want + 30 && cpu.rng() < 0.7) return out({ dir: charger ? idleHold : 6, press: 0 });
    return out({ dir: cpu.hold, press: 0 });
  }
  cpu.wait = Math.round(14 - lv * 9 + cpu.rng() * 10);
  cpu.hold = idleHold;
  const r = cpu.rng();

  // --- Offence, by range. ---
  if (dist > 170) {
    if (specialOf(f.def, 'projectile') && !f.projectileOut && r < 0.25 + lv * 0.35) {
      const fire = specialSteps(cpu, f, 'projectile', strengthPick(cpu));
      if (fire) {
        cpu.queue = fire.slice(1);
        return out(fire[0]);
      }
    }
    if (r < 0.15 + lv * 0.1) {
      cpu.queue = [{ dir: 9, press: 0 }];
      return out({ dir: 9, press: 0 });
    }
    cpu.hold = charger && r < 0.6 ? idleHold : 6;
    return out({ dir: cpu.hold, press: 0 });
  }
  if (dist > 85) {
    if (r < (specialOf(f.def, 'grab') ? 0.32 : 0.18)) {
      // A jump-in with a heavy kick timed for the descent.
      cpu.queue = [{ dir: 9, press: 0 }, ...Array.from({ length: 22 }, () => ({ dir: 5, press: 0 })), { dir: 5, press: HK }];
      return out({ dir: 9, press: 0 });
    }
    const rush = specialSteps(cpu, f, 'rush', strengthPick(cpu)) ?? specialSteps(cpu, f, 'spin', strengthPick(cpu));
    if (rush && r < 0.3 + lv * 0.15) {
      cpu.queue = rush.slice(1);
      return out(rush[0]);
    }
    if (specialOf(f.def, 'projectile') && !f.projectileOut && r < 0.5) {
      const fire = specialSteps(cpu, f, 'projectile', strengthPick(cpu));
      if (fire) {
        cpu.queue = fire.slice(1);
        return out(fire[0]);
      }
    }
    if (r < 0.65) return out({ dir: 2, press: MK });
    if (r < 0.75) return out({ dir: 5, press: HK });
    cpu.hold = charger ? idleHold : 6;
    return out({ dir: 6, press: 0 });
  }
  // Close: throws, pressure and cancels.
  const throwable = o.state === 'stand' || o.state === 'walk' || o.state === 'crouch' || o.state === 'guard';
  // A grappler lives for the grab; everyone else throws now and then.
  const grappler = !!specialOf(f.def, 'grab');
  const grabRange = grappler ? 60 : 44;
  if (throwable && dist < grabRange && r < (grappler ? 0.35 : 0.12) + lv * 0.25 && hurtboxes(o).length > 0 && !isAirborne(o)) {
    const grab = specialSteps(cpu, f, 'grab', 2);
    if (grab) {
      cpu.queue = grab.slice(1);
      return out(grab[0]);
    }
    return out({ dir: 6, press: HP });
  }
  if (r < 0.3) {
    const rapid = specialSteps(cpu, f, 'rapid', strengthPick(cpu)) ?? specialSteps(cpu, f, 'lariat', 0) ?? specialSteps(cpu, f, 'breath', 1);
    if (rapid && cpu.rng() < 0.6) {
      cpu.queue = rapid.slice(1);
      return out(rapid[0]);
    }
  }
  if (r < 0.55) {
    // Crouching medium kick, cancelled into a special when it has one: the bread and butter.
    const finisher = specialSteps(cpu, f, 'projectile', 2) ?? specialSteps(cpu, f, 'rising', 0);
    if (finisher && cpu.rng() < lv) cpu.queue = [{ dir: 2, press: 0 }, { dir: 2, press: 0 }, ...finisher];
    return out({ dir: 2, press: MK });
  }
  if (r < 0.75) {
    cpu.queue = [{ dir: 2, press: 0 }, { dir: 2, press: 0 }, { dir: 2, press: 0 }, { dir: 2, press: 0 }, { dir: 2, press: 0 }, { dir: 2, press: LK }];
    return out({ dir: 2, press: LK });
  }
  if (r < 0.88) return out({ dir: 5, press: cpu.rng() < 0.5 ? HP : MP });
  if (r < 0.95) return out({ dir: 2, press: HK });
  cpu.hold = 4;
  return out({ dir: 4, press: 0 });
}

/** The CPU in a bonus stage (the attract demo): walk up and hit it. */
function bonusInput(cpu: Cpu, fight: FightState, f: FighterState, out: (s: Step) => FrameInput): FrameInput {
  if (cpu.queue.length) return out(cpu.queue.shift() as Step);
  const live = fight.targets.filter(t => t.hp > 0);
  if (!live.length) return out({ dir: 5, press: 0 });
  const t = live.reduce((a, b) => (Math.abs(a.x - f.x) < Math.abs(b.x - f.x) ? a : b));
  const gap = Math.abs(t.x - f.x) - t.w / 2;
  if (gap > 30) return out({ dir: 6, press: 0 });
  const presses = [HP, HK, MK, MP];
  cpu.queue = Array.from({ length: 10 }, () => ({ dir: t.y > 20 ? 5 : 2, press: 0 }));
  return out({ dir: t.y > 20 ? 5 : cpu.rng() < 0.5 ? 2 : 5, press: presses[Math.floor(cpu.rng() * presses.length)] });
}
