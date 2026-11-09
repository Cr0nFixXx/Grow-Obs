---
name: doc-maintain
description: Keep the Grow|Obs documentation correct after a task is finished. Use after every completed task (code or docs), when numbers, endpoints, architecture, state or phase status changed, or when the owner asks for a doc check or cleanup. Gives the update matrix, entry formats, a staleness sweep and the finishing steps.
---

# doc-maintain (Grow|Obs)

Standing owner rule: **docs are maintained after every completed task and must show the measured state.**
Generic, project-independent version: `docs/skills/doc-maintain/SKILL.md`.

## 1. Principles
- **Measured only.** Write numbers you actually ran. Say explicitly what was **not** run or verified (Docker/MinIO and real-device touch have never been tested).
- **Single source per fact:** versions → `version.json`; test numbers → `docs/TESTING.md`; endpoints/env/operation → `apps/api/README.md`; current state, pitfalls, limitations → `HANDOFF.md`; open work → `TODO.md`; architecture → `ARCHITECTURE.md`; design rules → `DESIGN.md`; roadmap/phase status → `PLAN.md`; product vision → `docs/MILESTONES.md`. Link instead of copying.
- **No history in living docs.** No agent signatures, no `v0.x` tags. History goes to `docs/CHANGELOG.md`; replaced text goes to `docs/archive/<NAME>-bis-B<nn>.md` (never delete content silently).
- **Languages:** English: CLAUDE, DESIGN, HANDOFF, PLAN, TESTING, TODO, ARCHITECTURE, PROMODEMO. German: README, `apps/api/README.md`, CHANGELOG, PROGRESS, MILESTONES.

## 2. Update matrix (what changed → what to touch)
| Change | Files |
|---|---|
| **Every finished task** | `docs/CHANGELOG.md` entry · `docs/PROGRESS.md` new row on top · `TODO.md` (remove finished items, add new ones, update “Recently finished”) |
| Test counts, new suites, gates run | `docs/TESTING.md` status table (“Last full run”: task, HEAD, build) |
| Endpoint, request/response, env var, ops step | `apps/api/README.md` (and `.env.example` if a variable changed) |
| Layer, flow, invariant, migration, mode | `ARCHITECTURE.md`; invariants also in `CLAUDE.md` §3 if they are rules for agents |
| State, pitfall, limitation, repo map | `HANDOFF.md` (the “State: B-nn” line, §3–5) |
| UI tokens, components, layout pitfalls | `DESIGN.md` |
| Phase status, decision | `PLAN.md` §1–2 (and `docs/MILESTONES.md` §7 table if a milestone moved) |
| New or renamed doc/script/folder | doc map in `CLAUDE.md` §5, `README.md` table, `HANDOFF.md` repo map; see skill `doc-create` |
| Version or build number | skill `version-bump` |

## 3. Entry formats
**`docs/CHANGELOG.md`** (German; newest first, under the “## [Unreleased] – Frontend …” heading):
```
### B-nn – Short title
- **Neu / Geändert / Fix:** what changed and why it matters (behavior, not file lists)
- **Verhaltensänderung:** anything users or operators will notice
- **Tests:** Frontend a → b, API a → b, E2E a → b (what the new tests cover)
- **Geprüft:** typecheck ✅ lint ✅ builds ✅ … **Nicht geprüft:** what was skipped and why
```
B-nn is the last number in `docs/PROGRESS.md` plus one. Pure documentation or tooling tasks use a title without a number (e.g. “Docs – …”) and say “kein Code geändert”. No agent signature.

**`docs/PROGRESS.md`** (German): one table row on top: `| B-nn | what was built (one line) | measured result (typecheck, lint, vitest, API, E2E) |` (columns: `#`, `Stand`, `Ergebnis`).

**`TODO.md`:** open items only, grouped by priority. Finished items are deleted there and recorded in the changelog.

## 4. Procedure
1. Collect the facts: `git diff --stat`, the test/lint/build output of this task, new env vars or endpoints.
2. Update the files from the matrix (smallest change that makes the doc true again).
3. **Staleness sweep:** search the docs for old numbers, renamed files and removed features, e.g.
   `grep -rn "<old count>\|<old name>" README.md CLAUDE.md DESIGN.md TODO.md PLAN.md HANDOFF.md ARCHITECTURE.md apps/api/README.md docs --include=*.md`
   and fix every hit outside `docs/archive/` and `docs/CHANGELOG.md`.
4. `npm run docs:check` → must print `docs:check ok`.
5. `npm run version:build` (skill `version-bump`), then commit: code and docs together or a separate `Docs: …` commit. **Never push** unless the owner asks; the owner pulls patches or tells you to push.
6. Report in German: what was updated, which numbers are measured, what is still unverified.

## 5. Cleanup mode (owner asks for a review of all docs)
Go file by file: rewrite → show it to the owner (`present_file`) → ask for approval → local commit. Move removed content to its target file or to `docs/archive/` first. Keep a short ledger of what moved where while working, and fix stale links at the end with `npm run docs:check`.
