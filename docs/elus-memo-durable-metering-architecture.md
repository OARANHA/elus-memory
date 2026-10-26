# ELUS Memo — histórico permanente de custos (arquitetura e gates)

Estado em 2026-10-26: **Fase de fundação em PR, SEM armazenamento persistente novo**. Nenhum backfill nem migração de produção executados.

## Diagnóstico confirmado
A UI atual `AiCostCard` lê até 1000 `llm_requests` por banco em janela mensal. A implementação do motor registra `llm_requests` em lote em PostgreSQL, com retenção configurável. A persistência atual desses traces **não equivale** a um histórico financeiro imutável. Ver `hindsight-api-slim/hindsight_api/engine/llm_trace.py`.

## Modelo proposto (próximo gate)
1. **Evento imutável** `usage_ledger` em PostgreSQL no mesmo schema do tenant, `source_request_id UUID UNIQUE` (origem `llm_requests.id`), `bank_id NOT NULL`, `timestamp UTC`, `provider`, `model`, `operation`, `scope`, `status`, contadores `input/output/cached`, `price_version`, `estimated_cost_usd nullable`, `created_at`. Não persistir corpo de prompts ou respostas.
2. **Captura transacional na gravação do trace**: trigger `AFTER INSERT` no Postgres ou inserção dual na **mesma transação** do trace, antes da retenção e independente do componente React. SQL `ON CONFLICT (source_request_id) DO NOTHING` impede recontagem. Em caso de batch parcial, somente eventos efetivamente gravados entram.
3. **Agregação reprocessável** a partir do ledger por dia UTC/banco/modelo/operação/provedor; reclassificações de tarifa são novos registros de versão, nunca sobrescrever custo histórico ou fatura. Expor preços desconhecidos como **não classificados**, não US$0.
4. **Backfill antes do corte**: copiar traces ainda disponíveis em lotes pequenos com checkpoint e UPSERT idempotente; marca de cobertura `since` e progresso. Não extrapolar histórico expirado. Projetar limites por schema/tenant, índice `(bank_id, occurred_at)`, políticas de retenção próprias, locks e custo de escrita.
5. **Leitura na UI**: criar endpoint autenticado de histórico diário; manter estimativa dos traces como fallback enquanto o ledger não estiver validado. Sinalizar lacunas, eventuais chamadas não capturadas e ausência de preço.
6. **Reconciliação**: faturamento DeepInfra oficial é **por conta**; não atribuir automaticamente cobrança da conta a um banco. Validar unidades monetárias e janela com a DeepInfra primeiro.

## Nesta PR
`metering-projection.ts`: projeção pura de eventos com deduplicação de IDs, filtro estrito por banco, UTC e agrupamento diário; não executa escrita, schema, backfill ou alteração de runtime. Os testes garantem os principais invariantes. **Não anunciar como histórico permanente ativo.**

## Gates antes de implantar
- Revisar Alembic head e eventuais branches da árvore upstream, PostgreSQL e estratégia de implantação sem bloquear o motor de memória.
- Provar commit/rollback atômico da captura, `idempotência` diante de retries, schema multi-tenant, concorrência, e performance do flush.
- Testar migração e backfill em ambiente isolado com amostra sintética; verificar reversão preservando dados. Sem migração/batch em produção antes desses gates.
- Concluir o CI do Control Plane desta PR.
