import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, TARGETS } from '../../scripts/generate-pstack-harness-trees.mjs';
import { runtime } from '../../scripts/standalone/runtime.mjs';

export function walk(root, dir = '', sourceExclusions = true) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    if (sourceExclusions && (entry.name === '.DS_Store' || entry.name === 'node_modules')) return [];
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink: ${dir}/${entry.name}`);
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(root, path, sourceExclusions) : [path];
  }).sort();
}

export function readRoles(text) {
  const blocks = [...text.matchAll(/# budget:[^\n]*\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, 'Expected one complete role table');
  return blocks[0][1].split('\n').map(line => {
    const split = line.indexOf(': ');
    assert.ok(split > 0, `Invalid role: ${line}`);
    return { name: line.slice(0, split), seats: line.slice(split + 2).split(', ') };
  });
}

export function collect(root) {
  // Exact-byte interning, not hashes: equal identifiers mean equal complete bytes.
  // The I/O/serialization bridge is explicitly trusted, like reading source files.
  const contents = new Map();
  const pathIds = new Map();
  const intern = bytes => {
    const key = bytes.toString('base64');
    if (!contents.has(key)) contents.set(key, contents.size);
    return contents.get(key);
  };
  const source = join(root, 'pstack');
  const skills = readdirSync(join(source, 'skills')).sort();
  const sourcePaths = [...walk(source, 'skills'), ...walk(source, 'agents'), ...walk(source, 'docs/guide'), 'README.md', 'LICENSE'];
  const text = bytes => {
    const value = bytes.toString('utf8');
    assert.ok(Buffer.from(value).equals(bytes), 'Invalid UTF-8 cannot be reflected as a Lean String');
    return value;
  };
  const entry = (path, bytes, executable) => {
    if (!pathIds.has(path)) pathIds.set(path, pathIds.size);
    return { path: pathIds.get(path), content: intern(bytes), executable };
  };
  const diskEntry = (dir, path) => entry(path, readFileSync(join(dir, path)), (statSync(join(dir, path)).mode & 0o111) !== 0);
  return TARGETS.map(target => {
    const traces = new Map();
    const rendered = render(target, (path, step) => {
      if (!traces.has(path)) traces.set(path, []);
      traces.get(path).push(step);
    });
    const omitted = `skills/poteto-mode/scripts/${target.tree === 'codex' ? 'claude' : 'codex'}-worktree-activity.mjs`;
    // This inventory is derived independently from source and the port policy,
    // not from renderer output. An omitted or invented renderer entry must fail.
    const paths = sourcePaths.filter(p => p !== omitted);
    const expected = paths.map(path => {
      const original = readFileSync(join(source, path));
      const steps = traces.get(path) ?? [];
      let output = original;
      if (steps.length) {
        assert.equal(steps[0].input, text(original), `${path}: trace does not start at the actual source`);
        output = Buffer.from(steps.at(-1).output);
      }
      return entry(path, output, (statSync(join(source, path)).mode & 0o111) !== 0);
    });
    expected.push(entry('docs/runtime.md', Buffer.from(runtime(target.harness)), false));
    const manifest = { ...JSON.parse(readFileSync(join(source, 'plugin.json'))), ...target.manifestFields };
    for (const path of (target.tree === 'codex' ? ['.codex-plugin/plugin.json'] : ['plugin.json', '.claude-plugin/plugin.json']))
      expected.push(entry(path, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), false));
    if (target.tree === 'codex') for (const skill of skills) {
      const frontmatter = text(readFileSync(join(source, 'skills', skill, 'SKILL.md'))).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      if (/^disable-model-invocation:\s*true\s*$/m.test(frontmatter))
        expected.push(entry(`skills/${skill}/agents/openai.yaml`, Buffer.from('policy:\n  allow_implicit_invocation: false\n'), false));
    }
    const actual = walk(join(root, 'harness/pstack', target.tree), '', false).map(p => diskEntry(join(root, 'harness/pstack', target.tree), p));
    const produced = [...rendered].map(([path, e]) => entry(path, e.bytes, e.executable));
    // All generated stages must originate in a declared source path. Added
    // runtime/manifests/policies have separate, explicit construction contracts.
    for (const path of traces.keys()) assert.ok(paths.includes(path), `Unaccounted trace ${path}`);
    return { host: target.harness, tree: target.tree, traces: [...traces].map(([path, steps]) => ({
      path, input: text(readFileSync(join(source, path))),
      output: text(readFileSync(join(root, 'harness/pstack', target.tree, path))), steps,
    })), expected: expected.sort((a,b) => a.path-b.path), actual: actual.sort((a,b) => a.path-b.path),
    produced: produced.sort((a,b) => a.path-b.path), skills,
    sourceRoles: readRoles(text(readFileSync(join(source, 'skills/setup-pstack/SKILL.md')))),
    nativeRoles: readRoles(text(readFileSync(join(root, 'harness/pstack', target.tree, 'skills/setup-pstack/SKILL.md')))) };
  });
}
