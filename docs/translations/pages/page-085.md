# Página 085 — Abraxis Battle Dice

- **Estado:** piloto de fluxo; rascunho editorial, não importado no database.
- **Fonte:** PDF oficial, página física 85; conferidos o render integral e a ordem das duas colunas.
- **Estrutura:** título central; prosa inicial e etapa 1 na coluna esquerda; continuação da etapa 2 e etapa 3 na direita; painel ilustrado com legenda A/B/C.
- **Símbolos inline:** o texto requer oito cores: `{{symbol:dice.white}}`, `{{symbol:dice.purple}}`, `{{symbol:dice.teal}}`, `{{symbol:dice.orange}}`, `{{symbol:dice.green}}`, `{{symbol:dice.red}}`, `{{symbol:dice.blue}}` e `{{symbol:dice.grey}}`. O sidecar atual mapeia somente seis placements; os dados branco e laranja visíveis no PDF estão sem placement semântico e bloqueiam a prévia integrada até a reconciliação.
- **Diagrama/arte:** a imagem da Carta de Abraxis, incluindo nome `Pirate Wench`, texto de regra dentro da carta e símbolos impressos nela, permanece como arte. Os marcadores A/B/C permanecem letras. A legenda explicativa separada no painel é texto editável e está traduzida abaixo.
- **Termos provisórios:** `Abraxis Battle Dice`, `Damage token`, `SP token`, `Fate token`, `Abraxis Point` e `Lock In` não constam do glossário aprovado. As opções em PT são propostas para revisão, não decisões globais.
- **Geometria fonte:** no PDF, as origens/baselines do block 10 estão presentes; em `page_085_dom.json`, `origin` aparece nulo. O efeito visual ainda não foi medido no viewer; consultar a pendência de geometria antes do preview PT.
- **Copyfit:** página densa em duas colunas; a legenda ocupa painel estreito. Alertas de expansão pedem preview de verdade e não autorizam corte ou redução automática de fonte.

## Título

## Abraxis Battle Dice
**PT-BR (rascunho, título):** Dados de Batalha de Abraxis

## Abertura

**EN:** Abraxis Battle Dice is a mini-game that players can take part in during the Adventure Mode. It uses Abraxis cards, the custom dice, *Damage* tokens, and **SP** tokens.

**PT-BR (rascunho):** Abraxis Battle Dice é um minijogo do qual os jogadores podem participar durante o Modo Aventura. Ele usa cartas de Abraxis, os dados personalizados, fichas de *Dano* e fichas de **SP**.

**EN:** Each Adventurer gets **4** dice: Give one Adventurer **2** **WHITE** {{symbol:dice.white}} and **2** **PURPLE** {{symbol:dice.purple}} dice. Another gets **2** **TEAL** {{symbol:dice.teal}} and **2** **ORANGE** {{symbol:dice.orange}} dice. Another gets **2** **GREEN** {{symbol:dice.green}} and **2** **RED** {{symbol:dice.red}} dice. And the last gets **2 BLUE** {{symbol:dice.blue}} and **2 GREY** {{symbol:dice.grey}} dice. Each player also starts with **10** Abraxis Points and **5** *Fate* tokens. These may be tracked with *Damage* tokens and **SP** tokens respectively.

**PT-BR (rascunho):** Cada Aventureiro recebe **4** dados: dê a um Aventureiro **2** **DADOS BRANCOS** {{symbol:dice.white}} e **2** **DADOS ROXOS** {{symbol:dice.purple}}. Outro recebe **2** **DADOS TURQUESA** {{symbol:dice.teal}} e **2** **DADOS LARANJAS** {{symbol:dice.orange}}. Um terceiro recebe **2** **DADOS VERDES** {{symbol:dice.green}} e **2** **DADOS VERMELHOS** {{symbol:dice.red}}. O último recebe **2 DADOS AZUIS** {{symbol:dice.blue}} e **2 DADOS CINZAS** {{symbol:dice.grey}}. Cada jogador também começa com **10** Pontos de Abraxis e **5** fichas de *Destino*. Esses valores podem ser registrados com fichas de *Dano* e fichas de **SP**, respectivamente.

**EN:** The game takes place through a series of **5** _Rounds_. The goal of each Round is for Adventurers to roll their dice and have the Symbols on all **4** of their dice match the Symbols printed on the bottom of the Abraxis card they are facing as closely as possible.

**PT-BR (rascunho):** O jogo acontece ao longo de **5** _Rodadas_. Em cada Rodada, o objetivo é que os Aventureiros rolem seus dados e façam os Símbolos dos **4** dados corresponderem o mais precisamente possível aos Símbolos impressos na parte inferior da carta de Abraxis que estão enfrentando.

**EN:** At the end of each Round, if an Adventurer fails to match the Symbols on the Abraxis card, they lose Abraxis Points. When an Adventurer loses all their Abraxis Points, they are out of the game.

**PT-BR (rascunho):** Ao fim de cada Rodada, se um Aventureiro não conseguir combinar os Símbolos com os da carta de Abraxis, perderá Pontos de Abraxis. Quando perder todos os seus Pontos de Abraxis, estará fora do jogo.

