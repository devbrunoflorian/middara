# p.40 — Regras de Movimento — proposta isolada v2

**Status:** proposta PT-BR renderizada no Viewer e no PDF isolado, pendente de revisão humana. Nenhum conteúdo foi salvo como tradução canônica.

## Fonte e composição

- PDF oficial EN, p.40/102: SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- DOM: `F8CCBF99B2AFD08530EAAFB4D0EA2F2D30081DB77A7DF19F8DB577C5B8836C2D`.
- Compostos A–D: `B9838765B194A43A0CB05450EBA6CC0AC067580ECF663E286F7DBD3681A65390`.
- Overlays: `EE473CC17670110F51BD51E249A5DDA283C5A3315751D2A79C0F27B5C2DE77A5`.
- Fundo: `F9D3D0E4809C99E8D7037168AAF7520B14E55B600D0667F6BD21FE4E358DCC2B`.
- A proposta contém 11 registros: título e exemplo de movimento; parágrafos explicativos; definições de Empurrar, Puxar e Comandar; regra de movimento livre e exemplo; título da seção. As dez referências da prosa são objetos semânticos na ordem **B, D, B, C, D, B, A, A, A, B**. Os dois A/B grandes nos mapas continuam parte dos diagramas e não são reinseridos pelo texto.
- O [JSON](page-040-movement-rules-proposal-2026-10-15.json) preserva chaves, caixas, estilos ricos, sequência dos marcadores e texto. O [snapshot de exportação](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/snapshot/snapshot-movement-rules-v2-export.json), o [manifesto de hashes](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/source-hashes-v2.json), o [gerador](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/prepare-movement-rules-v2.mjs) e o [verificador independente](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/verify-movement-rules-v2.py) permitem reproduzir a prova neste workspace.

## Texto proposto

**Exemplo de Movimento:** Na Fase de Ação de Zeke, ele quer chegar à ficha de Saque a oeste de Remi. Ele gasta **1 SP** para realizar uma Ação de Movimento e recebe Pontos de Movimento iguais ao Valor de Movimento da Carta de Aventureiro: **6**. Como miniaturas não se movem na diagonal, deve escolher entre a rota curta a oeste, pelo Terreno Difícil (termina em `[B]`), e a longa ao sul, até `[D]`.

Se Zeke seguir pela rota curta até `[B]`, o Animado fará um Ataque de Oportunidade quando ele sair de `[C]` (consulte *Diagonais e Ataques de Oportunidade*, pág. **42**). Se for até `[D]`, evitará o perigo, mas terminará mais longe do objetivo.

Após passar pelo Animado e pelo Terreno Difícil até `[B]`, Zeke pode gastar mais SP para receber **2** Pontos de Movimento e atravessar o espaço de Remi. Por ela ser aliada, Zeke pode atravessar o espaço, mas não parar nele. Sair do espaço de uma aliada custa **2** Pontos de Movimento; então, ele só alcançará `[A]` se gastar mais **2 SP** para receber **4** Pontos de Movimento. Ao chegar a `[A]`, ainda terá **1** Ponto de Movimento.

**EMPURRAR** é uma Habilidade que move uma miniatura oponente para longe do espaço ocupado mais próximo de quem usa a Habilidade. O alvo só pode entrar em espaços mais distantes dessa miniatura e deve ser movido diretamente para longe dela, em linha reta.

**PUXAR** é uma Habilidade que aproxima uma miniatura oponente de quem a usa. O alvo só pode entrar em espaços mais próximos do destino. Os espaços não precisam estar em linha reta, desde que cada passo o aproxime conforme as Regras de Movimento. O destino é o espaço mais próximo de quem usa PUXAR; se possível, o alvo termina adjacente.

**COMANDAR** é uma Habilidade que move uma miniatura oponente em uma única direção ortogonal escolhida por quem a usa, até a quantidade indicada.

