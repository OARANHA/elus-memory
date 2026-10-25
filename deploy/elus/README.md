# ELUS Memory: implantação Wandora

Origem: https://github.com/vectorize-io/hindsight (MIT).
Repositório: https://github.com/OARANHA/elus-memory
Domínio planejado: https://memo.elus360.com.br
Portainer: ambiente 3, stack `elus-memory`.

## Primeira implantação (privada)

O arquivo `deploy/elus/compose.yaml` usa a imagem oficial do Hindsight e volume persistente embutido (pg0). Ele **não publica portas**. No Portainer, configure `HINDSIGHT_API_LLM_API_KEY` como segredo da Stack antes da implantação. Opcionalmente ajuste `HINDSIGHT_API_LLM_PROVIDER`, `HINDSIGHT_API_LLM_MODEL` e `HINDSIGHT_VERSION`.

Não inclua segredos no Git. Não exponha a API ou UI sem autenticação. O Traefik Wandora utiliza provedor de arquivos; labels Docker isoladas não disponibilizam rotas. Depois de validar a instância internamente, configurar roteamento autenticado, TLS, banco, permissões por bank e fluxo OAuth/MCP do ChatGPT. O registro DNS do Cloudflare deve ser verificado.

## Critérios de verificação
- Fonte Hindsight importada pelo workflow e commit confirmado.
- Container inicializa com configuração de LLM válida.
- API e UI respondem internamente.
- Persistência após reinício testada.
- HTTPS e acesso autenticado validados antes da publicação.
- retain/recall/reflect testados em um banco de teste, sem migrar registros reais.
