# CLAUDE.md review and reconciliation

## Status

Roadmap entry only. Run `/plan` against this in a fresh clean session, then execute. Do not begin the review work in this session.

## Why this exists

The user's global `CLAUDE.md` at `~/.claude-home/CLAUDE.md` (and its mirror at `~/.claude/CLAUDE.md`) has grown by accretion across many sessions. Each rule was added in a context where it made sense, but the file has not been read end-to-end as a coherent ruleset. A new rule landed on 2026-05-12 ("after opening a PR/MR, immediately run `/address-pr-comments` without being asked") which surfaces a likely conflict with an older rule ("after opening a PR, anything past that point requires explicit user confirmation per MR"). Both can be read consistently if "anything past that point" is interpreted narrowly as "merging," but the surface reading is contradictory and a future session reading the file fresh may apply them inconsistently.

The expectation is that there are more contradictions, duplications, and ambiguities like this hiding in the file. A systematic pass is warranted.

## Identified conflicts (starter list, not exhaustive)

The 2026-05-12 review should at minimum address the following. These are the ones already noticed during the session that produced this roadmap entry; the actual review should expand and verify.

The no-autonomous-merge rule says "anything past [opening a PR] requires explicit user confirmation per MR". The new rule says "after opening a PR/MR, immediately run `/address-pr-comments` without being asked." These are reconcilable in spirit (the address-pr-comments skill explicitly stops before merging) but the wording is in surface conflict. A reader applying the no-autonomous-merge rule literally would refuse to run address-pr-comments without being asked. The fix is probably to rewrite the no-autonomous-merge rule so "anything past that point" specifies merge and ship actions rather than all post-PR actions.

There may also be redundancy between the rule "when addressing PR review comments, always reply to each individual comment" and the new rule that triggers the address-pr-comments skill (which itself enforces per-comment replies). The former may become subsumed once the latter takes effect.

## Approach

In the new session:

Run `/plan` first to formalise the implementation plan. The plan should account for the constraints below.

Use the `/claude-md-management:claude-md-improver` skill as the primary tool. It audits CLAUDE.md files against templates and outputs a quality report before applying changes.

Consider dispatching parallel agents (per the `superpowers:dispatching-parallel-agents` skill) for independent slices of the review. Candidate slices: conflict detection, redundancy detection, vague-language detection, and external-skill-name verification (do all the slash commands the file mentions still exist).

Delegate to ollama where it fits. Use the `delegate-to-ollama` skill for tasks like "summarise this paragraph", "extract rules from this section", "rewrite this rule with the same meaning but no ambiguity", and similar closed-form text work. Prefer MLX-backed models on this hardware; they're more performant on Apple Silicon than GGUF-quantised models of the same size. The user's installed model list should be checked at session start and the prose/reasoning tier mappings adjusted if MLX variants are available.

Learn from each delegation. When a delegation produces a regression or surprising failure mode, open an issue in `IsmaelMartinez/delegate-to-ollama` with the input, the failure mode, the model used, and a suggested directive-rule mitigation. See issue #107 there for the format already in use.

The review itself must not be destructive. Read the file, propose changes, get user sign-off before any write. Use `Edit` (not `Write`) for changes so the diff is small and reviewable. Commit changes in a dedicated branch with a PR.

## Scope

In scope: `~/.claude-home/CLAUDE.md` (and the `~/.claude/CLAUDE.md` mirror if they differ).

Out of scope: project-specific CLAUDE.md files at `<repo>/CLAUDE.md`. Those are owned by their respective repos and should be reviewed separately.

## Success criteria

The output of the review should be:

A short audit report identifying every conflict, redundancy, and ambiguity found, with line numbers.

A proposed reconciled version of `CLAUDE.md` that resolves them. The file should be no longer than the current version, and ideally shorter once duplications are merged.

Per-conflict commentary explaining the reconciliation choice so the user can override individual decisions.

A list of any slash-command names referenced in the file that no longer resolve to an installed skill.

No changes applied until the user approves the proposed version.

## Notes for the executor

The file currently has rules expressed in multiple formats: bullet points, `<tag>` blocks, and prose paragraphs. Preserve that mix unless asked to normalise. The `<avoid_excessive_markdown_and_bullet_points>` block is itself an example of the tag-block style and should be respected when proposing rewrites.

The user has expressed preferences in this session that should also be reflected in the reconciled file if not already: prefer parallel tool calls when independent, delegate to local models where appropriate, write in flowing prose rather than bullet-heavy lists.
