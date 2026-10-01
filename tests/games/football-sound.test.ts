/**
 * CALCIO '90's match sound (`sound.ts`) and the strike stream it is driven by.
 *
 * The match raises a `strike` for every touch that sends the ball away, and
 * the shots it used to keep only in its log; `sound.ts` turns those, and the
 * stand's tension, into effects-channel audio. The graph assertions read the
 * recording context's log (`audio-graph.ts`), so a sound is identified by
 * what it builds: a whistle is a ~3 kHz tone with a square trill on it, a
 * shot a band-passed crack, and so on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameAudio, type GameAudio } from '../../src/games/engine/audio';
import {
  createMatch,
  shoot,
  tickMatch,
  VOLLEY_Z,
  type MatchEvent,
  type MatchState
} from '../../src/games/football/match';
import { BOX_DEPTH, CENTRE_X, CENTRE_Y, PITCH_L, PITCH_W } from '../../src/games/football/pitch';
import { createMatchSound, playTension, type MatchSoundName } from '../../src/games/football/sound';
import { teamByCode } from '../../src/games/football/teams';
import { FOOTBALL_MUSIC } from '../../src/games/football/music';
import { installRecordingContext, makeRecordingContext, type RecordingContext } from './audio-graph';
import { installLocalStorage } from './dom-helpers';
import { competent } from './football-policies';
import { seededRandom } from './seeded-random';

const DT = 1 / 60;
const TEAMS = [teamByCode('ENG'), teamByCode('ESP')] as [ReturnType<typeof teamByCode>, ReturnType<typeof teamByCode>];

function fresh(seed = 7): MatchState {
  return createMatch({ rng: seededRandom(seed), difficulty: 0.45, teams: TEAMS });
}

/** A stand-in for the engine whose effects bus is the recording context's destination. */
function fakeAudio(ctx: RecordingContext, muted = { value: false }): GameAudio {
  return {
    isSfxMuted: () => muted.value,
    effectsBus: () => ({ ctx: ctx as unknown as BaseAudioContext, out: ctx.destination as unknown as AudioNode, level: 0.1 })
  } as unknown as GameAudio;
}

/** The first value a param was set to, per node, for nodes whose id starts `kind`. */
function firstSets(log: string[], kind: string, param: string): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  for (const line of log) {
    const m = new RegExp(`^(${kind}#\\d+)\\.${param}\\.setValueAtTime\\(([^,]+),`).exec(line);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(Number(m[2]));
  }
  return out;
}

const typesOf = (log: string[], kind: string) =>
  log.filter(l => new RegExp(`^${kind}#\\d+\\.type = `).test(l)).map(l => l.split(' = ')[1]);

describe('the strike stream', () => {
  it('hands out a strike for the touches of a whole match, and every shot with it', () => {
    const m = fresh();
    const policy = competent();
    const events: MatchEvent[] = [];
    for (let i = 0; i < 60 * 240 && m.phase !== 'over'; i++) events.push(...tickMatch(m, DT, policy(m, DT)));
    const kinds = new Set(events.flatMap(e => (e.type === 'strike' ? [e.kind] : [])));
    for (const kind of ['pass', 'loft', 'shot', 'clear', 'throw'] as const) expect(kinds, kind).toContain(kind);
    // The shots used to stay in the log, so nothing listening to the tick heard one.
    const shots = events.filter(e => e.type === 'shot').length;
    expect(shots).toBe(m.stats.shots[0] + m.stats.shots[1]);
    expect(shots).toBeGreaterThan(0);
  });

  it('calls a strike off the deck a shot and one met in the air a header', () => {
    for (const [z, kind] of [
      [0, 'shot'],
      [VOLLEY_Z + 1, 'header']
    ] as const) {
      const m = fresh();
      m.phase = 'play';
      m.owner = { side: 0, idx: 6 };
      m.ball.z = z;
      shoot(m, 0, 1, 0, z > 0 ? 'header' : 'ground');
      expect(m.log.filter(e => e.type === 'strike').at(-1)).toEqual({ type: 'strike', side: 0, kind });
    }
  });

  it('calls whatever is taken from a throw-in a throw', () => {
    const m = fresh();
    m.phase = 'play';
    m.phaseTimer = 0;
    m.owner = null;
    m.kickGrace = null;
    m.ball.x = -2;
    m.ball.y = CENTRE_Y;
    m.ball.vx = 0;
    m.ball.vy = 0;
    m.lastTouch = 0;
    const events: MatchEvent[] = [];
    for (let i = 0; i < 600 && !events.some(e => e.type === 'strike'); i++) events.push(...tickMatch(m, DT));
    expect(events.find(e => e.type === 'restart')).toMatchObject({ kind: 'throwIn' });
    expect(events.find(e => e.type === 'strike')).toMatchObject({ kind: 'throw' });
  });
});

