# p.38 — Ações Padrão (proposta isolada)

**Registro histórico:** este rascunho v1/v2 foi substituído pela revisão v3 e pelas correções aprovadas em 2026-11-13. A decisão atual do glossário `Empower → Fortalecer`, o copyfit das unidades de Aliados/Oponentes e a fidelidade local de fonte/símbolos estão documentados em `page-038-standard-actions-and-abilities-review-2026-10-16-v3.json` e no status da página. Preserve este arquivo como histórico da proposta inicial.

## Fonte e identidade

- PDF oficial EN: `C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`
- SHA-256 do PDF: `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`
- DOM de p.38: `apps/web/public/pages/page_038/page_038_dom.json`
- SHA-256 do DOM: `06E77BDA52695F7BAFF99FB769D4728368FC37C3E949EB30278AB040BE94BEE8`
- Prova final: `output/proofs/translation-readiness-2026-10-15/p038-standard-actions-v2/`
- Snapshot final: `snapshot/snapshot-standard-actions-final.json` (22 registros: 8 da prova-base + 14 desta proposta)

## Texto proposto

**Título:** Ações e Habilidades Padrão

**Introdução:** Uma Ação ou Habilidade Padrão é uma Ação ou Habilidade sempre disponível para uso pelos Aventureiros. A seguir, estão listadas as Ações e Habilidades Padrão de *Middara*.

**Tabela 1:** AÇÕES PADRÃO

| Ação | Custo | Descrição |
| --- | --- | --- |
| Mover | 1 SP (marcador da fonte) | Mova-se até seu Valor de Movimento máximo. Para cada **SP** adicional gasto, some **2** ao seu Valor de Movimento. **IMPORTANTE:** Aventureiros só podem realizar **1** Ação de Movimento por turno. |
| Ataque | 2 SP (marcador da fonte) | Faça um Ataque usando os Dados de Combate das Armas equipadas. |
| Ação de Encontro | 1 SP (marcador da fonte) | Ações de Encontro são Ações específicas de cada Encontro que um Aventureiro pode realizar. Isso também inclui ativar Fichas de *Saque*. |
| Reequipar | 1 SP (marcador da fonte) | Equipe ou desequipe Itens da Mochila ou do seu Aventureiro. Itens na Mochila ficam Virados ou Exaustos até poderem ser desvirados ou perder a Exaustão normalmente. Você pode pegar Itens e Companheiros de um Aventureiro adjacente, mas nunca dá-los a outros Aventureiros. Por **1 SP**, qualquer quantidade dessas ações é permitida. |

O custo e os marcadores vermelhos da tabela são arte/elementos da fonte; não foram convertidos em texto de tradução. No cabeçalho, **“SP COST” permanece em inglês**: a proposta “CUSTO DE SP” não coube no frame fixo sem quebrar em duas linhas e foi removida da renderização final. A tradução do título da Tabela 2 também ficou fora desta unidade; a tabela de Habilidades permanece em inglês.

## IDs usados na renderização final

- `page_38_block_25__pt-BR` — título da seção.
- `page_38_block_22__pt-BR` — introdução.
- `page_38_block_11__pt-BR` — título da Tabela 1.
- `page_38_unit_p38-block-10-action-header__pt-BR` e `page_38_unit_p38-block-10-description-header__pt-BR` — cabeçalhos AÇÃO e DESCRIÇÃO.
- `page_38_block_1__pt-BR`, `page_38_block_3__pt-BR`, `page_38_block_5__pt-BR`, `page_38_block_7__pt-BR` — Mover, Ataque, Ação de Encontro e Reequipar.
- `page_38_unit_p38-block-13-move-description__pt-BR` e `page_38_unit_p38-block-13-move-important__pt-BR` — descrição e aviso de Movimento.
- `page_38_unit_p38-block-16-description__pt-BR` — descrição de Ataque.
- `page_38_block_6__pt-BR` — descrição de Ação de Encontro.
- `page_38_block_8__pt-BR` — descrição de Reequipar.

## Copyfit e fidelidade visual

O candidato v1 de Reequipar excedeu o frame em `10.09 pt` e invadiu o título seguinte. Na versão v2, o texto completo foi condensado sem retirar ações, restrições ou custo; o frame ficou em três linhas e o limite inferior do conteúdo terminou `0.91 pt` antes do limite do frame. A captura do Viewer e a rasterização do PDF isolado mostram o texto dentro da linha da tabela, sem cobrir o título seguinte.

O candidato v2 “CUSTO DE SP” quebrou em duas linhas e ultrapassou o limite vertical do cabeçalho em `6.47 pt`. Conforme o fluxo de fallback após as duas versões permitidas, o snapshot final exclui somente esse override e mantém a fonte “SP COST”. A prova final tem 22 registros efetivamente verificados pelo PageRenderer; o PDF final é de uma página, mede `820.346 × 820.346 pt` e contém as traduções selecionadas e o cabeçalho EN de fallback.

Capturas finais legíveis:

- Viewer: `output/proofs/translation-readiness-2026-10-15/p038-standard-actions-v2/page-038-pt-BR-standard-actions-viewer-table-final.png`
- PDF isolado: `output/proofs/translation-readiness-2026-10-15/p038-standard-actions-v2/page-038-pt-BR-standard-actions-pdf-table-final.png`
- SHA-256 do PDF final: `457540D90C88A5BF5F4F131A115792F3A34FA5E660B15DAEA72D7663874B44C0`

## Terminologia e aprovação

“Ação Padrão”, “Habilidade Padrão”, “Valor de Movimento”, “Dados de Combate”, “Mochila”, “Virado”, “Exausto”, “Reequipar” e “Ação de Movimento” são escolhas locais ainda sem aprovação humana no glossário. “Saque”, “Ficha”, “Aventureiro” seguem as entradas existentes do glossário; “Saque” mantém itálico. A formatação 9 pt de **SP**/**2**, o **1** de IMPORTANT, o nome *Middara* e o ícone semântico `tag.important.icon` foram preservados na composição isolada.

O Viewer e o PDF foram renderizados com snapshot isolado, sem persistir a proposta. Isso não equivale a teste de edição/salvamento no Rich Block Editor, aprovação linguística, terminológica ou autorização para ativação canônica. Essas etapas continuam pendentes. Nenhuma geometria, fonte, arte, Payload, tradução aprovada ou sidecar canônico foi alterado nesta prova.
