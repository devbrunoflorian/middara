# p.34 — Proposta PT-BR: Preparação da mesa de jogo

- **Versão:** 1
- **Estado:** proposta editorial não aprovada; snapshot de prova isolado, não importado
- **Fonte:** PDF oficial EN, p.34; `page_034_dom.json`

## Unidade editorial

| Chave-fonte | EN | Proposta PT-BR |
|---|---|---|
| `page_34_block_251` (`block_1499`, índice 251) | Game Table Setup | Preparação da mesa de jogo |

O diagrama da mesa é uma imagem de fundo compartilhada entre idiomas; os nomes e textos que aparecem dentro das cartas continuam em inglês na arte. Esta proposta traduz somente o título e não reconstrói nem altera o diagrama.

## Prova de estrutura e copyfit

- O render da fonte e o Viewer normal em EN foram comparados em página inteira. A página, o título, os dois ornamentos brancos e o fólio aparecem nas mesmas regiões. A captura do Viewer foi feita com Admin desligado e Fit to Screen; as requisições observadas foram somente GET, interceptadas em modo de leitura: [`p034-viewer-en.png`](../../../output/proofs/translation-readiness-2026-10-15/p034-viewer-en.png).
- A prova isolada usa um frame PT-BR temporário `x=85.173`, `width=650`, `textAlign=center`, cobrindo a faixa completa entre os ornamentos. Nenhum frame canônico foi modificado.
- O exportador oficial verificou o snapshot e gerou um PDF de 1 página, 820,346 × 820,346 pt. Renderizei o PDF gerado diretamente com Poppler. O título cabe em uma linha, permanece centralizado na faixa e não encobre ornamentos, diagrama ou fólio: [`page-034-pt-BR-pdf-render.png`](../../../output/proofs/translation-readiness-2026-10-15/p034-title-proposal-v1/page-034-pt-BR-pdf-render.png). O print do Viewer está em [`page-034-pt-BR-print.png`](../../../output/proofs/translation-readiness-2026-10-15/p034-title-proposal-v1/page-034-pt-BR-print.png).
- Preparação reproduzível: [`prepare_snapshot.mjs`](../../../output/proofs/translation-readiness-2026-10-15/p034-title-proposal-v1/prepare_snapshot.mjs); proposta literal: [`proposal.txt`](../../../output/proofs/translation-readiness-2026-10-15/p034-title-proposal-v1/proposal.txt). Recibo e hashes: [`proof-receipt.json`](../../../output/proofs/translation-readiness-2026-10-15/p034-title-proposal-v1/proof-receipt.json). Snapshot e cópia dos assets estão em `snapshot/`.

## Limites

- O copyfit da proposta de título foi validado no PDF isolado; não houve tradução de texto dentro da arte nem aprovação editorial humana.
- Nenhuma tradução foi salva em Payload, banco, sidecar ou armazenamento local. O PDF e o snapshot são apenas provas.
