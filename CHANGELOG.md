# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-11-01

### Added
- Open-source project files: MIT license, contributing guide, code of conduct, security policy, issue and pull request templates, and CI.
- Clickable choices in Claude Code: approve, request changes, or reject the plan; answer clarifying questions; close the session. Typed `APPROVE` and `CLOSE` still work everywhere.
- A PostToolUse hook that records an **Approve** or **Close session** selection, and blocks question calls whose answers are pre-filled by the agent.

## [1.2.0] - 2026-11-01

### Added
- Progress lines (`Step N/6`), "At a glance" summaries at the top of the plan and the final report, and suggested answers for clarifying questions.
- A notice when starting a ticket closes another ticket's open session.

### Changed
- Approve or close by replying plain `APPROVE` or `CLOSE`; the ticket key is optional.
- Clearer messages when a tool call is blocked, including how to close a session from an unrelated chat.

## [1.1.0] - 2026-11-01

### Changed
- Jira writes and git commit, push, reset, rebase, stash, tag, and PR creation now ask for confirmation in every chat, instead of being blocked only during a session.
- Config keys renamed: `blockJiraWrites` is now `confirmJiraWrites`, and `blockGitHistoryChanges` is now `confirmGitChanges`.

### Fixed
- Git commands with global options, such as `git -C . push` and `git --no-pager push`, were not recognized.

## [1.0.0] - 2026-11-01

### Added
- First release as a plugin for Claude Code and GitHub Copilot in VS Code: the `jira-fix` and `jira-analyze` skills, the read-only `jira-analyst` agent, the approval gate hooks, and the Atlassian MCP server.
