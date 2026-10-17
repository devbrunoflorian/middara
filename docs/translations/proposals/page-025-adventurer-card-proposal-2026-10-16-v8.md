# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v8

**Estado:** 12 unidades editáveis têm proposta; 9/9 unidades ativas passaram Viewer, Editor read-only, Copyfit V3 e PDF de uma página. As três unidades com falha ficam integralmente em branco apenas no diagnóstico v8; suas fontes e propostas completas permanecem preservadas. Quatorze grupos impressos no card aguardam localização de arte. Quatro traduções humanas (IDs 320–323) foram mantidas; zero writes no Payload e nenhuma alteração canônica.


## Verificações técnicas

- Viewer PT-BR: 9/9 candidatos ativos visíveis e correspondentes; os três textos-fonte bloqueados estão ausentes, sem fallback ou tradução parcial.
- Editor read-only: 9/9 candidatos ativos selecionados e conferidos; todos os diálogos foram cancelados sem salvar.
- Copyfit V3/PDF: 9 candidatos visíveis; excesso direito/inferior máximo de 0.000 pt (tolerância 0,05 pt). O PDF tem uma página de 820,346 × 820,346 pt; zero caracteres de substituição/uso privado.
- Blanking diagnóstico: block_84, block_86 e block_87 ficam vazios como unidades inteiras somente no snapshot PT-BR. As propostas completas permanecem no JSON/Markdown; os spans originais não foram alterados no canônico.
- Raster: Viewer, impressão e raster independente do PDF foram inspecionados. Não há colisão/corte visível nos nove alvos PT-BR ativos; a arte original permanece visível.
- Payload: quatro registros humanos antes/depois, IDs 320–323 intactos; somente GET; zero writes. DOM, arte e molduras canônicas mantiveram os hashes de origem.

## Unidades de página editáveis

### block_91

**EN:** Adventurer Card Breakdown

**PT-BR:** Componentes da Carta de Aventureiro

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Adventurer Card → Carta de Aventureiro é o composto proposto para o título; confirmar com o glossário.

### block_83 / p25-block-83-remaining-size-10pt

**EN:** The Special Ability this Adventurer has access to.

**PT-BR:** Acesso à Habilidade Especial do Aventureiro.

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Special Ability → Habilidade Especial é forma local para revisão de caixa e capitalização.

### block_84 / p25-block-84-localized-body-v1

**EN:** The Adventurer's base dice are used for Conviction Checks and casting a SPELL. Over the course of the game, Adventurers will Gain Items and Abilities that will upgrade these base dice.

**PT-BR:** Os dados base do Aventureiro são usados em Testes de Convicção e para conjurar FEITIÇO. Durante a partida, os Aventureiros recebem Itens e Habilidades que aprimoram esses dados.

**Diagnóstico:** blank_whole_unit_diagnostic_only

**Revisão pendente:** Base Dice → dados base; Conviction Checks → Testes de Convicção são formas propostas. Spell → Feitiço segue o glossário; revisar caixa alta de FEITIÇO e Gain/receive.

### block_84 / p25-block-84-font-size-9pt-unit-00

**EN:** BASE DICE:

**PT-BR:** DADOS BASE:

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** BASE DICE → DADOS BASE é proposta de rótulo; confirmar a nomenclatura.

### block_85 / p25-block-85-remaining-size-10pt

**EN:** These 5 Skills are used to make Skill Checks when instructed by Adventure Mechanics or Special Encounter Rules, such as dodging traps or convincing a guard to let you pass by.

**PT-BR:** Use estas 5 Perícias nos Testes de Habilidade indicados pelas Mecânicas da Aventura ou Regras Especiais de Encontro: desviar de armadilhas ou convencer um guarda a deixá-lo passar.

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Adventure Mechanics → Mecânicas da Aventura e Special Encounter Rules → Regras Especiais de Encontro seguem o glossário; harmonizar Perícias/Perícia e maiúsculas.

### block_86 / p25-block-86-localized-legend-v1

**EN:** D: Presence; E: Lore; F: Agility; G: Perception; H: Strength.

**PT-BR:** D: Presença; E: Saber; F: Agilidade; G: Percepção; H: Força.

**Diagnóstico:** blank_whole_unit_diagnostic_only

**Revisão pendente:** Lore → Saber é adaptação curta; Presença, Agilidade, Percepção e Força não constam do glossário; harmonizar os cinco atributos.

### block_87 / p25-block-87-font-size-9pt-unit-00

**EN:** HEALTH (HP):

**PT-BR:** SAÚDE (HP):

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Health → Saúde é proposta de nome para o atributo; HP fica como sigla original.

### block_87 / p25-block-87-localized-body-v1

**EN:** This is the Adventurer's base Maximum HP. Damage tokens are added to the Adventurer’s card and if an Adventurer's Damage equals their Maximum HP, they are Defeated.

