#!/usr/bin/env bash
set -euo pipefail
# Only isolated CI database, no production connection strings.
export PGPASSWORD=test-only
host=127.0.0.1
db=usage_ledger_test
psql -X -v ON_ERROR_STOP=1 -h "$host" -U postgres -d "$db" -f deploy/elus/tests/backup_restore_fixture.sql
backup="$(mktemp -d)"
trap 'rm -rf "$backup"' EXIT
pg_dump -h "$host" -U postgres -d "$db" --format=custom --schema=restore_fixture --file="$backup/fixture.dump"
psql -X -v ON_ERROR_STOP=1 -h "$host" -U postgres -d "$db" -c 'DROP SCHEMA restore_fixture CASCADE'
pg_restore -h "$host" -U postgres -d "$db" --exit-on-error --single-transaction "$backup/fixture.dump"
psql -X -v ON_ERROR_STOP=1 -h "$host" -U postgres -d "$db" <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM restore_fixture.llm_requests) <> 1
  OR (SELECT count(*) FROM restore_fixture.elus_usage_ledger) <> 1
  THEN RAISE EXCEPTION 'Backup/restore lost data'; END IF;
END $$;
INSERT INTO restore_fixture.llm_requests(id,bank_id,status,input_tokens)
VALUES ('88888888-8888-4888-8888-888888888888','bank-b','success',200);
DO $$
BEGIN
  IF (SELECT count(*) FROM restore_fixture.elus_usage_ledger) <> 2
  THEN RAISE EXCEPTION 'Restored trigger not active'; END IF;
END $$;
SQL
echo 'Backup/restore fixture and trigger: GREEN'
