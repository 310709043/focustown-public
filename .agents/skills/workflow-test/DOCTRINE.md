# workflow-test Doctrine — Single-Agent Best Practice

The 10-point single-agent doctrine that `workflow-test` aims to enforce.
Each point names the workflow-test surface that operationalises it. Points
the skill cannot fully operationalise today (because they need code-side
support) are tagged **[needs #311]** with a forward reference to the
foundation refactor issue.

This file is read-only context for the skill, not a procedure. The
procedure lives in [`SKILL.md`](./SKILL.md); extension instructions live
in [`EXTENDING.md`](./EXTENDING.md).

---

## 1. Eval-first — define success / failure metrics before prompt edits

Do not edit a prompt first. First define what "success" and "failure"
mean for the spec: correctness, completion rate, tool-misuse rate,
hallucination rate, human-in-the-loop rate, latency, cost. Every change
must show improvement on the eval.

**workflow-test surface**: SKILL.md Rule 9. Phase 2 cost estimate +
Phase 5 STATUS_14 + Phase 6 manual QA collectively are the eval today.
Targets per-spec metrics arrive via #311 sub-task 1 (`GoalCriteria`).

---

## 2. Prompt is the last layer, not the only one

System prompt encodes high-level behaviour principles. Reliability must
come from schema, state machine, tool permissions, guardrails, validators
and tests — not from prompt wording.

**workflow-test surface**: This is the structural premise of the
companion #311 refactor. The skill currently surfaces precision-fallback
regressions through Rule 7 (no advance until resolved) but cannot enforce
the fix at non-prompt layers without the registry from #311 sub-tasks 2–5.

---

## 3. Typed inputs / typed outputs

Agent actions should be structured (schema + required fields + enums +
legal-value sets + error-handling rules), not free-form text.

**workflow-test surface**: Already partially in place via Pydantic models
in tool handlers. Per-spec output schemas (e.g., what fields an
interview_prep STAR guide MUST contain) are codified in
`GoalCriteria.structural_checks` after #311 sub-task 4. **[needs #311]**

---

## 4. Misuse-resistant tools

Tool names, descriptions, parameter schemas, and return shapes must be
unambiguous. Returns should include status (`success` / `retryable_error`
/ `terminal_error`) and `allowed_next_actions`, not just a result.

**workflow-test surface**: Tool returns today carry `success / error_code`
but not `allowed_next_actions`. Adding that lands in a follow-up issue
(see #311 "Out of scope"). The skill's Phase 5 already reads `error_code`
through `failure_attribution.py`. **[needs follow-up to #311]**

---

## 5. Pre-execution action validation

Before executing an agent-proposed action, validate it: legal in current
state? parameters complete? policy-compliant? human confirmation needed?

**workflow-test surface**: Slot-emission validation is the closest the
skill goes today, via `request_user_input.py` guardrails. Generalises
via #311 sub-task 2's `SlotPolicyRegistry`. **[needs #311]**

---

## 6. Explicit state machine

Decompose the task into states + legal transitions. The agent picks
strategies; it cannot jump to illegal states. More reliable than writing
"don't do X" in the prompt.

**workflow-test surface**: `tool_pipeline` field in `QaPolicy` after #311
sub-task 1 is informational; **runtime enforcement** is the deferred
follow-up. The smoke harness today implicitly enforces a pipeline via
the AllConditionsRunner's expectation that an artifact appears.
**[needs follow-up to #311]**

---

## 7. Failure classification (not just success rate)

Categorise every failure. Standard buckets:

- **tool** — MCP / API / external dependency error
- **understanding** — agent misread instructions or input
- **planning** — agent picked a wrong tool / wrong order
- **format** — output schema violation
- **data** — input was insufficient or malformed
- **illegal-fallback** — agent emitted a non-allowed slot / asked for
  data that was already provided (e.g. paste-text after PDF upload)
- **over-questioning** — agent asked too many slots when it could proceed
- **hallucination** — agent fabricated content not grounded in input

**workflow-test surface**: SKILL.md Rule 10 mandates tagging every
non-PASS outcome with one of these categories. The category appears in
the progress.md row note and is passed verbatim to `/root-cause-debug`
in Phase 9-B. Per-spec rubric implementation lands in #311 sub-task 5.
**[partially needs #311]** (the skill emits the category now; the
per-spec rubric refines it after #311).

---

## 8. Regression tests for fixed bugs

Every bug becomes a fixed test case. Prevents the same regression from
recurring after a model / prompt / tool / context change.

**workflow-test surface**: SKILL.md Phase 8 "Regression-test promotion"
hook points at `regression-test/SKILL.md` (the 8-point eval framework
referenced by Rule 8). When a spec advances from `❌❓❓❓❓` to `✅✅✅✅✅`,
the failing fixture is promoted to a fixed eval case. Harness wiring
arrives via #311 sub-task 5 (the failure rubric becomes regression
assertions). **[partially needs #311]**

---

## 9. Small experiments — one class of change at a time

Change one thing per experiment: prompt, tool schema, validator, state
machine, retrieval, model config. Otherwise improvements / regressions
can't be attributed.

**workflow-test surface**: Rule 1 ("one spec per invocation, one commit
per spec") + `feedback_incremental_execution` (memory) already encode
this. No new rule needed; just respect the existing discipline.

---

## 10. Cost & reliability tradeoffs

Don't optimise accuracy alone. Track latency, tool calls, token cost,
human-in-the-loop rate, retry rate. Good agent ≠ occasionally clever;
good agent = stable, explainable, regression-tested.

**workflow-test surface**: SKILL.md Rule 11 mandates capturing
`elapsed_s` + `invocation_count` + retry/loop count (if any) + est cost
from Phase 2. Phase 7 row note records them. Aggregating across multiple
spec runs into a dashboard is a separate follow-up.

---

## One-line summary

> Single-agent best practice is **eval-driven engineering**: use eval to
> define the target, use schema / tools / state / guardrails to constrain
> behaviour, use regression tests to prevent backsliding, edit prompts
> last.
