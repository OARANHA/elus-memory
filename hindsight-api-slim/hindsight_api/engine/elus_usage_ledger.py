"""Bounded aggregate read of the ELUS usage ledger in the active tenant schema.

IMPORTANT: callers must first authorize the requested bank with Hindsight's
existing RequestContext mechanism. This is a database helper, NOT a public API.
"""
from datetime import datetime, timedelta

from .schema import fq_table

MAX_DAYS = 366
MAX_MODELS = 100


def validate_usage_window(start: datetime, end: datetime) -> None:
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("UTC timezone required")
    if start.utcoffset() != timedelta(0) or end.utcoffset() != timedelta(0):
        raise ValueError("UTC timezone required")
    if not start < end or end - start > timedelta(days=MAX_DAYS):
        raise ValueError("Invalid period; maximum is 366 days")


async def aggregate_usage_ledger(conn, *, bank_id: str, start: datetime, end: datetime) -> dict:
    """Never expose prompts, responses or credentials; prices are not stored."""
    validate_usage_window(start, end)
    if not bank_id:
        raise ValueError("bank_id required")
    table = fq_table("elus_usage_ledger")
    totals = await conn.fetchrow(
        f"""SELECT COUNT(*)::bigint AS calls,
                   COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
                   COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
                   COALESCE(SUM(cached_tokens),0)::bigint AS cached_tokens,
                   COUNT(*) FILTER (WHERE input_tokens IS NULL OR output_tokens IS NULL)::bigint AS missing_usage,
                   MIN(occurred_at) AS earliest, MAX(occurred_at) AS latest
            FROM {table}
            WHERE bank_id = $1 AND occurred_at >= $2 AND occurred_at < $3""",
        bank_id, start, end,
    )
    days = await conn.fetch(
        f"""SELECT (occurred_at AT TIME ZONE 'UTC')::date AS day,
                   COUNT(*)::bigint AS calls
            FROM {table}
            WHERE bank_id = $1 AND occurred_at >= $2 AND occurred_at < $3
            GROUP BY 1 ORDER BY 1""",
        bank_id, start, end,
    )
    models = await conn.fetch(
        f"""SELECT provider, model, COUNT(*)::bigint AS calls,
                   COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
                   COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
                   COALESCE(SUM(cached_tokens),0)::bigint AS cached_tokens,
                   COUNT(*) FILTER (WHERE input_tokens IS NULL OR output_tokens IS NULL)::bigint AS missing_usage
            FROM {table}
            WHERE bank_id = $1 AND occurred_at >= $2 AND occurred_at < $3
            GROUP BY provider, model ORDER BY calls DESC, provider, model LIMIT $4""",
        bank_id, start, end, MAX_MODELS + 1,
    )
    return {
        "bank_id": bank_id,
        "source": "persistent_ledger",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "coverage": {
            "earliest": totals["earliest"].isoformat() if totals["earliest"] else None,
            "latest": totals["latest"].isoformat() if totals["latest"] else None,
            "historical_backfill_confirmed": False,
        },
        "totals": {k: int(totals[k]) for k in ("calls", "input_tokens", "output_tokens", "cached_tokens", "missing_usage")},
        "daily": [{"day": str(r["day"]), "calls": int(r["calls"])} for r in days],
        "models_truncated": len(models) > MAX_MODELS,
        "models": [
            {"provider": r["provider"], "model": r["model"],
             **{k: int(r[k]) for k in ("calls", "input_tokens", "output_tokens", "cached_tokens", "missing_usage")}}
            for r in models[:MAX_MODELS]
        ],
        "estimated_cost_usd": None,
    }
