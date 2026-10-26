"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { client, type LLMRequestEntry } from "@/lib/api";
import { estimateCost, type CostSummary } from "@/lib/ai-cost";

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 20_000;
const money = (n: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(n);
const displayCost = (summary: CostSummary) =>
  summary.pricedCalls === 0 ? "Indisponível" : money(summary.knownUsd);

export function AiCostCard({ bankId, enabled }: { bankId: string; enabled: boolean }) {
  const [state, setState] = useState<{ today: CostSummary; month: CostSummary; partial: boolean; requests: number; inputTokens: number; outputTokens: number; cachedTokens: number; daily: { day: string; requests: number }[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
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
      let pageCount = 0;
      const deadline = Date.now() + TOTAL_TIMEOUT_MS;
      while (offset < MAX_ROWS && pageCount < MAX_PAGES) {
        pageCount++;
        const request = client.listLLMRequests(bankId, { start_date: month.toISOString(), limit: PAGE_SIZE, offset });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          const remaining = deadline - Date.now();
          timer = setTimeout(() => reject(new Error("LLM_REQUESTS_TIMEOUT")), Math.max(0, Math.min(REQUEST_TIMEOUT_MS, remaining)));
        });
        let response: Awaited<typeof request>;
        try {
          response = await Promise.race([request, timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
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
          requests: entries.length,
          inputTokens: entries.reduce((sum, entry) => sum + (entry.input_tokens ?? 0), 0),
          outputTokens: entries.reduce((sum, entry) => sum + (entry.output_tokens ?? 0), 0),
          cachedTokens: entries.reduce((sum, entry) => sum + (entry.cached_tokens ?? 0), 0),
          daily: Array.from({ length: 7 }, (_, index) => {
            const day = new Date(today);
            day.setUTCDate(day.getUTCDate() - (6 - index));
            const isoDay = day.toISOString().slice(0, 10);
            return { day: isoDay, requests: entries.filter((entry) => entry.started_at?.slice(0, 10) === isoDay).length };
          }),
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
      {error ? <p className="text-sm text-muted-foreground">A consulta de consumo excedeu o tempo permitido ou falhou. Atualize a página para tentar novamente.</p> :
        !state ? <p className="text-sm text-muted-foreground" role="status">Calculando a partir das requisições registradas…</p> :
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Hoje</p><p className="text-2xl font-semibold tabular-nums">{displayCost(state.today)}</p></div>
            <div><p className="text-xs text-muted-foreground">Mês atual</p><p className="text-2xl font-semibold tabular-nums">{displayCost(state.month)}</p></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Volume de consumo observado no mês">
            <div><p className="text-xs text-muted-foreground">Chamadas observadas</p><p className="text-lg font-semibold tabular-nums">{state.requests.toLocaleString("pt-BR")}</p></div>
            <div><p className="text-xs text-muted-foreground">Tokens de entrada</p><p className="text-lg font-semibold tabular-nums">{state.inputTokens.toLocaleString("pt-BR")}</p></div>
            <div><p className="text-xs text-muted-foreground">Tokens de saída</p><p className="text-lg font-semibold tabular-nums">{state.outputTokens.toLocaleString("pt-BR")}</p></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Tokens de entrada em cache registrados: {state.cachedTokens.toLocaleString("pt-BR")} (já incluídos na entrada).</p>
          <div className="mt-4" aria-label="Chamadas observadas nos últimos sete dias">
            <p className="text-xs font-medium text-foreground">Chamadas · últimos 7 dias (UTC)</p>
            <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">{state.daily.map((day) => (
              <div key={day.day} className="min-w-0 text-center" title={`${day.day}: ${day.requests} chamadas`}>
                <div className="flex h-12 items-end justify-center rounded-md bg-muted/40 p-1">
                  <div className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.max(day.requests > 0 ? 8 : 0, (day.requests / Math.max(1, ...state.daily.map((item) => item.requests))) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{day.day.slice(5)}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{day.requests}</p>
              </div>
            ))}</div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Banco: {bankId} · Entrada {state.month.pricedCalls ? money(state.month.inputUsd) : "Indisponível"} · Saída {state.month.pricedCalls ? money(state.month.outputUsd) : "Indisponível"} · Cache {state.month.pricedCalls ? money(state.month.cacheUsd) : "Indisponível"}
          </p>
          {state.month.rows.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {state.month.rows.map((r) => <li key={r.provider + "/" + r.model} className="flex min-w-0 flex-wrap justify-between gap-2">
              <span className="break-all">{r.provider} / {r.model} · {r.calls} chamadas</span>
              <span className="tabular-nums">{money(r.usd)}</span>
            </li>)}
          </ul>}
          <p className="mt-2 text-xs text-muted-foreground">
            Processamento local: {state.month.localCalls} chamadas no mês ({state.today.localCalls} hoje).
            Sem tarifa de API externa; custos de infraestrutura não incluídos.
          </p>
          {(state.month.unknownCalls > 0 || state.today.unknownCalls > 0 || state.partial) && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400" role="status">
            {state.month.unknownCalls > 0 ? `${state.month.unknownCalls} chamadas sem preço/uso verificável no mês; total conhecido não representa o gasto completo. ` : ""}
            {state.today.unknownCalls > 0 ? ` Hoje: ${state.today.unknownCalls} chamadas não precificadas.` : ""}
            {state.partial ? "Amostra limitada; totais de hoje e do mês podem estar incompletos." : ""}
          </p>}
          {state.month.unknownReasons.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="font-medium">Diagnóstico das chamadas não precificadas (até 5 grupos):</p>
              <ul className="mt-1 space-y-1">
                {state.month.unknownReasons.slice(0, 5).map((item) => (
                  <li key={JSON.stringify([item.provider, item.model, item.reason])} className="break-all">
                    {item.calls} × {item.provider} / {item.model} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Visão baseada em traces disponíveis (até 1.000 eventos no mês). O ledger persistente já está no banco, mas ainda não alimenta este card. Não use estes totais como faturamento.</p>
        </>
      }
    </section>
  );
}
