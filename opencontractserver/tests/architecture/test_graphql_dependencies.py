"""Prevent the removed schema frameworks from returning via runtime or tests."""

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REMOVED = {"graphene", "graphene_django", "graphql_relay", "graphql_jwt"}


def test_no_imports_of_removed_graphql_dependencies():
    violations = []
    for directory in ("config", "opencontractserver", "scripts"):
        for path in (ROOT / directory).rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if isinstance(node, ast.ImportFrom):
                    modules = [node.module or ""]
                elif isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                else:
                    continue
                for module in modules:
                    if module.split(".")[0] in REMOVED:
                        violations.append(f"{path.relative_to(ROOT)}:{node.lineno}")
    assert not violations, violations


def test_served_schema_does_not_load_removed_frameworks():
    from config.graphql.schema import schema

    assert schema.query is not None
    assert not REMOVED.intersection(name.split(".")[0] for name in sys.modules)


def test_validation_extensions_are_fresh_for_each_request():
    from strawberry.extensions import AddValidationRules

    from config.graphql.schema import schema
    from config.graphql.security import DepthLimitValidationRule

    first = schema.get_extensions(sync=True)
    second = schema.get_extensions(sync=True)
    validation = next(ext for ext in first if isinstance(ext, AddValidationRules))
    assert DepthLimitValidationRule in validation.validation_rules
    assert all(left is not right for left, right in zip(first, second, strict=True))


def test_dependency_manifests_do_not_reintroduce_removed_packages():
    import re

    paths = [*ROOT.glob("requirements/**/*.txt"), ROOT / ".pre-commit-config.yaml"]
    for path in paths:
        for line in path.read_text().splitlines():
            requirement = line.split("#", 1)[0].strip().lstrip("- ")
            name = re.split(r"[<>=!~\[;\s]", requirement)[0].replace("-", "_")
            assert name not in REMOVED | {"django_graphql_jwt"}, (path, line)
