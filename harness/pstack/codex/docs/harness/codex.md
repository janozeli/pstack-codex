# pstack in Codex

pstack skills use Cursor names. In Codex, read this file once per session before following a skill. `<pstack>` means the folder that holds `skills/` and `docs/`. Follow the host's instructions and tool schemas when they differ from this adapter. Never pass a field or value the tool schema rejects. An unknown optional field can be omitted with an explanation. If it provides required isolation, verification, or persistence, resolve that capability before running the dependent step.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | `spawn_agent` with `task_name` and `message`. Collect results with `wait_agent`. |
| `AskQuestion` | Ask in plain text. Use `request_user_input` only when the session offers it. |
| Open a todolist | Use the plan tool (`update_plan`) if the session offers it. Otherwise keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` with the shell and follow it. When you tell the user to type it, write `$pstack:<name>`. |
| `Grep`, `Glob` | The shell with `rg` and `rg --files`. |

## Subagent fields

A pstack skill that tells you to spawn a subagent is the explicit request Codex needs before it delegates.

| Cursor | Codex |
| --- | --- |
| `subagent_type: generalPurpose` | `spawn_agent` with no other field. |
| `poteto-agent`, `comment-sicko` | `spawn_agent` has no agent type. Start the `message` with "Read `<pstack>/agents/<name>.md` in full and act as that agent." and give the absolute path. |
| `readonly: true` | Say "read-only. Do not edit files" in the `message`, and check `git status` afterward. |
| `readonly: false` | Omit. |
| `environment: "cloud"` | Use the host's isolated-worker tool when it provides one. In T3, use `delegate_task` with `isolation: "worktree"`; that tool creates the checkout. Never create a child's checkout in the shell there. In a host that permits manual isolation, create a git worktree and restrict the worker to that path. A worktree separates files, not processes, ports, credentials, or machines. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Supply `<b>` through the host's isolation contract, or use it as the base of a manual worktree when the host permits one. |
| `run_in_background: true` | Omit. `spawn_agent` returns at once and the agent runs alongside you. |
| `resume` | Spawn a new agent and paste the earlier result into its `message`. Use `followup_task` only where the skill allows reuse. |
| `file_attachments` | List the paths in the `message`. |

When the native tool requires it for model or effort overrides, pass `fork_turns: "none"`. Give each fresh child the absolute skill path and all task context. Follow the host's delegation rules for provider, settings, isolation, and background work. Changing a tool name does not preserve those contracts by itself.

## Models

| Cursor | Codex |
| --- | --- |
| A `gpt-*` slug, such as `gpt-6.1-sol-xhigh` | `model: "gpt-6.1-sol"` and `reasoning_effort: "xhigh"` when `spawn_agent` lists that model. Otherwise omit `model` and keep `reasoning_effort`, and say so. |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh`, or a `grok-*` slug | Omit `model` so the agent runs on the session model, keep the effort as `reasoning_effort`, and say so. Drop `-fast`. |
| `auto` or `inherit-parent` | Omit `model` and `reasoning_effort`. |
| `auto <effort>` or `inherit-parent <effort>`, such as `inherit-parent xhigh` | Omit `model` and pass the supported effort as `reasoning_effort`. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | The `pstack models` block in `$CODEX_HOME/AGENTS.md` (`~/.codex/AGENTS.md` by default). Codex loads that file into every session, so the role lines are already in context. If they are not, read the file. If the block or the role's line is missing, use the skill's default slug. |
| A role value `<model> <effort>`, such as `gpt-6-astra high` | `model: "gpt-6-astra"` and `reasoning_effort: "high"`. |

Read the effort suffix before interpreting the model or alias. An inherited alias with an effort still belongs to the parent's family and never supplies Arena's cross-family judge. Use only efforts accepted by the dispatch tool. If the requested effort is unavailable, use the highest supported effort at or below it and report the effective value. If none qualifies, mark that role as needing a choice instead of inventing a value.

A panel that needs different model families, such as `arena` or `interrogate`, gets only the families the host can dispatch. Report reduced diversity. Two runs from one family do not satisfy a different-family requirement. Use a skill's explicit fallback, such as Arena's coordinator verdict, when it provides one. Otherwise leave that review requirement unmet.

## setup-pstack

Codex loads `AGENTS.md` into each session, so `setup-pstack` writes its rule there. Follow its steps with these changes:

