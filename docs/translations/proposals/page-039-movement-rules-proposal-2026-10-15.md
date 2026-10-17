# p.39 — Regras de Movimento — proposta isolada

**Status:** proposta PT-BR com renderização conferida no Viewer do aplicativo e no PDF isolado. Redação e terminologia continuam pendentes de revisão humana. Nenhum conteúdo foi salvo como tradução canônica.

## Fonte e escopo

- PDF EN oficial, p.39/102: SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- DOM da p.39: `176A0235B6246A5796E9FA9A4D0D0CAD12A807469CB5C779B5B65302D9CCA934`.
- Sidecars de âncoras, frames, overlays e fundo: hashes `A365B42C2414D36C260C0EDF03059231D5960A02C27828E52B01D11C210C65DD`, `DE79F651AB1314685FBCE7E1F9C9107F6766148893798FC4D8446A855344663D`, `4307FE857221C110BF1AA2E70221EC932809A4DBD69D3292C2E00C1ABA07F049` e `EBC2BDCA893ADC359CEC01DBC55732E6BE971D7102A62008E77B62420E5F2AAB`.
- A proposta contém 22 registros únicos: exemplos, prosa de Ação de Movimento, chamadas IMPORTANT, prosa de Movimento Livre/Diagonal, cabeçalho Ação de Movimento e legendas A–D do diagrama. O [JSON estruturado](page-039-movement-rules-proposal-2026-10-15.json) preserva as chaves, caixas, estilos ricos, símbolos e texto exatos.
- O [snapshot de exportação](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/snapshot/snapshot-movement-rules-v2-export.json) copia os assets canônicos da p.39; o [manifesto de hashes](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/source-hashes-v2.json) e o [gerador](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/prepare-movement-rules-v2.mjs) verificam a origem antes de produzir a prova.

## Texto proposto

- **Ação de Movimento:** Aventureiros podem realizar apenas **1** Ação de Movimento por turno. Ela custa **1 SP** e permite mover a miniatura até o Valor de Movimento indicado na Carta de Aventureiro. O movimento é sempre contado ortogonalmente; por isso, não é possível mover-se na diagonal. Depois de percorrer até seu Valor de Movimento, o Aventureiro pode gastar SP. Para cada SP adicional, acrescente **+2** ao Valor de Movimento dessa Ação.
- Áreas de uma **Peça** marcadas com `[terrain.red-border]` não podem ser ocupadas nem atravessadas. Uma miniatura **não pode** atravessar miniaturas oponentes. Para atravessar aliados, gaste **2** Pontos de Movimento para sair do espaço deles. Esse custo não se acumula com aumentos causados por Terreno Difícil ou Terreno de Água.
- `[tag.important.icon]` **IMPORTANTE:** Uma miniatura **não pode** terminar seu movimento no espaço de outra miniatura aliada.
- Como o Aventureiro sempre deve concluir uma Ação antes de iniciar outra, o movimento não pode ser interrompido por outras Ações. Por exemplo, você **não pode** percorrer metade do Valor de Movimento, atacar e então concluir o movimento.
- Algumas Habilidades permitem uma Ação de Movimento. Salvo indicação em contrário, ela conta como a Ação de Movimento do turno.
- `[tag.important.icon]` **IMPORTANTE:** Ao terminar uma Ação de Movimento, todos os Pontos de Movimento não gastos são perdidos.
- **Movimento Livre e Movimento Diagonal:** Algumas Disciplinas e Cartas de Item têm Habilidades que instruem você a Mover-se. O movimento concedido por essas Habilidades **não** conta como Ação de Movimento do turno. Essas Habilidades **não podem** ser usadas *durante* outra Ação.
- Além disso, a miniatura se move o número de espaços indicado, sem sofrer *Efeitos Negativos* no movimento causados pelo Terreno ou por aliados. Ainda assim, Terreno Obstruído e miniaturas oponentes impedem que um Aventureiro atravesse seus espaços com Movimento Livre; nas circunstâncias normais, Terreno Perigoso ainda **derrotaria** um Aventureiro.
- Algumas dessas Habilidades permitem mover-se na diagonal. Esse movimento segue as limitações de traçar a Linha de Visão na diagonal: ainda é preciso atravessar **1** dos **2** espaços ortogonais, e Terreno *Obstruído* continua bloqueando o caminho.
- `[tag.important.icon]` **IMPORTANTE:** **PESADO** só afeta os Pontos de Movimento da Ação de **MOVIMENTO**; não afeta o Movimento Livre.
- **Legenda A:** Toda área quadriculada é um espaço. Os espaços ligados por canto ou borda ao espaço da miniatura são *adjacentes*.
- **Legenda B:** Espaços obstruídos por bordas vermelhas bloqueiam a Linha de Visão e não são adjacentes.
- **Legenda C:** Áreas sem grade não são espaços. Não é possível entrar nelas, e elas nunca são consideradas adjacentes.
- **Legenda D:** Espaços com bordas coloridas e Ícones têm Efeitos de Terreno. Consulte *Terrenos*, pág. 21.

