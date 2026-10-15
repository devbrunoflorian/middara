# p.33 — Proposta PT-BR: Convicção, Conjuração e estrutura das cartas

- **Versão:** 1
- **Estado:** proposta editorial não aprovada; não importada no aplicativo
- **Fonte:** PDF oficial EN, p.33; DOM local `page_033_dom.json`

## Verificações concluídas

- Comparei a p.33 do PDF oficial com o Viewer normal em modo EN, na página inteira. Cabeçalhos, duas colunas, cards de exemplo, ilustração, diagrama inferior e chamadas A–E aparecem nas mesmas regiões. É uma conferência visual de composição; não certifica cada glifo por diff de pixels nem o PDF exportado.
- Render da página oficial: [`p033-source-page.png`](../../../../output/proofs/translation-readiness-2026-10-15/p033-source-page.png). O PDF-fonte tem 102 páginas, caixa 820,346 × 820,346 pt e SHA-256 `A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351`.
- `fidelity_overlays.json` marca três recortes de carta como `languageInvariant`: *Magic Staff*, *Deflection Core* e *Quick Blow*. O texto impresso dentro dessas imagens continua em inglês e não está traduzido nesta proposta. A localização dessas três artes precisa de uma etapa própria; esta página não fica totalmente localizada até isso ser resolvido.
- `inline_elements.json` tem dois placements `dice.white`, nos exemplos de *Magic Staff* e *Deflection Core*. Os trechos `PURPLE` aparecem como texto em negrito no DOM, sem `symbolId`; não inventei novos placements roxos.
- O Viewer PT está sem o serviço Payload/Admin e, por isso, cai no EN. Copyfit da proposta, leitura de volta no Editor e PDF PT-BR permanecem pendentes. Nenhum texto foi salvo.
- Consulta somente leitura ao SQLite local (`apps/admin/apps-admin.db`) não encontrou registros cujas chaves comecem com `page_33` ou `p33`. O hash do banco após a sessão permaneceu `43D3223C87BB6DC902BE76162DD526D33776DE065486972D7296D5E20C8B7B12`.

## Texto editorial proposto

| Bloco e índice | EN | PT-BR proposto |
|---|---|---|
| `block_45`, 28 — título | Conviction and Casting Upgrades | Aprimoramentos de Convicção e Conjuração |
| `block_34`, 18 | Many Abilities offer Conviction or Casting Upgrades. An Upgrade of this type allows an Adventurer to roll better dice when rolling Conviction Checks and Casting rolls. | Muitas Habilidades oferecem Aprimoramentos de Convicção ou de Conjuração. Um Aprimoramento desse tipo permite que um Aventureiro role dados melhores ao fazer Testes de Convicção e rolagens de Conjuração. |
| `block_35`, 19 | By default, an Adventurer uses the dice printed on their Adventurer Card when making Conviction or Casting rolls. This will usually be 1 PURPLE when Casting, and 2 PURPLE when making a Conviction Check. | Por padrão, um Aventureiro usa os dados impressos em sua Carta de Aventureiro ao fazer rolagens de Convicção ou de Conjuração. Em geral, usa **1 dado roxo** ao Conjurar e **2 dados roxos** ao fazer um Teste de Convicção. |
| `block_36`, 20 | Example on an Adventurer Card: | Exemplo em uma Carta de Aventureiro: |
| `block_37`, 21 | Conviction: | Convicção: |
| `block_38`, 22 | Casting: | Conjuração: |
| `block_39`, 23 | Conviction and Casting Upgrades will replace the dice used to make these rolls. | Os Aprimoramentos de Convicção e de Conjuração substituem os dados usados nessas rolagens. |
| `block_40`, 24 | An Adventurer is limited to 1 Upgrade to their Casting roll, and 2 Upgrades when rolling their Conviction Check. If an Adventurer has an Ability that provides them with more Upgrades than they can use, they must choose which Upgrade they want to use. | Um Aventureiro pode ter no máximo **1 Aprimoramento** na rolagem de Conjuração e **2 Aprimoramentos** ao fazer um Teste de Convicção. Se uma Habilidade conceder mais Aprimoramentos do que ele pode usar, deverá escolher quais usar. |
| `block_41`, 25 | Example: Above are 2 examples of Upgrades from 2 different types of Items. The Magic Staff lets an Adventurer replace their default PURPLE with a WHITE when determining the Force of a SPELL. | **Exemplo:** Acima estão **2** exemplos de Aprimoramentos de **2** tipos diferentes de Itens. O *Magic Staff* permite que um Aventureiro substitua seu dado roxo padrão por um dado branco `[[white-die]]` ao determinar a Força de um Feitiço. |
| `block_43`, 26 | The Deflection Core lets an Adventurer replace 1 of their default PURPLE with a WHITE when making a Conviction Check. If an Adventurer had 2 Conviction Upgrades, they could use both and replace both of their default PURPLE with better dice. | O *Deflection Core* permite que um Aventureiro substitua **1** de seus dados roxos padrão por um dado branco `[[white-die]]` ao fazer um Teste de Convicção. Se tivesse **2 Aprimoramentos de Convicção**, poderia usar ambos e substituir os dois dados roxos padrão por dados melhores. |
| `block_48`, 29 — título | Discipline Card Breakdown | Estrutura da Carta de Disciplina |
| `block_24`, 8 — rótulo e explicação | XP COST: The XP it costs an Adventurer to learn this Discipline. | **CUSTO DE XP:** Quantidade de XP necessária para um Aventureiro aprender esta Disciplina. |
| `block_25`, 9 — rótulo e explicação | STAMINA POINT (SP) COST: The red dots indicate the amount of SP a Discipline costs to use. Some Disciplines cost 0 SP but may have other Conditions. | **CUSTO EM PONTOS DE VIGOR (SP):** Os pontos vermelhos indicam quantos SP custa usar uma Disciplina. Algumas Disciplinas custam **0 SP**, mas podem ter outras Condições. |
| `block_26`, 10 — rótulo e explicação | CARD NAME: Name of the Discipline. | **NOME DA CARTA:** Nome da Disciplina. |
| `block_27`, 11 — rótulo e explicação | TAGS: The Discipline Tree the card is from and its Level (LVL). | **TAGS:** Árvore de Disciplinas à qual a carta pertence e seu Nível (**LVL**). |
| `block_28`, 12 — rótulo e explicação | ABILITY TEXT: This section of the card contains the Abilities on the Discipline Card, the rules for what they do, and any Conditions that must be met to use them. | **TEXTO DA HABILIDADE:** Esta seção da Carta de Disciplina contém as Habilidades, as regras que descrevem seus efeitos e as Condições que precisam ser atendidas para usá-las. |

