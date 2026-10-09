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

- O scanner legado registrou 810 ocorrências vetoriais filtradas, mas não media cobertura: excluía drawings acima de 36 pt e paths sem proximidade de texto. A auditoria integral preserva 16.234 source drawing paths das p. 49–102; a soma é 198 com referência explícita + 1 cápsula p. 67 com overlay conhecido manualmente + 16.035 outros sem vínculo individual. Sem referência explícita são 16.036, dos quais um é essa cápsula já representada; o restante não deve ser chamado de ausente. A auditoria separou 3.185 paths de prioridade inicial. Ver [auditoria do inventário SOURCE](project-progress/2026-10-08-source-vector-inventory-method-audit.md).
- O piloto delta-driven de cinco páginas mudou o papel do inventário: primeiro detecta-se o delta visual PDF↔viewer e só depois se usa drawing/source geometry para diagnóstico. A p. 67 tem sinal local histórico forte para o drawing 220 ausente (`189/194` pixels válidos no proxy), mas o proxy não inclui DOM text nem adapters inline. A comparação numérica do viewer integral permanece inconclusiva porque o browser bloqueou `file://`; export também não foi comparado. Nenhuma página foi certificada nem houve alteração funcional. Ver [relatório do piloto](project-progress/2026-10-08-delta-driven-source-fidelity-pilot.md).
- A aquisição numérica do viewer foi destravada por captura Playwright autorizada em origem/viewport fixos. O teste p. 67 detectou a cápsula ausente no sidecar histórico: 198 px estruturais na bbox do drawing 220 antes e 0 no viewer atual, após blur/limiar documentados. p. 49 tem 10 regiões e p. 56 tem 8 ainda inconclusivas; p. 51/p. 87 não tiveram regiões acima do limiar. Evidência/relatório: [captura e diff do piloto](project-progress/2026-10-08-delta-driven-viewer-capture.md). A auditoria global segue pausada para revisão; nenhum conteúdo funcional foi alterado.
- Os cartões físicos p. 49/67 continuam sem parent compartilhado, mas os defeitos confirmados foram corrigidos: dois labels pequenos têm opt-in localizado e o fundo de `PER ENCOUNTER` foi restaurado sob o texto editável. Viewer, teste de componente e amostras de export passaram. Ver [auditoria](project-progress/2026-10-08-card-components-audit-p49-p67.md).
- A classificação global 49–102 foi consolidada sobre o mapper aprovado: do baseline de 323 instâncias após o fix p. 50, 49 objetos foram restaurados/validados, 272 linhas fonte já estavam presentes no viewer, 1 outlier de baseline permanece confirmado na p. 64 e o desenho da Note raster/tabela p. 100 continua inconclusivo. Permanecem 545 regiões geométricas (96 ambíguas, 16 sem fonte escolhida); não são contagem de bugs. Ver [classificação final](project-progress/2026-10-08-global-audit-49-102-classification.md).
- O raster candidato da p. 84 continua inconclusivo e não foi forçado a uma associação. As páginas 1–12 ficaram intocadas; a captura cobriu apenas EN/viewer, e o export nesta etapa foi amostrado em seis páginas, não no livro PT-BR integral.
- A revisão ampliada não confirma o estado estrutural global 1–102. A faixa 1–48 tem registros de revisão com escopos diferentes; não somá-los como certificação uniforme.
- A suíte web agora passa 57/57 testes. As seis falhas anteriores foram comparadas com o baseline anterior às mudanças de Hooks/sourceGeometry: cinco eram contratos de teste obsoletos e uma era metadado de renderização ausente na p. 41, já corrigido. Ver [auditoria](project-progress/2026-10-08-card-components-audit-p49-p67.md).
- Tradução final em PT-BR, investigação do baseline inline p. 64, outliers/holdouts restantes, localização de texto rasterizado e QA integral viewer/export continuam dependendo de página/família e estado de tradução.

## Próximo estágio

Investigar em tarefa separada o outlier de baseline inline p. 64 com evidência PDF→sidecar→renderer→viewer/export. Preservar as ambiguidades, o candidato p. 84, a Note da p. 100 e o mapper aprovado. Capturas/diffs EN atuais estão em `tmp/delta-global-audit-49-102/`; o export PT-BR integral não foi iniciado neste passe.

## Invariantes

- PDF original é a referência visual e geométrica.
- Não alterar páginas 1–12, registros de tradução ou Payload sem escopo explícito.
- Não usar tinta/bbox de SVG como métrica automática de line box.
- Não usar um limiar geométrico sozinho para inferir parágrafos, símbolos, arte ou duplicatas.
- Registrar limitações e evidência; preservar os relatórios históricos.
