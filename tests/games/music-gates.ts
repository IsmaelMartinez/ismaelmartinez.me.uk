/**
 * The round 2 music gates (ADR 003's 2026-09-26 amendment, plan goals G2 and
 * G3), as pure functions over a score so `music.test.ts` can assert them on
 * every discovered cabinet and a rescore can probe its own draft against them.
 *
 * They are floors that stop a regression, not a judgement that a score is
 * good; the owner's ear is the only gate that says that. Each one reads a
 * single pass of the loop, which is the form's `order` played through once
 * with the once-only intro and any rest left out, or a formless score's
 * melodies.
 */
import { scoreSeconds, type GameAudioOptions, type MusicProfile, type Note, type Track } from '../../src/games/engine/audio';
import { pitch } from '../../src/games/engine/pitch';

/** G2's floor, in seconds of one pass at the fastest tempo the cabinet reaches. */
export const PASS_FLOOR_SECONDS: Record<MusicProfile['session'], number> = {
  long: 45,
  standard: 30,
  minimal: 20
};

/** G3: the fewest distinct bar rhythms a lead may use in one pass. */
export const MIN_BAR_RHYTHMS = 3;
/** G3: every run of this many bars of the lead holds at least one syncopation. */
export const SYNCOPATION_WINDOW_BARS = 8;

/** A sounding note placed in the pass, in beats from its start. */
interface Onset {
  start: number;
  end: number;
  freq: number;
}

const EPS = 1e-6;

function beatsPerBar(music: GameAudioOptions): number {
  return music.form?.beatsPerBar ?? 4;
}

/** One pass of track `t`'s line: the form's order concatenated, or its melody. */
export function passLine(music: GameAudioOptions, t: number): Note[] {
  const form = music.form;
  if (!form) return music.tracks[t]?.melody ?? [];
  return form.order.flatMap(name => form.sections[name]?.[t] ?? []);
}

function lineLength(line: Note[]): number {
  return line.reduce((sum, n) => sum + n.beats, 0);
}

/** The sounding notes of a line with their places, rests and drum hits left out. */
function onsets(line: Note[]): Onset[] {
  const out: Onset[] = [];
  let at = 0;
  for (const n of line) {
    if (n.freq > 0 && !n.drum) out.push({ start: at, end: at + n.beats, freq: n.freq });
    at += n.beats;
  }
  return out;
}

/** The lead: the track named 'lead', or track 0 when none is. */
export function leadIndex(music: GameAudioOptions): number {
  const named = music.tracks.findIndex(t => t.name === 'lead');
  return named >= 0 ? named : 0;
}

/**
 * The pitched voice with the lowest mean pitch over a pass, octave shift
 * included. Drum hits are not pitches, so a percussion track has none and is
 * never the one chosen.
 */
export function lowestVoiceIndex(music: GameAudioOptions): number {
  let best = -1;
  let lowest = Infinity;
  music.tracks.forEach((track, t) => {
    const notes = onsets(passLine(music, t));
    if (notes.length === 0) return;
    const mean = notes.reduce((s, n) => s + Math.log2(n.freq), 0) / notes.length + (track.octaveShift ?? 0);
    if (mean < lowest) {
      lowest = mean;
      best = t;
    }
  });
  return best;
}

/** G2: one pass in seconds at the fastest tempo the cabinet reaches (its own when it does not ramp). */
export function passSecondsAtFastest(music: GameAudioOptions, profile: MusicProfile): number {
  return scoreSeconds(music, profile.fastestTempo ?? music.tempo).pass;
}

/**
 * G3: the distinct bar rhythms of a line. A bar's rhythm is where its sounding
 * notes start and stop inside the bar, pitch and level ignored, with a note
 * carried over the bar line from the previous bar marked as tied in; a bar of
 * silence is a rhythm too.
 */
export function barRhythms(line: Note[], bar: number): string[] {
  const notes = onsets(line);
  const bars = Math.ceil(lineLength(line) / bar - EPS);
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    const from = b * bar;
    const to = from + bar;
    const cells = notes
      .filter(n => n.start < to - EPS && n.end > from + EPS)
      .map(n => {
        const tied = n.start < from - EPS ? '~' : '';
        const start = Math.max(n.start, from) - from;
        const end = Math.min(n.end, to) - from;
        return `${tied}${start.toFixed(3)}-${end.toFixed(3)}`;
      });
    out.push(cells.join(' '));
  }
  return out;
}

