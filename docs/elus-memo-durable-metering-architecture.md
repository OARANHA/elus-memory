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

## SQL candidata adicionada (ainda não executada)
- `deploy/elus/migrations/001_usage_ledger_candidate.sql`: tabela sem FK para `llm_requests` (deve sobreviver à retenção), trigger transacional `AFTER INSERT` e unicidade de `source_request_id`. Captura **uso bruto**, sem valor monetário presumido; preço/versionamento serão tratados por trilha separada.
- `deploy/elus/migrations/002_usage_ledger_backfill_example.sql`: modelo manual de backfill em fatias diárias UTC, idempotente; é **um exemplo parametrizável**, não executar como está em produção.
- **Bloqueios antes de ativar**: resolver o head Alembic upstream; parametrizar schema por tenant e testar permissões; garantir que exceção do trigger não provoque indisponibilidade do gravador de traces; testar performance de gravação/retention e dados sintéticos; definir plano de rollback da trigger sem descartar ledger.
- O SQL usa tabelas não qualificadas e requer o `search_path` correto **deliberadamente não inferido**; execução automatizada sem validação do schema é proibida.

## Gate PostgreSQL isolado, 2026-10-26
- Workflow `.github/workflows/elus-memo-ledger-postgres.yml` usa Postgres 16 efêmero e executa `deploy/elus/tests/usage_ledger.pg.sql`.
- Testes confirmados no CI: trigger captura eventos, idempotência no replay do backfill, rollback de trace não deixa uso, exclusão do trace não elimina o ledger, CHECK rejeita tokens negativos, e isolamento entre schemas `public` e `tenant_b` mesmo com `search_path` do cliente diferente. Registro por trigger usa `TG_TABLE_SCHEMA` com `format('%I', ...)`.
- Evidência: https://github.com/OARANHA/elus-memory/actions/runs/40277503683 (GREEN). **Não equivale a upgrade Alembic, captura de preços nem histórico em produção.**

## Gate Alembic + rollback isolado, 2026-10-26
- O grafo completo de revisões foi verificado por `deploy/elus/tests/check_alembic_heads.py` no CI: 116 revisões na `main` e um único head `c7e2f9a4d1b8`. A revisão ELUS `e1u5c0st2026` continua a partir desse head.
- Migration PG-only: `hindsight-api-slim/hindsight_api/alembic/versions/e1u5c0st2026_elus_usage_ledger.py`, com `target_schema` isolado, trigger `TG_TABLE_SCHEMA`; downgrade **desativa captura mas preserva os dados financeiros**.
- O script `deploy/elus/tests/test_alembic_ledger.py` executa **o corpo real da revisão**, com adaptadores isolados para op/context/dialect, em PostgreSQL 16 efêmero; valida upgrade, registro, downgrade com histórico preservado e reupgrade. Não é um upgrade completo de toda a árvore da aplicação.
- Evidência GitHub Actions: https://github.com/OARANHA/elus-memory/actions/runs/40281049736 — **GREEN**.
- **Não foi executada a migração no servidor de produção nem realizado merge/deploy.** Ainda validar Alembic full `upgrade head` em ambiente espelho com tabela real existente e estratégia de desligar trigger sob falhas de gravação, antes de liberar a PR.

## Gate do Alembic de aplicação — 2026-10-26
- Script `deploy/elus/tests/test_alembic_command.py` usa **Alembic real** (`command.stamp`, `command.upgrade`, `command.downgrade`) e a `env.py` verdadeira do Hindsight em PostgreSQL isolado. Pré-requisito: esquema mínimo equivalente ao predecessor `c7e2f9a4d1b8` construído e marcado no teste. Testa criação do ledger, captura da chamada, rollback do schema preserving ledger e novo upgrade.
- GitHub Actions https://github.com/OARANHA/elus-memory/actions/runs/40282016756 — GREEN.
- Limite explícito: ainda não é **upgrade de todas as revisões desde base/zero**, nem snapshot de produção; é o ciclo operacional de Alembic da nossa revisão sobre predecessor marcado. Bloqueio de deploy real mantido. [verified: 2026-10-26]

## Gate full base-to-head do Hindsight em PG isolado (26/10/2026)
- Teste `deploy/elus/tests/test_alembic_full_chain.py`: **sem stamp** de predecessor, `alembic upgrade head` percorre todas as revisões desde um schema vazio, usando ambiente e runtime reais do Hindsight; confirma `alembic_version=e1u5c0st2026`, tabelas `llm_requests` e `elus_usage_ledger`.
- No PostgreSQL genérico (sem extensão vector), o gate falhou; CI foi ajustado para `pgvector/pgvector:pg16` e o gate completo ficou **GREEN**: https://github.com/OARANHA/elus-memory/actions/runs/40282804101. O insucesso intermediário não era prova de erro da migração ELUS; o pré-requisito da extensão estava ausente.
- Isso valida bootstrap em banco vazio, **não** um clone anonimizado do banco real, plano de backup/rollback de Portainer, nem desempenho com volume de produção. PR permanece draft; sem migração em produção.

## Gate de banco populado sintético (26/10/2026)
- `deploy/elus/tests/test_alembic_populated.py` cria schema tenant populado **antes** do upgrade, aplica Alembic real a partir do predecessor marcado `c7e2f9a4d1b8`, confirma que traces antigos permanecem e são retroalimentados ao ledger por backfill idempotente (dois replays), captura novo trace automaticamente, apaga traces para simular retenção sem perder custos, verifica bancos separados e faz downgrade/reupgrade preservando ledger.
- CI PostgreSQL real com pgvector GREEN: https://github.com/OARANHA/elus-memory/actions/runs/40283580510; CI Control Plane e canário GREEN: https://github.com/OARANHA/elus-memory/actions/runs/40283580521.
- Limite: ambiente **sintético marcado no predecessor**, não cópia/snapshot real do banco Hindsight em produção. Falta ensaio de backup/restore e homologação equivalente à produção antes de ativar. Nenhuma migração em produção executada.

## Gate backup e restauração sintéticos (26/10/2026)
- `deploy/elus/tests/backup_restore_fixture.sql` prepara schema sintético com llm_requests + elus_usage_ledger e trigger; `test_backup_restore.sh` realiza `pg_dump --format=custom`, exclui schema do banco efêmero, restaura com `pg_restore --single-transaction --exit-on-error`, confere ledger/traces e nova captura após restore.
- CI usa cliente `postgres:16` via contêiner, compatível com servidor `pgvector/pgvector:pg16`; as tentativas com cliente não correspondente ou pacote indisponível falharam, e foram corrigidas. GREEN final PostgreSQL: https://github.com/OARANHA/elus-memory/actions/runs/40284634638; GREEN Control Plane: https://github.com/OARANHA/elus-memory/actions/runs/40284634665.
- Gate **não** valida backup/restauração de produção nem substitui um plano de manutenção; PR mantém draft e nenhum deploy/migração foi aplicado. Antes de ativar: inspecionar configuração de volumes PostgreSQL e executar plano de recuperação em ambiente isolado autorizado com equivalência operacional, além de definir janela e rollback.
