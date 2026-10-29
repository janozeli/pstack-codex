#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compileMarkdown, compileAudit, compilePlanChecker, runtime } from "./standalone/compile.mjs";

import { rewriter } from "./standalone/edits.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PSTACK = join(ROOT, "pstack");
const SKILLS = join(PSTACK, "skills");
// Outside pstack/ so Cursor, which copies the whole plugin folder, does not install this tree too.
const OUT = join(ROOT, "harness", "pstack");
const GUIDE = "docs/guide";
// Codex ignores `disable-model-invocation`, and this file keeps the skill out of its model catalog.
const CODEX_POLICY = { path: "agents/openai.yaml", text: "policy:\n  allow_implicit_invocation: false\n" };
const TARGETS = [
  {
    tree: "claude-code",
    harness: "Claude Code",
    manifests: ["plugin.json", ".claude-plugin/plugin.json"],
    manifestFields: { version: "0.15.36-claude.4", homepage: "https://github.com/janozeli/pstack-port", repository: "https://github.com/janozeli/pstack-port" },
  },
  {
    tree: "codex",
    harness: "Codex",
    manifests: [".codex-plugin/plugin.json"],
    manifestFields: { skills: "./skills/", version: "0.15.36-codex.3", homepage: "https://github.com/janozeli/pstack-port", repository: "https://github.com/janozeli/pstack-port" },
    userInvoked: CODEX_POLICY,
  },
];
const COMMAND = "node scripts/generate-pstack-harness-trees.mjs";
const LINK = /\]\(([^)\s]+)\)/g;
const README = `# Generated standalone packages

Edit the shared source in pstack/ and the host compiler in scripts/standalone/, then run ${COMMAND}. Each package contains native instructions, runtime contracts, skill references, and its own history reader. No runtime translation adapter is installed. Both targets preserve the source skill and playbook inventory.
`;

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

const skills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));

const problems = [];
const userInvoked = new Set();
for (const skill of skills) {
  const frontmatter = readFileSync(join(SKILLS, skill, "SKILL.md"), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const name = frontmatter.match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (/^disable-model-invocation:\s*true\s*$/m.test(frontmatter)) userInvoked.add(skill);
  if (name !== skill) problems.push(`skills/${skill}/SKILL.md has name ${JSON.stringify(name ?? "")}, not its folder name ${skill}`);
  if (!SKILL_NAME.test(skill) || skill.length > 64) problems.push(`skills/${skill} is not lowercase words joined by hyphens, at most 64 characters`);
}
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);

// The pstack-relative path that a relative link in `from` points at, if that path exists.
function resolve(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = posix.join(posix.dirname(from), target).replace(/\/$/, "");
  return existsSync(join(PSTACK, path)) ? path : undefined;
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

function render({ harness, manifests, manifestFields, userInvoked: policy }, emit) {
  const trace = (path) => (step) => emit?.(path, step);
  // Compile the shared methodology into native instructions before packaging.
  const copies = [
    ...walk(SKILLS),
    ...walk(join(PSTACK, "agents")),
    ...walk(join(PSTACK, GUIDE)),
    join(PSTACK, "README.md"),
  ];
  const files = new Map(copies.map((path) => [relative(PSTACK, path), file(path)]));
  const nativeHistory = harness === "Codex" ? "codex" : "claude";
  files.delete(`skills/poteto-mode/scripts/${nativeHistory === "codex" ? "claude" : "codex"}-worktree-activity.mjs`);
  for (const name of ['check-plan.mjs', 'check-plan.test.ts']) {
    const entry = files.get(`skills/poteto-mode/scripts/${name}`);
    entry.bytes = Buffer.from(compilePlanChecker(entry.bytes.toString('utf8'), trace(`skills/poteto-mode/scripts/${name}`)));
  }
  const audit = files.get("skills/poteto-mode/scripts/worktree-audit.sh");
  audit.bytes = Buffer.from(compileAudit(audit.bytes.toString("utf8"), harness, trace("skills/poteto-mode/scripts/worktree-audit.sh")));
  files.set("docs/runtime.md", { bytes: Buffer.from(runtime(harness)), executable: false });
  for (const [path, entry] of files) {
    if (path.endsWith(".md") && path !== "docs/runtime.md") {
      entry.bytes = Buffer.from(compileMarkdown(path, entry.bytes.toString("utf8"), harness, skills, trace(path)));
    }
  }
  files.set("LICENSE", file(join(PSTACK, "LICENSE")));
  const manifest = file(join(PSTACK, "plugin.json"));
  if (manifestFields) {
    manifest.bytes = Buffer.from(`${JSON.stringify({ ...JSON.parse(manifest.bytes), ...manifestFields }, null, 2)}\n`);
  }
  for (const path of manifests) files.set(path, { ...manifest });
  if (policy) {
    for (const skill of userInvoked) files.set(`skills/${skill}/${policy.path}`, { bytes: Buffer.from(policy.text), executable: false });
  }
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = rewriter(trace(path)).replace(entry.bytes.toString("utf8"), LINK, (link, href) => {
      const target = resolve(path, href);
      if (!target || target.split("/")[0] === ".." || has(files, target)) return link;
      const kind = statSync(join(PSTACK, target)).isDirectory() ? "tree" : "blob";
      return `](https://github.com/janozeli/pstack-${harness === "Codex" ? "codex" : "claude"}/${kind}/main/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(text);
  }
  return files;
}

export { render, TARGETS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
// Each harness installs only its tree, so a relative link that works from pstack/ has to work inside the tree too.
// Links to pstack files that the tree leaves out already point at GitHub, so a failure here is a link that leaves pstack/.
const rendered = new Map([["README.md", { bytes: Buffer.from(README), executable: false }]]);
const dangling = [];
for (const target of TARGETS) {
  const files = render(target);
  for (const [path, entry] of files) {
    rendered.set(`${target.tree}/${path}`, entry);
    if (!path.endsWith(".md")) continue;
    for (const [, href] of entry.bytes.toString("utf8").matchAll(LINK)) {
      const linked = resolve(path, href);
      if (linked && !has(files, linked)) dangling.push(`harness/pstack/${target.tree}/${path} links to ${href}, which is not in the tree`);
    }
  }
}
for (const link of dangling) console.log(`FAIL ${link}`);
if (dangling.length > 0) process.exit(1);

if (process.argv.includes("--check")) {
  const onDisk = new Map(existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : []);
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [rendered.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(`harness/pstack/${path}`);
  if (drifted.length > 0) {
    console.log(`harness/pstack is out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log("harness/pstack is up to date.");
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), bytes);
    chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
  }
  console.log(`${skills.length} standalone skills per host; ${userInvoked.size} hidden from the Codex model`);
}

}
