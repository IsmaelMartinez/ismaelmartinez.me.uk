import { describe, expect, it } from 'vitest';
import { cpuInput, createCpu } from '../../src/games/fighter/ai';
import { BONUS_AFTER, continueCredit, createArcade, createDemo, levelFor, tickArcade, type ArcadeEvent, type ArcadeState } from '../../src/games/fighter/arcade';
import { createBonus, createFight, hitbox, hurtboxes, tickFight, type FightEvent, type FightState, type FighterState } from '../../src/games/fighter/fight';
import { HK, HP, LK, LP, MK, MP, NO_INPUT, createBuffer, motionDone, numpad, pushFrame, type FrameInput } from '../../src/games/fighter/motion';
import { poseFor } from '../../src/games/fighter/poses';
import { BOSSES, FIGHTERS, SELECTABLE, type CharId } from '../../src/games/fighter/roster';
import { GLYPHS, normaliseText } from '../../src/games/football/font';
import { translations } from '../../src/i18n/translations';

const ALL: CharId[] = [...SELECTABLE, ...BOSSES];
const input = (x: number, y: number, pressed = 0, held = pressed): FrameInput => ({ x: x as -1 | 0 | 1, y: y as -1 | 0 | 1, held, pressed });

/** Run a fight to its live phase. */
function live(a: CharId = 'kenji', b: CharId = 'kenji'): FightState {
  const f = createFight(a, b);
  for (let i = 0; i < 400 && f.phase !== 'fight'; i++) tickFight(f, [NO_INPUT, NO_INPUT]);
  expect(f.phase).toBe('fight');
  return f;
}

/** Step a fight with fixed inputs, collecting events. */
function step(f: FightState, frames: number, p1: FrameInput = NO_INPUT, p2: FrameInput = NO_INPUT): FightEvent[] {
  const out: FightEvent[] = [];
  for (let i = 0; i < frames; i++) out.push(...tickFight(f, [p1, p2]));
  return out;
}

/** Feed a sequence of numpad steps (relative to facing right) to one side. */
function perform(f: FightState, side: 0 | 1, steps: { dir: number; press?: number }[]): FightEvent[] {
  const out: FightEvent[] = [];
  const H = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
  const V = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  for (const s of steps) {
    const facing = f.fighters[side]?.facing ?? 1;
    const inp = input(H[s.dir] * facing, V[s.dir], s.press ?? 0);
    out.push(...tickFight(f, side === 0 ? [inp, NO_INPUT] : [NO_INPUT, inp]));
  }
  return out;
}

describe('motion', () => {
  const feed = (dirs: number[], last = 5) => {
    const b = createBuffer();
    for (const d of dirs) pushFrame(b, d, 0);
    pushFrame(b, last, LP);
    return b;
  };

  it('reads numpad directions relative to facing', () => {
    expect(numpad(1, 0, 1)).toBe(6);
    expect(numpad(1, 0, -1)).toBe(4);
    expect(numpad(-1, 1, 1)).toBe(1);
    expect(numpad(0, -1, -1)).toBe(8);
  });

  it('reads a quarter circle forward, and not one backward', () => {
    expect(motionDone(feed([2, 3], 6), 'qcf', 'P')).toBe(true);
    expect(motionDone(feed([2, 1], 4), 'qcf', 'P')).toBe(false);
    expect(motionDone(feed([2, 1], 4), 'qcb', 'P')).toBe(true);
  });

  it('forgets a motion that took too long', () => {
    expect(motionDone(feed([2, ...Array(30).fill(3)], 6), 'qcf', 'P')).toBe(false);
  });

  it('needs a held charge before the release', () => {
    const short = createBuffer();
    for (let i = 0; i < 20; i++) pushFrame(short, 4, 0);
    pushFrame(short, 6, LP);
    expect(motionDone(short, 'chargeBF', 'P')).toBe(false);
    const long = createBuffer();
    for (let i = 0; i < 50; i++) pushFrame(long, 1, 0);
    pushFrame(long, 6, LP);
    expect(motionDone(long, 'chargeBF', 'P')).toBe(true);
  });

  it('reads a mash only after enough presses', () => {
    const b = createBuffer();
    for (let i = 0; i < 3; i++) {
      pushFrame(b, 5, LK);
      pushFrame(b, 5, 0);
    }
    expect(motionDone(b, 'mash', 'K')).toBe(false);
    pushFrame(b, 5, MK);
    expect(motionDone(b, 'mash', 'K')).toBe(true);
    expect(motionDone(b, 'mash', 'P')).toBe(false);
  });
});

