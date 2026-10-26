"""Full Alembic base-to-head smoke on ephemeral PG; never stamp a predecessor.

Unlike the ledger-only gates, this tests the entire Hindsight migration graph.
It is intentionally a hard gate: missing production extensions are failures
that require an explicit compatible CI database, not mock schema patches.
"""
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

DB = "postgresql://postgres:test-only@127.0.0.1:5432/usage_ledger_test"
SCHEMA = "alembic_full_chain"

def main():
    cfg = Config()
    cfg.set_main_option("script_location", "hindsight-api-slim/hindsight_api/alembic")
    cfg.set_main_option("sqlalchemy.url", DB)
    cfg.set_main_option("target_schema", SCHEMA)
    command.upgrade(cfg, "head")
    engine = create_engine(DB)
    with engine.connect() as conn:
        version = conn.execute(text(f'SELECT version_num FROM "{SCHEMA}".alembic_version')).scalar_one()
        assert version == "e1u5c0st2026", version
        assert conn.execute(text(f"""SELECT count(*) FROM information_schema.tables
            WHERE table_schema = '{SCHEMA}' AND table_name = 'llm_requests'""")).scalar_one() == 1
        assert conn.execute(text(f"""SELECT count(*) FROM information_schema.tables
            WHERE table_schema = '{SCHEMA}' AND table_name = 'elus_usage_ledger'""")).scalar_one() == 1
    print("Full base-to-head Alembic: GREEN")

if __name__ == "__main__":
    main()
