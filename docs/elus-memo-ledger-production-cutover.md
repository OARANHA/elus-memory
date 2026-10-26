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

## Reconciliação Portainer (verificada em 26/10/2026)
- `portainer_status`: Portainer 2.45.0 em `https://portainer.wandora.com.br`.
- `portainer_endpoints_list`: endpoint **ID 3**, nome **`local`**, tipo Docker standalone (Type 1), Status 1.
- `portainer_stack_get(12)`: stack `elus-memory`, status 1, `EndpointId=3`, branch GitOps `refs/heads/main`, `ConfigHash=ffe55c8c257e6f8f13ea8223d0edc4f91b669619`, compose `deploy/elus/compose.yaml`. A instância possui 16 variáveis de stack configuradas, mantidas redigidas.
- `portainer_stacks_list`: existe também stack `elus-memory-oauth` ID 13, endpoint 3. Não confundir com volume/banco do serviço Hindsight.
- A listagem Docker `wandora-agent` inclui outros serviços Wandora, **não** inclui o Hindsight; essa fonte **não comprova** saúde, mounts ou localização física da stack `elus-memory`.
- A conexão disponível com Portainer expõe metadados de stack e endpoints, mas **não** disponibilizou operação de inspect de contêiner/volumes do endpoint 3 nesta sessão. Portanto, o caminho `.pg0` é o caminho definido no Compose, ainda **não verificado** como mount efetivo de um contêiner em execução.

### Gate de evidência antes do backup real
Usar uma capacidade explicitamente autorizada de **leitura** do Docker endpoint 3, ou a interface Portainer, para obter apenas: ID/nome do contêiner da stack 12, labels, imagem/digest, status/health, mounts (tipo, origem nomeada/destino), modo read-write, versão do PostgreSQL embarcado, espaço livre e contagem de schemas/traces sem conteúdo. Não executar `docker cp`, comandos SQL de mutação, snapshot, `pg_dump`, restart ou redeploy enquanto não houver plano autorizado de backup seguro.

## Diagnóstico do target Docker (26/10/2026)
- MCP `host_status(wandora-agent)` e `host_status(wandora-prod)` = `wandora-vps-01`.
- MCP `docker_list(wandora-agent)`: 7 contêineres disponíveis, nenhum `elus-memory`; `docker_list(wandora-prod)` = 0 (sem capability Docker autorizada). O endpoint Portainer `local` ID 3 pode estar no Docker Engine local ao Portainer ou em outro contexto; **não há prova de equivalência entre estes engines**.
- Não conceder Docker socket global ao MCP, nem afrouxar allowlists. Primeiro validar nome/container IDs, Docker Engine ID, mounts e labels com comandos **somente leitura** no host do Portainer; depois restringir os nomes autorizados.
- Comandos recomendados (no host correto, sem segredos):
```bash
hostname
docker info --format 'Engine={{.Name}} Root={{.DockerRootDir}}'
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep -Ei 'hindsight|elus|memo' || true
docker ps -a --filter 'label=com.docker.compose.project=elus-memory' --format '{{.ID}} {{.Names}}'
# Substituir CONTÊINER pela identificação confirmada, nunca pela stack 13 OAuth:
docker inspect CONTÊINER --format '{{json .Mounts}}' | jq '[.[] | {Type,Name,Destination,RW}]'
```
- Não copiar `.pg0` enquanto PostgreSQL estiver em execução. Apenas depois de comprovar mounts, versão do banco, política de backup, controle de acesso, armazenamento seguro e isolamento de clone poderá ser autorizada uma operação de backup.
