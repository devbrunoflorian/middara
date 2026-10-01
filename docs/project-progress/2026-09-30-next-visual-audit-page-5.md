# Próxima auditoria visual inglesa: página 5

- **Status:** planejada; ainda não começou a inspeção visual nem houve alteração de app/dados.
- **Data:** 2026-09-30.
- **Ponto de partida:** tarefa de amostra 6/101 registrada em [`2026-09-30-next-visual-sample-pages-6-101.md`](2026-09-30-next-visual-sample-pages-6-101.md); verificar o commit/save point no handoff antes de implementar.
- **Seleção:** a linha da página 5 em `book-fidelity-page-matrix.csv` tem 489 spans, 42 blocos com estilos mistos, 131 imagens (126 marcadas como conteúdo), 48 spans em risco de mapeamento de fonte e 6 candidatos de centralização. São sinais para escolher a amostra, não defeitos confirmados.

## Objetivo

Comparar a página 5 inglesa do app com a página física 5 do PDF, identificar diferenças reais de tipo, arte, colunas, imagens e sobreposições, e registrar se algum achado pode alimentar critérios para as demais páginas. Não expandir tradução.

## Método planejado

1. Confirmar a fila e regras no `CONTINUE-HERE.md`, revisar `visual-fidelity-qa` e `07-fantasmas-e-artefatos-duplicados.md`, e ler a linha 5 da matriz.
2. Renderizar o PDF-fonte original e abrir página 5 em EN no app; comparar na mesma escala e conferir o quadro inteiro antes de aproximar regiões.
3. Inspecionar candidatos de fonte no JSON contra o nome/estilo no PDF, inclusive Aristelle, Cinzel Decorative, pesos e alinhamentos; distinguir textos visíveis na imagem de overlays vetoriais e verificar se há duplicação.
4. Se houver defeito, identificar o caminho de pintura/dados antes da correção; não aplicar o patch/mascara da página 6, regra de crédito da página 2 ou ajustes de headings das páginas 4/13 sem evidência local.
5. Implementar apenas correção reversível e delimitada à página/amostra, repetir comparação antes/depois, atualizar matriz e registrar falhas/limitações. Build/lint após alteração de código.

## Critério de encerramento

Relatório deve indicar achados confirmados ou ausência de defeitos encontrados, arquivos modificados, comparação visual e validação. Manter status `needs-visual` até comparar conteúdo, hierarquia, peso, alinhamento e vizinhos em escala suficiente para aprovação. Não processar outras páginas em lote.