describe('the fight', () => {
  it('throws a fireball from a quarter circle and a punch', () => {
    const f = live();
    const ev = perform(f, 0, [{ dir: 2 }, { dir: 3 }, { dir: 6, press: HP }]);
    expect(ev.some(e => e.type === 'special' && e.kind === 'projectile')).toBe(true);
    step(f, 20);
    expect(f.projectiles).toHaveLength(1);
    expect(f.projectiles[0].side).toBe(0);
  });

  it('lets only one of a fighter’s projectiles be on screen', () => {
    const f = live();
    perform(f, 0, [{ dir: 2 }, { dir: 3 }, { dir: 6, press: LP }]);
    step(f, 50);
    perform(f, 0, [{ dir: 2 }, { dir: 3 }, { dir: 6, press: LP }]);
    step(f, 20);
    expect(f.projectiles.length).toBeLessThanOrEqual(1);
  });

  it('cancels two fireballs that meet', () => {
    const f = live();
    const fire = [{ dir: 2 }, { dir: 3 }, { dir: 6, press: MP }];
    const H = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
    const V = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
    const evs: FightEvent[] = [];
    for (const s of fire) {
      const a = input(H[s.dir] * f.fighters[0].facing, V[s.dir], s.press ?? 0);
      const b = input(H[s.dir] * (f.fighters[1] as FighterState).facing, V[s.dir], s.press ?? 0);
      evs.push(...tickFight(f, [a, b]));
    }
    evs.push(...step(f, 80));
    expect(evs.some(e => e.type === 'clash')).toBe(true);
    expect(f.fighters[0].health).toBe(f.fighters[0].def.health);
  });

  it('blocks a standing attack by holding back, and loses nothing to a normal', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 50;
    const back = input(1, 0);
    const ev = [...tickFight(f, [input(0, 0, HP), back]), ...step(f, 12, NO_INPUT, back)];
    const hit = ev.find(e => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.blocked).toBe(true);
    expect(b.health).toBe(b.def.health);
  });

  it('makes a low kick go through a standing guard', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 55;
    const back = input(1, 0);
    step(f, 14, input(0, 1, MK), back);
    expect(b.health).toBeLessThan(b.def.health);
  });

  it('makes a jumping attack go through a crouching guard', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 100;
    const downBack = input(1, 1);
    step(f, 1, input(1, -1), downBack);
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) {
      const ev = tickFight(f, [i === 30 ? input(0, 0, HK) : NO_INPUT, downBack]);
      hit = ev.some(e => e.type === 'hit' && !e.blocked);
    }
    expect(hit).toBe(true);
  });

  it('chips a special through a guard', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 120;
    perform(f, 0, [{ dir: 2 }, { dir: 3 }, { dir: 6, press: HP }]);
    const ev = step(f, 60, NO_INPUT, input(1, 0));
    const hit = ev.find(e => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.blocked).toBe(true);
    expect(b.health).toBeLessThan(b.def.health);
  });

  it('throws an opponent standing close, and the throw cannot be blocked', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 36;
    const ev = [...tickFight(f, [input(1, 0, HP), input(1, 0)]), ...step(f, 30, NO_INPUT, input(1, 0))];
    expect(ev.some(e => e.type === 'throw')).toBe(true);
    expect(b.health).toBe(b.def.health - 22);
  });

  it('cannot hit a fighter on the floor or getting up', () => {
    const f = live();
    const b = f.fighters[1] as FighterState;
    b.state = 'down';
    expect(hurtboxes(b)).toHaveLength(0);
    b.state = 'getup';
    expect(hurtboxes(b)).toHaveLength(0);
  });

  it('sweeps a standing opponent off his feet', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 60;
    const ev = step(f, 80, input(0, 1, HK));
    expect(ev.some(e => e.type === 'knockdown' && e.side === 1)).toBe(true);
  });

  it('cancels a normal that connects into a special: the combo', () => {
    const f = live();
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 46;
    // Crouching medium kick, then the fireball motion finished inside its hitstop.
    const ev = perform(f, 0, [{ dir: 2, press: MK }, { dir: 2 }, { dir: 2 }, { dir: 2 }, { dir: 2 }, { dir: 2 }, { dir: 3 }, { dir: 6, press: HP }]);
    ev.push(...step(f, 40));
    expect(ev.filter(e => e.type === 'hit' && !e.blocked).length).toBeGreaterThanOrEqual(2);
    expect(ev.some(e => e.type === 'combo' && e.hits >= 2)).toBe(true);
  });

  it('leaves a fighter dizzy after enough hits in a short time', () => {
    const f = live();
    const b = f.fighters[1] as FighterState;
    b.stunPoints = b.def.stunMax - 1;
    const a = f.fighters[0];
    b.x = a.x + 46;
    const ev = step(f, 60, input(0, 0, HP));
    expect(ev.some(e => e.type === 'dizzy' && e.side === 1)).toBe(true);
  });

  it('decides a timed-out round on health', () => {
    const f = live();
    (f.fighters[1] as FighterState).health = 50;
    f.timer = 1;
    const ev = step(f, 400);
    const end = ev.find(e => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(0);
  });

  it('pays every point it says it pays: hit points plus the round bonus', () => {
    const f = live();
    const ev = step(f, 1);
    void ev;
    (f.fighters[1] as FighterState).health = 1;
    const [a, b] = f.fighters as [FighterState, FighterState];
    b.x = a.x + 46;
    const all = step(f, 400, input(0, 0, LP));
    const paid = all.reduce((n, e) => n + (e.type === 'points' && e.side === 0 ? e.points : 0) + (e.type === 'roundBonus' && e.side === 0 ? e.time + e.vitality + e.perfect : 0), 0);
    expect(paid).toBe(f.points[0]);
    expect(all.some(e => e.type === 'roundBonus' && e.side === 0 && e.perfect > 0)).toBe(true);
  });

  it('every special of every fighter can come out and hit something', () => {
    for (const id of ALL) {
      for (const s of FIGHTERS[id].specials) {
        const f = live(id, 'kenji');
        const [a, b] = f.fighters as [FighterState, FighterState];
        const reach: Record<string, number> = { projectile: 140, rush: 110, spin: 70 };
        b.x = a.x + (reach[s.kind] ?? 42);
        // Charge first, then the motion.
        const charge = s.motion === 'chargeBF' ? 60 : s.motion === 'chargeDU' ? 60 : 0;
        const holdDir = s.motion === 'chargeBF' ? 1 : 2;
        const btn = s.button === 'P' ? HP : HK;
        const seqs: Record<string, { dir: number; press?: number }[]> = {
          qcf: [{ dir: 2 }, { dir: 3 }, { dir: 6, press: btn }],
          qcb: [{ dir: 2 }, { dir: 1 }, { dir: 4, press: btn }],
          dp: [{ dir: 6 }, { dir: 2 }, { dir: 3, press: btn }],
          hcb: [{ dir: 6 }, { dir: 3 }, { dir: 2 }, { dir: 1 }, { dir: 4, press: btn }],
          chargeBF: [...Array(charge).fill({ dir: holdDir }), { dir: 6, press: btn }],
          chargeDU: [...Array(charge).fill({ dir: holdDir }), { dir: 8, press: btn }],
          mash: Array.from({ length: 10 }, (_, i) => ({ dir: 5, press: i % 2 ? 0 : s.button === 'P' ? LP : LK })),
          ppp: [{ dir: 5, press: LP | MP | HP }]
        };
        const ev = perform(f, 0, seqs[s.motion]);
        ev.push(...step(f, 90));
        const fired = ev.some(e => e.type === 'special' && e.side === 0 && e.kind === s.kind);
        expect(fired, `${id} ${s.name}`).toBe(true);
        expect(b.health, `${id} ${s.name} lands`).toBeLessThan(b.def.health);
      }
    }
  });
});

