---
name: doc-create
description: Create a new documentation file for Grow|Observer (new doc, new topic, new feature guide). Use when the owner asks for a document, a README for a folder, a guide or a spec, or when a topic has no home in the existing docs. Covers placement, language, structure, verification against the code and registration in the doc map.
---

# doc-create (Grow|Observer)

Create a document that fits the existing doc system instead of adding a loose file.
A generic, project-independent version of this skill lives in `docs/skills/doc-create/SKILL.md`.

## 0. Decide whether a new file is needed
1. Read the doc map in `CLAUDE.md` §5. If an existing file already owns the topic, **extend that file** instead.
2. Single source per fact: versions → `version.json`, test numbers → `docs/TESTING.md`, endpoints and env vars → `apps/api/README.md`, current state → `HANDOFF.md`, open work → `TODO.md`. A new file may link to these, never copy them.
3. If unsure whether the topic deserves its own file, or which language/placement the owner wants, **ask the owner** before writing.

## 1. Choose location and language
| Kind of document | Location | Language |
|---|---|---|
| Agent- or onboarding-relevant, long-lived | repo root (only the seven root docs exist: README, CLAUDE, DESIGN, TODO, PLAN, HANDOFF, ARCHITECTURE) | see table below |
| Everything else (testing, history, product vision, logs) | `docs/` | see table below |
| Guide that belongs to one folder or tool | next to the code, e.g. `apps/api/README.md`, `promo/PROMODEMO.md` | English unless the owner says otherwise |
| Superseded document | `docs/archive/<NAME>-bis-B<nn>.md` (never delete history) | unchanged |
| Reusable agent skill | `.claude/skills/<name>/SKILL.md` (+ generic copy in `docs/skills/`) | English |

Language: **English** for CLAUDE, DESIGN, HANDOFF, PLAN, TESTING, TODO, ARCHITECTURE, PROMODEMO and skills. **German** for README, `apps/api/README.md`, CHANGELOG, PROGRESS, MILESTONES. A new file follows the language of the file it is closest to; if there is no match, ask the owner. Chat answers to the owner are German.

## 2. Gather facts from the source of truth
- Read the code, scripts and configs the document describes. Do not rely on older docs or memory.
- Run the commands you are going to document and keep the real output/result (counts, durations, exit codes).
- Anything you could not run or verify is written down as **not verified**, never as fact.
- Do not invent numbers, user counts, performance claims or feature promises.

## 3. Write the file
Skeleton (shorten for small docs):
```
# FILE.md
One or two lines: what this document is and for whom. Status line if it is a draft or test.
## 1. Summary            (table of key facts)
## 2. … numbered chapters (tables for lookups, code blocks for commands, short paragraphs)
## n. Troubleshooting / Limitations / Next steps
```
Rules:
- H1 = file name. Numbered H2 chapters. Add a table of contents only above ~150 lines.
- Commands in fenced blocks; paths and identifiers in backticks; **relative** links between docs.
- Tables over prose for anything a reader will look up. State units and where a number comes from.
- Living docs carry **no agent signatures and no `v0.x` version tags**; versions are referenced via `version.json`. History belongs in `docs/CHANGELOG.md`.
- Include how to rebuild/verify, known limitations and pitfalls when the topic has any.
- Do not duplicate: link to the single source.

## 4. Register the document
1. Add a row to the doc map in `CLAUDE.md` §5 (file, content, language) and, if it is user-facing, to the doc table in `README.md`.
2. If it adds a folder or a script, update the repo map in `HANDOFF.md`.
3. Add a `docs/CHANGELOG.md` entry (German, with a “Geprüft” line) and a row on top of `docs/PROGRESS.md` (German).
4. If the document replaces older content, move the old file to `docs/archive/` and link the new one.

## 5. Verify before reporting done
- `npm run docs:check` must print `docs:check ok` (broken links and missing paths).
- Re-read the file once against the code: every path, command, number and name exists/is true.
- Run `npm run version:build` after the task (see skill `version-bump`).
- Commit locally as `Docs: <what>`. Push only when the owner says so.
- If the owner asked to review files one by one: open the file with `present_file`, ask for approval, then commit.
