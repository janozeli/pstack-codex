#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { readdir, readFile, readlink, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { createZstdDecompress } from "node:zlib";

async function canonical(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    let target;
    try {
      target = await readlink(path);
    } catch (linkError) {
      if (linkError.code !== "ENOENT" && linkError.code !== "EINVAL") throw linkError;
    }
    if (target !== undefined) return canonical(resolve(dirname(path), target));
    const absolute = resolve(path);
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(await canonical(parent), basename(absolute));
  }
}

function inside(path, directory) {
  return path === directory || path.startsWith(`${directory}${sep}`);
}

async function* transcripts(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* transcripts(path);
    else if (entry.isFile() && entry.name.startsWith("rollout-") && /\.jsonl(\.zst)?$/.test(entry.name)) yield path;
  }
}

// The content size a zstd frame header declares, or null when the header omits it.
function declaredSize(frame) {
  if (frame.readUInt32LE(0) !== 0xfd2fb528) throw new Error("a compressed rollout is not a zstd frame");
  const descriptor = frame[4];
  const single = (descriptor >> 5) & 1;
  const sizeBytes = [single, 2, 4, 8][descriptor >> 6];
  const offset = 5 + (single ? 0 : 1) + [0, 1, 2, 4][descriptor & 3];
  if (sizeBytes === 0) return null;
  if (sizeBytes === 1) return frame[offset];
  if (sizeBytes === 2) return frame.readUInt16LE(offset) + 256;
  return sizeBytes === 4 ? frame.readUInt32LE(offset) : Number(frame.readBigUInt64LE(offset));
}

// Codex compresses older rollouts to .jsonl.zst. Node's zstd decoder accepts a truncated
// frame silently, so a compressed rollout counts only when it decodes to its declared size.
async function* text(path) {
  if (!path.endsWith(".zst")) {
    yield* createReadStream(path, { encoding: "utf8" });
    return;
  }
  const frame = await readFile(path);
  const size = declaredSize(frame);
  if (size === null) throw new Error("a compressed rollout does not declare its size");
  const decoder = new StringDecoder("utf8");
  let decoded = 0;
  for await (const chunk of Readable.from([frame]).pipe(createZstdDecompress())) {
    decoded += chunk.length;
    yield decoder.write(chunk);
  }
  if (decoded !== size) throw new Error("a compressed rollout is incomplete");
  yield decoder.end();
}

async function firstRecord(path) {
  let line = "";
  for await (const chunk of text(path)) {
    const end = chunk.indexOf("\n");
    line += end < 0 ? chunk : chunk.slice(0, end);
    if (end >= 0) return JSON.parse(line);
  }
  return JSON.parse(line);
}

async function* records(path) {
  let pending = "";
  for await (const chunk of text(path)) {
    pending += chunk;
    let end;
    while ((end = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (pending.trim()) {
    let record;
    try {
      record = JSON.parse(pending);
    } catch {
      // A running session can be midway through its final JSONL record.
      return;
    }
    yield record;
  }
}

function mentions(value, path) {
  if (typeof value === "string") {
    let offset = value.indexOf(path);
    while (offset >= 0) {
      const before = value[offset - 1];
      const after = value[offset + path.length];
      if ((!before || /[\s'"`([{=:]/.test(before)) && (!after || /[\s/'"`),;:\]}]/.test(after))) return true;
      offset = value.indexOf(path, offset + 1);
    }
  } else if (value && typeof value === "object") {
    return Object.values(value).some((entry) => mentions(entry, path));
  }
  return false;
}

async function worktreeActivity(repo, codexHome) {
  const paths = execFileSync("git", ["-C", repo, "worktree", "list", "--porcelain", "-z"], { encoding: "utf8" })
    .split("\0").filter((field) => field.startsWith("worktree ")).map((field) => field.slice(9));
  const worktrees = await Promise.all(paths.map(async (path) => ({ path, canonical: await canonical(path) })));
  const activity = Object.fromEntries(paths.map((path) => [path, null]));
  for (const directory of ["sessions", "archived_sessions"]) {
    for await (const path of transcripts(join(codexHome, directory))) {
      const metadata = await firstRecord(path);
      if (metadata.type !== "session_meta" || typeof metadata.payload?.cwd !== "string" || !isAbsolute(metadata.payload.cwd)) {
        throw new Error("a rollout has no valid workspace metadata");
      }
      const cwd = await canonical(metadata.payload.cwd);
      if (!worktrees.some((worktree) => inside(cwd, worktree.canonical))) continue;
      const touched = new Set(worktrees.filter((worktree) => inside(cwd, worktree.canonical)));
      for await (const record of records(path)) {
        for (const worktree of worktrees) {
          if (mentions(record, worktree.path) || mentions(record, worktree.canonical)) touched.add(worktree);
        }
      }
      const timestamp = Math.floor((await stat(path)).mtimeMs / 1000);
      for (const worktree of touched) activity[worktree.path] = Math.max(activity[worktree.path] ?? 0, timestamp);
    }
  }
  return activity;
}

try {
  if (process.argv.length !== 3) throw new Error("usage: codex-worktree-activity.mjs <repo>");
  console.log(JSON.stringify(await worktreeActivity(resolve(process.argv[2]), process.env.CODEX_HOME || join(homedir(), ".codex"))));
} catch (error) {
  console.error(`Codex history could not be audited: ${error.code || error.name}.`);
  process.exitCode = 1;
}
