# Página 32 — Discipline Trees (proposta v2)

- **Status:** proposta PT-BR para revisão; não aprovada editorialmente, não copiada ao Payload.
- **PDF:** página impressa 32, PDF oficial 32/102.
- **Revisão EN↔Viewer:** comparação visual da página completa em 2026-10-15, rota normal `http://127.0.0.1:8080/`, modo EN. A composição, os cinco cartões e os blocos de texto correspondem ao PDF. A verificação foi visual de página inteira; não certifica geometria por diff de pixels nem PDF exportado.
- **Estado PT no Viewer:** a página aparece em inglês por fallback. A API/Admin não estava escutando na porta 3000, portanto o Viewer não leu o registro PT já salvo.
- **Editor em 2026-10-15:** o clique direto em um subtrecho rico da introdução abriu `page_32_unit_p32-block-41-font-size-10pt-unit-00__pt-BR`; isso confirma que a edição por subtrecho não é a mesma chave de bloco legado da tabela. A unidade editorial `Body` foi aberta no Rich Block Editor. Um rascunho temporário do corpo PT re-renderizou na sessão e foi marcado `PT-BR ALTERADO NA SESSÃO / NÃO SALVO`; o campo foi cancelado, o Viewer voltou ao EN e o modo Admin foi fechado. Nenhum botão Save foi usado. O Editor avisou que ênfases da origem não correspondem textualmente; a correspondência rich text e o copyfit visual continuam pendentes.
- **Escopo do rascunho:** 15 unidades novas. A unidade de exemplo existente foi identificada no banco e preservada.

## Inventário e proposta

Os IDs abaixo são os IDs de bloco/unidade presentes em `page_032_dom.json`. A página tem 26 blocos. As chaves `page_32_block_N__pt-BR` são as chaves de bloco legado derivadas do índice atual e do contrato de `PageRenderer.tsx`; `p32-discipline-levels-body` é uma unidade editorial do próprio DOM. Elas não devem ser confundidas com as chaves dos subtrechos tipográficos que o clique direto abre no Editor. Em 2026-10-15, o Editor PT abriu `page_32_unit_p32-block-41-font-size-10pt-unit-00__pt-BR` ao clicar em um trecho da introdução. Esse subtrecho é apenas uma parte rica do bloco 41; não é uma tradução integral da introdução. O Payload estava indisponível, nenhuma alteração foi salva e o mapa completo de subtrechos ainda precisa ser reconciliado antes de inserir conteúdo no Editor.

| Alvo da proposta | Índice do bloco | Chave PT-BR de bloco legado / unidade editorial |
|---|---:|---|
| `block_54` — título | 23 | `page_32_block_23__pt-BR` |
| `block_41` — introdução | 10 | `page_32_block_10__pt-BR` |
| `block_42` — custo de XP | 11 | `page_32_block_11__pt-BR` |
| `p32-discipline-levels-body` | 12 | `page_32_unit_p32-discipline-levels-body__pt-BR` |
| `block_56` — IMPORTANT | 24 | `page_32_block_24__pt-BR` |
| `block_49` — título Assemblage | 18 | `page_32_block_18__pt-BR` |
| `block_44` — texto Assemblage | 13 | `page_32_block_13__pt-BR` |
| `block_50` — título Cruor | 19 | `page_32_block_19__pt-BR` |
| `block_45` — texto Cruor | 14 | `page_32_block_14__pt-BR` |
| `block_51` — título Martial | 20 | `page_32_block_20__pt-BR` |
| `block_46` — texto Martial | 15 | `page_32_block_15__pt-BR` |
| `block_52` — título Sanctus | 21 | `page_32_block_21__pt-BR` |
| `block_47` — texto Sanctus | 16 | `page_32_block_16__pt-BR` |
| `block_53` — título Subterfuge | 22 | `page_32_block_22__pt-BR` |
| `block_48` — texto Subterfuge | 17 | `page_32_block_17__pt-BR` |

### Título — `block_54`

**EN:** Discipline Trees
**PT-BR proposto:** Árvores de Disciplinas

### Introdução — `block_41`

