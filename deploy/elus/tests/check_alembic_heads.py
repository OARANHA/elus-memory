"""Read revision graph without importing Hindsight or a live database."""
import ast
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[3] / "hindsight-api-slim/hindsight_api/alembic/versions"


def parse_revisions(root: Path = VERSIONS) -> tuple[dict[str, Path], set[str]]:
    revisions: dict[str, Path] = {}
    dependencies: set[str] = set()
    for path in sorted(root.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        fields = {}
        for stmt in tree.body:
            if isinstance(stmt, (ast.Assign, ast.AnnAssign)):
                value = stmt.value
                if value is None:
                    continue
                targets = stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]
                for target in targets:
                    if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                        try:
                            fields[target.id] = ast.literal_eval(value)
                        except (ValueError, TypeError):
                            pass
        revision = fields.get("revision")
        if not isinstance(revision, str):
            raise ValueError(f"Missing literal revision: {path.name}")
        if revision in revisions:
            raise ValueError(f"Duplicate revision {revision}: {path.name}")
        revisions[revision] = path
        parents = fields.get("down_revision")
        if parents is None:
            continue
        if isinstance(parents, str):
            dependencies.add(parents)
        elif isinstance(parents, (tuple, list)) and all(isinstance(p, str) for p in parents):
            dependencies.update(parents)
        else:
            raise ValueError(f"Invalid down_revision: {path.name}")
    missing = dependencies.difference(revisions)
    if missing:
        raise ValueError(f"Unresolved migration parents: {sorted(missing)}")
    return revisions, dependencies


if __name__ == "__main__":
    revisions, dependencies = parse_revisions()
    heads = sorted(set(revisions).difference(dependencies))
    print(f"Revisions: {len(revisions)}")
    print(f"Alembic heads: {heads}")
    if len(heads) != 1:
        raise SystemExit("Expected exactly one Alembic head; reconcile first.")
