# Aceite do fluxo EN → PT-BR — pilotos

**Data:** 2026-10-06
**Estado:** `PARTIAL — NÃO ESCALAR PARA READY/IMPORT`
**Escopo:** drafts editoriais de páginas impressas 13 e 85; nenhuma gravação no Payload/database ativo.

O usuário confirmou que o conteúdo já existente no database das páginas impressas 1–12 está aprovado. Esse conteúdo foi preservado. O piloto novo começa na p. 13.
Os estados históricos das páginas 1–12 na matriz não reabrem esse conteúdo nem as colocam na fila atual; registram apenas o escopo das auditorias anteriores.

## Seleção

| Página | Estruturas representadas | Por que entrou |
| --- | --- | --- |
| 13 | Duas colunas, headings, prosa, lista numerada, callouts, marcador de bandeira, caveira inline e arte na faixa de dificuldade | Aproveita o draft iniciado e cobre regras corridas, hierarquia, semântica inline e caixas. |
| 85 | Prosa densa em duas colunas, oito cores de dado inline, etapas numeradas, painel de diagrama e texto dentro da carta ilustrada | Pressiona copyfit e testa a separação de conteúdo editorial, símbolos, legenda e artwork. |

A p. 78 não foi usada como piloto do fluxo de **drafts Markdown** de p. 13/85. Em 2026-10-07, uma trilha separada do produto editor/viewer aceitou Body + Example da p. 78 em EN/PT-BR, com save/reload e export; consulte [`aceite vivo das unidades editoriais da p. 78`](../../project-progress/2026-10-07-p78-editorial-unit-live-acceptance.md). O resultado não promove nem grava os drafts Markdown de p. 13/85.

O viewer/editor tem um procedimento de aceite separado para unidades editoriais persistidas. O primeiro rollout controlado concluiu Examples numerados p. 50, pares heading/body p. 28 e label/body p. 57, incluindo o round-trip em Payload, reflow PT-BR, alternância após reload e comparação dos exports/page boxes com a fonte. Consulte o [relatório](../../project-progress/2026-10-07-controlled-editorial-rollout.md) e a [matriz de famílias editoriais](../../project-progress/editorial-unit-family-matrix.md). Essa trilha não transforma traduções de prova em terminologia aprovada e não substitui o aceite dos drafts Markdown.

## Evidência do pipeline

| Etapa | p. 13 | p. 85 |
| --- | --- | --- |
| PDF direto/render revisado | **PASS** — render oficial quadrado, duas colunas, callouts e faixa de arte conferidos | **PASS** — render oficial quadrado, duas colunas, carta ilustrada e painel A/B/C conferidos |
| Extração EN reproduzível | **PASS** — `extract_translation_markdown.py --pages 13,85` gerou os mesmos conteúdos linha a linha que os transcripts mantidos | **PASS** — mesma verificação; diferenças de hash eram apenas normalização de newline |
| Estrutura EN semântica | **PASS** — draft existente preserva 34 pares e runs do título; arte `DIFFICULTY` separada; a bandeira decorativa do heading foi removida pelo overlay aprovado | **PARTIAL** — 25 pares; blocks 9–29 e 45–47 são texto do manual; texto da carta (blocks 34–44) permanece dentro da imagem; A/B/C ficam como rótulos; gate bloqueado por dois dados sem placement |
| IDs/tokens semânticos | **PASS** — cinco placements semânticos têm tokens correspondentes; bandeira do exemplo mantida; bandeira decorativa de heading respeita o overlay de remoção aprovado | **BLOCKED** — IDs dos oito dados são válidos, mas o sidecar tem seis placements; faltam `dice.white` e `dice.orange` |
| Geometria EN fonte→viewer | **NOT MEASURED** — piloto editorial não compara o DOM | **OPEN** — PDF mantém origins do texto em block 10, mas `page_085_dom.json` os serializa como nulos; a diferença de viewer ainda não foi medida |
| Draft PT-BR | **PARTIAL** — já existia e foi mantido; termos ainda pendentes no candidato do glossário | **PARTIAL** — draft criado; termos de jogo estão explicitamente na fila de revisão |
| Scanner de expansão | **PASS mecânico** — 34 unidades, 5 alertas positivos >20% | **PASS mecânico** — 25 unidades, 3 alertas positivos >20%; duas contrações >20% foram marcadas para releitura sem presumir omissão |
| Preview PT comparado ao PDF | **PENDING** — não foi renderizado em sessão de preview isolada | **BLOCKED** — primeiro reconciliar os dois dados sem placement; preview não executado |
| READY / importável | **NO** | **NO** |

### Conferência do conteúdo não textual

