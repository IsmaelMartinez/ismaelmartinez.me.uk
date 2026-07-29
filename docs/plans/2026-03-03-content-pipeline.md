# Content Pipeline

## Shipped: Observability Series

Designed in `docs/plans/2026-02-27-observability-series-design.md` and now live on `main` across en/es/cat (OpenTelemetry Signals, Observability with OpenTelemetry, Integrating Agentic Systems into Event-Driven Architectures, and the supporting pieces).

## Drafted: AI-Assisted Open Source series

The public-facing series is two articles about teams-for-linux, both trilingual under `src/content/articles/{en,es,cat}/ai-assisted-open-source-*.mdx`: `maintenance` (the why) and `workflow` (the how of the day to day). The pair is framed as a pair, with no "first of three" signpost and no promise of a third piece.

A third article, `ai-assisted-open-source-bot-to-skill`, tells the story of the issue-triage bot that grew complex and got deliberately torn down to a skill plus embeddings (shadow-repo approval gate, Cloud Run cold-start latency, Electron-side false positives, and the community pushback against a bot replying on the main repo, all leading back to a human-in-control skill; the surviving piece is the issue-history embeddings, now moving toward living locally inside teams-for-linux). It exists as a held-back draft (Spanish first, at `es/ai-assisted-open-source-bot-to-skill.mdx`), deliberately not advertised from articles 1 or 2. It may or may not ship; it is not being sold as coming.

`cadences` (Cadences and Signals) leaves the series to become a standalone portfolio piece, since most of its examples are not teams-for-linux. Its in-body series framing has now been decoupled: the "first/second/third" opener is standalone, the "Article 2" reference is gone, and the `maintenance` opener frames the remaining articles as a pair rather than a trilogy.

Everything here remains `draft: true`. Publishing the pair (flip to `draft: false`, confirm `publishedDate`, verify build/RSS/tag-pages/link-checker) is the next step. History: this material previously lived across three overlapping PRs (#45, #92, #40), consolidated into a single branch cut from current `main` so `maintenance.mdx` keeps its refined copy rather than being reverted by a stale branch.

## Backlog: future standalone articles

Salvaged from the closed, English-only PR #40 so the ideas are not lost. Each needs the prose finishing, concrete examples, and es/cat translations before it ships:

- Vibe Coding an Allotment App — building Bonnie Wee Plot, a Next.js gardening tool for Scottish weather, by letting AI handle implementation while steering direction. A reflection on where vibe coding works and where it doesn't.

The third draft from #40, "Observability for Agentic Systems", was dropped: it is superseded by the shipped observability series above, and its worked example (the triage bot) is better served by the dedicated triage article.
