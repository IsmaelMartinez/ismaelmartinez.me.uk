# Observability Article Series Design

## Article 1: OpenTelemetry Signals (branch: otel-signals-article)

Fulfils the promise from the observability post. Covers the four stable signals (traces, metrics, logs, baggage) plus emerging ones (events, profiles). Conceptual style with examples and analogies, no runnable code. Explains what each signal is, what problem it solves, how signals relate, and where each falls short alone. Closes by noting these signals were designed for deterministic systems, setting up article two.

Target: ~100 lines. Cross-links to Observability and Death of Logs articles.
Tags: Observability, OpenTelemetry, Signals, SRE.
Platform: self (site is canonical source).

## Article 2: Observability for Agentic Systems (branch: TBD)

Builds on the signals article and the "Observability Expands" section from the Agentic EDA piece. Core argument: traditional observability tells you whether your system is healthy; agent-aware observability tells you whether decisions are stable, safe, and cost-effective. Defines new observability dimensions as reusable patterns, each anchored with a short concrete example (hybrid style). Covers antipatterns. Closes by tying back to the four-layer model.

Target: ~100-120 lines. Cross-links to Agentic EDA, Observability, and Signals articles.
Tags: Observability, Agentic AI, OpenTelemetry, AI.
Platform: self.

## Process

The author writes, Claude assists with review, suggestions, translations (es/cat), and formatting.
