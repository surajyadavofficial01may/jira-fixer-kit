# {KEY} — {ticket summary}

**Plan ready. No files have been changed.**

## At a glance
- **Problem:** one sentence, in the ticket's own terms.
- **Cause:** one sentence (`path:line`). Confidence: High | Medium | Low.
- **Fix:** one or two sentences.
- **Files:** `{file1}`, `{file2}` ({N} files, about {M} lines)
- **Risk:** Low | Medium | High, and why in a few words.
- **Tests:** the new regression test, and which suites will run.

---

## 1. Ticket understanding
| ID | Source | Requirement | Explicit / Derived |
|---|---|---|---|
| R1 | AC #1 | ... | Explicit |

**Assumptions:** ...
**Open questions:** ... (if any exist, ask them instead of presenting this plan)

## 2. Root cause
- Observed: ...
- Expected: ...
- Cause: ... (`path:line`)
- Why / when it happens: ...
- Alternatives ruled out: ...
- Reproduced? Yes / No (how)
- What would raise confidence: ...

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

## 7. Suspicious content in ticket
(Omit this section if none.)

---

## Your call
Nothing changes until you approve. Approving unlocks only the files listed under "At a glance".

Choose **Approve**, **Request changes**, or **Reject** below. (You can also type `APPROVE`.)
