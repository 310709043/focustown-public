---
name: regression-test
description: Frame any prompt / pipeline / agent / model / retriever change as a regression test, not a smoke test. Provides the 8-point LLM-eval framework (fixed eval set, real-usage cases, per-case pass criteria, tiered grading, baseline-vs-candidate, CI gate, trajectory eval, production feedback loop) and the industry references behind it. Invoke when designing how to verify that a change does not regress quality / safety / cost. Output is a written eval plan — not harness code.
---

# Regression-test mental model — what "verify a change" should mean

Generative output is variable. One-shot manual testing systematically misses regressions. The industry has converged on a pattern: **fixed eval dataset + tiered graders + baseline-vs-candidate + CI gate + production feedback loop**. This skill captures that pattern as the project's doctrine for verifying any prompt / pipeline / agent change.

This skill does **not** run evals — it tells you how to design one. The output of an invocation is a written plan that names: the eval cases, the graders, the baseline, the gate threshold, and the production-feedback path for one specific change.

---

## When to invoke

Design moments — **before** you change a prompt, model, retriever, ranker, tool schema, agent loop, or RAG pipeline. The question is always:

> "If I change this, how will I know I haven't regressed quality, safety, groundedness, tool-trajectory, or cost?"

If the answer is "I'll eyeball a few examples", invoke this skill and produce a real plan instead.

This skill is **not** a per-PR command. It runs at design time. Per-PR enforcement lives in the harness + CI gate the plan recommends.

---

## The 8 principles

### 1. Build a fixed regression eval set

Don't rely on improvised "let me try a few prompts". Maintain a versioned dataset:

```
eval_cases/
  customer_support.jsonl
  safety_edge_cases.jsonl
  rag_grounding_cases.jsonl
  tool_calling_cases.jsonl
  formatting_cases.jsonl
```

Run the same set on every change. Without a fixed set, you cannot tell whether a new version is better or worse — only whichever cases you happened to think of that day.

### 2. Cases come from real usage, not toy demos

The regressions that matter happen on messy edge cases, not the demo prompt that worked the first time. Sources, in priority order:

1. **Production logs** — sanitize PII, anonymize proprietary data, sample.
2. **Human-review failures** — every thumbs-down or QA-failure becomes a case.
3. **Past incidents** — anything that broke once must never break silently again.
4. **Synthetic edge cases** — long inputs, malformed inputs, adversarial inputs, locale variants.

A toy-only dataset gives a false confidence signal.

### 3. Per-case pass criteria — every case has a verifier

A case without a verifier is a wish, not a test. Minimum schema:

```json
{
  "input": "...",
  "expected_behavior": "must mention refund deadline, must not invent policy",
  "must_include": ["30 days", "original receipt"],
  "must_not_include": ["lifetime warranty"],
  "metric": ["groundedness", "instruction_following", "safety"]
}
```

The verifier can be a deterministic check, a reference-based metric, or an LLM-judge — but it must exist, and it must be specific. "Looks good" is not a verifier.

### 4. Tiered grading — deterministic first, LLM-judge last

Use the cheapest grader that can answer the question:

```
JSON schema / regex / exact match
  → reference-based metrics (BLEU, ROUGE, embedding similarity)
  → rule-based checks (must_include / must_not_include / format)
  → LLM-as-judge
  → human review (sampled)
```

Concrete mapping:

| What you test | Best grader |
|---|---|
| JSON output is well-formed | JSON schema validation |
| Correct tool was called | Trace assertion against tool-call log |
| Answer is grounded in retrieved context | Groundedness check (deterministic if reference exists, judge if not) |
| Reply is helpful | LLM-judge + sampled human audit |
| No PII / unsafe content leaked | Safety classifier + rule + judge |
| RAG answer matches source | Answer-vs-retrieved-context judge |

If a deterministic grader can answer the question, **don't reach for an LLM-judge** — it's slower, more expensive, and noisier.

### 5. Baseline vs candidate — score delta is the signal

Regression isn't "new version fails"; it's "new version is worse than what we had". Always run:

```
baseline (prompt v1, model A, retriever old)
candidate (prompt v2, model B, retriever new)
same eval dataset
compare per-metric delta
block merge if delta below threshold
```

Without a baseline, you have a quality measurement, not a regression test.

### 6. CI/CD regression gate — make eval part of merge

The point of all this is to **stop bad changes from shipping**. Tier the gate:

- **PR-time smoke**: 20–50 cases, fast (≤5 min). Must pass to merge.
- **Nightly full sweep**: 500–5000 cases, slow. Compares against rolling baseline; surfaces drift even when no PR ran.