**EN:** Discipline Cards contain Abilities that can be used at different times depending on their Conditions. Disciplines are learned as Adventurers spend XP when given the opportunity to Shop and Train. See Buying Items and Learning Disciplines Pg. 24.

**PT-BR proposto:** Cartas de Disciplina contêm Habilidades que podem ser usadas em momentos diferentes, conforme suas Condições. Os Aventureiros aprendem Disciplinas ao gastar XP quando têm a oportunidade de Comprar e Treinar. Veja *Comprar Itens e Aprender Disciplinas*, pág. 24.

### Custo de XP — `block_42`

**EN:** The XP cost of a Discipline is listed in the top left corner of the card. This cost is increased by +1 XP for every other Discipline of the same level an Adventurer already has. The “+” is listed alongside the XP cost as a reminder for players.

**PT-BR proposto:** O custo em **XP** de uma Disciplina aparece no canto superior esquerdo da carta. Esse custo aumenta em **+1 XP** para cada outra Disciplina do mesmo nível que o Aventureiro já tiver. O sinal **“+”** aparece junto ao custo em XP como lembrete para os jogadores.

### Regras de níveis — `block_43`, unidade `p32-discipline-levels-body`

**EN:** Disciplines are separated into 5 different Discipline Trees, and each Tree is divided into Levels (LVL). Disciplines can be mixed and matched to customize your Adventurer. Adventurers may learn LVL 1 Disciplines from any Tree but higher LVL Disciplines require at least 1 Discipline from each lower LVL of the same Tree to learn them.

**PT-BR proposto:** As Disciplinas se dividem em **5** Árvores de Disciplinas, e cada Árvore é dividida em Níveis (**LVL**). As Disciplinas podem ser combinadas para personalizar seu Aventureiro. Aventureiros podem aprender Disciplinas de **Nível 1** de qualquer Árvore, mas, para aprender Disciplinas de nível superior, precisam ter aprendido pelo menos **1 Disciplina** de cada nível inferior da mesma Árvore.

### Exemplo existente — `block_43`, unidade `p32-discipline-levels-example`

**Estado:** já existe uma tradução PT-BR persistida no banco `apps/admin/apps-admin.db`, row `300`, key `page_32_unit_p32-discipline-levels-example__pt-BR`, atualizada em `2026-10-07T21:09:08.549Z`. O status de aprovação editorial desse registro não está disponível. Não foi editado nem substituído.

**Texto salvo:** “Exemplo: Um Aventureiro só pode aprender uma Disciplina CRUOR de Nível 3 se já tiver aprendido uma Disciplina CRUOR de Nível 1 e outra de Nível 2.”

### IMPORTANT — `block_56`

**EN:** An Adventurer may learn as many Disciplines as they can afford, however, they may not learn the same Discipline twice.

**PT-BR proposto:** `[[lightning]]IMPORTANTE: Um Aventureiro pode aprender quantas Disciplinas puder pagar; porém, não pode aprender a mesma Disciplina duas vezes.`

`[[lightning]]` corresponde ao `symbolId` `tag.important.icon`. Manter o rótulo vermelho com contorno branco separado do corpo; esta proposta ainda não passou pelo Editor nem pelo PDF exportado.

### Assemblage — título `block_49`, texto `block_44`

**PT-BR proposto:** Assemblage é a arte de sussurrar às coisas que caminham nos reinos além do nosso e de lidar com criaturas antigas que um dia estiveram além da nossa imaginação. As Habilidades de Assemblage costumam refletir um perfil versátil, capaz de desempenhar várias funções. Isso porque essas Habilidades são tão diversas quanto as criaturas que se invocam para realizá-las. Nos primeiros níveis de Assemblage, o jogador pode realizar uma ampla variedade de Ações, desde ganhar Ações extras até conceder Efeitos Positivos.

### Cruor — título `block_50`, texto `block_45`

