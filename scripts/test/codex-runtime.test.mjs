import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "pstack/skills/poteto-mode/scripts");

function fixture(t, worktreeName = "work tree [1]") {
  const dir = mkdtempSync(join(tmpdir(), "pstack-codex-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const worktree = join(dir, worktreeName);
  const bin = join(dir, "bin");
  mkdirSync(home);
  mkdirSync(repo);
  mkdirSync(bin);
  for (const name of ["gh", "origin"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, name), 0o755);
  }
  const env = { ...process.env, HOME: home, CODEX_HOME: join(home, "custom-codex"), PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, stdio: "pipe" });
  git("init", "-q");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "initial");
  git("worktree", "add", "-qb", "worker", worktree);
  const transcript = (cwd, message = "working", archive = false, name = "session") => {
    const path = join(env.CODEX_HOME, archive ? "archived_sessions" : "sessions/2026/10/29", `rollout-${name}.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ type: "session_meta", payload: { id: name, cwd } })}\n${JSON.stringify({ type: "event_msg", payload: { message } })}\n`);
    return path;
  };
  const audit = (script = join(source, "worktree-audit.sh"), args = ["--harness", "codex"]) => {
    const result = spawnSync("bash", [script, ...args, "-b", "HEAD", repo], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const row = result.stdout.trim().split("\n").at(-1).split("\t");
    assert.equal(row[8], worktree, result.stdout);
    return { lastChat: row[6], bucket: row[7], stderr: result.stderr };
  };
  return { dir, home, repo, worktree, env, transcript, audit };
}

test("a recent Codex session in a worktree prevents an inactive classification", (t) => {
  const f = fixture(t);
  f.transcript(f.worktree);
  const result = f.audit();
  assert.equal(result.bucket, "verify-recent-chat");
  assert.notEqual(result.lastChat, "-");
});

