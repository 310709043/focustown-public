# Extending workflow-test for a new goal_lane spec

How to add a new spec for a specific use case, both **today** (manual
multi-file pattern) and at the **target state** after the foundation
refactor in [#311] lands.

This guide does NOT cover how to design the spec itself (prompts,
tools, expected outputs). For that, see
`backend-api/docs/engineering/goal_lane_agent_contract.md`.

---

## Today (manual, 4–5 file touches)

Adding `goal_lane.<spec>` requires edits in this order:

1. **Spec JSON** — `backend-api/app/orchestrator/specs/goal_lane/<spec>.json`
   - `agent_config.max_iterations` (drives Phase 2 cost estimate)
   - `agent_config.agent_timeout_seconds`
   - System prompt reference / inline prompt
   - Tool whitelist

2. **Goal-validator registry** —
   `backend-api/tests/e2e/goal_lane/helpers/goal_validator.py:23`
   Add `<workflow_id>` key to `_GOAL_CRITERIA: dict[str, dict[str, Any]]`
   with `required_sections / anti_patterns / min_length / quality_checks /
   structural_checks`. The validator's `assert_goal_achieved` is wired
   into cond 4 — without an entry, cond 4 only enforces `assert_downloadable`
   (downloadable + non-zero).

3. **(Conditional) Harness mask** —
   `backend-api/tests/e2e/goal_lane/helpers/workflow_runner.py:447`
   If the spec has a precision-fallback risk (parse_document failures or
   any tool error path where the agent might emit a non-file
   `request_user_input` instead of surfacing the failure), add
   `"goal_lane.<spec>"` to `_FORBIDDEN_NON_FILE_SLOT_WORKFLOWS`. This
   makes `_pick_slot_answers` raise `AssertionError` instead of silently
   fabricating slot answers, exposing the regression in cond 1-4.

4. **(Conditional) Runtime guardrail** —
   `backend-api/app/orchestrator/agents/core/nodes/call_tool_handlers/request_user_input.py:171`
   For non-file precision-fallback blocks, add
   `_check_<spec>_no_fallback_guardrail` mirroring
   `_check_interview_prep_no_fallback_guardrail`, plus a wiring site in
   `handle_request_user_input` (line ~278). For first-question format
   constraints (multi_choice vs file), add a branch like the
   `goal_lane.resume_to_job_ready` one at line 258. These ARE production
   guardrails — they block the leak at the dispatch layer, not just in
   the test harness.

5. **(Conditional) Failure rubric** —
   `backend-api/tests/e2e/goal_lane/helpers/failure_attribution.py`
   Currently global-only (9 rules). If the spec has unique failure modes,
   add per-spec branching today (no clean seam) — track this debt for the
   migration in [#311].

6. **Progress.md row** —
   `docs/qa/goal_lane_workflow_test_progress.md`
   Add a row to the relevant category section with initial status
   `✅❓❓❓❓` (cond 1 = spec registered). The first `/workflow-test <spec>`
   invocation will replace this row.

### Today's checklist

- [ ] spec JSON registered + parses
- [ ] `_GOAL_CRITERIA` entry added (or accept weaker cond 4)
- [ ] Precision-fallback risk assessed → mask + guardrail added if needed
- [ ] Failure-mode review → rubric entry if non-global
- [ ] progress.md row at `✅❓❓❓❓`
- [ ] One `/workflow-test <spec>` invocation drives it through cond 1-5

---

## Target state (declarative, 1 file touch) — after [#311]

Adding `goal_lane.<spec>` is:

1. **Spec JSON** — `backend-api/app/orchestrator/specs/goal_lane/<spec>.json`
   Gains a `qa_policy` block:

   ```jsonc
   {
     "name": "goal_lane.<spec>",
     "agent_config": { /* ... */ },
     "qa_policy": {
       "slot_policy": {
         "forbid_non_file": true,
         "allowed_slot_types": ["file"],
         "first_question_format": null,
         "terminal_failure_policy": {
           "applicable_tools": ["parse_document"],
           "message_template": "tool_name: {error_verbatim}"
         }
       },
       "goal_criteria": {
         "required_sections": [
           ["summary", "overview"],
           ["experience", "work experience"]
         ],
         "anti_patterns": ["i am writing to apply for"],
         "min_length": 500,
         "quality_checks": [],
         "structural_checks": [{"type": "min_paragraphs", "count": 3}]
       },
       "tool_pipeline": [
         {"name": "parse_document", "allowed_after": [], "required": true},
         {"name": "extract_profile", "allowed_after": ["parse_document"], "required": true},
         {"name": "store_artifact", "allowed_after": ["extract_profile"], "required": true},
         {"name": "complete_workflow", "allowed_after": ["store_artifact"], "required": true}
       ],
       "failure_rubric": [
         {
           "error_code_pattern": "TOOL_INTERNAL_ERROR",
           "log_pattern": "resume_profile_mcp__extract_profile",
           "category": "tool",
           "rationale_template": "extract_profile MCP failed; verify resume-profile-mcp deploy"
         }
       ]
     }
   }
   ```

2. **Progress.md row** — same as today, initial `✅❓❓❓❓`.

That's it. **No Python edits.** The four registries
(`SlotPolicyRegistry`, `goal_validator._GOAL_CRITERIA`,
`_FORBIDDEN_NON_FILE_SLOT_WORKFLOWS`, `failure_attribution._RULES`) all
read FROM `qa_policy` after [#311] sub-tasks 1–5 land.

### Target checklist

- [ ] spec JSON registered with `qa_policy` block
- [ ] progress.md row at `✅❓❓❓❓`
- [ ] One `/workflow-test <spec>` invocation drives it through cond 1-5

---

## Cross-references

- Doctrine: [`DOCTRINE.md`](./DOCTRINE.md) (10-point single-agent best
  practice; points 2, 5, 6, 7 motivate the declarative model)
- Procedure: [`SKILL.md`](./SKILL.md) (the invocation flow this guide
  feeds into)
- Foundation refactor: [#311] — the umbrella issue with the 5 sub-tasks
  that take "today" → "target"
- Sweep umbrella: [#295] — Job-Search Cond 2-5 sweep that surfaced the
  extension friction
- Production feedback loop: [`docs/qa/iteration_loop_runbook.md`](../../../docs/qa/iteration_loop_runbook.md)
  — how a cond-5 leak becomes an eval case + `qa_policy.failure_rubric`
  entry within an SLO (72h / $5 / 3-iter park)

[#311]: https://github.com/CoreNovus/convilyn/issues/311
[#295]: https://github.com/CoreNovus/convilyn/issues/295
