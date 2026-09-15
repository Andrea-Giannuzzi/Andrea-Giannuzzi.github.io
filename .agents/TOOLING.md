# Agent tooling checks

Verified 2026-09-15. Measurements below are characters/bytes, not billed tokens.

## Retrieval

Use Serena for a known file/symbol and scoped `rg` for literal text. Use Graphify when ownership or relationships are unclear. Read the source reached by a query before relying on its behavior.

```sh
python3 ~/.codex/skills/graphify/scripts/query.py renderResearch
python3 ~/.codex/skills/graphify/scripts/query.py geodesic --context call
```

The wrapper runs native Graphify against a temporary graph snapshot, disables query logging, preserves failures and caps each output stream at 3,200 characters. It visibly marks truncation. Narrow the query or increase `--max-chars` when the omitted context is necessary. The native `--budget` is not a hard limit: it can emit all edges when nodes fit.

The wrapper is installed in the user's local Graphify skill and is not included in this repository. On another machine, use Serena or scoped `rg` if it is unavailable; native Graphify requires separate output limiting and a temporary graph copy for strict read-only tasks.

## Observations

| Measurement | Before | After |
|---|---:|---:|
| Graphify skill entrypoint, characters | 41,612 | 2,655 |
| Graph nodes | 1,975 | 419 |
| Nodes sourced from vendored Three.js | 1,652 | 0 |
| Graph JSON, bytes | 2,477,414 | 423,723 |
| `renderAcademicContent` source location | stale L315 | current L321 |

Serena's `main.js` overview returned 678 characters; the complete file has 27,164 characters. These answer different questions: the overview locates symbols, not their implementation.

Identical native queries with `--budget 800` produced:

| Query | Old graph, chars | New graph, chars | New graph through wrapper, chars |
|---|---:|---:|---:|
| `renderResearch` | 2,870 | 9,058 | 3,129 |
| `geodesic` | 2,859 | 2,852 | 2,852 |

Both queries found the expected source before and after. Both wrapper results were visibly truncated; this verifies localization and the output cap, not complete architectural answers. A smaller graph does not automatically produce a shorter answer. No end-to-end billing reduction has been established. Caveman's counters remain local inferred statistics, not verified savings.

## Maintenance

- Graphify's standard hooks were installed locally on 2026-09-15: post-commit and post-checkout refresh code in the background, and the local `graphify` merge driver handles the rule in `.gitattributes`. Hooks and driver configuration live in `.git` and are not transferred by a clone; run `graphify hook install` in a new checkout. Logs: `~/.cache/graphify-rebuild.log`. Semantic documents still require the incremental workflow below.
- `.graphifyignore` excludes vendor internals, generated outputs and agent configuration; `.serena/project.yml` excludes vendor, dependency and generated graph directories. Serena reads updated configuration on project activation.
- `graphify extract . --code-only` refreshes code using local AST extraction and preserves the semantic layer. It does not refresh changed documents.
- For semantic changes, use the Graphify incremental workflow. Preserve unchanged sources, re-extract changed documents and prune deleted/excluded sources. Do not mark unread sources current.
- `graphify cluster-only . --no-label` regenerates outputs without automatic LLM labeling. Without this flag the installed implementation can auto-detect a backend or fall back to Claude CLI.
- The 2026-09-15 refresh covers 10 code files, 51 documents, 13 PDFs and one image. Existing unchanged semantic sources were retained after byte-hash comparison; 29 included documents and four new PDFs were read afresh. PDF indexing is not validation of scientific claims.
- Host-agent extraction usage was not metered. `cost.json` retains historical counters and explicitly records the unmetered refresh; report zero only for known-zero external calls, never for unknown agent usage.

## Verification performed

Skill validator and reference-link checks passed. Query tests covered expected source retrieval, hard output caps, no match, missing and malformed graphs, preserved exit failures, and unchanged source artifacts. Graph checks covered unique IDs, valid edge endpoints, source freshness, excluded/deleted sources, retained prior PDFs and all four new PDFs.

Repeat the two queries after a graph refresh and compare like-for-like output lengths and relevant source retrieval. For actual savings, compare equivalent completed tasks with measured model usage, including instruction loading, tool results, reasoning and subagents; do not substitute these size measurements for that experiment.
