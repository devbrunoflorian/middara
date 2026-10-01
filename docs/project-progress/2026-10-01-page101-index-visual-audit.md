# Auditoria visual inglesa: índice da página 101

- **Status:** concluída em 2026-10-01; não foi confirmado defeito visual e não houve alteração de app/dados.
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

## Execução e resultado

- O PDF-fonte físico 101 foi observado em `tmp/book-fidelity-audit/source-renders/page-101.png`; no app, a página 101 foi aberta em EN/Admin desligado. Comparação do quadro completo em Fit-to-Screen (100%) e passagem pelas três colunas em zoom de leitura (200%), incluindo a parte superior e a parte inferior de cada grupo.
- A hierarquia do título, as três colunas, margens, linhas de leader, recuos/subentradas, números alinhados no fim das entradas e fólio 101 correspondem ao render-fonte. Não foi observada quebra cruzada entre colunas nem colisão/corte dos leaders ou referências.
- Os casos previamente sinalizados como “Values / Back” e “Ending all Actions and Abilities” foram confirmados no PDF na mesma disposição/conteúdo; não são erro do viewer. As entradas de várias páginas (p.ex. `25,38`, `100,41-43`) continuam como refs no mesmo baseline/entrada, e os indents visíveis correspondem às subentradas do original.
- O scan já registrava equivalência de 995 spans entre PDF e JSON; a comparação visual confirmou a composição geral em escala legível. O procedimento não foi uma comparação tipográfica caractere-a-caractere das 197 referências e não substitui QA de tradução/live preview.
- **Sem alteração de produção:** nada foi editado em React, JSON ou drafts. A matriz passa para `visual-reviewed` com seus sinais mecânicos inalterados. O browser ficou na página 101 em Fit-to-Screen (100%).
- **Limites:** a escala Fit isolada é pequena demais para avaliar entradas; por isso a inspeção incluiu 200%. Não houve correção, expansão de tradução, acesso a storage nem leitura de rascunhos. Como não houve alteração de app, build/lint não se aplicavam.
- **Próxima fila:** páginas 4 e 13 têm feedback visual específico anteriormente registrado e seguem `needs-visual` na matriz; selecionar a próxima com base em estrutura e evidência, sem supor defeito por contagem de spans/fontes.
