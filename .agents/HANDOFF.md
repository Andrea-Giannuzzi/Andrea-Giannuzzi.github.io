# HANDOFF

Coordination file shared between Claude Code and Codex sessions on this project.
Durable decisions, blockers, and expensive-to-derive findings go here — not a knowledge source, not a log.

Created: 2026-09-14

## Decisions

- 2026-09-20 — The Kerr–Newman simulator is developed **here**, on the site copy. The public repo `Andrea-Giannuzzi/Kerr-Newman-Black-Hole-Simulator` is a stale snapshot and is aligned later, one way only (site → repo). Do not merge or pull from it: that would regress the physics and delete the 3D layer.
- 2026-09-15 — Retrieve by ownership: Serena/scoped text search for known files and symbols; Graphify for broad relationships. `AGENTS.md` records the workflow; `.agents/TOOLING.md` records measurements and maintenance. Filter tool output before compression and avoid duplicate result representations.

## Blockers

## Findings

- 2026-09-15 — Agent tooling audit: Serena is active for this project with the TypeScript language server and `no-memories`; `get_symbols_overview` successfully returns a compact function index for `assets/js/main.js`. Prefer symbol retrieval when the owning file is already known.
- 2026-09-15 — Graph refresh now has 419 nodes with vendor internals excluded by `.graphifyignore`; it includes current code, refreshed pages and all four new de Sitter PDFs. `renderAcademicContent` resolves to current L321; deleted `about.html` is pruned. Unchanged semantic sources were retained only after hash verification.
- 2026-09-15 — Native `graphify query` writes `cache/last_query_stamp` and can exceed `--budget` when it includes edges. The installed skill's `scripts/query.py` uses a temporary snapshot, disables logging and enforces a visible character cap. Use `graphify cluster-only . --no-label`: default labeling can invoke an external backend or Claude CLI. *(2026-09-20: the wrapper now exists for both agents — see below.)*
- 2026-09-15 — Caveman MCP reports local inferred compression, not verified billing savings. The Graphify entrypoint was reduced from 41,612 to 2,655 characters; detailed build instructions are loaded on demand. Query comparisons and their limitations are in `.agents/TOOLING.md`; the semantic refresh's model usage is unmeasured. *(2026-09-20: that reduction had only ever been applied to the Codex skill — see below.)*
- 2026-09-20 — **The 2026-09-15 Graphify hardening had been applied to `~/.codex/skills/graphify/` only.** `~/.claude/skills/graphify/` had no `scripts/` directory at all and still shipped the original 41,276-byte `SKILL.md`, so `AGENTS.md`'s instruction to use `scripts/query.py` was false for Claude Code, which had no output cap. Both skill copies are now byte-identical (SKILL.md, `scripts/query.py`, and the `build.md` / `query-fallback.md` / hardened `query.md` / `--no-label` `update.md` references); pre-change files kept as `*.bak-pre-2026-09-20` next to them. Verified: a wrapper query returned 1116 chars under a 1200 cap and left `graphify-out/cache/last_query_stamp` untouched.
- 2026-09-20 — **The simulator exists in two divergent copies and this repo is the canonical one.** Site: 1116 lines / 41 exports with the 3D layer, disk and lensing. `~/Desktop/Codex/Kerr-Newman-Black-Hole-Simulator`: 711 / 25, frozen at a single commit of 18 August 2026. `assets/js/content.js:694` and `:1594` send visitors to that snapshot — a knowingly accepted state, not an oversight. Alignment is agreed but deferred; development continues here. Full audit in `.agents/SIMULATOR-AUDIT.md` (local only, gitignored: this repo is public), constraints for the eventual sync in that repo's own `.agents/HANDOFF.md`.
- 2026-09-20 — **The 3D layer has no test coverage.** `tests/*.test.cjs` exercise the physics core, the ZAMO tetrad and lensing/disk; nothing touches `assets/js/black-hole-3d.js` (1219 lines), three.js, WebGL or the DOM wiring. Largest coverage gap, on the largest file.
- 2026-09-20 — **Serena memories are writable from Claude Code but disabled on Codex.** Codex runs the server with `--mode no-memories` (`~/.codex/config.toml`); the Claude plugin runs modes `editing, interactive`, leaving `write_memory`/`read_memory`/`delete_memory` active. Anything written to a Serena memory would therefore be invisible to Codex sessions. Do not use Serena memories as the cross-agent store — `.agents/HANDOFF.md` is the only one both sides read. Claude also needs an explicit `activate_project` (Codex auto-activates via `--project-from-cwd`).

- 2026-09-20 — **Serena's `get_symbols_overview` needs `depth=1` on this repo's JS.** Every `assets/js/*.js` file is IIFE-wrapped, so the default depth returns only the anonymous wrapper (`{"Function": ["<function>"]}`). With `depth=1` it descends and returns the full index — 42 functions for `black-hole-physics.js`. Language server backend is LSP/typescript, status ready.

- 2026-09-20 — `graphify-out/` is no longer tracked: the staged `git rm --cached` from an earlier session was completed, `graphify-out/` added to the project `.gitignore` (the global `~/.config/git/ignore` already had it, but does not travel with the repo), and `.gitattributes` deleted since its only line was a merge driver for the now-untracked `graphify-out/graph.json`. The graph itself is current — built 2026-09-15 at commit `73ad859`; every commit since touched only `.graphifyignore`-excluded paths, so the stale "Graph Freshness" line is cosmetic and **no rebuild is needed**.