describe('the bonus stages', () => {
  it('pays a clear bonus when every target is broken, and runs out of time otherwise', () => {
    for (const kind of ['car', 'drums'] as const) {
      const f = createBonus('kenji', kind);
      const cpu = createCpu(0.9, 3);
      let end: FightEvent | undefined;
      for (let i = 0; i < 60 * 60 && !end; i++) end = tickFight(f, [cpuInput(cpu, f, 0), NO_INPUT]).find(e => e.type === 'bonusEnd');
      expect(end, kind).toBeDefined();
      if (end?.type === 'bonusEnd' && end.cleared) expect(end.bonus).toBeGreaterThan(0);
      const idle = createBonus('kenji', kind);
      let over: FightEvent | undefined;
      for (let i = 0; i < 60 * 60 && !over; i++) over = tickFight(idle, [NO_INPUT, NO_INPUT]).find(e => e.type === 'bonusEnd');
      expect(over?.type === 'bonusEnd' && over.cleared).toBe(false);
    }
  });
});

/** A whole credit, with a CPU in the player's seat. */
function playCredit(level: number, seed: number, maxContinues: number) {
  const s = createArcade('arcade', seed);
  const hands = createCpu(level, seed + 99);
  const events: ArcadeEvent[] = [];
  const credits: { score: number; won: boolean }[] = [];
  const bonusAt: number[] = [];
  // A literal runaway guard, independent of anything under test.
  for (let frame = 0; frame < 60 * 60 * 120; frame++) {
    let p1: FrameInput = NO_INPUT;
    if (s.screen === 'select') p1 = frame % 2 ? input(0, 0, LP) : NO_INPUT;
    else if ((s.screen === 'fight' || s.screen === 'bonus') && s.fight) p1 = cpuInput(hands, s.fight, 0);
    const ev = tickArcade(s, [p1, NO_INPUT]);
    events.push(...ev);
    for (const e of ev) {
      if (e.type === 'screen' && e.screen === 'bonus') bonusAt.push(s.stage);
      if (e.type === 'creditOver') credits.push({ score: e.score, won: e.won });
    }
    if (s.screen === 'continue') {
      if (credits.length > maxContinues) break;
      events.push(...continueCredit(s));
    }
    if (s.screen === 'ending') break;
  }
  return { s, events, credits, bonusAt };
}

