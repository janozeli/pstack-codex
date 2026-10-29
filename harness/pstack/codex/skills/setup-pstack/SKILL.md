---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for $pstack:setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Follow the [native runtime contracts](../../docs/runtime.md) for delegation, configuration, session evidence, and optional capabilities.

Write `$CODEX_HOME/AGENTS.md`, an always-applied rule that sets pstack's model per role.

## Steps

### 1. Detect available models

Enumerate models and efforts accepted by the live dispatch tool. Use only confirmed available choices. Inherited aliases are allowed, but explicit efforts must also be supported. Read docs/runtime.md for the native configuration location and dispatch fields. Then detect seats on other providers: run `--version` for each of `codex`, `claude` and `grok` other than this host, and offer each one that answers as `<provider>:<model> <effort>` choices for the roles that answer without writing files, the arena cross-judge pool and interrogate reviewers, so their judgment keeps a family other than the parent's. Roles that write artifacts, such as arena and architect runners, keep native or T3 seats. In T3, the providers `orchestrator_capabilities` lists are the preferred route.

### 2. Load current state

Load the native model configuration. Read only the pstack models block in AGENTS.md; unrelated instructions are not role entries. Missing roles use the defaults below. Preserve customized model choices and panel lengths. Drop retired role labels only from this configuration and show them before confirmation.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer request_user_input when available over free text. Offer these four options with these exact labels, and name the current budget when the rule records one. With no rule, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Use the existing role list and preserve customized models and panel lengths. Budgets unlimited, large, medium, and small request max, xhigh, high, and medium respectively. Change explicit effort tokens on models and inherited aliases. Bare auto and inherit-parent continue inheriting both settings: mark those roles outside budget control and offer an explicit effort before confirmation. Use the highest supported effort at or below the request, or leave the role needing a choice. Save effective supported values.

**(c) Show the roles and confirm.** Show every role with its model, marking any real slug not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model, which is how Auto users stay on Auto) as the options. Prefer request_user_input when available over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a family other than the parent's, in list order, so order it by preference. An `inherit-parent` or `auto` value never judges. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Validate the model ID and explicit effort separately against the actual dispatch schema. Inherited aliases keep their documented semantics; explicit effort still requires support. An unavailable required model leaves the role needing a choice. Do not save an unsupported setting.

### 5. Write the rule

In $CODEX_HOME/AGENTS.md (default ~/.codex/AGENTS.md), replace only the block between <!-- pstack models --> and <!-- /pstack models -->. Append the markers when absent. Preserve all text outside the block. Do not write editor-specific frontmatter. Shape:

```
# budget: large (xhigh)
feature, refactoring: inherit-parent xhigh
bug-fix: inherit-parent xhigh
perf-issue: inherit-parent xhigh
hillclimb: inherit-parent xhigh
judgment and prose: inherit-parent xhigh
hardest tasks: inherit-parent xhigh
how explorer: inherit-parent xhigh
how explainer: inherit-parent xhigh
why investigators: inherit-parent xhigh
why synthesizer: inherit-parent xhigh
reflect tooling: inherit-parent xhigh
reflect judgment, divergent, synthesizer: inherit-parent xhigh
arena runners: inherit-parent xhigh, inherit-parent xhigh
arena cross-judge pool: inherit-parent xhigh, inherit-parent xhigh
swarm workers: inherit-parent xhigh
architect runners: inherit-parent xhigh, inherit-parent xhigh
interrogate reviewers: inherit-parent xhigh, inherit-parent xhigh
```

### 6. Confirm

Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with $pstack:create-verification-skill." On yes, invoke `$pstack:create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with $pstack:create-formal-verification-skill." On yes, invoke `$pstack:create-formal-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
