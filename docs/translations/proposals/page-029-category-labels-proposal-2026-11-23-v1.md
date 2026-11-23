# p.29 — Rótulos de categoria dos Aprimoramentos de Item

## Problema confirmado

No OG, `WEAPON`, `ARMOR` e `CORE` são três rótulos independentes, cada um alinhado acima do seu card. O DOM preservava as três linhas e caixas-fonte, mas a tradução aprovada `ARMA / ARMADURA / NÚCLEO` reunia tudo em uma unidade centralizada sobre os três cards.

## Correção

Foram criadas três unidades tipográficas filhas, cada uma vinculada a uma linha-fonte e a uma moldura local de 100 pt centrada no eixo da tinta-fonte. Os rótulos mantêm OptimaLTStd-Bold, 9 pt e branco. `UNIVERSAL` continua na unidade independente existente. A tradução agrupada anterior permanece publicada como fallback recuperável; o PageRenderer usa as filhas quando as três estão presentes.

## Persistência e validação

| Rótulo | Review | Translation | Copyfit 100% / 200% |
| --- | ---: | ---: | --- |
| ARMA | 2128 | 2474 | EXACT 1/1 em ambas |
| ARMADURA | 2129 | 2475 | EXACT 1/1 em ambas |
| NÚCLEO | 2130 | 2476 | EXACT 1/1 em ambas |

A exportação persistida da p.29 passou `verifiedTranslationRecords=true` e `pdfVerification=true`, com MediaBox de 820,346 × 820,346 pt. Viewer e PDF mantiveram 22 linhas-fonte, dois símbolos e sete imagens. OG e PDF foram rasterizados em 120 DPI (1368 × 1368 px); os quatro rótulos ficaram centrados individualmente, sem colisão, clipping ou divergência entre Viewer e PDF. Os arquivos raster e o PDF temporário foram removidos após a inspeção.

A aprovação antiga do bloco agrupado (review 1449 / translation 1200) foi preservada no histórico e no Payload.
