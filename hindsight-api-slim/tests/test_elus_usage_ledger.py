"""Unit tests for bounded ledger reads; no production database access."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from hindsight_api.engine.elus_usage_ledger import (
    aggregate_usage_ledger,
    validate_usage_window,
)


def utc(year, month, day):
    return datetime(year, month, day, tzinfo=timezone.utc)


@pytest.mark.parametrize("start,end", [
    (utc(2026, 10, 27), utc(2026, 10, 26)),
    (utc(2026, 10, 26), utc(2026, 10, 26)),
    (utc(2025, 1, 1), utc(2026, 10, 26)),
    (datetime(2026, 10, 26), utc(2026, 10, 27)),
])
def test_reject_invalid_periods(start, end):
    with pytest.raises(ValueError):
        validate_usage_window(start, end)


def test_valid_utc_period():
    validate_usage_window(utc(2026, 10, 1), utc(2026, 11, 1))


@pytest.mark.asyncio
async def test_aggregation_never_queries_without_bank(monkeypatch):
    class ForbiddenConnection:
        def __getattr__(self, key):
            raise AssertionError("No database access allowed")
    with pytest.raises(ValueError, match="bank_id"):
        await aggregate_usage_ledger(
            ForbiddenConnection(), bank_id="", start=utc(2026, 10, 1), end=utc(2026, 11, 1)
        )


@pytest.mark.asyncio
async def test_bounded_queries_and_null_cost(monkeypatch):
    from hindsight_api.engine import elus_usage_ledger as module
    monkeypatch.setattr(module, "fq_table", lambda table: '"tenant_a".' + table)
    calls = []

    class Connection:
        async def fetchrow(self, sql, *args):
            calls.append((sql, args))
            if "retained_traces" in sql:
                return dict(retained_traces=2, unreconciled_traces=0, earliest_retained_trace=utc(2026, 10, 26))
            return dict(calls=2, input_tokens=100, output_tokens=40, cached_tokens=20,
                        missing_usage=1, earliest=utc(2026, 10, 26), latest=utc(2026, 10, 26))
        async def fetch(self, sql, *args):
            calls.append((sql, args))
            if "GROUP BY 1" in sql:
                return [dict(day=utc(2026, 10, 26).date(), calls=2)]
            return [dict(provider="unpriced", model="unknown", calls=2,
                         input_tokens=100, output_tokens=40, cached_tokens=20, missing_usage=1)]

    result = await aggregate_usage_ledger(
        Connection(), bank_id="bank-a", start=utc(2026, 10, 1), end=utc(2026, 11, 1)
    )
    assert result["totals"]["calls"] == 2
    assert result["estimated_cost_usd"] is None
    assert result["coverage"]["historical_backfill_confirmed"] is False
    assert len(calls) == 4
    assert all('"tenant_a".elus_usage_ledger' in sql for sql, _ in calls)
    assert result["coverage"]["retained_traces_reconciled"] is True
    assert all(params[0] == "bank-a" for _, params in calls)
    assert calls[2][1][-1] == 101