**PT-BR:** Este é o HP máximo base do Aventureiro. Fichas de Dano são adicionadas à carta do Aventureiro; quando o Dano atinge seu HP máximo, ele é Derrotado.

**Diagnóstico:** blank_whole_unit_diagnostic_only

**Revisão pendente:** Damage token → Ficha de Dano, Maximum HP → HP máximo e Defeated → Derrotado são formas locais; revisar precisão das condições de derrota.

### block_88 / p25-block-88-first-size-9pt

**EN:** DEFENSE:

**PT-BR:** DEFESA:

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Defense → Defesa é proposta para o atributo e heading.

### block_88 / p25-block-88-remaining-size-10pt

**EN:** This is the Adventurer’s base Defense Value and determines how difficult the Adventurer is to hit.

**PT-BR:** Este é o Valor de Defesa base do Aventureiro e determina o quão difícil é acertá-lo.

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Defense Value → Valor de Defesa é proposta local; conferir uso em regras.

### block_89 / p25-block-89-first-size-9pt

**EN:** MOVEMENT:

**PT-BR:** MOVIMENTO:

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Movement → Movimento é proposta para o atributo e heading.

### block_89 / p25-block-89-remaining-size-10pt

**EN:** This is the Adventurer's base Movement Value and determines how many spaces the Adventurer may move when making a Move Action.

**PT-BR:** Este é o Valor de Movimento base do Aventureiro e determina quantos espaços ele pode mover ao realizar uma Ação de Movimento.

**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente

**Revisão pendente:** Movement Value → Valor de Movimento e Move Action → Ação de Movimento são formas locais; revisar a terminologia mecânica.

## Texto impresso dentro da carta — exceções abertas

A imagem completa da carta em background.webp já contém estes rótulos e textos em inglês. A primeira tentativa de sobrepor traduções aos alvos extraídos produziu duplicação e fragmentos fora da curva original; os candidatos completos permanecem aqui para a futura localização do artwork.

### p25-card-adventurer-label

**Blocos:** block_5

**EN:** ADVENTURER

**PT-BR proposto:** AVENTUREIRO

**Ação:** Provide or create a localized card-art variant, then verify the full card in the Viewer and exported PDF.

### health

**Blocos:** block_6

**EN:** HEALTH

**PT-BR proposto:** SAÚDE

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### movement

**Blocos:** block_12

**EN:** MOVEMENT

**PT-BR proposto:** MOVIMENTO

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### defense

**Blocos:** block_20

**EN:** DEFENSE

**PT-BR proposto:** DEFESA

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### presence

**Blocos:** block_28, block_32

**EN:** PRESENCE

**PT-BR proposto:** PRESENÇA

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### agility

**Blocos:** block_36, block_39

**EN:** AGILITY

**PT-BR proposto:** AGILIDADE

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### perception

**Blocos:** block_43

**EN:** PERCEPTION

**PT-BR proposto:** PERCEPÇÃO

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### strength

**Blocos:** block_53

**EN:** STRENGTH

**PT-BR proposto:** FORÇA

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### lore

**Blocos:** block_61, block_63

**EN:** LORE

**PT-BR proposto:** SABER

**Ação:** Localize the label in a card-art variant and preserve its curved placement, then verify the full card in the Viewer and exported PDF.

### p25-card-ability-title

**Blocos:** block_69

**EN:** Ambitious

**PT-BR proposto:** Ambiciosa

**Ação:** Localize the ability title in a card-art variant; confirm the title term in human editorial review.

### p25-card-ability-timing

**Blocos:** block_69

**EN:** PER ENCOUNTER

**PT-BR proposto:** POR ENCONTRO

**Ação:** Localize the timing label in a card-art variant; confirm the game-term treatment of Encounter.

### p25-card-ability-description

**Blocos:** block_69

**EN:** Nightingale’s commanding personality makes her a natural leader.

**PT-BR proposto:** A personalidade imponente de Nightingale faz dela uma líder natural.

**Ação:** Localize the body copy in a card-art variant and confirm the wording in human editorial review.

### p25-card-ability-effect

**Blocos:** block_69

**EN:** Ambitious PER ENCOUNTERNightingale’s commanding personality makes her a natural leader. All other allies Gain +1 SP. Nightingale Gains +2 SP.

**PT-BR proposto:** Todos os demais aliados ganham +1 SP. Nightingale ganha +2 SP.

**Ação:** Localize the complete effect in a card-art variant and confirm Gain/capitalization in human editorial review.

### p25-card-conviction-casting

**Blocos:** block_70

**EN:** Conviction: / Casting:

**PT-BR proposto:** CONVICÇÃO: / CONJURAÇÃO:

**Ação:** Localize both labels in a card-art variant and confirm the contextual form for Casting.

## Unidades em branco no diagnóstico v8

### p25-block-84-body

**EN:** The Adventurer's base dice are used for Conviction Checks and casting a SPELL. Over the course of the game, Adventurers will Gain Items and Abilities that will upgrade these base dice.