**EN:** If Adventurers can match their Symbols well enough to survive these **5** _Rounds_, they'll be rewarded. Rewards earned via Abraxis Battle Dice are cumulative. Meaning, that if all **4** Adventurers survive, they would gain the rewards listed for all four tiers. (**1** Adventurer, **2** Adventurer, etc.)

**PT-BR (rascunho):** Se os Aventureiros combinarem seus Símbolos o suficiente para sobreviver às **5** _Rodadas_, receberão recompensas. As recompensas obtidas em Abraxis Battle Dice são cumulativas. Ou seja, se os **4** Aventureiros sobreviverem, receberão as recompensas indicadas para as quatro faixas (**1** Aventureiro, **2** Aventureiros etc.).

**EN (rubrica, 10 pt):** **1. ROLL FOR SYMBOLS:**
**PT-BR (rascunho, rubrica):** **1. ROLE OS SÍMBOLOS:**

**EN:** Each Round, Adventurers will simultaneously roll all **4** of their dice and must ***Lock In*** the result of **1** die.

**PT-BR (rascunho):** A cada Rodada, os Aventureiros rolam simultaneamente os **4** dados e devem ***Fixar*** o resultado de **1** dado.

**EN:** When dice are ***Locked In***, this means that the Adventurer is satisfied with the result of that die and has set it aside to be tallied against the Abraxis card's Symbols at the end of the Round. All dice that are ***Locked In*** will not be rolled again.

**PT-BR (rascunho):** Ao ***Fixar*** um dado, o Aventureiro aceita aquele resultado e o deixa separado para compará-lo aos Símbolos da carta de Abraxis no fim da Rodada. Dados ***Fixados*** não serão rolados novamente.

**EN:** If an Adventurer would like to ***Lock In*** the result of more than **1** die, they may spend **1** of their **5** *Fate* tokens. For each *Fate* token they spend, they may ***Lock In*** an _extra_ die.

**PT-BR (rascunho):** Se quiser ***Fixar*** o resultado de mais de **1** dado, o Aventureiro pode gastar **1** de suas **5** fichas de *Destino*. Para cada ficha de *Destino* gasta, poderá ***Fixar*** o resultado de um dado _extra_.

**EN:** If an Adventurer does not want to ***Lock In*** any of the dice they rolled, they may spend **1** *Fate* token to skip ***Locking In*** any of their dice.

**PT-BR (rascunho):** Se não quiser ***Fixar*** nenhum dos dados rolados, o Aventureiro pode gastar **1** ficha de *Destino* para não ***Fixar*** dado algum.

**EN:** Once all Adventurers have decided which dice to ***Lock In***, or after they've decided to not ***Lock In*** any by spending **1** of their **5** *Fate* tokens, they will then simultaneously roll all of their remaining (***non-Locked In***) dice.

**PT-BR (rascunho):** Depois que todos decidirem quais dados ***Fixar*** — ou decidirem não ***Fixar*** nenhum e gastarem **1** de suas **5** fichas de *Destino* —, rolarão simultaneamente todos os dados restantes (***ainda não Fixados***).

**EN:** After rolling a second time, Adventurers will again decide which **single** die they would like to ***Lock In***. *Fate* tokens may be spent the same way as before, to either ***Lock In*** more than **1** die, or not ***Lock In*** any.

**PT-BR (rascunho):** Depois da segunda rolagem, os Aventureiros decidem novamente qual dado **único** querem ***Fixar***. As fichas de *Destino* podem ser gastas como antes, para ***Fixar*** mais de **1** dado ou para não ***Fixar*** nenhum.

**EN:** Once again, after all Adventurers have decided which dice they are ***Locking In***, they will simultaneously roll their remaining dice.

**PT-BR (rascunho):** Mais uma vez, depois que todos decidirem quais dados ***Fixar***, rolarão simultaneamente os dados restantes.

**EN:** This process continues until at least **1** Adventurer has ***Locked In*** all **4** of their dice. Without spending any *Fate* Tokens, this will naturally happen at the end of the fourth simultaneous roll. If an Adventurer spent *Fate* Tokens to ***Lock In*** more than **1** Die, it could happen sooner.

**PT-BR (rascunho):** O processo continua até que pelo menos **1** Aventureiro tenha ***Fixado*** os **4** dados. Sem gastar fichas de *Destino*, isso acontecerá naturalmente ao fim da quarta rolagem simultânea. Se um Aventureiro gastar fichas de *Destino* para ***Fixar*** mais de **1** dado, isso pode acontecer antes.

**EN:** At the end of a simultaneous roll, after all players have chosen which dice to ***Locked In*** and spent *Fate* tokens, if at least **1** Adventurer has ***Locked In*** all **4** of their dice, all other Adventurers with any **non-Locked In** remaining dice _must_ make **1** more roll and _must_ ***Lock In*** all dice from this final roll. No *Fate* tokens may be spent on this final roll.

