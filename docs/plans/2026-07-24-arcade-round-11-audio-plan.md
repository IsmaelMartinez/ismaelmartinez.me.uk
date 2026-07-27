# Arcade Round 11 — "Magic" audio + split music/effects toggles

## Context

The eight arcade cabinets share one procedural Web Audio engine
(`src/games/engine/audio.ts`, wired via `soundButton.ts`). It is well built
(lazy `AudioContext` on first gesture, tab-hide suspend, `astro:before-swap`
teardown, zero binary assets) but the music reads as thin and short: every
cabinet plays a single monophonic oscillator voice with no bass, harmony, or
pad; the loops are only 8–16 notes; and every note uses the same plucky
fast-decay envelope, so nothing sustains and the shimmer that reads as "magic"
is absent. Control was coarse too: a single `arcade-muted` key silenced music
and effects together, shared across all games, behind one `🔊` button.

The owner asked for soundtracks that feel more magic and for independent
music/effects toggles in each cabinet. Two decisions were settled up front:
persistence is global per channel (one music preference + one effects
preference, shared floor-wide, preserving the set-once behaviour), and the UI is
two independent header buttons (`🎵` music, `🔊` effects). Everything stays
within the no-binary-assets constraint: bass, pad, and echo are all synthesised.

## Engine API (Goal 1 defines it; Goals 2–9 consume it)

`GameAudioOptions` grew a `tracks: Track[]` field (parallel voices sharing one
tempo, each with `wave`, `volume`, `envelope: 'pluck' | 'pad'`, `octaveShift`,
and `detune` for a warm twin) plus an optional `echo` feedback-delay send. A
bare `melody` is still wrapped as one track, so pre-existing callers are
untouched. Mute split into `isMusicMuted/setMusicMuted/toggleMusicMute` and the
`Sfx` equivalents, persisted under `arcade-music-muted` / `arcade-sfx-muted`,
with a one-time migration from the legacy `arcade-muted` key. `wireChannelButton`
wires one channel's toggle; the legacy `wireSoundButton` (single combined
button) stays as a migration scaffold, removed in Goal 10.

## Goals

Goal 1 — Engine foundation (runs first, alone). Multi-voice synth, `pad`
envelope, detuned twin, echo send, split mute, `wireChannelButton`, four shared
i18n keys (`fun.arcade.musicOn/musicOff/sfxOn/sfxOff`), `.sound-btn.muted` CSS,
and the extended `audio.test.ts`. Additive: all eight games keep compiling via
the `melody` + `wireSoundButton` shim, so the tree stays green.

Goals 2–9 — Re-score one cabinet each + swap its single button for the two-button
pair (parallel, after Goal 1; each touches only its own `game.ts` + `.astro`):

- Goal 2 Pixel Park (`park`): fairground carousel waltz in 3/4, oom-pah bass under a bright detuned organ-ish lead, light echo.
- Goal 3 Syndicate (`syndicate`): Blade-Runner dread, slow detuned `pad` drone, sparse sawtooth minor lead, high ad-screen bleeps, echo tail.
- Goal 4 Cascade (`cascade`): driving Korobeiniki-style minor, A/B phrase, busy bass; keep the per-level `setTempo` ramp.
- Goal 5 Microcity (`city`): cozy builder, soft major `pad`, gentle bell arpeggio, slow bass.
- Goal 6 Critter Rescue (`lemmings`): whimsical Lemmings folk skip, bouncy major arpeggio lead over a walking bass.
- Goal 7 Line Hold (`towerdefense`): martial "hold the line", low pulsing drone/`pad` under a heroic minor lead.
- Goal 8 Tank Duel (`tanks`): jaunty Worms-style march, bouncy bass, brassy sawtooth lead.
- Goal 9 Snake (`snake`): deliberately minimal and nostalgic, a fuller Nokia-era bleep with a bass and a slightly longer phrase; not over-lushed.

Goal 10 — Cleanup + integration (last). Remove the `wireSoundButton` /
combined-mute scaffold and the unused `soundOn/soundOff` i18n keys; update
CLAUDE.md and the arcade tracker; full bar including `check-links`.

## Verification

Per goal: `npm run lint && npm run typecheck && npm run build && npm test`.
End to end: each cabinet plays a fuller multi-voice loop matching its direction;
`🎵` toggles music only (effects keep firing) and `🔊` toggles effects only
(music keeps playing); both preferences survive a reload and carry between
cabinets; leaving a game stops its audio.

## Execution notes

- 2026-07-24: Goal 1 landed — engine multi-voice + echo + split mute, `wireChannelButton`, i18n keys, `.sound-btn.muted` CSS, audio tests extended to 18 (full suite 599 green). Shim keeps all eight cabinets compiling unchanged.
