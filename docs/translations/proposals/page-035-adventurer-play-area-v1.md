# p.35 — Proposta PT-BR: Área de Jogo do Aventureiro

- **Versão:** 1
- **Estado:** proposta editorial não aprovada; snapshot isolado, não importado no aplicativo
- **Fonte:** PDF oficial EN, p.35; página local `page_035_dom.json`
- **Cobertura:** título e 16 campos de legenda/corpo (17 overrides PT-BR); arte do diagrama permanece em inglês

## Proposta por chave editável

| Chave do Editor | EN | PT-BR proposto |
|---|---|---|
| `page_35_block_5` — título | Adventurer Play Area | Área de Jogo do Aventureiro |
| `page_35_unit_p35-block-19-first-size-9pt` | ADVENTURER PLAY AREA: | ÁREA DE JOGO DO AVENTUREIRO: |
| `page_35_unit_p35-block-19-remaining-size-10pt` | This is the area for an Adventurer’s Items, Discipline Cards, and Adventurer Card. | Esta é a área para os Itens e as Cartas de Disciplina do Aventureiro, além de sua Carta de Aventureiro. |
| `page_35_unit_p35-block-20-first-size-9pt` | ASSIGNED COMBATANT: | COMBATENTE DESIGNADO: |
| `page_35_unit_p35-block-20-remaining-size-10pt` | When setting up an Encounter, we recommend evenly distributing Combatant Cards so that each player has one to control. | Ao preparar um Encontro, recomendamos distribuir uma Carta de Combatente para cada jogador controlar. |
| `page_35_unit_p35-block-21-first-size-9pt` | TOKENS: | FICHAS: |
| `page_35_unit_p35-block-21-remaining-size-10pt` | Effect, Ability, Terrain, and Encounter tokens should be on the table and within reach of the players. | As fichas de *Efeito*, *Habilidade*, *Terreno* e *Encontro* devem ficar na mesa, ao alcance dos jogadores. |
| `page_35_unit_p35-block-22-first-size-9pt` | INITIATIVE TRACK: | TRILHA DE INICIATIVA: |
| `page_35_unit_p35-block-22-remaining-size-10pt` | The Initiative Track is placed near the game board so that all players can see it. | A Trilha de Iniciativa fica perto do tabuleiro para que todos os jogadores possam vê-la. |
| `page_35_unit_p35-block-23-first-size-9pt` | DICE: | DADOS: |
| `page_35_unit_p35-block-23-remaining-size-10pt` | The dice should be placed near the game board so that all players can access them. | Os dados devem ficar perto do tabuleiro para que todos os jogadores possam alcançá-los. |
| `page_35_unit_p35-block-24-first-size-9pt` | URGENCY TOKENS: | FICHAS DE URGÊNCIA: |
| `page_35_unit_p35-block-24-remaining-size-10pt` | These tokens are added to the back of the Initiative Track at the end of any round in which no opponents had an AI Step with a true condition, and no opponents were Spawned. See Urgency Tokens Pg. 18. | Essas Fichas são acrescentadas à parte de trás da Trilha de Iniciativa ao final de qualquer rodada em que nenhum oponente tenha realizado uma Etapa de IA com condição verdadeira e nenhum oponente tenha surgido. Veja *Fichas de Urgência*, pág. 18. |
| `page_35_unit_p35-block-25-first-size-9pt` | DAMAGE AND STAMINA POINT TOKENS: | FICHAS DE DANO E DE PONTOS DE VIGOR (SP): |
| `page_35_unit_p35-block-25-remaining-size-10pt` | It’s important that each Adventurer has enough Damage and SP tokens nearby to keep track of Damage dealt to their Adventurer and assigned Combatants, as well as SP stored and used by their Adventurer. | É importante que cada Aventureiro tenha por perto fichas suficientes de *Dano* e de **SP** para registrar o Dano causado ao próprio Aventureiro e aos Combatentes designados a ele, bem como o **SP** armazenado e usado pelo Aventureiro. |
| `page_35_unit_p35-block-26-loot-deck-heading` | COMBATANT LOOT DECK: | BARALHO DE SAQUE DE COMBATENTES: |
| `page_35_unit_p35-block-26-loot-deck-body` | The Combatant Loot deck is shuffled and placed on the table before each Encounter. When an opponent is Defeated, players will draw from this deck. | O Baralho de Saque de Combatentes é embaralhado e colocado na mesa antes de cada Encontro. Quando um oponente for Derrotado, os jogadores comprarão cartas deste baralho. |

