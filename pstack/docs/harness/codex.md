# pstack in Codex

pstack skills use Cursor names. In Codex, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects. Tool names below are the ones Codex exposes. A session that names them differently, such as a host app that wraps Codex, keeps the same mapping under its own names.

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
| `environment: "cloud"` | Create a git worktree with `git worktree add`, then tell the worker to work only inside that path. Subagents share your filesystem, so never let two writers share one checkout. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Create the worktree from `<b>`. |
| `run_in_background: true` | Omit. `spawn_agent` returns at once and the agent runs alongside you. |
| `resume` | Spawn a new agent and paste the earlier result into its `message`. Use `followup_task` only where the skill allows reuse. |
| `file_attachments` | List the paths in the `message`. |

Pass `fork_turns: "none"` on every spawn. pstack briefs carry their own context, and Codex accepts `model` and `reasoning_effort` only with it.

## Models

| Cursor | Codex |
| --- | --- |
| A `gpt-*` slug, such as `gpt-6.1-sol-xhigh` | `model: "gpt-6.1-sol"` and `reasoning_effort: "xhigh"` when `spawn_agent` lists that model. Otherwise omit `model` and keep `reasoning_effort`, and say so. |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh`, or a `grok-*` slug | Omit `model` so the agent runs on the session model, keep the effort as `reasoning_effort`, and say so. Drop `-fast`. |
| `auto` or `inherit-parent` | Omit `model` and `reasoning_effort`. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | The `pstack models` block in `$CODEX_HOME/AGENTS.md` (`~/.codex/AGENTS.md` by default). Codex loads that file into every session, so the role lines are already in context. If they are not, read the file. If the block or the role's line is missing, use the skill's default slug. |
| A role value `<model> <effort>`, such as `gpt-6-astra high` | `model: "gpt-6-astra"` and `reasoning_effort: "high"`. |

A panel that needs different model families, such as `arena` or `interrogate`, gets only the families Codex can spawn. Say so in the report instead of treating agreement between two runs of one family as independent.

## setup-pstack

Codex loads `AGENTS.md` into each session, so `setup-pstack` writes its rule there. Follow its steps with these changes:

- Detect. The detected models are the `model` values that `spawn_agent` documents, each with the `reasoning_effort` values it allows. Write a real model as `<model> <effort>`, such as `gpt-6-astra xhigh`. The effort is the last token, so the budget step works as written.
- Defaults. Map each default slug with the rows above: `claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast` become `inherit-parent` unless the user picks a detected model.
- Write. In `$CODEX_HOME/AGENTS.md`, replace everything between `<!-- pstack models -->` and `<!-- /pstack models -->` with the comment lines, the `# budget` line, and one line per role from step 5. Add the two markers at the end of the file when they are missing. Never edit text outside the markers.

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/`, `~/.agents/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `$CODEX_HOME/plugins/`, `.codex-plugin/plugin.json` |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md`. Codex never reads `.mdc` files. The model rule lives in a marked block there. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills, the agents, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$CODEX_HOME/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`. The first line of each file is `session_meta`, and its `payload.cwd` names the workspace. Read only files whose `cwd` is this workspace or inside it. The newest such file is the current session. |

## Cursor-only features

Codex has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in Codex: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | Codex |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. |
