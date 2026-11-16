# p.23 — proposta PT-BR “Detalhamento da Peça” v3

**Estado atual:** 17 unidades rastreadas; 16 aprovadas e publicadas pelo Reviewer oficial, e uma pendente (review 1376). O alvo `NÚMERO DA PEÇA` permanece pending porque a identidade selecionada pelo PageRenderer expôs 0 dos 239 caracteres esperados, sem prova EXACT registrável. `ELEVATION 2/1` está incorporado ao diagrama e permanece preservado como exceção de arte. O diagnóstico estático v3 é histórico; as medições posteriores estão nos recibos por unidade e no Payload.

## Validação técnica

- **Viewer PT-BR:** 17/17 candidatos visíveis; medições a 200% e captura completa em zoom de página.
- **Editor Admin read-only:** 17/17 alvos selecionados; o texto conferiu com a proposta, e todos os diálogos foram cancelados sem salvar.
- **PDF PT-BR:** uma página, MediaBox 820,346 × 820,346 pt, 965 caracteres selecionáveis, zero caracteres de substituição e zero caracteres de uso privado. Os 17 alvos aparecem uma vez cada; nenhuma linha excede a largura do campo.
- **Fonte EN:** Viewer e PDF foram comparados com o raster do PDF oficial; os 39 segmentos de geometria-fonte, o fundo e a arte aparecem.
- **Persistência:** cinco unidades receberam novas aprovações oficiais no lote inicial (reviews 1371–1375 → translations 801–805); a review 629 foi publicada depois como translation 1245. A página tem 16 unidades aprovadas e uma pendente (review 1376).
- Raster do PDF exportado: [p.23 PT-BR, 2x](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-pt-BR-v3-raster.png).\n- Recibos: [Viewer/Editor](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-editor-receipt-v3.json), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-export-receipt-v3.json), [métricas](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-metrics-v3.json).


## Integração das legendas e situação atual do Payload (2026-10-25)

- A raster da fonte e o PDF confirmam que NORMAL, HINDERING, DANGEROUS, SPECIAL, WATER, MUCK e OBSTRUCTING são texto selecionável colocado sobre arte fixa. A imagem de fundo do app contém faixas, ícones e bordas, sem os rótulos impressos; portanto, as novas unidades tipográficas não apagam nem duplicam esses elementos. O catálogo semântico foi consultado; não foram adicionados IDs ou símbolos inline. ELEVATION 2/1 continua parte da ilustração.
- O PageDOM agora inclui sete unidades tipográficas locais nos blocos 18–21 usando as chaves já presentes nesta proposta. Copyfit atual: seis traduções de rótulo EXACT 1/1 e três unidades de prosa EXACT 2/2, ambas a 100% e 200%.
- Read-back atualizado: 16/17 unidades da página estão aprovadas; review 629 → translation 1245 foi publicada após EXACT 2/2 em 100% e 200%. A hipótese global Range → Alcance segue sem decisão; esta ocorrência foi confirmada localmente por precedentes aprovados. Review 1376 permanece pending por falha de identidade do medidor, sem EXACT registrável (0/239 caracteres no destaque em 100% e 200%). O parágrafo sobre Terrain foi alinhado ao glossário (`Terrenos` no nome geral e `Terreno` no contexto dos espaços), medido EXACT 4/4 a 100% e 200% e aprovado no review 1375. A exportação estática v3 permanece evidência histórica; nenhuma nova exportação foi gerada neste lote. A página não está certificada.

## Unidades propostas

### block_24

**EN:** Tile Breakdown

**PT-BR:** Detalhamento da Peça

**Termos pendentes:** Tile Breakdown → Detalhamento da Peça: título proposto, sujeito à revisão editorial humana.

### block_9 / p23-block-9-first-size-9pt

**EN:** TILE

**PT-BR:** PEÇA

**Termos pendentes:** Nenhum termo de glossário pendente identificado.

### block_9 / p23-block-9-remaining-size-10pt

**EN:** A Tile is a single large board piece that is combined with other Tiles to create the game board for an Encounter.

**PT-BR:** Uma Peça é um componente grande e individual do tabuleiro, que se combina a outras Peças para formar o tabuleiro de um Encontro.

**Termos pendentes:** Nenhum termo de glossário pendente identificado.

### block_10 / p23-block-10-first-size-9pt

**EN:** SPACES

**PT-BR:** ESPAÇOS

**Termos pendentes:** Nenhum termo de glossário pendente identificado.

### block_10 / p23-block-10-remaining-size-10pt

**EN:** Each square on the Tile makes up a space. Spaces are used for movement, Range and determining area effects.

**PT-BR:** Cada quadrado da Peça é um espaço. Os espaços são usados para movimento, Alcance e para determinar efeitos de área.

**Estado:** review 629 → translation 1245, aprovada pelo Reviewer oficial; EXACT 2/2 em 100% e 200%. A ocorrência local `Alcance` é sustentada pelas reviews aprovadas 980, 981, 1241 e 740. A hipótese global `Range → Alcance` não foi alterada.

### block_11 / p23-block-11-first-size-9pt

**EN:** EDGE

**PT-BR:** BORDA

**Termos pendentes:** Nenhum termo de glossário pendente identificado.

### block_11 / p23-block-11-remaining-size-10pt

**EN:** Unless connected to another Tile, the edge of each Tile blocks Line of Sight and is impassable.

