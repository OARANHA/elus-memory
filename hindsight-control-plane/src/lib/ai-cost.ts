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
export const MODEL_RATES: readonly ModelRate[] = [];
// Rates are deliberately unset until an authoritative model-specific price is
// verified. An unverifiable price must not masquerade as a trustworthy cost.

export interface CostSummary {
  knownUsd: number;
  inputUsd: number;
  outputUsd: number;
  cacheUsd: number;
  pricedCalls: number;
  unknownCalls: number;
  rows: { provider: string; model: string; usd: number; calls: number }[];
}

export function estimateCost(
  entries: readonly LLMRequestEntry[],
  rates: readonly ModelRate[] = MODEL_RATES,
  bankId?: string,
): CostSummary {
  const byModel = new Map<string, CostSummary["rows"][number]>();
  let inputUsd = 0, outputUsd = 0, cacheUsd = 0, pricedCalls = 0, unknownCalls = 0;
  for (const entry of entries) {
    if (bankId && entry.bank_id !== bankId) continue;
    const provider = entry.provider?.trim().toLowerCase() ?? "";
    const model = entry.model?.trim() ?? "";
    const rate = rates.find((r) => r.provider.toLowerCase() === provider && r.model === model);
    const input = entry.input_tokens;
    const output = entry.output_tokens;
    const cached = entry.cached_tokens ?? 0;
    // The recorded input count includes cached prompt tokens; never bill those twice.
    // Missing token counts, impossible cache counts or absent cache rates remain unknown.
    if (!rate || input == null || output == null || input < 0 || output < 0 ||
        cached < 0 || cached > input || (cached > 0 && rate.cachedInput == null)) {
      unknownCalls++;
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
    inputUsd, outputUsd, cacheUsd, pricedCalls, unknownCalls,
    rows: [...byModel.values()].sort((a, b) => b.usd - a.usd),
  };
}