describe('the arcade ladder', () => {
  it('plays a whole tour to the ending, with the bonus stages after the third, sixth and ninth wins', () => {
    const { s, credits, bonusAt } = playCredit(0.95, 7, 40);
    expect(s.screen).toBe('ending');
    expect(s.stage).toBe(11);
    expect(bonusAt).toEqual(Object.keys(BONUS_AFTER).map(Number));
    const last = credits[credits.length - 1];
    expect(last.won).toBe(true);
    // The winning credit's score is what the board is handed.
    expect(last.score).toBe(s.score);
    expect(last.score).toBeGreaterThan(0);
  });

  it('meets the seven other world warriors before the four bosses, in that order', () => {
    const s = createArcade('arcade', 3);
    for (let i = 0; i < 200 && s.ladder.length === 0; i++) tickArcade(s, [i % 2 ? input(0, 0, LP) : NO_INPUT, NO_INPUT]);
    expect(s.ladder).toHaveLength(11);
    expect(s.ladder.slice(7)).toEqual(BOSSES);
    expect(new Set(s.ladder.slice(0, 7))).toEqual(new Set(SELECTABLE.filter(id => id !== s.chosen[0])));
  });

  it('beats a player who does nothing, inside two minutes of fighting, and ends the credit', () => {
    const s = createArcade('arcade', 11);
    let over: ArcadeEvent | undefined;
    for (let i = 0; i < 60 * 180 && !over; i++) {
      over = tickArcade(s, [s.screen === 'select' && i % 2 ? input(0, 0, LP) : NO_INPUT, NO_INPUT]).find(e => e.type === 'creditOver');
    }
    expect(over?.type === 'creditOver' && over.won).toBe(false);
    expect(s.screen).toBe('continue');
  });

  it('continues against the same opponent with the score back at zero', () => {
    const s = createArcade('arcade', 11);
    for (let i = 0; i < 60 * 180 && s.screen !== 'continue'; i++) tickArcade(s, [s.screen === 'select' && i % 2 ? input(0, 0, LP) : NO_INPUT, NO_INPUT]);
    const stage = s.stage;
    s.score = 1234;
    continueCredit(s);
    expect(s.score).toBe(0);
    expect(s.stage).toBe(stage);
    expect(s.continues).toBe(1);
    expect(s.screen).toBe('versus');
  });

  it('ramps the CPU from gentle to a wall', () => {
    expect(levelFor(0)).toBeLessThan(0.3);
    expect(levelFor(10)).toBeGreaterThan(0.85);
  });

  it('the attract demo plays itself and never scores', () => {
    const s: ArcadeState = createDemo(5);
    for (let i = 0; i < 60 * 60; i++) tickArcade(s, [input(1, 0, HP), NO_INPUT]);
    expect(s.score).toBe(0);
    expect(s.screen).toBe('demo');
  });

  it('a versus match goes from the select screen to the fight and back', () => {
    const s = createArcade('versus', 1);
    s.cursor[1] = 0;
    for (let i = 0; i < 400 && s.screen !== 'fight'; i++) tickArcade(s, [i === 2 ? input(0, 0, LP) : NO_INPUT, i === 4 ? input(0, 0, LK) : NO_INPUT]);
    expect(s.screen).toBe('fight');
    // A mirror match wears the other colours.
    expect(s.chosen[0]).toBe(s.chosen[1]);
    expect(s.alt[0]).not.toBe(s.alt[1]);
    const a = createCpu(0.8, 1);
    const b = createCpu(0.8, 2);
    for (let i = 0; i < 60 * 60 * 6 && s.screen !== 'select'; i++) {
      const f = s.fight as FightState;
      tickArcade(s, s.screen === 'fight' ? [cpuInput(a, f, 0), cpuInput(b, f, 1)] : [NO_INPUT, NO_INPUT]);
    }
    expect(s.screen).toBe('select');
    expect(s.score).toBe(0);
  });
});

