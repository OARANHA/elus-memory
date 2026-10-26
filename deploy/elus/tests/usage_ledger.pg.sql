\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE llm_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_id text, operation text, scope text,
 provider text, model text, status text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 input_tokens integer, output_tokens integer, cached_tokens integer, thoughts_tokens integer
);
\ir ../migrations/001_usage_ledger_candidate.sql
-- A committed trace yields exactly one metering record.
INSERT INTO llm_requests(id, bank_id, operation, provider, model, status, input_tokens,
 output_tokens, started_at)
VALUES ('11111111-1111-4111-8111-111111111111','bank-a','retain','openai','model-a','success',
 100,20,'2026-10-01T11:00:00Z');
DO $$
BEGIN
 IF (SELECT count(*) FROM elus_usage_ledger) != 1 THEN RAISE EXCEPTION 'Insert trigger not atomic'; END IF;
END $$;
-- Trigger replay / backfill is idempotent.
\ir ../migrations/002_usage_ledger_backfill_example.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM elus_usage_ledger) != 1 THEN RAISE EXCEPTION 'Backfill duplicated trace'; END IF;
END $$;
-- Aborted trace transactions must not create ledger entries.
BEGIN;
INSERT INTO llm_requests(id,bank_id,status) VALUES ('22222222-2222-4222-8222-222222222222','bank-b','success');
ROLLBACK;
DO $$
BEGIN
 IF (SELECT count(*) FROM elus_usage_ledger WHERE bank_id = 'bank-b') != 0
   THEN RAISE EXCEPTION 'Rolled-back usage persisted'; END IF;
END $$;
-- Ledger remains after trace retention, unlike a foreign-key-dependent summary.
DELETE FROM llm_requests WHERE bank_id = 'bank-a';
DO $$
BEGIN
 IF (SELECT count(*) FROM elus_usage_ledger WHERE bank_id = 'bank-a') != 1
   THEN RAISE EXCEPTION 'Trace cleanup deleted permanent usage'; END IF;
END $$;
-- Invalid usage should be rejected without partial writes.
DO $$
BEGIN
 BEGIN
   INSERT INTO llm_requests(id,bank_id,status,input_tokens)
   VALUES ('33333333-3333-4333-8333-333333333333','bank-c','success',-1);
   RAISE EXCEPTION 'Negative tokens accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM llm_requests WHERE bank_id='bank-c') != 0
    OR (SELECT count(*) FROM elus_usage_ledger WHERE bank_id='bank-c') != 0
   THEN RAISE EXCEPTION 'Invalid data persisted'; END IF;
END $$;
