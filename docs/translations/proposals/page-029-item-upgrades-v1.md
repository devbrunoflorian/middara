# p.29 — Proposta PT-BR: tipos e transferência de aprimoramentos

**Versão:** 1
**Estado:** proposta editorial não aprovada; não importada no aplicativo
**Fonte:** PDF oficial EN, p.29; DOM local `page_029_dom.json`

## Verificações concluídas

- Comparei a página 29 do PDF-fonte com a página 29 no Viewer normal, em escala ajustada à tela. Título, texto introdutório, regras, callouts IMPORTANT, exemplo, cards e ilustração aparecem nas mesmas regiões. Esta é uma conferência visual da p.29, não uma certificação das demais páginas.
- A consulta somente leitura à base ativa não encontrou registros de tradução para `page_29%`.
- O Rich Block Editor abriu a unidade de título `page_29_unit_p29-block-45-first-size-12pt__en`. O próprio editor exibiu “PAYLOAD INDISPONÍVEL — ESTADO NÃO VERIFICADO”; a gravação/reabertura de tradução não foi testada.
- Em PT, testei temporariamente no PageRenderer o título e a introdução desta proposta a 100%: o título ficou em uma linha no frame original de 12 pt; a introdução ocupou três linhas no frame original de 10 pt e não encostou no parágrafo seguinte. Cancelei os dois rascunhos sem salvar; os textos em inglês reapareceram no Viewer.
- O sidecar inline da página identifica dois `tag.important.icon`. O trecho `Symbol` no card de Armadura contém um run separado de fonte `AdobeHebrew-Regular`, mas não tem entrada correspondente no sidecar inline. A proposta conserva o termo e não insere um segundo símbolo.
- Nenhuma tradução foi persistida. Os dois previews acima foram temporários e descartados; não houve gravação no Payload, em sidecar canônico ou em tradução humana.

## Texto proposto

### Título e cards

| Unidade de origem | EN | PT-BR proposto |
|---|---|---|
| `block_10` | Item Upgrade Types | Tipos de Aprimoramento de Item |
| `block_13` | Master Work | Obra-Prima* |
| `block_15` | WEAPON UPGRADE | APRIMORAMENTO DE ARMA |
| `block_16` — rótulo | EXHAUST | EXAURIR* |
| `block_16` — efeito | When making an Attack, add +1 TO THE ATK ROLL. | Ao fazer um Ataque, adicione +1 à rolagem de ATQ.* |
| `block_20` | Refined | Refinado* |
| `block_21` | ARMOR UPGRADE | APRIMORAMENTO DE ARMADURA |
| `block_22` — rótulo | EXHAUST | EXAURIR* |
| `block_22` — efeito | When an Attack is rolled against you, Ignore a single Symbol. | Quando um Ataque for feito contra você, ignore um único Símbolo.* |
| `block_27` | Scrying | Vidência* |
| `block_28` — rótulo | EXHAUST | EXAURIR* |
| `block_28` — efeito | When making a Conviction Check, add +1 to the roll. | Ao fazer um Teste de Convicção, adicione +1 à rolagem. |
| `block_30` | CORE UPGRADE | APRIMORAMENTO DE NÚCLEO |
| `block_34` | Etherium | Etherium |
| `block_35` | UNIVERSAL UPGRADE | APRIMORAMENTO UNIVERSAL |
| `block_38` | WEAPON / ARMOR / CORE | ARMA / ARMADURA / NÚCLEO |
| `block_43` | UNIVERSAL | UNIVERSAL |

`*` Nome ou palavra mecânica ainda sem decisão confirmada. Manter a proposta identificada como candidata até resolver os termos abaixo.

### Regras e exemplo

**Transferir e substituir Aprimoramentos de Item**

Assim que desbloquear um tipo de Aprimoramento de Item, você poderá comprar quantas cópias quiser, desde que não ultrapasse a quantidade total de cartas desse Aprimoramento de Item disponível.

Se um jogador quiser equipar um Aprimoramento de Item em um Item, mas não houver cópias disponíveis porque todas estão em outras Cartas de Item, esse jogador poderá pagar o custo em Ouro para transferir o Aprimoramento de Item para o segundo Item.

Se um jogador quiser substituir um Aprimoramento de Item equipado por outro, deverá pagar novamente o custo em Ouro daquele Aprimoramento de Item.

[[symbol:tag.important.icon]] **IMPORTANTE:** Para fins de Aprimoramento, Itens de Saque de História e de Monstro são considerados Itens do seu Nível de Saque atual.

[[symbol:tag.important.icon]] **IMPORTANTE:** Itens com a Tag **DUPLO** têm dois lados distintos. Se você aprimorar um lado, o outro também será aprimorado. Se o outro lado não for elegível para esse Aprimoramento, não será possível usá-lo, mas ele continuará anexado ao Item.

**Por exemplo:** Remi quer aprimorar sua *Top-Heavy Axe* (Arma Comum) com o Aprimoramento de Item *Obra-Prima*, mas sua *War Axe* (Arma Mundana) já está aprimorada com a última cópia disponível de *Obra-Prima*. (Seus companheiros de grupo já usaram todas as outras, avidamente.) Ela terá de pagar 30 de Ouro para transferir *Obra-Prima* da *War Axe* para a *Top-Heavy Axe*.

## Decisões editoriais pendentes

1. **Nome dos quatro aprimoramentos:** confirmar `Master Work → Obra-Prima`, `Refined → Refinado` e `Scrying → Vidência`; preservar `Etherium` como nome próprio é uma proposta conservadora.
2. **Ação de card:** confirmar `EXHAUST → EXAURIR` e a forma preferida para `ATK ROLL` (`rolagem de ATQ` ou outra forma já usada no livro).
3. **Loot LVL:** `Nível de Saque` é coerente com `Loot → Saque` do glossário e com o rascunho da p.3, mas a equivalência exata para `Loot LVL` ainda não está oficializada no glossário.
4. **Classificações e nomes de armas:** confirmar `Common Weapon → Arma Comum`, `Mundane Weapon → Arma Mundana` e se `Top-Heavy Axe` e `War Axe` devem permanecer em inglês ou receber nomes localizados.
5. **Callout 1:** confirmar se `Story and Monster Loot Items` deve ser segmentado como “Itens de Saque de História e de Monstro” ou se o jogo usa nomes próprios diferentes para as duas categorias.
6. **Glifo de Símbolo:** mapear o glifo que acompanha `Symbol` no card de Armadura ao elemento semântico do jogo antes de salvar a tradução no Editor. Preservar o glifo-fonte durante a proposta; não duplicá-lo.

O glossário oficial `Item Upgrade → Aprimoramento de Item` foi aplicado em todo o texto. Maiúsculas de termos de regra, negrito/itálico e os dois marcadores `tag.important.icon` devem permanecer semanticamente ligados ao texto durante a implementação.

## Estado de copyfit e liberação

- **Copyfit no PageRenderer em PT-BR:** parcial. Título e introdução passaram no preview individual descrito acima. Transferência, substituição, callouts, exemplo e texto dos cards ainda precisam de preview.
- **Exportação PDF em PT-BR:** pendente.
- **Aprovação humana:** pendente para todos os termos listados acima e para a redação completa.
- **Próximo passo seguro:** resolver os termos da página, então inserir a proposta como rascunho isolado de PT-BR, conferir reflow/colisões no Viewer e exportar somente a p.29 antes de considerá-la pronta para revisão humana.
