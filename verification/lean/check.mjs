import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const lean = process.env.LEAN ?? 'lean';
const required = ['effort_preserved', 'codex_inherits', 'claude_opus_preserved',
  'fast_does_not_change_model', 'role_names_and_order_preserved', 'panel_sizes_preserved',
  'panel_efforts_and_order_preserved'].map(name => `Port.${name}`);
const allowedAxioms = new Set(['propext', 'Classical.choice', 'Quot.sound']);
const proof = readFileSync(join(here, 'Port.lean'), 'utf8');
const coverage = JSON.parse(readFileSync(join(here, 'coverage.json'), 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'pstack-lean-'));

function command(args) {
  const result = spawnSync(lean, args, { encoding: 'utf8', cwd: scratch, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function audit(source, observations, label, enforceSourcePolicy = true) {
  if (enforceSourcePolicy)
    assert.doesNotMatch(source, /\b(sorry|admit|axiom|native_decide|unsafe|implemented_by|extern)\b/);
  assert.deepEqual([...source.matchAll(/^import (.+)$/gm)].map(m => m[1]), ['Std']);
  const names = [...required, ...observations.map((_, i) => `observation_${i}`)];
  const file = join(scratch, `${label}.lean`);
  writeFileSync(file, source + '\n' + observations.map((o, i) => `theorem observation_${i} : ${o} := by decide +kernel`).join('\n') + '\n' + names.map(n => `#print axioms ${n}`).join('\n') + '\n');
  const output = command(['-DwarningAsError=true', file]);
  const records = [...output.matchAll(/^'([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]*)\])$/gm)];
  assert.deepEqual(records.map(r => r[1]), names, 'Every required theorem must have an axiom report');
  for (const record of records) {
    for (const axiom of (record[2] ?? '').split(',').map(a => a.trim()).filter(Boolean))
      assert.ok(allowedAxioms.has(axiom), `${record[1]} depends on unapproved axiom ${axiom}`);
  }
  return names.length;
}

const string = JSON.stringify;
const list = items => `[${items.join(', ')}]`;
const sourceModel = token => {
  const match = token.match(/^(claude-opus-5-5|grok-4\.7)-(low|medium|high|xhigh|max)(-fast)?$/);
  assert.ok(match, `Source model outside reviewed grammar: ${token}`);
  return `(⟨.${match[1].startsWith('claude') ? 'opus' : 'grok'}, .${match[2]}, ${Boolean(match[3])}⟩ : Port.SourceModel)`;
};
function roles(text) {
  const blocks = [...text.matchAll(/# budget:[^\n]*\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, 'Expected exactly one default role table');
  const rows = blocks[0][1].split('\n').map(line => {
    const i = line.indexOf(': ');
    assert.ok(i > 0, `Malformed role: ${line}`);
    return { name: line.slice(0, i), seats: line.slice(i + 2).split(', ') };
  });
  assert.equal(rows.length, 17, 'Role inventory changed; review formal coverage');
  return rows;
}

async function observe(compiler) {
  const obligations = [];
  const tokens = ['claude-opus-5-5', 'grok-4.7'].flatMap(family =>
    ['low', 'medium', 'high', 'xhigh', 'max'].flatMap(effort => ['', '-fast'].map(fast => `${family}-${effort}${fast}`)));
  const skillNames = readdirSync(join(root, 'pstack/skills')).sort();
  assert.equal(skillNames.length, 58, 'Skill inventory changed; review formal coverage');
  const sourceSetup = readFileSync(join(root, 'pstack/skills/setup-pstack/SKILL.md'), 'utf8');
  const sourceRoles = roles(sourceSetup);
  for (const [host, tree, tag] of [['Codex', 'codex', 'codex'], ['Claude Code', 'claude-code', 'claude']]) {
    // Every token in the reviewed grammar, including both fast variants.
    for (const token of tokens) {
      const actual = compiler.compileMarkdown('example.md', token, host, skillNames);
      obligations.push(`${string(actual)} = Port.render (Port.translate .${tag} ${sourceModel(token)})`);
    }
    // All ordered pairs cover separator handling, reordering and duplicate seats.
    for (const first of tokens) for (const second of tokens) {
      const actual = compiler.compileMarkdown('example.md', `${first}, ${second}`, host, skillNames);
      obligations.push(`${string(actual)} = String.intercalate ", " (${list([first, second].map(sourceModel))}.map (Port.render ∘ Port.translate .${tag}))`);
    }
    for (const skill of skillNames) {
      const actual = compiler.compileMarkdown('example.md', `/${skill}`, host, skillNames);
      obligations.push(`${string(actual)} = Port.invocation .${tag} ${string(skill)}`);
      const url = `https://example.invalid/${skill}`;
      assert.equal(compiler.compileMarkdown('example.md', url, host, skillNames), url);
    }
    const compiled = roles(compiler.compileMarkdown('skills/setup-pstack/SKILL.md', sourceSetup, host, skillNames));
    const shipped = roles(readFileSync(join(root, 'harness/pstack', tree, 'skills/setup-pstack/SKILL.md'), 'utf8'));
    assert.deepEqual(compiled, shipped, 'Shipped configuration must match current compiler');
    obligations.push(`${list(compiled.map(r => string(r.name)))} = ${list(sourceRoles.map(r => string(r.name)))}`);
    for (const [i, role] of sourceRoles.entries()) {
      obligations.push(`${list(compiled[i].seats.map(string))} = (${list(role.seats.map(sourceModel))}.map (Port.render ∘ Port.translate .${tag}))`);
    }
  }
  assert.equal(obligations.length, 992, 'Do not silently drop proof obligations');
  return obligations;
}

try {
  assert.equal(readFileSync(join(here, 'lean-toolchain'), 'utf8').trim(), 'leanprover/lean4:v4.35.0');
  assert.match(command(['--version']), /version 4\.35\.0\b/);
  assert.match(coverage.reviewedAt, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(coverage.sha256).sort(), [
    'scripts/standalone/compile.mjs', 'scripts/standalone/runtime.mjs',
    'scripts/generate-pstack-harness-trees.mjs', 'pstack/skills/setup-pstack/SKILL.md',
  ].sort(), 'Coverage must retain every reviewed input');
  for (const [file, digest] of Object.entries(coverage.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, file))).digest('hex'), digest,
      `Verification drift in ${file}; review the model and bridge before updating coverage.json`);
  }
  audit(proof, [], 'ProofSanity');

  // Negative controls are mandatory, use only disposable files, and never edit the port.
  assert.throws(() => audit(proof.replace('effort := source.effort', 'effort := .low'), [], 'BrokenEffort'), /Tactic `rfl` failed/);
  assert.throws(() => audit(proof.replace('  rfl', '  sorry'), [], 'Incomplete', false), /declaration uses `sorry`/);
  // This bypasses the lexical policy deliberately to exercise transitive axiom rejection.
  const custom = proof.replace('namespace Port', 'namespace Port\naxiom untrusted : False').replace('  rfl', '  exact False.elim untrusted');
  assert.throws(() => audit(custom, [], 'Untrusted', false), /unapproved axiom Port\.untrusted/);
  cpSync(join(root, 'scripts/standalone'), join(scratch, 'compiler'), { recursive: true });
  const compilerFile = join(scratch, 'compiler/compile.mjs');
  const original = readFileSync(compilerFile, 'utf8');
  const broken = original.replace("${codex ? 'inherit-parent' : 'opus'} ${effort}", "${codex ? 'inherit-parent' : 'opus'} low");
  assert.notEqual(original, broken, 'Mutation must change the actual compiler');
  writeFileSync(compilerFile, broken);
  const mutant = await import(pathToFileURL(compilerFile).href);
  // Isolate the token translation from the shipped-table drift gate.
  const badOutput = mutant.compileMarkdown('example.md', 'claude-opus-5-5-xhigh', 'Codex', []);
  assert.throws(() => audit(proof, [`${string(badOutput)} = Port.render (Port.translate .codex ⟨.opus, .xhigh, false⟩)`], 'WrongCompiler'), /is false/);
  console.log('PASS: wrong effort, incomplete proof, untrusted proof and actual compiler mutation rejected');

  const compiler = await import('../../scripts/standalone/compile.mjs');
  const obligations = await observe(compiler);
  const count = audit(proof, obligations, 'PortAudit');
  console.log(`PASS: ${required.length} general theorems and ${count - required.length} compiler observations; all transitive axioms audited`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
