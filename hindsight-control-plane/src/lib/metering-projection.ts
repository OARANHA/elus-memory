import type { LLMRequestEntry } from "./api";
import { estimateCost, type ModelRate } from "./ai-cost";

/**
 * Pure durable-metering projection; not a persistence engine.
 * Store immutable event IDs and price versions in Postgres before using it
 * for retained historical reports. Never replace ledger rows with estimates.
 */
export interface MeteringEvent {
  sourceId: string;
  bankId: string;
  occurredAt: string;
  dayUTC: string;
  operation: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  costUsd: number | null;
  priceVerifiedAt: string | null;
  status: string;
}

export interface MeteringProjection {
  events: MeteringEvent[];
  duplicateIds: number;
  excludedOtherBank: number;
  missingTimestamp: number;
}

export function projectMeteringEvents(
  entries: readonly LLMRequestEntry[],
  bankId: string,
  rates?: readonly ModelRate[],
): MeteringProjection {
  const seen = new Set<string>();
  const events: MeteringEvent[] = [];
  let duplicateIds = 0;
  let excludedOtherBank = 0;
  let missingTimestamp = 0;
  for (const entry of entries) {
    if (entry.bank_id !== bankId) { excludedOtherBank++; continue; }
    if (seen.has(entry.id)) { duplicateIds++; continue; }
    seen.add(entry.id);
    const stamp = entry.started_at;
    const timestamp = stamp ? new Date(stamp) : null;
    if (!timestamp || Number.isNaN(timestamp.getTime())) {
      missingTimestamp++;
      continue;
    }
    const summary = estimateCost([entry], rates, bankId);
    const priced = summary.pricedCalls === 1;
    const tariff = priced && rates
      ? rates.find((r) => r.provider === "deepinfra" && r.model.toLowerCase() === entry.model?.toLowerCase())
      : undefined;
    events.push({
      sourceId: entry.id,
      bankId,
      occurredAt: timestamp.toISOString(),
      dayUTC: timestamp.toISOString().slice(0, 10),
      operation: entry.operation ?? "unknown",
      provider: summary.rows[0]?.provider ?? entry.provider ?? "unknown",
      model: entry.model ?? "unknown",
      inputTokens: entry.input_tokens,
      outputTokens: entry.output_tokens,
      cachedTokens: entry.cached_tokens,
      costUsd: priced ? summary.knownUsd : null,
      priceVerifiedAt: tariff?.checkedAt ?? null,
      status: entry.status,
    });
  }
  return { events, duplicateIds, excludedOtherBank, missingTimestamp };
}

export function aggregateMeteringDaily(events: readonly MeteringEvent[]) {
  const groups = new Map<string, {
    dayUTC: string; bankId: string; provider: string; model: string; operation: string;
    knownCostUsd: number; pricedCalls: number; unpricedCalls: number; totalCalls: number;
  }>();
  for (const event of events) {
    const key = JSON.stringify([event.dayUTC, event.bankId, event.provider, event.model, event.operation]);
    const group = groups.get(key) ?? {
      dayUTC: event.dayUTC, bankId: event.bankId, provider: event.provider,
      model: event.model, operation: event.operation, knownCostUsd: 0,
      pricedCalls: 0, unpricedCalls: 0, totalCalls: 0,
    };
    group.totalCalls++;
    if (event.costUsd === null) group.unpricedCalls++;
    else { group.pricedCalls++; group.knownCostUsd += event.costUsd; }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.dayUTC.localeCompare(b.dayUTC));
}
