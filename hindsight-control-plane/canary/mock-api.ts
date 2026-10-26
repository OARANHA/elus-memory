import type { LLMRequestEntry, LLMRequestsResponse } from "../src/lib/api";

function trace(id: string, bank: string, model: string, started: string): LLMRequestEntry {
  return {
    id, bank_id: bank, operation: "retain", scope: "llm", trace_id: null,
    span_id: null, parent_span_id: null, provider: "deepinfra", model,
    status: "success", started_at: started, ended_at: started, duration_ms: 100,
    input_tokens: 200000, output_tokens: 100000, cached_tokens: 50000,
    thoughts_tokens: 0, total_tokens: 300000,
    input: null, output: null, error: null, llm_info: {}, metadata: {},
  };
}

const now = new Date();
const today = now.toISOString();
const yesterday = new Date(now.getTime() - 86400000).toISOString();
const knownModel = "deepseek-ai/DeepSeek-V4-Flash-0731";
const fixture = (bankId: string): LLMRequestEntry[] => {
  if (bankId === "unpriced") return [trace("unknown-1", bankId, "unknown-model", today)];
  if (bankId === "empty") return [];
  if (bankId === "paginated") {
    return [
      trace("p1", bankId, knownModel, today),
      trace("p2", bankId, "unpriced-variant", yesterday),
      trace("p3", bankId, knownModel, today),
      trace("p4", bankId, knownModel, yesterday),
    ];
  }
  return [
    trace("known-1", bankId, knownModel, today),
    trace("unknown-2", bankId, "unpriced-variant", today),
  ];
};

// Match the existing paginated endpoint shape, without network access or secrets.
// The miniature pages exercise the real card's paging loop rather than handing it all rows.
export const client = {
  async readUsageLedger(bankId: string, start: string, end: string) {
    const items = fixture(bankId).filter(row =>
      !!row.started_at && row.started_at >= start && row.started_at < end
    );
    const grouped = new Map<string, typeof items>();
    const byDay = new Map<string, number>();
    for (const item of items) {
      const key = JSON.stringify([item.provider, item.model]);
      grouped.set(key, [...(grouped.get(key) || []), item]);
      const day = item.started_at!.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    const sum = (rows: typeof items, field: "input_tokens" | "output_tokens" | "cached_tokens") =>
      rows.reduce((a, r) => a + (r[field] ?? 0), 0);
    return {
      bank_id: bankId, source: "persistent_ledger" as const,
      start, end,
      totals: { calls: items.length, input_tokens: sum(items, "input_tokens"),
        output_tokens: sum(items, "output_tokens"), cached_tokens: sum(items, "cached_tokens"),
        missing_usage: 0 },
      coverage: { earliest: items[0]?.started_at ?? null,
        latest: items.at(-1)?.started_at ?? null, historical_backfill_confirmed: false, retained_traces: items.length, unreconciled_traces: 0, retained_traces_reconciled: true, earliest_retained_trace: items[0]?.started_at ?? null },
      models_truncated: false,
      daily: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, calls]) => ({ day, calls })),
      models: [...grouped].map(([key, rows]) => {
        const [provider, model] = JSON.parse(key) as [string, string];
        return { provider, model, calls: rows.length,
          input_tokens: sum(rows, "input_tokens"), output_tokens: sum(rows, "output_tokens"),
          cached_tokens: sum(rows, "cached_tokens"), missing_usage: 0 };
      }),
      estimated_cost_usd: null as null,
    };
  },
  async listLLMRequests(
    bankId: string,
    options?: { start_date?: string; limit?: number; offset?: number },
  ): Promise<LLMRequestsResponse> {
    const limit = bankId === "paginated" ? 2 : (options?.limit ?? 100);
    const offset = options?.offset ?? 0;
    const items = fixture(bankId).filter(
      (entry) => !options?.start_date || (entry.started_at ?? "") >= options.start_date,
    );
    return {
      bank_id: bankId,
      total: items.length,
      limit,
      offset,
      items: items.slice(offset, offset + limit),
    };
  },
};
