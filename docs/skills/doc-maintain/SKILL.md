---
name: doc-maintain
description: Keep project documentation true after every finished task - update the right files from a change matrix, write measured results into the changelog, remove stale statements, run a link check and report what is verified. Use after completing any task, when numbers or behavior changed, or when asked for a documentation review.
---

# doc-maintain (generic)

A project-independent skill. Fill in the **project bindings** (or discover them), then run the procedure after each task.
A Grow|Observer-specific version lives in `.claude/skills/doc-maintain/SKILL.md`.

## Project bindings
| Binding | Meaning |
|---|---|
| `CHANGELOG` | per-task history, newest first (with measured results) |
| `PROGRESS` | optional one-line log per task |
| `TODO` | open work only |
| `TEST_STATUS` | single source for test numbers and release gates |
| `API_DOC` | single source for endpoints, config and operation |
| `STATE_DOC` | single source for current state, pitfalls, limitations |
| `ARCH_DOC` | architecture and invariants |
| `VERSION_SOURCE` | single source for versions (see skill `version-bump`) |
| `LINK_CHECK` | command that finds broken links, or “none” |
| `LANG_RULES` | language per document |

## 1. Principles
- **Measured only.** Document numbers you ran; state explicitly what you did **not** run.
- **Single source per fact.** Link to it; do not copy it.
- **Living docs describe the present.** History goes to `CHANGELOG`; replaced text is moved to an archive folder (never deleted silently).
- No author signatures and no version tags inside living docs.

## 2. Update matrix
| Change | Update |
|---|---|
| any finished task | `CHANGELOG` entry · `PROGRESS` row · `TODO` (remove done, add new) |
| test counts, suites, gates | `TEST_STATUS` |
| endpoint, config, ops step | `API_DOC` (and the example env file) |
| layer, flow, invariant, schema | `ARCH_DOC` |
| state, pitfall, limitation, repo layout | `STATE_DOC` |
| roadmap decision or phase status | the plan document |
| new, renamed or removed doc/script/folder | doc map, README table, repo map |
| version or build number | `VERSION_SOURCE` via skill `version-bump` |

## 3. Changelog entry format
```
### <task id> – Short title
- **Added / Changed / Fixed:** behavior and impact, not file lists
- **Behavior change:** what users or operators will notice
- **Tests:** suite a → b (what the new tests cover)
- **Verified:** typecheck ✅ lint ✅ build ✅ …   **Not verified:** what was skipped and why
```
Tasks without code say “no code changed”.

## 4. Procedure
1. Collect facts: `git diff --stat`, real command output, new config keys or endpoints.
2. Apply the matrix; make the smallest change that makes each doc true again.
3. **Staleness sweep:** grep the living docs for old counts, renamed files and removed features; fix every hit outside the archive and the changelog.
4. Run `LINK_CHECK`.
5. Refresh the build/version metadata if the project does that per task.
6. Commit (`Docs: …` or together with the code). Do not push unless the owner asks.
7. Report: what was updated, which numbers are measured, what remains unverified.

## 5. Cleanup mode (review of all docs)
Go file by file: rewrite → show the owner → get approval → commit. Move removed content to its target file or the archive first, keep a ledger of what moved where, finish with a link check across all docs.
