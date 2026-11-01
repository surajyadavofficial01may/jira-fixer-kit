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
/plugin marketplace add surajyadavofficial01may/jira-fixer-kit
/plugin install jira-fixer@jira-fixer-kit
```

Then sign in to Jira: run `/mcp`, choose **atlassian**, and complete the browser sign-in.

**Set it up for a whole team.** Commit this to your project's `.claude/settings.json`. Teammates are offered the plugin when they open the project:

```json
{
  "extraKnownMarketplaces": {
    "jira-fixer-kit": {
      "source": { "source": "github", "repo": "surajyadavofficial01may/jira-fixer-kit" }
    }
  },
  "enabledPlugins": {
    "jira-fixer@jira-fixer-kit": true
  }
}
```

### GitHub Copilot in VS Code

1. Command Palette → **Chat: Install Plugin from Source** → paste `https://github.com/surajyadavofficial01may/jira-fixer-kit`.
2. Command Palette → **MCP: List Servers** → **atlassian** → **Start**, and complete the browser sign-in.
3. In Settings, make sure agent plugins, agent skills, and hooks are enabled (search for "plugins", "skills", and "hooks").

To receive updates through a marketplace instead, add this to your user settings and install **jira-fixer** from **Chat: Open Customizations → Plugins**:

```json
"chat.plugins.marketplaces": ["surajyadavofficial01may/jira-fixer-kit"]
```

## Use it

| To | Claude Code | VS Code Copilot |
|---|---|---|
| Fix a ticket | `/jira-fixer:jira-fix PROJ-1234` | `/jira-fix PROJ-1234` |
| Analyze only, no changes | `/jira-fixer:jira-analyze PROJ-1234` | `/jira-analyze PROJ-1234` |

You can also just write "Fix PROJ-1234".

