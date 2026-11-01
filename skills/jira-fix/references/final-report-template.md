# {KEY} — Done

## At a glance
**Outcome:** ✅ Resolved | ⚠️ Partially resolved | ❌ Blocked
**Acceptance criteria:** {passed} of {total} pass
- ✅ AC1 — short criterion
- ⚠️ AC2 — not verified: needs a manual check (see below)
- ❌ AC3 — fails: short reason

**Changed:** `{file1}`, `{file2}` · **Tests:** {X} passing, {Y} already failing before (untouched)

**What's left for you:**
1. Review the diff.
2. {Manual checks, only if any criterion is not verified}
3. Commit and open a PR yourself (drafts below).
4. End the session: choose **Close session** below (or type `CLOSE`).

Legend: ✅ pass · ❌ fail · ⚠️ not verified · ⛔ blocked

---

## What happened
Two or three sentences: what was wrong, what changed.

## Root cause
...

## Changes
| File | What changed | Why |
|---|---|---|

## Tests
**Added / changed:** ...
**Red then green:** failed before the fix with `...`, passes after.

**Executed (observed results only):**
| Command | Result |
|---|---|
| `...` | pass / fail (counts) |

**Pre-existing failures (also failing at baseline, untouched):** ...
**Could not run:** ... (reason)

## Acceptance criteria
| # | Criterion | Evidence (code) | Evidence (test / check) | Status |
|---|---|---|---|---|
| 1 | ... | `path:line` | ... | ✅ / ❌ / ⚠️ / ⛔ |

## Diff review
`git diff --stat` summary. Only approved files changed: Yes / No.

## Risks and follow-ups
- ...

## Manual verification still needed
- ... (exact steps)

## Drafts for you (not posted or executed)
**Jira comment:**
> ...

**Commit message:**
```
{KEY}: ...
```

**PR description:** ...
