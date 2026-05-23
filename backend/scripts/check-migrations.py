#!/usr/bin/env python3
"""Migration reversibility linter — fails CI when a migration is unsafe.

Walks every ``backend/alembic/versions/*.py`` and rejects:

* missing ``upgrade()``;
* missing ``downgrade()``;
* a ``downgrade()`` body that is only ``pass`` / docstring / ellipsis
  (fake reversibility — a "downgrade" that drops nothing is not a
  downgrade).

The linter intentionally does NOT execute the migration code — it only
AST-parses, so it is safe to run in any environment (no DB needed).

Run manually:

    python backend/scripts/check-migrations.py

Wired into ``.github/workflows/backend.yml`` so a PR that adds an
unsafe migration fails before the test step ever boots a DB.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_BACKEND = Path(__file__).resolve().parent.parent
DEFAULT_MIGRATIONS_DIR = REPO_BACKEND / "alembic" / "versions"


def _is_merge_migration(tree: ast.Module) -> bool:
    """True if the module declares ``down_revision`` as a tuple/list.

    Merge migrations exist purely to reconcile parallel heads — they
    have no schema change and ``pass`` bodies are correct. Don't flag
    them as fake reversibility. (Alembic itself generates them with
    empty bodies via ``alembic merge``.)
    """
    for node in tree.body:
        if not isinstance(node, ast.AnnAssign | ast.Assign):
            continue
        target_names: list[str] = []
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            target_names.append(node.target.id)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    target_names.append(t.id)
        if "down_revision" not in target_names:
            continue
        value = node.value
        if isinstance(value, ast.Tuple | ast.List):
            return True
    return False


def _has_real_body(func: ast.FunctionDef) -> bool:
    """True if ``func``'s body is more than docstring / pass / ellipsis.

    A body of literally just ``pass`` or ``...`` is the AST signal of an
    unfinished migration; both are common copy-paste artefacts and both
    leave the schema un-reversible. A trailing docstring is fine if
    followed by real statements.
    """
    body = list(func.body)
    # Strip a leading docstring expression if present.
    if (
        body
        and isinstance(body[0], ast.Expr)
        and isinstance(body[0].value, ast.Constant)
        and isinstance(body[0].value.value, str)
    ):
        body = body[1:]
    if not body:
        return False
    # All remaining statements must NOT be trivial.
    for stmt in body:
        if isinstance(stmt, ast.Pass):
            continue
        if (
            isinstance(stmt, ast.Expr)
            and isinstance(stmt.value, ast.Constant)
            and stmt.value.value is Ellipsis
        ):
            continue
        # Any other statement counts as real work.
        return True
    return False


def check_file(path: Path) -> list[str]:
    """Return a list of human-readable problems for one migration file."""
    src = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(src, filename=str(path))
    except SyntaxError as exc:
        return [f"{path.name}: syntax error: {exc.msg} (line {exc.lineno})"]

    funcs: dict[str, ast.FunctionDef] = {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
    }

    problems: list[str] = []
    if "upgrade" not in funcs:
        problems.append(f"{path.name}: missing upgrade() function")
    if "downgrade" not in funcs:
        problems.append(f"{path.name}: missing downgrade() function")

    # Merge migrations legitimately have empty bodies; skip the body
    # check for them but still require both functions to be present
    # (Alembic's ``merge`` template emits them as ``pass``).
    if _is_merge_migration(tree):
        return problems

    if "upgrade" in funcs and not _has_real_body(funcs["upgrade"]):
        problems.append(
            f"{path.name}: upgrade() body is empty / only pass / only docstring"
        )
    if "downgrade" in funcs and not _has_real_body(funcs["downgrade"]):
        problems.append(
            f"{path.name}: downgrade() body is empty / only pass / only docstring"
        )
    return problems


def main(migrations_dir: Path = DEFAULT_MIGRATIONS_DIR) -> int:
    if not migrations_dir.is_dir():
        print(f"migrations dir not found: {migrations_dir}", file=sys.stderr)
        return 1

    paths = sorted(
        p for p in migrations_dir.glob("*.py") if p.name != "__init__.py"
    )
    if not paths:
        print(f"no migrations found in {migrations_dir}", file=sys.stderr)
        return 1

    problems: list[str] = []
    for path in paths:
        problems.extend(check_file(path))

    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        print(f"\n{len(problems)} migration problem(s) found.", file=sys.stderr)
        return 1

    print(f"migrations ok — {len(paths)} files checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
