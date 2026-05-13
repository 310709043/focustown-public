---
name: unit-testing
description: Unit testing strategy for this repo — four mandatory categories (logic / boundary / error / object-state), AAA structure, one-assertion-per-test, mock discipline, no-network/no-real-AWS isolation. Apply when writing or modifying ANY unit test (`tests/unit/**/test_*.py` or `**/*.test.ts(x)`). Source of truth for the test author checklist.
---

# Unit Testing Strategy

Tests must be designed around **what is being verified**, not around the function or class name. For every new or modified test, the author must be able to state exactly which check category it belongs to and why the chosen input falls into that category.

## The Four Mandatory Categories

Every new or modified unit test must confirm coverage in **each applicable category** below. A category may be skipped only if you can articulate why it does not apply.

### 1. Logic Check

- Given correct, expected input, does the code perform the **right computation** along the **right path**?
- Every branch (`if` / `elif` / `else` / `match` / `switch` / early return) must have a test that walks through it.
- Compound conditions (AND / OR) must be covered by input pairs that flip the overall boolean.
- For pure functions, prefer parametrized / table-driven "known input → known output" cases — one row per case.

### 2. Boundary Check

For every input parameter, cover at least three classes:

| Class | Meaning | Example (expected `int` in 3..7) |
|-------|---------|----------------------------------|
| **Typical** | Mid-range, clearly valid | `5` |
| **Edge** | Exactly on the boundary | `3`, `7` |
| **Invalid** | Out of range, wrong type, empty, too long, too large | `2`, `8`, `-1`, `None`, `"foo"` |

Other common boundaries: empty collections (`[]` / `{}` / `""`), single-element, min / max numerics, Unicode and locale variants (this repo runs en / zh / ja / ko), timezone boundaries (UTC vs local), float precision, off-by-one.

### 3. Error Handling

- For invalid input and external failures (network / DB / LLM / S3 / DynamoDB), does the code respond in a **defined** way?
  - Raise a specific exception class (not a generic `Exception`).
  - Return a specific error result / discriminated union.
  - Never swallow the error or print and continue.
- Every `raise` / `throw` path must have a test that triggers it and asserts the message or error code (not just "something was raised").
- Never use "no exception was raised" as the success criterion — error-handling tests must assert the error itself.
- Retry / timeout / circuit-breaker tests must assert the call count and the termination condition, not only the final result.

### 4. Object State Check

If the code under test mutates any **persistent object** (DB row, DynamoDB item, S3 object, Redux / TanStack Query cache, LangGraph `state`, checkpoint), the test must:

1. Read state before the action (baseline).
2. Run the action.
3. Read state again and assert **every field that was supposed to change** has its new value.
4. Assert **fields that should NOT have changed are unchanged** — guards against accidental side-effects and broken immutability.

Particularly important in this repo: every merge into `GoalAgentState`, `MultiAgentEnvelope.specialist_results`, `handoff_history`, `exception_queue`, and `domain_envelopes` must be tested this way — reducer bugs poison every downstream step silently.

## Best Practices

### Use a real test framework — never roll your own

Hand-rolling assertion scaffolds for each module is wasted work; every mainstream language has a mature framework. The only valid choices in this repo:

| Language / location | Framework | Helpers |
|---------------------|-----------|---------|
| Backend Python (`backend-api/`, `mcp_server/*/`) | **pytest** (NOT `unittest`) | `pytest-asyncio`, `pytest.mark.parametrize`, `pytest-mock`, `moto` (in-memory AWS), `freezegun` (time) |
| Frontend TS/TSX (`frontend-web/`) | **Jest** | `@testing-library/react`, `jest.useFakeTimers`, MSW (network mocks) |

Do not invent assertion helpers, do not write a custom test runner, do not put ad-hoc tests in `if __name__ == "__main__"`. Tests for new features must live where the framework auto-discovers them (`tests/unit/**/test_*.py`, `**/*.test.ts(x)`); CI cannot see anything else.

### Automate test execution at multiple trigger points

Tests must fire automatically at **multiple events** — relying on humans to remember will fail eventually:

- **Pre-commit hook** (`.pre-commit-config.yaml`) — already runs `ruff / black / pyright` on backend, `prettier / eslint / tsc` on frontend. The affected tests must pass here (fail → fix → re-stage → re-commit; **never `--no-verify`**).
- **Push to `develop`** — triggers `Backend CI` plus frontend lint/type/test. Last automatic gate before merge. Red here = fix it; do not patch CI to bypass.
- **Before release / deploy** — PRs into `main` need green CI before `backend-deploy.yml` / `mcp-deploy.yml` will run on the develop push (see CI/CD section in `CLAUDE.md`).
- **Scheduled full runs** (TODO) — flaky tests and environment drift only show up in the parts no one has touched in a while. If a nightly schedule workflow lands, run all of `tests/unit/`.

