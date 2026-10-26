"""Execute the actual Alembic revision against isolated PostgreSQL.

No Hindsight production import or credentials; stub only op and dialect dispatch.
"""
import importlib.util
import os
import sys
import types
from pathlib import Path
import psycopg2

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "hindsight-api-slim/hindsight_api/alembic/versions/e1u5c0st2026_elus_usage_ledger.py"
DB = os.environ.get("LEDGER_TEST_DATABASE_URL", "postgresql://postgres:test-only@127.0.0.1:5432/usage_ledger_test")


def main():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA alembic_gate")
        cur.execute("""CREATE TABLE alembic_gate.llm_requests (
            id uuid PRIMARY KEY, bank_id text, operation text, scope text,
            provider text, model text, status text NOT NULL,
            started_at timestamptz NOT NULL DEFAULT now(),
            input_tokens integer, output_tokens integer, cached_tokens integer,
            thoughts_tokens integer)""")
        conn.commit()

    class Ops:
        @staticmethod
        def execute(sql):
            with conn.cursor() as c:
                c.execute(sql)

    context = types.SimpleNamespace(config=types.SimpleNamespace(
        get_main_option=lambda key: "alembic_gate" if key == "target_schema" else None))
    sys.modules["alembic"] = types.SimpleNamespace(context=context, op=Ops)
    sys.modules["hindsight_api"] = types.ModuleType("hindsight_api")
    sys.modules["hindsight_api.alembic"] = types.ModuleType("hindsight_api.alembic")
    dialect = types.ModuleType("hindsight_api.alembic._dialect")
    dialect.run_for_dialect = lambda **kwargs: kwargs["pg"]()
    sys.modules["hindsight_api.alembic._dialect"] = dialect
    spec = importlib.util.spec_from_file_location("ledger_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "c7e2f9a4d1b8"
    module.upgrade()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO alembic_gate.llm_requests
          (id,bank_id,status,started_at) VALUES
          ('55555555-5555-4555-8555-555555555555','bank-z','success','2026-10-26T00:00:00Z')""")
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM alembic_gate.elus_usage_ledger")
        assert cur.fetchone()[0] == 1
    module.downgrade()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM alembic_gate.elus_usage_ledger")
        assert cur.fetchone()[0] == 1, "downgrade lost financial records"
    module.upgrade()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM alembic_gate.elus_usage_ledger")
        assert cur.fetchone()[0] == 1, "reupgrade lost financial records"
    conn.close()
    print("Alembic revision isolated upgrade/downgrade/reupgrade: GREEN")


if __name__ == "__main__":
    main()
