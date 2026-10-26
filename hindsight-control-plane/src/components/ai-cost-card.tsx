"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { client, type LLMRequestEntry } from "@/lib/api";
import { estimateCost, type CostSummary } from "@/lib/ai-cost";

const PAGE_SIZE = 100;
const MAX_ROWS = 5000;
const money = (n: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(n);
const displayCost = (summary: CostSummary) =>
  summary.pricedCalls === 0 ? "Indisponível" : money(summary.knownUsd);

export function AiCostCard({ bankId, enabled }: { bankId: string; enabled: boolean }) {
  const [state, setState] = useState<{ today: CostSummary; month: CostSummary; partial: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState(null);
    setError(false);
    const load = async () => {
      // UTC boundaries match ISO timestamps from the API. Do not silently mix
      // browser local midnight with server timestamps.
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const entries: LLMRequestEntry[] = [];
      let total = 0;
      let fetched = 0;
      const seen = new Set<string>();
      let offset = 0;
      while (offset < MAX_ROWS) {
        const response = await client.listLLMRequests(bankId, { start_date: month.toISOString(), limit: PAGE_SIZE, offset });
        for (const entry of response.items) {
          // Offset pages can overlap while new traces arrive; avoid billing an id twice.
          if (entry.bank_id === bankId && !seen.has(entry.id)) {
            seen.add(entry.id);
            entries.push(entry);
          }
        }
        total = response.total;
        fetched += response.items.length;
        offset += response.items.length;
        if (offset >= response.total || response.items.length === 0) break;
      }
      if (!cancelled) {
        setState({
          today: estimateCost(entries.filter((e) => e.started_at && new Date(e.started_at) >= today), undefined, bankId),
          month: estimateCost(entries, undefined, bankId),
          partial: total > fetched,
        });
      }
    };
    load().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [bankId, enabled]);
  if (!enabled) return null;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Custo estimado de IA">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-foreground">Custo estimado de IA</h2>
        <span className="text-xs text-muted-foreground">USD · estimativa, não é fatura · UTC</span>
      </div>
      {error ? <p className="text-sm text-muted-foreground">Não foi possível consultar o consumo.</p> :
        !state ? <p className="text-sm text-muted-foreground" role="status">Calculando a partir das requisições registradas…</p> :
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Hoje</p><p className="text-2xl font-semibold tabular-nums">{displayCost(state.today)}</p></div>
            <div><p className="text-xs text-muted-foreground">Mês atual</p><p className="text-2xl font-semibold tabular-nums">{displayCost(state.month)}</p></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Banco: {bankId} · Entrada {money(state.month.inputUsd)} · Saída {money(state.month.outputUsd)} · Cache {money(state.month.cacheUsd)}
          </p>
          {state.month.rows.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {state.month.rows.map((r) => <li key={r.provider + "/" + r.model} className="flex min-w-0 flex-wrap justify-between gap-2">
              <span className="break-all">{r.provider} / {r.model} · {r.calls} chamadas</span>
              <span className="tabular-nums">{money(r.usd)}</span>
            </li>)}
          </ul>}
          {(state.month.unknownCalls > 0 || state.today.unknownCalls > 0 || state.partial) && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400" role="status">
            {state.month.unknownCalls > 0 ? `${state.month.unknownCalls} chamadas sem preço/uso verificável no mês; total conhecido não representa o gasto completo. ` : ""}
            {state.today.unknownCalls > 0 ? ` Hoje: ${state.today.unknownCalls} chamadas não precificadas.` : ""}\n            {state.partial ? "Amostra limitada; totais de hoje e do mês podem estar incompletos." : ""}
          </p>}
          <p className="mt-2 text-xs text-muted-foreground">Somente traces disponíveis. Totais históricos após expiração exigem agregação persistida.</p>
        </>
      }
    </section>
  );
}
