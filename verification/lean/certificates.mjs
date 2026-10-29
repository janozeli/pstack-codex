import assert from 'node:assert/strict';

// Lean String literals intentionally support a smaller, explicit escape set
// than JSON. Control characters are encoded as hexadecimal scalar escapes.
export const quote = value => '"' + [...value].map(c => {
  if (c === '"' || c === '\\') return '\\' + c;
  if (c === '\n') return '\\n';
  if (c === '\r') return '\\r';
  if (c === '\t') return '\\t';
  const n = c.codePointAt(0);
  assert.ok(n < 0xd800 || n > 0xdfff, 'Unpaired surrogate cannot enter a proof');
  return n < 32 || n === 127 ? `\\x${n.toString(16).padStart(2, '0')}` : c;
}).join('') + '"';
const list = xs => `[${xs.join(',')}]`;
export const chunkTerm = c => `⟨${quote(c.keep)},${quote(c.before)},${quote(c.after)}⟩`;
export const stepTerm = s => `(⟨${list(s.chunks.map(chunkTerm))},${quote(s.tail)},${quote(s.output)}⟩ : Translation.Step)`;
export const traceTerm = (t, rules = '[]') => `Translation.checkTrace (Translation.allowed ${rules}) ${quote(t.input)} ${list(t.steps.map(stepTerm))} ${quote(t.output)} = true`;
export const packageTerm = (expected, actual) => {
  const entries = xs => list(xs.map(e => `(⟨${e.path},${e.content},${e.executable}⟩ : Translation.Entry)`));
  return `Translation.checkPackage ${entries(expected)} ${entries(actual)} = true`;
};

// The compiler's matches are untrusted witnesses. Decode semantic edits by
// their exact rule identity; Lean reconstructs the source spelling itself.
export function semanticTerms(step, tag) {
  const terms = [];
  const modelRule = /^\/\\b(?:claude-opus-5-5|grok-4)/.test(step.rule);
  const commandRule = step.rule.includes('(?<![\\w/:])');
  for (const c of step.chunks) {
    if (modelRule) {
      const m = c.before.match(/^(claude-opus-5-5|grok-4\.7)-(low|medium|high|xhigh|max)(-fast)?$/);
      assert.ok(m, `Invalid model witness: ${c.before}`);
      const model = `(⟨.${m[1].startsWith('claude') ? 'opus' : 'grok'},.${m[2]},${!!m[3]}⟩ : Port.SourceModel)`;
      terms.push(`${quote(c.before)} = Port.sourceRender ${model} ∧ ${quote(c.after)} = Port.render (Port.translate .${tag} ${model})`);
    } else if (commandRule) {
      assert.match(c.before, /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
      terms.push(`${quote(c.after)} = Port.invocation .${tag} ${quote(c.before.slice(1))}`);
    }
  }
  return terms;
}
