import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
function anchors(file) {
  const seen = new Map();
  const result = new Set();
  let fence;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    const heading = !fence && line.match(/^#{1,6}\s+(.*?)\s*$/);
    if (!heading) continue;
    const slug = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    result.add(count ? `${slug}-${count}` : slug);
  }
  return result;
}
for (const host of ["codex", "claude-code"]) {
  test(`${host} ships native instructions without a runtime translation adapter`, () => {
    const dir = join(root, "harness/pstack", host);
    assert.equal(existsSync(join(dir, "docs/harness")), false);
    const forbidden = /\.cursor(?:\/|-plugin)|cursor-team-kit|api2\.cursor\.sh|\bAskQuestion\b|\bgeneralPurpose\b|\bcloud_base_branch\b|\bfile_attachments\b|`Task`|\bTask tool\b|maps the Cursor names|read \[the .* adapter/;
    const failures = walk(dir).filter(p => /\.(md|sh|mjs|json)$/.test(p)).flatMap(p =>
      readFileSync(p, "utf8").split("\n").flatMap((line, i) => forbidden.test(line) ? [`${p.slice(dir.length + 1)}:${i + 1}: ${line.slice(0,150)}`] : []));
    assert.deepEqual(failures, [], failures.join("\n"));
  });
  test(`${host} has the original complete skill and playbook inventory`, () => {
    const names = dir => readdirSync(dir).filter(name => existsSync(join(dir,name,"SKILL.md"))).sort();
    assert.deepEqual(names(join(root,"harness/pstack",host,"skills")), names(join(root,"pstack/skills")));
    const source = readdirSync(join(root,"pstack/skills/poteto-mode/playbooks")).sort();
    assert.deepEqual(readdirSync(join(root,"harness/pstack",host,"skills/poteto-mode/playbooks")).sort(),source);
  });
}

for (const host of ['codex', 'claude-code']) {
  test(`${host} resolves all packaged relative documentation links`, () => {
    const dir = join(root,'harness/pstack',host);
    const missing = [];
    for (const file of walk(dir).filter(p => p.endsWith('.md'))) {
      for (const [,href] of readFileSync(file,'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^[a-z]+:/i.test(href) || href === 'url') continue;
        const target = href.startsWith('#') ? file : resolve(dirname(file),href.split(/[?#]/)[0]);
        if (!target.startsWith(dir+'/') || !existsSync(target)) missing.push(`${file.slice(dir.length+1)} -> ${href}`);
        else if (href.includes('#') && target.endsWith('.md') && !anchors(target).has(decodeURIComponent(href.split('#')[1]))) missing.push(`${file.slice(dir.length+1)} -> ${href} (missing anchor)`);
      }
    }
    assert.deepEqual(missing,[]);
  });
}

for (const host of ['codex','claude-code']) {
  test(`${host} preserves setup roles and panel sizes`, () => {
    const roles = file => {
      const text = readFileSync(file,'utf8');
      const table = text.slice(text.indexOf('# budget:')).split('```')[0];
      const entries = table.split('\n').filter(line => /^[a-z][^:]+: /.test(line)).map(line => {
        const split = line.indexOf(': ');
        return [line.slice(0,split),line.slice(split+2).split(', ').length];
      });
      assert.equal(entries.length, 17, 'the setup contract has 17 roles');
      return entries;
    };
    assert.deepEqual(roles(join(root,'harness/pstack',host,'skills/setup-pstack/SKILL.md')), roles(join(root,'pstack/skills/setup-pstack/SKILL.md')));
    const scripts = join(root,'harness/pstack',host,'skills/poteto-mode/scripts');
    assert.equal(existsSync(join(scripts,`${host === 'codex' ? 'claude' : 'codex'}-worktree-activity.mjs`)),false);
  });
}

test('implicit invocation policies match source intent only in Codex', () => {
  const source = join(root, 'pstack/skills');
  for (const skill of readdirSync(source)) {
    const path = join(source, skill, 'SKILL.md');
    if (!existsSync(path)) continue;
    const frontmatter = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const disabled = /^disable-model-invocation:\s*true\s*$/m.test(frontmatter);
    const codex = join(root, 'harness/pstack/codex/skills', skill, 'agents/openai.yaml');
    assert.equal(existsSync(codex), disabled, skill);
    if (disabled) assert.match(readFileSync(codex, 'utf8'), /^policy:\n  allow_implicit_invocation: false\s*$/);
    assert.equal(existsSync(join(root, 'harness/pstack/claude-code/skills', skill, 'agents/openai.yaml')), false);
  }
});

test('the compiler rejects a new unmapped source host dependency', async () => {
  const { compileMarkdown } = await import('../standalone/compile.mjs');
  for (const host of ['Codex','Claude Code']) {
    assert.throws(() => compileMarkdown('skills/example/SKILL.md','# Example\n\nRead `.cursor/new-service/state` before acting.\n',host,['example']), /unresolved host dependency/);
  }
});

test('Codex reset instructions preserve the shared AGENTS.md file', () => {
  const guide = readFileSync(join(root,'harness/pstack/codex/docs/guide/01-setup.md'),'utf8');
  assert.doesNotMatch(guide, /delete the file/);
  assert.match(guide, /remove only.*pstack models.*block/i);
  assert.match(guide, /Preserve.*outside.*block/i);
});
