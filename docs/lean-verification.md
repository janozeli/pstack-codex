# Verified translation validation

Lean is development and verification tooling only. It is not a pstack skill, runtime requirement or installed asset. Both standalone packages remain byte-for-byte unchanged by this integration.

## Method and research

A verified validator checks a particular compiler run against a formal relation, with a general theorem proving that acceptance implies that relation. This is the translation-validation approach described by [Tristan and Leroy](https://xavierleroy.org/publi/validation-scheduling.pdf). It lets us keep the JavaScript compiler while connecting proofs to actual input, intermediate transformations and installed output.

We use structural induction for arbitrary rewrite chains, contextual lifting for composition, arithmetic reasoning for insertion/deletion accounting, and an inductively proved linear uniqueness check for canonical inventories. Ordinary lexical examples remain JavaScript tests. They are no longer presented as the main contribution of Lean.

[Lean's proof-validation guidance](https://lean-lang.org/doc/reference/latest/ValidatingProofs/) distinguishes a valid proof from the meaning of its statement. We audit transitive axioms of the general theorems and use `decide +kernel` for small positive/negative proof controls. For whole artifacts, we execute the proved checker in Lean; this explicitly trusts the Lean compiler/runtime and JSON decoder, in addition to the kernel that checked the general proofs. We do not claim protection from a malicious maintainer changing both specifications and proofs, or an independently rechecked/exported kernel proof.

## Connection to the real build

The actual compiler uses `scripts/standalone/edits.mjs` for replacements and section edits. It constructs the output from ordered, non-overlapping spans and optionally emits the unchanged prefix, original span, replacement and final suffix. Certificate collection is part of the same execution that constructs the package, not a parallel toy compiler. The final link rewrite is traced too. No observer is required for normal generation.

`verification/lean/evidence.mjs` imports the real renderer, reads the actual source checkout and installed trees, and builds independent expected file inventories from the source directories and explicit host policy. It verifies the start of each trace against the source file. The Lean checker verifies every intermediate link and the final distributed text. Files without rewrite traces must retain their complete bytes and executable flag. New runtime documentation, manifests and Codex invocation policy files have explicit construction rules. Exactly one opposite-host history helper is excluded per package. Source enumeration excludes development `node_modules` directories and `.DS_Store`, matching the generator. Installed trees have no such exclusions: unexpected files fail inventory validation. Symlinks are rejected rather than followed.

Inventory identifiers are interned injectively from full paths and complete file bytes using exact string/base64 keys; there is no hash-equality assumption in the content comparison. Entries include path identity, content identity and executable status. Inventories are canonically sorted before reflection. The Lean validator checks equality and strict adjacent ordering; its proof establishes uniqueness, complete coverage, no extra entries and identical cardinality for any accepted inventory. It checks both the renderer's output and files actually present on disk. Duplicate, missing, added, renamed, modified and permission-changed entries cannot pass that relation.

## General proof obligations

`Translation.lean` establishes these properties for arbitrary strings, chunk lists, traces and inventories:

- **Framing:** every accepted step reconstructs its complete source and target from the same ordered unchanged pieces and explicit replacements. An omitted, duplicated or reordered region cannot be hidden from this reconstruction.
- **Accounting and reversal:** the difference in character counts is exactly the declared insertions/deletions; reversing the replacement relation reconstructs the source from the target using the recorded original spans.
- **Composition:** an accepted sequence connects the actual input to the actual output without a gap. A contextual semantic relation preserved by individual rules is preserved by the whole pipeline. Identity-only rules preserve the entire document.
- **Syntax contracts:** recognized source model and command tokens must have their specified host translation. A rule label supplied by the compiler cannot bypass the contract lookup. `Port.lean` defines the source grammar and host mappings independently.
- **Role configuration:** a relational list checker, with soundness and completeness proofs, aligns the complete source/default tables with native tables. Accepted tables preserve role names and order, panel lengths and order, and each model/effort translation. It rejects missing or extra roles and seats.
- **Package integrity:** accepted canonical inventories contain each expected path exactly once, with the expected bytes and executable flag, and contain no extra entries.

The same checking functions used in these soundness theorems are called by `Runner.lean` for every changed document and the complete inventories in both host trees. The audited definitions are first built into a temporary `Verified.olean`; the runner imports that exact module. Artifact acceptance is a computed result of a proved program, not a separate kernel proof for every document. There is no sampling of documents or hardcoded 992-example coverage gate. Coverage grows with the source tree.

## Exact boundary and remaining trust

Framing proves conformance to the emitted edit plan. It does **not** prove that each selected prose rewrite is desirable or semantically equivalent English. JavaScript RegExp matching, the reviewed replacement policy, runtime-document factory and manifest field choices remain reviewed code. SHA256 drift guards require deliberate re-review of that policy, including the shared span engine and generator. A change deliberately reflected in both policy and certificate can pass; the proof does not replace review of the policy.

Model and command contracts constrain complete matched lexical tokens, not arbitrary natural-language passages containing such tokens. The semantic composition theorem is conditional on a semantic justification for the rules; we do not claim to have supplied a meaning for all pstack prose. Parser completeness, all possible JavaScript inputs and model-driven workflows are not formally proved.

The trusted I/O bridge includes Node, filesystem reads, UTF-8 validation, exact-byte interning and Lean-literal serialization. The general theorem is kernel-checked; the executable checker reads reflected JSON. The kernel does not open repository files itself. We trust the standard Lean compilation/runtime pipeline to execute the proved definitions faithfully. The I/O wrapper and JSON decoder are reviewed and tested, not formally verified. The standard Lean kernel/library and reviewed theorem statements are trusted. Proof sources import only `Std`, and all required general theorems and small kernel-checked controls must report only `propext`, `Classical.choice` and `Quot.sound`. There are no proof holes, custom axioms or native proof oracles. Runtime execution is not disguised as `native_decide`.

TLC, runtime tests, documentation checks and native installation tests remain independent evidence. They are not replaced by the Lean certificates.

## Failure controls and reproduction

Mandatory negative controls reject incomplete proofs, a custom axiom, invalid trace inputs/outputs, missing and repeated stages, lost unchanged text, omitted/duplicated/renamed files, content and permission changes, and duplicate inventory keys. A real mutation of the JavaScript span engine deletes a character outside the matched span; its emitted certificate must fail in Lean. Small kernel controls must fail because the proposition is false, not because compilation timed out or failed to parse. Separate executable controls must report the intended rejection, and cover the JSON/file boundary, missing coverage and wrong model translations.

With Node.js 22.23.4, Linux, curl, tar, zstd and sha256sum:

```bash
tools_dir=$(mktemp -d)
bash verification/lean/install.sh "$tools_dir/lean"
export LEAN="$tools_dir/lean/bin/lean"
npm run verify:lean
```

An existing Lean 4.35.0 executable may be supplied via `LEAN`. The pinned release archive is checksum-verified. Missing Lean, version drift, missing axiom reports, policy drift or any rejected certificate fails the job. No skip mode exists. Temporary certificates are removed after the run. CI executes the same command in the `port-proofs` job.

When source or policy changes, inspect its semantics before updating `coverage.json`. Update the proof/specification if its contract changed, then run generation consistency, the behavioral suites, all certificates and negative controls. Never refresh drift hashes merely to silence a failure. Package bytes need not change when verification code changes; if they do, review that change independently.

## Extending the verifier

New text transformations must use the span engine so their complete input/output chain is observable. New lexical model families require updating the independent grammar/mapping and the universal `model_rule_present` proof, not just fixtures. New generated assets require an explicit inventory policy, independently of the renderer's emitted keys. A checker algorithm change must preserve its soundness theorem and rejection controls. The source-to-native role table relation is checked separately from prose edits, so an opaque section rewrite cannot silently drop a configured role or panel seat.
