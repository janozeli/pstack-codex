#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const marketplaceSchema = loadJSON(
  resolve(root, "schemas/marketplace.schema.json")
);
const pluginSchema = loadJSON(resolve(root, "schemas/plugin.schema.json"));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateMarketplace = ajv.compile(marketplaceSchema);
const validatePlugin = ajv.compile(pluginSchema);

// Validate the native manifest fields used by these distributions. Host-specific
// extensions remain allowed; this is not a replacement for native CLI validation.
const validateNative = ajv.compile({
  type: "object", required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    version: { type: "string" },
    description: { type: "string" },
    homepage: { type: "string", format: "uri" },
    repository: { type: "string", format: "uri" },
    license: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    author: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
    skills: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
  },
});
function checkNative(manifest, path) {
  if (!validateNative(manifest)) {
    fail(`${path}: native manifest validation failed`);
    for (const error of validateNative.errors) console.error(`  ${error.instancePath || "/"}: ${error.message}`);
  }
}

let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors++;
}

// 1. Validate marketplace.json
const marketplacePath = resolve(root, ".cursor-plugin/marketplace.json");

if (!existsSync(marketplacePath)) {
  fail(".cursor-plugin/marketplace.json not found");
  process.exit(1);
}

const marketplace = loadJSON(marketplacePath);

if (!validateMarketplace(marketplace)) {
  fail("marketplace.json schema validation failed:");
  for (const err of validateMarketplace.errors) {
    console.error(`  ${err.instancePath || "/"}: ${err.message}`);
  }
}

// 2. Validate each plugin
for (const entry of marketplace.plugins ?? []) {
  const pluginDir = resolve(root, entry.source);
  const pluginJsonPath = resolve(pluginDir, ".cursor-plugin/plugin.json");

  // Check source directory exists
  if (!existsSync(pluginDir)) {
    fail(
      `Plugin "${entry.name}": source directory "${entry.source}" does not exist`
    );
    continue;
  }

  // Check plugin.json exists
  if (!existsSync(pluginJsonPath)) {
    fail(
      `Plugin "${entry.name}": missing .cursor-plugin/plugin.json in "${entry.source}"`
    );
    continue;
  }

  const pluginJson = loadJSON(pluginJsonPath);

  if (!validatePlugin(pluginJson)) {
    fail(
      `Plugin "${entry.name}": plugin.json schema validation failed (${entry.source}/.cursor-plugin/plugin.json):`
    );
    for (const err of validatePlugin.errors) {
      const detail =
        err.keyword === "additionalProperties"
          ? `${err.message}: "${err.params.additionalProperty}"`
          : err.message;
      console.error(`  ${err.instancePath || "/"}: ${detail}`);
    }
  }

  // Check that marketplace name matches plugin name
  if (pluginJson.name && pluginJson.name !== entry.name) {
    fail(
      `Plugin "${entry.name}": marketplace name does not match plugin.json name "${pluginJson.name}"`
    );
  }
}

const claudeMarketplacePath = resolve(root, ".claude-plugin/marketplace.json");
if (!existsSync(claudeMarketplacePath)) {
  fail(".claude-plugin/marketplace.json not found");
  process.exit(1);
}
const claudeMarketplace = loadJSON(claudeMarketplacePath);
if (!validateMarketplace(claudeMarketplace)) {
  fail("Claude marketplace schema validation failed");
  process.exit(1);
}

for (const entry of claudeMarketplace.plugins ?? []) {
  const pluginDir = resolve(root, entry.source);
  if (entry.name === "pstack" && pluginDir !== resolve(root, "harness/pstack/claude-code")) {
    fail('Plugin "pstack": Claude marketplace must select "./harness/pstack/claude-code"');
    continue;
  }
  const pluginJsonPath = resolve(pluginDir, ".claude-plugin/plugin.json");

  if (!existsSync(pluginJsonPath)) {
    fail(
      `Plugin "${entry.name}": missing .claude-plugin/plugin.json in "${entry.source}"`
    );
    continue;
  }

  const pluginJson = loadJSON(pluginJsonPath);
  checkNative(pluginJson, pluginJsonPath);
  if (pluginJson.name && pluginJson.name !== entry.name) {
    fail(
      `Plugin "${entry.name}": Claude marketplace name does not match .claude-plugin/plugin.json name "${pluginJson.name}"`
    );
  }
}

const codexMarketplacePath = resolve(root, ".agents/plugins/marketplace.json");
if (!existsSync(codexMarketplacePath)) {
  fail(".agents/plugins/marketplace.json not found");
  process.exit(1);
}
const codexMarketplace = loadJSON(codexMarketplacePath);
const codexEntries = (codexMarketplace.plugins ?? []).map((entry) => ({
  name: entry.name,
  source: entry.source?.path,
}));

// Codex reads only .agents/plugins/marketplace.json when it exists, so it must list every Claude marketplace plugin.
const claudeNames = (claudeMarketplace.plugins ?? []).map(({ name }) => name).sort();
const codexNames = codexEntries.map(({ name }) => name).sort();
if (claudeNames.join() !== codexNames.join()) {
  fail(
    `Codex marketplace lists [${codexNames.join(", ")}], but the Claude marketplace lists [${claudeNames.join(", ")}]`
  );
}

for (const entry of codexEntries) {
  if (typeof entry.source !== "string") {
    fail(`Plugin "${entry.name}": Codex marketplace entry has no source.path`);
    continue;
  }
  const pluginDir = resolve(root, entry.source);
  if (entry.name === "pstack" && pluginDir !== resolve(root, "harness/pstack/codex")) {
    fail('Plugin "pstack": Codex marketplace must select "./harness/pstack/codex"');
    continue;
  }
  const manifests = entry.name === "pstack"
    ? [".codex-plugin/plugin.json"]
    : [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"];
  const pluginJsonPath = manifests
    .map((path) => resolve(pluginDir, path))
    .find((path) => existsSync(path));

  if (!pluginJsonPath) {
    fail(
      `Plugin "${entry.name}": missing ${manifests.join(" or ")} in "${entry.source}"`
    );
    continue;
  }

  const pluginJson = loadJSON(pluginJsonPath);
  checkNative(pluginJson, pluginJsonPath);
  if (pluginJson.name && pluginJson.name !== entry.name) {
    fail(
      `Plugin "${entry.name}": Codex marketplace name does not match ${pluginJsonPath.slice(pluginDir.length + 1)} name "${pluginJson.name}"`
    );
  }
}

const manifestPaths = [
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "plugin.json",
];
const sources = new Map();
for (const entry of [
  ...(marketplace.plugins ?? []),
  ...(claudeMarketplace.plugins ?? []),
  ...codexEntries.filter(({ source }) => typeof source === "string"),
]) {
  sources.set(resolve(root, entry.source), entry.name);
}

for (const [pluginDir, name] of sources) {
  const versions = manifestPaths
    .map((path) => resolve(pluginDir, path))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, version: loadJSON(path).version }))
    .filter(({ version }) => version !== undefined);

  if (new Set(versions.map(({ version }) => version)).size > 1) {
    fail(`Plugin "${name}": manifest versions differ:`);
    for (const { path, version } of versions) {
      console.error(`  ${path.slice(root.length + 1)}: ${version}`);
    }
  }
}

// 3. Report results
if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log("All plugins validated successfully.");
  process.exit(0);
}
