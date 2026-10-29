// Development-time rewrite engine. Certificates describe ordered, disjoint edits.
// This module is never copied into either installed plugin.
export function applyEdits(input, edits, emit, rule) {
  let cursor = 0;
  const chunks = [];
  for (const { start, end, after } of edits) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end < start || end > input.length || typeof after !== 'string')
      throw new Error('Invalid or overlapping rewrite span');
    chunks.push({ keep: input.slice(cursor, start), before: input.slice(start, end), after });
    cursor = end;
  }
  const tail = input.slice(cursor);
  const output = chunks.map(c => c.keep + c.after).join('') + tail;
  if (output !== input) emit?.({ rule, input, output, chunks, tail });
  return output;
}

// ECMAScript replacement-string expansion. Matching stays with the native RegExp
// engine; Lean checks framing, not the semantics of JavaScript regular expressions.
function expand(template, match, captures, offset, input, groups) {
  return template.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (token, key) => {
    if (key === '$') return '$';
    if (key === '&') return match;
    if (key === '`') return input.slice(0, offset);
    if (key === "'") return input.slice(offset + match.length);
    if (key.startsWith('<')) return groups === undefined ? token : (groups[key.slice(1, -1)] ?? '');
    const n = Number(key);
    if (n > 0 && n <= captures.length) return captures[n - 1] ?? '';
    if (key.length === 2 && Number(key[0]) > 0 && Number(key[0]) <= captures.length)
      return (captures[Number(key[0]) - 1] ?? '') + key[1];
    return token;
  });
}

export function rewriter(emit) {
  function replace(input, pattern, replacement, all = false) {
    const edits = [];
    const collect = (...args) => {
      const hasGroups = typeof args.at(-1) === 'object';
      const offset = args.at(hasGroups ? -3 : -2);
      const captures = args.slice(1, hasGroups ? -3 : -2);
      const after = typeof replacement === 'function' ? String(replacement(...args))
        : expand(replacement, args[0], captures, offset, input, hasGroups ? args.at(-1) : undefined);
      edits.push({ start: offset, end: offset + args[0].length, after });
      return after;
    };
    // The returned native result is deliberately unused: output is constructed
    // by the same span engine whose actual certificates are checked in Lean.
    if (all) input.replaceAll(pattern, collect);
    else input.replace(pattern, collect);
    return applyEdits(input, edits, emit, String(pattern));
  }
  return {
    replace,
    replaceAll: (input, pattern, replacement) => replace(input, pattern, replacement, true),
    splice: (input, start, end, after, rule) => applyEdits(input, [{ start, end, after }], emit, rule),
  };
}