describe('CPU against CPU', () => {
  it('finishes every pairing, and keeps the cast within a band of each other', () => {
    // Every fighter against every other on both sides, at one difficulty: a
    // world warrior who wins most of these, or almost none, is the one a
    // player meets on the ladder and calls cheap (or never picks).
    const wins: Record<string, number> = {};
    const games: Record<string, number> = {};
    for (let i = 0; i < ALL.length; i++) {
      for (let j = 0; j < ALL.length; j++) {
        if (i === j) continue;
        const f = createFight(ALL[i], ALL[j]);
        const c0 = createCpu(0.7, i * 31 + j * 7);
        const c1 = createCpu(0.7, i * 17 + j * 3 + 99);
        for (let t = 0; t < 60 * 60 * 8 && f.phase !== 'matchEnd'; t++) tickFight(f, [cpuInput(c0, f, 0), cpuInput(c1, f, 1)]);
        expect(f.phase, `${ALL[i]} vs ${ALL[j]}`).toBe('matchEnd');
        for (const id of [ALL[i], ALL[j]]) games[id] = (games[id] ?? 0) + 1;
        if (f.winner !== null) {
          const id = (f.fighters[f.winner] as FighterState).id;
          wins[id] = (wins[id] ?? 0) + 1;
        }
      }
    }
    for (const id of SELECTABLE) {
      const rate = (wins[id] ?? 0) / games[id];
      expect(rate, id).toBeGreaterThan(0.2);
      expect(rate, id).toBeLessThan(0.8);
    }
    for (const id of BOSSES) expect((wins[id] ?? 0) / games[id], id).toBeGreaterThan(0.4);
  });
});

describe('the pictures', () => {
  it('has a pose for every state every fighter can be in, with no joint lost', () => {
    for (const id of ALL) {
      const f = createFight(id, 'kenji').fighters[0];
      for (const state of ['stand', 'walk', 'guard', 'crouch', 'prejump', 'jump', 'land', 'blockstun', 'hitstun', 'fall', 'down', 'getup', 'dizzy', 'throw', 'thrown', 'ko', 'win', 'lose'] as const) {
        f.state = state;
        for (let t = 0; t < 40; t += 7) {
          f.frame = t;
          const p = poseFor(f, t);
          for (const v of [p.x, p.y, p.rot, p.lean, p.head, ...p.aN, ...p.aF, ...p.lN, ...p.lF]) expect(Number.isFinite(v), `${id} ${state}`).toBe(true);
        }
      }
    }
  });

  it('a hitbox only exists on active frames', () => {
    const f = live();
    const a = f.fighters[0];
    tickFight(f, [input(0, 0, HP), NO_INPUT]);
    expect(hitbox(a)).toBeNull();
    step(f, 6);
    expect(hitbox(a)).not.toBeNull();
    step(f, 10);
    expect(hitbox(a)).toBeNull();
  });

  it('can draw every word it puts on screen, in every locale', () => {
    for (const locale of ['en', 'es', 'cat'] as const) {
      const dict = translations[locale] as Record<string, string>;
      for (const [key, value] of Object.entries(dict)) {
        if (!key.startsWith('fun.fighter.label.') && !key.startsWith('fun.fighter.quote.') && !key.startsWith('fun.fighter.ending.')) continue;
        for (const ch of normaliseText(value)) expect(GLYPHS[ch], `${locale} ${key} "${ch}"`).toBeDefined();
      }
    }
    for (const id of ALL) for (const ch of FIGHTERS[id].name) expect(GLYPHS[ch]).toBeDefined();
  });
});

void MK;
void LK;