Os textos impressos nas artes das cartas **Avian Flight** e **Like the Shadows** permanecem em inglês como imagens da fonte, conforme os overlays `languageInvariant`. Os exemplos vivos próximos às cartas foram traduzidos; as cartas não foram reconstruídas nem cobertas.

## Símbolos e fidelidade visual

A sequência semântica exportada é um `terrain.red-border`, seguido por três `tag.important.icon`. O Viewer e o PDF mostram os quatro símbolos; as sete imagens existentes e os marcadores A–D do diagrama permanecem preservados.

A v1 foi mantida como evidência histórica. Nela, a proibição apareceu como “pode não”, o título do diagrama quebrou sobre o ornamento, as legendas A/B colidiram e o callout PESADO escapou do fundo. Na v2, “não pode” corrige a regra; o título curto **Adjacência** e as legendas reduzidas cabem nas áreas; e o texto de PESADO foi condensado sem mudar a regra.

- [Viewer normal PT-BR, página inteira](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/page-039-pt-BR-movement-rules-viewer-final-v2.png)
- [Viewer/Admin com a proposta no overlay GET-only](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/normal-viewer-p039-pt-BR-snapshot-overlay-v1.png)
- Receipt do Editor read-only: `../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/editor-readonly-receipt-v1.json`
- [Rasterização do PDF realmente exportado](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/page-039-pt-BR-movement-rules-pdf-final-v2.png)
- [Comparação ampliada da fonte EN, Viewer e PDF](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/page-039-movement-rules-lower-source-viewer-pdf-v2.png)
- [PDF isolado da p.39](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/page-039-pt-BR-movement-rules-final-v2.pdf) · SHA-256 `2084BD9B6BE5AA3868E708ED1151D952F29F566D717041ACC0E3EBEE72806A99`
- [Relatório reproduzível de verificação](../../../output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2/verification-movement-rules-v2.json)

O PDF tem uma página de `820.346 × 820.346 pt`. O exportador verificou os 22 registros; uma segunda verificação independente confirmou que o texto de cada registro está no PDF, com zero caracteres de substituição ou de uso privado. A inspeção visual no Viewer e no PDF não mostrou colisão, corte, símbolo duplicado, fantasma nem encobrimento das imagens vizinhas nas áreas desta proposta. Isso valida somente esta composição e não equivale à aprovação editorial.

## Pendências e limites

`Ação de Movimento`, `Movimento Livre`, `Movimento Diagonal`, `PESADO`, `Pontos de Movimento` e o uso de caixa alta/capitalização precisam de revisão terminológica/editorial. As formulações de “espaços adjacentes” nas legendas também ficam abertas à preferência humana. Não alterei o glossário.

O teste focado `page39SourceFields.test.ts` passou (3/3); a suíte serial completa registrada no checkpoint passou com 212 testes, 2 ignorados e zero falhas. O Editor normal foi conferido em overlay GET-only: 22/22 campos bateram com o JSON PT-BR e permaneceram editáveis; os quatro símbolos passaram por remoção, Undo/Redo, reinserção única e Cancel. Payload ficou sem registros p.39 antes/depois e os hashes canônicos não mudaram. Não houve Save; portanto, a reabertura depois de Save continua pendente.

`english_fidelity` da página segue `not_certified`: as provas validam a proposta e as áreas descritas, não a estrutura integral da p.39. Não houve alteração no Payload, nos sidecars canônicos, em tradução humana, no DOM, nos frames, nos overlays, no fundo, no PDF-fonte ou no código do aplicativo. O snapshot impede operações de escrita no API; os arquivos de prova ficam em `output/proofs/`, ignorado pelo Git.
