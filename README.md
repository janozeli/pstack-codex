# pstack for Claude Code and Codex

A port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack) for Claude Code and Codex, maintained by [janozeli](https://github.com/janozeli). It preserves the original skills, roles, panel sizes, and playbooks, with native host tools, model settings, session history, and plugin installation.

## Install

Claude Code:

```text
/plugin marketplace add janozeli/pstack-port
/plugin install pstack@pstack-port
```

Codex:

```text
codex plugin marketplace add https://github.com/janozeli/pstack-port.git
codex plugin add pstack@pstack-port
```

Start a new session, then run setup and a first task. Claude Code prefixes commands with `/pstack:` and Codex with `$pstack:`:

```text
/pstack:setup-pstack
/pstack:poteto-mode reproduce this bug, fix it, and verify the result
```

To keep poteto-mode on for a whole session, the counterpart of the author's Custom Mode, start Claude Code with `claude --agent pstack:poteto-mode`, or create the `codex -p poteto` profile described in the Codex [setup guide](harness/pstack/codex/docs/guide/01-setup.md).

For help, use `/pstack:poteto-help` or `$pstack:poteto-help`. In Claude Code, update with `claude plugin update pstack@pstack-port`.

The plugin keeps the `pstack` namespace. If another pstack distribution is enabled, disable that copy before enabling this one.

Claude Code 2.1.292 or later is required for per-invocation subagent effort. Use the current Codex plugin CLI and live model schema. Provider and host restrictions still apply. The worktree auditor needs Node.js 22+, Bash, Git, jq, ripgrep, and standard filesystem utilities. GitHub workflows use `gh` when no host forge tool is available.

## How it works

`poteto-mode` selects the original playbook and coordinates its investigation, implementation, review, and proof steps. `setup-pstack` keeps the original role list and budget choices. It maps supported model defaults to the host's aliases and unsupported providers to the parent model with an explicit effort; it does not introduce a new model catalog.

Native host agents cannot supply every provider in the original panels. The native runtime contracts report reduced diversity and follow each skill's stated fallback. Features requiring Cursor cloud machines, Automations, or other unavailable capabilities remain incomplete unless a verified host equivalent satisfies them. A worktree is not a separate machine, and a draft placeholder does not count as successful verification.

Each host has its own runtime contracts and guide: [Claude Code](harness/pstack/claude-code/docs/runtime.md) ([guide](harness/pstack/claude-code/docs/guide/README.md)) and [Codex](harness/pstack/codex/docs/runtime.md) ([guide](harness/pstack/codex/docs/guide/README.md)). The generator compiles shared source into native instructions before installation; the packages do not read a translation adapter or require the source checkout.

## Maintain and validate

`pstack/` is the source. `harness/pstack/claude-code/` and `harness/pstack/codex/` are the installable generated packages. Edit the source and scripts/standalone/ compiler, then regenerate. The repository retains upstream history and the other source trees to make future upstream synchronization reviewable. Both marketplaces expose only pstack.

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

[Lean verification](docs/lean-verification.md) checks complete rewrite traces and package inventories with a formally verified validator in CI. Lean is verification tooling only and is excluded from installed pstack packages.

This repository was `janozeli/pstack-codex`; it absorbed `janozeli/pstack-claude`, whose generated packages were identical. The original author credit and [MIT license](pstack/LICENSE) are retained. Port releases use `-claude.N` and `-codex.N` version suffixes to distinguish them from upstream releases.
