# Elus Memo — Custos estimados de IA

Status: **Fase 1 (Control Plane; sem alterações no motor)** — 2026-10-25.

## Entrega
- Card no Início do banco, condicionado ao recurso `llm_trace`.
- Consulta paginada de `/llm-requests` por banco e mês UTC.
- Estimativa em USD por provedor/modelo e componentes entrada, saída e cache.
- Catálogo DeepInfra com 45 modelos e preços de entrada, saída e cache fornecidos pelo proprietário em 2026-10-25, presumidos USD por milhão de tokens; modelos sem tarifa completa são **não precificados**. A unidade e condições contratuais não foram verificadas independentemente.
- Resultado é subtotal conhecido, não fatura, e não inclui dados apagados/expirados.
- Limite de 5.000 traces por montagem: sinalizar valor parcial; não declarar total completo.

## Próxima fase — total durável sem chamadas LLM
A implementação atual **não preserva totais após expiração**. Para isso, criar um agregado durável por `bank_id + provider + model + UTC date + rate_version`, armazenando quantidades de tokens e contagem de eventos; custos são calculados por preços versionados. Uma coleta incremental deve usar identificador único `llm_request.id` e marca d'água, idempotência e reconciliação antes do TTL dos traces. Retenção dos agregados deve ser independente do TTL da tabela de traces.

**Gates obrigatórios antes de implementar:** identificar a fonte e a política real de expiração, estratégia para evitar perda entre checkpoints, modelo de tenancy, tratamento de falhas e duplicações, fonte confiável de tarifas históricas, e preservação de gastos sem taxa conhecida. Um agregado de cache sem preço não equivale a custo zero. Não executar `retain`, `recall` ou `reflect` para calcular custo.

## Limites
- Preços de mercado variam e podem ser negociados; a tabela recebida do proprietário é referência informada, não fonte de faturamento.
- A fórmula assume que `cached_tokens` integra `input_tokens`; confirmar o contrato de cada provider antes da cobertura ampliada.
- `thoughts_tokens` não é adicionado novamente quando já compõe `output_tokens`.
- Registros sem preço verificado ou com contagem inconsistente não somam ao subtotal.
- Não há migração, deploy, alteração do banco ou mudança do motor na Fase 1.