test("archived sessions and references from the main checkout count as activity", (t) => {
  const f = fixture(t);
  f.transcript(f.repo, `inspect '${f.worktree}/file.ts'`, true);
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("another project's session cannot mark a worktree active", (t) => {
  const f = fixture(t);
  const path = f.transcript(join(f.dir, "unrelated"), f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "unrelated content is not valid JSON\n");
  assert.equal(f.audit().bucket, "safe");
});

test("similar path prefixes do not mark a worktree active", (t) => {
  const f = fixture(t);
  f.transcript(f.repo, `inspect '${f.worktree}-other/file.ts'`);
  assert.equal(f.audit().bucket, "safe");
});

test("a descendant cwd is activity even without a path in the messages", (t) => {
  const f = fixture(t);
  f.transcript(join(f.worktree, "src"));
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("a missing descendant under a worktree alias still counts as activity", (t) => {
  const f = fixture(t);
  const alias = join(f.dir, "alias");
  symlinkSync(f.worktree, alias, "dir");
  f.transcript(join(alias, "deleted-child"));
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("a missing descendant through a symlink outside the repo stays out of scope", (t) => {
  const f = fixture(t);
  const external = join(f.dir, "external");
  mkdirSync(external);
  const alias = join(f.repo, "external");
  symlinkSync(external, alias, "dir");
  const path = f.transcript(join(alias, "deleted-child"), f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "external content is not valid JSON\n");
  assert.equal(f.audit().bucket, "safe");
});

test("a dangling symlink to a removed project does not expose its session content", (t) => {
  const f = fixture(t);
  const alias = join(f.repo, "external");
  symlinkSync(join(f.dir, "removed-other-project"), alias, "dir");
  const path = f.transcript(join(alias, "deleted-child"));
  writeFileSync(path, readFileSync(path, "utf8") + "external content is not valid JSON\n");
  assert.equal(f.audit().bucket, "safe");
});

test("unreadable session evidence never becomes a safe classification", (t) => {
  const f = fixture(t);
  const path = f.transcript(f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "invalid JSON\n");
  const result = f.audit();
  assert.equal(result.bucket, "review-history");
  assert.match(result.stderr, /Codex.*history|history.*Codex/);
});

test("the Codex package selects its history reader without an explicit flag", (t) => {
  const f = fixture(t, "worktree");
  f.transcript(f.worktree);
  const plugin = join(f.dir, "plugin");
  const scripts = join(plugin, "skills/poteto-mode/scripts");
  cpSync(join(root, "harness/pstack/codex"), plugin, { recursive: true });
  assert.equal(f.audit(join(scripts, "worktree-audit.sh"), []).bucket, "verify-recent-chat");
});

test("a partially written final record keeps the session's activity", (t) => {
  const f = fixture(t);
  const path = f.transcript(f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + '{"type":');
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("the source keeps Cursor transcript behavior", (t) => {
  const f = fixture(t);
  const slug = f.repo.replace(/^\//, "").replaceAll("/", "-");
  const transcript = join(f.home, ".cursor/projects", slug, "agent-transcripts/chat.jsonl");
  mkdirSync(dirname(transcript), { recursive: true });
  writeFileSync(transcript, JSON.stringify({ message: `${f.worktree}/file.ts` }) + "\n");
  assert.equal(f.audit(undefined, []).bucket, "verify-recent-chat");
});

function marketplaceFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "pstack-marketplace-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const copy = (path) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(root, path), join(dir, path));
  };
  copy("scripts/validate-plugins.mjs");
  for (const path of ["schemas/marketplace.schema.json", "schemas/plugin.schema.json"]) copy(path);
  for (const path of [".cursor-plugin/marketplace.json", ".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"]) {
    copy(path);
    for (const entry of JSON.parse(readFileSync(join(root, path))).plugins) {
      const source = typeof entry.source === "string" ? entry.source : entry.source.path;
      for (const manifest of [".cursor-plugin/plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "plugin.json"]) {
        const candidate = join(source, manifest);
        if (existsSync(join(root, candidate))) copy(candidate);
      }
    }
  }
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
  const validate = () => spawnSync(process.execPath, ["scripts/validate-plugins.mjs"], { cwd: dir, encoding: "utf8" });
  return { dir, validate };
}

test("the published Codex marketplace passes validation", (t) => {
  const f = marketplaceFixture(t);
  const result = f.validate();
  assert.equal(result.status, 0, result.stderr);
});

for (const [host, manifest, field, value] of [
  ["codex", ".codex-plugin/plugin.json", "skills", 99],
  ["claude-code", ".claude-plugin/plugin.json", "version", 123],
  ["codex", ".codex-plugin/plugin.json", "name", null],
]) {
  test(`native ${host} manifest rejects invalid ${field}`, (t) => {
    const f = marketplaceFixture(t);
    const path = join(f.dir, "harness/pstack", host, manifest);
    const json = JSON.parse(readFileSync(path, "utf8"));
    json[field] = value;
    writeFileSync(path, JSON.stringify(json));
    // Keep duplicate versions equal so this exercises the native field validator.
    if (field === "version") writeFileSync(join(dirname(dirname(path)), "plugin.json"), JSON.stringify(json));
    const result = f.validate();
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, new RegExp(`native manifest.*${field}`, "s"));
  });
}

test("missing Codex marketplace fails instead of installing the Claude tree", (t) => {
  const f = marketplaceFixture(t);
  rmSync(join(f.dir, ".agents/plugins/marketplace.json"));
  const result = f.validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.agents\/plugins\/marketplace\.json.*not found/);
});

test("a Codex pstack entry targeting the Claude tree fails validation", (t) => {
  const f = marketplaceFixture(t);
  const path = join(f.dir, ".agents/plugins/marketplace.json");
  const marketplace = JSON.parse(readFileSync(path));
  marketplace.plugins.find(({ name }) => name === "pstack").source.path = "./harness/pstack/claude-code";
  writeFileSync(path, JSON.stringify(marketplace));
  const result = f.validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /harness\/pstack\/codex/);
});

test("pstack requires its Codex manifest even when a Claude manifest exists", (t) => {
  const f = marketplaceFixture(t);
  const plugin = join(f.dir, "harness/pstack/codex");
  mkdirSync(join(plugin, ".claude-plugin"));
  copyFileSync(join(plugin, ".codex-plugin/plugin.json"), join(plugin, ".claude-plugin/plugin.json"));
  rmSync(join(plugin, ".codex-plugin/plugin.json"));
  const result = f.validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing \.codex-plugin\/plugin\.json/);
});

test("missing Claude marketplace fails validation", (t) => {
  const f = marketplaceFixture(t);
  rmSync(join(f.dir, ".claude-plugin/marketplace.json"));
  const result = f.validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude-plugin\/marketplace.json not found/);
});

test("the Claude marketplace cannot target the Codex package", (t) => {
  const f = marketplaceFixture(t);
  const path = join(f.dir, ".claude-plugin/marketplace.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.plugins.find((entry) => entry.name === "pstack").source = "./harness/pstack/codex";
  writeFileSync(path, JSON.stringify(data));
  const result = f.validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Claude marketplace must select/);
});