- **p. 13:** o PDF fonte contém uma bandeira vetorial decorativa junto ao heading `Flags`, formada pelos desenhos 104–106. O usuário pediu sua remoção, e `fidelity_overlays.json` registra o overlay aprovado `page-013-flags-title-cleanup.png` na região `[124.0, 88.75, 136.5, 102.5] pt`. Portanto ela não é conteúdo inline a traduzir. Os cinco placements semânticos restantes (lápis, bandeira do exemplo, dois IMPORTANT e caveira) estão cobertos pelos tokens do draft.
- **p. 85:** o texto distribui dados de oito cores. O sidecar atual lista seis (`teal`, `purple`, `green`, `red`, `blue`, `grey`). O PDF tem desenho branco em bbox aproximada `[346.55, 154.50, 355.64, 164.99] pt` e laranja em `[344.42, 165.50, 353.50, 175.99] pt`; ambos têm IDs de registry (`dice.white`, `dice.orange`), mas não placements nesta página.
- **p. 85 / block 10:** as origens fonte de texto no PDF incluem `y=163.4382, 174.4376, 185.4376, 196.4376, 207.4376, 218.4376 pt` (spans de 10 pt). O DOM sidecar mantém bboxes/texto, mas tem `origin: null` nos spans. `hasExactSourceGeometry` requer origins válidos, então esta estrutura não satisfaz o critério de geometria exata; ainda falta comparar o modo/rects reais do viewer, sem atribuir causa visual final.
- Na p. 85, texto extraído da carta `Pirate Wench` está dentro da própria artwork; preservá-lo como parte da imagem é diferente da legenda explicativa A/B/C fora da face da carta, que foi estruturada e traduzida.

## Copyfit observado

Com `python scripts/audit_translation_copyfit.py docs/translations/pages/page-013.md docs/translations/pages/page-085.md`:

- **59 pares** no total: p. 13 = 34; p. 85 = 25.
- **8 expansões acima de 20%:** 5 na p. 13 (subtítulo `Continued`, headings `Flags`, `Story Rounds`, `2. Explore (Side Quests)` e `Bounties`) e 3 na p. 85 (parágrafo de distribuição de dados, heading `2. Compare Symbols` a 21,1% e heading `Abraxis Card`).
- Duas unidades da p. 85 contraem mais de 20%: a definição de `Locked In` (−24,9%) e a linha “Once again…” (−20,8%). O scanner não acusa contração; o procedimento agora exige leitura semântica também nesse sentido. A primeira tradução mantém aceitar o resultado, separar o dado, compará-lo no fim da rodada e não rolá-lo novamente.
- Percentuais são triagem de caracteres, não prova de cabimento. Nenhum dos alertas recebeu aprovação de layout sem preview.

## Problemas encontrados e mudanças no fluxo

1. **A transcrição bruta não é draft semântico.** A geração repetida preservou a mesma lista de linhas, mas precisa de reordenação editorial e decisão visual. O procedimento exige mapa de colunas/boxes antes da tradução.
2. **Sidecar incompleto pode parecer inventário completo.** A conferência da p. 85 mostrou dois dados sem placement, embora os seis restantes estejam mapeados. O novo gate compara visualmente cada candidato do PDF com todos os placements e bloqueia preview/import se houver `UNMAPPED_INLINE`. Na p. 13, os cinco placements semânticos estão mapeados e a bandeira do heading permanece removida pelo overlay aprovado.
3. **Alias de editor não é identidade semântica.** Os drafts agora usam `{{symbol:semantic.id}}`; o scanner foi ajustado para não contar a marcação como caracteres visíveis. O alias do editor é apenas uma entrada mutável e precisa ser convertido ao mesmo `symbolId`.
4. **20% só alerta expansão.** O procedimento exige conferir contrações grandes por risco de omissão e revisar o sentido de cada regra independentemente do percentual.
5. **Preview precisa de isolamento.** A produção não foi alterada. Ainda falta demonstrar uma rota de preview PT que consuma drafts Markdown sem salvar no database ativo.
6. **Estilo também faz parte da estrutura.** O primeiro rascunho da p. 85 achatava alguns runs. A revisão dos spans fonte reintroduziu negrito, itálico e negrito+itálico; as rubricas numeradas permanecem no corpo em 10 pt bold, sem tratá-las como títulos maiores.

## Conclusão de segurança

O procedimento está documentado e demonstrou que consegue produzir pares EN/PT-BR, preservar identidade semântica e detectar duas classes de erro que passariam despercebidas por revisão textual simples. **Ele ainda não foi provado ponta a ponta**: p. 13 não teve preview PT, e a p. 85 continua bloqueada pelos dois dados sem placement e pela origem ausente no sidecar de `block_10`.

É seguro continuar **criando drafts Markdown com os gates de bloqueio ativos**. Ainda **não é seguro** marcar páginas `READY`, importar em lote ou dizer que o fluxo completo está pronto para as 102 páginas.

## Próximas ações do piloto

1. Resolver de modo reproduzível os dois placements ausentes da p. 85 (`dice.white` e `dice.orange`). Não trocar por patches de CSS. A bandeira decorativa ao lado do heading `Flags` na p. 13 foi deliberadamente removida pelo overlay aprovado e não é placement faltante.
2. Preparar preview PT isolado que lê os drafts sem gravar no database de produção.
3. Revisar os oito alertas de expansão na moldura real e as duas contrações da p. 85.
4. Obter decisão dos termos marcados em `glossary-candidates.md`; só então promover o piloto a `LANGUAGE_PASS`.
5. Exportar/inspecionar p. 13 e p. 85 no viewer depois do preview, registrar captura/evidência e reavaliar se o procedimento pode escalar.
