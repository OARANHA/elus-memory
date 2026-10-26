import type { LLMRequestEntry } from "./api";

/** USD per million tokens. Rates must be verified against the provider and dated. */
export interface ModelRate {
  provider: string;
  model: string;
  input: number;
  output: number;
  cachedInput?: number;
  source: string;
  checkedAt: string;
}

/** Intentionally explicit: unknown provider/model combinations are never charged at $0. */
// Rates supplied from DeepInfra by the owner on 2026-10-25; USD per 1M tokens.
// Confirm billing currency/unit independently before treating estimates as invoices.
// A missing cachedInput rate is intentionally undefined, not zero.
export const MODEL_RATES: readonly ModelRate[] = [
  { provider: "deepinfra", model: "DeepSeek-V4.1-Flash-1017", input: 0.098, output: 0.294, cachedInput: 0.003, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "NVIDIA-Nemotron-3.5-Super-VL", input: 0.15, output: 0.5, cachedInput: 0.02, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Step-5-Preview", input: 1, output: 2.7, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Tencent Hy4-preview", input: 0.792, output: 2.376, cachedInput: 0.04, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "MiMo-V2.6-Flash", input: 0.091, output: 0.182, cachedInput: 0.002, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "MiMo-V2.6-Pro", input: 0.387, output: 0.783, cachedInput: 0.003, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V4.1-Flash", input: 0.14, output: 0.42, cachedInput: 0.004, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "GLM-5.3", input: 0.563, output: 2.5, cachedInput: 0.125, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "GLM-5.3-Flash", input: 0.15, output: 0.5, cachedInput: 0.03, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Kimi-K3", input: 2.85, output: 14.25, cachedInput: 0.285, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V4-Pro-0813", input: 1.3, output: 2.6, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V4-Flash-0731", input: 0.06, output: 0.18, cachedInput: 0.015, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "GLM-5.2", input: 0.563, output: 1.8, cachedInput: 0.105, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "NVIDIA-Nemotron-3-Ultra-550B-A55B", input: 0.5, output: 2.2, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V4-Flash", input: 0.09, output: 0.18, cachedInput: 0.018, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V4-Pro", input: 1.3, output: 2.6, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Kimi-K2.6", input: 0.75, output: 3.5, cachedInput: 0.15, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.6-35B-A3B", input: 0.1, output: 0.95, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.5-397B-A17B", input: 0.45, output: 3, cachedInput: 0.22, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Gemma-4-26B-A4B-it", input: 0.07, output: 0.34, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Gemma-4-31B-it", input: 0.2, output: 0.4, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "NVIDIA-Nemotron-3-Super-120B-A12B", input: 0.085, output: 0.4, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "DeepSeek-V3.2", input: 0.26, output: 0.38, cachedInput: 0.13, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "ByteDance Seed-1.8", input: 0.25, output: 2, cachedInput: 0.05, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "ByteDance Seed-2.0-code", input: 0.5, output: 3, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "ByteDance Seed-2.0-mini", input: 0.1, output: 0.4, cachedInput: 0.02, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "ByteDance Seed-2.0-pro", input: 0.5, output: 3, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "MiniMax-M3", input: 0.28, output: 1.1, cachedInput: 0.056, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen2.5-72B-Instruct", input: 0.36, output: 0.4, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-14B", input: 0.12, output: 0.24, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-235B-A22B-Instruct-2507", input: 0.09, output: 0.55, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-30B-A3B", input: 0.12, output: 0.5, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-32B", input: 0.08, output: 0.28, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-Coder-480B-A35B-Instruct-Turbo", input: 0.3, output: 1, cachedInput: 0.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-Next-80B-A3B-Instruct", input: 0.09, output: 1.1, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-VL-235B-A22B-Instruct", input: 0.2, output: 0.88, cachedInput: 0.11, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3-VL-30B-A3B-Instruct", input: 0.15, output: 0.6, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.5-27B", input: 0.26, output: 2.6, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.5-35B-A3B", input: 0.14, output: 1, cachedInput: 0.05, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.5-9B", input: 0.1, output: 0.15, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.6-27B", input: 0.32, output: 3.2, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.7-Max", input: 2.5, output: 7.5, cachedInput: 0.5, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.8-27B", input: 0.15, output: 1.875, cachedInput: 0.038, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.8-Flash", input: 0.113, output: 0.382, cachedInput: 0.014, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" },
  { provider: "deepinfra", model: "Qwen3.8-Max", input: 1.65, output: 4.951, cachedInput: 0.206, source: "Tabela DeepInfra informada pelo proprietário", checkedAt: "2026-10-25" }
];

// DeepInfra publicly lists these STANDARD (undiscounted) rates for the exact 1017 model.
// Promotional and Flex/Priority prices differ; this is not an invoice.
// https://deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash-1017/api
MODEL_RATES.push({
  provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  input: 0.20, output: 0.60, cachedInput: 0.006,
  source: "DeepInfra official model page — undiscounted Standard list price",
  checkedAt: "2026-10-25",
});

