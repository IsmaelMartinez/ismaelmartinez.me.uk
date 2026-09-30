/**
 * CALCIO '90's score is six scenes in one form (see `src/games/football/music.ts`):
 * the menu is the form's `order` and the three match themes, the final and the
 * shootout are its `scenes`. `music.test.ts` gates each of them on its own loop
 * against the profile `MUSIC_PROFILE` gives it; these tests pin how the scenes
 * are laid out, the stingers the game fires, and the seam rule on the bass,
 * which the profile takes off the shared gate because the DAC kick is the
 * lowest pitched note in the score.
 */
import { describe, it, expect } from 'vitest';
import { FINAL_TEMPO, FOOTBALL_MUSIC, MATCH_THEMES, MUSIC_PROFILE, SCENES } from '../../src/games/football/music';
import { seamArrivals, sceneScore } from './music-gates';

const form = FOOTBALL_MUSIC.form!;

const beats = (line: { beats: number }[]) => line.reduce((sum, n) => sum + n.beats, 0);

describe("CALCIO '90's score, scene by scene", () => {
  it('plays the menu as the order and every other scene as a scene of its own, the final at its tempo', () => {
    expect(form.order).toEqual(SCENES.menu);
    expect(form.scenes).toEqual({
      match: { order: SCENES.match },
      'match-2': { order: SCENES['match-2'] },
      'match-3': { order: SCENES['match-3'] },
      final: { order: SCENES.final, tempo: FINAL_TEMPO },
      shootout: { order: SCENES.shootout }
    });
    expect(form.danger).toBeUndefined();
  });

  it('rotates three match themes, as the Mega Drive game did, each written separately', () => {
    expect(MATCH_THEMES).toEqual(['match', 'match-2', 'match-3']);
    const [a, b, c] = MATCH_THEMES.map(theme => new Set(SCENES[theme]));
    for (const [x, y] of [[a, b], [b, c], [a, c]]) expect([...x].filter(s => y.has(s))).toEqual([]);
  });

  it('writes every stinger one line per track, short enough to land inside a bar or so', () => {
    const names = Object.keys(FOOTBALL_MUSIC.stingers ?? {});
    expect(names.sort()).toEqual(['full-time', 'goal-against', 'goal-for', 'half-time', 'kick-off']);
    for (const lines of Object.values(FOOTBALL_MUSIC.stingers!)) {
      expect(lines).toHaveLength(FOOTBALL_MUSIC.tracks.length);
      for (const line of lines) expect(beats(line)).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the drums and the crowd out until the match calls for them, and has no echo', () => {
    const layered = FOOTBALL_MUSIC.tracks.filter(t => t.startsMuted).map(t => t.name);
    expect(layered).toEqual(['drums', 'crowd']);
    expect(FOOTBALL_MUSIC.echo).toBeUndefined();
  });

  it('switches the shared seam gate off, and only that one', () => {
    expect(MUSIC_PROFILE.gates).toEqual({ seam: false });
  });

  // The rule the shared gate would have read off the kick, read off the bass
  // instead: the score without its drum voice, whose lowest voice is the bass.
  it.each(['menu', ...Object.keys(form.scenes!)])(
    'hands the %s back to its top without the bass landing home in the last bar',
    scene => {
      const loop = scene === 'menu' ? FOOTBALL_MUSIC : sceneScore(FOOTBALL_MUSIC, scene);
      const drums = loop.tracks.findIndex(t => t.name === 'drums');
      const withoutDrums = {
        ...loop,
        tracks: loop.tracks.filter((_, t) => t !== drums),
        form: {
          ...loop.form!,
          sections: Object.fromEntries(
            Object.entries(loop.form!.sections).map(([name, lines]) => [name, lines.filter((_, t) => t !== drums)])
          )
        }
      };
      expect(seamArrivals(withoutDrums)).toEqual([]);
    }
  );
});