Anything less and the eval set is decoration.

### 7. Trajectory + final-answer evaluation

For agents and RAG pipelines, the final answer can look fine while the path was wrong (called the wrong tool, leaked private data into an external API, did expensive duplicate work). Evaluate **both** the final response and the trajectory:

- Did the agent retrieve before answering?
- Did it call any tool it shouldn't have?
- Did it pass private data to an external tool call?
- Did it respect the expected tool sequence?
- Did it answer when it had no context (it shouldn't)?

The trajectory is what your logs/traces capture. Without trajectory eval, you only catch surface failures.

### 8. Production feedback loop

Eval is never done at design time. Ship the loop:

```
production incident / user thumbs-down / human review failure
  → sanitize proprietary data
  → add to eval dataset
  → reproduce failure
  → fix prompt / pipeline / model
  → keep as permanent regression case
```

Real failure cases beat synthetic ones every time. The dataset grows monotonically.

---

## Industry references

The 8 principles are not invented here — they're the convergent best practice across the major AI platforms.

- **OpenAI** — *Evaluation best practices* and the Evals API position evals as the way to test production AI; the cookbook *Detecting prompt regressions* maps directly to principle 5.
- **Anthropic** — *Demystifying evals for AI agents* (input + grading logic, automated, no real users needed) and *Writing effective tools for AI agents* (every evaluation prompt needs a verifiable outcome — principle 3).
- **Google Cloud Vertex AI Gen AI Evaluation** — supports rubric / computation-based / custom-Python metrics; documents production-log sampling (principle 2) and trajectory evaluation for agents (principle 7).
- **Microsoft Azure Prompt Flow / GenAIOps** — automated evaluation as part of the LLMOps deployment pipeline; multi-dataset, multi-flow regression gating (principle 6).
- **NVIDIA NeMo Evaluator** — user-provided datasets + LLM-as-a-judge for proprietary domains where ground truth is fuzzy (principles 1, 4).
- **Meta Llama evaluations guide** — automated + manual evaluation techniques; explicit on the manual-sampling tier (principle 4 last row).

---

## Output format for an invocation

When invoked for a specific change, this skill produces a markdown plan with these sections:

1. **What's changing** — prompt diff, model swap, retriever change, etc.
2. **Eval cases** — list of `eval_cases/<feature>.jsonl` files involved + how many cases each contributes.
3. **Graders by tier** — which checks are deterministic, which are reference-based, which are LLM-judge, which are human-sampled. One line per grader.
4. **Baseline** — the version-pinned reference being compared against.
5. **Gate threshold** — concrete numbers per metric (e.g. "task_success ≥ baseline − 2pp", "safety = baseline", "p95 latency ≤ baseline × 1.1").
6. **Trajectory checks** (if agent / RAG) — expected tool sequence, forbidden tool calls, retrieval-before-answer assertion.
7. **Production feedback hook** — which signal source feeds new cases back (Sentry breadcrumb, audit log, human-review queue).

A plan without all 7 is an incomplete plan. Either fill the missing section or explicitly label it "N/A — <reason>".

---

## Relationship to `/workflow-test`

`/workflow-test` is the per-spec smoke (5 conditions: agent starts / tools fired / audit traceable / artifact produced / manual DOM QA). It satisfies **subset** of this framework at the single-case level — principle 3 (binary pass criteria), principle 4 (deterministic grading for cond 1–4), principle 7 (some trajectory via the tool-invocations audit trail).

It does **not** yet satisfy:

- Principle 1: it runs one synthetic case per spec, not a fixed dataset.
- Principle 2: cases are author-built, not drawn from production logs.
- Principle 5: no baseline-vs-candidate diff — a passing run today and a passing run after a prompt change are not compared.
- Principle 6: not a CI gate; runs ad-hoc against dev AWS.
- Principle 8: production failures are not folded back into the test set automatically.

Closing those gaps is the roadmap this skill governs. Each gap is its own follow-up plan, each its own incremental commit. Today's `/workflow-test` remains valid as a smoke; this skill's existence is what guides how it evolves.

---

## Out of scope

- Authoring `eval_cases/<feature>.jsonl` files. Each is a named follow-up plan.
- Implementing graders / harness code / CI workflow YAML. Each tier is a named follow-up plan.
- Changing `/workflow-test` behaviour. That's owned by the `workflow-test` skill; this skill only sets the framework it aims at.
- Picking specific judge models or per-metric thresholds for a given feature. Those decisions belong in the per-change invocation output, not in this doctrine file.