1. The agent reads the ticket and investigates your code, posting a short progress line at each step. If the ticket is unclear, it asks a few questions with answers you click (the suggested one is marked "Recommended", and "Other" lets you type your own).
2. It shows a plan that starts with an **At a glance** summary: problem, cause, fix, files, risk. Then it asks you to choose **Approve**, **Request changes**, or **Reject**.
3. Click **Approve** to let it change only the listed files. Nothing else counts as approval ("ok" or "looks good" doesn't). You can also type **`APPROVE`**.
4. The agent writes a failing test, makes the fix, runs the tests, and checks each acceptance criterion. It ends with a report: an **At a glance** checklist (✅ pass, ❌ fail, ⚠️ needs a manual check), what's left for you, and drafts of the Jira comment, commit message, and PR description. It does not post to Jira or commit on its own.
5. Review the diff and commit it yourself. Then choose **Close session** when asked (or type **`CLOSE`**).

What it looks like:

```text
You:    /jira-fix PROJ-1234
Agent:  Step 1/6 · Reading PROJ-1234
        Step 2/6 · Investigating the code
        Step 3/6 · Plan ready, waiting for your approval

        At a glance
        - Problem: cart total ignores the discount code
        - Cause:   applyDiscount() runs after rounding (src/cart.ts:88). Confidence: High
        - Fix:     apply the discount before rounding
        - Files:   src/cart.ts, tests/cart.test.ts (2 files, about 15 lines)
        ...
        Approve the plan for PROJ-1234?
        ❯ Approve           Unlock only: src/cart.ts, tests/cart.test.ts
          Request changes   Tell me what to adjust
          Reject            Stop. Nothing is changed
You:    (clicks Approve)
        Jira Fixer: Approved PROJ-1234. Edits limited to: src/cart.ts, tests/cart.test.ts.
Agent:  Step 4/6 · Fixing (failing test first)
        Step 5/6 · Verifying
        Step 6/6 · Done
        Outcome: ✅ Resolved · Acceptance criteria: 3 of 3 pass
        What's left for you: review the diff and commit
        Close the Jira Fixer session for PROJ-1234?
        ❯ Close session
          Keep it open
You:    (clicks Close session)
```

If the agent needs to change a file that is not in the plan, it drops the approval and asks you again.

**You confirm every Jira write, commit, and push.** Whenever the agent tries to change Jira (comment, edit, transition, create) or run `git commit`, `push`, `reset`, `rebase`, `stash`, `tag`, or create a PR, your editor shows a confirmation prompt first. This applies in every chat, even when no Jira Fixer session is open. Before you approve a plan, `commit`, `push`, `reset`, `rebase`, and `stash` are blocked outright.

## How the gate works

| Layer | What it does |
|---|---|
| The `jira-fix` skill | Tells the agent the process and when to stop |
| The edit guard (hook) | During a session: blocks edits and file-changing commands until you approve, limits edits to the approved files, and blocks package installs. In every chat: asks you to confirm any Jira write, git commit, push, or PR |
| The approval hooks | Record your approval only when **you** click **Approve** (or type `APPROVE`). The agent cannot approve its own plan or fill in your answer |
| The `jira-analyst` agent | Used for analysis. It has no edit or shell tools at all |
| You | Approve the plan, review the diff, commit |

Session state lives in `.jira-fixer/` at your repository root. That folder ignores itself in git, so you don't need to change your `.gitignore`. Every start, plan, approval, close, and blocked tool call is logged to `.jira-fixer/audit.log`.

**Limits to know about:**
- The guard inspects tool names and command text. It is a strong guardrail, not a sandbox, so keep your editor's tool confirmation prompts on.
- While a session is open, edits are gated for every chat in that repository, not only the Jira one. An approval expires after 12 hours, but the session stays open until you reply `CLOSE`. Starting a new ticket closes the previous session, and the agent tells you.
- If hooks are not running (Node missing, or hooks turned off), the agent says so and falls back to a soft gate: it still waits for `APPROVE`, but nothing enforces it.
- Clickable choices use Claude Code's question tool. In VS Code, if the agent has no question tool or your click doesn't register, type `APPROVE` or `CLOSE` instead. The agent tells you when that's needed.
- Confirmation prompts come from the hook asking your editor to confirm. If your VS Code version doesn't support that yet, VS Code's own tool confirmation applies instead, so keep it turned on.

## Configuration (optional)

Create `.jira-fixer.json` at your repository root to change the defaults:

| Key | Default | Meaning |
|---|---|---|
| `confirmJiraWrites` | `true` | Ask before any Jira or Confluence create, edit, transition, or comment, in every chat |
| `confirmGitChanges` | `true` | Ask before commit, push, reset, rebase, stash, tag, or PR creation, in every chat |
| `blockDependencyChanges` | `true` | Block npm, pip, and similar install and add commands |
| `protectGateFiles` | `true` | The agent cannot edit the gate, its state, or hook and plugin settings |
| `gateExpiryHours` | `12` | How long an approval lasts |
| `maxApprovedFiles` | `15` | Larger plans must be split into slices |

## Troubleshooting

- **I clicked Approve but the agent says it didn't register.** Type `APPROVE` instead (capitals, at the start of your message). The agent must have shown a plan first. If prompt hooks are not supported in your editor, the agent gives you a one-line terminal command to approve instead.
- **Edits are blocked in an unrelated chat.** A Jira Fixer session is still open in this repository. The agent tells you which ticket. Reply `CLOSE PROJ-1234` (with that key) to end it.
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

**Publish:** push to the default branch on GitHub. The repository is public, so anyone can install it without signing in; a private repository would work only for people with access.

**Release an update:** bump `version` in `.claude-plugin/plugin.json` and push. Claude Code users run `/plugin marketplace update jira-fixer-kit`; VS Code users run **Chat: Update Plugins**.

**Test before releasing:**
- `node skills/jira-fix/scripts/gate.js selftest` checks the guard logic. Every line should say PASS.
- Work through [TESTING.md](TESTING.md) on a throwaway branch in both editors.
