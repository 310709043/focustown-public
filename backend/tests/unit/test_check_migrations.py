"""Unit tests for the migration reversibility linter.

The linter is the CI gate that blocks unsafe migrations from landing.
These tests exist because a buggy linter is worse than no linter — it
gives operators false confidence. We exercise the four cases that
actually matter at PR-review time:

* A well-formed migration passes.
* Missing ``downgrade()`` → fail.
* ``downgrade()`` body of literally ``pass`` → fail (the most common
  copy-paste regression).
* Merge migration with empty bodies → pass (Alembic generates these).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_BACKEND = Path(__file__).resolve().parents[2]
LINTER_PATH = REPO_BACKEND / "scripts" / "check-migrations.py"


def _load_linter():
    """Import the linter script under a clean module name.

    The script lives outside the ``app`` package so a plain ``import``
    won't reach it; use importlib to load by path. Cached per session
    in ``sys.modules`` so re-importing in successive tests is cheap.
    """
    mod_name = "_focustown_check_migrations"
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    spec = importlib.util.spec_from_file_location(mod_name, LINTER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


VALID_MIGRATION = """\
\"\"\"valid migration\"\"\"
from alembic import op
import sqlalchemy as sa
revision = "0099"
down_revision = "0098"
def upgrade():
    op.create_table("t", sa.Column("id", sa.Integer(), primary_key=True))
def downgrade():
    op.drop_table("t")
"""

MISSING_DOWNGRADE = """\
\"\"\"bad migration: no downgrade\"\"\"
revision = "0099"
down_revision = "0098"
def upgrade():
    pass
"""

EMPTY_DOWNGRADE = """\
\"\"\"bad migration: downgrade pass\"\"\"
from alembic import op
import sqlalchemy as sa
revision = "0099"
down_revision = "0098"
def upgrade():
    op.create_table("t", sa.Column("id", sa.Integer(), primary_key=True))
def downgrade():
    pass
"""

MERGE_MIGRATION = """\
\"\"\"merge two heads\"\"\"
revision = "0099"
down_revision = ("0098a", "0098b")
def upgrade():
    pass
def downgrade():
    pass
"""


@pytest.fixture
def migrations_dir(tmp_path: Path) -> Path:
    d = tmp_path / "versions"
    d.mkdir()
    return d


def test_valid_migration_passes(migrations_dir: Path) -> None:
    (migrations_dir / "0099_valid.py").write_text(VALID_MIGRATION)
    linter = _load_linter()
    assert linter.main(migrations_dir) == 0


def test_missing_downgrade_fails(migrations_dir: Path, capsys) -> None:
    (migrations_dir / "0099_bad.py").write_text(MISSING_DOWNGRADE)
    linter = _load_linter()
    assert linter.main(migrations_dir) == 1
    err = capsys.readouterr().err
    assert "missing downgrade()" in err


def test_empty_downgrade_pass_fails(migrations_dir: Path, capsys) -> None:
    (migrations_dir / "0099_bad.py").write_text(EMPTY_DOWNGRADE)
    linter = _load_linter()
    assert linter.main(migrations_dir) == 1
    err = capsys.readouterr().err
    assert "downgrade()" in err and "only pass" in err


def test_merge_migration_with_pass_body_passes(migrations_dir: Path) -> None:
    """Alembic emits merge migrations with empty bodies; don't flag them."""
    (migrations_dir / "0099_merge.py").write_text(MERGE_MIGRATION)
    linter = _load_linter()
    assert linter.main(migrations_dir) == 0


def test_repo_migrations_pass() -> None:
    """The current repo's migrations must satisfy the linter — otherwise
    CI would fail on every PR. Doubles as a regression test for the
    linter itself: any future migration that breaks reversibility
    fails this case before fail-ing the workflow."""
    linter = _load_linter()
    assert linter.main(REPO_BACKEND / "alembic" / "versions") == 0
