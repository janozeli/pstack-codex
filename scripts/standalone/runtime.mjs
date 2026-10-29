export function runtime(host) {
  const codex = host === "Codex";
  const tool = codex ? "spawn_agent" : "Agent";
  const effort = codex ? "reasoning_effort" : "effort";
  const config = codex ? "$CODEX_HOME/AGENTS.md (default ~/.codex/AGENTS.md), inside the pstack models markers" : "$CLAUDE_CONFIG_DIR/rules/pstack-models.md (default ~/.claude/rules/pstack-models.md)";
  return `# pstack runtime for ${host}

These are the native execution contracts for this distribution. Host instructions and live tool schemas take precedence. All skill files, playbooks, and supporting references are shipped in this package. Resolve paths relative to the installed package; do not fetch another distribution to execute a skill.

## Delegation

Use \`${tool}\` when the host permits native delegation. ${codex ? "Pass task_name and message. For an explicitly configured model or effort, use fork_turns: none when required and provide the full brief. Collect results with wait_agent." : "Pass prompt and the supported subagent_type. The bundled agents are pstack:poteto-agent and pstack:comment-sicko. Give each child its absolute skill path and complete task context."}
In T3, follow its delegation contract for different providers, explicit settings, background work, and isolated worktrees. That tool creates the child's checkout. Never create a child's checkout in the shell there. Native worktrees isolate files, not machines, processes, ports, or credentials. If a separate machine is required, verify an actual remote environment is available before executing that lane.
Read-only is an instruction unless the host enforces a sandbox: say do not edit, select tools consistent with the task, and inspect git status afterward. Preserve the requested model and required MCP access. Use fresh children unless the skill explicitly allows reuse. Follow host completion notifications; do not report a result before receiving it.
${codex ? "For poteto-agent or comment-sicko, begin the child brief by requiring a full read of the corresponding agents/<name>.md file." : "Keep native foreground children in the foreground when the host requires it. Do not force background execution through agent metadata."}

## Model configuration

Read ${config}. The default code model is inherit-parent xhigh; the default judgment model is ${codex ? "inherit-parent xhigh" : "opus xhigh when available, otherwise a role needing a choice"}. A missing role uses its generated default. Each configured value is a model or inherited alias followed by an optional effort, not a single model ID. Split it before dispatch. For bare auto or inherit-parent, inherit both model and effort. With an explicit effort, inherit only the model and pass \`${effort}\` separately. Do not let an agent type silently change the inherited model.
Use only available model IDs and supported efforts. The budget ladder is max > xhigh > high > medium > low. Fall back to the highest supported effort at or below the request; if none qualifies, leave the role needing a choice. Report overrides imposed by the environment. ${codex ? "Pass an explicitly selected native model through model." : "Native Claude model aliases resolve to the host's current version. Per-invocation effort needs Claude Code 2.1.292 or later; CLAUDE_CODE_EFFORT_LEVEL can override it."}
Keep the source role list and panel lengths. Inherited aliases belong to the parent's family. Multiple calls or variants from one provider do not satisfy a cross-provider requirement. Use the workflow's explicit fallback, or report that requirement unmet. Do not invent a model catalog or silently substitute a provider the user explicitly required.

## Session evidence

${codex ? "History is under $CODEX_HOME/sessions and archived_sessions (default ~/.codex), as rollout-*.jsonl files or zstd-compressed rollout-*.jsonl.zst files. Validate session_meta.payload.id and payload.cwd." : "History is under $CLAUDE_CONFIG_DIR/projects (default ~/.claude/projects), one folder per workspace named after its path with each / and . replaced by -. Validate sessionId and cwd; file-history snapshots can precede conversation records."}
${codex ? "This conversation's thread ID is $CODEX_THREAD_ID in the shell, and its rollout file name ends with that ID." : "This conversation's session ID is the value the poteto-mode, reflect and show-me-your-work skills state when invoked. Its transcript is <workspace folder>/<session ID>.jsonl, and its subagents are under <session ID>/subagents/."} Never pick the newest file. Resolve symlinks and compare checkout directory boundaries before inspecting conversation content. For deleted paths, resolve the existing ancestor and append the missing suffix. Read only verified relevant checkouts. If identity cannot be established, use an explicitly labeled digest of this conversation; a digest does not prove a complete transcript audit. For history mining, first scope candidates by workspace metadata, then inspect relevant conversations. Subagents are separate conversations.
The installed worktree-audit.sh selects this host's history reader. A review-history bucket requires investigation, not deletion. Chat activity never authorizes cleanup by itself.

## Capability-dependent work

Use the host's plan and question tools. An unanswered required choice is not consent. Use a permitted persistent watcher for ongoing monitoring; without one, complete only the current round and report the missing continuation capability. In T3, use its PR watcher lifecycle and linking rules.
Use the actual shell or PTY to verify a CLI, and permitted browser, desktop, or simulator tools to verify a UI. Without an appropriate driver, live verification is incomplete. Unit tests are not a substitute for an interactive lane.
For skill authoring, use an installed authoring skill when available; otherwise follow the repository's skill format, validate frontmatter and local links, and test the resulting instructions on the intended task. For code cleanup, inspect the diff for narration, unsupported guards, dead compatibility paths, type bypasses, unrelated edits, and inconsistent style. Apply bundled unslop to prose. Name the checks actually run.
Use project state tools when available, otherwise keep task IDs, owners, branches, dependencies, evidence, and next actions in project-local notes.md and pass relevant state to children. A fresh child does not inherit another worker's processes: reconstruct and revalidate the environment when a process fork is unavailable.
Automation and webhook work requires a real host integration and secret delivery mechanism. Resolve them before dependent execution. Never invent service URLs, secrets, API fields, or a successful probe. A placeholder may support a draft but cannot satisfy verification or deployment. Keep independent work moving and leave blocked gates explicitly incomplete.
`;
}