Os índices são posições atuais em `page_033_dom.json`, não IDs do aplicativo. A tabela agrupa cada rótulo com sua explicação para facilitar a revisão; vários blocos têm subtrechos tipográficos e o Rich Block Editor pode abrir uma chave filha. Antes de importar, reconciliar as chaves reais e a composição de cada unidade para não deixar fragmentos EN duplicados.

## Termos e limites

- **Glossário oficial aplicado:** `Conviction` → “Convicção”; `Spell` → “Feitiço”; `Casting Die` → “Dado de Conjuração”; `Item Upgrade` → “Aprimoramento de Item”.
- **Propostas locais pendentes:** `Upgrade` → “Aprimoramento”; `Conviction Check` → “Teste de Convicção”; `Casting` → “Conjuração”; `Stamina Point` → “Ponto de Vigor”; `Discipline Tree` → “Árvore de Disciplinas”; `Ability` → “Habilidade”; `Tag` → “Tag”. Não alterei o glossário global.
- *Magic Staff*, *Deflection Core* e *Quick Blow* foram mantidos como nomes ingleses para corresponder aos cards de arte que ainda estão em inglês.
- Os dois `[[white-die]]` mantêm os objetos semânticos existentes. A expressão roxa foi traduzida como texto; não inserir símbolo roxo até confirmar sua relação com a arte-fonte e sua posição no DOM.
- Aplicar negrito/itálico por correspondência semântica, não por posição dos trechos ingleses. O Editor pode exigir remontagem manual dos runs ricos.

## Gates pendentes

- Reconciliar as 16 propostas de bloco com as unidades tipográficas expostas no Editor e com os dois dados brancos do sidecar.
- Localizar ou substituir as três imagens de carta que seguem em inglês, sem redesenhar a arte vizinha.
- Conferir todos os trechos PT no Viewer real, incluindo ajustes de frame e ausência de clipping/colisão.
- Exportar a p.33 PT-BR e comparar a página inteira com o PDF-fonte e o Viewer.
- Revisar termos e redação com a equipe editorial antes de qualquer gravação humana.

Nenhuma tradução foi gravada no Payload ou na base local; nenhum sidecar, asset canônico ou dado humano foi alterado.
