---
name: version-bump
description: Handle versions and build numbers in Grow|Obs. Use after every completed task to refresh the build number (npm run version:build), and when the owner explicitly assigns a new frontend or backend version. Explains version.json, derived files, commands, checks and what an agent must never do.
---

# version-bump (Grow|Obs)

Generic, project-independent version: `docs/skills/version-bump/SKILL.md`.

## 1. Rules (owner decisions)
- **The owner assigns versions.** Change `frontend.version`, `backend.version` or `frontend.codename` **only on explicit instruction**. Never bump “because a feature landed”.
- The codename **“Ruderalis” is fixed and means the frontend**; the backend has no codename.
- Frontend and backend are versioned **separately**; per-module versions are prepared but empty.
- **No git tags or releases.** Versioning = central config + display.
- The **build number** (`YYMMDDHH`, Europe/Berlin) is refreshed after **every completed task** (code or docs).
- Current numbers: `npm run version:show` (do not copy them into living docs; link to `version.json`).

## 2. Where things live
| What | Where |
|---|---|
| Single source | `version.json` (`frontend.codename`, `frontend.version`, `backend.version`, `build`, `modules`) |
| Derived, never edit by hand | `package.json`, `package-lock.json`, `apps/api/package.json`, `apps/api/package-lock.json`, `apps/api/src/version.generated.ts` |
| Tool | `scripts/version.mjs` (`npm run version:show`, `version:sync`, `version:check`, `version:build`) |
| Shown to users | login footer, settings/update area, Developer-Admin, `GET /api/version`, standalone API `GET /version` |
| Guard | CI runs `version:check`; `tests/unit/lib/version.test.ts` checks consistency |

Module versions: key `frontend.<module>` or `backend.<module>` with `{ "version": "x.y.z" }`; a module without an entry inherits the version of its component.

## 3. Routine: refresh the build number (every finished task)
1. Finish the task and its docs first (skill `doc-maintain`).
2. `npm run version:build` – sets `build` to the current Berlin hour and syncs all derived files.
3. `npm run version:check` – must print `version:check ok …`.
4. Commit the changed files (`version.json`, `apps/api/src/version.generated.ts`) with the task or as `chore: build <number>`.
5. If `docs/TESTING.md` names the build of the last full run, update it only when you actually re-ran the suites.
Two tasks in the same hour get the same number; that is expected. Dry run for a given time: `node scripts/version.mjs print-build --date <ISO>`.

## 4. Owner-requested version change
1. Get the exact new number from the owner (semver `x.y.z`, optional `-pre`); never invent one.
2. Edit only the requested field(s) in `version.json`.
3. `npm run version:sync` (updates package files and the generated backend file), then `npm run version:check`.
4. Run `npx vitest run` (the version consistency test) and, if the backend version changed, `npm run test:api` or at least the backend typecheck.
5. Refresh the build number (section 3).
6. Docs: add a `docs/CHANGELOG.md` entry that states old → new version and who decided; note a numbering reset if the scheme changed. Update places that quote the version in prose (e.g. the “State” line in `HANDOFF.md`, hard-coded text such as the footer in `promo/scene.html`); `npm run docs:check` and a `grep` for the old number find them.
7. Report the new `npm run version:show` output to the owner.

## 5. Never
- Hand-edit derived files or the generated backend file.
- Bump a version to match a build number, or the other way round.
- Create tags, releases or GitHub release notes unless the owner asks.
- Put `v0.x` tags or agent signatures into living docs.
- Change the codename.
