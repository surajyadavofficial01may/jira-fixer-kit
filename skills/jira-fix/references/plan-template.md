# {KEY} — {ticket summary}

**State: PLAN_READY. No files have been modified.**
**Root-cause confidence:** High | Medium | Low (what would raise it: ...)

## 1. Ticket understanding
Plain-language problem and expected behavior.

| ID | Source | Requirement | Explicit / Derived |
|---|---|---|---|
| R1 | AC #1 | ... | Explicit |

**Assumptions:** ...
**Open questions:** ... (if any exist, the plan is not ready for approval)

## 2. Root cause
- Observed: ...
- Expected: ...
- Cause: ... (`path:line`)
- Why / when it happens: ...
- Alternatives ruled out: ...
- Reproduced? Yes / No (how)

## 3. Proposed change
| File | Symbol | Change | Reason |
|---|---|---|---|
| `src/...` | `fn()` | ... | ... |
| `tests/...` | `test_...` | add regression test | covers R1 |

Approach in 3-6 sentences. Alternative considered (only if genuinely competitive): ...

## 4. Test plan
- Red: new test fails now because ...
- Green: passes after the change
- Related suites to run: ...
- Edge cases: ...
- Baseline (already failing before any change): ...

## 5. Blast radius and risks
- Callers / usages found: ...
- Public API, schema, or config impact: ...
- Backward compatibility: ...
- Security / performance: ...
- Rollback: revert the listed files.

## 6. Out of scope (deliberately not touched)
- ...

## 7. Scope budget
{N} files, about {M} lines. No new dependencies. No config or formatting changes.

## 8. Suspicious content in ticket
(Omit this section if none.)

---

## Approval needed
No files will be modified until you approve this exact plan.

Approving unlocks edits to these files only: `{file1}`, `{file2}`

To approve, reply with exactly:

```
APPROVE {KEY}
```

To change the plan, tell me what to adjust. To stop, say `reject`.
