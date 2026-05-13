---
name: e2e-debug
description: Use this skill to verify a goal lane workflow E2E end-to-end — runs functional then quality tests together for ONE workflow, diagnoses any failure via CloudWatch (profile=personal), and on success produces a security review + documented success report. Invoke as /e2e-debug <workflow_id>, e.g. /e2e-debug goal_lane.reading_to_highlights
---

# Goal Lane E2E Workflow Verification

Verifies ONE workflow at a time. **Both functional AND quality must pass** before the workflow is considered done. Never move to the next workflow until the current one is green on both.

**Invocation**: `/e2e-debug <workflow_id>`
Example: `/e2e-debug goal_lane.reading_to_highlights`

---

## Guiding Rules

1. **One workflow at a time** — complete both functional + quality before touching the next workflow.
2. **Functional first** — if functional fails, do not run quality. Fix the root cause first.
3. **Root cause only** — diagnose via CloudWatch before touching any code. Workarounds forbidden.
4. **Cost check before every run** — a single workflow re-run costs real Bedrock money.
5. **Document on success** — write a clear success report with test data, checks passed, and why.
6. **Security review on success** — run the security-reviewer agent after both tests pass.
7. **CRITICAL — Skip-after-pass rule** — A `@pytest.mark.skip` decorator may ONLY be added to a test if that test's LAST run PASSED with the FINAL version of ALL code (including shared helpers). If ANY code was modified to fix a failure (test files, validators, shared helpers, specs), you MUST re-run BOTH functional AND quality tests with the final code before adding skip to either. Never re-skip a test whose last run used a different version of shared code than what will be committed. The sequence must be: fix → re-run ALL → all pass → then skip + commit.

---

## Phase 0 — Locate Test Files

Given `$ARGUMENTS` as the workflow_id (e.g. `goal_lane.reading_to_highlights`):

```bash
WORKFLOW_ID="$ARGUMENTS"
WF_NAME="${WORKFLOW_ID#*.}"   # strip "goal_lane." prefix → reading_to_highlights

# Find functional test
find backend-api/tests/e2e/goal_lane/functional -name "*${WF_NAME}*" 2>/dev/null

# Find quality test
find backend-api/tests/e2e/goal_lane/quality -name "*${WF_NAME}*" 2>/dev/null
```

If either file is missing, STOP and report to the user. Do not proceed.

Also read the workflow spec to understand input/output expectations:
```bash
find backend-api/app/orchestrator/specs -name "${WF_NAME}.json" | head -1 | xargs cat
```

---

## Phase 1 — Cost Estimate

Before running, estimate the Bedrock cost using the formula from `/e2e-cost`:

```bash
cd backend-api
# Claude: substitute the actual workflow_id for WORKFLOW_ID below
python3 - <<'EOF'
import json, sys
WORKFLOW_ID = sys.argv[1]   # Claude passes this as the first arg
name = WORKFLOW_ID.split(".", 1)[1]
import glob
matches = glob.glob(f"app/orchestrator/specs/**/{name}.json", recursive=True)
if not matches:
    print(f"Spec not found for {WORKFLOW_ID}"); sys.exit(1)
spec = json.load(open(matches[0]))
max_iter = spec.get("agent_config", {}).get("max_iterations", 25)
cost = max_iter * (5000 * 3.0 / 1e6 + 400 * 15.0 / 1e6)
print(f"{WORKFLOW_ID}: max_iterations={max_iter}, est_cost_per_run=${cost:.4f}")
print(f"Both functional + quality (2 runs): ${cost*2:.4f}")
EOF
# Usage: python3 - <<'EOF' ... EOF goal_lane.reading_to_highlights
```

- If cost > $5.00 per run: confirm with user before proceeding.
- For normal workflows (~15-25 iterations): ~$0.30–$0.53 per run.

---

## Phase 2 — Run Functional Test

### Step 2a: Un-skip the functional test

Read the functional test file. Remove the `@pytest.mark.skip(...)` decorator from the class.
Keep the class body exactly as-is. Save the file.

### Step 2b: Run it

```bash
cd backend-api
RUN_REAL_AWS_E2E=true \
AWS_PROFILE=personal \
E2E_EXISTING_USER_EMAIL="$E2E_EXISTING_USER_EMAIL" \
E2E_EXISTING_USER_PASSWORD="$E2E_EXISTING_USER_PASSWORD" \
poetry run pytest <FUNCTIONAL_TEST_FILE> \
  -v -s --timeout=600 --no-cov 2>&1 | tee /tmp/e2e_functional.log
```

