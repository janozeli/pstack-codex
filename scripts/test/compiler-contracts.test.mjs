import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compileMarkdown, compileAudit } from '../standalone/compile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rule = 'Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.';
const plan = `# Example
## How to read this
One box is one unit of work and names the evidence. Check a box only when its evidence exists. See playbooks/.
${rule}
## Program checklist
### Arm the program
### Spawn owners
### PR mechanics
### Verdict and merge
### Boot recipe
\`git show origin/main:\` /loop 1h status message
## PR 1
**Depends on.** None.
${['Files.', 'Build.', 'You see.'].map(s => `**${s}**\n- [ ] Do the thing.`).join('\n')}
**Verify, unit.** ${rule}
- [ ] Check the thing.
**Verify, live.** ${rule} Ten lanes on \`example-model\` at the PR head
${Array.from({ length: 10 }, (_, i) => `- [ ] Lane ${i + 1}. Save \`lane-${i + 1}.png\`. Pass when evidence exists.`).join('\n')}
**Verify, perf.** ${rule}
${['Metric.', 'Probe.', 'Baseline.', 'Rule.'].map(s => `- [ ] ${s} Recorded.`).join('\n')}
**Review gate.** None.
**Merge.**
- [ ] Merge when approved.
## Close the program
Close.
## Appendix Prototype evidence
Recorded.
`;

for (const [host, tree, judgment, tool, config, code] of [
  ['Codex', 'codex', 'gpt-6-astra', 'spawn_agent', '$CODEX_HOME/AGENTS.md', 'gpt-6.1-sol'],
  ['Claude Code', 'claude-code', 'opus', 'Agent', '$CLAUDE_CONFIG_DIR/rules/pstack-models.md', 'haiku'],
]) {
  test(`${host} compiles native models, effort, tools and configuration independently`, () => {
    const input = '`claude-opus-5-5-xhigh`, `grok-4.7-high-fast`, `inherit-parent medium`, `auto`, `Task`, `~/.cursor/rules/pstack-models.mdc`';
    const output = compileMarkdown('example.md', input, host, []);
    assert.equal(output, `\`${judgment} xhigh\`, \`${code} high\`, \`inherit-parent medium\`, \`auto\`, \`${tool}\`, \`${config}\``);
  });

  test(`${host} packaged checker accepts a native plan and rejects missing cadence and proof`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'pstack-plan-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'plan.md');
    const checker = join(root, 'harness/pstack', tree, 'skills/poteto-mode/scripts/check-plan.mjs');
    const native = compileMarkdown('plan.md', plan, host, []);
    const run = text => {
      writeFileSync(file, text);
      return spawnSync(process.execPath, [checker, file], { encoding: 'utf8' });
    };
    const valid = run(native);
    assert.equal(valid.status, 0, valid.stderr);
    const cadence = host === 'Codex' ? 'hourly T3 schedule_task' : '/loop 1h';
    assert.ok(native.includes(cadence), cadence);
    assert.equal(run(native.replace(cadence, 'a cadence')).status, 1);
    assert.equal(run(native.replace('cat <pstack skills dir>/', 'the skills')).status, 1);
    assert.equal(run(native.replace('**Verify, perf.**', '**Other.**')).status, 1);
  });

  test(`${host} compilation fails when required source sections or shell guards drift`, () => {
    assert.throws(() => compileMarkdown('skills/setup-pstack/SKILL.md', '# Changed', host, []), /source section changed/);
    const audit = readFileSync(join(root, 'pstack/skills/poteto-mode/scripts/worktree-audit.sh'), 'utf8');
    assert.throws(() => compileAudit(audit.replace('harness=cursor', 'harness=other'), host), /source.*changed/);
  });
}
