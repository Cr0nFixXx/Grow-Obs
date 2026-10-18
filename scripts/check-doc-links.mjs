#!/usr/bin/env node
/**
 * Doc link check (npm run docs:check): finds broken relative Markdown links and backticked repo paths
 * in the living docs. Historical files (docs/archive, docs/CHANGELOG.md, docs/PROGRESS.md) are skipped
 * because they legitimately mention files that no longer exist.
 *
 *   node scripts/check-doc-links.mjs          – exit 1 when something is broken
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".archive", "archive", "syslibs", ".claude-worktrees"]);
const SKIP_FILES = new Set(["docs/CHANGELOG.md", "docs/PROGRESS.md"]);
/** Paths that are real but not committed (generated, secrets, runtime). */
/** Also ignored: paths mentioned on purpose although they do not exist (planned targets such as apps/web, the old src/pages). */
const IGNORED_PATHS = [/node_modules/, /^apps\/(web|mobile|desktop)(\/|$)/, /^src\/pages(\/|$)/, /^promo\/\.(render|frames)/, /^\.env/, /\.env$/, /^promo\/(music\.wav|shots|test|syslibs|\.frames)/, /^apps\/api\/(dist|\.env)/, /^(\.next|node_modules|dist|out)\//, /^test-results\//];
const ROOTS = ["app/", "apps/", "src/", "scripts/", "docs/", "e2e/", "public/", "promo/", ".github/", ".claude/"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".md")) out.push(path.relative(root, full).replaceAll("\\", "/"));
  }
  return out;
}

const problems = [];
const exists = (rel, fromDir) => [root, fromDir, path.join(root, "apps/api")].some((base) => existsSync(path.resolve(base, rel)));

for (const rel of walk(root)) {
  if (SKIP_FILES.has(rel)) continue;
  const text = readFileSync(path.join(root, rel), "utf8");
  const dir = path.dirname(path.join(root, rel));
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const url = m[1];
    if (/^(https?:|mailto:)/.test(url)) continue;
    if (!existsSync(path.resolve(dir, url))) problems.push(`${rel}: broken link (${url})`);
  }
  for (const m of text.matchAll(/`((?:\.[a-z]+\/)?[A-Za-z0-9_./-]+\.[a-z0-9]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]*)`/g)) {
    const p = m[1].replace(/\/$/, "");
    if (!ROOTS.some((r) => p.startsWith(r)) && !/^[A-Z]+\.md$/.test(p)) continue;
    if (/[*<>{}\[\]]/.test(p) || p.includes("...")) continue;
    if (IGNORED_PATHS.some((re) => re.test(p))) continue;
    if (!exists(p, dir)) problems.push(`${rel}: missing path (${p})`);
  }
}

if (problems.length) {
  console.error(`docs:check found ${problems.length} problem(s):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("docs:check ok");