Se o alvo de Empurrar, Puxar ou Comandar for um Aventureiro posicionado na diagonal ou com mais de uma opção em relação ao oponente que usa a Habilidade, o Aventureiro deve escolher a direção de movimento mais prejudicial. Consulte *Em Direção e Para Longe*, pág. **62**.

Empurrar, Puxar e Comandar são formas de Movimento Livre. O alvo não provoca um Ataque de Oportunidade contra a miniatura que usou a Habilidade. Se uma miniatura for movida para Terreno Obstruído ou para o espaço de outra miniatura por Empurrar ou Comandar, ela para e sofre o restante do movimento como **DANO IRREDUTÍVEL**. Enquanto é movida por Empurrar, Puxar ou Comandar, não pode realizar Ações, usar Habilidades que concedam Ações nem Habilidades que movam uma miniatura.

**Exemplo:** O Earth Loa usa a Habilidade **EMPURRAR** e move Zeke **3** espaços em linha reta para longe dele. Como Zeke está na diagonal em relação ao Earth Loa, deve escolher entre mover-se **3** espaços ao sul ou a oeste. Se for a oeste, entrará na Borda da Peça no espaço `[A]` e sofrerá **1 DANO IRREDUTÍVEL** pelo espaço extra que não pode percorrer. Se for ao sul, sairá do Terreno Perigoso e será derrotado. Como essa é a opção mais prejudicial, Zeke deve ir ao sul até o espaço `[B]` e ser derrotado. Como o Earth Loa usou a Habilidade, não fará um Ataque de Oportunidade contra Zeke.

### Título da seção

**Empurrar, Puxar e Comandar** — reduzido de 18 pt para 14 pt para caber em uma linha dentro do quadro de origem. A v1 com 18 pt quebrou para duas linhas e invadiu a área da prosa; a v2 foi visualmente conferida no Viewer e no PDF.

## Evidências

- [Viewer normal PT-BR](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/page-040-pt-BR-viewer-v2.png)
- [Rasterização do PDF efetivamente exportado](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/page-040-pt-BR-pdf-raster-v2.png)
- [Comparação da fonte EN, Viewer e PDF na seção inferior](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/page-040-lower-source-viewer-pdf-v2.png)
- [PDF isolado](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/page-040-pt-BR-movement-rules-v2.pdf) · SHA-256 `11FEC65197267D21662AEEB4FA2769ED06948669A05808BB4F314C7D956819B6`.
- [Relatório independente de verificação](../../../output/proofs/translation-readiness-2026-10-15/p040-movement-rules-v2/verification-movement-rules-v2.json).

O Viewer normal confirmou os 11 registros, dez símbolos e quatro imagens. O verificador independente encontrou todos os textos propostos no PDF real, sem caracteres de substituição ou PUA, e confirmou a caixa de `820.346 × 820.346 pt`. A inspeção visual não encontrou título sobre a prosa, cópia cortada, marcador duplicado ou artefato visível de máscara nas áreas avaliadas. A interação do Rich Block Editor não foi verificada.

## Termos e decisões pendentes

- O glossário oficial contém **Breaking Attack → Ataque de Oportunidade**, mas o texto desta página usa **Break Attack**. A equivalência proposta ainda precisa de decisão humana.
- `Animate → Animado`, `Push/Pull/Command → Empurrar/Puxar/Comandar`, `Movement Value`, `Movement Points`, `Free Movement`, `SP` e os títulos de seção citados são escolhas locais ainda não aprovadas para o glossário.
- “Borda da Peça” e as formulações sobre o destino de PUXAR e a direção mais prejudicial pedem revisão editorial/gameplay.
- O cabeçalho de 14 pt precisa de aceite visual/editorial; a proposta não foi ativada no Viewer persistido.

## Integridade

Não alterei sidecars canônicos, DOM, compostos, frames, overlays, fundo, PDF-fonte, Payload ou traduções humanas. A prova usa snapshot imutável isolado; nada foi salvo no Editor.