**PT-BR proposto:** Cruor é arriscada por natureza. Suas Habilidades podem ser muito poderosas, mas só se o conjurador estiver disposto a sacrificar um pouco de si. Ela se apoia no poder bruto do sacrifício para cumprir seu propósito. Cruor concede a Habilidade de amaldiçoar os inimigos até reduzi-los a pó, adoecê-los, arruiná-los ou liquefazê-los. Quem segue Cruor pode esperar colher grandes recompensas, mas deve ter cuidado para não se perder no processo.

### Martial — título `block_51`, texto `block_46`

**PT-BR proposto:** Martial é a personificação do combate físico em Middara. Embora muitas Árvores de Disciplinas possam tornar os Ataques mais poderosos, Martial transforma um Aventureiro em uma potência física em combate. Martial pode aprimorar Ataques à Distância ou Corpo a Corpo, e o jogador deve considerar ambos em alguns casos. Algumas Armas, como a Kusarigama, podem ser usadas tanto em ataques Corpo a Corpo quanto à Distância; isso permite usar com essa Arma Habilidades que funcionem para qualquer um dos dois tipos de Ataque.

### Sanctus — título `block_52`, texto `block_47`

**PT-BR proposto:** Sanctus oferece Habilidades poderosas e variadas. Pode conceder armaduras mágicas, asas temporárias ou permitir que seus usuários evitem obstáculos. Com Sanctus, os jogadores podem redirecionar Dano, CURAR e até dobrar a realidade para teleportar a si mesmos ou outras pessoas. Sanctus pode complementar qualquer estilo de jogo Corpo a Corpo ou à Distância, mas se destaca especialmente entre personagens defensores e de suporte.

### Subterfuge — título `block_53`, texto `block_48`

**PT-BR proposto:** Subterfuge é a arte do ladino e do assassino. A maioria das Habilidades de Subterfuge se concentra em causar muito Dano, mas algumas também maximizam o potencial defensivo ao permitir que os jogadores se ESQUIVEM, realizem Ações gratuitas e se movam sem penalidade. A árvore incentiva agilidade e posicionamento para uma abordagem mais sutil, mas também inclui algumas Habilidades diretas.

## Termos e limites

- **Glossário oficial:** `Shop and Train` → “Comprar e Treinar”. O uso de “Veja” para referência cruzada segue a convenção editorial aprovada.
- **Candidatos ainda não aprovados:** `Discipline Tree` → “Árvore(s) de Disciplinas” já aparece como candidato no registro de termos; `Discipline`, `Level/LVL`, `Ability`, `Condition`, `Action`, `Positive Effects`, `Melee`, `Ranged`, `Damage`, `HEAL` e `DODGE` não têm equivalentes oficiais confirmados no glossário consultado. As formas usadas acima são propostas locais, não decisões globais.
- **Nomes das cinco árvores:** Assemblage, Cruor, Martial, Sanctus e Subterfuge permanecem em inglês conforme o rascunho da p.4; essa preservação ainda depende de decisão editorial humana.
- **Arte:** os cinco cartões são overlays do artwork original marcados `languageInvariant: true`; seus títulos, rótulos `LVL 1` e microtexto permanecem como arte fonte nesta proposta. Não foram editados.
- **Rich text:** preservar manualmente os pesos, itálicos, tamanhos e ênfases da fonte; não transferir destaque por posição ou proporção de caracteres. O símbolo do IMPORTANT permanece objeto semântico.

## Gates pendentes

- Conferir a tradução salva do exemplo no Rich Block Editor depois que a API estiver disponível, sem sobrescrevê-la.
- Revisar os termos candidatos e a redação com a equipe editorial.
- Reconciliar as chaves de bloco legado da tabela com os subtrechos tipográficos expostos pelo clique direto no Editor. Depois, medir copyfit na PageRenderer real, incluindo ambas as colunas, a caixa IMPORTANT e textos vizinhos; a API estava indisponível nesta sessão.
- Verificar estilos e símbolo no Viewer PT-BR após carregar os registros; fazer save/reload somente para alterações explicitamente aprovadas.
- Exportar a p.32 e comparar o PDF PT-BR com a fonte e o Viewer.

Nenhuma tradução foi gravada no banco; nenhum sidecar, arte, Payload ou tradução existente foi alterado.
