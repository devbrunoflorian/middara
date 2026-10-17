# p.102 — Conviction and Casting Value: corpo

## Proposta isolada

> Algumas Habilidades, Condições ou Etapas de **IA** podem se referir ao Valor de Convicção ou ao Valor de Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo adequado, conforme a lista de classificações à esquerda.

**Status:** copyfit verificado no Viewer e no PDF isolado; revisão terminológica humana pendente. Não foi salvo no Payload.

## Verificação

- O PDF real de uma página contém o override completo uma vez, zero fallback do corpo em inglês e zero U+FFFD.
- A proposta mantém as seis linhas-fonte. A caixa horizontal e a margem inferior cabem; a distância para Example permaneceu em 3,043 pt, variação de apenas −0,128 pt em relação à fonte.
- A medição registra que o bbox de glifo começa 1,036 pt acima do topo da caixa-fonte; a captura alinhada de PDF-fonte, Viewer normal e PDF exportado foi inspecionada e não mostra corte nem colisão.
- O Example com os dados ORANGE/RED e o parágrafo seguinte permanecem inalterados em inglês.
- No Editor normal, a unidade-fonte é única e editável; Cancel e reabertura restauram o inglês. O teste foi read-only; nenhuma tradução foi digitada ou salva.
- O hash do DOM, fundo, frames e overlays da p.102 permaneceu igual antes/depois. Payload não foi alterado e não contém a chave candidata.

## Revisão humana pendente

Figures → Miniaturas segue o glossário. Etapas de IA, Valor de Convicção, Valor de Conjuração e lista de classificações são formas propostas localmente; a prova não as promove a termos globais.

## Escopo que permanece em inglês

O Example permanece em inglês porque os dados laranja/vermelho ainda não estão mapeados semanticamente. O parágrafo “Since Casting…” foi conferido como vizinho preservado, mas não traduzido. A página inteira não está declarada pronta.

## Evidências

- [Comparação PDF-fonte / Viewer / PDF](evidence/2026-10-15-p102-conviction-value-body-v1/source-viewer-pdf-comparison-v3.png)
- [PDF isolado de uma página](evidence/2026-10-15-p102-conviction-value-body-v1/proposal-page-102-pt-BR.pdf)
- [Recibo de copyfit](evidence/2026-10-15-p102-conviction-value-body-v1/copyfit-reconciliation-v3.json)
- [Recibo read-only do Editor](evidence/2026-10-15-p102-conviction-value-body-v1/normal-editor-readonly-receipt-v1.json)
- Prova reproduzível e snapshot imutável: output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1/.