describe('the stand follows the ball', () => {
  const inPlay = (x: number, y: number): MatchState => {
    const m = fresh();
    m.phase = 'play';
    m.owner = null;
    m.ball.x = x;
    m.ball.y = y;
    return m;
  };

  it('murmurs at a stoppage', () => {
    const m = inPlay(CENTRE_X, PITCH_L - 20);
    m.phase = 'restart';
    expect(playTension(m)).toBe(0);
  });

  it('climbs from midfield towards either box, the same at both ends', () => {
    const mid = playTension(inPlay(CENTRE_X, CENTRE_Y));
    const near = playTension(inPlay(CENTRE_X, PITCH_L - BOX_DEPTH - 40));
    const far = playTension(inPlay(CENTRE_X, BOX_DEPTH + 40));
    expect(mid).toBeCloseTo(0.15, 6);
    expect(near).toBeGreaterThan(mid);
    expect(far).toBeCloseTo(near, 6);
    expect(playTension(inPlay(CENTRE_X, PITCH_L - 20))).toBe(0.75);
    expect(playTension(inPlay(CENTRE_X, 20))).toBe(0.75);
  });

  it('is on its feet when the player has a shot armed', () => {
    const m = inPlay(CENTRE_X, CENTRE_Y);
    const goalY = m.swapped ? 0 : PITCH_L;
    const dir = m.swapped ? -1 : 1;
    const p = m.players[0][6];
    p.x = CENTRE_X;
    p.y = goalY - dir * 50;
    m.ball.x = p.x;
    m.ball.y = p.y;
    m.owner = { side: 0, idx: 6 };
    m.controlled = 6;
    expect(playTension(m)).toBe(0.9);
  });

  it('does not count the touchlines as a box', () => {
    expect(playTension(inPlay(PITCH_W - 2, PITCH_L - 20))).toBeLessThan(0.75);
  });
});