Credentials must be set in the shell environment before running (never inline plaintext values):
```bash
export E2E_EXISTING_USER_EMAIL='...'
export E2E_EXISTING_USER_PASSWORD='...'
```

### Step 2c: Capture job_id

The workflow runner logs the job_id. Extract it for CloudWatch lookup:

```bash
grep -oP 'job_id=\K[a-zA-Z0-9_-]+' /tmp/e2e_functional.log | head -1
# OR
grep "Created job=" /tmp/e2e_functional.log | head -1
```

### Step 2d: Evaluate result

- **PASSED** → proceed to Phase 3.
- **FAILED** → go to Phase 4 (diagnose). Do NOT run quality test yet.

---

## Phase 2.5 — Ask User for Test File

Only reached when functional PASSED. Before running quality, ask the user for a real test file.

**CRITICAL**: The functional test uses auto-generated synthetic test data, which is sufficient for structural validation. But the quality test MUST use a real file provided by the user to validate actual parsing and output quality. The test framework's synthetic data is NOT sufficient for quality verification.

### Step 2.5a: Ask user for test file

Use `AskUserQuestion` to request a test file path:
- "Functional test passed. For quality verification, please provide the path to a real test file (e.g. a PDF, DOCX, or image). This file will be uploaded to dev and processed by the workflow to verify output quality."

If the user already provided a test file path in the original invocation arguments, use that directly without asking.

### Step 2.5b: Validate the file

```bash
# Check file exists and is a supported format
ls -la "<USER_PROVIDED_FILE_PATH>"
file "<USER_PROVIDED_FILE_PATH>"
```

If the file doesn't exist or is not a supported format for this workflow, ask the user again.

### Step 2.5c: Upload and run with user's file

Instead of relying on `test_data_resolver.get_test_files()`, run the workflow manually via API using the user's file:
1. Sign in with E2E credentials
2. Upload the user's file via `/api/v1/upload/presign` + S3 PUT + `/api/v1/upload/confirm`
3. Create a goal job with the workflow_id and file_id
4. Confirm the job
5. Poll until completed or failed
6. Download artifacts and validate quality

This replaces Step 3b (running via pytest) when a user-provided file is available. The quality checks (keyword match, hallucination markers, goal criteria) should still be applied manually by inspecting the artifact content.

---

## Phase 3 — Run Quality Test

Only reached when functional PASSED.

### Step 3a: Un-skip the quality test

Read the quality test file. Remove the `@pytest.mark.skip(...)` decorator from the class.
Save the file.

### Step 3b: Run it

```bash
cd backend-api
RUN_REAL_AWS_E2E=true \
AWS_PROFILE=personal \
E2E_EXISTING_USER_EMAIL="$E2E_EXISTING_USER_EMAIL" \
E2E_EXISTING_USER_PASSWORD="$E2E_EXISTING_USER_PASSWORD" \
poetry run pytest <QUALITY_TEST_FILE> \
  -v -s --timeout=600 --no-cov 2>&1 | tee /tmp/e2e_quality.log
```

### Step 3c: Evaluate result

- **PASSED** → proceed to Phase 5 (success report + security review).
- **FAILED** → go to Phase 4 (diagnose). The failure label in the output will tell you whether it's a `[QUALITY]` failure (content issue) vs a fluke `[FUNCTIONAL]` failure.

---

## Phase 4 — Diagnose Failures via CloudWatch

Use the job_id captured in Phase 2c (or from the quality test log).

### Step 4a: Find the log stream

```bash
JOB_ID="<job_id_here>"

# Find recent log streams
aws logs describe-log-streams \
  --profile personal \
  --log-group-name /aws/lambda/convilyn-dev-goal-worker \
  --region ap-northeast-1 \
  --order-by LastEventTime \
  --descending \
  --max-items 5 \
  --query 'logStreams[*].logStreamName' \
  --output text
```

### Step 4b: Pull full execution trace for the job

