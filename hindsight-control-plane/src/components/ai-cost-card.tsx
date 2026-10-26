"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { client, type LedgerUsageResponse, type LLMRequestEntry } from "@/lib/api";
import { estimateCost } from "@/lib/ai-cost";

const usd = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(value);
const count = (value: number) => value.toLocaleString("pt-BR");

type Projection = {
  knownUsd: number; pricedCalls: number; unpricedCalls: number;
  localCalls: number; inputUsd: number; outputUsd: number; cacheUsd: number;
  rows: { name: string; calls: number; value: number | null; local: boolean }[];
};
function priceLedger(data: LedgerUsageResponse): Projection {
  let knownUsd = 0, pricedCalls = 0, unpricedCalls = 0, localCalls = 0;
  let inputUsd = 0, outputUsd = 0, cacheUsd = 0;
  const rows: Projection["rows"] = [];
  for (const model of data.models) {
    const entry = {
      id: "aggregated", bank_id: data.bank_id, provider: model.provider,
      model: model.model, input_tokens: model.missing_usage ? null : model.input_tokens,
      output_tokens: model.missing_usage ? null : model.output_tokens,
      cached_tokens: model.cached_tokens,
    } as LLMRequestEntry;
    const estimate = estimateCost([entry], undefined, data.bank_id);
    const local = estimate.localCalls > 0;
    const priced = estimate.pricedCalls > 0;
    if (local) localCalls += model.calls;
    else if (priced) {
      pricedCalls += model.calls;
      knownUsd += estimate.knownUsd;
      inputUsd += estimate.inputUsd;
      outputUsd += estimate.outputUsd;
      cacheUsd += estimate.cacheUsd;
    } else unpricedCalls += model.calls;
    rows.push({ name: `${model.provider ?? "?"} / ${model.model ?? "?"}`, calls: model.calls,
      value: priced ? estimate.knownUsd : null, local });
  }
  // When cardinality is truncated, never represent the model breakdown as complete.
  if (data.models_truncated) unpricedCalls += Math.max(0, data.totals.calls - pricedCalls - unpricedCalls - localCalls);
  return { knownUsd, pricedCalls, unpricedCalls, localCalls, inputUsd, outputUsd, cacheUsd, rows };
}

export function AiCostCard({ bankId, enabled }: { bankId: string; enabled: boolean }) {
  const [data, setData] = useState<{ month: LedgerUsageResponse; today: LedgerUsageResponse } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setData(null); setError(false);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = now.toISOString();
    Promise.all([
      client.readUsageLedger(bankId, month.toISOString(), end),
      client.readUsageLedger(bankId, today.toISOString(), end),
    ]).then(([monthData, todayData]) => {
      if (active && monthData.bank_id === bankId && todayData.bank_id === bankId) {
        setData({ month: monthData, today: todayData });
      } else if (active) setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [bankId, enabled]);
  if (!enabled) return null;
  const month = data ? priceLedger(data.month) : null;
  const today = data ? priceLedger(data.today) : null;
  const daily = data?.month.daily.slice(-7) ?? [];
  const externalUnknown = !!month && month.unpricedCalls > 0;
  const coverageUnverified = !!data && !data.month.coverage.historical_backfill_confirmed;
  const costLabel = (projection: Projection, calls: number) =>
    projection.pricedCalls > 0 ? usd(projection.knownUsd) :
    calls === 0 ? "Sem consumo registrado" :
    projection.localCalls === calls ? "Somente processamento local" : "Custo não calculável";
  const breakdownLabel = (projection: Projection, value: number) =>
    projection.pricedCalls > 0 ? usd(value) :
    projection.localCalls > 0 && projection.unpricedCalls === 0 ? "Não aplicável" : "Desconhecido";
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Custo estimado de IA">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-foreground">Custo estimado de IA</h2>
        <span className="text-xs text-muted-foreground">USD · estimativa, não é fatura · UTC</span>
      </div>
      {error ? <p role="alert" className="text-sm text-muted-foreground">Histórico persistente indisponível. Nenhum valor foi substituído por zero.</p> :
       !data || !month || !today ? <p role="status" className="text-sm text-muted-foreground">Carregando ledger persistente…</p> :
       <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Hoje</p><p className="text-2xl font-semibold tabular-nums">{costLabel(today, data.today.totals.calls)}</p></div>
          <div><p className="text-xs text-muted-foreground">Mês atual</p><p className="text-2xl font-semibold tabular-nums">{costLabel(month, data.month.totals.calls)}</p></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Consumo registrado no mês">
          <div><p className="text-xs text-muted-foreground">Chamadas persistidas</p><p className="text-lg font-semibold tabular-nums">{count(data.month.totals.calls)}</p></div>
          <div><p className="text-xs text-muted-foreground">Tokens de entrada</p><p className="text-lg font-semibold tabular-nums">{count(data.month.totals.input_tokens)}</p></div>
          <div><p className="text-xs text-muted-foreground">Tokens de saída</p><p className="text-lg font-semibold tabular-nums">{count(data.month.totals.output_tokens)}</p></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Tokens de entrada em cache (incluídos na entrada): {count(data.month.totals.cached_tokens)}.</p>
        <div className="mt-4">
          <p className="text-xs font-medium">Chamadas por dia · UTC</p>
          <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
            {daily.map(day => <div key={day.day} className="min-w-0 text-center">
              <div className="flex h-12 items-end rounded-md bg-muted/40 p-1">
                <div className="w-full rounded-sm bg-primary/70" style={{height: `${Math.max(day.calls ? 8 : 0, 100 * day.calls / Math.max(1,...daily.map(d=>d.calls)))}%`}}/>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{day.day.slice(5)}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">{day.calls}</p>
            </div>)}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Banco: {bankId} · Entrada {breakdownLabel(month, month.inputUsd)} · Saída {breakdownLabel(month, month.outputUsd)} · Cache {breakdownLabel(month, month.cacheUsd)}</p>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {month.rows.map((r,i)=><li key={i} className="flex min-w-0 flex-wrap justify-between gap-2"><span className="break-all">{r.name} · {count(r.calls)} chamadas</span><span>{r.local ? "Processamento local · custo de API não aplicável" : r.value===null ? "Sem tarifa ou tokens verificáveis" : usd(r.value)}</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Processamento local: {count(month.localCalls)} chamadas. Infraestrutura não incluída.</p>
        {externalUnknown && <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {count(month.unpricedCalls)} chamadas externas sem custo calculável. Verifique tarifas e tokens do provedor.
        </p>}
        {data.month.totals.missing_usage > 0 && <p className="mt-2 text-xs text-muted-foreground">
          {count(data.month.totals.missing_usage)} chamadas sem contagem de tokens, incluindo processamento local; isso não implica falha de cobrança.
        </p>}
        {coverageUnverified && <p role="status" className="mt-2 text-xs text-muted-foreground">
          Histórico anterior à captura persistente ainda não reconciliado. Primeira ocorrência armazenada nesta janela: {data.month.coverage.earliest ?? "não registrada"}.
          Não confundir ausência de registros com custo zero.
        </p>}
        {data.month.models_truncated && <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          A lista de modelos está limitada; os custos apresentados podem ser parciais.
        </p>}
        <p className="mt-2 text-xs text-muted-foreground">Fonte: ledger persistente. Janela UTC {data.month.start.slice(0,10)} a {data.month.end.slice(0,10)}; primeira ocorrência na janela: {data.month.coverage.earliest ?? "não registrada"}. Valores não representam faturamento conciliado.</p>
       </>}
    </section>
  );
}
