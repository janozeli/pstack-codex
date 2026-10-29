# Tests and CI

Run repository checks with Node.js 22.23.4 and install the committed dependency tree with `npm ci`. Bun tool packages use Bun 1.3.14 and their own committed lockfiles. Install Git, Bash, jq and ripgrep for worktree audit fixtures. No production accounts or external model calls are required by CI.

```bash
npm ci
node scripts/validate-plugins.mjs
node scripts/generate-pstack-harness-trees.mjs --check
node scripts/check-pstack-docs.mjs
npm test
npm run typecheck:statechart

(cd pstack/skills/poteto-mode/scripts && bun install --frozen-lockfile && bun run test && bun run typecheck)
(cd orchestrate/skills/orchestrate/scripts && bun install --frozen-lockfile && bun run test && bun run typecheck)
```

The generated packages are built from `pstack/` and the compiler. After changing either, run `node scripts/generate-pstack-harness-trees.mjs` and commit the generated output. Tests exercise each host's installed audit script, native model and effort mappings, plan checker, manifest fields, relative links and anchors, skill inventory, panel sizes and invocation policies. The source Cursor behavior remains covered separately.

## Statechart and TLC

TLC is the TLA+ model checker. The suite compares statechart results against real TLC, in addition to deterministic replay fixtures and renderer checks. Use Java 17 and TLC 1.7.4, the same TLC release used by the skill. Download it into a temporary tools directory and verify its checksum:

```bash
mkdir -p /tmp/pstack-test-tools
curl --fail --location --retry 3 https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar --output /tmp/pstack-test-tools/tla2tools.jar
echo '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88  /tmp/pstack-test-tools/tla2tools.jar' | sha256sum --check
export TLA2TOOLS=/tmp/pstack-test-tools/tla2tools.jar
npm run test:statechart
```

Without `TLA2TOOLS`, local integration cases explicitly skip. This is a partial run, not full verification. CI installs the jar, verifies the checksum, checks that it exists, and requires the final TAP summary to report zero skipped tests. Renderer dependencies are installed from the root lockfile before the tests; tests do not install packages into a shared home cache. File-level concurrency is limited to two to bound Java and rendering load.

Cancellation tests hold the worker at an observed write through a test-only Node preload, then send the real signal to the command. This exercises cleanup without racing a transient directory rename or adding a production test hook.

## Native installation

The smoke check uses the real host CLI, the distribution's marketplace metadata and only the generated package, copied into a disposable marketplace. It creates temporary home/configuration directories, verifies discovery and compares the installed bytes and executable bits against the package. It removes those directories afterward and never invokes a model.

```bash
python3 scripts/check-native-install.py codex --require
python3 scripts/check-native-install.py claude --require
```

Use `--cli /absolute/path/to/binary` if a version-manager shim depends on the original home directory. Without `--require`, a missing CLI reports `SKIP`; an installed CLI that fails always fails the check. CI uses `--require` with Codex 0.165.0 and Claude Code 2.1.312. Update these versions deliberately when adopting a new host contract. These checks prove installation and discovery, not every agent-driven workflow or optional external service.

## CI coverage

The workflow runs on every pull request, pushes to `main`, and manual dispatch. It has separate jobs for repository validation, each Bun package, statechart, and each native host. A failure in one suite does not prevent unrelated suites from reporting. The token has read-only repository permissions. Jobs have finite timeouts, and superseded runs are cancelled.

The retained `orchestrate` source is tested and typechecked even though the standalone pstack marketplaces expose only pstack. The CI does not validate live Slack, webhook, multi-provider or cloud-machine behavior: those capabilities require separate host-specific proof when used.
