# p.38 — Habilidades Padrão (Tabela 2) — proposta isolada

**Status:** proposta PT-BR com copyfit visual validado no Viewer e no PDF isolado; redação e terminologia aguardam revisão humana. Não foi salva como tradução canônica ou humana.

## Fonte e escopo

- Fonte: PDF EN oficial, p.38/102; SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- DOM da p.38: SHA-256 `06E77BDA52695F7BAFF99FB769D4728368FC37C3E949EB30278AB040BE94BEE8`.
- Escopo: título, três cabeçalhos, três rótulos de ação e cinco unidades descritivas da Tabela 2.
- Snapshot imutável: [`snapshot-standard-abilities-v2.json`](../../../output/proofs/translation-readiness-2026-10-15/p038-standard-abilities-v2/snapshot/snapshot-standard-abilities-v2.json), com 22 registros preexistentes da p.38 + 12 desta proposta.
- Nenhum dado foi gravado no Payload, em sidecar canônico ou em tradução humana. PDF-fonte, DOM, frames e arte permanecem intactos.

## Proposta

**Título:** Tabela 2: Habilidades padrão

| Ação | Custo da fonte | Descrição proposta |
| --- | --- | --- |
| ESQUIVA | marcador vermelho da fonte | Durante a etapa de Esquiva de um Ataque, role o dado **PRETO** [dado preto]. Para cada [escudo sólido] rolado, o Aventureiro recebe **+1** de Defesa. Se a [caveira] sair, o Aventureiro não recebe Defesa adicional. Consulte *Esquiva*, pág. 52. |
| POTENCIAR | marcador vermelho da fonte | Ao montar sua Reserva de Dados de Combate durante um Ataque ou ao determinar a Força de um Feitiço, você pode gastar **1 SP** adicional para incluir o dado **PRETO** [dado preto]. |
| POTENCIAR | — | Ao Potenciar um Ataque, os símbolos obtidos neste dado podem ser gastos para usar as Habilidades de Símbolo impressas nas suas Armas. Se a [caveira] sair durante este Ataque, o Ataque erra automaticamente. |
| POTENCIAR | — | Ao Potenciar um Feitiço, você pode gastar os resultados [página] obtidos no dado **PRETO** [dado preto] para aumentar a Força do Feitiço em **+1** por cada resultado [página] gasto. Se a [caveira] sair durante este Feitiço, o Feitiço falha automaticamente contra o alvo. Cause imediatamente **3** de **DANO IRREDUTÍVEL** ao conjurador e encerre a Ação de Feitiço. |
| REVIDE | marcador vermelho “2” da fonte | Se um Ataque não causar Dano Final, **REVIDE** o Ataque. Se você tiver esquivado deste Ataque com sucesso, reduza em **1 SP** o custo de qualquer Revide subsequente. Consulte *Revide*, pág. 49. |

“AÇÃO”, “CUSTO SP” e “DESCRIÇÃO” são os cabeçalhos propostos. Os marcadores circulares e os custos desenhados continuam sendo arte da página; não foram substituídos por texto.

## Chaves de tradução

- `page_38_block_21__pt-BR` — título da Tabela 2.
- `page_38_unit_p38-block-27-action-header__pt-BR`, `page_38_unit_p38-block-27-cost-header__pt-BR`, `page_38_unit_p38-block-27-description-header__pt-BR` — cabeçalhos.
- `page_38_block_13__pt-BR` — ESQUIVA; `page_38_unit_p38-block-30-dodge-description__pt-BR` — descrição.
- `page_38_block_15__pt-BR` — POTENCIAR; `page_38_unit_p38-block-33-empower-intro__pt-BR`, `page_38_unit_p38-block-34-empower-attack__pt-BR`, `page_38_unit_p38-block-35-empower-spell__pt-BR` — descrições.
- `page_38_block_19__pt-BR` — REVIDE; `page_38_unit_p38-block-38-description__pt-BR` — descrição.

## Símbolos semânticos preservados

Os nove símbolos da fonte foram mantidos como segmentos com ID semântico no snapshot, na mesma ordem em cada unidade:

- Esquiva: `dice.black`, `combat.shield.solid`, `combat.skull`.
- Introdução de Potenciar: `dice.black`.
- Potenciar Ataque: `combat.skull`.
- Potenciar Feitiço: `combat.page`, `dice.black`, `combat.page`, `combat.skull`.

O snapshot declara 3 `dice.black`, 3 `combat.skull`, 1 `combat.shield.solid` e 2 `combat.page`. O exportador conferiu os 34 registros do snapshot contra o texto e a ordem dos símbolos efetivamente renderizados; o PDF isolado contém os trechos PT-BR selecionados e mede `820.346 × 820.346 pt`.

## Copyfit e fidelidade

A tentativa v1 usou `POTENCIALIZAR` no rótulo. A medição deu 68.23 pt para um frame de origem de 42.22 pt, invadindo a coluna do custo; essa tentativa e suas capturas foram preservadas em `p038-standard-abilities-v1/`.

Na v2, o rótulo `POTENCIAR` mede 49.24 pt. Na posição renderizada, termina em x=140.90 pt; o frame da coluna de custo começa em x=145.14 pt, restando 4.24 pt de separação. O rótulo não encobre o marcador. As descrições continuam dentro da tabela, sem cobrir dados vizinhos. Nenhuma fonte, frame, escala ou geometria foi alterada para forçar encaixe.

Captura comparativa legível com fonte EN, Viewer normal e rasterização do PDF isolado:

- [Comparação EN / Viewer / PDF](../../../output/proofs/translation-readiness-2026-10-15/p038-standard-abilities-v2/page-038-standard-abilities-source-viewer-pdf-v2.png)
- [PDF isolado da página 38](../../../output/proofs/translation-readiness-2026-10-15/p038-standard-abilities-v2/page-038-pt-BR-standard-abilities-v2.pdf)
- [Verificação reproduzível e hashes](../../../output/proofs/translation-readiness-2026-10-15/p038-standard-abilities-v2/verification-standard-abilities-v2.json)

A comparação visual não mostrou símbolos duplicados ou ausentes, perda dos marcadores, fantasmas, máscara, recorte ou invasão de texto nas linhas vizinhas. O Viewer PT-BR e o PDF isolado mostram a mesma composição. Isso comprova apenas o escopo da Tabela 2; não é aprovação editorial nem teste do fluxo de edição no Rich Block Editor.

## Terminologia e pendências

`Esquiva`, `Potenciar`, `Revide`, `Dados de Combate`, `Defesa`, `Força do Feitiço`, `Dano Final`, `Dano Irredutível`, `Ação de Feitiço` e o cabeçalho compacto `CUSTO SP` são propostas locais sem aprovação humana nesta etapa. O termo `Potenciar` foi escolhido para caber no rótulo sem perder a raiz semântica da proposta `Potencializar`; a preferência editorial continua aberta. Nenhuma entrada do glossário foi alterada.

A Tabela 1, preservada como base de 22 registros, ainda exibe `SP COST` em inglês porque sua tentativa anterior `CUSTO DE SP` excedeu o frame. A Tabela 2 usa `CUSTO SP`; a divergência fica registrada para decisão/copyfit próprio e não foi ocultada nesta prova.

O exportador oficial e a conferência textual/geométrica do PDF foram executados. A suíte completa de testes e o fluxo de edição, remoção/reinserção, undo/redo e cancelamento do Rich Block Editor não foram executados nesta proposta de conteúdo isolada. Não há alegação de aprovação desses testes.
