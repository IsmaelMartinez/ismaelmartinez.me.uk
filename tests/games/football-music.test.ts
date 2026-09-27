/**
 * CALCIO '90's score is four scenes in one form (see `src/games/football/music.ts`):
 * the menu is the form's `order` and the match, the final and the shootout are
 * its `scenes`. `music.test.ts` gates each of them on its own loop against the
 * profile `MUSIC_PROFILE` gives it; these tests pin how the scenes are laid out
 * and the stingers the game fires.
 */
import { describe, it, expect } from 'vitest';
import { FINAL_TEMPO, FOOTBALL_MUSIC, SCENES } from '../../src/games/football/music';

const form = FOOTBALL_MUSIC.form!;

const beats = (line: { beats: number }[]) => line.reduce((sum, n) => sum + n.beats, 0);

describe("CALCIO '90's score, scene by scene", () => {
  it('plays the menu as the order and every other scene as a scene of its own, the final at its tempo', () => {
    expect(form.order).toEqual(SCENES.menu);
    expect(form.scenes).toEqual({
      match: { order: SCENES.match },
      final: { order: SCENES.final, tempo: FINAL_TEMPO },
      shootout: { order: SCENES.shootout }
    });
    expect(form.danger).toBeUndefined();
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
