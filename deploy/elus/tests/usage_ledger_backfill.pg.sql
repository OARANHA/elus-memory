\set ON_ERROR_STOP on
-- Isolated CI only. Create a historical trace without invoking the live trigger.
BEGIN;
ALTER TABLE public.llm_requests DISABLE TRIGGER trg_elus_usage_ledger_insert;
INSERT INTO public.llm_requests(id, bank_id, status, started_at, provider, model,
                                 input_tokens, output_tokens)
VALUES ('55555555-5555-4555-8555-555555555555', 'historic-bank', 'success',
        '2026-10-10T12:00:00Z', 'deepinfra', 'historical-model', 100, 25);
ALTER TABLE public.llm_requests ENABLE TRIGGER trg_elus_usage_ledger_insert;
COMMIT;
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.elus_usage_ledger
   WHERE source_request_id = '55555555-5555-4555-8555-555555555555'
 ) THEN
    RAISE EXCEPTION 'Test fixture unexpectedly metered';
 END IF;
END $$;
\ir ../migrations/003_usage_ledger_retained_trace_backfill.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM public.elus_usage_ledger
     WHERE source_request_id = '55555555-5555-4555-8555-555555555555') <> 1 THEN
   RAISE EXCEPTION 'Historical record not recovered';
 END IF;
END $$;
\ir ../migrations/003_usage_ledger_retained_trace_backfill.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM public.elus_usage_ledger
     WHERE source_request_id = '55555555-5555-4555-8555-555555555555') <> 1 THEN
   RAISE EXCEPTION 'Backfill replay duplicated or lost historical record';
 END IF;
END $$;
