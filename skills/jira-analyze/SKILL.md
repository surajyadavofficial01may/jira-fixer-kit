---
name: jira-analyze
description: Read-only analysis of a Jira ticket against this repository. Use when the user asks to analyze, investigate, or plan (not fix) a Jira issue key such as PROJ-1234. Reports requirements, root cause with evidence and confidence, and a proposed minimal plan without changing anything.
argument-hint: PROJ-1234
---

# Jira ticket analysis (read-only)

Give the ticket key to the `jira-analyst` agent and show the user its report. That agent has no edit or shell tools, so it cannot change anything.

If you cannot run that agent, do the analysis yourself: follow Phases 1-4 of the `jira-fix` skill and fill in its plan template, with these limits:
- Do not edit files, do not run commands that change anything, and do not run `gate.js`.
- Say plainly which parts were traced by reading and not executed.

End the report with: "To implement this plan, run the `jira-fix` skill with {KEY}."
