# p.33 — proposta completa de prosa PT-BR v6

**Estado do diagnóstico v6 (histórico):** 19 unidades apareciam no Viewer PT-BR e no PDF isolado; a captura antecede as edições de terminologia descritas ao final. **Estado atual (2026-10-25):** 2/19 revisões estão aprovadas e 17 continuam pendentes; uma delas está OVER após duas tentativas de copyfit. A página segue parcial, com três overlays de carta em inglês e exceções editoriais abertas.

## Correção técnica do dado roxo em block_38

O PDF-fonte confirma os objetos vetoriais 152–155 imediatamente após “Casting:”, na bbox [140.7980, 218.2258, 151.1880, 229.9628] pt. A ocorrência foi reconstruída como o token editável [[purple-die]] (registry dice.purple), com SVG vetorial da própria fonte e máscara apenas no recorte local. A redação “Conjuração:” foi preservada.

O primeiro render mostrou o token quebrado para a linha seguinte. A largura de line_38_0.availableWidth passou de 48.72 pt para 83.5305 pt, acompanhando o corredor já usado por block_37 / line_37_0 dentro da mesma faixa bege; X, Y, altura, fonte, tamanho e texto não foram alterados. A medição combina o retângulo de texto com o bbox do símbolo: uma linha de origem e uma linha no PageRenderer (EXACT), sem excesso horizontal.

No Viewer, o Editor de símbolos removeu o vetor ao apagar o token; Undo, Redo, reinserção pela paleta e a proposta PT-BR renderizaram exatamente um dado. O PDF v6 independente contém uma página com MediaBox/CropBox de 820.346 × 820.346 pt e mostra o rótulo com o dado inline. Zero chamadas de API e zero gravações no Payload.

## Rechecagem da família de dados de Convicção/Conjuração (2026-10-23)

No app real, o rótulo PT-BR “Convicção:” mostra os dois dados roxos semânticos (desenhos-fonte 144–151), e “Conjuração:” mostra um (152–155). Os dois itens foram medidos novamente no PageRenderer com Copyfit V3: **EXACT, 1→1 linha visual** para cada rótulo. Uma anotação de diagnóstico da versão v4 mantinha Conjuração vazia mesmo após a correção e a prova v6; essa condição obsoleta foi removida. O conteúdo completo continua na proposta, sem aprovação nem gravação no Payload.

Ao abrir o Rich Block Editor no app real, o menu hambúrguer some e o losango da paleta de símbolos aparece no topo da mesma régua lateral. A proposta de Convicção exibe os dois dados no Viewer/Editor; nenhuma edição de texto foi feita nesta validação.

Na reabertura da proposta, o destaque do `block_37` terminava 3,92 pt antes do limite direito do segundo dado (a 200%, o ícone ultrapassava a borda azul). Ampliei apenas o corredor local de `line_37_0` de 90,5 pt para 96,5 pt e o limite de `block_37` de x=175,108 pt para x=188,078 pt. Isso inclui o segundo dado (borda-fonte x=185,998 pt) com margem de 2,08 pt; texto, posição, tamanho, fonte e tokens não mudaram. Copyfit foi refeito no PageRenderer: **EXACT, 1→1 linha**, dois `dice.purple`. No app real a moldura azul agora contém ambos os símbolos, sem tocar no próximo rótulo. A mudança é só geometria de origem do bloco editável; nenhuma gravação no Payload ou aprovação editorial.

## Limites editoriais e de página

- A palavra “Conjuração” e as demais 18 propostas continuam pendentes de revisão humana; Copyfit e mapeamento técnico não constituem aprovação.
- Magic Staff, Deflection Core e Quick Blow continuam como overlays em inglês. A p.33 não está concluída.
- A verificação é um PDF diagnóstico isolado da p.33, não uma nova exportação integral do livro.

## Evidências

- [Viewer PT-BR](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/pdf-viewer-v6.png), [impressão](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/pdf-print-v6.png), [PDF v6](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/page-033-pt-BR-casting-die-v6.pdf), [raster independente do PDF](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/pdf-render-v6.png) e [recibo de verificação](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/pdf-export-verification-v6.json).
- [Medições PageRenderer/PDF](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/pdf-metrics-v6.json), [prova de edição e copyfit](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/runtime-proof.json), [recibo do corredor](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/corridor-receipt.json), [integração do símbolo](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/integration-receipt.json) e [comparação visual localizada](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-casting-label-die/source-visual-diff.json).
- Rechecagem atual da família: [PDF EN-fonte](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-conviction-label-dice/page-033-en-source.pdf), [PDF PT-BR diagnóstico](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-conviction-label-dice/page-033-pt-BR-conviction-label.pdf), [capturas EN/PT-BR na mesma escala](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-conviction-label-dice/) e [recibo com hashes e validação](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p033-conviction-label-dice/snapshot-preparation-receipt.json). Ambos os PDFs passaram a verificação de página; o PT-BR usa snapshot isolado e não publica a proposta.
- A proposta v5 e seus recibos anteriores permanecem registrados no JSON como histórico; nenhuma tradução humana foi sobrescrita.


## Atualização editorial e Copyfit — 2026-10-25

- A forma preferencial local `Adventurer Card → Ficha de Aventureiro` foi aplicada às ocorrências editáveis desta página sem alterar o estado HIPÓTESE do glossário 67; `Cartão de Aventureiro` continua alternativa e `Adventure Sheet → Ficha de Aventura` (id 7) segue distinto.
- `page_33_unit_p33-block-35-default-dice-paragraph__pt-BR` preserva os dois símbolos `dice.purple` e os respectivos spans em negrito. Com `Ficha de Aventureiro`, o PageRenderer/PyMuPDF mediu EXACT 4/4 em 100% e 200%; o Reviewer oficial aprovou review1480 → translation807, com CAS/read-back. Os termos `Conviction` e `cast` seguem o glossário; a pendência residual “Upgrade” não aparece na fonte.
- `page_33_block_20__pt-BR` usa `Exemplo na Ficha de Aventureiro:`. Após duas formulações, permanece EXACT 1/1 a 100%, mas OVER 1/2 a 200%; review1481 e a exceção permanecem abertos, sem aprovação ou nova tentativa.
- Estado Payload reconciliado: 2 revisões aprovadas e 17 pendentes. O PDF v6 continua prova histórica; nenhuma exportação nova foi gerada.
