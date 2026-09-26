/**
 * CALCIO '90's score is four scenes in one form (see `src/games/football/music.ts`),
 * and `music.test.ts` only sees the whole order, which runs the menu, the match
 * and the shootout together and leaves the final's danger order out. These
 * tests hold each scene to the round 2 gates on its own, since each is what a
 * player hears on repeat while it is playing, and pin the one-bar turn the game
 * relies on to loop a scene.
 */
import { describe, it, expect } from 'vitest';
import type { GameAudioOptions, MusicProfile } from '../../src/games/engine/audio';
import { failedGates } from './music-gates';
import {
  BASE_TEMPO,
  FINAL_ORDER,
  FINAL_TEMPO,
  FOOTBALL_MUSIC,
  SCENES,
  type Scene
} from '../../src/games/football/music';

const form = FOOTBALL_MUSIC.form!;

/** The score with only `order` as its loop: what a player hears while one scene holds. */
function sceneScore(order: readonly string[]): GameAudioOptions {
  return { ...FOOTBALL_MUSIC, form: { sections: form.sections, order: [...order] } };
}

const beats = (line: { beats: number }[]) => line.reduce((sum, n) => sum + n.beats, 0);

describe("CALCIO '90's score, scene by scene", () => {
  it('runs the scenes in one order and takes the final from the danger order', () => {
    expect(form.order).toEqual([...SCENES.menu, ...SCENES.match, ...SCENES.shootout]);
    expect(form.danger?.order).toEqual(FINAL_ORDER);
    expect(form.danger?.tempo).toBe(FINAL_TEMPO);
  });

  it.each(Object.keys(SCENES) as Scene[])('ends the %s with a turn of exactly one bar', scene => {
    // The game asks for the scene's top while the turn plays, and the jump lands
    // on the next bar line: longer than a bar and the turn would be cut short.
    const turn = form.sections[SCENES[scene].at(-1)!];
    for (const line of turn) expect(beats(line)).toBe(4);
  });

  // The menus play at the base tempo (`game.ts` sets it on every menu screen);
  // the match and the shootout are sized at the final's, the fastest either reaches.
  const cases: { scene: string; order: readonly string[]; profile: MusicProfile }[] = [
    { scene: 'menu', order: SCENES.menu, profile: { session: 'standard', fastestTempo: BASE_TEMPO } },
    { scene: 'match', order: SCENES.match, profile: { session: 'long', fastestTempo: FINAL_TEMPO } },
    { scene: 'final', order: FINAL_ORDER, profile: { session: 'long', fastestTempo: FINAL_TEMPO } },
    { scene: 'shootout', order: SCENES.shootout, profile: { session: 'minimal', fastestTempo: FINAL_TEMPO } }
  ];

  it.each(cases)('clears every gate in the $scene on its own', ({ order, profile }) => {
    expect(failedGates(sceneScore(order), profile)).toEqual([]);
  });

  it('writes every stinger one line per track, short enough to land inside a bar or so', () => {
    const names = Object.keys(FOOTBALL_MUSIC.stingers ?? {});
    expect(names.sort()).toEqual(['full-time', 'goal-against', 'goal-for', 'half-time', 'kick-off']);
    for (const lines of Object.values(FOOTBALL_MUSIC.stingers!)) {
      expect(lines).toHaveLength(FOOTBALL_MUSIC.tracks.length);
      for (const line of lines) expect(beats(line)).toBeLessThanOrEqual(4);
    }
  });
});
