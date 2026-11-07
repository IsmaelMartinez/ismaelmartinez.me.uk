/**
 * The arcade around the fights: the select screen, the plane across the
 * world map, the VS screen, the eleven-fight ladder (the seven other world
 * warriors in a seeded order, then the four bosses), the car and the drums
 * after the third, sixth and ninth wins, the continue, the ending; and
 * two-player versus, which goes from the select screen straight to the fight
 * and back.
 *
 * DOM-free. `tickArcade(state, [p1, p2])` advances one frame and returns
 * events (the fight's own, forwarded, plus the arcade's), so a test can play
 * a whole credit headlessly with a CPU in the player's seat. The CPU the
 * player meets lives here, not in the page, and its difficulty is the
 * ladder's: `levelFor(stage)`.
 *
 * Scoring follows the arcade: points for every hit that lands, a time and a
 * vitality bonus for every round won, a perfect bonus, and the bonus stages.
 * A credit's score ends with the credit; continuing starts the next credit
 * at zero against the same opponent, so the board holds one credit's work.
 */
import { seededRng } from '../engine/math';
import { createCpu, cpuInput, type Cpu } from './ai';
import { createBonus, createFight, tickFight, type BonusKind, type FightEvent, type FightState } from './fight';
import { NO_INPUT, type FrameInput } from './motion';
import { BOSSES, SELECTABLE, type CharId } from './roster';

export type Screen = 'demo' | 'select' | 'map' | 'versus' | 'fight' | 'bonus' | 'quote' | 'continue' | 'ending';

export interface ArcadeState {
  mode: 'arcade' | 'versus';
  screen: Screen;
  frame: number;
  /** Grid cursors on the select screen, one per player; -1 once chosen. */
  cursor: [number, number];
  chosen: [CharId | null, CharId | null];
  /** Second colourway, picked with a kick on the select screen. */
  alt: [boolean, boolean];
  /** The player's opponents, in order. */
  ladder: CharId[];
  /** Index into the ladder of the next (or current) opponent. */
  stage: number;
  /** The bonus stage in progress, if any. */
  bonus: BonusKind | null;
  /** Bonus stages still owed, by the number of wins that earns them. */
  bonusDone: number[];
  score: number;
  continues: number;
  fight: FightState | null;
  cpu: Cpu | null;
  /** The demo's second CPU (attract mode). */
  cpu2: Cpu | null;
  /** Last stick position per player, for the select screen's edge-triggered moves. */
  lastDir: [string, string];
  /** Seconds left to choose. */
  selectTimer: number;
  /** The select screen's frame when every choice was in; 0 while choosing. */
  readyAt: number;
  /** The winner of the last match (0 or 1), for the quote screen. */
  lastWinner: 0 | 1 | null;
  seed: number;
  rng: () => number;
}

export type ArcadeEvent =
  | FightEvent
  | { type: 'cursor'; player: 0 | 1 }
  | { type: 'chosen'; player: 0 | 1; id: CharId }
  | { type: 'screen'; screen: Screen }
  | { type: 'score'; score: number }
  | { type: 'creditOver'; score: number; won: boolean };

/** Wins that earn a bonus stage, and which one. */
export const BONUS_AFTER: Record<number, BonusKind> = { 3: 'car', 6: 'drums', 9: 'car' };
/** Frames each interstitial screen holds. */
export const MAP_FRAMES = 170;
export const VERSUS_FRAMES = 150;
export const QUOTE_FRAMES = 220;
/** Frames before the ending accepts a button. */
export const ENDING_FRAMES = 720;
const SELECT_SECONDS = 30;

/** The CPU's difficulty at a rung of the ladder: gentle first fight, a wall at the top. */
export function levelFor(stage: number): number {
  return Math.min(0.95, 0.2 + stage * 0.07);
}

function baseState(mode: 'arcade' | 'versus', seed: number): ArcadeState {
  return {
    mode,
    screen: 'select',
    frame: 0,
    cursor: [0, 3],
    chosen: [null, null],
    alt: [false, false],
    ladder: [],
    stage: 0,
    bonus: null,
    bonusDone: [],
    score: 0,
    continues: 0,
    fight: null,
    cpu: null,
    cpu2: null,
    lastDir: ['', ''],
    selectTimer: SELECT_SECONDS,
    readyAt: 0,
    lastWinner: null,
    seed,
    rng: seededRng(seed)
  };
}