- Detect. The detected models are the `model` values that `spawn_agent` documents, each with the `reasoning_effort` values it allows. Write a real model as `<model> <effort>`, such as `gpt-6-astra xhigh`. The effort is the last token, so the budget step works as written.
- Defaults. Map `claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast` to `inherit-parent xhigh` unless the user picks a detected model. This preserves the default effort without introducing another model catalog.
- Budget. Apply the budget to real models and aliases with an explicit effort. `small` changes `inherit-parent xhigh` to `inherit-parent medium`. Keep the bare aliases `inherit-parent` and `auto` unchanged, including on reruns of an existing configuration. They inherit both model and effort. Before confirming, identify every such role as outside the selected budget and offer an explicit effort if the user wants the budget to apply. Validate supported efforts for aliases too, using the Models fallback above. Save the effective values, not an unsupported target.
- Write. In `$CODEX_HOME/AGENTS.md`, replace everything between `<!-- pstack models -->` and `<!-- /pstack models -->` with the comment lines, the `# budget` line, and one line per role from step 5. Add the two markers at the end of the file when they are missing. Never edit text outside the markers.

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/`, `~/.agents/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `$CODEX_HOME/plugins/`, `.codex-plugin/plugin.json` |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md`. Codex never reads `.mdc` files. The model rule lives in a marked block there. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills, the agents, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$CODEX_HOME/sessions/` and `$CODEX_HOME/archived_sessions/`, under `~/.codex` when `CODEX_HOME` is unset. Read `session_meta` first. Its `payload.cwd` scopes access and `payload.id` identifies the session. Follow Session identity below. |

## Session identity

Use the current session ID or transcript path supplied by the host. Validate the file's `session_meta.payload.id` against that ID when supplied, and validate `payload.cwd` against the current checkout or an explicitly relevant worktree. Resolve symlinks before comparing paths with directory boundaries. For a removed directory, resolve its existing ancestor and append the missing suffix. If the scope remains uncertain, use the digest fallback without reading the conversation content. Recency can order candidates, but never establishes which conversation is current. Do not select another conversation or subagent merely because its file is newer.

For `reflect`, locate the opening user message in a `response_item` with `payload.role: "user"`, or an `event_msg` with `payload.type: "user_message"`. The first JSONL line is metadata, not the opening prompt. If the host supplies no reliable identity, or the transcript cannot be matched, pass a concise digest of this conversation to the reviewers and name that fallback. Do not guess a session from the opening text alone.

For `show-me-your-work`, use the verified session to audit this run. With only a digest, compare against the evidence available in the current conversation and report that transcript verification remains incomplete. Do not claim a complete transcript audit.

`skills/poteto-mode/scripts/worktree-audit.sh` automatically reads Codex history when installed in the Codex tree. When running the source copy, pass `--harness codex`. Its helper reads workspace metadata before inspecting any conversation content and includes archived sessions belonging to registered checkouts. `review-history` means evidence could not be read, not that the worktree is inactive. Chat activity is still only one input to cleanup, never authorization to delete.

## Workflow dependencies

Resolve a dependency before the step that needs it. Use the following equivalents and name the actual tool used. An unavailable verification capability leaves the verdict blocked. Keep independent work moving, but do not claim `PASS`, merge readiness, or completion for dependent steps.

| Cursor dependency | Codex equivalent |
| --- | --- |
| `create-skill` | Use an installed authoring skill such as `skill-creator`. If none exists, follow the repository's skill format, validate its frontmatter and links, and prove the resulting instructions on the requested task. |
| `deslop` from `cursor-team-kit` | Apply the bundled `unslop` to prose. Review the code diff for extra comments, inconsistent style, unnecessary checks in trusted paths, casts that bypass types, and avoidable nesting. Keep behavior except for the intended fix. Name this review instead of claiming the absent skill ran. |
| `control-cli` from `cursor-team-kit` | Run the actual CLI through the shell. Use a PTY for interactive behavior and check its output and exit status. |
| `control-ui` from `cursor-team-kit` | Use the host's permitted browser, desktop, or simulator controls on the actual UI. Without them, report the behavioral verification as blocked. A screenshot or unit test alone does not satisfy an interactive check. |
| `/loop` | Use the host's persistent monitoring or event subscription when available, and follow its lifecycle rules. Otherwise execute the current round and report that continued monitoring is not configured. Do not promise work after the session ends. |
| Project tracker and Project store | Use the host's project state tools. If absent, keep task IDs, owners, branches, dependencies, evidence, and next actions in a project-local `notes.md`, and pass its relevant contents to each new worker. This preserves textual state, not a running environment. |
| Fork a worker's built state | Use a supported environment fork. Otherwise reconstruct the checkout and required processes, then revalidate them. If that is impossible, block the dependent unit instead of treating a fresh agent as a process fork. |

## Cursor-only features

Codex does not provide Cursor Automations or Cursor cloud machines. Host integrations may provide other monitoring, secret, and PR tools. Prefer an available equivalent that satisfies the step and its authorization requirements. If none exists, report `Skipped in Codex: <step>. <reason>.` Continue only independent steps. A placeholder can support a draft, but never passes a probe or deployment that needs a real URL, key, or service. In particular, `make-bot-ui` remains a draft until its webhook, secret, and routine exist and its real request succeeds.

| Cursor | Codex |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Use an authorized host equivalent when present. Otherwise report the unavailable capability and leave dependent execution incomplete. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | Apply the isolation contract in Subagent fields. A step needing a separate machine or a cloud dashboard remains unavailable unless the host supplies it. |
| A built-in PR tool | Use the host's PR tool when required. Otherwise use the forge command that the step gives, such as `gh pr create`. That is not a skip. |
