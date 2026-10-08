# Estado atual do projeto

**Atualizado:** 2026-10-07. O projeto segue em desenvolvimento; o livro inteiro ainda não tem certificação estrutural global.

## O que funciona e foi aceito

- Viewer React/Vite, editor rico e Payload/SQLite para traduções por idioma.
- Separação arquitetural entre geometria fonte quando os dados extraídos permitem e fluxo refluído para conteúdo editado/traduzido.
- Identidade de símbolos por `symbolId`, mantendo arte, avanço e âncora como propriedades distintas.
- Famílias editoriais aprovadas em escopos registrados, incluindo parágrafos, Examples, Notes, heading/body, labels e bullets. O contrato híbrido da p. 78 mantém body e Example como unidades editáveis simples sob o mesmo item de lista.
- p. 40 A–D após correção compartilhada de geometria fonte: dez marcadores, avanço fonte de 9,991–10,000 pt, MediaBox coincidente e diferença máxima de bbox no export de 0,262 pt.
- Páginas 1–12 e suas traduções aprovadas permanecem intocadas.

## O que continua aberto

- A auditoria 49–102 gerou 810 ocorrências vetoriais de adjacência: 62 já registradas, 75 em regiões de overlay conhecidas, 21 com assinatura visual equivalente a família já existente, 3 apenas sobrepostas a placements existentes e 649 sem classificação suficiente. Esses números são triagem, não defeitos.
- Foram encontrados cartões de item dentro da composição das páginas 49 e 67 cujos textos aparecem no DOM como blocos genéricos, sem classificação explícita de cartão/arte. É um outlier estrutural novo para decisão; não foi corrigido.
- Das 102 ocorrências raster próximas a texto, 83 estão concentradas nos componentes/cartões das p. 49 e 67, duas são marcadores numerados da p. 96 e 17 permanecem sem atribuição individual concluída.
- A revisão ampliada não confirma o estado estrutural global 1–102. A faixa 1–48 tem registros de revisão com escopos diferentes; não somá-los como certificação uniforme.
- Tradução final em PT-BR, outliers restantes, localização de texto rasterizado e QA integral viewer/export continuam dependendo de página/família e estado de tradução.

## Próximo estágio

Retomar a classificação de candidatos com o PDF aberto e contexto da página, começando pela família de cartões incorporados. Só então decidir se ela merece um contrato estrutural. Não iniciar tradução em massa nem converter os candidatos remanescentes em backlog automático.

## Invariantes

- PDF original é a referência visual e geométrica.
- Não alterar páginas 1–12, registros de tradução ou Payload sem escopo explícito.
- Não usar tinta/bbox de SVG como métrica automática de line box.
- Não usar um limiar geométrico sozinho para inferir parágrafos, símbolos, arte ou duplicatas.
- Registrar limitações e evidência; preservar os relatórios históricos.