**PT-BR proposto:** Os dados base do Aventureiro são usados em Testes de Convicção e para conjurar FEITIÇO. Durante a partida, os Aventureiros recebem Itens e Habilidades que aprimoram esses dados.

**Motivo:** The translated body is painted together with a repeated tail in the Viewer, and the Admin Editor opens the parent block instead of this body unit.

**Ação:** Correct the occurrence-specific source-span references and Admin selection boundary so the full unit renders once; rerun Viewer, Editor and one-page PDF checks. Keep the whole unit blank only in the isolated diagnostic while unresolved; do not show source-English fallback or partial PT-BR.

### p25-block-86-legend

**EN:** D: Presence; E: Lore; F: Agility; G: Perception; H: Strength.

**PT-BR proposto:** D: Presença; E: Saber; F: Agilidade; G: Percepção; H: Força.

**Motivo:** The translated legend is duplicated in its Viewer target, and the Admin Editor opens a parent value containing repeated legend text.

**Ação:** Correct the occurrence-specific source-span references and Admin selection boundary so the full unit renders once; rerun Viewer, Editor and one-page PDF checks. Keep the whole unit blank only in the isolated diagnostic while unresolved; do not show source-English fallback or partial PT-BR.

### p25-block-87-body

**EN:** This is the Adventurer's base Maximum HP. Damage tokens are added to the Adventurer’s card and if an Adventurer's Damage equals their Maximum HP, they are Defeated.

**PT-BR proposto:** Este é o HP máximo base do Aventureiro. Fichas de Dano são adicionadas à carta do Aventureiro; quando o Dano atinge seu HP máximo, ele é Derrotado.

**Motivo:** The translated body repeats extracted text in the Viewer, reaches into the following DEFENSE heading, and the Admin Editor opens the parent block rather than this body unit.

**Ação:** Correct the occurrence-specific source-span references and Admin selection boundary so the full unit renders once; rerun Viewer, Editor and one-page PDF checks. Keep the whole unit blank only in the isolated diagnostic while unresolved; do not show source-English fallback or partial PT-BR.

## Registros humanos e conteúdo mantido

- **page_25_unit_p25-block-85-first-size-9pt__pt-BR** (ID 323): preserved_as_saved_human_translation; no candidate replaces this key. Texto salvo: “PERÍCIAS:”
- **page_25_unit_p25-block-83-first-size-9pt__pt-BR** (ID 322): preserved_as_saved_human_translation; no candidate replaces this key. Texto salvo: “HABILIDADE DO PERSONAGEM:”
- **page_25_unit_p25-block-82-remaining-size-10pt__pt-BR** (ID 321): preserved_as_saved_human_translation; no candidate replaces this key. Texto salvo: “Os pontos vermelhos indicam quantos Pontos de Vigor (SP) um Aventureiro recupera a cada turno, e a quantidade total de pontos, o máximo de SP que um Aventureiro pode ter a qualquer momento.”
- **page_25_unit_p25-block-82-first-size-9pt__pt-BR** (ID 320): preserved_as_saved_human_translation; no candidate replaces this key. Texto salvo: “BARRA DE RECUPERAÇÃO DE VIGOR:”

- **block_27:** 6 7 12 — Numerical character-card values are language-independent.
- **block_65:** 6 3 5 2 2 — Numerical character-card values are language-independent.
- **block_71:** Nightingale Arsen — Character proper name retained.
- **block_72 and callout blocks:** A–K — Callout labels identify diagram locations and remain stable references.

## Persistência e evidência

- PDF oficial SHA-256: a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351.
- Fonte EN, Viewer EN e PDF isolado foram comparados; o card inteiro aparece no background da página.
- Snapshot isolado: C:\Users\bruno\Middara\Rulebook App\output\proofs\translation-readiness-2026-10-16\p025-adventurer-card-proposal-v8\snapshot; zero frames de diagnóstico.
- Payload: quatro registros existentes preservados (IDs 320–323), sem frames salvos e zero writes.
- A lista de exceções guarda o texto completo, chaves de origem e ação futura para não confundir texto impresso com tradução editável.

## Histórico

A v7 foi preservada como registro histórico e usava fallback inglês nas três unidades. A v8 corrige apenas o diagnóstico isolado; não altera a proposta integral, a fonte canônica nem os quatro registros humanos.

Evidências v8: [Viewer](../../../output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/viewer-pt-BR-v8.png), [Editor read-only](../../../output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/editor-readonly-v8.png), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/page-025-pt-BR-v8.pdf), [raster independente](../../../output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/pdf-render-v8.png), [Copyfit V3](../../../output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/copyfit-v3-receipt-v8.json).

Histórico v7: [proposta JSON](page-025-adventurer-card-proposal-2026-10-16-v7.json), [Markdown](page-025-adventurer-card-proposal-2026-10-16-v7.md) e [relatório](../../project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).
