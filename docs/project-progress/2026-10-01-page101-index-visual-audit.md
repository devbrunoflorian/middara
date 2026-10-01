# Auditoria visual inglesa: índice da página 101

- **Status:** aberta antes da inspeção visual; nenhuma alteração iniciada.
- **Data:** 2026-10-01.
- **Ponto de partida:** checkpoint `3179d16` (`fix: remove residual card backings on page 6`) em `fix/pixel-render/overflow`, seis commits à frente do remoto; sem push. A página 6 foi revisada por inteiro e a página 5 e 7 também estão em `visual-reviewed`.
- **Referência de amostragem anterior:** [`2026-09-30-next-visual-sample-pages-6-101.md`](2026-09-30-next-visual-sample-pages-6-101.md) observou a estrutura geral das três colunas, mas não revisou as 197 entradas em escala de leitura; por isso a matriz ainda marca a página 101 como `needs-visual`.
- **Seleção pela matriz:** 995 spans no PDF/JSON, 11 imagens (6 de conteúdo), 2 blocos com estilos mistos, 0 PUA e 0 candidatos de centralização; o sinal relevante aqui é estrutura longa de índice com três colunas e leaders.

## Objetivo

Verificar que a página física 101 em inglês corresponde ao PDF original em hierarquia, linhas, leaders, alinhamento e número de página. Um item do índice deve ser agrupado por coluna e baseline; números de página no fim da entrada não devem ser unidos a outra coluna. Preservar casos que parecem estranhos, como “Values / Back”, se o próprio PDF os imprimir assim.

## Método planejado

1. Reler este handoff, rules 00/06/13 e QA visual/layout; ler o registro de amostra 6/101.
2. Renderizar/reutilizar `tmp/book-fidelity-audit/source-renders/page-101.png` e abrir a página 101 em EN/Admin desligado no browser local autorizado.
3. Comparar o quadro inteiro em Fit-to-Screen, depois percorrer as três colunas em escala de leitura, conferindo início/fim de coluna, headings, quebras, linhas longas, referências numéricas, leaders e fólio.
4. Cruzar suspeitas com PDF, `page_101_dom.json` e estrutura de conteúdo; distinguir erro de agrupamento/render de um item atípico que já esteja no original.
5. Se houver divergência, registrar causa e plano antes de qualquer edição; aplicar apenas correção baseada em evidência e rever a página inteira.

## Critério de encerramento

Atualizar a matriz para `visual-reviewed` somente depois de comparar as três colunas em leitura suficiente e os casos anômalos diretamente com o PDF. Registrar erros de método/correções, dúvidas e limitações. Sem tradução e sem acesso a drafts/storage. Build/lint se a inspeção exigir alteração de app.
