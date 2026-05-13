# Git Workflow Rules

## Branch Strategy (CRITICAL)

- **`develop`** — active development branch; all work merges here
- **`main`** — production branch; NEVER push or deploy directly

## Hard Rules

1. **No direct pushes to `develop` or `main`.** All changes land via PR.
2. **`develop` → `main` ONLY via Pull Request** — no direct merges, no force pushes.
3. **Feature / refactor branches → `develop` ONLY via Pull Request.** No `git merge --no-ff`
   into local `develop`; the reviewer merges via `gh pr merge` after CI is green.
4. **Never run `gh workflow run` without `--ref develop`** — omitting `--ref` defaults to `main`.
5. **Never trigger deploys targeting `main`** unless explicitly asked by the user after a PR merge.

## Correct Commands

```bash
# Open a PR for any feature / refactor branch
gh pr create --base develop --head <branch>

# Open a PR for develop → main
gh pr create --base main --head develop

# Trigger workflow on develop (always specify --ref)
gh workflow run backend-deploy.yml --ref develop -f environment=dev -f image_tag=<sha>
gh workflow run mcp-deploy.yml --ref develop -f environment=dev
```

## Environment Mapping

| Branch | Environment |
|--------|-------------|
| `develop` | dev |
| `main` | prod |

## CI exhaustion fallback (admin override)

When GitHub Actions billing is exhausted and PR checks return `FAILURE` in <2 seconds
without real execution, the PR cannot be merged through normal branch-protection rules.
In that case:

1. Run `scripts/ci-local/run-ci.ps1 -PrNumber <N> -RunDeploy` locally with sufficient
   rigor (lint / typecheck / unit / cdk-synth / 4 security scans + AWS dev deploy).
2. Post the resulting `summary.md` to the PR via
   `scripts/ci-local/comment/post-pr-evidence.ps1 -RunDir .ci-local/<RunId> -PrNumber <N>`.
3. Tag the comment with **`Local CICD Evidence`** as the heading so reviewers can
   distinguish it from drive-by comments.
4. Reviewer verifies the artifacts under `.ci-local/<RunId>/` (gitignored — they live on
   the runner's machine) before using `gh pr merge` with admin override.

This path is for billing-exhaustion only. Normal merges always wait for green GH checks.