/**
 * The metric weight of a position in the bar: the downbeat 4, the half bar 3
 * (in an even metre), any other beat 2, an off-beat eighth 1, and anything
 * finer 0.
 */
function weight(pos: number, bar: number): number {
  const inBar = ((pos % bar) + bar) % bar;
  const on = (x: number) => Math.abs(x - Math.round(x)) < EPS;
  if (inBar < EPS || bar - inBar < EPS) return 4;
  if (bar % 2 === 0 && Math.abs(inBar - bar / 2) < EPS) return 3;
  if (on(inBar)) return 2;
  if (on(inBar * 2)) return 1;
  return 0;
}

/**
 * G3: the bar each syncopation in a line falls in. A note is syncopated, in
 * Longuet-Higgins and Lee's sense, when it starts on a weaker position than
 * one it is held through: an off-beat onset carried over the beat, a note tied
 * across a bar line or the half bar. Straight eighths are not syncopated, and
 * neither is a dotted figure that lands back on the beat. Only a held note
 * counts, not one followed by a rest, so a sparse line does not pass on its
 * silences.
 */
export function syncopatedBars(line: Note[], bar: number): number[] {
  const out: number[] = [];
  for (const n of onsets(line)) {
    const w = weight(n.start, bar);
    // Every eighth-note grid point strictly inside the note.
    for (let q = Math.floor(n.start * 2 + EPS) / 2 + 0.5; q < n.end - EPS; q += 0.5) {
      if (weight(q, bar) > w) {
        out.push(Math.floor(n.start / bar + EPS));
        break;
      }
    }
  }
  return out;
}

/** G3: the windows of `SYNCOPATION_WINDOW_BARS` bars (the last may be shorter) with no syncopation in the lead. */
export function unsyncopatedWindows(line: Note[], bar: number): number[] {
  const bars = Math.ceil(lineLength(line) / bar - EPS);
  const hit = new Set(syncopatedBars(line, bar).map(b => Math.floor(b / SYNCOPATION_WINDOW_BARS)));
  const windows = Math.ceil(bars / SYNCOPATION_WINDOW_BARS);
  return Array.from({ length: windows }, (_, w) => w).filter(w => !hit.has(w));
}

function pitchClass(freq: number): number {
  return (((Math.round(12 * Math.log2(freq / 440)) % 12) + 12) % 12);
}

/** The pitch sounding at a position of a line, or null for silence there. */
function soundingAt(notes: Onset[], pos: number): number | null {
  const n = notes.find(o => o.start <= pos + EPS && o.end > pos + EPS);
  return n ? n.freq : null;
}

/**
 * G3's seam: the strong beats of the pass's last bar (its downbeat, and the
 * half bar in an even metre) on which the lowest pitched voice sounds the
 * pitch class it opens the pass with. The proxy for "no perfect cadence at the
 * seam": a pass that arrives home before it hands back to the top has its bass
 * on the tonic there, and one that reaches the top through V, bVII or a half
 * cadence does not. A passing note on a weak beat is allowed, so a bass may
 * walk up into the opening pitch. An empty result is a pass.
 */
export function seamArrivals(music: GameAudioOptions): number[] {
  const t = lowestVoiceIndex(music);
  if (t < 0) return [];
  const line = passLine(music, t);
  const notes = onsets(line);
  if (notes.length === 0) return [];
  const opening = pitchClass(notes[0].freq);
  const bar = beatsPerBar(music);
  const lastBar = Math.max(0, lineLength(line) - bar);
  const strong = bar % 2 === 0 ? [0, bar / 2] : [0];
  return strong
    .map(offset => lastBar + offset)
    .filter(pos => {
      const f = soundingAt(notes, pos);
      return f !== null && pitchClass(f) === opening;
    });
}

/**
 * The score with one of its form's scenes as the loop: what a player hears
 * while the game holds that scene, for the gates to read like any other pass.
 */
export function sceneScore(music: GameAudioOptions, scene: string): GameAudioOptions {
  const form = music.form!;
  return { ...music, form: { sections: form.sections, beatsPerBar: form.beatsPerBar, order: [...form.scenes![scene].order] } };
}

/**
 * The profile one of a form's scenes is gated against: its own session and
 * tempo, and the cabinet's `gates` with any the scene sets laid over them, so
 * a cabinet whose brief drops a gate drops it in every scene unless one scene
 * says otherwise.
 */
export function sceneProfile(profile: MusicProfile, scene: string): MusicProfile {
  const own = profile.scenes![scene];
  return { ...own, gates: { ...profile.gates, ...own.gates } };
}

