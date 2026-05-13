---
name: root-cause-debug
description: Pull a failed goal_lane job's CloudWatch logs, locate the exception with file:line precision, and produce an evidence-grounded patch. Triggered when /workflow-test reports a cond 1-4 failure, or invoked standalone. Invoke as /root-cause-debug <job_spec_id>, e.g. /root-cause-debug 6b3e624a-d30d-41f1-96b3-e838a5ab4de1. Never guesses. When the diagnosis cites every claim to a file:line / CloudWatch entry (i.e. ROOT CAUSE is fully grounded), the skill auto-applies the patch and commits it as one evidence-grounded fix commit. When evidence is insufficient, the skill stops at INSUFFICIENT EVIDENCE without patching. Always states the expected post-fix observable explicitly.
---

# Root Cause Debug — CloudWatch-Driven Diagnosis

Companion to `/workflow-test`. When a workflow fails cond 1-4, this skill takes the failing `job_spec_id`, follows the structured-log breadcrumbs into CloudWatch, traces the exception to a specific source line, and writes a patch proposal grounded entirely in cited evidence.

**Invocation**: `/root-cause-debug <job_spec_id>`
Examples:
- `/root-cause-debug 6b3e624a-d30d-41f1-96b3-e838a5ab4de1`

The argument is the UUID emitted by `Created job=…` in the pytest log, or the `job_spec_id` field in `backend-api/scripts/smoke/reports/all_conditions_free_tier_report.json` when the report exists.

---

## Guiding Rules

1. **Evidence-only — no guessing** — every claim in the diagnosis cites either a CloudWatch log line (with `@timestamp`), a source `file:line`, or a structured-event field. Phrases like "probably / likely / might be" without a citation are forbidden. If evidence is insufficient, the skill stops and reports "INSUFFICIENT EVIDENCE" rather than fabricating a cause.
2. **One job per invocation** — analyse exactly one `job_spec_id` end-to-end. Never aggregate multiple jobs in one diagnosis.
3. **Auto-apply IFF evidence is sufficient** — when Phase 5 ROOT CAUSE is fully cited (every sentence references a file:line or CloudWatch line), the skill applies the Phase 6 patch via Edit and commits it as ONE evidence-grounded fix commit on the current branch (per `.claude/rules/git-workflow.md` — current branch only, never `main`). When Phase 5 emits `INSUFFICIENT EVIDENCE`, the skill stops there — never patches on speculation. Re-deploying the affected lambda + re-running `/workflow-test` to confirm Phase 7's expectations is the user's call: the commit makes the change reviewable; deploy is a separate, user-initiated action.
4. **Expected post-fix outcome must be falsifiable** — the closing block of every diagnosis names: (a) the exact rerun command, (b) the cond / assertion that should turn ✅, (c) one log pattern that should DISAPPEAR, (d) one log pattern that should APPEAR. If any of these can't be stated concretely, the diagnosis is incomplete; do not surface it.
5. **CloudWatch profile = personal (dev)** — same as `/workflow-test`. Production is out of scope.
6. **Reuse existing helpers** — `tests/e2e/goal_lane/helpers/failure_attribution.attribute_failure(job_spec_id, profile=...)` already classifies the failing layer (tool / llm / gateway / orchestrator / infra) using `record_node_event` data; never re-implement.

---

## Phase 0 — Validate input

```bash
JOB_SPEC_ID="$ARGUMENTS"
[[ "$JOB_SPEC_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
  || { echo "ERROR: not a valid UUID job_spec_id: $JOB_SPEC_ID"; exit 1; }
```

If the prior `/workflow-test` run wrote `/tmp/e2e_cond_<spec>.log`, also extract the spec id and original failure summary for context (no fix decisions made on this — just orientation):

```bash
SPEC_SHORT=$(grep -oP 'goal_lane\.\K[a-z_]+' /tmp/e2e_cond_*.log | head -1)
PYTEST_FAIL_SUMMARY=$(grep -A1 "Failed: \[goal_lane\." /tmp/e2e_cond_${SPEC_SHORT}.log | head -3)
```

---

## Phase 1 — Failure attribution (deterministic classifier)

Reuse the existing helper:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
: "${REPO_ROOT:?ERROR: not inside a git worktree — cd into a convilyn worktree before invoking /root-cause-debug}"
cd "$REPO_ROOT/backend-api"
# Python resolution: explicit override → current worktree's venv → poetry-managed venv
if [ -n "$ROOT_CAUSE_DEBUG_PYTHON" ]; then
  PYTHON="$ROOT_CAUSE_DEBUG_PYTHON"
