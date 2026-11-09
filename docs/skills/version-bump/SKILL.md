---
name: version-bump
description: Manage versions and build numbers safely in any project - keep one source of truth, refresh the build number after each finished task, change versions only when the owner decides, verify derived files and update docs. Use after finishing a task or when asked to bump a version.
---

# version-bump (generic)

A project-independent skill. Fill in the **project bindings** (or discover them) before acting.
A Grow|Obs-specific version lives in `.claude/skills/version-bump/SKILL.md`.

## Project bindings
| Binding | Meaning | Example |
|---|---|---|
| `VERSION_SOURCE` | the single file that holds all versions | `version.json`, `VERSION`, `pyproject.toml` |
| `DERIVED` | files generated or synced from the source (never hand-edited) | package manifests, lockfiles, generated constants |
| `SYNC_CMD` / `CHECK_CMD` | commands that sync and verify derived files | `npm run version:sync` / `version:check` |
| `BUILD_CMD` | command that refreshes the build number, or “none” | `npm run version:build` |
| `BUILD_SCHEME` | format and timezone of the build number | `YYMMDDHH`, Europe/Berlin |
| `WHO_DECIDES` | who assigns version numbers | the owner |
| `DISPLAY` | where the version is shown | UI footer, `/version` endpoint |

## 1. Rules
- **Version numbers are decided by `WHO_DECIDES`.** Do not change them on your own initiative; never invent a number.
- Keep **one** source. Derived files are produced by tooling; if the tooling is missing, create it instead of editing several files by hand.
- The **build number** identifies a build, not a release. Refresh it after every finished task if the project does that.
- No tags, releases or release notes unless asked.
- Do not copy the current version into prose docs; link to `VERSION_SOURCE`. Where it is quoted anyway, update it in the same commit.

## 2. Routine: refresh the build number
1. Finish the task and its docs.
2. Run `BUILD_CMD`.
3. Run `CHECK_CMD`; it must pass.
4. Commit the changed files with the task or as `chore: build <number>`.
Two tasks inside one build window get the same number; that is fine.

## 3. Owner-requested version change
1. Get the exact new number (semantic versioning `MAJOR.MINOR.PATCH[-pre]`).
2. Edit only the requested field(s) in `VERSION_SOURCE`.
3. Run `SYNC_CMD`, then `CHECK_CMD`.
4. Run the tests that cover version consistency and, if a component version changed, that component's tests/typecheck.
5. Refresh the build number (section 2).
6. Add a changelog entry: old → new version, who decided, and a note if the numbering scheme was reset.
7. Search for the old number in docs and hard-coded text (`grep -rn "<old>" .`) and update what is meant to show the current version.
8. Report the resulting version output to the owner.

## 4. Never
- Hand-edit derived files.
- Bump a version to match a build number (or the reverse).
- Create tags or releases unasked.
- Put version tags or signatures into living docs.
