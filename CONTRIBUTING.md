# Contributing to Jira Fixer

Thanks for helping. Bug reports, documentation fixes, new test cases, and features are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Found a way around the approval gate or the confirmation prompts? Report it privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
- By contributing, you agree that your contribution is released under the [MIT License](LICENSE).
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Project layout

The repository root is both the plugin and its marketplace.

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest (name, version, metadata) |
| `.claude-plugin/marketplace.json` | Marketplace catalog with one plugin, `source: "./"` |
| `skills/jira-fix/SKILL.md` | The main workflow the agent follows |
| `skills/jira-fix/references/` | Plan and final report templates |
| `skills/jira-fix/scripts/gate.js` | The approval gate and hook logic (Node, no dependencies) |
| `skills/jira-analyze/SKILL.md` | Read-only analysis entry point |
| `agents/jira-analyst.md` | Read-only investigator agent |
| `hooks/hooks.json` | Registers the PreToolUse, PostToolUse, and UserPromptSubmit hooks |
| `.mcp.json` | Atlassian MCP server |
| `TESTING.md` | Manual test scenarios |

## Development setup

You need Node.js 18 or later, plus Claude Code and/or VS Code with GitHub Copilot for manual testing. There is nothing to install.

Load your working copy instead of the published plugin:

- **Claude Code:** start it with `claude --plugin-dir /path/to/jira-fixer-kit`, or run `/plugin marketplace add /path/to/jira-fixer-kit` and then `/plugin install jira-fixer@jira-fixer-kit`. Run `/reload-plugins` after each change.
- **VS Code:** run **Chat: Install Plugin from Source** and choose your folder.

## Testing

Run these before opening a pull request:

```bash
node skills/jira-fix/scripts/gate.js selftest   # every line must say PASS
claude plugin validate --strict .               # plugin and marketplace manifests
```

CI runs both on every pull request. The self-test runs on Linux, macOS, and Windows with Node 18, 22, and 24.

For behavior changes, also work through the relevant scenarios in [TESTING.md](TESTING.md) in each editor you can, and say in the pull request which ones you ran.

## Guidelines

- **`gate.js`** stays a single file with no dependencies, compatible with Node 18. Every change to its decisions needs a matching case in the `cmdSelftest` tables. When in doubt, fail closed.
- **Skills and agents are prompts.** Keep them short and concrete. When you change wording the user sees, update `README.md` and `TESTING.md` to match.
- **Hook behavior is a contract.** Describe any change to what is blocked, asked, or allowed in `CHANGELOG.md`.
- One topic per pull request.

## Pull requests

1. Fork the repository and create a branch.
2. Make your change, with tests.
3. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
4. Open the pull request and fill in the template.

## Releasing (maintainers)

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new version heading with today's date.
2. Bump `version` in `.claude-plugin/plugin.json`. Installed copies only update when this changes.
3. Merge to `main`, tag the commit `vX.Y.Z`, and publish a GitHub release with the changelog notes.
4. Users update with `/plugin marketplace update jira-fixer-kit` (Claude Code) or **Chat: Update Plugins** (VS Code).
