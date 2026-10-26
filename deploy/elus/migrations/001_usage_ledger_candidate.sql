-- ELUS Memo metering: candidate migration, NOT YET EXECUTED.
-- Apply independently per authorized tenant schema after Alembic head reconciliation.
-- Transactional INSERT trigger ensures only successfully committed traces are counted.
BEGIN;
CREATE TABLE IF NOT EXISTS elus_usage_ledger (
  source_request_id uuid PRIMARY KEY, -- NO foreign key: original traces may expire
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
);
CREATE INDEX IF NOT EXISTS idx_elus_usage_bank_day ON elus_usage_ledger (bank_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_elus_usage_model_day ON elus_usage_ledger (model, occurred_at DESC);
CREATE OR REPLACE FUNCTION elus_record_usage_ledger() RETURNS trigger AS $$
BEGIN
  -- Resolve the ledger from the *source table's actual schema*; a pooled
  -- connection's search_path must never redirect one tenant's consumption
  -- into another tenant's ledger.
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
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_elus_usage_ledger_insert ON llm_requests;
CREATE TRIGGER trg_elus_usage_ledger_insert
AFTER INSERT ON llm_requests FOR EACH ROW EXECUTE FUNCTION elus_record_usage_ledger();
COMMIT;
