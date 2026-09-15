# Agent workflow

Read `.agents/HANDOFF.md` near the start. Keep durable findings there, with current source pointers; do not duplicate session transcripts.

## Efficient retrieval

- Known file or symbol: use Serena's symbol overview/lookup/references. Use scoped `rg` for literal text, HTML and configuration.
- Unknown ownership or cross-file architecture: use the Graphify skill's `scripts/query.py` with specific labels (default native budget 800, hard output cap 3,200 characters), then verify current source. Do not rebuild for routine questions.
- The wrapper belongs to a local skill, not this repository. If unavailable, use Serena or scoped `rg`; native Graphify queries need output limiting and a temporary graph copy for strict read-only work.
- Avoid whole-file reads when a symbol or section suffices. Exclude generated outputs and vendor internals from broad searches unless they are the subject of the task.
- Batch independent reads. Emit only necessary result fields, choosing `structuredContent` or `content`, never both. Narrow truncated searches before increasing output limits.
- Caveman: use concise, clear Italian responses; filter large outputs before compression. Preserve exact errors, source pointers, negations and uncertainty. Local compression statistics do not establish billed token savings.
- Load only the skill references relevant to the operation. Do not invoke every available tool for every task.

## Graph maintenance

Respect `.graphifyignore`; research documents remain part of the mixed graph. `graphify extract . --code-only` refreshes code only. Changed semantic documents need the Graphify incremental workflow before the whole graph can be called current.

Native graph queries can write `graphify-out/cache/last_query_stamp`; the skill wrapper uses a temporary copy and disables query logging. Local clustering uses `graphify cluster-only . --no-label` to prevent automatic LLM/Claude labeling. Do not automatically save answers/reflections into the graph; use HANDOFF for expensive findings.

See `.agents/TOOLING.md` for measured checks and refresh guidance. Do not infer token savings from file size or compression ratios alone.
