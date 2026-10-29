import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('port verification is excluded from source and standalone plugin distributions', () => {
  function check(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const file = join(directory, entry.name);
      assert.doesNotMatch(entry.name, /\.lean$|^lean-toolchain$|^verification$/, file);
      if (entry.isDirectory()) check(file);
      else if (/\.(?:md|json|mjs|ts|sh|py|ya?ml)$/.test(entry.name))
        assert.doesNotMatch(readFileSync(file, 'utf8'), /verification\/lean|verify:lean|lean-toolchain/, file);
    }
  }
  for (const tree of ['pstack', 'harness/pstack/codex', 'harness/pstack/claude-code']) check(join(root, tree));
});

test('missing Lean fails verification instead of skipping or reporting success', t => {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-no-lean-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['verification/lean/check.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, LEAN: join(directory, 'missing-lean') },
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT/);
  assert.doesNotMatch(result.stdout, /PASS|SKIP/);
});
