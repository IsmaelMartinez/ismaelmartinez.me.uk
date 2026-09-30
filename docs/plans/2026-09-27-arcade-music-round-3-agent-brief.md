# Arcade music round 3: the brief every agent works to

The shared instructions the round 3 agents were given, kept in the repo so the round can be resumed
in a fresh session (see `docs/plans/roadmap.md`). The plan is
`docs/plans/2026-09-27-arcade-music-round-3-plan.md`; each cabinet's reference brief is in the plan
and in its issue (#410 to #416).

## Rules for every arcade music round 3 agent

Repo: github.com/IsmaelMartinez/ismaelmartinez.me.uk. Read first: CLAUDE.md (project), docs/adr/003-arcade-music-composition.md (incl. amendments), docs/plans/2026-09-27-arcade-music-round-3-plan.md (on branch origin/docs/arcade-music-round-3-plan, PR #401; `git show origin/docs/arcade-music-round-3-plan:docs/plans/2026-09-27-arcade-music-round-3-plan.md`), your issue (`gh issue view N`), and tracking issue #402.

Git and GitHub
- Work only in your own isolated worktree. Create your branch from the base you were given (default origin/main).
- Commit messages: a short subject naming the mechanism, one or two sentences of body, a `Refs #N` or `Closes #N` line, then exactly these two lines:
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016nHurcA7ZYrHLnESm8q9R6
- PR bodies: one or two sentences plus a one-line "Verified:" sentence, ending with:
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_016nHurcA7ZYrHLnESm8q9R6
- A PreToolUse hook requires an on-device draft before `git commit -m/-F` and `gh pr create`/`gh issue create`: run `~/.claude-home/skills/delegate-local/scripts/delegate.sh --tier prose --recipe commit-message --file <diff> --var recent_commits=... --var diff_stat=... --var why=...` (or `--recipe pr-description` with `--var recent_prs= --var diff_stat= --var context=`), edit the draft (subjects usually need rewriting), then record `~/.claude-home/skills/delegate-local/scripts/delegate-feedback.sh --source agent --id <id> hit|scaffold|miss "<reason>" --final <file>`. Commands with `$(...)` are refused by the sandbox guard: put them in a small wrapper script and run `bash script.sh`. Pass bodies with `-F`/`--body-file`.
- Issue shell commands one at a time (no `&&` chains of git+gh). Never merge, never force-push, never use --admin, never push to main.
- After opening a PR: wait for CI (`gh pr checks N --watch`), then read Copilot's review comments (`gh api repos/IsmaelMartinez/ismaelmartinez.me.uk/pulls/N/comments`), fix each valid one, reply to each on GitHub, push, and re-check CI and any new Copilot comments until clean.

Quality
- Before a PR: `npm run lint`, `npm run typecheck`, and the full `npm test` must pass locally. Mutation-check every new assertion (break the code briefly, see the test fail, restore).
- vitest swallows console.log; a probe must write to a file.
- Engine changes are additive: a score that uses none of a new feature must render byte-identically. Prove it with the jukebox: start a dev server on your own port (`npx astro dev --port <yours>`; it daemonises, note its pid and `kill` it when done), then `CHROMIUM="/Users/ismael.martinez/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" JUKEBOX_URL=http://localhost:<port>/en/dev/jukebox node scripts/render-music.js <label>` on the base and on your branch, and `cmp` each WAV. playwright-core may need `npm i --no-save playwright-core`. Headless only; never open a visible browser.
- Writing: British spelling, no em-dashes anywhere (use commas, colons, parentheses), match the surrounding comment density and style. Update CLAUDE.md or the ADR only where your change makes a statement there stale.
- Copyright: arrange public-domain material freely; never copy a copyrighted melody, evoke it by mode, tempo, timbre and form. Do not quote the Nokia tune or Korobeiniki (owner default for this round).

Scratch space
- Keep scratch files in your own folder outside the repo, and delete only files you created there; never clear a shared scratch directory (an earlier agent wiped one).
- Delete WAV renders you made under music-renders/ before finishing, unless your brief asks you to leave them for the owner.

Report back (plain prose, under 400 words): branch, PR number(s), CI state, the API or behaviour you added, how you proved byte-identity or the fix, Copilot comments handled, anything unverified or left open.

## Rescore brief shared by every round 3 cabinet agent

Read and follow, in order: the process rules and the engine API in this file, your issue, the round 3 plan section for your cabinet (reference research and sources), and ADR 003 including the round 3 amendment on origin/round3/base.

Base: origin/round3/base. Your PR targets `round3/base` (not main), with `Closes #<your issue>`.

What the owner said: the round 2 music is longer and better, but all the cabinets "sound the same, just slightly different", and each should sound like the music of the original game it homages: similar, never a copy. Your job is to make your cabinet unmistakably its own, following its reference brief. You cannot hear the result, so design from the reference's measurable traits (platform voices and timbres, tempo, mode, meter, texture, form, melodic contour and range, rhythm feel, use of silence, how it reacts to play) and write down in the docstring which trait each choice serves.

Musical quality, which the owner judges by ear:
- A tune a listener can hold: a clear hook with an arch contour, mostly stepwise with the occasional characteristic leap, phrases of 2 or 4 bars that answer each other, a stable register (no voice lurching between registers across sections).
- Background beds (anything under play) change harmony slowly and keep a steady rhythmic cell.
- Use the new engine features where your platform had them; do not use a feature your platform lacked just because it exists. No detuned pad or echo unless the reference had that sound.
- Do not reuse other cabinets' helpers, drum bars, forms (the `a b a2` skeleton, the `halves` pad helper) or danger recipe; write your own for your idiom.

Must:
- Rewrite `src/games/<cabinet>/music.ts` with a docstring in the file's existing style: the reference and brief, key, tempo, form, session and cognitive load (ADR 003), adaptive hooks, and which reference trait each design choice serves.
- `MUSIC_PROFILE`: keep the seconds floor honest; set `gates` choices only where the reference justifies it (say why in a comment); remove `palettePending` if your cabinet had it.
- Wire the adaptive behaviour your brief asks for in `game.ts`, with game-module (DOM) tests for each hook, mutation-checked.
- `npm test` green, including music.test.ts gates and the difference test; lint and typecheck clean.
- For the owner's audition, leave renders (they are git-ignored): run the jukebox render for your cabinet on origin/round3/base and on your branch (default state plus each scene, danger, layer state your brief uses, via render-music.js flags `--scene=`, `--danger`, `--section=`, `--layer=`), into music-renders/round3-before/ and music-renders/round3/ in YOUR worktree, and say in your report the absolute paths. Do not delete these.
- Update CLAUDE.md sentences about your cabinet's music only where they become stale.

Report (under 450 words): PR number and branch, CI state, the musical design in a few sentences (key, tempo, voices and timbres, form, hook), adaptive hooks, which reference traits you hit and any you could not, render paths, Copilot comments handled, anything unverified.

## Round 3 engine API (on origin/round3/base; from PRs #418, #421-#424, #419, #420)

Base branch for every rescore: origin/round3/base = engine stack tip (#424) + conventions (#419) + Line Hold wiring (#420). Open your PR against `round3/base`.

Track fields (all optional; a score using none renders as before):
- `pan` (-1..1): per-note StereoPannerNode; renders are stereo now.
- `adsr {attack, decay, sustain 0-1, release}` seconds: overrides `envelope`; note holds full length (no 0.9 pluck trim); release rings past the note (min 5 ms).
- `filter {type?: 'lowpass'|'highpass'|'bandpass', cutoff Hz, q?, envAmount? (octaves; negative opens upward), envDecay? s}`: per note, before the envelope. Drums ignore it.
- `wavetable {samples? | harmonics?, bits?}`: overrides `wave`. `samples` one cycle in -1..1 (held steps); `harmonics` sine partial levels; `bits` quantises (4 = Game Boy wave channel).
- `noise: 'white' | 'short'`: noise colour for this voice's snare/hat and noise notes; 'short' = NES 93-step metallic LFSR.
- `wave: 'noise'`: sustained filtered noise for the note length, low-pass cutoff = the note's freq in Hz (crowds, ambience, wind). envelope/adsr/filter/pan/gain apply.
- `fm {ratio, index, indexDecay?}`: two-operator FM (sine modulator at freq*ratio, deviation index*freq); indexDecay s to ~5%. Cost about that of a plain voice; a detuned twin doubles it.
- `pitchEnv {semitones, time}` (also on Note): start offset gliding home over time s (kicks, timpani, sweeps). Note's wins over track's; slideFrom wins over both.
- `arpRate` (steps/s, default 50) with `Note.arp` (semitone offsets, e.g. [0,4,7]): one voice implies a chord; drops slides/pitchEnv on that note.

Adaptive (from #400/#420):
- `form.scenes` + `setScene(name|null)`; `form.danger` (reserved scene 'danger'); `setSection`; `setLayer(track, on, fade?, 'now'|'section')` ('section' = fade starts at the next section top); `playStinger`; `setPaused`; `setTempo`.

Profiles and tests (from #419):
- `MUSIC_PROFILE.gates?: { seam?, syncopation?, rhythms? }` (explicit false turns one off; seconds floor always on); scene profiles may set gates.
- `MUSIC_PROFILE.palettePending?: string` (tanks, towerdefense today): remove when your cabinet no longer collides.
- `instrumentSignature()` in tests/games/music-gates.ts: per-voice (wave, envelope, register band) multiset + echo; all other Track fields feed it automatically.
- ADR 003 has a "round 3" amendment with the per-cabinet brief table: follow it.
