# pstack in Claude Code

pstack skills use Cursor names. In Claude Code, read this file once per session before following a skill. `<pstack>` means the folder that holds `skills/` and `docs/`. Follow the host's instructions and live tool schemas when they differ from this adapter. Omit an unsupported optional field with an explanation. If it supplies required isolation, verification, or persistence, resolve that capability before the dependent step.

## Tools

| Cursor | Claude Code |
| --- | --- |
| `Task` | `Agent`, with the task in `prompt`. Follow the host's delegation rules. |
| `AskQuestion` | `AskUserQuestion` when offered. In noninteractive `-p` mode, state any unresolved required choice and leave dependent work pending. Do not treat an unanswered question as approval. |
| Open a todolist | Use `TodoWrite` or the available task tools. Otherwise track the steps in your reply. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` and follow it. User-only skills cannot be invoked by the model through `Skill`. Tell the user to type `/pstack:<name>`. |
| `Grep`, `Glob` | Use the native tools, or `Bash` with `rg` and `rg --files` when absent. |

## Subagent fields

| Cursor | Claude Code |
| --- | --- |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"`. |
| `poteto-agent`, `comment-sicko` | `pstack:poteto-agent`, `pstack:comment-sicko`. Give the absolute installed skill path and the task context. |
| `readonly: true` | Keep the required agent type and model; tell it "read-only, do not edit files" and check `git status` afterward. This is an instruction, not a filesystem sandbox. Use `Explore` only if its tools and effective model meet the role's contract. |
| `readonly: false` | Omit. |
| `environment: "cloud"` | Use the host's isolation tool. In T3, call `delegate_task` with `isolation: "worktree"`; never create a child's checkout in the shell. In native Claude Code, use `Agent` with `isolation: "worktree"` when its schema permits it. A worktree separates files, not machines, credentials, ports, or processes. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Use the isolation tool's base contract. For a native Claude worktree, tell the worker to verify and check out `<b>` in its isolated checkout before editing. If the host cannot supply the required base, leave dependent work pending. |
| `run_in_background: true` | Use the host's background contract. Native Claude versions may default to background execution; check the schema. In T3, use its delegation tool for background work and `run_in_background: false` for a native child that must finish in this turn. |
| `resume` | Start a fresh agent with the earlier result, except where the skill explicitly permits reuse. Use the host's supported resume mechanism only in those cases. |
| `file_attachments` | Put absolute paths in the brief. |

Do not assume a background agent has every foreground tool. Check that the selected route supplies the capabilities the task needs, and collect the result through the host's completion mechanism before claiming completion.

## Models

| Cursor | Claude Code |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | Use the matching family alias accepted by the current `Agent` schema, such as `model: "opus"`, and pass the effort separately as `effort`. An alias chooses the host's version, not a guarantee of the source version. Drop `-fast` and report the mapping. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | Native Claude cannot dispatch that provider. Inherit the parent model, preserve the supported effort, and report reduced model diversity. A host-provided cross-provider route may be used when the user's configuration and host instructions authorize it. |
| `auto` or `inherit-parent` | Inherit the parent model and effort. Omit the fields only if the selected agent actually inherits them; do not silently use a built-in agent's different default model. |
| `auto <effort>` or `inherit-parent <effort>` | Inherit the parent model and pass the supported `effort` explicitly. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `$CLAUDE_CONFIG_DIR/rules/pstack-models.md`, or `~/.claude/rules/pstack-models.md` when unset. Read it when it is not already in context. Missing roles use the skill defaults. |
| A role value `<model> <effort>`, such as `opus high` | Pass the accepted `model` and `effort` values separately. |

Read the effort suffix before determining the family. An inherited alias belongs to the parent's family and cannot supply Arena's cross-family judge. Keep the source role list and panel lengths; do not expand them into a model catalog. Different Claude variants do not establish cross-provider diversity. Use the skill's explicit fallback when the required diversity is unavailable; otherwise leave that requirement unmet.

Use only values accepted by the actual dispatch tool and selected model. For an unsupported effort, choose the highest supported effort at or below the request on `max > xhigh > high > medium > low`, and report it. If none qualifies, leave the role needing a choice. Native per-invocation `effort` requires Claude Code 2.1.292 or later. `CLAUDE_CODE_EFFORT_LEVEL` can override it, and model-forcing settings can override a requested model: report the effective override instead of claiming the saved budget took effect. If the session cannot apply a per-role budget, say so before saving or running it.

## setup-pstack

Follow the source steps, including its budget labels, role list, panel sizes, confirmation, and optional verification offers, with these changes:

- Detect models and efforts from the live dispatch schema and entitlement information available in the session. Do not assume a fixed list of aliases or versions.
- Defaults: map the source Opus slug to `opus xhigh` only when available. Map the non-Claude default to `inherit-parent xhigh`. Apply the supported-effort fallback above; do not invent an unavailable Opus alias.
- Budget: change explicit effort tokens on real models and aliases, including every panel entry. Thus `small` changes `inherit-parent xhigh` to `inherit-parent medium`. Bare `auto` and `inherit-parent` keep inherited effort on reruns; identify these roles as outside the selected budget and offer an explicit effort before confirming. Save effective supported values.
- Write only the dedicated `rules/pstack-models.md` file under the Claude configuration directory, without Cursor frontmatter. Keep the comment lines, `# budget` line, and the source's role labels. Replace this configuration file on reruns; preserve every other rule and instruction file.