O marcador **E** permanece como está no campo editável separado `page_35_unit_p35-block-26-marker-e`; ele é uma referência visual da página, não prosa a localizar.

## Verificação técnica e visual

- PDF oficial conferido: 102 páginas, caixa 820,346 × 820,346 pt, SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- PDF-fonte e Viewer normal EN comparados em página inteira. Título, textos, marcadores A–H, ornamentos, diagrama, fólio e posições coincidem visualmente. A captura é [`p035-viewer-en.png`](../../../output/proofs/translation-readiness-2026-10-15/p035-viewer-en.png); a fonte renderizada é [`page35.png`](../../../output/proofs/translation-readiness-2026-10-15/p035-source-check/page35.png).
- Admin aberto em modo de leitura com escrita da API bloqueada: 17 campos tipográficos editáveis mais o título abriram chaves separadas. O título usa `page_35_block_5`; `block_26` separa título, corpo e marcador E. O Editor abriu a legenda e o corpo do Loot; fechar sem alterações encerrou a sessão. Foram apenas chamadas GET; nenhum save foi enviado. Captura legível: [`p035-editor-readonly.png`](../../../output/proofs/translation-readiness-2026-10-15/p035-editor-readonly.png).
- A proposta foi montada em 17 overrides num snapshot isolado, com o frame do título centralizado em 620 pt entre os ornamentos. A exportação oficial confirmou 17 registros de tradução, `pdfVerification: true`, uma página e caixa 820,346 × 820,346 pt. A renderização direta do PDF foi inspecionada: as legendas cabem sem colisão ou corte visível; o título permanece centralizado; o diagrama e os marcadores permanecem preservados.
- PDF isolado: [`page-035-pt-BR-proposal-v3.pdf`](../../../output/proofs/translation-readiness-2026-10-15/p035-adventurer-play-area-v1/page-035-pt-BR-proposal-v3.pdf), SHA-256 `E2BF73AF701736A8A101384F722C225028D53C99040E36D4F42F7DD5B3E3755E`. Render Poppler: [`page-035-pt-BR-pdf-render-v3.png`](../../../output/proofs/translation-readiness-2026-10-15/p035-adventurer-play-area-v1/page-035-pt-BR-pdf-render-v3.png), SHA-256 `89A722F9035EFA4AFB3E97B5A7CA8837EBEB68B483F21D185D490DC1B37DD5F0`.
- O gerador reproduzível do snapshot é [`prepare_snapshot.mjs`](../../../output/proofs/translation-readiness-2026-10-15/p035-adventurer-play-area-v1/prepare_snapshot.mjs); os hashes dos sete arquivos de página estão em [`source-hashes.json`](../../../output/proofs/translation-readiness-2026-10-15/p035-adventurer-play-area-v1/source-hashes.json). O snapshot v3 copia os assets de origem e recusa substituir arquivos que tenham mudado.
- Registro reproduzível de hashes e verificações: [`proof-receipt-v3.json`](../../../output/proofs/translation-readiness-2026-10-15/p035-adventurer-play-area-v1/proof-receipt-v3.json).

## Termos e limites

- Aplicados do glossário: `Token` → ficha; `Loot` → saque; `Terrain` → terreno; `Spawn` → surgir; `Draw` → comprar; `See` em referência → veja. A forma singular de `Adventurers` aparece como Aventureiro.
- Permanecem propostas locais, sem alteração no glossário: `Combatant` → Combatente; `Initiative Track` → Trilha de Iniciativa; `Urgency Tokens` → Fichas de Urgência; `Stamina Point` → Ponto de Vigor, mantendo a sigla original `SP`; `Combatant Loot` → Saque de Combatentes; e nomes de algumas mecânicas.
- Os termos do bloco `TOKENS` mantêm o itálico da fonte; `IA`, o `e` da oração e a referência a Fichas de Urgência preservam suas ênfases correspondentes. A arte embutida do diagrama, inclusive seus rótulos, continua compartilhada em inglês e não está incluída nesta proposta.
- O método de exportação teve uma tentativa inicial recusada por ausência de `bleedBox`, `trimBox` e `artBox` no primeiro snapshot. A geometria real da p.35 foi conferida e incluída no snapshot v2/v3; a exportação v3 foi verificada com sucesso. Nenhum arquivo canônico foi alterado para corrigir isso.

**Nenhuma tradução foi gravada no Viewer, Payload ou banco local.** Esta é uma proposta com copyfit demonstrado, não uma aprovação editorial nem localização completa da arte compartilhada.