elif [ -x "$REPO_ROOT/backend-api/.venv/bin/python" ]; then
  PYTHON="$REPO_ROOT/backend-api/.venv/bin/python"
elif POETRY_VENV="$(poetry env info --path 2>/dev/null)" && [ -x "$POETRY_VENV/bin/python" ]; then
  PYTHON="$POETRY_VENV/bin/python"
else
  echo "ERROR: no Python interpreter found. Run 'poetry install' under backend-api or set ROOT_CAUSE_DEBUG_PYTHON." >&2
  exit 1
fi
"$PYTHON" - "$JOB_SPEC_ID" <<'PY'
import sys, json
from tests.e2e.goal_lane.helpers.failure_attribution import attribute_failure
attribution = attribute_failure(sys.argv[1], profile="personal")
print(json.dumps({
    "layer": attribution.layer,
    "suggested_tier": attribution.suggested_tier,
    "span_chain": attribution.span_chain,
    "rationale": attribution.rationale,
    "cloudwatch_link": attribution.cloudwatch_link,
}, indent=2))
PY
```

Capture all five fields. `layer` is the FIRST evidence anchor — every later claim must be consistent with it (e.g. if `layer=tool`, the proposed fix touches a tool implementation, not the orchestrator).

---

## Phase 2 — Pull CloudWatch raw logs

Use `cloudwatch_link` from Phase 1 to identify the log group + time window. Fall back to a manual filter:

```bash
LOG_GROUP="/aws/lambda/convilyn-api-dev"   # main API + agent runtime; adjust if attribution.cloudwatch_link names a different group
START_MS=$(date -d '60 minutes ago' +%s)000
AWS_PROFILE=personal aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --filter-pattern "\"$JOB_SPEC_ID\"" \
  --start-time "$START_MS" \
  --max-items 500 \
  --output json > /tmp/rcd_${JOB_SPEC_ID}.json
```

If `cloudwatch_link` already includes a tighter `start`/`end` query string, narrow `--start-time` / `--end-time` to that window — don't pull more than needed.

---

## Phase 3 — Extract exception + traceback

```bash
jq -r '.events
       | sort_by(.timestamp)
       | .[]
       | select(.message | test("(?i)error|exception|traceback|tool_invocation_failed|agent_step_failed"))
       | "\(.timestamp)  \(.message)"' \
   /tmp/rcd_${JOB_SPEC_ID}.json | head -200 > /tmp/rcd_${JOB_SPEC_ID}.errors.txt
```

From this, identify (in this order):
1. **Exception class + message** — the deepest Python exception (e.g. `AttributeError: 'str' object has no attribute 'get'`)
2. **Source file:line** — the bottom-most frame of the Python traceback that lives in `app/`
3. **Tool / span name** — from the surrounding `record_node_event` log entries (look for `node_name` / `tool_name` keys)
4. **Tool input that triggered the bug** — preceding log entry with `tool_invocation_started` or similar; capture the input shape if it's a malformed value

If no traceback is present, look for `error_code=…` fields in `tool_invocation_failed` events. The 9 classification rules in `failure_attribution.py` describe what to expect for each layer.

If after this you still can't cite a `file:line`, **STOP and emit "INSUFFICIENT EVIDENCE"** with the log lines you did find. Do not proceed to Phase 4.

---

## Phase 4 — Read implicated source

Using the cited file:line, Read ±15 lines of context around it. Quote the offending line verbatim in the diagnosis. Note any nearby:
- type annotations that contradict the runtime value
- conditional branches that may have been entered with an unexpected payload shape
- helpers / wrappers used by other tools (so the fix's blast radius can be calculated in Phase 7)

Do not edit the file.

---

## Phase 5 — Diagnose

Output the diagnosis in this **exact** structure (no other shape allowed):

```
LAYER:        <attribution.layer>
SUGG. TIER:   <attribution.suggested_tier>
SPAN CHAIN:   <span_chain joined by " → ">
EXCEPTION:    <ExceptionClass>: <message>
LOCATION:     <abs path>:<line>
EVIDENCE:
  - CloudWatch [<timestamp ISO>]: "<one log line>"
  - CloudWatch [<timestamp ISO>]: "<another log line, if relevant>"
  - Source <file>:<line>: "<offending code, copied exactly>"
  - failure_attribution.rationale: "<value from Phase 1>"
ROOT CAUSE:
  <one paragraph. Every sentence ties back to a citation above.
   No "probably". No "might". State the fact.>
