import { describe, expect, it } from "vitest";
import type { LLMRequestEntry } from "./api";
import { estimateCost, type ModelRate } from "./ai-cost";

const rate: ModelRate = { provider: "deepinfra", model: "test/model", input: 1, output: 2, cachedInput: 0.25, source: "test", checkedAt: "2026-10-25" };
const entry = (values: Partial<LLMRequestEntry> = {}): LLMRequestEntry => ({
  id: "1", bank_id: "memo.elus360", operation: "retain", scope: "llm",
  trace_id: null, span_id: null, parent_span_id: null,
  provider: "deepinfra", model: "test/model", status: "success",
  started_at: null, ended_at: null, duration_ms: null,
  input_tokens: 1_000_000, output_tokens: 1_000_000, cached_tokens: 200_000,
  thoughts_tokens: 0, total_tokens: 2_000_000,
  input: null, output: null, error: null, llm_info: {}, metadata: {}, ...values,
});
describe("estimateCost", () => {
  it("splits uncached input, output and cache without double counting", () => {
    const r = estimateCost([entry()], [rate]);
    expect(r.inputUsd).toBeCloseTo(0.8);
    expect(r.outputUsd).toBeCloseTo(2);
    expect(r.cacheUsd).toBeCloseTo(0.05);
    expect(r.knownUsd).toBeCloseTo(2.85);
  });
  it("does not turn missing price or cache rate into a false zero", () => {
    expect(estimateCost([entry({ model: "unpriced" })], [rate]).unknownCalls).toBe(1);
    expect(estimateCost([entry()], [{ ...rate, cachedInput: undefined }]).unknownCalls).toBe(1);
  });
  it("separates provider/model groups", () => {
    const r = estimateCost([entry(), entry({ model: "other" })], [rate]);
    expect(r.rows).toHaveLength(1);
    expect(r.unknownCalls).toBe(1);
  });
  it("excludes other banks from all totals", () => {
    const result = estimateCost([entry(), entry({ bank_id: "other" })], [rate], "memo.elus360");
    expect(result.pricedCalls).toBe(1);
    expect(result.knownUsd).toBeCloseTo(2.85);
  });
  it("matches a namespaced model ID against an exact model name", () => {
    const r = estimateCost(
      [entry({ model: "org/test/model" })],
      [{ ...rate, model: "model" }],
      "memo.elus360",
    );
    expect(r.pricedCalls).toBe(1);
  });
  it("rejects invalid token accounting", () => {
    expect(estimateCost([entry({ cached_tokens: 1_000_001 })], [rate]).unknownCalls).toBe(1);
  });
});
