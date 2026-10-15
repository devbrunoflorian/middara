# p.38 — Gastar Pontos de Vigor — proposta PT-BR v1

- **Status:** proposta renderizada e revisada visualmente no escopo abaixo; aguarda revisão humana editorial e terminológica. Não é tradução aprovada.
- **Fonte:** PDF EN oficial, p.38/102; SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- **Unidades:** título `block_42` e parágrafo `block_24`; a callout IMPORTANT ao lado permanece em inglês e fora desta proposta.
- **Persistência:** snapshot somente em `output/proofs`; nenhuma gravação no Payload, nos sidecars canônicos, no PDF-fonte ou em traduções humanas.

## Proposta

| Chave | Inglês da fonte | Proposta PT-BR |
|---|---|---|
| `page_38_block_9__pt-BR` | During the Action Phase, an Adventurer may spend any or all of their SP to use any of their available Abilities or Actions, in any order, and as many times as they have SP for. Some Abilities and Actions have limits on how many times they can be used depending on how they activate. Unless an Action or Ability specifically says that it can’t be used more than once per turn, an Adventurer may use that Action or Ability as many times as they have SP to do so. | Durante a Fase de Ação, um Aventureiro pode gastar qualquer quantidade de **SP** para usar suas Habilidades ou Ações disponíveis, em qualquer ordem, quantas vezes puder pagar com **SP**. Algumas Habilidades e Ações têm limites de uso conforme sua forma de ativação. A menos que uma Ação ou Habilidade especifique que não pode ser usada mais de uma vez por turno, o Aventureiro pode usá-la quantas vezes tiver **SP** suficiente para isso. |
| `page_38_block_24__pt-BR` | Spending Stamina Points | Gastar Pontos de Vigor |

O título conserva Cinzel 18 pt. O corpo conserva Optima 10 pt; os três `SP` continuam em Optima Bold 9 pt, conforme a fonte.

## Terminologia e fidelidade

- `Action Phase → Fase de Ação` coincide com a proposta p.37, ainda pendente de aprovação humana. `Stamina Point → Ponto de Vigor` segue a escolha local registrada na proposta p.35; não é uma entrada do glossário oficial.
- `SP` permanece sem expansão no corpo, conforme a sigla da fonte. “Habilidades”, “Ações”, “Aventureiro” e as demais escolhas locais aguardam revisão humana conforme o processo de tradução.
- O texto mantém a condição de pagar o custo de SP para repetir uma Ação ou Habilidade, e a exceção de uso máximo uma vez por turno quando a própria regra assim especifica. Não houve ajuste de frame ou geometria.

## Prova de composição

- Snapshot e capturas: [`p038-allies-opponents-v1`](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/).
- [Viewer PT-BR isolado](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-viewer-stamina-v2.png) · [PDF isolado](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-proposal-stamina-v2.pdf) · [render direto do PDF](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/page-038-pt-BR-poppler-stamina-v2.png) · [fonte EN](../../../output/proofs/translation-readiness-2026-10-15/p038-allies-opponents-v1/source-pdf-page-038.png).
- A prova reuniu as seis unidades inferiores já propostas e estas duas unidades novas; o exportador confirmou os oito overrides do snapshot. O PDF tem uma página e MediaBox `820.346 × 820.346 pt`. Título e parágrafo cabem nos frames de origem sem alterações de geometria; o parágrafo medido ocupa 60.01 pt dentro de um frame de 77.89 pt. Viewer e render Poppler foram comparados visualmente à fonte EN; callout, tabelas e ilustrações vizinhas permanecem preservadas.
- SHA-256 do PDF: `B7BF177281D3296DC810895EF450EBF70A3589FE6016DD7BF37C89C44E43C930`; snapshot: `83215F91B20EBE6692FBF29A933E2E75750F4F6BAEB18D101017839ED6CE03BF`; Viewer: `A829F5ED1B9846227D1A25BDB3CA813E16C7A0C8AE62C8F991B98BDD6D9E32A9`; render Poppler: `A61D8019FAD709EB0B7DEC6A2428E8207E8D515EEDAB3723A6EA6E56A3B12713`.

## Limites

Esta prova cobre apenas o título e o parágrafo superior esquerdo além das seis unidades inferiores da proposta de Aliados e Oponentes. A callout IMPORTANT, as tabelas e o restante da página continuam em inglês. A suíte completa de testes do aplicativo não foi executada; a verificação realizada foi a composição no PageRenderer e o PDF isolado.
