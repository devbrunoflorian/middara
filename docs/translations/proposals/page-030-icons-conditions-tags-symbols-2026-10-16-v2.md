# p.30 — proposta PT-BR “Ícones, Condições, Tags e Símbolos” v2



**Estado atualizado (2026-10-26):** 19 unidades propostas; 18/19 revisões ativas aprovadas e publicadas no Payload, 1 pending. Review 1454 → translation 1246 e review 1455 → translation 1259 foram aprovadas pelo Reviewer oficial com EXACT 3/3 e 2/2. Review 1455 usa Ficha de Aventureiro por preferência explícita local, sem promover a hipótese global 67. Review 1460 segue pending por FLIGHT → VOO. A unidade block_41 continua com os símbolos semânticos existentes; nenhuma página integral foi certificada.



## Proposta de texto



### block_43 — Ícones, Condições, Tags e Símbolos







### block_19 — Ícones







### block_21 — Ícones aparecem em quase todas as cartas de Middara.



- Revisão: Icon → Ícone; registro oficial específico não localizado.



### block_22 — Nos Itens, indicam quais benefícios você obtém ao equipá-los.



- Revisão: Gain → obter é candidato contextual.



### block_23 — Nas Armas, os Ícones indicam o Alcance e os Dados de Combate usados. Nas Armaduras, indicam o bônus no Valor de Armadura; nos Núcleos, o bônus no Valor de Defesa.



- Revisão: Range, Combat Dice, Armor Value e Defense Value aguardam harmonização terminológica humana.



### block_24 — Nas Fichas de Aventureiro e Cartas de Combatente, os Ícones indicam atributos das Miniaturas, como HP, Movimento e Defesa.



- Rich spans: HP permanece em OptimaLTStd-Bold 9 pt como no PDF; os trechos adjacentes usam OptimaLTStd 10 pt. Harmonização contextual de “stats”/atributos ainda requer revisão editorial; a hipótese 67 de Adventurer Card também mantém a unidade pending.



### block_25 — Nas Cartas de Disciplina, indicam quais tipos de Arma precisam estar equipados para usar a carta de Habilidade.



- Revisão: Ability → Habilidade; Weapon → Arma, candidatos contextuais.



### block_26 — Veja a lista de Ícones, pág. 89.



- Revisão: Verbo de remissão “See” → “Veja”; revisar o título referenciado na p.89.



### block_27 — Toda Habilidade tem uma Condição. Tags de Condição indicam quando ela pode ser usada. Pontos de Vigor e Símbolos exigidos para usá-la também são Condições. Antes de usá-la, cumpra as Condições e pague os custos.



- Revisão: Condition → Condição; Condition Tag → Tag de Condição; Stamina Points → Pontos de Vigor são candidatos sem entrada específica no glossário.



### block_30 — Veja Tags de Condição, pág. 90.



- Revisão: Condition Tags → Tags de Condição; remissão à p.90.



### block_31 — Tags







### block_33 — Tags são regras especiais resumidas em palavras curtas. Elas sempre aparecem em CAIXA ALTA (por exemplo, VOO e INCANSÁVEL).



- Revisão: RELENTLESS → INCANSÁVEL segue o glossário; FLIGHT → VOO aguarda validação.



### block_34 — Tags produzem vários efeitos para os Aventureiros. Algumas não têm efeito, a menos que outra regra faça referência a elas. Outras têm regras especiais e Habilidades próprias.



- Revisão: Tags e Habilidades são capitalizados como termos de jogo; revisar o uso contextual.



### block_35 — As Tags no canto superior direito das Cartas de Item são consideradas Passivas e estão sempre em vigor.



- Revisão: Passive → Passiva como nome de Tag aguarda revisão.



### block_36 — Veja Tags, págs. 92–94.



- Revisão: “See Tags” → “Veja Tags”; referências ao intervalo 92–94 preservadas.



### block_37 — Símbolos







### block_40 — Os 4 Símbolos acima são produzidos ao rolar os dados personalizados do jogo. Dados diferentes podem produzir Símbolos diferentes, que podem ser gastos para usar Habilidades. Salvo indicação em contrário, Habilidades que usam Símbolos como Condição podem ser usadas sem limite, desde que haja Símbolos para gastar.



- Revisão: Custom dice → dados personalizados e a redação de “no limit” aguardam revisão.



### block_41 — Algumas Habilidades que usam Símbolos como Condição podem exibir vários. ⟦Escudo de defesa⟧ ⟦Símbolo de combate em forma de folha⟧ Nesses casos, usar a Habilidade uma vez custa 1 Livro e 1 Escudo. Quando houver Símbolos demais para caber na carta, eles serão impressos com números. Por exemplo, (⟦Símbolo de página de combate marcado com 3⟧) significa que um Aventureiro deve gastar 3 Livros para usar essa Habilidade.



- Revisão: as três ocorrências fonte foram mapeadas para `combat.shield`, `combat.page` e o composto `combat.page.3`. Copyfit V3 mediu **EXACT 5/5** no PDF-fonte e PageRenderer live a 200%. Os símbolos aparecem na prévia PT-BR após corrigir o contraste do tema escuro. A aprovação editorial humana permanece pendente.



