\set ON_ERROR_STOP on
-- Synthetic restore verification only: isolated PostgreSQL database.
CREATE SCHEMA restore_fixture;
CREATE TABLE restore_fixture.llm_requests (
 id uuid PRIMARY KEY, bank_id text, operation text, scope text,
 provider text, model text, status text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 input_tokens integer, output_tokens integer, cached_tokens integer, thoughts_tokens integer
);
SET search_path TO restore_fixture, public;
\ir ../migrations/001_usage_ledger_candidate.sql
INSERT INTO restore_fixture.llm_requests(id,bank_id,status,input_tokens)
VALUES ('77777777-7777-4777-8777-777777777777','bank-a','success',100);
DO $$
BEGIN
 IF (SELECT count(*) FROM restore_fixture.elus_usage_ledger) <> 1
 THEN RAISE EXCEPTION 'Fixture incomplete'; END IF;
END $$;
RESET search_path;
