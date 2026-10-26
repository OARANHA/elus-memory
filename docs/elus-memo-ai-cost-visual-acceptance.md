# Elus Memo — aceite visual do card de custo (PR #1)

Status: **não executado em navegador**; checklist para prévia isolada da branch. Nenhuma mudança em produção.

## Cenários que precisam ser comprovados

1. Desktop em 1440px: alinhamento do título e totais, hierarquia visual e linhas por modelo sem overflow.
2. Mobile em 390px: sem rolagem horizontal da página; valores USD não truncados; cartões de entrada/saída/cache empilhados; identificadores longos quebram linha.
3. Modo claro e escuro: contraste do alerta e legibilidade das quantias.
4. Banco com preços cadastrados: valores hoje/mês em USD, entrada/saída/cache, descrição explícita 'estimativa, não é fatura'.
5. Banco sem preços: exibir 'Indisponível' em vez de US$ 0,00; explicar valores não precificados.
6. Banco sem traces e banco com dados incompletos: distinguir ausência de dados, preço desconhecido e paginação parcial.
7. Alterar banco durante a consulta: não reaproveitar valores do banco anterior.
8. Acessibilidade: inspeção da árvore semântica, navegação por teclado, status assíncronos e ampliação de texto.
9. Traces duplicados entre páginas: custo não duplica o mesmo identificador.

## Critério de liberação

Aprovar a revisão visual apenas com evidências de renderização reais na versão candidata, em navegador, preferencialmente acompanhadas de capturas desktop e mobile. CI TypeScript/ESLint/Vitest é requisito adicional, não substituto.

**Não marcar como GREEN a validação visual apenas com leitura de TSX ou execução dos testes unitários.**
