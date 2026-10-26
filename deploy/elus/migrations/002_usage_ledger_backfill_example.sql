-- Candidate backfill, NOT RUN. Run in audited small day slices, one schema at a time.
-- Supply date bounds in a transaction through SET LOCAL; no dynamic schema from callers.
-- Idempotent by source_request_id; replay does not duplicate committed events.
BEGIN;
SET LOCAL elus.backfill_from = '2026-10-01T00:00:00Z';
SET LOCAL elus.backfill_to = '2026-10-02T00:00:00Z';
INSERT INTO elus_usage_ledger (
  source_request_id, bank_id, operation, scope, provider, model, status,
  occurred_at, input_tokens, output_tokens, cached_tokens, thoughts_tokens
)
SELECT id, bank_id, operation, scope, provider, model, status, started_at,
  input_tokens, output_tokens, cached_tokens, thoughts_tokens
FROM llm_requests
WHERE started_at >= current_setting('elus.backfill_from')::timestamptz
  AND started_at < current_setting('elus.backfill_to')::timestamptz
ON CONFLICT (source_request_id) DO NOTHING;
COMMIT;