```bash
# Filter by job_id field (structured JSON logs)
aws logs filter-log-events \
  --profile personal \
  --log-group-name /aws/lambda/convilyn-dev-goal-worker \
  --region ap-northeast-1 \
  --filter-pattern "\"$JOB_ID\"" \
  --start-time $(date -d '2 hours ago' +%s)000 \
  --query 'events[*].message' \
  --output text 2>&1 | head -200

# If the run spans multiple workers:
for group in /aws/lambda/convilyn-dev-goal-worker \
             /aws/lambda/convilyn-dev-heavy-worker \
             /aws/lambda/convilyn-dev-goal-task-worker; do
  echo "=== $group ==="
  aws logs filter-log-events \
    --profile personal \
    --log-group-name "$group" \
    --region ap-northeast-1 \
    --filter-pattern "\"$JOB_ID\"" \
    --start-time $(date -d '2 hours ago' +%s)000 \
    --query 'events[*].message' \
    --output text 2>/dev/null | head -100
done
```

### Step 4c: Classify the failure

| Test output prefix | Root cause category | Where to look in logs |
|--------------------|--------------------|-----------------------|
| `[FUNCTIONAL] status=failed` | Agent crashed or timed out | `level=ERROR`, `max_iterations exceeded` |
| `[FUNCTIONAL] status=partial` | One sub-task completed, others didn't | `task_id` entries with `status=failed` |
| `[FUNCTIONAL] No artifact` | store_artifact or complete_workflow not called | Last 5 `step_id` entries |
| `[FUNCTIONAL] MIME type mismatch` | Wrong export format from MCP tool | `tool_name=export.*` result |
| `[QUALITY] Keyword match too low` | LLM output is thin / hallucinated | Download artifact text, inspect directly |
| `[QUALITY] Hallucination marker` | LLM admitted it can't do the task | Inspect system prompt loading: `Loaded prompt` vs `using fallback` |
| `[QUALITY] Goal criteria failed` | Structural sections missing | Inspect artifact text content |

### Step 4d: Search for root cause patterns

```bash
# System prompt loaded correctly?
grep -i "Failed to load prompt\|using fallback\|Loaded prompt" /tmp/e2e_*.log

# Tool call sequence (reconstruct the chain)
grep -i "tool_name\|step_id\|Executing tool\|Tool result" /tmp/e2e_*.log | head -50

# Loop detection (same tool called 3+ times?)
grep -oi "tool_name.*" /tmp/e2e_*.log | sort | uniq -c | sort -rn | head -10

# Errors
grep -i "error\|exception\|traceback\|exceeded" /tmp/e2e_*.log | head -20
```

### Step 4e: Fix and re-deploy if needed

If code or YAML changed:
```bash
cd /home/docker_admin/develop/convilyn
AWS_PROFILE=personal ./scripts/ecr/build-push-backend.sh -e dev --force

# Then update all goal worker Lambdas:
DIGEST=$(AWS_PROFILE=personal aws ecr describe-images \
  --repository-name convilyn-backend-api \
  --region ap-northeast-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-1].imageDigest' \
  --output text | tr -d '[:space:]')
REPO_URI="307031015962.dkr.ecr.ap-northeast-1.amazonaws.com/convilyn-backend-api"

for fn in convilyn-dev-goal-worker convilyn-dev-heavy-worker convilyn-dev-goal-task-worker; do
  AWS_PROFILE=personal aws lambda update-function-code \
    --function-name "$fn" --image-uri "${REPO_URI}@${DIGEST}" \
    --region ap-northeast-1 --no-cli-pager --query 'CodeSha256' --output text
  AWS_PROFILE=personal aws lambda wait function-updated \
    --function-name "$fn" --region ap-northeast-1
  echo "$fn updated."
done
```

Return to Phase 2 and re-run. **Maximum 3 retry cycles total.** If the workflow is still failing after 3 attempts, STOP and escalate to the user with the CloudWatch trace — do not keep re-running with real Bedrock cost.

---

## Phase 5 — On Success: Re-skip Both Tests

**CRITICAL GATE CHECK** before adding any skip:
- Were ANY files modified during this verification cycle (shared helpers, validators, test files, specs)?
- If YES: Did BOTH functional AND quality pass AFTER the last modification?
- If NO to the second question: you MUST re-run the test(s) that have not been run since the modification. Only proceed to add skip after both pass with the final code.

After both tests pass with the final code, update the skip decorator in both files:

**Functional test** — edit `@pytest.mark.skip`:
```python
@pytest.mark.skip(
    reason="VERIFIED <YYYY-MM-DD> — GoalJobStatus.COMPLETED (~X min). Re-enable to regression test."
)
```