/**
 * Every gate a score fails, by name; an empty list is a score that clears the
 * floor. The seconds floor always applies; the three style gates apply unless
 * the profile's `gates` switches one off (ADR 003's round 3 amendment).
 */
export function failedGates(music: GameAudioOptions, profile: MusicProfile): string[] {
  const failed: string[] = [];
  const bar = beatsPerBar(music);
  const on = { seam: true, syncopation: true, rhythms: true, ...profile.gates };
  if (passSecondsAtFastest(music, profile) < PASS_FLOOR_SECONDS[profile.session]) failed.push('seconds');
  const lead = passLine(music, leadIndex(music));
  if (on.rhythms && new Set(barRhythms(lead, bar)).size < MIN_BAR_RHYTHMS) failed.push('rhythms');
  if (on.syncopation && unsyncopatedWindows(lead, bar).length > 0) failed.push('syncopation');
  if (on.seam && seamArrivals(music).length > 0) failed.push('seam');
  return failed;
}

/**
 * G3's register bands, by a voice's mean pitch over the whole score with its
 * octave shift counted: under C3 is bass, C5 and above is high, and between
 * is mid. A percussion voice has no pitch and is its own band.
 */
const BASS_BELOW = Math.log2(pitch('C3'));
const HIGH_FROM = Math.log2(pitch('C5'));

/**
 * Track fields that are not the instrument: the notes, the level in the mix,
 * the name and layer flag, the octave (already read through the register
 * band), and the detuned twin and vibrato, which thicken or bend a voice
 * without changing which instrument it is.
 */
const NOT_TIMBRE = new Set<string>(['melody', 'volume', 'name', 'startsMuted', 'octaveShift', 'detune', 'vibrato']);

/** A value serialised with its object keys sorted, so two equal settings always print the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${canonical(v)}`).join(',')}}`;
  }
  return String(value);
}

/** Every line track `t` plays anywhere in the score: its melody, or its line in the intro and every section. */
function allLines(music: GameAudioOptions, t: number): Note[][] {
  const form = music.form;
  if (!form) return [music.tracks[t]?.melody ?? []];
  return [form.intro?.[t] ?? [], ...Object.values(form.sections).map(lines => lines[t] ?? [])];
}

/**
 * One voice's part of the signature: 'drums' for a percussion voice, or its
 * register band and every instrument field it sets, wave and envelope with
 * their defaults filled in.
 *
 * The instrument fields are every `Track` field not listed in `NOT_TIMBRE`,
 * read from the object rather than named here. So a field the engine gains
 * later (round 3 plans a pan, an ADSR, a filter, a wavetable and FM) joins
 * the signature the day a score sets it, with nothing here to update: a voice
 * that moves to an FM patch or a custom wavetable becomes a different
 * instrument without anyone remembering to teach this test the field. The
 * price is that a field which is a mix setting rather than an instrument has
 * to be added to `NOT_TIMBRE` when it lands. Values compare exactly, so a
 * nudged number is a new instrument by this measure; the test is a floor that
 * catches copies, and the owner's ear is what judges whether the difference
 * is heard.
 */
export function voiceSignature(music: GameAudioOptions, t: number): string {
  const track: Track = music.tracks[t];
  const notes = allLines(music, t).flatMap(onsets);
  if (notes.length === 0) return allLines(music, t).some(line => line.some(n => n.drum)) ? 'drums' : 'silent';
  const mean = notes.reduce((s, n) => s + Math.log2(n.freq), 0) / notes.length + (track.octaveShift ?? 0);
  const band = mean < BASS_BELOW ? 'bass' : mean >= HIGH_FROM ? 'high' : 'mid';
  const timbre = Object.fromEntries(Object.entries(track).filter(([key]) => !NOT_TIMBRE.has(key)));
  return `${band} ${canonical({ ...timbre, wave: track.wave ?? 'square', envelope: track.envelope ?? 'pluck' })}`;
}

/**
 * G3: a score's instrument signature, the multiset of its voices' signatures
 * (sorted, so the order of `tracks` does not matter) plus whether it has the
 * echo send. Two cabinets with the same signature are the same band playing
 * different notes, which is the sameness round 3 exists to end.
 */
export function instrumentSignature(music: GameAudioOptions): string {
  const voices = music.tracks.map((_, t) => voiceSignature(music, t)).sort();
  return [...voices, music.echo ? 'echo' : 'dry'].join(' | ');
}
