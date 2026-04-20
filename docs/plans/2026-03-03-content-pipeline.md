# Content Pipeline

## In Progress: Observability Series

Tracked in `docs/plans/2026-02-27-observability-series-design.md`. Two articles planned:

Article 1, OpenTelemetry Signals — published (`draft: false`).

Article 2, Observability for Agentic Systems — not started. Builds on the Signals article and the "Observability Expands" section from the Agentic EDA piece. Core argument: traditional observability tells you whether your system is healthy; agent-aware observability tells you whether decisions are stable, safe, and cost-effective. The triage bot (`github-issue-triage-bot`) provides a real working example — safety layers, agent audit log, escalation after 4 round-trips. Both need translations to es/cat once the English versions are finalised.

## Teams for Linux Series

Three articles forming a principles → workflow → tooling arc.

### Article 1: Principles and Secure AI Usage (existing draft)

Draft exists at `src/content/articles/en/ai-assisted-open-source-maintenance.mdx` (`draft: true`). The prose is largely complete. The article focuses on why AI is used, what it can and cannot replace, and why transparency matters. Light refocus needed once Article 2 exists: add forward references to the workflow article and ensure the split between "why" (this article) and "how" (article 2) is clean. Ties back to "The AI Automation Trap" as the philosophical companion. Translate to es/cat after finalising. Set `draft: false` and confirm `publishedDate` before merging.

### Article 2: The Actual Workflow (not started)

Detailed walkthrough of how AI is used day-to-day in the teams-for-linux project. Covers the practical flow: how CLAUDE.md governs behaviour, how dependency upgrades and security patches are handled, how features move from decision to implementation with AI assistance, and what the review/release cycle looks like. This is the "how" to Article 1's "why."

### Article 3: Standardising Issue Triage with AI (not started)

Covers the `github-issue-triage-bot` project. How the multi-phase triage pipeline works (template parsing, vector search, duplicate detection, roadmap matching, miscategorisation checks). The Enhancement Researcher agent and its shadow repo workflow. Safety layers (structural validator + LLM reviewer) and the escalation model. Silent mode and the dashboard. Follows the same principles from Article 1 applied to a new problem: standardising the issue/enhancement process with AI while keeping human oversight.

## Bonnie Wee Plot: Vibe Coding an Allotment App (not started)

Standalone article about `bonnie-wee-plot`, a Next.js allotment management app that was entirely vibe-coded with AI. Covers learnings from the experience, what worked, what didn't, and why sharing a personal project publicly is worthwhile even when it's built primarily for yourself. Contrast with the disciplined AI usage in the t4l series — this is the other end of the spectrum.

## Backlog (maybe)

### Local Brain: Delegating to Local Models (not started)

About the `local-brain` Claude Code plugin marketplace. A CLI tool and plugin that lets Claude Code delegate read-only codebase exploration to local Ollama models — no cloud round-trips, full privacy. Uses Smolagents as the agent framework with path-jailed tools and a two-layer security model (trusted tool layer + LLM sandbox). Has OpenTelemetry tracing built in. Interesting angles: the separation of concerns (web research stays with Claude, local code stays local), the security model design, building a Claude Code plugin, and using Smolagents for code execution.

### AI Model Advisor: Recommending Efficient Models (not started)

About the `ai-model-advisor` project. A browser-only PWA that helps users find AI models for their task, prioritising smaller and more efficient options. Uses MiniLM embeddings (~23MB) for task classification with keyword fallback, runs entirely client-side with no backend. Covers the environmental scoring system (4 tiers by model size), the design decision to keep everything in the browser, and the offline-first PWA approach. Could tie into the broader theme of responsible AI usage — choosing the right-sized model rather than defaulting to the biggest one.
