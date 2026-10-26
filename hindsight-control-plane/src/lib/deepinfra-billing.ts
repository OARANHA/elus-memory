/**
 * DeepInfra billing API contract. Never use the model-inference token in client code.
 * https://docs.deepinfra.com/api-reference/billing/usage
 * https://docs.deepinfra.com/api-reference/billing/get-checklist
 */
export interface DeepInfraUsageItem {
  model: { provider?: string; model_name: string };
  pricing_type: string;
  units: number;
  rate: number;
  cost: number;
}
export interface DeepInfraUsageMonth {
  period: string;
  total_cost: number;
  invoice_id: string;
  items: DeepInfraUsageItem[];
}
export interface DeepInfraUsage {
  months: DeepInfraUsageMonth[];
  initial_month: string;
}
export interface DeepInfraChecklist {
  stripe_balance: number;
  recent: number;
  suspended: boolean;
  suspend_reason: string | null;
  scoped_credits?: Array<{ name: string; granted_cents: number; remaining_cents: number; expired: boolean }>;
}

const base = "https://api.deepinfra.com";
export const validPeriod = (period: string) => period === "current" || /^\d{4}\.(0[1-9]|1[0-2])$/.test(period);
export async function readDeepInfraBilling(key: string, period: string, fetcher: typeof fetch = fetch) {
  if (!validPeriod(period)) throw new Error("INVALID_PERIOD");
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const options = { headers, cache: "no-store" as const, signal: AbortSignal.timeout(12000) };
  const [usageResponse, checklistResponse] = await Promise.all([
    fetcher(`${base}/payment/usage?from=${encodeURIComponent(period)}`, options),
    fetcher(`${base}/payment/checklist`, options),
  ]);
  if (!usageResponse.ok || !checklistResponse.ok) throw new Error("DEEPINFRA_UPSTREAM_FAILURE");
  const usage = await usageResponse.json() as DeepInfraUsage;
  const checklist = await checklistResponse.json() as DeepInfraChecklist;
  if (!Array.isArray(usage.months) || typeof checklist.stripe_balance !== "number" ||
      !Number.isFinite(checklist.stripe_balance) ||
      usage.months.some(m => !Array.isArray(m.items) || !Number.isFinite(m.total_cost))) {
    throw new Error("DEEPINFRA_INVALID_RESPONSE");
  }
  // The public docs name cost/rate but do not define a monetary unit. Don't
  // imply USD until production reconciles values against the DeepInfra portal.
  // 'remaining_cents' is explicitly denominated by the provider.
  return {
    source: "DeepInfra Billing API",
    period,
    fetchedAt: new Date().toISOString(),
    billingUnit: "unverified",
    // The owner confirmed the checklist values -5 and 1.24 alongside usage 124
    // in Oct 2026. This is a conditional inference, not an invoice guarantee.
    balanceUnit: "usd_estimated",
    usage: {
      months: usage.months.map(m => ({
        period: m.period, total_cost_raw: m.total_cost, invoice_id: m.invoice_id,
        items: m.items.map(i => ({
          model: i.model?.model_name ?? "(unknown)", pricing_type: i.pricing_type,
          units: i.units, rate_raw: i.rate, cost_raw: i.cost,
        })),
      })),
    },
    balance: {
      stripe_balance_raw: checklist.stripe_balance,
      recent_raw: checklist.recent,
      suspended: checklist.suspended,
      suspend_reason: checklist.suspend_reason,
      scoped_credits: (checklist.scoped_credits ?? []).map(c => ({
        name: c.name, remaining_usd: c.remaining_cents / 100,
        expired: c.expired,
      })),
    },
  };
}