**PT-BR (rascunho):** Ao fim de uma rolagem simultânea, depois que todos escolherem quais dados ***Fixar*** e gastarem fichas de *Destino*, se pelo menos **1** Aventureiro tiver ***Fixado*** os **4** dados, todos os demais Aventureiros que ainda tiverem dados **não Fixados** _devem_ fazer **1** rolagem adicional e _devem_ ***Fixar*** todos os dados dessa rolagem final. Não é permitido gastar fichas de *Destino* nessa rolagem final.

**EN (rubrica, 10 pt):** **2. COMPARE SYMBOLS:**
**PT-BR (rascunho, rubrica):** **2. COMPARE OS SÍMBOLOS:**

**EN:** Now that all Adventurers have ***Locked In*** all **4** dice, they will each compare the Symbols on the dice they've ***Locked In*** to the Symbols printed on the bottom of the Abraxis card.

**PT-BR (rascunho):** Agora que todos os Aventureiros ***Fixaram*** os **4** dados, cada um compara os Símbolos dos dados ***Fixados*** com os Símbolos impressos na parte inferior da carta de Abraxis.

**EN:** For each **extra** or **missing** Symbol on an Adventurer's ***Locked In*** dice, they lose **1** Abraxis Point. Through the course of these **5** Rounds, if an Adventurer loses all of their Abraxis Points, they are out of the game.

**PT-BR (rascunho):** Para cada Símbolo **extra** ou **ausente** nos dados ***Fixados*** de um Aventureiro, ele perde **1** Ponto de Abraxis. Ao longo dessas **5** Rodadas, se perder todos os Pontos de Abraxis, estará fora do jogo.

**EN:** If an Adventurer matches the Abraxis card's Symbols exactly, they Gain **1** Abraxis Point.

**PT-BR (rascunho):** Se um Aventureiro combinar exatamente os Símbolos da carta de Abraxis, recebe **1** Ponto de Abraxis.

**EN (rubrica, 10 pt):** **3. END OF ROUND:**
**PT-BR (rascunho, rubrica):** **3. FIM DA RODADA:**

**EN:** After losing or gaining Abraxis Points, the Round ends. The game continues for a total of **5** Rounds. After the end of the fifth Round, rewards will be Gained based on how many Adventurers are still in the game after all **5** Rounds. These rewards are detailed in the Adventure Book on the page with the corresponding Abraxis Card Encounter.

**PT-BR (rascunho):** Depois da perda ou do ganho de Pontos de Abraxis, a Rodada termina. O jogo dura **5** Rodadas. Ao fim da quinta Rodada, os Aventureiros recebem recompensas de acordo com quantos ainda estiverem no jogo. Essas recompensas estão detalhadas no Livro de Aventura, na página do Encontro da Carta de Abraxis correspondente.

## Painel do diagrama — Abraxis Card

### Abraxis Card
**PT-BR (título):** Carta de Abraxis

**A — NAME**

**EN:** The name of the Abraxis Card.

**PT-BR (rascunho):** O nome da Carta de Abraxis.

**B — SPECIAL RULES**

**EN:** Any Special Rules that augment the Abraxis Rules are found here.

**PT-BR (rascunho):** As Regras Especiais que modificam as Regras de Abraxis aparecem aqui.

**C — ABRAXIS CARD SYMBOLS**

**EN:** Each Abraxis Card has a list of Symbols. Players try to match these Symbols when using this card.

**PT-BR (rascunho):** Cada Carta de Abraxis tem uma lista de Símbolos. Ao usar essa carta, os jogadores tentam combinar esses Símbolos.

## Termos, exceções e copyfit

- **Glossário oficial aplicado:** `Adventurer → Aventureiro(s)` e, quando a expressão coincide com o termo oficial, `Adventure Mode → Modo Aventura` não existe no glossário; a versão atual é candidata. Não há outros termos deste piloto governados diretamente pelo glossário.
- **Fila de decisão:** `Abraxis Battle Dice`, `Damage token`, `SP token`, `Fate token`, `Abraxis Point`, `Lock In/Locked In`, `Abraxis card`, `Adventure Book` e uso de maiúsculas em `Symbols` precisam de revisão terminológica antes da publicação.
- **Anomalia de fonte:** o exemplo inglês termina com “(1 Adventurer, 2 Adventurer, etc.)”; o PT corrige apenas a concordância gramatical do exemplo para “Aventureiros”. Conferir se os quatro tiers são mesmo definidos por número de participantes antes de aprovar.
- **DTP:** preservar os três passos numerados e os tokens de cor junto aos respectivos dados. Comparar o bloco de distribuição e o painel de legenda com a moldura real; não remover instruções nem reduzir a hierarquia tipográfica para compensar expansão.
- **Pendência estrutural:** na p. 85, `inline_elements.json` registra seis dados (`teal`, `purple`, `green`, `red`, `blue`, `grey`), mas o PDF mostra oito. Os dados branco e laranja são desenhos vetoriais na distribuição (bboxes aproximadas `[346.55,154.50,355.64,164.99]` e `[344.42,165.50,353.50,175.99]` pt), e os IDs `dice.white`/`dice.orange` existem no registry, mas não há placements nesta página. Não aprovar preview/import dessa unidade até reconciliar os placements; isso não invalida a sintaxe da tradução.
