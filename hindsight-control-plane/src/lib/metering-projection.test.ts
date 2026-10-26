import { describe, expect, it } from "vitest";
import type { LLMRequestEntry } from "./api";
import { projectMeteringEvents, aggregateMeteringDaily } from "./metering-projection";
import type { ModelRate } from "./ai-cost";

const rate: ModelRate = {
  provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  input: 0.098, output: 0.294, cachedInput: 0.003,
  source: "test", checkedAt: "2026-10-26",
};
function entry(id: string, bank: string): LLMRequestEntry {
  return {
    id, bank_id: bank, operation: "retain", scope: "llm", trace_id: null,
    span_id: null, parent_span_id: null, provider: "openai",
    model: rate.model, status: "success",
    started_at: "2026-10-26T08:00:00Z", ended_at: null, duration_ms: null,
    input_tokens: 1000000, output_tokens: 1000000, cached_tokens: 0,
    thoughts_tokens: 0, total_tokens: 2000000,
    input: null, output: null, error: null, llm_info: {}, metadata: {},
  };
}
describe("durable metering projection", () => {
  it("deduplicates repeated source IDs and isolates banks", () => {
    const one = entry("a", "bank-one");
    const result = projectMeteringEvents([one, one, entry("b", "bank-two")], "bank-one", [rate]);
    expect(result.events).toHaveLength(1);
    expect(result.duplicateIds).toBe(1);
    expect(result.excludedOtherBank).toBe(1);
    expect(result.events[0].costUsd).toBeCloseTo(0.392);
    expect(aggregateMeteringDaily(result.events)[0].totalCalls).toBe(1);
  });
  it("keeps unknown costs unknown instead of treating them as free", () => {
    const unknown = { ...entry("b", "bank-one"), model: "unknown" };
    const result = projectMeteringEvents([unknown], "bank-one", [rate]);
    expect(result.events[0].costUsd).toBeNull();
    const group = aggregateMeteringDaily(result.events)[0];
    expect(group.unpricedCalls).toBe(1);
    expect(group.pricedCalls).toBe(0);
  });
  it("fails to assign a day when timestamp is missing", () => {
    const result = projectMeteringEvents([{ ...entry("c", "bank-one"), started_at: null }], "bank-one", [rate]);
    expect(result.missingTimestamp).toBe(1);
    expect(result.events).toHaveLength(0);
  });
});
