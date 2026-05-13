# Planning Discipline

AI-assisted development should not mechanically walk through a pre-agreed task breakdown. When a high-impact, structural issue surfaces mid-execution, it must be prioritized — otherwise wrong abstractions and tech debt compound across every subsequent iteration.

## Core Principle

A task breakdown is a *hypothesis* about the cheapest path to the goal. Once reality contradicts that hypothesis, continuing to execute the list pays amplified cost on every remaining step. When this happens, **structural correction outranks on-schedule execution**.

This is about plan-level discipline — code-level rules live in `coding-style.md`; branch-level rules live in `git-workflow.md`.

## Signals That Justify Interrupting the Plan (high-impact + structural)

- A shared abstraction is being duplicated across two or more call sites **within** the current tier
- A seam is being added now that a later tier will immediately remove
- The current task depends on a path that has no test coverage, and the plan defers coverage until later
- A naming or contract decision will lock a wrong mental model into downstream consumers
- Work in progress reveals that an earlier-tier assumption was wrong

## Signals That Do NOT Justify Interrupting (non-structural)

- Aesthetic imperfection (a name could be nicer; the existing one works)
- Single-point optimization (a function could be faster; it does not cross an abstraction boundary)
- Personal preference (indentation, import order, comment style)
- Speculative future needs with no concrete consumer

The threshold is **high-impact AND structural**, not *aesthetic*. Under-triggering is a bug; over-triggering dilutes the signal until nobody listens.

## How to Interrupt Correctly

1. **Name the structural issue in one sentence** — before proposing any fix
2. **Estimate amplification cost** — "if we defer, how many downstream tasks or iterations pay extra?"
3. **Propose the minimum intervention** — the narrowest change that stops the amplification; do not use the interruption to expand scope
4. **Surface the trade-off to the user** — state the cost of fixing now vs. deferring; do not execute the correction as a fait accompli

## Anti-patterns

- Continuing to execute the task list while silently logging the structural issue as "tech debt"
- Stopping all work to address the structural issue without applying the minimum-intervention rule
- Letting the interruption grow into a broader refactor — if the fix expands, promote it to its own plan
- Treating every surface imperfection as structural and interrupting constantly

## Scope of Application

- Tier-level architecture plans (any plan file under `.claude/plans/`)
- Multi-commit feature work on any branch
- Any work labeled "refactor", "tier", or "migration"
- Subagent-driven task sequences

## Relationship to Other Rules

- Complements `coding-style.md` (code-level quality) and `git-workflow.md` (branch-level workflow) by covering plan-level discipline
- Extends `agents.md`: when a subagent surfaces a structural issue, the orchestrator must follow the interruption protocol above before spawning more agents
- Does not override `security.md` — security issues follow `security-reviewer` protocol immediately regardless of plan position
- Does not override `git-workflow.md` branch rules — the minimum intervention must still respect develop-only / main-via-PR
