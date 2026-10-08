# Estado atual do projeto

**Atualizado:** 2026-10-08. O projeto segue em desenvolvimento; o livro inteiro ainda não tem certificação estrutural global.

## O que funciona e foi aceito

- Viewer React/Vite, editor rico e Payload/SQLite para traduções por idioma.
- Separação arquitetural entre geometria fonte quando os dados extraídos permitem e fluxo refluído para conteúdo editado/traduzido.
- Identidade de símbolos por `symbolId`, mantendo arte, avanço e âncora como propriedades distintas.
- Famílias editoriais aprovadas em escopos registrados, incluindo parágrafos, Examples, Notes, heading/body, labels e bullets. O contrato híbrido da p. 78 mantém body e Example como unidades editáveis simples sob o mesmo item de lista.
- p. 40 A–D após correção compartilhada de geometria fonte: dez marcadores, avanço fonte de 9,991–10,000 pt, MediaBox coincidente e diferença máxima de bbox no export de 0,262 pt.
- Regressão de ordem de Hooks no bloco tipográfico p. 40 corrigida; teste de componente, TSC, viewer Admin/locale/edição e save/reload passaram. Ver [registro](project-progress/2026-10-08-typographic-unit-hook-order.md).
- Páginas 1–12 e suas traduções aprovadas permanecem intocadas.

## O que continua aberto

- A auditoria 49–102 gerou 810 ocorrências vetoriais de adjacência: 62 já registradas, 75 em regiões de overlay conhecidas, 21 com assinatura visual equivalente a família já existente, 3 apenas sobrepostas a placements existentes e 649 sem classificação suficiente. Esses números são triagem, não defeitos.
- Os cartões físicos das p. 49 e 67 são um outlier estrutural ainda sem parent/contrato de card. Foi confirmada perda visual: labels legítimas de 3,7846 pt e 3,9763 pt são omitidas pela regra compartilhada `<4 pt`, e a cápsula `PER ENCOUNTER` p. 67 perdeu o fundo escuro e ficou branca. Nenhuma correção foi aplicada; ver [auditoria](project-progress/2026-10-08-card-components-audit-p49-p67.md).
- Das ocorrências raster fora dos cards p. 49/67, 18 foram associadas a elementos de diagramas, cards, marcadores ou tabelas sem nova divergência confirmada; a identidade individual de um candidato da p. 84 permanece incerta. As 83 ocorrências concentradas nos cards estão classificadas como partes dos componentes físicos, mas detalhes visuais e contrato de card continuam abertos.
- A revisão ampliada não confirma o estado estrutural global 1–102. A faixa 1–48 tem registros de revisão com escopos diferentes; não somá-los como certificação uniforme.
- A execução direta da suíte web teve 49/55 testes aprovados; seis falhas em três suítes de outline/inline p. 41/78 seguem sem diagnóstico e fora da correção de Hooks.
- Tradução final em PT-BR, outliers restantes, localização de texto rasterizado e QA integral viewer/export continuam dependendo de página/família e estado de tradução.

## Próximo estágio

Decidir o contrato estrutural/visual dos cards físicos p. 49/67. Depois retomar a classificação dos 649 candidatos vetoriais inconclusivos com contexto do PDF; não iniciar tradução em massa nem converter candidatos em backlog automático.

## Invariantes

- PDF original é a referência visual e geométrica.
- Não alterar páginas 1–12, registros de tradução ou Payload sem escopo explícito.
- Não usar tinta/bbox de SVG como métrica automática de line box.
- Não usar um limiar geométrico sozinho para inferir parágrafos, símbolos, arte ou duplicatas.
- Registrar limitações e evidência; preservar os relatórios históricos.