## Paths

| Cursor | Claude Code |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.claude/skills/`, `$CLAUDE_CONFIG_DIR/skills/` (default `~/.claude/skills/`). |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `$CLAUDE_CONFIG_DIR/plugins/` (default `~/.claude/plugins/`), `.claude-plugin/plugin.json`. |
| `.cursor/rules/*.mdc`, always-applied rules | `CLAUDE.md` or Claude's `.md` rules. Newer versions can load `AGENTS.md` as a fallback, depending on project instruction settings. Verify it is loaded; do not assume `.mdc` is read. The dedicated model rule is described above. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | Read `<pstack>/<path>` when shipped. For this port's public copy use `https://github.com/janozeli/pstack-port/blob/main/pstack/<path>`. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$CLAUDE_CONFIG_DIR/projects/` (default `~/.claude/projects/`). Parent transcripts are `<project>/<session>.jsonl`; subagents are nested under `<session>/subagents/`. Folder naming alone does not establish workspace or session identity. |

## Session identity and worktree history

Use the current session ID or transcript path supplied by the host. Claude hook inputs can supply `session_id`, `transcript_path`, and `cwd`; do not install a hook merely to guess them. Match the transcript's `sessionId` and `cwd` to the supplied identity and current checkout before reading conversation content. Resolve symlinks and compare directory boundaries. For a removed path, resolve its existing ancestor and append the missing suffix. A newer file may belong to another conversation or a subagent; never equate newest with current.

For `reflect`, find the opening user message in a `type: "user"` record's `message.content`. Earlier records can be file-history snapshots, not prompts. If reliable session identity is unavailable, pass a digest of this conversation and name that fallback. For `show-me-your-work`, a digest cannot prove a complete transcript audit; report that limitation.

`skills/poteto-mode/scripts/worktree-audit.sh` automatically selects Claude history in the generated Claude package. In the source tree, pass `--harness claude`. The reader checks `cwd` metadata before inspecting conversation activity, includes nested subagent transcripts, and counts only sessions belonging to registered checkouts. `review-history` means missing or unreadable evidence requires review. Activity is one cleanup input, never permission to delete.

## Workflow dependencies

Resolve capabilities before their dependent steps. Continue independent work when a dependency is absent, but do not claim verification, merge readiness, or completion for the blocked portion.

| Cursor dependency | Claude Code equivalent |
| --- | --- |
| `create-skill` | Use an available skill-authoring workflow. Otherwise follow the repository's skill format, validate frontmatter and links, and prove the result on the requested task. |
| `deslop` from `cursor-team-kit` | Apply bundled `unslop` to prose. Review code for extra comments, inconsistent style, unnecessary checks in trusted paths, type-bypassing casts, and avoidable nesting. Name the review actually performed. |
| `control-cli` from `cursor-team-kit` | Run the real CLI through `Bash`, using interactive terminal support when required. Check output and exit status. |
| `control-ui` from `cursor-team-kit` | Use the host's permitted browser, desktop, or simulator tools on the real UI. Without them, behavioral verification remains blocked; unit tests alone do not replace it. |
| `/loop` | Use native scheduling or the host's persistent watcher when offered, following its lifecycle rules. Without one, execute the current round and report that continued monitoring is not configured. |
| Project tracker and Project store | Use host project state tools. Otherwise record task IDs, owners, branches, dependencies, evidence, and next actions in project-local `notes.md` and pass relevant state to each worker. |
| Fork a worker's built state | Use a supported environment fork, or rebuild the checkout and required processes and revalidate. A fresh agent does not inherit running processes. |

## Cursor-only features

Prefer an authorized host equivalent. Otherwise report `Skipped in Claude Code: <step>. <reason>.` and continue only independent steps. Placeholders are acceptable in a draft, never as proof that a real URL, key, webhook, or service works. `make-bot-ui` remains incomplete until its actual dependencies exist and its real request succeeds.

| Cursor | Claude Code |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Use a host equivalent that satisfies the step and its authorization requirements. Otherwise leave dependent execution incomplete. |
| Bugbot | Triage existing PR review threads with the forge tools. Skip configuring or waiting for Bugbot when the PR has no such integration; still resolve real findings. |
| Cursor cloud agents | Apply the isolation contract above. A separate machine or cloud dashboard requires an actual host capability. |
| A built-in PR tool | Prefer the host's PR tool when required; otherwise use the forge CLI, such as `gh pr create`. |

Host references: [subagents](https://code.claude.com/docs/en/sub-agents), [memory and rules](https://code.claude.com/docs/en/memory), and [hook session metadata](https://code.claude.com/docs/en/hooks#common-input-fields). Live schemas take precedence over these version-sensitive mappings.