When writing a test, ask: "Which of these triggers will actually run it?" If the answer is none, the configuration is wrong — fix the configuration before merging the test.

### One Assertion per Test

Each unit test should produce exactly **one** true/false outcome. Stacking multiple assertions hides which one failed and short-circuits later asserts after the first failure.

Rules:

- One `test_xxx` / `it(...)` corresponds to **one behavioural claim** + **one `assert` / `expect`**.
- Naming: `test_<subject>_<scenario>_<expected_behavior>` or `it("<subject> <should|returns|raises> ... when ...")`. The name itself states the single outcome.
- Different inputs producing different outcomes → use `pytest.mark.parametrize` / `it.each` to split into N tests; **never** stack assertions inside a `for` loop.
- Verifying multiple fields of one object → collapse into a **single structural comparison** (`assert result == expected_dict` / `expect(obj).toEqual(expected)`), so the entire pass/fail is one outcome — not five lines of `assert result.a == ...` / `assert result.b == ...`.
- Exception verification: `with pytest.raises(MyError, match="..."):` / `expect(() => ...).toThrow(MyError)` is itself one assertion.

### AAA Structure

Each test is **Arrange / Act / Assert** with blank lines between them. Setup must not bleed into the assertion section. Combined with one-assertion-per-test, the `Assert` section is one line.

### Determinism and Isolation

- **No network, no real AWS, no wall-clock, no unseeded randomness.** Mock or inject anything that can cause flakes. Use `freezegun` / `jest.useFakeTimers` for time and seed all randomness.
- Unit tests use Moto / in-memory backings, **not** LocalStack and **not** real AWS — those are integration / E2E tiers (see the three-tier table in `CLAUDE.md`).
- Every test must run independently and in any order. All shared state is reset in fixture teardown.

### Test Public Contracts, Not Implementation Details

- Test return values, persistent side-effects, emitted events, raised exceptions — those are the contract.
- Do NOT test private methods, do NOT assert intermediate variable shapes, do NOT assert call **order** on mocks unless the order is itself part of the contract.
- A refactor that changes implementation but preserves behaviour should leave tests passing. If they break, the test was probably testing the wrong layer.

### Mock Discipline

- Mocks isolate external boundaries (network, AWS, LLM, DB). Do not mock pure functions you wrote.
- More than three mocks in one test → the unit under test is too large; split it before adding more mocks.
- Mock return values must match the real API shape (use recorded fixtures or Pydantic factories), not handwritten fakes.

### Coverage Is a Signal, Not a Goal

- Target ≥ 80% line, ≥ 70% branch coverage on new / modified modules — but having all four categories (logic / boundary / error / object-state) covered matters more than the number.
- 100% line coverage with zero boundary tests = false confidence. 75% with all four categories is preferable.

### Write Tests From the Start — Never "Add Them Later"

The three excuses for skipping tests — prototype, small scope, deadline — accumulate into tech debt: once code lands without tests, no one comes back to add them; refactors lack a safety net and break silently; new joiners copy the pattern and assume "this area doesn't need tests".

This repo's stance: **new modules / new specialists / new processors / new API routes / new spec validation logic must include tests in the same commit or PR**, not "ship code now, tests next sprint". Tier D and later additions (agents, prompt packs, eval harness) follow the same rule.

The single exception: a **research spike or throwaway prototype**. Such code must be marked `SPIKE, not production-bound` in the commit message or PR description and must NOT merge into the `develop` production path.

Unit-test-only commands (no LocalStack, no real AWS):

```bash
# Backend
poetry run pytest tests/unit/ -v
poetry run pytest tests/unit/path/test_file.py::test_name -v   # single case

# Frontend
pnpm test                  # all
npx jest <pattern>         # single file (NOT `npm test -- --testPathPattern`)
```

`tests/integration/` and `tests/e2e/` are out of scope here — they have separate cost and infrastructure (see the Local environment section in `CLAUDE.md`).

## Author Checklist (before commit)

After writing or modifying tests:

- [ ] Every changed branch has a test that walks through it
- [ ] Every parameter has typical + edge + invalid coverage (annotate when N/A)
- [ ] Every `raise` / `throw` path has a test that asserts the specific exception class or error code
- [ ] Every persistent object touched (DB / envelope / state / cache) has assertions for both changed and unchanged fields
- [ ] Each test contains exactly **one** assertion (collapse multi-field checks into a structural compare, not stacked `assert` lines)
- [ ] The test name describes the single outcome being verified without needing to read the body
- [ ] No network / real AWS / unseeded randomness / unfrozen clock
- [ ] Tests run independently and in any order
- [ ] Tests are auto-discovered (path + naming match pytest / Jest conventions) and fire on pre-commit or CI