export interface CostSummary {
  knownUsd: number;
  inputUsd: number;
  outputUsd: number;
  cacheUsd: number;
  pricedCalls: number;
  unknownCalls: number;
  localCalls: number;
  unknownReasons: { provider: string; model: string; reason: string; calls: number }[];
  rows: { provider: string; model: string; usd: number; calls: number }[];
}

export function estimateCost(
  entries: readonly LLMRequestEntry[],
  rates: readonly ModelRate[] = MODEL_RATES,
  bankId?: string,
): CostSummary {
  const byModel = new Map<string, CostSummary["rows"][number]>();
  const byUnknown = new Map<string, CostSummary["unknownReasons"][number]>();
  let inputUsd = 0, outputUsd = 0, cacheUsd = 0, pricedCalls = 0, unknownCalls = 0, localCalls = 0;
  for (const entry of entries) {
    if (bankId && entry.bank_id !== bankId) continue;
    const recordedProvider = entry.provider?.trim().toLowerCase() ?? "";
    const exactModel = entry.model?.trim().toLowerCase() ?? "";
    // The ELUS owner confirmed that this specific OpenAI-compatible gateway
    // route is billed by DeepInfra. Never remap unrelated OpenAI model routes.
    const provider = (bankId === "Elus360" || bankId === "memo.elus360") &&
      recordedProvider === "openai" &&
      exactModel === "deepseek-ai/deepseek-v4.1-flash-1017"
      ? "deepinfra" : recordedProvider;
    const model = entry.model?.trim() ?? "";
    // Only these verified local models are outside metered cloud LLM tokens.
    // Their infrastructure/electricity costs are NOT estimated here.
    if (provider === "local" && (
      model.toLowerCase() === "baai/bge-small-en-v1.5" ||
      model.toLowerCase() === "cross-encoder/ms-marco-minilm-l-6-v2"
    )) {
      localCalls++;
      continue;
    }
    // Providers sometimes prefix model IDs with a namespace (org/model).
    // Match only the final segment, never fuzzy substrings, to avoid mixing variants.
    const modelId = model.toLowerCase();
    const exactRate = rates.find(
      (r) => r.provider.toLowerCase() === provider && r.model.toLowerCase() === modelId,
    );
    const suffix = modelId.split("/").at(-1) ?? "";
    // Prefer the exact identifier. Only resolve a namespace suffix when unique;
    // ambiguous aliases must remain unpriced rather than selecting a wrong rate.
    const suffixRates = exactRate
      ? []
      : rates.filter(
          (r) => r.provider.toLowerCase() === provider && r.model.toLowerCase() === suffix,
        );
    const rate = exactRate ?? (suffixRates.length === 1 ? suffixRates[0] : undefined);
    const input = entry.input_tokens;
    const output = entry.output_tokens;
    const cached = entry.cached_tokens ?? 0;
    // The recorded input count includes cached prompt tokens; never bill those twice.
    // Missing token counts, impossible cache counts or absent cache rates remain unknown.
    if (!rate || input == null || output == null || input < 0 || output < 0 ||
        cached < 0 || cached > input || (cached > 0 && rate.cachedInput == null)) {
      unknownCalls++;
      const reason = !rate
        ? provider === "openai" && model.toLowerCase() === "deepseek-ai/deepseek-v4.1-flash-1017"
          ? "Gateway OpenAI compatível: origem de cobrança não verificada"
          : "Sem tarifa cadastrada" :
        input == null || output == null ? "Tokens ausentes" :
        !Number.isFinite(input) || !Number.isFinite(output) || !Number.isFinite(cached) ||
        input < 0 || output < 0 || cached < 0 || cached > input ? "Tokens inválidos" :
        "Tarifa de cache ausente";
      const key = JSON.stringify([provider || "(não informado)", model || "(não informado)", reason]);
      const previous = byUnknown.get(key);
      byUnknown.set(key, {
        provider: provider || "(não informado)", model: model || "(não informado)",
        reason, calls: (previous?.calls ?? 0) + 1,
      });
      continue;
    }
    const inCost = ((input - cached) * rate.input) / 1_000_000;
    const outCost = (output * rate.output) / 1_000_000;
    const cachedCost = (cached * (rate.cachedInput ?? rate.input)) / 1_000_000;
    const usd = inCost + outCost + cachedCost;
    inputUsd += inCost;
    outputUsd += outCost;
    cacheUsd += cachedCost;
    pricedCalls++;
    const key = JSON.stringify([provider, model]);
    const previous = byModel.get(key);
    byModel.set(key, { provider, model, usd: (previous?.usd ?? 0) + usd, calls: (previous?.calls ?? 0) + 1 });
  }
  return {
    knownUsd: inputUsd + outputUsd + cacheUsd,
    inputUsd, outputUsd, cacheUsd, pricedCalls, unknownCalls, localCalls,
    unknownReasons: [...byUnknown.values()].sort((a, b) => b.calls - a.calls),
    rows: [...byModel.values()].sort((a, b) => b.usd - a.usd),
  };
}
