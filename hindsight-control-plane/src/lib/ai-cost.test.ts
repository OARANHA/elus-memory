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
  it("prefers exact namespaced prices over any short-name alias", () => {
    const exact = { ...rate, model: "org/test/model", input: 3 };
    const short = { ...rate, model: "model", input: 1 };
    const r = estimateCost([entry({ model: "org/test/model", cached_tokens: 0 })], [short, exact]);
    expect(r.inputUsd).toBe(3);
  });
  it("explains missing tariffs and missing token usage without inventing costs", () => {
    const result = estimateCost([
      entry({ model: "unknown", id: "unpriced" }),
      entry({ model: "test/model", input_tokens: null, id: "missing" }),
    ], [rate]);
    expect(result.pricedCalls).toBe(0);
    expect(result.unknownCalls).toBe(2);
    expect(result.unknownReasons.map((r) => r.reason)).toContain("Sem tarifa cadastrada");
    expect(result.unknownReasons.map((r) => r.reason)).toContain("Tokens ausentes");
  });
  it("separates verified local embedding and reranking calls from unknown cloud billing", () => {
    const result = estimateCost([
      entry({ id: "embed", provider: "local", model: "BAAI/bge-small-en-v1.5" }),
      entry({ id: "rerank", provider: "local", model: "cross-encoder/ms-marco-MiniLM-L-6-v2" }),
      entry({ id: "llm", provider: "openai", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }),
    ], [rate]);
    expect(result.localCalls).toBe(2);
    expect(result.unknownCalls).toBe(1);
    expect(result.pricedCalls).toBe(0);
    expect(result.unknownReasons[0].reason).toContain("origem de cobrança não verificada");
  });
  it("rejects invalid token accounting", () => {
    expect(estimateCost([entry({ cached_tokens: 1_000_001 })], [rate]).unknownCalls).toBe(1);
  });
});
