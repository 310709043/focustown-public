---
name: workflow-test
description: Drive ONE goal_lane workflow through all 5 conditions on dev AWS — cond 1-4 via the all-conditions harness, cond 5 via a guided manual QA prompt — then commit a single per-spec docs/qa/goal_lane_workflow_test_progress.md update. Invoke as /workflow-test <spec_short_id>, e.g. /workflow-test application_document_pack. Always prints a pre-run banner (category, spec, test account), runs cond 1-4, asks the user for manual-QA verdict (PASS / FAIL / DEFER), updates docs/qa/goal_lane_workflow_test_progress.md, and commits. Stays inside the spec's category between invocations.
---

# Goal Lane End-to-End — Per-Spec Skill

Wraps `tests/e2e/goal_lane/smoke/test_all_conditions_free_tier.py` (cond 1-4) and the manual QA flow defined in `docs/qa/goal_lane_workflow_test_progress.md` step 2 (cond 5) into a single per-spec operation. One invocation = one workflow tested through to completion = one commit.

**Invocation**: `/workflow-test <spec_short_id>`
Examples:
- `/workflow-test application_document_pack`
- `/workflow-test resume_analyzer`

The argument is the spec id **without** the `goal_lane.` prefix. The harness adds it automatically.

> **Companion docs** (load on need, not by default):
> - [`DOCTRINE.md`](./DOCTRINE.md) — 10-point single-agent best-practice doctrine that motivates Rules 9-11 below
> - [`EXTENDING.md`](./EXTENDING.md) — how to add a new spec; today's manual flow + the declarative target after [#311](https://github.com/CoreNovus/convilyn/issues/311)

---

## Guiding Rules

