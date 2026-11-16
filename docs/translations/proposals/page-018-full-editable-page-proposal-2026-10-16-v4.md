# p.18 — proposta PT-BR da página editável completa, v4 reconciliada

**Estado:** proposta completa do texto editável, tecnicamente pronta para revisão humana. As 29 unidades passaram pelo Viewer, PDF e Rich Block Editor. A aprovação humana da terminologia segue pendente; isto ainda não é uma tradução aprovada ou publicada.

## Escopo e decisão editorial

A proposta cobre 29 títulos e unidades de prosa editáveis da página 18. Texto impresso dentro da arte dos baralhos e identificadores de cartas UM3/UMX permanecem em inglês sob a política atual de arte invariável por idioma. Três larguras de frame para a lista de Restauração são propostas apenas para PT-BR; nenhum frame ou sidecar canônico foi alterado.

Os nomes aprovados no casebook para `Hidden Cards` e `Hidden Card Decks` foram preservados como **Cartas Ocultas** e **Baralhos Secretos**. Ainda exigem revisão humana, entre outros, Conquista, Ficha de Aventura, Red Reveal, Ação de Reequipar, Saque de Combatentes, Fichas de Urgência, Etapa de IA e Paralisar. A forma solicitada pelo usuário **exaustar** foi mantida em `desexauste`, sujeita à revisão editorial da frase.

## Correção de integridade da proposta

Na primeira pasta v4, o campo `proposalText` do parágrafo IMPORTANT omitia “os jogadores”, embora os segmentos ricos e a página renderizada já contivessem essas palavras. Mantive aquela pasta como evidência da divergência e gerei uma cópia reconciliada. A cópia alinha o resumo aos segmentos realmente exportados sem alterar esses segmentos ou a aparência já revisada.

## Verificações realizadas

- O snapshot contém 29 chaves únicas `__pt-BR`; o preflight read-only encontrou zero registros salvos `page_18_*` no Payload. O processo registrou `payloadWrites: 0`.
- O exportador oficial carregou as 29 substituições do snapshot imutável, preservando a ordem texto/símbolo. A extração independente do PDF encontrou 29/29 textos propostos, confirmou 29/29 resumos iguais aos segmentos e não encontrou nenhum dos 29 textos-fonte completos como fallback.
- O PDF é de uma página e mede `820.346 × 820.346 pt`. A renderização independente do PDF foi comparada visualmente ao Viewer e ao print; não identifiquei sobreposição na lista nem divergência visual entre Viewer e PDF.
- O Rich Block Editor reconheceu e abriu as 29 unidades com texto editável correspondente ao snapshot. Cancelei todos os campos; na etapa 2, uma alteração temporária passou por Desfazer/Refazer/Desfazer, foi cancelada e reabriu com o texto original. Nenhuma ação Save/Aplicar foi acionada.
- Não houve tentativa de escrita na API; o Payload continuou sem registros PT-BR da p.18 e os assets canônicos mantiveram os mesmos hashes. O QA técnico não substitui a revisão humana.

## Integridade

O PDF-fonte tem SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`. Os hashes dos assets canônicos da p.18 estão em [`source-hashes.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/source-hashes.json). Payload, tradução humana, PDF-fonte, background, DOM e sidecars não foram alterados. Não rodei a suíte de testes para esta proposta; não fiz commit nem push.

## Artefatos

- Inventário reproduzível das 29 unidades: [`proposal-candidates.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/proposal-candidates.json)
- Proposta isolada dos frames: [`pt-br-list-frame-proposals.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/pt-br-list-frame-proposals.json)
- Captura do Viewer: [`viewer-full-pt-BR-v4-reconciled.png`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/viewer-full-pt-BR-v4-reconciled.png)
- Captura de impressão: [`print-full-pt-BR-v4-reconciled.png`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/print-full-pt-BR-v4-reconciled.png)
- PDF isolado: [`page-018-full-editable-page-v4-reconciled.pdf`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/page-018-full-editable-page-v4-reconciled.pdf)
- Render independente do PDF: [`pdf-rendered-v4-reconciled.png`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/pdf-rendered-v4-reconciled.png)
- Relatório técnico: [`report.md`](../../../output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled/report.md)
