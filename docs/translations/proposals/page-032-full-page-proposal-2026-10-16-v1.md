# Página 32 — proposta completa de texto editável v1

**Estado:** proposta completa do texto editável, pronta para revisão editorial humana. Não foi aprovada, publicada nem gravada no Payload.

## Escopo

A proposta contém 15 novos alvos PT-BR: título, introdução, custo em XP, corpo sobre níveis, IMPORTANT e cinco pares de título/descrição das Árvores de Disciplina. O Exemplo já salvo no Payload foi incluído no snapshot sem alteração; não é uma nova descoberta nem uma tradução cuja aprovação tenha sido confirmada.

O JSON de candidatos preserva os segmentos ricos de cada unidade — fonte, tamanho, negrito, itálico e símbolo semântico do IMPORTANT — e o snapshot inclui as dependências visuais usadas na exportação isolada. O conteúdo completo e recuperável está em [`proposal-candidates.json`](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/proposal-candidates.json); o snapshot reproduzível está em [`snapshot.json`](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/snapshot/snapshot.json).

## Verificação

- **Viewer PT-BR isolado:** os 15 candidatos ficaram visíveis; o Exemplo preexistente também permaneceu.
- **Rich Block Editor:** os 15 candidatos e o Exemplo foram encontrados pela chave correta, mostraram o texto esperado e aceitaram edição. Um ciclo de alteração, Undo, Redo, Undo e Cancel foi executado em `page_32_block_13__pt-BR`; reabrir o Editor restaurou exatamente o texto do snapshot.
- **Persistência:** o Payload continua com somente o registro preexistente do Exemplo (id 300). A leitura anterior e posterior tem o mesmo hash de dados. O navegador observou apenas GETs; nenhuma mutação foi tentada ou autorizada.
- **PDF isolado:** o PDF tem uma página de `820.346 × 820.346 pt`. Extração independente confirma 15/15 textos candidatos e o Exemplo preexistente. A renderização independente foi conferida visualmente contra o Viewer, a impressão e a página-fonte: não há colisão ou corte visível no texto proposto.
- **Integridade:** todos os hashes de assets canônicos da p.32 coincidiram antes e depois do ciclo de Editor. O PDF-fonte mantém SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.

Recibos: [Editor read-only](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/editor-readonly-receipt-v1.json), [conteúdo/caixa do PDF](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/pdf-readonly-receipt-v1.json). Capturas: [Viewer](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/viewer-pt-BR-v1.png), [PDF renderizado independentemente](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/pdf-render-pt-BR-v1.png), [Editor](../../../output/proofs/translation-readiness-2026-10-16/p032-full-page-v1/editor-readonly-v1.png).

## Arte e decisões editoriais pendentes

Os cinco cartões permanecem como overlays de arte original, sem retoque ou reconstrução. Os nomes exibidos são nomes próprios das Árvores; `LVL I` usa o mesmo código `LVL` que a proposta explica no texto como abreviação para Levels/Níveis; os rodapés contêm identificadores de carta e versão. Esta página trata esses elementos como arte invariável, sem criar uma decisão global de glossário.

Os equivalentes propostos para `Discipline Tree`, `Discipline`, `Level/LVL`, `Ability`, `Condition`, `Action`, `Positive Effects`, `Melee`, `Ranged`, `Damage`, `HEAL` e `DODGE`, assim como a capitalização dos nomes de regras e das Árvores, continuam sujeitos à revisão editorial. O Exemplo existente continua preservado; seu estado de aprovação humana não foi determinado.

## Integridade canônica

Não foram alterados Payload, sidecars canônicos, arquivos de página, arte, PDF-fonte ou traduções humanas. Não houve commit ou push. A p.32 conta como **proposta completa de texto editável pronta para revisão**, não como página aprovada/publicada.
