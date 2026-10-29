# pstack for Codex

A Codex port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack), maintained by [janozeli](https://github.com/janozeli). It preserves the original skills, roles, panel sizes, and playbooks, with native Codex tools, model settings, session history, and plugin installation.

## Install

From a local clone:

```text
git clone https://github.com/janozeli/pstack-codex.git
cd pstack-codex
codex plugin marketplace add "$(pwd)"
codex plugin add pstack@pstack-codex
```

Start a new session, then run:

```text
$pstack:setup-pstack
$pstack:poteto-mode reproduce this bug, fix it, and verify the result
```

For help, use `$pstack:poteto-help`.

The plugin keeps the `pstack` namespace. If another pstack distribution is enabled, disable that copy before enabling this one. The separate `pstack-codex` marketplace does not replace `cursor-plugins`.

Use the current Codex plugin CLI and live model schema. Provider and host restrictions still apply. The worktree auditor needs Node.js 22+, Bash, Git, jq, ripgrep, and standard filesystem utilities. GitHub workflows use `gh` when no host forge tool is available.

## How it works

`poteto-mode` selects the original playbook and coordinates its investigation, implementation, review, and proof steps. `setup-pstack` keeps the original role list and budget choices. It maps supported model defaults to the host's aliases and unsupported providers to the parent model with an explicit effort; it does not introduce a new model catalog.

Native Codex agents cannot supply every provider in the original panels. The native runtime contracts report reduced diversity and follow each skill's stated fallback. Features requiring Cursor cloud machines, Automations, or other unavailable capabilities remain incomplete unless a verified host equivalent satisfies them. A worktree is not a separate machine, and a draft placeholder does not count as successful verification.

Read the [native runtime contracts](harness/pstack/codex/docs/runtime.md) and [standalone guide](harness/pstack/codex/docs/guide/README.md). The generator compiles shared source into native instructions before installation; the package does not read a translation adapter or require the source checkout. The separate Claude distribution is [pstack-claude](https://github.com/janozeli/pstack-claude).

## Maintain and validate

`pstack/` is the source; `harness/pstack/codex/` is the installable generated package. Edit the source and scripts/standalone/ compiler, then regenerate. The repository retains upstream history and the other source trees to make future upstream synchronization reviewable. Its Codex marketplace exposes only pstack.

```bash
npm ci
node scripts/generate-pstack-harness-trees.mjs
node scripts/validate-plugins.mjs
node scripts/generate-pstack-harness-trees.mjs --check
node scripts/check-pstack-docs.mjs
npm test
npm run typecheck:statechart
```

See [Tests and CI](docs/testing.md) for all Bun suites, real TLC execution and isolated native installation checks. CI requires zero skipped statechart tests and verifies both hosts with pinned CLIs. Runtime tests do not execute every workflow with external models or services.

This port starts from `janozeli/pstack-codex` commit `d1c670b8d371200f4b15c2b2038818181e9a6c41`. The original author credit and [MIT license](pstack/LICENSE) are retained. Port releases use a `-codex.N` version suffix to distinguish them from upstream releases.
