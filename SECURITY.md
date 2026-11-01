# Security Policy

Jira Fixer is a guardrail. Its hooks stop an AI agent from editing files before you approve a plan, limit edits to the approved files, and ask for your confirmation before Jira writes and git history changes. A way around any of those checks is a security issue.

## Supported versions

Only the latest release receives fixes. Update with `/plugin marketplace update jira-fixer-kit` (Claude Code) or **Chat: Update Plugins** (VS Code).

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub: open the repository's **Security** tab and choose **[Report a vulnerability](https://github.com/surajyadavofficial01may/jira-fixer-kit/security/advisories/new)**.

Please include:
- The plugin version, your editor and its version, and your OS
- The tool call or command that got through, and what you expected to happen
- Steps to reproduce, and the relevant lines from `.jira-fixer/audit.log` (remove ticket content and secrets)

You can expect an acknowledgement within 7 days. Once a fix is released, the report is credited in the release notes unless you ask otherwise.

## In scope

- Edits or file-changing commands that run before approval, or outside the approved files
- The agent approving or closing a session itself, including through a question tool
- Jira writes or git commit, push, or PR creation that run without a confirmation prompt
- The agent changing the gate's state, its settings, or the plugin's hook configuration

## Known limits (out of scope unless you find a realistic case)

- The guard inspects tool names and command text. It is not a sandbox, and deliberately obfuscated commands (for example, building a command from variables) can get past it.
- If the hook cannot parse its input, the tool call is allowed.
- With hooks turned off or Node missing, the gate is soft and only the agent's instructions apply. This is documented behavior.
