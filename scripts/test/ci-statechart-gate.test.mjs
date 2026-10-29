import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(join(root, '.github/workflows/validate-plugins.yml'), 'utf8');
const step = workflow.split('      - name: Test statechart with real TLC and no skipped tests\n')[1]?.split('\n  native-install:')[0];

for (const [name, exit, failed, skipped, succeeds] of [
  ['preserves a failing runner exit even if its summary claims success', 1, 0, 0, false],
  ['rejects a failing TAP summary even if the runner exits zero', 0, 1, 0, false],
  ['rejects skipped integration tests', 0, 0, 67, false],
  ['accepts a successful run without skips', 0, 0, 0, true],
]) {
  test(`the CI statechart step ${name}`, t => {
    assert.ok(step, 'statechart CI step must exist');
    // Explicit bash opts into Actions -eo pipefail; its unspecified shell uses -e.
    assert.match(step, /^        shell: bash$/m);
    const body = step.split('        run: |\n')[1];
    assert.ok(body, 'statechart CI commands must exist');
    const script = body.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
    const dir = mkdtempSync(join(tmpdir(), 'pstack-ci-gate-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'npm'), `#!/bin/sh\nprintf '# fail ${failed}\\n# skipped ${skipped}\\n'\nexit ${exit}\n`, { mode: 0o755 });
    const jar = join(dir, 'tla2tools.jar');
    writeFileSync(jar, 'fixture');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, TLA2TOOLS: jar, RUNNER_TEMP: dir },
    });
    assert.equal(result.status === 0, succeeds, `${result.stdout}\n${result.stderr}`);
  });
}
