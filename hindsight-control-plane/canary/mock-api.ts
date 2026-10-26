import type { LLMRequestEntry } from "../src/lib/api";

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
const today = new Date().toISOString();
export const client = {
  async listLLMRequests(bankId: string) {
    const items = bankId === "unpriced"
      ? [trace("unknown-1", bankId, "unknown-model", today)]
      : [
          trace("known-1", bankId, "DeepSeek-V4-Flash-0731", today),
          trace("unknown-2", bankId, "unpriced-variant", today),
        ];
    return { bank_id: bankId, total: items.length, limit: 100, offset: 0, items };
  },
};
