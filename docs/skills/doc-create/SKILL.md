---
name: doc-create
description: Create a new documentation file in any software project - decide whether a file is needed, choose location and language, gather facts from the source, write it with a consistent structure, register it in the doc map and verify it. Use when asked for a new document, guide, README or spec, or when a topic has no home yet.
---

# doc-create (generic)

A project-independent skill. Fill in the **project bindings** once (or let the agent discover them from the repo), then follow the steps.
A Grow|Obs-specific version lives in `.claude/skills/doc-create/SKILL.md`.

## Project bindings (fill in or discover)
| Binding | Meaning | Example |
|---|---|---|
| `DOC_MAP` | file that lists every document, its purpose and language | the doc table in the main agent guide |
| `ROOT_DOCS` | the few documents allowed at the repo root | README, CONTRIBUTING, ARCHITECTURE |
| `DOC_DIR` | folder for all other docs | `docs/` |
| `ARCHIVE_DIR` | folder for superseded docs | `docs/archive/` |
| `LANG_RULES` | language per document or audience | “agent docs English, user docs German” |
| `SINGLE_SOURCES` | where each kind of fact lives | versions → version file, endpoints → API doc |
| `CHANGELOG` / `PROGRESS` | where finished work is recorded | `docs/CHANGELOG.md` |
| `LINK_CHECK` | command that finds broken links, or “none” | `npm run docs:check` |

If a binding is unknown and cannot be discovered, **ask the owner** instead of guessing.

## 1. Decide whether a new file is needed
1. Read `DOC_MAP`. If a document already owns the topic, extend it.
2. One source per fact. Link to the source; never copy numbers, versions, endpoints or state into a second file.
3. Superseded content is moved to `ARCHIVE_DIR`, not deleted.

## 2. Place it
- Long-lived onboarding/agent docs: repo root, but only names in `ROOT_DOCS`.
- Topic docs (testing, history, vision, logs): `DOC_DIR`.
- A guide that belongs to one folder or tool: next to that folder (e.g. `tools/foo/README.md`).
- Language: follow `LANG_RULES`; a new file follows the nearest existing document.

## 3. Gather facts from the source of truth
- Read the code, scripts and configs; run the commands you document and keep real results.
- Write “not verified” for anything you could not run. Never invent numbers, performance claims or promises.

## 4. Write it
```
# NAME.md
1–2 lines: what it is, for whom, status (draft / test / stable).
## 1. Summary           key facts as a table
## 2…n. Chapters         numbered; tables for lookups, fenced blocks for commands
## Troubleshooting · Limitations · Next steps   (when relevant)
```
- Table of contents only for long files (> ~150 lines).
- Relative links between docs; paths and identifiers in backticks.
- No author signatures and no version tags in living docs; history belongs in the changelog.
- Include how to rebuild or verify the thing described.

## 5. Register and verify
1. Add the file to `DOC_MAP` (and the README doc table if user-facing).
2. Add a changelog/progress entry.
3. Run `LINK_CHECK`; re-read the file once against the code (every path, command and number exists).
4. Commit with a message like `Docs: <what>`. Do not push unless asked.
5. Report to the owner what was written, what was verified and what was not.
