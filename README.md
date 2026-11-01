# Jira Fixer

A plugin for **Claude Code** and **GitHub Copilot in VS Code** that fixes Jira tickets the careful way. It investigates, proposes a minimal plan, **waits for your approval**, then implements with a regression test and checks every acceptance criterion.

A hook blocks file edits until you approve, so the agent cannot skip the review step.

## Requirements

- **Node.js 18+** on your PATH (the approval gate is a small Node script with no dependencies)
- An Atlassian account with access to your Jira site
- Claude Code, or VS Code with GitHub Copilot (agent plugins and hooks are Preview features in VS Code)

## Install

### Claude Code

Run these two commands inside Claude Code:

```
/plugin marketplace add YOUR-GITHUB-USER/jira-fixer-kit
/plugin install jira-fixer@jira-fixer-kit
```

Then sign in to Jira: run `/mcp`, choose **atlassian**, and complete the browser sign-in.

**Set it up for a whole team.** Commit this to your project's `.claude/settings.json`. Teammates are offered the plugin when they open the project:

```json
{
  "extraKnownMarketplaces": {
    "jira-fixer-kit": {
      "source": { "source": "github", "repo": "YOUR-GITHUB-USER/jira-fixer-kit" }
    }
  },
  "enabledPlugins": {
    "jira-fixer@jira-fixer-kit": true
  }
}
```

### GitHub Copilot in VS Code

1. Command Palette → **Chat: Install Plugin from Source** → paste `https://github.com/YOUR-GITHUB-USER/jira-fixer-kit`.
2. Command Palette → **MCP: List Servers** → **atlassian** → **Start**, and complete the browser sign-in.
3. In Settings, make sure agent plugins, agent skills, and hooks are enabled (search for "plugins", "skills", and "hooks").

To receive updates through a marketplace instead, add this to your user settings and install **jira-fixer** from **Chat: Open Customizations → Plugins**:

```json
"chat.plugins.marketplaces": ["YOUR-GITHUB-USER/jira-fixer-kit"]
```

## Use it

| To | Claude Code | VS Code Copilot |
|---|---|---|
| Fix a ticket | `/jira-fixer:jira-fix PROJ-1234` | `/jira-fix PROJ-1234` |
| Analyze only, no changes | `/jira-fixer:jira-analyze PROJ-1234` | `/jira-analyze PROJ-1234` |

You can also just write "Fix PROJ-1234".

1. The agent reads the ticket, investigates your code, and shows a plan that lists the files it will change. Then it stops.
2. Read the plan. To approve it, reply with exactly **`APPROVE PROJ-1234`** (capital letters). "ok" or "looks good" does not count.
3. The agent writes a failing test, makes the fix, runs the tests, and checks each acceptance criterion. It ends with a report that includes a draft Jira comment, commit message, and PR description. It never posts to Jira and never commits.
4. Review the diff and commit it yourself. Then reply **`CLOSE PROJ-1234`** to end the session.

If the agent needs to change a file that is not in the plan, it drops the approval and asks you again.

## How the gate works

| Layer | What it does |
|---|---|
| The `jira-fix` skill | Tells the agent the process and when to stop |
| The edit guard (hook) | Blocks edits and file-changing commands until you approve; limits edits to the approved files; blocks Jira writes, git commits and pushes, and package installs |
| The approval hook | Records your approval only when **you** type `APPROVE <KEY>`. The agent cannot approve its own plan |
| The `jira-analyst` agent | Used for analysis. It has no edit or shell tools at all |
| You | Approve the plan, review the diff, commit |

Session state lives in `.jira-fixer/` at your repository root. That folder ignores itself in git, so you don't need to change your `.gitignore`. Every start, plan, approval, close, and blocked tool call is logged to `.jira-fixer/audit.log`.

**Limits to know about:**
- The guard inspects tool names and command text. It is a strong guardrail, not a sandbox, so keep your editor's tool confirmation prompts on.
- While a session is open, edits are gated for every chat in that repository, not only the Jira one. An approval expires after 12 hours, but the session stays open until you reply `CLOSE <KEY>`.
- If hooks are not running (Node missing, or hooks turned off), the agent says so and falls back to a soft gate: it still waits for `APPROVE <KEY>`, but nothing enforces it.

## Configuration (optional)

Create `.jira-fixer.json` at your repository root to change the defaults:

| Key | Default | Meaning |
|---|---|---|
| `blockJiraWrites` | `true` | Block Jira and Confluence create, edit, transition, and comment tools |
| `blockGitHistoryChanges` | `true` | Block commit, push, reset, rebase, stash, tag, and PR creation |
| `blockDependencyChanges` | `true` | Block npm, pip, and similar install and add commands |
| `protectGateFiles` | `true` | The agent cannot edit the gate, its state, or hook and plugin settings |
| `gateExpiryHours` | `12` | How long an approval lasts |
| `maxApprovedFiles` | `15` | Larger plans must be split into slices |

## Troubleshooting

- **I typed `APPROVE PROJ-1234` but the agent says it didn't register.** Check the key matches and that the agent showed a plan first. If prompt hooks are not supported in your editor, the agent gives you a one-line terminal command to approve instead.
- **Edits are blocked in an unrelated chat.** A Jira Fixer session is still open. The block message names the ticket. Reply `CLOSE <KEY>` to end it.
- **Atlassian tools are missing.** Sign in to the `atlassian` MCP server (Claude Code: `/mcp`; VS Code: **MCP: List Servers**). If you already use another Atlassian connector, that works too.

## For maintainers

Repository layout (the repository root is both the plugin and its marketplace):

```
.claude-plugin/plugin.json        plugin manifest
.claude-plugin/marketplace.json   marketplace catalog (one plugin, source "./")
skills/jira-fix/                  main workflow, templates, and scripts/gate.js
skills/jira-analyze/              read-only analysis entry point
agents/jira-analyst.md            read-only investigator agent
hooks/hooks.json                  edit guard and approval hooks
.mcp.json                         Atlassian MCP server
```

**Publish:** replace `YOUR-GITHUB-USER` in this README with the real GitHub owner, then push the repository to GitHub. A private repository works for anyone who has access to it.

**Release an update:** bump `version` in `.claude-plugin/plugin.json` and push. Claude Code users run `/plugin marketplace update jira-fixer-kit`; VS Code users run **Chat: Update Plugins**.

**Test before releasing:**
- `node skills/jira-fix/scripts/gate.js selftest` checks the guard logic. Every line should say PASS.
- Work through [TESTING.md](TESTING.md) on a throwaway branch in both editors.
