# p.18 — Conquistas — proposta da família editorial v1

**Estado:** quatro unidades da família estão propostas e visualmente validadas no Viewer e no PDF isolado. A página permanece parcial; a revisão humana dos termos ainda está pendente.

## Escopo e proposta

| Chave | Texto PT-BR proposto |
|---|---|
| `page_18_block_92__pt-BR` — título (`block_140`) | **Conquistas** |
| `page_18_block_93__pt-BR` — parágrafo (`block_142`) | Alguns Encontros têm Conquistas. São recompensas especiais que os jogadores podem obter ao fazer algo extraordinário. Quando a Condição de uma Conquista é cumprida, leia o texto oculto ao lado dela. Cada Conquista só pode ser concluída uma vez. Salvo indicação em contrário, somente o Aventureiro que concluiu a Conquista recebe a recompensa. |
| `page_18_block_94__pt-BR` — parágrafo (`block_143`) | Muitas Conquistas são difíceis de alcançar e podem exigir combinações específicas de Habilidades ou Itens para serem concluídas. |
| `page_18_block_95__pt-BR` — parágrafo (`block_144`) | No final do Livro de Regras, há uma Ficha de Aventura com uma lista para os jogadores marcarem as Conquistas que tentam completar! |

A estrutura completa com caixas, fontes, estilos, ordem e texto EN de origem está em [`proposal-candidates.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/proposal-candidates.json). O snapshot isolado que o exportador consumiu está em [`snapshot.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/snapshot/snapshot.json).

## Evidência e estado de validação

- PDF oficial EN, 102 páginas: SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`. Os sete hashes de assets e a leitura sem escrita do Payload ao preparar a proposta estão em [`source-hashes.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/source-hashes.json).
- Proposta isolada exportada pelo fluxo oficial: [`page-018-achievements-family-v1.pdf`](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/page-018-achievements-family-v1.pdf), SHA-256 `571C3350DB2DF386A97018B950581C49FB69CFD057A3F471BD06C7D37BCA8D98`.
- Capturas legíveis: [Viewer PT-BR](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/viewer-pt-BR-v1.png) e [raster do PDF exportado](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/pdf-raster-v1-1.png). A inspeção visual mostra a família no quadro original, sem corte ou colisão; o primeiro parágrafo ocupa cinco linhas e os outros dois, duas linhas cada. Os demais textos e a arte da página seguem em inglês nesta proposta parcial.
- [`export-metrics-v1.json`](../../../output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1/export-metrics-v1.json) registra Viewer PT-BR e impressão. A verificação independente do PDF confirmou uma página, caixa `820,346 × 820,346 pt`, os três inícios de texto PT-BR, zero caracteres de substituição e ausência do fallback EN nesses trechos. Os três caracteres de uso privado extraídos pertencem aos glifos dos três IMPORTANT fora desta família; os ícones aparecem preservados no raster.
- O Editor reconheceu `page_18_block_93` e mostrou a edição como alteração local não salva. Não foi clicado Save. Uma leitura GET atual do Payload retornou zero registros `page_18_*` em PT-BR. O cancelamento final e a reabertura não ficaram comprovados após timeout da automação; ficam como validação pendente.

## Termos para revisão humana

- `Achievement` → **Conquista**: forma candidata, ainda ausente do glossário oficial.
- `Adventure Sheet` → **Ficha de Aventura**: compatível com uso humano anterior na p.11, mas há formas concorrentes nos candidatos do glossário.
- `Condition`, `Ability` e `Item`: capitalização e uso como termos mecânicos precisam de revisão.
- `Gain/reward` → **obter/receber recompensa**: equivalência contextual proposta, sem decisão global.

## Limites

Esta entrega cobre somente o título *Achievements* e os três parágrafos identificados acima. Não traduz nem certifica o restante da p.18. O texto embutido nas cartas de Hidden Card Decks e outros elementos de arte permanece inglês. A fidelidade estrutural integral da página segue `not_certified`.

Nenhum sidecar canônico, asset da aplicação, PDF-fonte, Payload ou tradução humana foi alterado. Nenhum commit ou push foi feito.
