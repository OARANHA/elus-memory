-- ELUS Memo: restore historical usage events from retained Hindsight traces.
-- Run ONLY against an authorized, backed-up PostgreSQL database on the intended
-- tenant schema. This file intentionally targets public; do not interpolate
-- schema names, database identifiers or tenant names from clients.
-- Run as a single audited psql transaction, with ON_ERROR_STOP=1.
-- Idempotent: source_request_id is the original llm_requests.id.
-- Never truncate, delete, alter migrations, or change triggers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(1129868306, 20261026);

DO $preflight$
BEGIN
  IF to_regclass('public.llm_requests') IS NULL OR
     to_regclass('public.elus_usage_ledger') IS NULL THEN
    RAISE EXCEPTION 'Missing llm_requests or elus_usage_ledger in public schema';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.llm_requests'::regclass
      AND tgname = 'trg_elus_usage_ledger_insert'
      AND NOT tgisinternal
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'Ledger capture trigger is absent or disabled';
  END IF;
END $preflight$;

-- The single transaction prevents a half-completed backfill. Live inserts
-- remain protected by the trigger; conflicts safely resolve without duplicates.
INSERT INTO public.elus_usage_ledger (
  source_request_id, bank_id, operation, scope, provider, model, status,
  occurred_at, input_tokens, output_tokens, cached_tokens, thoughts_tokens
)
SELECT
  id, bank_id, operation, scope, provider, model, status,
  started_at, input_tokens, output_tokens, cached_tokens, thoughts_tokens
FROM public.llm_requests
ON CONFLICT (source_request_id) DO NOTHING;

-- Verify every retained trace is accounted for before commit.
DO $verify$
DECLARE missing_count bigint;
BEGIN
  SELECT count(*) INTO missing_count
  FROM public.llm_requests r
  LEFT JOIN public.elus_usage_ledger l ON l.source_request_id = r.id
  WHERE l.source_request_id IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % retained traces absent from ledger', missing_count;
  END IF;
END $verify$;
COMMIT;
-- After commit, execute read-only reconciliation separately; do not claim
-- coverage for traces already deleted by retention before this operation.
