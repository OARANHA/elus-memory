"""ELUS Memo production backfill through the proven pg0 container-network path.

Execution environment: disposable pinned Hindsight image with mounts:
  /pg0 (existing production Docker volume, read-only),
  /repo (checked-out pinned source, read-only),
  /backup (protected host backup directory).
This script does not inspect or expose prompt/response bodies, and never
recreates databases or reruns migrations. Requires operator approval.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

PG = Path("/pg0/installation/18.1.0/bin")
SQL = Path("/repo/deploy/elus/migrations/003_usage_ledger_retained_trace_backfill.sql")
CREDENTIALS = Path("/pg0/instances/hindsight/instance.json")
BACKUP = Path("/backup")

def run(argv, *, env, input=None, capture=False):
    return subprocess.run(argv, env=env, input=input, text=input is not None,
                          check=True, stdout=subprocess.PIPE if capture else subprocess.DEVNULL)

def main():
    if not SQL.is_file() or not CREDENTIALS.is_file() or not BACKUP.is_dir():
        raise SystemExit("Missing pinned SQL, pg0 instance metadata or backup mount")
    if not all((PG / exe).is_file() for exe in ("pg_dump", "pg_restore", "psql")):
        raise SystemExit("PostgreSQL 18.1 CLI tools not found")
    meta = json.loads(CREDENTIALS.read_text())
    if meta.get("database") != "hindsight":
        raise SystemExit("Refusing unexpected PostgreSQL database")
    for key in ("username", "password", "port"):
        if key not in meta:
            raise SystemExit("Missing expected pg0 field: " + key)
    query = ["-h", "127.0.0.1", "-p", str(meta["port"]),
             "-U", meta["username"], "-d", meta["database"]]
    env = {**os.environ, "PGPASSWORD": meta["password"]}
    sql = SQL.read_text(encoding="utf-8")
    if "ON CONFLICT (source_request_id) DO NOTHING" not in sql or "COMMIT;" not in sql:
        raise SystemExit("Refusing unexpected backfill SQL")
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = BACKUP / ("hindsight-pre-backfill-" + ts + ".dump")
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    try:
        run([str(PG / "pg_dump"), *query, "-Fc", "-f", str(dest)], env=env)
        run([str(PG / "pg_restore"), "--list", str(dest)], env=env)
        if dest.stat().st_size == 0:
            raise RuntimeError("Empty backup")
        h = hashlib.sha256()
        with dest.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                h.update(chunk)
        print("BACKUP_OK", str(dest), "SIZE", dest.stat().st_size, "SHA256", h.hexdigest(), flush=True)
        # SQL owns BEGIN/COMMIT. With ON_ERROR_STOP, any failure aborts the psql
        # session and PostgreSQL rolls back the incomplete transaction.
        run([str(PG / "psql"), "-X", "-v", "ON_ERROR_STOP=1", *query],
            env=env, input=sql)
        count_sql = """SELECT (SELECT COUNT(*) FROM public.llm_requests) AS traces,
                             (SELECT COUNT(*) FROM public.elus_usage_ledger) AS ledger,
                             (SELECT COUNT(*) FROM public.llm_requests r WHERE NOT EXISTS
                               (SELECT 1 FROM public.elus_usage_ledger l WHERE l.source_request_id=r.id))
                               AS missing"""
        result = run([str(PG / "psql"), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                      *query, "-c", count_sql], env=env, capture=True)
        counters = result.stdout.decode("utf-8").strip()
        traces, ledger, missing = (int(n) for n in counters.split("|"))
        if missing:
            raise RuntimeError("Backfill committed but reconciliation found missing rows")
        print("BACKFILL_GREEN", "TRACES", traces, "LEDGER", ledger, "MISSING", missing)
    except Exception:
        # Keep the backup for operator investigation and rollback planning.
        print("BACKFILL_NOT_CONFIRMED; preserved backup:", str(dest), file=sys.stderr)
        raise

if __name__ == "__main__":
    main()
