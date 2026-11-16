# p.48 — encerramento de Ações e Habilidades — proposta PT-BR

**Status:** rascunho tecnicamente ajustado; revisão terminológica e editorial humana pendente. Não foi gravado no Payload nem em sidecar canônico.

## Unidades propostas

| Chave | Fonte EN | Proposta PT-BR |
| --- | --- | --- |
| `page_48_block_0` | Abilities that End Actions and Abilities | **Encerramento de Ações e Habilidades** |
| `page_48_block_1` | Parágrafo sobre encerrar a Ação atual e todas as Habilidades | Quando uma Habilidade instrui uma miniatura a “encerrar a Ação atual e todas as Habilidades”, as demais Ações e Habilidades em andamento terminam imediatamente. Qualquer Habilidade, Ação, Instrução de IA ou Regra Especial que dependa da Habilidade ou Ação atual (como um contra-ataque) não poderá mais ser usada. |
| `page_48_block_2` | Instruções seguintes da Habilidade | Em seguida, a miniatura que encerrou a Ação atual e todas as Habilidades segue as instruções seguintes da sua Habilidade, se houver. |

Os trechos enfatizados na fonte continuam em negrito e itálico. A revisão de v1 encurtou somente o título: a versão literal ocupava duas linhas e deixava pouco espaço antes do parágrafo. A v2 ocupa uma linha; os parágrafos mantêm cinco e duas linhas, respectivamente, sem colisão visível ou mudança de frame/fonte.

## Revisão pendente

- Confirmar **counter → contra-ataque**. A fonte usa “counter” em minúscula, e não foi encontrada decisão aprovada específica no glossário consultado.
- Confirmar capitalização e forma de **Instrução de IA**, **Regra Especial**, **Habilidade** e **Ação**.
- A proposta ainda não foi exercitada no Rich Block Editor; a prova de copyfit usa snapshot imutável isolado para não salvar traduções experimentais.

## Evidências

- [Comparação legível: PDF-fonte EN / Viewer isolado / PDF exportado PT-BR](../../project-progress/evidence/2026-10-15-p048-end-actions/source-viewer-pdf-crop.png)
- [Manifesto da comparação e hashes](../../project-progress/evidence/2026-10-15-p048-end-actions/visual-comparison.json)
- [Proposta completa, segmentos ricos e recibos](page-048-end-actions-proposal-2026-10-15-v2.json)
- [PDF isolado](../../../output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2/page-048-pt-BR-end-actions-proposal.pdf) · [captura integral do Viewer isolado](../../../output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2/viewer-pt-BR.png)

O manifesto registra o PDF-fonte, a captura do `PageRenderer` sobre snapshot imutável e a rasterização independente do PDF exportado. Os três textos PT-BR aparecem uma vez no PDF, sem ocorrência dos três textos EN correspondentes. Esta evidência verifica a proposta isolada; não certifica a página inteira nem o estado canônico do aplicativo.
