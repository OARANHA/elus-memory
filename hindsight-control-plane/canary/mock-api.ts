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
