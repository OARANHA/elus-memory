"""Upgrade a genuinely populated predecessor schema; exercise retention and backfill.

Isolated PostgreSQL only. Existing traces are inserted *before* the real
Alembic upgrade so a pre-upgrade populated database cannot be mistaken for a
fresh deployment. No production data is accessed.
"""
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

DB = "postgresql://postgres:test-only@127.0.0.1:5432/usage_ledger_test"
SCHEMA = "alembic_populated_gate"
A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

def check(conn, statement, expected):
    result = conn.execute(text(statement)).scalar_one()
    assert result == expected, (statement, result, expected)

def main():
    engine = create_engine(DB)
    # Simulates a pre-existing tenant at the verified predecessor revision.
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{SCHEMA}"'))
        conn.execute(text(f'''CREATE TABLE "{SCHEMA}".llm_requests (
          id uuid PRIMARY KEY, bank_id text, operation text, scope text,
          provider text, model text, status text NOT NULL,
          started_at timestamptz NOT NULL DEFAULT now(),
          input_tokens integer, output_tokens integer, cached_tokens integer,
          thoughts_tokens integer)'''))
        conn.execute(text(f"""INSERT INTO "{SCHEMA}".llm_requests
            (id,bank_id,operation,provider,model,status,started_at,input_tokens)
            VALUES
            ('{A}','bank-a','retain','openai','model-a','success','2026-10-01T11:00:00Z',100),
            ('{B}','bank-b','reflect','openai','model-b','success','2026-10-01T12:00:00Z',200)"""))
    cfg = Config()
    cfg.set_main_option("script_location", "hindsight-api-slim/hindsight_api/alembic")
    cfg.set_main_option("sqlalchemy.url", DB)
    cfg.set_main_option("target_schema", SCHEMA)
    command.stamp(cfg, "c7e2f9a4d1b8")
    command.upgrade(cfg, "head")
    with engine.begin() as conn:
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".llm_requests', 2)
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 0)
        # Backfill older rows; second replay must be a no-op.
        for _ in range(2):
            conn.execute(text(f'''INSERT INTO "{SCHEMA}".elus_usage_ledger (
              source_request_id,bank_id,operation,scope,provider,model,status,occurred_at,
              input_tokens,output_tokens,cached_tokens,thoughts_tokens)
              SELECT id,bank_id,operation,scope,provider,model,status,started_at,
                input_tokens,output_tokens,cached_tokens,thoughts_tokens
              FROM "{SCHEMA}".llm_requests
              ON CONFLICT(source_request_id) DO NOTHING'''))
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 2)
        conn.execute(text(f"""INSERT INTO "{SCHEMA}".llm_requests
            (id,bank_id,status,input_tokens) VALUES ('{C}','bank-b','success',50)"""))
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 3)
        conn.execute(text(f'DELETE FROM "{SCHEMA}".llm_requests'))
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 3)
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger WHERE bank_id=\'bank-a\'', 1)
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger WHERE bank_id=\'bank-b\'', 2)
    command.downgrade(cfg, "c7e2f9a4d1b8")
    with engine.connect() as conn:
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 3)
    command.upgrade(cfg, "head")
    with engine.connect() as conn:
        check(conn, f'SELECT count(*) FROM "{SCHEMA}".elus_usage_ledger', 3)
    print("Populated predecessor upgrade/backfill/replay/retention/downgrade: GREEN")

if __name__ == "__main__":
    main()