### block_42 — [[symbol:tag.important.icon]] IMPORTANTE: Normalmente, os Símbolos só podem ser gastos durante uma Ação de Ataque, embora algumas Habilidades permitam gastar Símbolos em rolagens que não sejam de Ataque.



- Revisão: Ação de Ataque e “rolagens que não sejam de Ataque” são candidatos contextuais.



## Resolução técnica de símbolos inline



O mapeamento confirmou três ocorrências ligadas ao exemplo no PDF: `p030-v111-113-n3` → `combat.shield` (desenhos 111–113), `p030-v114-115-n2` → `combat.page` (114–115) e `p030-v116-117-n2` → `combat.page.3` (116–117 + glifo CFF `three`). O glifo textual `3` original é coberto apenas na ocorrência composta; o `3` da frase “gastar 3 Livros” permanece texto. Copyfit V3 confirmou **5 linhas-fonte / 5 linhas PageRenderer (EXACT)**. Os três símbolos ficam visíveis no cartão de prévia da revisão. A aprovação editorial humana continua pendente. Evidência, comparação de pixels e rollback: [manifesto da família p.30](../../../output/proofs/source-symbol-inline-focus-2026-10-23/p030-family/manifest.json).



## Fonte e evidências



O PDF oficial e o Viewer EN foram comparados. Ver [PDF raster](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/source-official-p030.png), [Viewer EN](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/viewer-en-source-v1.png) e a [proposta v1](page-030-icons-conditions-tags-symbols-v1.md). Os hashes ficam no [JSON v2](page-030-icons-conditions-tags-symbols-2026-10-16-v2.json).



## Viewer, Editor, Copyfit V3 e PDF v2



A prova anterior validou 18 unidades no Viewer, Editor read-only, Copyfit V3 de impressão e PDF; os 19 campos candidatos foram comparados no Editor e os diálogos foram cancelados. A recuperação dos símbolos do block_41 mudou o conteúdo medido; a nova medição live é **EXACT 5/5** e a prévia foi conferida com os três glifos visíveis. O total sobe para 19 verificações de Viewer e Copyfit; a evidência PDF permanece em 18, pois a proposta atualizada ainda não foi reexportada. O Payload foi acessado apenas para leitura, sem gravação. A decisão editorial continua pendente.



Evidências: [recibo Viewer/Editor](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/viewer-editor-receipt-v2.json), [recibo PDF e Copyfit V3](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/pdf-copyfit-receipt-v2.json), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/page-030-pt-BR-diagnostic-v2.pdf), [raster](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/print-pt-BR-diagnostic-v2.png) e [métricas](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/metrics-pt-BR-diagnostic-v2.json).



## Publicação e correção terminológica (2026-10-26 07:02 UTC)

- Review 1454/block_23 → translation 1246 foi aprovada pelo Reviewer oficial; copyfit EXACT 3/3 e fingerprint preservado.
- Review 1455/block_24 foi salva como pending com a preferência `Ficha de Aventureiro`, mantendo `Cartas de Combatente` conforme usos publicados. A medição EXACT 2/2 registrada anteriormente foi invalidada nesta correção textual/tipográfica: o draft anterior trazia PV e não preservava o bold de HP em 9 pt. Nova medição pendente; a decisão 67 continua hipótese, portanto não aprovar.
- Copyfit V3 foi reaplicado à redação corrigida: EXACT 2/2 a 100% e 200%; fontes carregadas, com HP no estilo bold de 9 pt. O pedido de aprovação continua bloqueado pela hipótese 67.
- A revisão 1460 segue pending por FLIGHT → VOO. Payload atual: 17/19 unidades da p.30 aprovadas; a página continua parcial.


## Correção de HP e rich span (2026-10-26)

- O glossário do proprietário exige preservar HP/SP/XP; o PDF confirma HP em OptimaLTStd-Bold, 9 pt, entre spans regulares de 10 pt. A proposta foi corrigida para HP e o estilo original restaurado.
- A revisão Payload 1455 recebeu a mesma redação e os três rich spans. EXACT 2/2 antigo foi invalidado e substituído por medição PageRenderer EXACT 2/2 em 100% e 200%. A review 1455 foi aprovada e publicada como translation 1259 via Reviewer oficial; Ficha de Aventureiro segue escolha local do proprietário, sem canonização global.


## Publicação da review1455 (2026-10-26 08:20 UTC)

- O Reviewer oficial publicou translation 1259 após a correção de HP e medição PageRenderer EXACT 2/2 em 100% e 200%. O readback confirmou texto e três rich spans idênticos à proposta: 10 pt regular, HP bold 9 pt, 10 pt regular.
- Ficha de Aventureiro segue a preferência local explícita; decisão global 67 permanece hipótese, Cartão continua alternativa e Adventure Sheet → Ficha de Aventura permanece distinto. Nenhuma entrada do glossário foi promovida.
- A p.30 tem 18/19 reviews ativas aprovadas; review1460 continua pendente por FLIGHT → VOO. A página ainda não está certificada integralmente.
