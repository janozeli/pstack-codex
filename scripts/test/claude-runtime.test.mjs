import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "pstack/skills/poteto-mode/scripts");

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "pstack-claude-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const worktree = join(dir, "work tree [1]");
  const bin = join(dir, "bin");
  for (const path of [home, repo, bin]) mkdirSync(path);
  for (const name of ["gh", "origin"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, name), 0o755);
  }
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, "custom-claude"), PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, stdio: "pipe" });
  git("init", "-q");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "initial");
  git("worktree", "add", "-qb", "worker", worktree);
  const transcript = (cwd, message = "working", file = "session.jsonl") => {
    const path = join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects", "project-name", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ type: "file-history-snapshot", snapshot: { trackedFileBackups: {} } })}\n${JSON.stringify({ type: "user", cwd, sessionId: "session", message: { role: "user", content: message } })}\n`);
    return path;
  };
  const audit = (script = join(source, "worktree-audit.sh"), args = ["--harness", "claude"]) => {
    const result = spawnSync("bash", [script, ...args, "-b", "HEAD", repo], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const row = result.stdout.trim().split("\n").at(-1).split("\t");
    assert.equal(row[8], worktree, result.stdout);
    return { lastChat: row[6], bucket: row[7], stderr: result.stderr };
  };
  return { dir, home, repo, worktree, env, transcript, audit };
}

test("Claude worktree activity is found after a file history snapshot", (t) => {
  const f = fixture(t);
  f.transcript(f.worktree);
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("Claude parent path references and nested subagent activity count", (t) => {
  const f = fixture(t);
  f.transcript(f.repo, `inspect '${f.worktree}/file.ts'`, "session/subagents/agent-1.jsonl");
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("Claude activity uses the default home when CLAUDE_CONFIG_DIR is absent", (t) => {
  const f = fixture(t);
  delete f.env.CLAUDE_CONFIG_DIR;
  f.transcript(f.worktree);
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("another Claude project's conversation body is not inspected", (t) => {
  const f = fixture(t);
  const path = f.transcript(join(f.dir, "unrelated"), f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "invalid unrelated body\n");
  assert.equal(f.audit().bucket, "safe");
});

test("Claude path prefixes do not match a different worktree", (t) => {
  const f = fixture(t);
  f.transcript(f.repo, `${f.worktree}-other/file.ts`);
  assert.equal(f.audit().bucket, "safe");
});

test("Claude resolves an aliased checkout with a removed descendant", (t) => {
  const f = fixture(t);
  const alias = join(f.dir, "alias");
  symlinkSync(f.worktree, alias, "dir");
  f.transcript(join(alias, "removed-child"));
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("a dangling link outside the Claude checkout stays out of scope", (t) => {
  const f = fixture(t);
  const alias = join(f.repo, "external");
  symlinkSync(join(f.dir, "removed-project"), alias, "dir");
  const path = f.transcript(join(alias, "child"), f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "invalid unrelated body\n");
  assert.equal(f.audit().bucket, "safe");
});

test("a malformed Claude conversation needs review instead of safe cleanup", (t) => {
  const f = fixture(t);
  const path = f.transcript(f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + "invalid JSON\n");
  assert.equal(f.audit().bucket, "review-history");
});

test("Claude files without conversation records do not block the audit", (t) => {
  const f = fixture(t);
  f.transcript(f.worktree);
  const projects = join(f.env.CLAUDE_CONFIG_DIR, "projects");
  writeFileSync(join(projects, "project-name/empty.jsonl"), "");
  writeFileSync(join(projects, "project-name/summary.jsonl"), `${JSON.stringify({ type: "last-prompt", lastPrompt: "hi", sessionId: "other" })}\n`);
  mkdirSync(join(projects, "project-name/session/subagents/workflows/wf_1"), { recursive: true });
  writeFileSync(join(projects, "project-name/session/subagents/workflows/wf_1/journal.jsonl"), `${JSON.stringify({ type: "started" })}\n`);
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("a Claude conversation without a workspace still needs review", (t) => {
  const f = fixture(t);
  f.transcript(f.worktree);
  const path = join(f.env.CLAUDE_CONFIG_DIR, "projects/project-name/no-cwd.jsonl");
  writeFileSync(path, `${JSON.stringify({ type: "user", sessionId: "other", message: { role: "user", content: "hi" } })}\n`);
  assert.equal(f.audit().bucket, "review-history");
});

test("a partial final Claude record preserves observed activity", (t) => {
  const f = fixture(t);
  const path = f.transcript(f.worktree);
  writeFileSync(path, readFileSync(path, "utf8") + '{"type":');
  assert.equal(f.audit().bucket, "verify-recent-chat");
});

test("the generated Claude package automatically selects Claude history", (t) => {
  const f = fixture(t);
  f.transcript(f.worktree);
  const plugin = join(f.dir, "installed-plugin");
  cpSync(join(root, "harness/pstack/claude-code"), plugin, { recursive: true });
  assert.equal(f.audit(join(plugin, "skills/poteto-mode/scripts/worktree-audit.sh"), []).bucket, "verify-recent-chat");
});
