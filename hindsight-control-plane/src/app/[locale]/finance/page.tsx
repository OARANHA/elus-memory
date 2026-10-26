"use client";

import { useEffect, useState } from "react";
import { BankSelector } from "@/components/bank-selector";

type Billing = {
  fetchedAt: string;
  billingUnit: string;
  usage: { months: { period: string; total_cost_raw: number; invoice_id: string;
    items: { model: string; pricing_type: string; units: number; cost_raw: number }[] }[] };
  balance: { stripe_balance_raw: number; recent_raw: number; suspended: boolean;
    scoped_credits: { name: string; remaining_usd: number; expired: boolean }[] };
};

export default function FinancePage() {
  const [data, setData] = useState<Billing | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/deepinfra?from=current", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 503) { setState("unconfigured"); return; }
        if (!r.ok) { setState("error"); return; }
        setData(await r.json() as Billing);
        setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <BankSelector />
      <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">DeepInfra · Financeiro</h1>
          <p className="text-sm text-muted-foreground">Dados oficiais da conta, somente leitura. Não representa custo atribuído por banco.</p>
        </header>
        {state === "loading" && <p role="status">Consultando faturamento…</p>}
        {state === "unconfigured" && <div role="status" className="rounded-xl border border-border bg-card p-5">
          Integração financeira ainda não configurada. A credencial de faturamento deve ser provisionada no servidor.
          Nenhum saldo será presumido.
        </div>}
        {state === "error" && <p role="alert">Não foi possível consultar os dados de cobrança da DeepInfra.</p>}
        {state === "ready" && data && <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Estado da conta</h2>
            <p className="mt-2 text-sm">Suspensa: {data.balance.suspended ? "Sim" : "Não"}</p>
            <p className="mt-2 text-sm text-muted-foreground">Saldo Stripe (valor bruto): {data.balance.stripe_balance_raw}</p>
            <p className="text-sm text-muted-foreground">Consumo recente (valor bruto): {data.balance.recent_raw}</p>
            <p className="mt-3 text-xs text-amber-500">Unidades monetárias gerais ainda não conciliadas com a fatura; não são exibidas como USD.</p>
            {data.balance.scoped_credits.length > 0 && <ul className="mt-3 space-y-1 text-sm">
              {data.balance.scoped_credits.map((credit, i) =>
                <li key={i}>{credit.name}: {credit.remaining_usd.toLocaleString("pt-BR", {style:"currency",currency:"USD"})}{credit.expired ? " (expirado)" : ""}</li>)}
            </ul>}
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Uso por período</h2>
            {data.usage.months.length === 0 ? <p className="mt-2 text-sm">Nenhum período retornado.</p> :
              <ul className="mt-3 space-y-4">{data.usage.months.map((month) =>
                <li key={month.period}>
                  <p className="font-medium">{month.period} · custo bruto {month.total_cost_raw} · fatura {month.invoice_id}</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {month.items.map((item, i) =>
                      <li key={i}>{item.model} · {item.pricing_type} · {item.units} unidades · custo bruto {item.cost_raw}</li>)}
                  </ul>
                </li>)}</ul>}
          </section>
          <p className="text-xs text-muted-foreground">Fonte: DeepInfra API · Atualizado em {new Date(data.fetchedAt).toLocaleString("pt-BR")}</p>
        </>}
      </main>
    </div>
  );
}
