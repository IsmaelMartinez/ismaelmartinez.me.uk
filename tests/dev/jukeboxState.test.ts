import { describe, it, expect } from 'vitest';
import type { GameAudioOptions, Note } from '../../src/games/engine/audio';
import {
  defaultControls,
  hasLayers,
  introBeats,
  loopBeats,
  renderFileName,
  renderLoop,
  renderParts,
  renderState,
  sceneNames,
  sectionNames
} from '../../src/dev/jukeboxState';

const n = (beats: number, freq = 440): Note => ({ freq, beats });

// A synthetic adaptive score: no cabinet has a form, layers or stingers yet.
const ADAPTIVE: GameAudioOptions = {
  tempo: 120,
  tracks: [{ name: 'lead' }, { name: 'bass', wave: 'triangle' }, { name: 'drums', startsMuted: true }],
  form: {
    intro: [[n(2, 1)], [n(2, 2)], [n(2, 3)]],
    sections: {
      a: [[n(4, 10)], [n(4, 20)], [n(4, 30)]],
      b: [[n(2, 11), n(2, 12)], [n(4, 21)], [n(4, 31)]],
      fast: [[n(4, 13)], [n(4, 22)], [n(4, 32)]]
    },
    order: ['a', 'b', 'a'],
    danger: { order: ['fast'], tempo: 160 }
  },
  stingers: { win: [[n(1)], [n(1)], [n(1)]] }
};

const PLAIN: GameAudioOptions = {
  tracks: [{ melody: [n(3), n(1)] }, { melody: [n(4)] }]
};

