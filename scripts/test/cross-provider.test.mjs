import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "pstack/skills/poteto-mode/scripts/cross-provider.mjs");
const REPLIES = {
  codex: `printf '%s\\n' '{"type":"thread.started"}' '{"type":"item.completed","item":{"type":"agent_message","text":"codex verdict"}}'`,
  claude: `printf '%s\\n' '{"result":"claude verdict"}'`,
  grok: `printf '%s\\n' '{"text":"grok verdict"}'`,
};

function fixture(t, status = 0) {
  const dir = mkdtempSync(join(tmpdir(), "pstack-cross-provider-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [name, reply] of Object.entries(REPLIES)) {
    writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/${name}.args"\ncat > "${dir}/${name}.stdin"\n${reply}\nexit ${status}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  writeFileSync(join(dir, "brief.md"), "Review the diff.");
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {
    cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { dir, run, read: (name) => readFileSync(join(dir, name), "utf8") };
}

for (const [provider, readOnly] of [["codex", "read-only"], ["claude", "plan"], ["grok", "read-only"]]) {
  test(`a ${provider} seat runs read-only and returns its reply`, (t) => {
    const f = fixture(t);
    const result = f.run(provider, "model-x", "high", "brief.md", "out.md", f.dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.read("out.md"), `${provider} verdict\n`);
    const args = f.read(`${provider}.args`).split("\n");
    assert.ok(args.includes(readOnly), args.join(" "));
    assert.ok(args.includes("model-x") && args.some((arg) => arg === "high" || arg === "model_reasoning_effort=high"), args.join(" "));
    const brief = provider === "grok" ? args.join("\n") : f.read(`${provider}.stdin`);
    assert.match(brief, /Read-only seat: do not edit files[\s\S]*Review the diff\./);
  });
}

test("a failing seat writes no reply and exits nonzero", (t) => {
  const f = fixture(t, 3);
  writeFileSync(join(f.dir, "out.md"), "APPROVE from an earlier run\n");
  const result = f.run("codex", "model-x", "high", "brief.md", "out.md", f.dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cross-provider seat failed: codex exited 3/);
  assert.equal(existsSync(join(f.dir, "out.md")), false);
});

test("an unknown provider is rejected", (t) => {
  const f = fixture(t);
  const result = f.run("gemini", "model-x", "high", "brief.md", "out.md");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: cross-provider\.mjs <codex\|claude\|grok>/);
});
