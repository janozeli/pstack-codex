import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collect } from './evidence.mjs';
import { packageTerm, traceTerm, semanticTerms } from './certificates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const lean = process.env.LEAN ?? 'lean';
const proof = ['Port.lean', 'Translation.lean'].map(file => readFileSync(join(here, file), 'utf8').replace(/^import Std\n/, '')).join('\n');
const required = [
  ...['effort_preserved', 'claude_opus_preserved', 'claude_grok_is_haiku', 'codex_opus_is_astra', 'codex_grok_is_sol', 'fast_does_not_change_model',
    'role_names_and_order_preserved', 'panel_sizes_preserved', 'panel_efforts_and_order_preserved', 'model_rule_present', 'Aligned.length_eq', 'checkList_sound', 'checkList_complete', 'checkRoles_sound', 'checkRoles_count'].map(n => `Port.${n}`),
  ...['frame_sound', 'frame_accounting', 'accepted_step_decomposition', 'frame_refines', 'frame_reverse',
    'allowed_contract', 'accepted_step_contract', 'checkStep_sound', 'checkTrace_sound', 'pipeline_refines', 'frame_identity', 'pipeline_identity',
    'ordered_head', 'ordered_unique', 'checkPackage_sound', 'package_no_extra', 'package_complete', 'package_unique', 'package_size'].map(n => `Translation.${n}`),
];
const scratch = mkdtempSync(join(tmpdir(), 'pstack-lean-'));
const allowedAxioms = new Set(['propext', 'Classical.choice', 'Quot.sound']);
function command(args) {
  const r = spawnSync(lean, args, { encoding: 'utf8', cwd: scratch, timeout: 600_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LEAN_PATH: scratch } });
  assert.equal(r.status, 0, `${r.error ?? ''}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
function audit(terms, label, source = proof, policy = true) {
  if (policy) {
    assert.doesNotMatch(source, /\b(sorry|admit|axiom|native_decide|unsafe|implemented_by|extern|import|elab|macro)\b/);
    assert.doesNotMatch(source, /set_option|#eval|#print|debug\./);
  }
  const names = [...required, ...terms.map((_, i) => `certificate_${i}`)];
  const file = join(scratch, `${label}.lean`);
  const reuse = label !== 'Verified' && source === proof;
  writeFileSync(file, (reuse ? 'import Verified\n' : 'import Std\n') + 'set_option maxRecDepth 4096\nset_option maxHeartbeats 4000000\n' + (reuse ? '' : source) + '\n' + terms.map((t,i) => `theorem certificate_${i} : ${t} := by decide +kernel`).join('\n') + '\n' + names.map(n => `#print axioms ${n}`).join('\n'));
  const output = command(['-DwarningAsError=true', ...(label === 'Verified' ? ['-o', join(scratch, 'Verified.olean')] : []), file]);
  const records = [...output.matchAll(/^'([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]*)\])$/gm)];
  assert.deepEqual(records.map(r => r[1]), names, 'Every theorem and certificate needs a transitive axiom report');
  for (const r of records) for (const axiom of (r[2] ?? '').split(',').map(x => x.trim()).filter(Boolean))
    assert.ok(allowedAxioms.has(axiom), `Unapproved axiom ${axiom}`);
}

try {
  assert.equal(readFileSync(join(here, 'lean-toolchain'), 'utf8').trim(), 'leanprover/lean4:v4.35.0');
  assert.match(command(['--version']), /version 4\.35\.0\b/);
  const coverage = JSON.parse(readFileSync(join(here, 'coverage.json'), 'utf8'));
  const inputs = ['scripts/standalone/compile.mjs', 'scripts/standalone/edits.mjs', 'scripts/standalone/runtime.mjs',
    'scripts/generate-pstack-harness-trees.mjs', 'pstack/skills/setup-pstack/SKILL.md'];
  assert.match(coverage.reviewedAt, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(coverage.sha256).sort(), inputs.sort());
  for (const file of inputs) assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'), coverage.sha256[file],
    `Verification drift in ${file}; review the policy and proofs before updating coverage.json`);
  audit([], 'Verified');
  assert.throws(() => audit([], 'Incomplete', proof.replace('  rfl', '  sorry'), false), /declaration uses `sorry`/);
  const custom = proof.replace('namespace Port', 'namespace Port\naxiom untrusted : False').replace('  rfl', '  exact False.elim untrusted');
  assert.throws(() => audit([], 'Untrusted', custom, false), /Unapproved axiom Port\.untrusted/);

  const step = { chunks: [{ keep: 'prefix ', before: 'old', after: 'new' }], tail: ' suffix', output: 'prefix new suffix' };
  const trace = { input: 'prefix old suffix', steps: [step], output: step.output };
  const e = { path: 1, content: 1, executable: false };
  audit([traceTerm(trace), packageTerm([e], [e])], 'Nonvacuity');
  const negatives = [
    traceTerm({ ...trace, output: 'new suffix' }),
    traceTerm({ ...trace, input: 'unrelated' }),
    traceTerm({ ...trace, steps: [] }),
    traceTerm({ ...trace, steps: [step, step] }),
    traceTerm({ ...trace, steps: [{ ...step, chunks: [{ ...step.chunks[0], keep: '' }] }] }),
    packageTerm([e], []), packageTerm([e], [e,e]),
    packageTerm([e], [{ ...e, executable: true }]),
    packageTerm([e], [{ ...e, content: 2 }]),
    packageTerm([e], [{ ...e, path: 2 }]),
    packageTerm([e,e], [e,e]),
  ];
  // Every rejected witness must actually be false, not merely time out or fail to parse.
  for (const [i, term] of negatives.entries()) assert.throws(() => audit([term], `Rejected${i}`), /is false/);
  const original = readFileSync(join(root, 'scripts/standalone/edits.mjs'), 'utf8');
  const broken = original.replace(".join('') + tail;", ".join('') + tail.slice(1);");
  assert.notEqual(original, broken);
  const mutantFile = join(scratch, 'mutant.mjs'); writeFileSync(mutantFile, broken);
  const mutant = await import(pathToFileURL(mutantFile).href);
  const steps = [];
  const output = mutant.rewriter(s => steps.push(s)).replace(trace.input, 'old', 'new');
  assert.throws(() => audit([traceTerm({ input: trace.input, output, steps })], 'BrokenEngine'), /is false/);
  console.log('PASS: proof holes, custom axioms, 11 invalid trace/package witnesses and a real rewrite-engine mutation rejected');

  const evidence = collect(root);
  assert.deepEqual(evidence.map(h => h.tree).sort(), ['claude-code', 'codex'], 'Both host trees must be verified');
  const runner = join(scratch, 'Runner.lean');
  writeFileSync(runner, readFileSync(join(here, 'Runner.lean')));
  const run = (value, label) => {
    const data = join(scratch, `${label}.json`);
    writeFileSync(data, JSON.stringify(value));
    return command(['--run', runner, data]);
  };
  // Exercise the actual executable, including JSON decoding and file boundary.
  const fixture = { sourceRoles: [{ name: 'worker', seats: ['grok-4.7-high'] }],
    nativeRoles: [{ name: 'worker', seats: ['gpt-6.1-sol high'] }], tree: 'codex', skills: ['reflect'], traces: [{ path: 'example.md', ...trace }],
    expected: [e], actual: [e], produced: [e] };
  run([fixture], 'RunnerPositive');
  for (const [label, changed] of [
    ['MissingFile', { ...fixture, actual: [] }],
    ['ExtraFile', { ...fixture, actual: [e, { ...e, path: 2 }] }],
    ['Permissions', { ...fixture, actual: [{ ...e, executable: true }] }],
    ['ChangedBytes', { ...fixture, actual: [{ ...e, content: 2 }] }],
    ['LostContext', { ...fixture, traces: [{ path: 'example.md', ...trace, output: 'new suffix' }] }],
    ['MissingTrace', { ...fixture, traces: [] }],
    ['ChangedRole', { ...fixture, nativeRoles: [{ name: 'other', seats: ['gpt-6.1-sol high'] }] }],
    ['ChangedPanel', { ...fixture, nativeRoles: [{ name: 'worker', seats: ['gpt-6.1-sol high','gpt-6.1-sol high'] }] }],
    ['MissingRoles', { ...fixture, nativeRoles: [] }],
    ['UnknownHost', { ...fixture, tree: 'unknown' }],
  ]) assert.throws(() => run([changed], label), /rejected|Empty artifact coverage|Unknown host/);
  const badModel = { input: 'grok-4.7-high', output: 'gpt-6.1-sol low', steps: [{
    chunks: [{ keep: '', before: 'grok-4.7-high', after: 'gpt-6.1-sol low' }], tail: '', output: 'gpt-6.1-sol low',
  }] };
  assert.throws(() => run([{ ...fixture, traces: [{ path: 'model.md', ...badModel }] }], 'WrongModel'), /rewrite trace rejected/);
  const badCommand = { input: '/reflect', output: '/pstack:reflect', steps: [{
    chunks: [{ keep: '', before: '/reflect', after: '/pstack:reflect' }], tail: '', output: '/pstack:reflect',
  }] };
  assert.throws(() => run([{ ...fixture, traces: [{ path: 'command.md', ...badCommand }] }], 'WrongCommand'), /rewrite trace rejected/);
  assert.throws(() => run([], 'EmptyRun'), /Empty evidence/);
  console.log('PASS: executable rejects corrupted artifacts and wrong semantic translations');
  process.stdout.write(run(evidence, 'ActualArtifacts'));
  const stats = evidence.reduce((n,h) => ({ files: n.files + h.actual.length,
    documents: n.documents + h.traces.length,
    stages: n.stages + h.traces.reduce((sum,t) => sum+t.steps.length,0),
    semantics: n.semantics + h.traces.flatMap(t => t.steps.flatMap(s => semanticTerms(s, h.tree === 'codex' ? 'codex' : 'claude'))).length,
  }), { files: 0, documents: 0, stages: 0, semantics: 0 });
  assert.ok(stats.semantics > 0);
  console.log(`PASS: ${required.length} kernel-checked general theorems; verified executable checked ${JSON.stringify(stats)}; no native proof axioms`);

} finally {
  rmSync(scratch, { recursive: true, force: true });
}