1. **One spec per invocation, one commit per spec** — never sweep multiple specs in one call; never split a spec across multiple commits. A workflow's commit is the atomic unit of progress.
2. **Stay inside the same category** — after a commit, suggest the next ❓ spec **in the same category** (alphabetical). Cross-category moves require explicit user instruction; never auto-jump.
3. **Pre-run banner mandatory** — before pytest fires, print: category, full spec id, test account email (masked), cost estimate. Without this banner the user cannot tell what's running.
4. **Stop on any cond 1-4 fail** — do not auto-retry, do not auto-fix, do not proceed to QA. Surface the failure (with `failure_attribution`) and let the user decide root cause.
5. **Cond 5 is part of the spec's completion** — after cond 1-4 PASS, prompt the user for manual QA verdict (PASS / FAIL / DEFER) before committing. The commit captures whichever verdict the user gave.
6. **Credentials never inline** — expect `$E2E_USER_EMAIL` / `$E2E_USER_PASSWORD` already exported in the shell env; fail fast if missing. Never paste passwords into Bash command lines or commit messages.
7. **No advance until resolved** — a spec is "done" only when its docs/qa/goal_lane_workflow_test_progress.md row reads `✅✅✅✅✅`, OR the user has explicitly parked it as a known issue (e.g. fixture missing, tier gated). Until then, the skill MUST NOT propose, suggest, or run the next spec — even if the user types "continue" or "next". The proper response while a spec is unresolved is to re-surface the gating action: `/root-cause-debug <job_id>` for cond 1-4 ❌, redeploy + rerun after a patch, or cond 5 manual QA closure for `❓`. `DEFER` and `❌-without-park` both count as unresolved. This is the atomic unit of progress: one fully-✅-or-parked spec at a time.
8. **Move toward the regression-test framework** — this skill is the per-spec smoke today; the target eval framework is `.claude/skills/regression-test/SKILL.md` (8-point). Any change here that silently weakens fixture coverage, reverts to single-grader checks, or removes baseline comparison is a regression of the skill itself — flag via `.claude/rules/planning-discipline.md` before merging.
9. **Eval-first** (DOCTRINE §1) — when this skill surfaces a regression, propose an **eval delta** (a new fixed test case or a tightened criterion in `_GOAL_CRITERIA`) BEFORE proposing a prompt edit. Prompt is the last layer (DOCTRINE §2); blame schema / guardrail / state-machine first. Forwards to `/regression-test`.
10. **Failure classification mandatory** (DOCTRINE §7) — every non-PASS outcome MUST be tagged with one of the 8 taxonomy categories: `tool / understanding / planning / format / data / illegal-fallback / over-questioning / hallucination`. Phase 5 emits `FAILURE_CATEGORY=<one-of>`; Phase 7 row note includes it; Phase 9-B `/root-cause-debug` handoff surfaces it. Per-spec rubrics arrive via [#311] sub-task 5; until then derive the category from `failure_attribution.rationale` + observed symptom.
11. **Cost & reliability captured** (DOCTRINE §10) — Phase 5 output MUST include `elapsed_s`, `invocation_count`, retry/loop count if non-zero, and est cost from Phase 2. Phase 7 row note records them. Accuracy alone is not the target; stability + explainability + cost are co-equal.

---

## Phase 0 — Resolve spec + category

Given `$ARGUMENTS` as the short spec id (e.g. `application_document_pack`):

```bash
SPEC_SHORT="$ARGUMENTS"
SPEC_FULL="goal_lane.${SPEC_SHORT}"

# Resolve repo root from current worktree (caller's pwd must be inside the
# target worktree). Falls back to the canonical fix/all-workflow worktree
# only if git rev-parse fails — never silently picks the wrong tree.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
: "${REPO_ROOT:?ERROR: not inside a git worktree — cd into your target worktree before invoking /workflow-test}"

# Verify spec is registered
cd "$REPO_ROOT/backend-api"
ls app/orchestrator/specs/goal_lane/${SPEC_SHORT}.json >/dev/null 2>&1 \
  || { echo "SPEC NOT FOUND: ${SPEC_FULL}"; exit 1; }

# Category lookup from docs/qa/goal_lane_workflow_test_progress.md (the section header preceding the spec row)
cd "$REPO_ROOT"
CATEGORY=$(awk -v spec="${SPEC_FULL}" '
  /^### / { cat = $0; sub(/^### /, "", cat); sub(/ \(.*$/, "", cat) }
  $0 ~ spec { print cat; exit }
' docs/qa/goal_lane_workflow_test_progress.md)
```

If `CATEGORY` is empty, the spec is missing from docs/qa/goal_lane_workflow_test_progress.md → STOP and report. Do not proceed silently.

---

## Phase 1 — Load credentials

The user keeps `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` exported in their shell session. The skill never persists them to disk, never echoes them, and never inlines them in a commit.

```bash
: "${E2E_USER_EMAIL:?ERROR: export E2E_USER_EMAIL in your shell before invoking /workflow-test}"
: "${E2E_USER_PASSWORD:?ERROR: export E2E_USER_PASSWORD in your shell before invoking /workflow-test}"
```

If either var is unset: stop, print the export hint, and ask the user to set them in the calling shell. Do not prompt for the password inline; do not save it anywhere.

---

## Phase 2 — Cost estimate

Reuse `/e2e-cost` formula. Fail fast if the spec's `max_iterations` × per-iter cost exceeds $5 — confirm with user before continuing.

```bash
cd backend-api
python3 - "$SPEC_SHORT" <<'PY'
import json, sys
spec_short = sys.argv[1]
spec = json.load(open(f"app/orchestrator/specs/goal_lane/{spec_short}.json"))
max_iter = spec.get("agent_config", {}).get("max_iterations", 25)
per_iter = 5000 * 3.0 / 1e6 + 400 * 15.0 / 1e6
cost = max_iter * per_iter
print(f"max_iterations={max_iter}  est_cost=${cost:.4f}")
if cost > 5.0:
    print("WARN: estimated cost > $5 — confirm with user before running")
    sys.exit(2)
PY
```

---

## Phase 3 — Pre-run banner (REQUIRED)

```
========================================================
[workflow-test] PRE-RUN
  category : <CATEGORY>
  spec     : goal_lane.<SPEC_SHORT>
  account  : <masked email — show local-part + last 3 chars of domain>
  profile  : personal (AWS dev)
  cost est : $<X.XXXX>
  conds    : 1-4 auto, 5 manual QA after pass
========================================================
```

Email masking — show enough to verify the right account without leaking the full address. Example: `joelhsu@febigcity.com` → `joelhsu@***.com`. The user picks the account by which file they populate; the banner just confirms.

Then **wait one beat** and emit the run command. Do not bundle the banner into the same Bash invocation as pytest — they read better as separate outputs.

---

## Phase 4 — Run the harness

```bash
cd "$REPO_ROOT/backend-api"

# Resolve Python interpreter. Priority order — first hit wins, no
# machine-specific paths in the skill itself:
#   1. $WORKFLOW_TEST_PYTHON                      (explicit override)
#   2. $REPO_ROOT/backend-api/.venv/bin/python    (current worktree's venv)
#   3. $(poetry env info --path)/bin/python       (poetry-managed venv)
# Fail fast with an actionable error if none resolves; never silently
# fall through to system python (it won't have paddle-python-sdk etc.).
if [ -n "$WORKFLOW_TEST_PYTHON" ]; then
  PYTHON="$WORKFLOW_TEST_PYTHON"
elif [ -x "$REPO_ROOT/backend-api/.venv/bin/python" ]; then
  PYTHON="$REPO_ROOT/backend-api/.venv/bin/python"
elif POETRY_VENV="$(poetry env info --path 2>/dev/null)" && [ -x "$POETRY_VENV/bin/python" ]; then
  PYTHON="$POETRY_VENV/bin/python"
else
  echo "ERROR: no Python interpreter found. Set WORKFLOW_TEST_PYTHON, run 'poetry install' under backend-api, or symlink a .venv into this worktree." >&2
  exit 1
fi

RUN_REAL_AWS_E2E=true AWS_PROFILE=personal \
  E2E_EXISTING_USER_EMAIL="$E2E_USER_EMAIL" \
  E2E_EXISTING_USER_PASSWORD="$E2E_USER_PASSWORD" \
  ALL_CONDITIONS_SAMPLE="$SPEC_SHORT" \
  "$PYTHON" -m pytest \
    tests/e2e/goal_lane/smoke/test_all_conditions_free_tier.py \
    -v --no-cov --timeout=900 \
    2>&1 | tee /tmp/e2e_cond_${SPEC_SHORT}.log
```

Run timeout: 900s (15 min). Most specs finish in 2-5 min; OCR / video specs need more.

---

## Phase 5 — Parse outcome

The harness writes `backend-api/scripts/smoke/reports/all_conditions_free_tier_report.json` when the test reaches outcome construction. Parse it; if it's missing (the runner raised before appending), fall back to greping the pytest log so we still surface a `job_spec_id` for `/root-cause-debug`.

```bash
python3 - "$SPEC_FULL" "$SPEC_SHORT" <<'PY'
import json, os, re, sys
spec_full, spec_short = sys.argv[1], sys.argv[2]
report_path = "backend-api/scripts/smoke/reports/all_conditions_free_tier_report.json"
log_path = f"/tmp/e2e_cond_{spec_short}.log"

if os.path.exists(report_path):
    report = json.load(open(report_path))
    hits = [r for r in report["results"] if r["workflow_id"] == spec_full]
    if hits:
        r = hits[0]
        c = r["conditions"]
        m = lambda b: "✅" if b else "❌"
        status_14 = m(c["cond1_agent_started"]) + m(c["cond2_tools_invoked"]) \
                  + m(c["cond3_observability_traceable"]) + m(c["cond4_artifact_produced"])
        print(f"STATUS_14={status_14}")
        print(f"COND14_PASSED={r['passed']}")
        print(f"FAILURE_SUMMARY={r.get('failure_summary') or ''}")
        print(f"INVOCATIONS={r['invocation_count']}  ARTIFACTS={r['artifact_count']}")
        print(f"JOB_SPEC_ID={r['job_spec_id']}")
        sys.exit(0)

# Fallback: report missing or no entry — runner raised before outcome
log = open(log_path).read() if os.path.exists(log_path) else ""
job_id_match = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", log)
fail_match = re.search(r"Failed:\s*\[" + re.escape(spec_full) + r"\][^\n]*", log)
print("REPORT_MISSING=true (runner raised before outcome construction)")
print(f"COND14_PASSED=False")
print(f"STATUS_14=❓❓❓❓  (cannot derive from report; classify from /root-cause-debug)")
print(f"JOB_SPEC_ID={job_id_match.group(0) if job_id_match else '(not found in log)'}")
print(f"FAILURE_SUMMARY={fail_match.group(0) if fail_match else '(grep pytest log)'}")
PY
```

If `COND14_PASSED=False` (either via report or via fallback): capture the failed condition + `FAILURE_SUMMARY` + `JOB_SPEC_ID`. **Skip Phase 6** (no QA on a partial run) and go straight to Phase 7 with the partial status. The `JOB_SPEC_ID` feeds `/root-cause-debug` in Phase 9.

### Phase 5a — Failure classification (Rule 10)

For every non-PASS outcome, tag the failure with one of the 8 categories from [`DOCTRINE.md`](./DOCTRINE.md) §7:

| Category | Trigger signal |
|---|---|
| `tool` | `error_code` from MCP / dependency timeout / 5xx after retries |
| `understanding` | agent re-asks for input that was already provided |
| `planning` | wrong tool order / skipped required step / illegal pipeline transition |
| `format` | output fails `GoalValidator.structural_checks` / schema mismatch |
| `data` | input genuinely insufficient (fixture-coverage gap) |
| `illegal-fallback` | non-file Slot when a file was already uploaded; precision-fallback violation |
| `over-questioning` | >1 Slot emission for a deterministic-pipeline spec |
| `hallucination` | output cites refs / sources not present in input |

Derive from `failure_attribution.rationale` + observed symptom. Set `FAILURE_CATEGORY=<one-of>` and feed it to Phase 7 (row note) + Phase 9-B (handoff).

### Phase 5b — Cost & reliability fields (Rule 11)

Augment the Phase 5 parse output with `ELAPSED_S=<r.get("elapsed_seconds")>`, `RETRY_COUNT=<grep '_retry|retrying in' /tmp/e2e_cond_<spec>.log | wc -l>`, and `EST_COST=$<from Phase 2>`. Phase 7 row note records all four (`invocations`, `artifacts`, `elapsed_s`, `est_cost`); plus `retries=N` if non-zero.

---

## Phase 6 — Manual QA (Cond 5)

Triggered **only when cond 1-4 all pass**. The skill stops, prints the QA checklist (verbatim from `docs/qa/goal_lane_workflow_test_progress.md` step 2 — `frontend-web/` localhost → dev API), and asks the user for a verdict.

Print this block to the user:

```
================ MANUAL QA — goal_lane.<SPEC_SHORT> ================
1. cd frontend-web && pnpm dev
2. Login with the dev test account
3. Walk the workflow until you see the artifact (or an error)
4. Inspect the DOM for any of these leak patterns:
   - "Error:" / "Exception" / "Traceback"
   - stack frames matching  at .*\.py:\d+
   - raw "500 Internal Server Error"
   - JSON beginning with {"detail":
   - untranslated  goalLane.xxx  i18n keys
=====================================================================
```

Then call `AskUserQuestion` with three options:

- **PASS** — DOM clean, no leaks
- **FAIL** — leaks found (user provides one-line reason; skill records as note)
- **DEFER** — manual QA postponed; cond 5 stays `❓` and commit message records "QA pending"

Map the verdict to `COND5_CHAR` and `COND5_NOTE`:

| Verdict | COND5_CHAR | COND5_NOTE |
|---|---|---|
| PASS | ✅ | (none) |
| FAIL | ❌ | `Cond 5 fail：<user reason>` |
| DEFER | ❓ | `Cond 5 QA pending` |

If cond 1-4 already failed, skip this phase entirely; carry `COND5_CHAR=❓` and no QA note.

---

## Phase 7 — Update docs/qa/goal_lane_workflow_test_progress.md

Find the spec's row and replace the 5-char status block. Outcomes:

| Situation | 5-char | Note suffix |
|---|---|---|
| 1-4 all pass + QA PASS | `✅✅✅✅✅` | (none) |
| 1-4 all pass + QA FAIL | `✅✅✅✅❌` | `— Cond 5 fail：<reason>` |
| 1-4 all pass + QA DEFER | `✅✅✅✅❓` | `— Cond 5 QA pending` |
| Any cond 1-4 fail | `<STATUS_14>❓` | `— Cond N fail：<short reason>` (no QA performed) |

Reference: the existing `notes_to_table` row models the partial-fail format — `✅✅✅❌❓ — 4 OCR calls; **Cond 4 fail：合成 PNG 無法 OCR** — 換真實照片重測`.

```bash
# Pseudocode — actual edit via the Edit tool (one row, exact match)
# Line to replace example:
#   | ✅❓❓❓❓ | `goal_lane.application_document_pack` |
# Becomes (1-4 pass + QA PASS):
#   | ✅✅✅✅✅ | `goal_lane.application_document_pack` |
```

---

## Phase 8 — Commit

ONE commit, docs/qa/goal_lane_workflow_test_progress.md only:

```bash
git add docs/qa/goal_lane_workflow_test_progress.md
git commit -m "$(cat <<EOF
test(goal-lane): advance ${SPEC_SHORT} through all conditions

Result: <STATUS_5CHAR>  (cond 1-4 + cond 5 verdict)
Cond 1-4: invocations=<N>, artifacts=<N>
Cond 5: <PASS|FAIL|DEFER>  <reason or "QA pending" or omit on PASS>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Discipline: a "completed" workflow means cond 1-5 all evaluated (PASS / FAIL / DEFER are all valid evaluations — DEFER just records that QA was consciously postponed). Never commit a spec twice in a row to "upgrade" cond 5 from ❓ → ✅; if QA is deferred and later run, that becomes its own cleanup commit.

### Phase 8a — Regression-test promotion (Rule 8 + 9)

When a previously-failing spec advances to `✅✅✅✅✅`, the failing fixture should be promoted to a fixed eval case under `/regression-test` so the same bug can't silently recur. Pointer-only here; harness wiring is part of [#311] sub-task 5 (failure rubric → regression assertion). Until then, surface the suggestion to the user in Phase 9-A.

---

## Phase 9 — What to suggest next

### A. cond 1-4 PASSED

Per Rule 7, only propose the next spec when the row is fully `✅✅✅✅✅`. If cond 5 was DEFER or FAIL, surface the cond 5 closure step (re-run after fix, or park) — do not suggest a next spec. When the row IS `✅✅✅✅✅`, propose the next ❓ spec **in the same category** (alphabetical); same-category continuity is non-negotiable. If the category is fully done (no `❓` cells anywhere), ask the user which category to start next — do not pick on their behalf. **Also surface Phase 8a's regression-test promotion suggestion** if the fix-→-✅✅✅✅✅ transition just happened.

### B. cond 1-4 FAILED

Per Rule 7, the spec is unresolved — no next spec until it returns to `✅✅✅✅✅`. Hand off to `/root-cause-debug` by surfacing this verbatim block to the user (with `FAILURE_CATEGORY` from Phase 5a):

```
Cond <N> failed for goal_lane.<SPEC_SHORT> (category: <FAILURE_CATEGORY>) — to diagnose, run:

  /root-cause-debug <JOB_SPEC_ID>

This pulls the job's CloudWatch logs, traces the exception to a
specific file:line, and produces an evidence-grounded patch proposal
plus the falsifiable post-fix observable. Do NOT advance to the next
spec until the failure is understood; downstream specs may share the
same root cause.
```

Do NOT proactively run `/root-cause-debug` from inside this skill — separate skill, separate user-approval moment. After its patch lands + cond 1-4 re-verifies, user re-invokes `/workflow-test <SPEC_SHORT>` to redo cond 5 and replace the partial-status row.

---

## Phase 10 — Production feedback intake

Trigger: a cond-5 leak surfaces — either Phase 6 manual QA returned FAIL, or a user reports a leak from a deployed environment. The leak escapes the cond 1-4 harness by definition, so the response is not "re-run the harness" but "close the gap that let it slip".

Hand off to the iteration-loop runbook (single source of truth for procedure + SLOs):

→ [`docs/qa/iteration_loop_runbook.md`](../../../docs/qa/iteration_loop_runbook.md)

The runbook binds the work to one DOCTRINE §7 category, one new fixed eval case under `backend-api/eval/cases/<workflow_id>/`, one `qa_policy.failure_rubric` entry, and the smallest applicable patch (DOCTRINE §2 ladder: schema → slot_policy → tool_pipeline → prompt). SLOs are committed: ≤72h turnaround, ≤$5/iter, park after 3 failed iterations.

This phase couples Rule 8 (regression-test promotion), Rule 9 (eval-first), and Rule 10 (failure classification) into a single operator artifact. The rubric wiring landed via #314 (merged 2026-05-11) — `failure_attribution.py` already consults `qa_policy.failure_rubric` before its 9 global rules. Do NOT inline the runbook procedure here — keep this phase a pointer so the runbook can evolve without SKILL.md re-edits.

---

## Discipline

- One pytest log at `/tmp/e2e_cond_<spec>.log`; do not echo raw stdout in chat — surface only parsed STATUS + FAILURE_SUMMARY + FAILURE_CATEGORY.
- No re-running the harness for "verification" after commit. No credentials echoed anywhere. No tee'd output >~30 lines in chat.
- Out of scope: Pro / Business tier provisioning (Compliance & Governance specs gated on this); `notes_to_table` fixture replacement; bulk multi-spec sweeps.
