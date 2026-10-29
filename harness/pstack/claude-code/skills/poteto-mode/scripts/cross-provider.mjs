#!/usr/bin/env node

// Runs one read-only seat on another provider's CLI, for panels and judges that need a
// different model family than the parent. Writes the seat's final reply to <output>.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [provider, model, effort, briefPath, outputPath, cwd = process.cwd()] = process.argv.slice(2);
const SEATS = {
  codex: () => ({
    command: "codex",
    args: ["exec", "--json", "--sandbox", "read-only", "-m", model, "-c", `model_reasoning_effort=${effort}`, "-C", cwd, "-"],
    input: brief,
    reply: (stdout) => stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line))
      .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message").at(-1)?.item.text,
  }),
  claude: () => ({
    command: "claude",
    args: ["-p", "--model", model, "--effort", effort, "--permission-mode", "plan", "--output-format", "json"],
    input: brief,
    reply: (stdout) => JSON.parse(stdout).result,
  }),
  grok: () => ({
    command: "grok",
    args: ["-p", brief, "-m", model, "--reasoning-effort", effort, "--sandbox", "read-only", "--always-approve", "--disallowed-tools", "Agent", "--output-format", "json"],
    input: "",
    reply: (stdout) => JSON.parse(stdout).text,
  }),
};

let brief;
try {
  if (!SEATS[provider] || !model || !effort || !briefPath || !outputPath) {
    throw new Error(`usage: cross-provider.mjs <${Object.keys(SEATS).join("|")}> <model> <effort> <brief> <output> [cwd]`);
  }
  brief = `Read-only seat: do not edit files, commit, push, post comments, or start subagents.\n\n${readFileSync(briefPath, "utf8")}`;
  const seat = SEATS[provider]();
  const run = spawnSync(seat.command, seat.args, { cwd: resolve(cwd), input: seat.input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`${seat.command} exited ${run.status}: ${run.stderr.trim().split("\n").at(-1) ?? ""}`);
  const reply = seat.reply(run.stdout);
  if (typeof reply !== "string" || !reply.trim()) throw new Error(`${seat.command} returned no reply`);
  writeFileSync(outputPath, `${reply.trim()}\n`);
  console.log(JSON.stringify({ provider, model, effort, output: resolve(outputPath) }));
} catch (error) {
  console.error(`Cross-provider seat failed: ${error.message}`);
  process.exitCode = 1;
}
