"""ELUS Memo usage ledger; PostgreSQL only. No prompts, responses or prices stored.

Revision ID: e1u5c0st2026
Revises: c7e2f9a4d1b8
Create Date: 2026-10-26
"""
from collections.abc import Sequence
from alembic import context, op
from hindsight_api.alembic._dialect import run_for_dialect

revision: str = "e1u5c0st2026"
down_revision: str | Sequence[str] | None = "c7e2f9a4d1b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _schema() -> str:
    value = context.config.get_main_option("target_schema")
    if value:
        return '"' + value.replace('"', '""') + '".'
    return ""


def _pg_upgrade() -> None:
    s = _schema()
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS {s}elus_usage_ledger (
            source_request_id uuid PRIMARY KEY,
            bank_id text,
            operation text,
            scope text,
            provider text,
            model text,
            status text NOT NULL,
            occurred_at timestamptz NOT NULL,
            input_tokens integer,
            output_tokens integer,
            cached_tokens integer,
            thoughts_tokens integer,
            recorded_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT elus_usage_ledger_tokens_nonnegative CHECK (
              (input_tokens IS NULL OR input_tokens >= 0) AND
              (output_tokens IS NULL OR output_tokens >= 0) AND
              (cached_tokens IS NULL OR cached_tokens >= 0) AND
              (thoughts_tokens IS NULL OR thoughts_tokens >= 0)
            )
        )
    """)
    op.execute(f"CREATE INDEX IF NOT EXISTS idx_elus_usage_bank_day ON {s}elus_usage_ledger (bank_id, occurred_at DESC)")
    op.execute(f"CREATE INDEX IF NOT EXISTS idx_elus_usage_model_day ON {s}elus_usage_ledger (model, occurred_at DESC)")
    op.execute(f"""
        CREATE OR REPLACE FUNCTION {s}elus_record_usage_ledger() RETURNS trigger AS $$
        BEGIN
          EXECUTE format(
            'INSERT INTO %I.elus_usage_ledger (
              source_request_id, bank_id, operation, scope, provider, model,
              status, occurred_at, input_tokens, output_tokens, cached_tokens, thoughts_tokens
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (source_request_id) DO NOTHING', TG_TABLE_SCHEMA
          ) USING NEW.id, NEW.bank_id, NEW.operation, NEW.scope,
              NEW.provider, NEW.model, NEW.status, NEW.started_at,
              NEW.input_tokens, NEW.output_tokens, NEW.cached_tokens, NEW.thoughts_tokens;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute(f"DROP TRIGGER IF EXISTS trg_elus_usage_ledger_insert ON {s}llm_requests")
    op.execute(f"""CREATE TRIGGER trg_elus_usage_ledger_insert
         AFTER INSERT ON {s}llm_requests FOR EACH ROW
         EXECUTE FUNCTION {s}elus_record_usage_ledger()""")


def _pg_downgrade() -> None:
    s = _schema()
    # Stop capture, but do not delete financial history.
    # Rollback of the Alembic marker must never destroy retained events.
    op.execute(f"DROP TRIGGER IF EXISTS trg_elus_usage_ledger_insert ON {s}llm_requests")
    op.execute(f"DROP FUNCTION IF EXISTS {s}elus_record_usage_ledger()")


def upgrade() -> None:
    run_for_dialect(pg=_pg_upgrade)


def downgrade() -> None:
    run_for_dialect(pg=_pg_downgrade)