describe('the match sounds', () => {
  let ctx: RecordingContext;
  beforeEach(() => {
    ctx = makeRecordingContext();
  });

  const played = (name: MatchSoundName): string[] => {
    const c = makeRecordingContext();
    createMatchSound(fakeAudio(c)).play(name);
    return c.log;
  };

  it('strikes a shot with a band-passed crack over a falling thump', () => {
    const log = played('shot');
    expect(typesOf(log, 'filter')).toEqual(['bandpass']);
    const [hz] = firstSets(log, 'filter', 'frequency');
    expect(hz).toBeGreaterThan(2000);
    expect(firstSets(log, 'osc', 'frequency')[0]).toBeGreaterThan(120);
  });

  it('knocks a header on a triangle, duller than a pass', () => {
    expect(typesOf(played('header'), 'osc')).toEqual(['triangle']);
    expect(typesOf(played('pass'), 'osc')).toEqual(['sine']);
    expect(firstSets(played('header'), 'filter', 'frequency')[0]).toBeLessThan(
      firstSets(played('pass'), 'filter', 'frequency')[0]
    );
  });

  it('slaps a parry and smothers a catch', () => {
    expect(typesOf(played('save'), 'filter')).toEqual(['bandpass']);
    expect(typesOf(played('catch'), 'filter')).toEqual(['lowpass']);
    expect(firstSets(played('catch'), 'filter', 'frequency')[0]).toBeLessThan(700);
  });

  it('rings the woodwork on an inharmonic pair', () => {
    const hz = firstSets(played('post'), 'osc', 'frequency');
    expect(hz).toHaveLength(3);
    expect(hz[1] / hz[0]).toBeCloseTo(1530 / 640, 6);
  });

  it('blows the whistle once, twice for half time and three times at the end', () => {
    for (const [name, blasts] of [
      ['whistle', 1],
      ['whistle-half', 2],
      ['whistle-full', 3]
    ] as const) {
      const log = played(name);
      expect(typesOf(log, 'osc')).toEqual(['triangle', 'square']);
      expect(firstSets(log, 'osc', 'frequency')[0]).toBeGreaterThan(2500);
      const onsets = log.filter(l => /^gain#\d+\.gain\.linearRampToValueAtTime\((?!0,)/.test(l));
      expect(onsets, name).toHaveLength(blasts);
    }
  });

  it('varies a repeated strike, the same way for the same seed', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.play('pass');
    ctx.currentTime = 1;
    sound.play('pass');
    const [a, b] = firstSets(ctx.log, 'osc', 'frequency');
    expect(a).not.toBe(b);
    const again = makeRecordingContext();
    createMatchSound(fakeAudio(again)).play('pass');
    expect(firstSets(again.log, 'osc', 'frequency')[0]).toBe(a);
  });

  it('plays one of a sound per frame, however many the frame raised', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.play('pass');
    sound.play('pass');
    expect(firstSets(ctx.log, 'osc', 'frequency')).toHaveLength(1);
    sound.play('shot');
    expect(firstSets(ctx.log, 'osc', 'frequency')).toHaveLength(2);
  });

  it('builds nothing while the effects are muted', () => {
    const sound = createMatchSound(fakeAudio(ctx, { value: true }));
    sound.play('shot');
    sound.play('whistle');
    expect(ctx.log).toEqual([]);
  });
});