```

If ROOT CAUSE cannot be written without speculation, downgrade to `INSUFFICIENT EVIDENCE` and emit only LAYER / SPAN CHAIN / EVIDENCE blocks — skip Phase 6/7.

---

## Phase 6 — Propose patch

```
PATCH PROPOSAL
  FILE:           <abs path>
  OLD STRING:     <exact text to replace, taken from Phase 4 quote>
  NEW STRING:     <minimal replacement>
  WHY IT FIXES:   <one sentence — must reference Phase 5 ROOT CAUSE>
  BLAST RADIUS:   <list of other call sites / specs affected, with paths>
```

The patch must be the **minimal** change that addresses the cited cause. No drive-by improvements, no logging additions, no defensive type checks unless the cited cause is "missing type guard". Per `.claude/rules/coding-style.md` rule "Don't add error handling… for scenarios that can't happen".

---

## Phase 7 — Expected post-fix outcome (mandatory, falsifiable)

```
EXPECTED AFTER FIX
  1. Re-run command:
       /workflow-test <SPEC_SHORT>
     (or, equivalently, the bash form documented in workflow-test Phase 4)

  2. Cond <N> in the harness output should turn from ❌ → ✅, observable in
     backend-api/scripts/smoke/reports/all_conditions_free_tier_report.json
     under  results[].conditions.cond<N>_<name>: true

  3. CloudWatch log pattern that MUST DISAPPEAR (currently present):
       <exact regex / substring, e.g. "AttributeError: 'str' object has no attribute 'get'">

  4. CloudWatch log pattern that MUST APPEAR (currently absent):
       <exact regex / substring, e.g. "tool_invocation_succeeded tool=export_application_bundle">

  5. docs/qa/goal_lane_workflow_test_progress.md row should advance from <current 5-char> → <expected 5-char>
     (the user runs /workflow-test again to confirm and commit the new row)
```

Every numbered point must be concrete enough that a different operator could verify it without asking you. If any point reads "should look better" or similar — rewrite until it's falsifiable, or emit `INSUFFICIENT EVIDENCE`.

---

## Phase 8 — Apply patch + commit (when evidence sufficient)

Branch on the Phase 5 outcome:

- **IF Phase 5 emitted `INSUFFICIENT EVIDENCE`** → print only the Phase 5 block (LAYER / SPAN CHAIN / EVIDENCE). Skill ends; no Edit, no commit, no `docs/qa/goal_lane_workflow_test_progress.md` touch.

- **ELSE (ROOT CAUSE fully cited)** → apply Phase 6's `OLD STRING` / `NEW STRING` via the Edit tool against the cited file, then commit with this template (one commit, source file only — no `docs/qa/goal_lane_workflow_test_progress.md` change here):

```
fix(<area>): <one-line summary anchored to ROOT CAUSE>

Cited evidence:
  - CloudWatch [<log-group>] [<timestamp>]: "<key log line, copied verbatim>"
  - Source <abs file>:<line>: "<offending code, copied verbatim>"

Why: <Phase 5 ROOT CAUSE paragraph, copied verbatim — no edits>

Expected after deploy + rerun:
  <Phase 7 numbered list 1-5, copied verbatim>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

After the commit lands, print the Phase 5 + 6 + 7 blocks to the user for review. The skill ends.

What the skill **does NOT** do — these are explicit user actions, deliberately separated:
- Trigger CI deploy / `build-push-mcp.sh` / `build-push-backend.sh`. Deployment is side-effecting and resource-spending; the user owns timing.
- Re-run `/workflow-test` to verify Phase 7's expectations. That's the next per-spec workflow cycle, owned by the user.
- Modify `docs/qa/goal_lane_workflow_test_progress.md`. The 5-char status row only flips on the next `/workflow-test` invocation (Phase 7 of that skill).

---

## Noise reduction checklist

- [ ] Raw CloudWatch JSON kept at `/tmp/rcd_<job_id>.json`, error subset at `/tmp/rcd_<job_id>.errors.txt`; neither echoed in chat
- [ ] In chat, only Phase 5 / 6 / 7 blocks appear — no raw log dumps, no jq output
- [ ] No CloudWatch query that pulls > 500 events; if hitting the cap, narrow the time window first
- [ ] No re-running the failed pytest for "verification" before the fix is applied
- [ ] Credentials never logged

---

## Out of scope

- Speculative root causes ("could be a race condition" without evidence)
- Multi-job aggregation (one job per invocation)
- Production CloudWatch (dev only)
- Architectural rewrites (the patch is the minimal cited fix; bigger refactors need their own plan)
- Triggering deploy or re-running `/workflow-test` after the fix commit (user-driven by design)
