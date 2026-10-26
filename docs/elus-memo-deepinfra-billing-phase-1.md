# ELUS Memo — DeepInfra Billing Read-only (Fase 1)

Status: **candidato em PR; NÃO implantado**.

Endpoint protegido no Control Plane: `GET /api/finance/deepinfra?from=current` ou `from=YYYY.MM`.
Consulta exclusivamente `GET https://api.deepinfra.com/payment/usage` e `GET https://api.deepinfra.com/payment/checklist`, usando `DEEPINFRA_BILLING_API_TOKEN` **somente no servidor**. A chave nunca sai nas respostas, erros ou logs. Exige sessão assinada por `HINDSIGHT_CP_ACCESS_KEY` mesmo se o middleware global estiver sem chave. Sem credencial, retorna 503; não deve receber a chave de inferência sem aprovação sobre seu escopo.

A resposta sanitizada oferece custo bruto por mês/modelo/tipo de token, `stripe_balance_raw`, `recent_raw`, indicadores de suspensão e `scoped_credits.remaining_usd` (este último explicitamente em centavos na documentação).

**Bloqueio de apresentação monetária:** o esquema público não especifica unidades de `cost`, `rate`, `total_cost`, `stripe_balance` ou `recent`. A API interna responde `billingUnit: "unverified"`; não divide custos por 100 nem mostra dólares para esses campos até reconciliar uma resposta sanitizada com a UI de faturamento real do provedor. O exemplo de custo 107 → US$ 1,07 fornecido pelo proprietário deve ser verificado em uma fatura/período real.

**Limites:** o uso oficial DeepInfra é por conta; não atribuir automaticamente todos os gastos a um banco. As medições por banco existentes são estimativas de traces (amostra de até 1.000), não conciliação oficial. Não há carteiras de clientes, recarga automática, cobranças ou créditos comerciais.

Gates para próxima fase:
1. PR CI GREEN (TypeScript, ESLint, unitários).
2. Confirmar segredo `DEEPINFRA_BILLING_API_TOKEN` provido e guardado no Portainer, com privilégios mínimos e validação da rota protegida; **não registrar segredo em Git nem pedir que seja colado no chat**.
3. Comparar campos brutos da API a um mês específico e ao dashboard oficial, validar unidades por campo.
4. Só depois construir dashboard financeiro global e badge de saldo, sem prometer saldo com base em `stripe_balance` sem conciliação.
5. Adicionar persistência e atribuição contábil por banco separadamente.

Fontes:
- https://docs.deepinfra.com/api-reference/billing/usage
- https://docs.deepinfra.com/api-reference/billing/get-checklist
