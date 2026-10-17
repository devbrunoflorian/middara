# p.102 — proposta da família Conviction and Casting Value (2026-10-15)

## Proposta isolada

- **Corpo:** Algumas Habilidades, Condições ou Etapas de IA podem se referir ao Valor de Convicção ou ao Valor de Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo adequado, conforme a lista de classificações à esquerda.
- **Since Casting:** Como a Conjuração usa só 1 dado, o Valor de Conjuração é simplesmente o valor desse dado. (o numeral **1** permanece em negrito).
- **Example:** permanece em inglês, com os dados laranja e vermelho da fonte.

## Resultado da exportação

O exportador oficial gerou um PDF de uma página (820.346 × 820.346 pt). Os dois overrides aparecem uma vez cada; os textos EN completos desses alvos não aparecem como fallback; o Example mantém os trechos ORANGE/RED e a conta 8 (5 + 3). O corpo permanece em seis linhas. O parágrafo curto ocupa 2 linhas, contra duas na fonte, e termina 0.000 pt abaixo do bbox original, sem colisão visual com o Example nem com o limite inferior da página.

**Atenção:** os termos “Conjuração” e “Valor de Conjuração” continuam candidatos locais para revisão humana; esta proposta não os aprova no glossário.

## Estado de edição e preservação

A verificação read-only anterior reconheceu o bloco legado `page_102_block_1` como editável. Depois, os dois candidatos foram abertos no Viewer/Admin Editor normal por um overlay GET da captura isolada; os textareas exibiram os candidatos e Cancel/reabertura mantiveram o preview. A captura do Editor tem uma faixa de QA que identifica a resposta mockada. O snapshot usa a chave persistida PT-BR correta `page_102_block_1__pt-BR`, sem `__en`. Não houve Save nem chamadas além de GET; o Payload real continuou sem registros p.102. Todos os hashes canônicos da página permaneceram iguais.

## Evidências reproduzíveis

- Proposta estruturada: `docs/translations/proposals/page-102-conviction-and-casting-value-proposal-2026-10-15-v1.json`.
- Gerador/exportador: `scripts/prepare_p102_conviction_casting_family_proposal_v1.mjs`.
- PDF: `output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/page-102-pt-BR-conviction-casting-family-v1.pdf` (SHA-256 `82443DE0EE357263C59F56F835FBC33F175703DB4E1487D60D87DD5F7D70354C`).
- Captura do Viewer no snapshot: `output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/viewer-page-102-pt-BR-conviction-casting-family-v1.png`.
- Captura do Editor com overlay GET identificado: `output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/normal-editor-page-102-casting-pt-BR-readonly-v2.png`.
- Comparação PDF-fonte ↔ PDF exportado: `output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/source-vs-export-crop-v1.png`.
- Recibo de hashes e extração: `output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/pdf-verification-v1.json`.
