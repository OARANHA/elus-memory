# ELUS Memo — plano de implantação do ledger (NO-GO até validação real)

## Infraestrutura identificada em 26/10/2026

- Stack Portainer `elus-memory`, ID 12, GitOps `deploy/elus/compose.yaml`.
- Serviço `hindsight` usa **PostgreSQL embarcado** via volume Docker nomeado `hindsight_data` montado em `/home/hindsight/.pg0`. Não pressupor Postgres externo nem copiar DB em escrita.
- Produção ativa: imagem GHCR candidata do commit `ffe55c8c257e6f8f13ea8223d0edc4f91b669619`.
- A PR #7 tem migração Alembic `e1u5c0st2026`, trigger de contabilização bruta, testada com PG16/pgvector em CI, mas não ativada.

## Pré-voo obrigatório no HOST REAL (somente leitura)
1. Descobrir endpoint/host Docker da stack 12: `docker inspect` do serviço correto **por label da stack** e listar mounts reais, estado de saúde e image digest, sem expor valores das variáveis.
2. Identificar **versão efetiva e localização real** do PostgreSQL embarcado em `.pg0`; descobrir como o processo Hindsight executa Alembic por tenant e quando inicia migrações. Não assumir que a versão do container PG é 16 porque o CI usa 16.
3. Consultar `alembic_version` em cada schema/tenant autorizado e confirmar predecessor / head; inventariar bancos e contagens de `llm_requests` sem leitura dos prompts.
4. Verificar espaço livre para **cópia protegida, independente, testada**; proprietário e permissões do volume e ferramenta consistente de backup (pg_dump do mesmo major do servidor ou snapshot físico realmente quiescente).

## Backup e ensaio
- Manter a aplicação na versão anterior até existir artefato de recuperação verificável **fora do volume de produção**.
- Executar backup consistente sob procedimento documentado; não enviar dump contendo memória, PII ou segredos ao chat/GitHub/CI.
- Restaurar em clone efêmero isolado e verificar: schema, contagens, versão Alembic, leitura dos bancos de memória e reexecução do upgrade. Testar retorno à imagem anterior com rollback da trigger sem exclusão do ledger.
- Calcular checksum SHA-256 do backup local e registrar apenas o hash, tamanho, carimbo UTC e local operacional protegido, sem revelar caminhos sensíveis.

## Cutover e rollback
1. Janela de manutenção e garantia de backup recuperável; interromper escritas no Hindsight antes de qualquer migração.
2. Concluir ensaio sobre clone do banco **real**, validar desempenho e correção do trigger; só então liberar a PR após CI GREEN e revisão do diff.
3. Aplicar imagem GHCR **imutável** por Portainer mantendo exatamente o mesmo volume e env, sem prune; verificar o serviço, memória, ledger e versão antes de liberar escritas.
4. Backfill **idempotente** por fatias UTC com limite de volume, checkpoint, sem exportar prompts. Ajustar captura de preços somente depois de preservar custos brutos; preços/faturas não são assumidos na versão da migration.
5. Se gate RED: **NO-GO**, parar novas gravações e aplicar procedimento de reversão comprovado em clone. Downgrade da migration desativa trigger sem apagar ledger. Jamais restaurar dados antigos sobre eventos produzidos depois sem plano explícito de reconciliação.

## Estado de autorização
Documento de planejamento, **não autoriza** iniciar comandos de escrita no PostgreSQL/volume de produção. Solicitar autorização explícita para a janela e backup do banco real quando todos os requisitos de leitura e capacidade estiverem confirmados.
