# Lean verification of the port

Lean is a repository verification tool. It is not a pstack capability, skill, runtime dependency or part of either generated package. Installing pstack does not install Lean. The existing TLC tests continue to check statechart behavior independently.

## What is proved

`verification/lean/Port.lean` defines an independent typed model of the port's model translation. Seven kernel-checked theorems establish that:

- Translation preserves effort for every source model and both hosts.
- Codex inherits the parent model; Claude preserves the Opus family when translating Opus.
- The source fast suffix does not change the translated model.
- Translating any list of roles preserves role names and order.
- Translating a panel of any length preserves its size, effort values and seat order.

These are universal statements about the typed model. The model records the port's existing design; it does not decide whether those host choices are desirable or claim that different host models have identical behavior.

## Connection to the actual port

`verification/lean/check.mjs` imports the real JavaScript compiler and submits its observed outputs as equality theorems against that independent Lean model. It checks both hosts, with 992 obligations in total:

| Compiler observations per host | Count | Contract |
| --- | ---: | --- |
| Model tokens | 20 | Both families, all five efforts, with and without fast |
| Ordered pairs of tokens | 400 | All combinations, including duplicates, preserving separators and order |
| Skill invocations | 58 | Actual skill inventory with the host's native prefix |
| Default role names | 1 | All 17 names in order |
| Default role panels | 17 | Each panel's translated seats in order |

The actual source setup table is compiled and compared with the checked-in native setup tables before those tables become proof obligations. URL preservation is checked in JavaScript for each skill name. Inventory counts are explicit so empty or shortened tables cannot silently pass. SHA256 entries in `coverage.json` require deliberate re-review when the compiler, runtime contract, generator or source setup changes.

This bridge is exhaustive over the stated finite token/pair domain and checks the current role tables. It is **not** a proof of arbitrary JavaScript execution, arbitrary Markdown, all compiler transformations, complete plugin equivalence, or agent/model behavior. Packaging, plans, links, transcripts and installation remain covered by the existing behavioral tests and native CLI checks. A successful Lean run complements those checks; it does not replace them.

## Trust and failure controls

Lean 4.35.0 is pinned in `lean-toolchain` and checked at execution. The Linux installer verifies the release archive's SHA256 before extraction. There are no third-party Lean packages. Observation equalities use `decide +kernel`, without a native computation oracle. Every required theorem and every observation must produce a transitive `#print axioms` report. The only permitted axioms are Lean's standard `propext`, `Classical.choice` and `Quot.sound`. Proof holes, custom axioms and native computation axioms fail verification. The checked proof source also forbids `sorry`, `admit`, `axiom`, `native_decide`, unsafe/external implementations and imports other than `Std`; Lean runs with warnings as errors.

Mandatory negative controls use disposable copies to demonstrate rejection of a wrong effort definition, an incomplete proof, a theorem depending on a custom axiom, and an actual compiler mutation that changes `xhigh` to `low`. The latter reaches Lean independently of the shipped-table and checksum gates. These controls never alter tracked source or packages.

The trusted boundary includes the pinned Lean kernel/toolchain and standard library, the Node process, this observation/axiom-audit harness and the reviewed translation model. Hashes detect drift; they do not prove unchanged code correct or protect against coordinated changes to the verifier itself. Review model, bridge and proof changes together. See Lean's official guidance on [axioms](https://lean-lang.org/doc/reference/latest/Axioms/) and [validating proofs](https://github.com/leanprover/downstream-lean4/blob/master/reference-manual/Manual/ValidatingProofs.lean).

## Running and maintaining verification

With Node.js 22.23.4, Linux, curl, tar, zstd and sha256sum:

```bash
tools_dir=$(mktemp -d)
bash verification/lean/install.sh "$tools_dir/lean"
export LEAN="$tools_dir/lean/bin/lean"
npm run verify:lean
```

Alternatively, point `LEAN` at an existing Lean 4.35.0 executable. Without `LEAN`, the checker uses `lean` from PATH. Missing Lean, the wrong version, compiler drift, missing obligations, failed proofs or failed negative controls are errors; there is no skip mode. Proof outputs are temporary and removed on completion. The dedicated `port-proofs` CI job runs on every PR and push to main, separately from package installation and runtime tests.

When a covered input changes, first inspect that diff and update the independent model or observation domain if its contract changed. Re-run the behavioral tests and generation check. Only then update the affected digest and `reviewedAt` source commit in `coverage.json`, run the full Lean check including negative controls, and request review of the correspondence. Do not refresh hashes merely to silence a failure. Inventory or grammar extensions also require updating the explicit obligations and this coverage table.