describe('the crowd bed', () => {
  let ctx: RecordingContext;
  beforeEach(() => {
    ctx = makeRecordingContext();
  });
  const loops = () => ctx.log.filter(l => /^source#\d+\.loop = true$/.test(l)).length;

  it('comes up once, as two looped noises at different rates', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.crowd.start();
    sound.crowd.start();
    expect(loops()).toBe(2);
    expect(sound.crowd.on).toBe(true);
    const rates = ctx.log.filter(l => /^source#\d+\.playbackRate\.setValueAtTime/.test(l));
    expect(new Set(rates.map(l => l.split('(')[1].split(',')[0])).size).toBe(2);
  });

  it('rises and brightens with the tension, and lets a hair of difference go', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.crowd.start();
    const targets = () => ctx.log.filter(l => l.includes('.setTargetAtTime(') && !l.startsWith('gain#1.'));
    const before = targets().length;
    sound.crowd.tension(1);
    const raised = targets().slice(before);
    expect(raised).toHaveLength(2);
    const level = Number(raised[0].split('(')[1].split(',')[0]);
    sound.crowd.tension(1.01);
    expect(targets().length).toBe(before + 2);
    sound.crowd.tension(0);
    const lowered = Number(targets().at(-2)!.split('(')[1].split(',')[0]);
    expect(lowered).toBeLessThan(level);
  });

  it('falls silent and stops its sources when stopped, and does not shout after', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.crowd.start();
    sound.crowd.stop(0.5);
    expect(sound.crowd.on).toBe(false);
    expect(ctx.log).toContain('gain#1.gain.setTargetAtTime(0, 0, 0.125)');
    expect(ctx.log.filter(l => /^(source|osc)#\d+\.stop\(0\.6\)$/.test(l))).toHaveLength(4);
    const length = ctx.log.length;
    sound.crowd.roar();
    sound.crowd.ooh();
    sound.crowd.groan();
    sound.crowd.tension(1);
    expect(ctx.log.length).toBe(length);
  });

  it('roars brighter and longer than it says ooh, and through the bed so a stop takes both', () => {
    const sound = createMatchSound(fakeAudio(ctx));
    sound.crowd.start();
    const from = ctx.log.length;
    sound.crowd.roar();
    const roar = ctx.log.slice(from);
    const mid = ctx.log.length;
    sound.crowd.ooh();
    const ooh = ctx.log.slice(mid);
    // Both feed the bed's master (gain#1), not the bus directly.
    expect(roar.some(l => /^gain#\d+\.connect\(gain#1\)$/.test(l))).toBe(true);
    expect(ooh.some(l => /^gain#\d+\.connect\(gain#1\)$/.test(l))).toBe(true);
    const stopAt = (log: string[]) => Number(/source#\d+\.stop\(([^)]+)\)/.exec(log.join('\n'))![1]);
    expect(stopAt(roar)).toBeGreaterThan(stopAt(ooh));
    expect(firstSets(roar, 'filter', 'frequency')[0]).toBeGreaterThan(firstSets(ooh, 'filter', 'frequency')[0]);
  });
});

describe('the match sound rides the effects channel', () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goes quiet on the effects toggle while the bed is sounding, and comes back on the next', () => {
    const ctx = makeRecordingContext();
    installRecordingContext(ctx);
    const audio = createGameAudio(FOOTBALL_MUSIC);
    const sound = createMatchSound(audio);
    sound.crowd.start();
    const bus = (audio.effectsBus()!.out as unknown as { __id: string }).__id;
    // The bed's master feeds the bus, and the bus the speakers.
    expect(ctx.log).toContain(`${bus}.connect(destination)`);
    expect(ctx.log.some(l => new RegExp(`^gain#\\d+\\.connect\\(${bus}\\)$`).test(l))).toBe(true);
    audio.setSfxMuted(true);
    expect(ctx.log.at(-1)).toBe(`${bus}.gain.setTargetAtTime(0, 0, 0.02)`);
    audio.setSfxMuted(false);
    expect(ctx.log.at(-1)).toBe(`${bus}.gain.setTargetAtTime(1, 0, 0.02)`);
    // Music muting does not reach it.
    audio.setMusicMuted(true);
    expect(ctx.log.filter(l => l.startsWith(`${bus}.gain.setTargetAtTime`))).toHaveLength(2);
    audio.dispose();
  });

  it('opens the bus closed when the effects were muted before it was built', () => {
    localStorage.setItem('arcade-sfx-muted', '1');
    const ctx = makeRecordingContext();
    installRecordingContext(ctx);
    const audio = createGameAudio(FOOTBALL_MUSIC);
    const bus = (audio.effectsBus()!.out as unknown as { __id: string }).__id;
    expect(ctx.log).toContain(`${bus}.gain.value = 0`);
    audio.dispose();
  });
});

describe('the sound leaves the match alone', () => {
  /** Plays a seeded match, optionally with every event and every frame's tension through the sound. */
  function play(withSound: boolean): string {
    const m = fresh(11);
    const policy = competent();
    const ctx = makeRecordingContext();
    const sound = createMatchSound(fakeAudio(ctx));
    if (withSound) sound.crowd.start();
    for (let i = 0; i < 60 * 120 && m.phase !== 'over'; i++) {
      const events = tickMatch(m, DT, policy(m, DT));
      if (!withSound) continue;
      ctx.currentTime += DT;
      for (const e of events) {
        if (e.type === 'strike') sound.play(e.kind);
        else if (e.type === 'goal') sound.crowd.roar();
        else if (e.type === 'save') sound.crowd.ooh();
      }
      sound.crowd.tension(playTension(m));
    }
    return JSON.stringify(m);
  }

  it('plays a seeded match out the same with the sound on as with it off', () => {
    expect(play(true)).toBe(play(false));
  });

  it('never draws from Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    play(true);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
