---
name: e2e-cost
description: Estimate the Bedrock LLM cost of running goal lane E2E tests BEFORE execution. Use this before running any significant E2E test batch. Warns if estimated cost exceeds thresholds. Based on real spec max_iterations and Claude Sonnet 4.6 pricing.
---

# E2E Cost Estimator

Run this **before** executing E2E tests to know the Bedrock cost upfront. Pricing constants are the single source of truth shared with `/workflow-test` Phase 2 and `/e2e-debug` Phase 1.

## Warning Thresholds

| Scope | Warn at | Stop & Confirm at |
|-------|---------|-------------------|
| Single workflow | > $3.00 | > $5.00 |
| One category (8–16 tests) | > $10.00 | > $20.00 |
| Full functional suite (~40 tests) | > $20.00 | > $40.00 |
| Functional + Quality (~80 tests) | > $40.00 | > $80.00 |

## Model Pricing (Claude Sonnet 4.6 on AWS Bedrock)

| Token Type | Price |
|-----------|-------|
| Input | $3.00 / 1M tokens |
| Output | $15.00 / 1M tokens |

> **Note**: `LLMUsageTracker` in `tests/e2e/real_aws/conftest.py` may still use Haiku pricing
> ($0.25 / $1.25). If so, the tracker is ~12× too cheap for budgeting — use the numbers here for real estimates.

## Cost Formula

```
cost_per_workflow ≈ max_iterations × (5,000 input_tokens × $3/1M + 400 output_tokens × $15/1M)
                  = max_iterations × $0.021
```

The 5,000 input / 400 output per iteration is a conservative midpoint:
- System prompt is ~3,000 tokens (loaded once, passed every iteration)
- Tool output accumulates as conversation history (~1,000–2,000 tokens per prior step)
- Agent output per turn: ~200–600 tokens

High-tool-count or multi-phase workflows cost more per iteration than simple ones.

---

## Quick Estimate Script

Pass workflow ids on the command line, or pass no args to score every `goal_lane.*` spec in the repo.

Run from `backend-api/`:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT/backend-api"
python3 - "$@" <<'PY'
import json, glob, os, sys

INPUT_COST_PER_1M  = 3.00   # Claude Sonnet 4.6 Bedrock
OUTPUT_COST_PER_1M = 15.00
AVG_INPUT_PER_ITER  = 5000
AVG_OUTPUT_PER_ITER = 400

def per_iter_cost():
    return (AVG_INPUT_PER_ITER * INPUT_COST_PER_1M / 1e6 +
            AVG_OUTPUT_PER_ITER * OUTPUT_COST_PER_1M / 1e6)

def load_max_iterations(spec_id: str) -> int | None:
    cat, name = (spec_id.split(".", 1) + [None])[:2]
    if name is None:
        return None
    for d in (f"app/orchestrator/specs/{cat}",
              "app/orchestrator/specs/goal_lane",
              "app/orchestrator/specs/business"):
        try:
            spec = json.load(open(f"{d}/{name}.json"))
            return spec.get("agent_config", {}).get("max_iterations", 25)
        except FileNotFoundError:
            continue
    return None

# If no args: score every goal_lane spec found
targets = sys.argv[1:] or [
    f"goal_lane.{os.path.basename(p)[:-5]}"
    for p in sorted(glob.glob("app/orchestrator/specs/goal_lane/*.json"))
]

print(f"\n{'workflow_id':<48} {'max_iter':>8}  {'est_cost':>9}")
print("-" * 70)

total = 0.0
high = []
for wf in targets:
    iters = load_max_iterations(wf)
    if iters is None:
        print(f"{wf:<48} {'?':>8}  {'(spec not found)':>9}")
        continue
    cost = iters * per_iter_cost()
    total += cost
    if cost > 3.0:
        high.append((wf, cost))
    flag = "  ⚠️ HIGH" if cost > 3.0 else ""
    print(f"{wf:<48} {iters:>8}  ${cost:>8.4f}{flag}")

print("-" * 70)
print(f"{'TOTAL':<48} {'':>8}  ${total:>8.4f}")
print(f"  + quality suite (×2):                          ${total*2:>8.4f}")

print()
if total > 40.0:
    print("🛑 STOP: cost > $40 — confirm with user before proceeding.")
elif total > 20.0:
    print("⚠️  WARNING: cost > $20 — consider running one category at a time.")
elif total > 10.0:
    print("⚠️  Note: moderate cost — recommend running categories sequentially with -x.")
else:
    print("✅ Cost within normal range.")

if high:
    print(f"\nHigh-cost workflows (> $3 each):")
    for wf, c in high:
        print(f"  {wf}: ${c:.4f}")
PY
```

---

## Per-Category Estimates

Category subdirs live under `backend-api/tests/e2e/goal_lane/functional/` and match the `progress.md` categories: `career_toolkit`, `document_analysis`, `data_structuring`, `learning_structuring`, `social_marketing`, `subtitle_studio`, `subtitle_tools`, `video_intelligence`, `visual_simulation`, `compliance_governance`, `job_search`.

Run one category at a time with `-x` to limit waste on the first failure:

```bash
cd "$(git rev-parse --show-toplevel)/backend-api"
poetry run pytest tests/e2e/goal_lane/functional/<category>/ -x
```

The cost of a category is the sum of its workflows' per-run costs (see script above). If a category exceeds $10, drop down to the spec level with `pytest -k <spec_short>`.

---

## Pricing drift checklist

When `max_iterations` changes in a spec JSON, the cost estimate updates automatically — the script reads specs live.

If `LLMUsageTracker` pricing is updated in `tests/e2e/real_aws/conftest.py`, mirror the change here (`INPUT_COST_PER_1M`, `OUTPUT_COST_PER_1M`) and in the matching constants inside `/workflow-test` Phase 2 + `/e2e-debug` Phase 1.
