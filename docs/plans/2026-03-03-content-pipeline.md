# Content Pipeline

## Shipped: Observability Series

Designed in `docs/plans/2026-02-27-observability-series-design.md` and now live on `main` across en/es/cat (OpenTelemetry Signals, Observability with OpenTelemetry, Integrating Agentic Systems into Event-Driven Architectures, and the supporting pieces).

## Drafted: AI-Assisted Open Source series

A three-article trilingual series under `src/content/articles/{en,es,cat}/ai-assisted-open-source-*.mdx`:

- `maintenance` — What Changes and What Doesn't. Already on `main` (the refined version with concrete teams-for-linux figures), still `draft: true`.
- `workflow` — The Workflow. Consolidated onto `main` via the series-consolidation PR.
- `cadences` — Cadences and Signals. Consolidated onto `main` via the series-consolidation PR.

All three remain `draft: true`. Publishing (flip to `draft: false`, confirm `publishedDate`, verify build/RSS/tag-pages/link-checker) is the next step now that the site is live on its own domain and analytics are flowing.

This series previously lived across three overlapping PRs (#45, #92, #40); they were consolidated into a single branch cut from current `main` so `maintenance.mdx` keeps its refined copy rather than being reverted by a stale branch.

## Backlog: future standalone articles

Salvaged from the closed, English-only PR #40 so the ideas are not lost. Each needs the prose finishing, concrete examples, and es/cat translations before it ships:

- Standardising Issue Triage with AI — the GitHub Issue Triage Bot: a multi-phase pipeline using vector search for duplicate detection, with safety layers and human oversight by design. Proposes actions without executing them, working inside a shadow repository.
- Vibe Coding an Allotment App — building Bonnie Wee Plot, a Next.js gardening tool for Scottish weather, by letting AI handle implementation while steering direction. A reflection on where vibe coding works and where it doesn't.

The third draft from #40, "Observability for Agentic Systems", was dropped: it is superseded by the shipped observability series above, and its worked example (the triage bot) is better served by the dedicated triage article.
