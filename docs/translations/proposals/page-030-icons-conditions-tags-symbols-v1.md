# p.30 — Proposta PT-BR: ícones, condições, tags e símbolos

**Versão:** 1
**Estado:** proposta editorial não aprovada; não importada no aplicativo
**Fonte:** PDF oficial EN, p.30; DOM local `page_030_dom.json`

## Verificações concluídas

- Comparei o PDF-fonte com o Viewer normal na p.30. Cabeçalho, duas colunas, painel dos quatro símbolos, exemplos inline, callout IMPORTANT e arte de fundo aparecem nas mesmas posições.
- O título da página abriu no Rich Block Editor como `page_30_block_19`, no frame de 615 pt. O DOM-fonte marca o bloco equivalente como `suspectedGhost`, mas o PDF e o Viewer mostram um único título; o `background.webp` deixa o título fora da arte, confirmando que o texto visível vem do bloco editável.
- No PageRenderer em PT, o título proposto `Ícones, Condições, Tags e Símbolos` coube em uma linha, em Cinzel 18 pt, sem duplicação visual. Cancelei o rascunho sem salvar.
- A consulta somente leitura à base ativa não encontrou registros de tradução para `page_30%`.
- O sidecar inline contém um `tag.important.icon`. Os símbolos de Livro e Escudo e o glifo numérico `3` no exemplo aparecem na arte-fonte, não como placements semânticos do sidecar. A proposta mantém esses glifos originais e não adiciona tokens de símbolo sem identidade confirmada.
- Nenhuma tradução foi persistida. Nenhum dado do Payload, sidecar canônico ou tradução humana foi alterado.

## Texto proposto

### Ícones

Ícones aparecem em quase todas as cartas de *Middara*.

Nos Itens, eles indicam os tipos de benefício que você obtém ao equipá-los.

Nas Armas, os Ícones determinam o Alcance e quais Dados de Combate elas usam. Nas Armaduras, indicam o bônus no Valor de Armadura. Nos Núcleos, indicam o bônus no Valor de Defesa.

Nas Cartas de Aventureiro e de Combatente, os Ícones indicam atributos das Miniaturas, como **PV**, Movimento e Defesa.

Nas Cartas de Disciplina, eles indicam quais tipos de Arma precisam estar equipados para que a carta de Habilidade possa ser usada.

Veja a lista de *Ícones*, p. 89.

### Condições

Toda Habilidade tem uma Condição. As Tags de Condição indicam em quais circunstâncias uma Habilidade pode ser usada. Pontos de Vigor e Símbolos exigidos para executar uma Habilidade também são Condições. Todas as Condições e custos precisam ser atendidos antes que uma Habilidade possa ser usada.

Veja *Tags de Condição*, p. 90.

### Tags

Tags são regras especiais resumidas em termos curtos. Elas são sempre listadas em **CAIXA ALTA** (por exemplo, **VOO** e **INCANSÁVEL**).

Tags podem produzir vários efeitos para os Aventureiros. Algumas não têm efeito a menos que outra regra faça referência a elas. Outras têm regras especiais e Habilidades próprias.

As Tags listadas no canto superior direito das Cartas de Item são consideradas **Passivas** e estão sempre em vigor.

Veja *Tags*, p. 92–94.

### Símbolos

Os **4** Símbolos acima são gerados ao rolar os dados personalizados do jogo. Dados diferentes podem gerar Símbolos diferentes, que podem ser gastos para usar Habilidades. A menos que outra regra diga o contrário, não há limite para o número de vezes que Habilidades que exigem Símbolos como Condição podem ser usadas, desde que você tenha Símbolos para gastar.

Algumas Habilidades que exigem Símbolos como Condição podem ter vários Símbolos impressos. ⟦PRESERVAR AQUI OS GLIFOS ORIGINAIS DE LIVRO E ESCUDO; NÃO DIGITAR ESTA NOTA⟧ Nesses casos, usar a Habilidade uma vez custa **1** Livro e **1** Escudo. Em outros casos, pode haver Símbolos demais para caber na carta; por isso, eles são representados por números. Por exemplo, ⟦PRESERVAR AQUI O GLIFO NUMÉRICO ORIGINAL “3”; NÃO DIGITAR ESTA NOTA⟧ significa que um Aventureiro deve gastar **3** Livros para usar essa Habilidade.

[[symbol:tag.important.icon]] **IMPORTANTE:** Normalmente, os Símbolos só podem ser gastos durante uma Ação de Ataque, embora algumas Habilidades permitam gastar Símbolos durante rolagens que não sejam de Ataque.

## Decisões terminológicas pendentes

1. Confirmar os termos de regra sem entrada oficial específica: `Icon → Ícone`, `Ability → Habilidade`, `Condition → Condição`, `Condition Tag → Tag de Condição`, `Tag → Tag`, `Combat Dice → Dados de Combate`, `Range → Alcance`, `Armor Value → Valor de Armadura` e `Defense Value → Valor de Defesa`.
2. Confirmar `Stamina Points → Pontos de Vigor` e `HP → PV`.
3. `RELENTLESS → INCANSÁVEL` segue o glossário oficial. Confirmar `FLIGHT → VOO` e `Passive → Passiva` como nomes de Tag.
4. Confirmar `Book → Livro` e `Shield → Escudo` como nomes PT-BR dos dois símbolos no exemplo. O símbolo de Escudo possui rótulo mais longo no catálogo de acessibilidade (`Escudo de defesa`), mas a arte mostra o glifo e o texto-fonte chama o custo de `Shield`.
5. O bloco de exemplo não tem placements semânticos para os dois glifos nem para o marcador `3`. Antes de salvar, garantir que o fluxo de texto preserve os três elementos da arte-fonte no ponto correto, sem duplicá-los ou convertê-los em texto digitado.

O formato deve conservar a ênfase da fonte em *Middara*, referências, valores numéricos e Tags; o callout mantém o ícone semântico, o rótulo vermelho/contornado e a ênfase de “only” em “só”. A proposta em Markdown ainda não corresponde a uma composição rica salva no Editor.

## Estado de copyfit e liberação

- **Copyfit no PageRenderer em PT-BR:** parcial. O título passou em preview individual; os parágrafos, headings, exemplos e callout precisam de preview em conjunto.
- **Símbolos inline no exemplo:** pendente de placement semântico/reflow verificado.
- **Exportação PDF em PT-BR:** pendente.
- **Aprovação humana:** pendente para os termos listados e para a redação completa.
- **Próximo passo seguro:** resolver os nomes de termos e a composição inline do exemplo; depois conferir a página inteira em PT no Viewer e exportar somente a p.30 antes de encaminhar a revisão humana.
