"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Owner-only DeepInfra balance. Hide on missing credentials, errors and unknown units. */
export function CreditIndicator() {
  const router = useRouter();
  const [credit, setCredit] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/finance/deepinfra?from=current", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok) { if (active) setCredit(null); return; }
        const payload = await response.json();
        const balance = payload?.balance;
        const gross = balance?.stripe_balance_raw;
        const recent = balance?.recent_raw;
        // DeepInfra checklist: negative stripe_balance is prepaid funds.
        // Monetary interpretation requires a documented/verified USD unit.
        if (payload.billingUnit !== "usd" || balance?.suspended ||
            typeof gross !== "number" || gross >= 0 || !Number.isFinite(gross) ||
            typeof recent !== "number" || recent < 0 || !Number.isFinite(recent)) {
          if (active) setCredit(null);
          return;
        }
        if (active) setCredit(-gross - recent);
      } catch {
        if (active) setCredit(null);
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  if (credit === null) return null;
  return (
    <button type="button" onClick={() => router.push("/finance")}
      title="Crédito disponível estimado; consultar detalhes financeiros"
      className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-right hover:bg-accent transition-colors">
      <span className="block text-[10px] leading-3 text-muted-foreground">Crédito Disponível</span>
      <span className="block text-sm font-semibold tabular-nums">
        {credit.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}
      </span>
    </button>
  );
}
