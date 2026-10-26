import { describe, expect, it, vi } from "vitest";
import { readDeepInfraBilling, validPeriod } from "./deepinfra-billing";

describe("DeepInfra billing read-only adapter", () => {
  it("allows documented month periods and rejects extra query strings", () => {
    expect(validPeriod("current")).toBe(true);
    expect(validPeriod("2026.10")).toBe(true);
    expect(validPeriod("2026.13")).toBe(false);
    expect(validPeriod("current&secret=123")).toBe(false);
  });
  it("reads only two GET endpoints and never exposes the key", async () => {
    const mock = vi.fn(async (url: string, opts: RequestInit) => {
      expect(opts.cache).toBe("no-store");
      expect(opts.headers).toEqual({ Authorization: "Bearer test-secret", Accept: "application/json" });
      return { ok: true, json: async () => url.includes("/usage")
        ? { initial_month: "2026.10", months: [{
            period: "2026.10", total_cost: 107, invoice_id: "NOT_FINAL",
            items: [{ model: {model_name: "model"}, pricing_type: "input_tokens", units: 100, rate: 1, cost: 80 }],
          }] }
        : { stripe_balance: -439, recent: 107, suspended: false, suspend_reason: null,
            scoped_credits: [{ name: "promo", remaining_cents: 439, granted_cents: 439, expired: false }] },
      } as Response;
    });
    const result = await readDeepInfraBilling("test-secret", "2026.10", mock as unknown as typeof fetch);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.usage.months[0].total_cost_raw).toBe(107);
    expect(result.billingUnit).toBe("unverified");
    expect(result.balance.scoped_credits[0].remaining_usd).toBe(4.39);
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });
  it("fails closed on invalid upstream data", async () => {
    const broken = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    await expect(readDeepInfraBilling("x", "current", broken as unknown as typeof fetch)).rejects.toThrow("DEEPINFRA_INVALID_RESPONSE");
  });
});