**PT-BR:** A borda de cada Peça bloqueia a Linha de Visão e impede a passagem, salvo se estiver conectada a outra Peça.

**Termos pendentes:** Line of Sight → Linha de Visão é uma proposta contextual ainda pendente de decisão humana.

### block_12 / p23-block-12-first-size-9pt

**EN:** TERRAIN

**PT-BR:** TERRENO

**Estado:** review 1374 → translation 804, aprovado pelo Reviewer oficial; EXACT 1/1 em 100% e 200%.

### block_12 / p23-block-12-remaining-size-10pt

**EN:** Some spaces have special area effects called Terrain (see Terrain types Pg. 21). Spaces that contain Terrain have a colored hatched border surrounding the square as well as a small symbol on the space representing the type of Terrain.

**PT-BR:** Alguns espaços têm efeitos de área especiais chamados Terrenos (veja “Tipos de Terreno”, p. 21). Os espaços com Terreno exibem uma borda colorida e hachurada ao redor do quadrado e um pequeno símbolo que indica o tipo de Terreno.

**Estado:** review 1375 → translation 805, aprovado pelo Reviewer oficial. `Terrenos` segue o glossário para o nome geral; `Terreno` permanece no composto e no contexto de cada espaço. EXACT 4/4 em 100% e 200%.

### block_13 / p23-block-13-combined-tile-number

**EN:** TILE NUMBER Each Tile is identified by two letters followed by a number to indicate which game or expansion it is from, as well as to assist in setting up Encounters. For example, Tile UM1, for Unintentional Malum, Tile 1.

**PT-BR:** NÚMERO DA PEÇA
Cada Peça é identificada por um código de duas letras seguido de um número, que indica o jogo ou a expansão de origem e ajuda na preparação dos Encontros. Por exemplo, o código UM1 identifica a Peça 1 de Unintentional Malum.

**Estado:** review 1376 permanece pending. `Unintentional Malum` é preservado como nome próprio conforme precedentes aprovados; a pendência atual é técnica: o PageRenderer selecionado expôs 0 dos 239 caracteres da proposta, sem medição EXACT atual. Nenhuma edição de texto foi feita.

### block_18 / p23-block_18-legend-1

**EN:** NORMAL

**PT-BR:** NORMAL

**Termos pendentes:** Nenhum termo de glossário pendente identificado.

### block_18 / p23-block_18-legend-2

**EN:** HINDERING

**PT-BR:** DIFÍCIL

**Termos pendentes:** Hindering Terrain → Terreno Difícil segue o glossário; “Difícil” é uma forma abreviada proposta para o rótulo da legenda.

### block_19 / p23-block_19-legend-1

**EN:** DANGEROUS

**PT-BR:** PERIGOSO

**Termos pendentes:** Dangerous como rótulo abreviado: candidato sujeito à revisão humana.

### block_19 / p23-block_19-legend-2

**EN:** SPECIAL

**PT-BR:** ESPECIAL

**Termos pendentes:** Special como rótulo abreviado: candidato sujeito à revisão humana.

### block_20 / p23-block_20-legend-1

**EN:** WATER

**PT-BR:** ÁGUA

**Termos pendentes:** Water Terrain → Terreno de Água segue o glossário; “Água” é uma forma abreviada proposta para o rótulo.

### block_20 / p23-block_20-legend-2

**EN:** MUCK

**PT-BR:** LODO

**Termos pendentes:** Muck Terrain → Terreno de Lodo segue o glossário; “Lodo” é uma forma abreviada proposta para o rótulo.

### block_21 / p23-block_21-legend-1

**EN:** OBSTRUCTING

**PT-BR:** OBSTRUÍDO

**Termos pendentes:** Obstructing Terrain → Terreno Obstruído segue o glossário; “Obstruído” é uma forma abreviada proposta para o rótulo.

## Exceção de texto na arte

- **ELEVATION 2 / ELEVATION 1 → ELEVAÇÃO 2 / ELEVAÇÃO 1:** texto incorporado à imagem do diagrama; a imagem-fonte foi preservada e a substituição permanece aberta.
- **UM1**, marcadores A–E e o folio 23 permanecem invariantes.
- Chaves legadas de bloco e IDs canônicos não foram alterados. As unidades de legenda e a recomposição do block_13 são exclusivas do snapshot e documentam a estrutura proposta para revisão.

## Evidência

- PDF oficial: Rulebook 1p2 Final Version 05-19-23 Optimized.pdf; SHA-256: a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351.
- Raster da fonte: output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png.
- Snapshot e hashes: output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/snapshot/snapshot.json e output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/source-hashes-v3.json.
- Registros PT-BR encontrados: 0; Payload writes: 0.


## Atualização do Payload — review 629 (2026-10-26 06:49 UTC)

- Review 629 foi aprovada pela rota oficial e confirmada no readback como translation 1245. PageRenderer EXACT 2/2 em 100% e 200%; texto e rich spans preservados.
- A decisão terminológica é local à unidade. Usos aprovados nas reviews 980, 981, 1241 e 740 sustentam `Alcance`; o glossário global não foi alterado.
- Estado da página: 16/17 aprovadas; review 1376 é a única pendente. Copyfit não registrável: a identidade selecionada mostrou 0/239 caracteres em 100% e 200%.
- Estado lido do Payload: 1.236 traduções; 1.556 reviews; 907 aprovadas, 638 pending ativas e 11 arquivadas. A página permanece parcial por review 1376 e pelo texto de arte incorporado `ELEVATION 2/1`.