export function createArcade(mode: 'arcade' | 'versus', seed = 1): ArcadeState {
  return baseState(mode, seed);
}

/** Attract mode: two CPUs fight on a random stage, no score, no board. */
export function createDemo(seed = 1): ArcadeState {
  const s = baseState('arcade', seed);
  const a = SELECTABLE[Math.floor(s.rng() * SELECTABLE.length)];
  let b = SELECTABLE[Math.floor(s.rng() * SELECTABLE.length)];
  if (b === a) b = BOSSES[Math.floor(s.rng() * BOSSES.length)];
  s.screen = 'demo';
  s.chosen = [a, b];
  s.fight = createFight(a, b);
  s.cpu = createCpu(0.7, seed + 1);
  s.cpu2 = createCpu(0.7, seed + 2);
  return s;
}

/** The opponent of the current rung. */
export function opponent(s: ArcadeState): CharId | null {
  if (s.mode === 'versus') return s.chosen[1];
  return s.ladder[s.stage] ?? null;
}

function buildLadder(s: ArcadeState, player: CharId): CharId[] {
  const others = SELECTABLE.filter(id => id !== player);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(s.rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return [...others, ...BOSSES];
}

function go(s: ArcadeState, screen: Screen, out: ArcadeEvent[]): void {
  s.screen = screen;
  s.frame = 0;
  out.push({ type: 'screen', screen });
}

function startMatch(s: ArcadeState, out: ArcadeEvent[]): void {
  const p1 = s.chosen[0] as CharId;
  const p2 = opponent(s) as CharId;
  s.fight = createFight(p1, p2);
  s.bonus = null;
  if (s.mode === 'arcade') s.cpu = createCpu(levelFor(s.stage), s.seed * 31 + s.stage * 7 + s.continues);
  go(s, 'fight', out);
}

const dirKey = (i: FrameInput): string => `${i.x},${i.y}`;

function stepSelect(s: ArcadeState, inputs: readonly [FrameInput, FrameInput], out: ArcadeEvent[]): void {
  if (s.frame % 60 === 0 && s.frame > 0) s.selectTimer = Math.max(0, s.selectTimer - 1);
  const players: (0 | 1)[] = s.mode === 'versus' ? [0, 1] : [0];
  for (const p of players) {
    if (s.chosen[p]) continue;
    const inp = inputs[p];
    const key = dirKey(inp);
    if (key !== s.lastDir[p] && (inp.x || inp.y)) {
      const c = s.cursor[p];
      const row = Math.floor(c / 4);
      const col = c % 4;
      const ncol = (col + inp.x + 4) % 4;
      const nrow = inp.y ? 1 - row : row;
      s.cursor[p] = nrow * 4 + ncol;
      out.push({ type: 'cursor', player: p });
    }
    s.lastDir[p] = key;
    const timeUp = s.selectTimer === 0;
    if (inp.pressed || timeUp) {
      const id = SELECTABLE[s.cursor[p]];
      s.chosen[p] = id;
      s.alt[p] = (inp.pressed & 0b111000) !== 0 && (inp.pressed & 0b111) === 0;
      out.push({ type: 'chosen', player: p, id });
    }
  }
  const ready = s.mode === 'versus' ? s.chosen[0] && s.chosen[1] : s.chosen[0];
  if (!ready) return;
  // A held beat on the choice before moving on.
  if (!s.readyAt) s.readyAt = s.frame;
  if (s.frame - s.readyAt < 45) return;
  s.readyAt = 0;
  if (s.mode === 'arcade' && s.ladder.length === 0) s.ladder = buildLadder(s, s.chosen[0] as CharId);
  // A mirror match wears the other colours, as the arcade's did.
  if (s.mode === 'versus' && s.chosen[0] === s.chosen[1] && s.alt[0] === s.alt[1]) s.alt[1] = !s.alt[0];
  go(s, s.mode === 'versus' ? 'versus' : 'map', out);
}

/**
 * Advance one frame. In arcade mode only `inputs[0]` is read (the CPU plays
 * side 1); in versus both are; in the demo neither.
 */
export function tickArcade(s: ArcadeState, inputs: readonly [FrameInput, FrameInput]): ArcadeEvent[] {
  const out: ArcadeEvent[] = [];
  s.frame++;
  switch (s.screen) {
    case 'select':
      stepSelect(s, inputs, out);
      break;
    case 'map':
      if (s.frame >= MAP_FRAMES || (s.frame > 30 && inputs[0].pressed)) go(s, 'versus', out);
      break;
    case 'versus':
      if (s.frame >= VERSUS_FRAMES) startMatch(s, out);
      break;
    case 'demo':
    case 'fight':
    case 'bonus': {
      const f = s.fight as FightState;
      let p1 = inputs[0];
      let p2 = inputs[1];
      if (s.screen === 'demo') {
        p1 = cpuInput(s.cpu2 as Cpu, f, 0);
        p2 = cpuInput(s.cpu as Cpu, f, 1);
      } else if (s.mode === 'arcade' && s.screen === 'fight') p2 = cpuInput(s.cpu as Cpu, f, 1);
      else if (s.screen === 'bonus') p2 = NO_INPUT;
      const events = tickFight(f, [p1, p2]);
      for (const e of events) {
        out.push(e);
        if (s.screen === 'demo' || s.mode === 'versus') continue;
        if (e.type === 'points' && e.side === 0) s.score += e.points;
        if (e.type === 'roundBonus' && e.side === 0) s.score += e.time + e.vitality + e.perfect;
        if (e.type === 'bonusEnd') s.score += e.bonus;
        if (e.type === 'points' || e.type === 'roundBonus' || e.type === 'bonusEnd') out.push({ type: 'score', score: s.score });
      }
      if (s.screen === 'demo') {
        if (f.phase === 'matchEnd' && f.phaseFrame > 90) Object.assign(s, createDemo(s.seed + 1));
        break;
      }
      if (s.screen === 'bonus') {
        if (f.phase === 'roundEnd' && f.phaseFrame > 200) go(s, 'map', out);
        break;
      }
      if (f.phase === 'matchEnd' && f.phaseFrame === 1) s.lastWinner = f.winner;
      if (f.phase === 'matchEnd' && f.phaseFrame > 40) afterMatch(s, out);
      break;
    }
    case 'quote':
      if (s.frame >= QUOTE_FRAMES || (s.frame > 40 && (inputs[0].pressed || inputs[1].pressed))) afterQuote(s, out);
      break;
    case 'continue':
      // The page asks (the board and the buttons are DOM); see `continueCredit`.
      break;
    case 'ending':
      break;
  }
  return out;
}

function afterMatch(s: ArcadeState, out: ArcadeEvent[]): void {
  if (s.mode === 'versus') {
    go(s, 'quote', out);
    return;
  }
  if (s.lastWinner === 0) {
    go(s, 'quote', out);
    return;
  }
  // Lost, or a draw game: the credit is over.
  go(s, 'continue', out);
  out.push({ type: 'creditOver', score: s.score, won: false });
}

function afterQuote(s: ArcadeState, out: ArcadeEvent[]): void {
  if (s.mode === 'versus') {
    s.chosen = [null, null];
    s.selectTimer = SELECT_SECONDS;
    go(s, 'select', out);
    return;
  }
  s.stage++;
  if (s.stage >= s.ladder.length) {
    go(s, 'ending', out);
    out.push({ type: 'creditOver', score: s.score, won: true });
    return;
  }
  const kind = BONUS_AFTER[s.stage];
  if (kind && !s.bonusDone.includes(s.stage)) {
    s.bonusDone.push(s.stage);
    s.bonus = kind;
    s.fight = createBonus(s.chosen[0] as CharId, kind);
    go(s, 'bonus', out);
    return;
  }
  go(s, 'map', out);
}

/** Put another coin in: a new credit at zero, against the same opponent. */
export function continueCredit(s: ArcadeState): ArcadeEvent[] {
  const out: ArcadeEvent[] = [];
  s.score = 0;
  s.continues++;
  s.lastWinner = null;
  go(s, 'versus', out);
  out.push({ type: 'score', score: 0 });
  return out;
}