describe('the jukebox adaptive controls', () => {
  it('starts each voice as its score says, outside danger, from the top', () => {
    expect(defaultControls(ADAPTIVE)).toEqual({
      layers: [true, true, false],
      scene: '',
      danger: false,
      section: ''
    });
  });

  it('offers voice toggles only to a score with named or initially silent voices', () => {
    expect(hasLayers(ADAPTIVE)).toBe(true);
    expect(hasLayers(PLAIN)).toBe(false);
    expect(hasLayers({ tracks: [{ melody: [n(1)], startsMuted: true }] })).toBe(true);
  });

  it('lists the order and then what the danger order adds, each section once', () => {
    expect(sectionNames(ADAPTIVE)).toEqual(['a', 'b', 'fast']);
    expect(sectionNames(PLAIN)).toEqual([]);
  });

  it('counts a loop as one pass of the order, and the intro apart', () => {
    expect(loopBeats(ADAPTIVE)).toBe(12);
    expect(introBeats(ADAPTIVE)).toBe(2);
    expect(loopBeats(PLAIN)).toBe(4);
    expect(introBeats(PLAIN)).toBe(0);
  });

  it('turns the controls into the RenderState a whole-score render takes', () => {
    const control = { layers: [true, false, true], scene: '', danger: true, section: 'b' };
    expect(renderState(ADAPTIVE, control)).toEqual({
      layers: { '0': true, '1': false, '2': true },
      danger: true,
      section: 'b'
    });
    // A score with no danger variant is never asked to start in one.
    expect(renderState(PLAIN, { ...defaultControls(PLAIN), danger: true })).toEqual({});
  });

  it('renders each sounding voice alone, with its own line from every passage of the form', () => {
    const control = { layers: [true, false, true], scene: '', danger: true, section: 'b' };
    const { parts, from } = renderParts(ADAPTIVE, control);
    expect(from).toEqual({ danger: true, section: 'b' });
    expect(parts.map(p => p.tracks.map(t => t.name))).toEqual([['lead'], ['drums']]);
    const drums = parts[1];
    expect(drums.tracks[0].startsMuted).toBe(false);
    expect(drums.form?.intro).toEqual([[n(2, 3)]]);
    expect(drums.form?.sections).toEqual({
      a: [[n(4, 30)]],
      b: [[n(4, 31)]],
      fast: [[n(4, 32)]]
    });
    expect(drums.form?.order).toEqual(['a', 'b', 'a']);
    expect(drums.form?.danger).toEqual({ order: ['fast'], tempo: 160 });
    expect(parts[0].form?.sections.b).toEqual([[n(2, 11), n(2, 12)]]);
    expect(drums.stingers).toBeUndefined();
  });

  it('leaves a score without a form and its default state rendering exactly as before', () => {
    const { parts, from } = renderParts(PLAIN, defaultControls(PLAIN));
    expect(from).toEqual({});
    expect(parts).toEqual([
      { tracks: [{ melody: [n(3), n(1)], startsMuted: false }] },
      { tracks: [{ melody: [n(4)], startsMuted: false }] }
    ]);
  });

  it('renders nothing when every voice is off', () => {
    expect(renderParts(PLAIN, { layers: [false, false], scene: '', danger: false, section: '' }).parts).toEqual([]);
  });

  it('names the file after the state it was rendered in', () => {
    expect(renderFileName('cascade', ADAPTIVE, defaultControls(ADAPTIVE))).toBe('cascade.wav');
    expect(
      renderFileName('cascade', ADAPTIVE, {
        layers: [true, false, true],
        scene: '',
        danger: true,
        section: 'b'
      })
    ).toBe('cascade-danger-from-b-with-drums-without-bass.wav');
    expect(
      renderFileName('snake', PLAIN, {
        layers: [false, true],
        scene: '',
        danger: true,
        section: ''
      })
    ).toBe('snake-without-0.wav');
  });

  describe('on a form with scenes', () => {
    const SCENED: GameAudioOptions = {
      tempo: 120,
      tracks: [{}],
      form: {
        sections: { menu: [[n(4, 1)]], match: [[n(4, 2)]], turn: [[n(4, 3)]] },
        order: ['menu'],
        scenes: { match: { order: ['match', 'turn'], tempo: 150 } }
      }
    };

    it('offers each scene, and the sections only a scene plays', () => {
      expect(sceneNames(SCENED)).toEqual(['match']);
      expect(sceneNames(ADAPTIVE)).toEqual([]);
      expect(sectionNames(SCENED)).toEqual(['menu', 'match', 'turn']);
    });

    it('renders from the chosen scene and names the file after it', () => {
      const control = { ...defaultControls(SCENED), scene: 'match', section: 'turn' };
      expect(renderState(SCENED, control)).toEqual({ scene: 'match', section: 'turn' });
      expect(renderFileName('football', SCENED, control)).toBe('football-scene-match-from-turn.wav');
      // A scene the form does not write is never asked for.
      expect(renderState(SCENED, { ...control, scene: 'nope', section: '' })).toEqual({});
    });

    it('sizes a render to the scene it plays, at its tempo, without the intro', () => {
      expect(renderLoop(SCENED, defaultControls(SCENED))).toEqual({ beats: 4, intro: 0, tempo: null });
      expect(renderLoop(SCENED, { ...defaultControls(SCENED), scene: 'match' })).toEqual({ beats: 8, intro: 0, tempo: 150 });
      expect(renderLoop(ADAPTIVE, { ...defaultControls(ADAPTIVE), danger: true })).toEqual({ beats: 4, intro: 0, tempo: 160 });
      expect(renderLoop(ADAPTIVE, defaultControls(ADAPTIVE))).toEqual({ beats: 12, intro: 2, tempo: null });
    });

    it('lets danger win over a scene in the render, its length and its name, as it does live', () => {
      const both: GameAudioOptions = { ...SCENED, form: { ...SCENED.form!, danger: { order: ['turn'], tempo: 170 } } };
      const control = { ...defaultControls(both), scene: 'match', danger: true };
      expect(renderState(both, control)).toEqual({ danger: true });
      expect(renderFileName('football', both, control)).toBe('football-danger.wav');
      expect(renderLoop(both, control)).toEqual({ beats: 4, intro: 0, tempo: 170 });
    });
  });
});