**Quality test** — edit `@pytest.mark.skip`:
```python
@pytest.mark.skip(
    reason="QUALITY VERIFIED <YYYY-MM-DD> — completed (~X min). Keyword match YY%. GoalValidator PASS. Re-enable to regression test."
)
```

Use today's date and the actual execution time from the test output:
```bash
# Extract execution time from pytest output
grep -oP '\d+\.\d+s' /tmp/e2e_functional.log | tail -1
grep -oP '\d+\.\d+s' /tmp/e2e_quality.log | tail -1
# OR: grep "passed in" /tmp/e2e_functional.log
```

---

## Phase 6 — Security Review

After both tests pass, run the security-reviewer agent on the two test files:

```
Use the security-reviewer agent on:
- <FUNCTIONAL_TEST_FILE>
- <QUALITY_TEST_FILE>

Focus on:
1. Test credentials — are they only via env vars (RUN_REAL_AWS_E2E, E2E_EXISTING_USER_EMAIL, E2E_EXISTING_USER_PASSWORD)?
2. Test data — does synthetic or S3 test data contain real PII (names, IDs, addresses)?
3. Artifact download — are pre-signed S3 URLs logged in plaintext? (should only be in DEBUG, not INFO)
4. CloudWatch access — does the test expose the job_id in a way that leaks user data?
5. Assert messages — do failure messages accidentally include file content or user data?
```

Fix any CRITICAL or HIGH findings before marking the workflow as verified.

---

## Phase 7 — Success Report

Output a structured report in this exact format:

```
╔══════════════════════════════════════════════════════════╗
║  E2E VERIFICATION REPORT                                 ║
╠══════════════════════════════════════════════════════════╣
║  Workflow:     goal_lane.<name>                          ║
║  Date:         YYYY-MM-DD                                ║
║  Duration:     ~X min (functional) + ~Y min (quality)   ║
║  Job ID:       <first 16 chars of job_id>               ║
╠══════════════════════════════════════════════════════════╣
║  FUNCTIONAL    ✅ PASSED                                 ║
║  ─ status=completed                                      ║
║  ─ artifacts: N (expected: N)                            ║
║  ─ MIME: <actual mime type>                              ║
║  ─ downloadable: ✅ (N bytes)                            ║
╠══════════════════════════════════════════════════════════╣
║  QUALITY       ✅ PASSED                                 ║
║  ─ hallucination markers: none                           ║
║  ─ keyword match: N/M (XX%)  [threshold ≥60%]           ║
║  ─ goal criteria: PASS / N/A                             ║
║  ─ demand-side: PASS                                     ║
╠══════════════════════════════════════════════════════════╣
║  TEST DATA                                               ║
║  ─ source: S3 test bucket / synthetic (FileGenerator)   ║
║  ─ input: <file description, e.g. "1× PDF, ~2 pages">   ║
║  ─ no PII detected in test data                         ║
╠══════════════════════════════════════════════════════════╣
║  SECURITY REVIEW                                         ║
║  ─ credentials: env vars only ✅                         ║
║  ─ PII in test data: none ✅                             ║
║  ─ S3 URLs in logs: <level> only ✅                      ║
║  ─ findings: NONE / <list if any>                        ║
╠══════════════════════════════════════════════════════════╣
║  WHY IT PASSED                                           ║
║  <1-3 sentences: what the workflow does, what the LLM   ║
║   produced, why the quality checks were satisfied>      ║
╚══════════════════════════════════════════════════════════╝
```

---

## Quick Reference: Failure Diagnosis Decision Tree

```
Test output says status=failed?
  └─ Check CloudWatch for ERROR logs → find the crashing step
     └─ Prompt load failure? → fix YAML template variable escaping
     └─ Tool returning empty? → fix MCP tool or add input guard
     └─ max_iterations exceeded? → verify ALL iterations are productive (see /e2e-cost)

Test output says [QUALITY] keyword match low?
  └─ Download the artifact text directly
  └─ Is it generic / hallucinated? → check system prompt loaded (not fallback)
  └─ Is it on-topic but thin? → check max_iterations, consider raising if iterations are productive

Test output says [QUALITY] hallucination marker?
  └─ LLM said "as an AI" or "I don't have access"
  └─ Almost always a system prompt load failure → grep "using fallback" in logs
```
