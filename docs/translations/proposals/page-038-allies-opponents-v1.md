# p.38 — Aliados, Oponentes e Miniaturas — proposta PT-BR v1

- **Status:** proposta renderizada e revisada visualmente no escopo abaixo; aguarda revisão humana editorial e terminológica. Não é tradução aprovada.
- **Fonte:** PDF EN oficial, p.38/102; SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- **Escopo:** título, introdução e os dois grupos de texto `Allies`/`Opponents` na parte inferior da página. As tabelas e as seções superiores continuam em inglês e não fazem parte desta proposta.
- **Persistência:** snapshot somente em `output/proofs`; nenhuma gravação no Payload, nos sidecars canônicos, no PDF-fonte ou em traduções humanas.

## Proposta

| Chave | Inglês da fonte | Proposta PT-BR |
|---|---|---|
| `page_38_block_26__pt-BR` | Allies, Opponents, and Figures | Aliados, Oponentes e Miniaturas |
| `page_38_block_23__pt-BR` | Throughout the game, Abilities and Actions on Adventurers, Intelligent Combatants, and Command Combatants will reference targets that are either “opponents”, “allies”, or “figures.” While opponents and allies refer to specific groups of figures, the word “figure” is used to refer to both opponents and allies. See Opponents and Allies on Pg. 69. | Ao longo do jogo, Habilidades e Ações de Aventureiros, Combatentes Inteligentes e Combatentes de Comando fazem referência a alvos que podem ser “oponentes”, “aliados” ou “miniaturas”. Embora “oponentes” e “aliados” designem grupos específicos de miniaturas, o termo “miniatura” abrange tanto oponentes quanto aliados. Veja *Oponentes e Aliados*, pág. 69. |
| `page_38_unit_p38-block-48-first-size-13pt__pt-BR` | ALLIES | ALIADOS |
| `page_38_unit_p38-block-48-remaining-size-10pt__pt-BR` | Allies are figures that share the same goal and have no reason to hinder each other in achieving that goal. They are depicted in Diagrams and Encounters with a green border. If you're taking the turn of an Adventurer or friendly Combatant Card depicted with a green border, all figures with this green border are considered your allies. All Abilities that refer to Allies on these cards refer to figures with green Borders. Meanwhile, all figures depicted with a red border are considered your opponents. | Aliados são miniaturas com o mesmo objetivo, sem motivo para atrapalhar umas às outras. Têm borda verde em Diagramas e Encontros. No turno de um Aventureiro ou de uma Carta de Combatente aliada, ambos com borda verde, as miniaturas dessa cor são suas aliadas. Nessas cartas, Habilidades que mencionam Aliados referem-se às miniaturas de borda verde. As de borda vermelha são suas oponentes. |
| `page_38_unit_p38-block-49-first-size-13pt__pt-BR` | OPPONENTS | OPONENTES |
| `page_38_unit_p38-block-49-remaining-size-10pt__pt-BR` | Opponents are figures that oppose the Adventurers. They are depicted in Diagrams and Encounters with a red border. If you're taking the turn of an Intelligent Combatant Card depicted with a red border, all figures with this red border are considered your allies. All Abilities that refer to Allies on these cards refer to figures with red Borders. Meanwhile, all figures depicted with a green border are considered your opponents. Any figure that Spawns during an Encounter is considered an opponent to the Adventurers unless stated otherwise. | Oponentes são miniaturas que se opõem aos Aventureiros. Têm borda vermelha em Diagramas e Encontros. No turno de uma Carta de Combatente Inteligente com essa borda, as miniaturas de borda vermelha são suas aliadas. Nessas cartas, Habilidades que mencionam Aliados referem-se às miniaturas dessa cor. As de borda verde são suas oponentes. Salvo indicação em contrário, miniaturas que surgirem durante um Encontro são oponentes dos Aventureiros. |

## Terminologia e fidelidade

- `Figures → Miniaturas` e `Spawn → Surgir` seguem o glossário oficial. `Aliados, Oponentes e Miniaturas` também coincide com o título PT-BR humano existente na p.3; “Aliados” e “Oponentes” não estão atualmente no glossário como entradas próprias.
- `Combatante`, `Combatente Inteligente`, `Carta de Combatente aliada`, `Diagrama`, `Encontro`, `Habilidade` e as formas de referência são escolhas locais desta proposta e aguardam revisão humana. Nenhuma entrada do glossário foi alterada.
- As seis unidades mantêm os segmentos e formatos de fonte correspondentes às unidades de origem. Não foi feita alteração de frame, geometria, ilustração, máscara ou símbolo.

## Prova de composição

- Provas e snapshot imutável: [`p038-allies-opponents-v1`](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/).
- [Viewer PT-BR isolado](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-viewer-v2-final.png) · [PDF isolado](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-proposal-v2-final.pdf) · [render direto do PDF](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-poppler-v2-final.png) · [fonte EN](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/source-pdf-page-038.png).
- A exportação verificou os seis overrides no snapshot e produziu PDF de uma página no formato da fonte (`820.346 × 820.346 pt`). Viewer e render Poppler foram comparados com a fonte. A seção traduzida mantém ilustrações, bordas verde/vermelha, fundo, tabelas vizinhas e paginação. Os dois corpos ocupam 6 e 7 linhas e ficam dentro dos frames de origem; o parágrafo introdutório ocupa 4 linhas e também fica dentro do frame. Não houve mudança de geometria.
- A v1 de copyfit foi preservada como evidência de revisão e excedia o frame dos corpos em 12.11 pt (Aliados) e 1.10 pt (Oponentes). Esta proposta usa a v2, sem terceira rodada de ajuste. Isso atesta apenas o escopo visível e medido aqui, não toda a p.38.
- SHA-256 do PDF isolado: `E3F0609AEA5EFC84C773C5E115BDA84E5F8C9353D36114C4B287D9E9166D3156`; snapshot final: `979FFC975E5D637FDE91BA9CE23026DCCC079840B367670E7CBC72CC6A474D49`; captura do Viewer: `C14CDD25DE5FD3AA43B491B40113C4C046EEA0F2F63DBAA0CE50F78C875A0827`; render Poppler: `D1466C41CA0531E546346C48152E2AF6AA141C0ED94656344506AA4979144390`. Hashes dos arquivos-fonte: [`source-hashes-v1.json`](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/source-hashes-v1.json).

## Próxima decisão

Revisar a redação e as escolhas terminológicas antes de aprovar a proposta. Não copiar as chaves para o Payload, sidecar canônico ou tradução humana aprovada sem essa revisão.
