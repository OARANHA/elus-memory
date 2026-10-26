"""Alembic command API against a copied logical tenant schema on ephemeral PostgreSQL.

The complete upstream migration chain needs PG extensions and application dependencies;
this gate specifically stamps the verified predecessor head and executes the real
Alembic runtime + production migration env for upgrade/downgrade.
Never point at production.
"""
import os
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

DB = "postgresql://postgres:test-only@127.0.0.1:5432/usage_ledger_test"
SCHEMA = "alembic_real_gate"

def main():
    engine = create_engine(DB)
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
        connection.execute(text(f'''CREATE TABLE IF NOT EXISTS "{SCHEMA}".llm_requests (
            id uuid PRIMARY KEY, bank_id text, operation text, scope text,
            provider text, model text, status text NOT NULL,
            started_at timestamptz NOT NULL DEFAULT now(),
            input_tokens integer, output_tokens integer, cached_tokens integer,
            thoughts_tokens integer)'''))
    config = Config()
    config.set_main_option("script_location", "hindsight-api-slim/hindsight_api/alembic")
    config.set_main_option("sqlalchemy.url", DB)
    config.set_main_option("target_schema", SCHEMA)
    # Database schema snapshot represents predecessor head. Never falsely
    # claim this is a complete base-to-head migration.
    command.stamp(config, "c7e2f9a4d1b8")
    command.upgrade(config, "head")
    with engine.begin() as connection:
        revision = connection.execute(text(f'SELECT version_num FROM "{SCHEMA}".alembic_version')).scalar_one()
        assert revision == "e1u5c0st2026", revision
        connection.execute(text(f"""INSERT INTO "{SCHEMA}".llm_requests
            (id,bank_id,status) VALUES
            ('55555555-5555-4555-8555-555555555555','bank-one','success')"""))
        count = connection.execute(text(f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger')).scalar_one()
        assert count == 1
    command.downgrade(config, "c7e2f9a4d1b8")
    with engine.connect() as connection:
        assert connection.execute(text(f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger')).scalar_one() == 1
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.execute(text(f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger')).scalar_one() == 1
    print("Full Alembic command/env against stamped predecessor: GREEN")

if __name__ == "__main__":
    main()
