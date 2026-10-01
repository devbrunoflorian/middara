# Auditoria do feedback visual do usuário: páginas 4, 13 e 15

- **Status:** amostra das páginas 4/13/15 implementada e revisada no app; build aprovado; este marco está pronto para commit. A auditoria visual das outras 99 páginas permanece em andamento.
- **Data:** 2026-09-30.
- **Objetivo:** corrigir discrepâncias inglesas concretas apontadas pelo usuário nas páginas 4, 13 e 15 e registrar método, incertezas, evidências, pontos de vista e decisões de escopo para reaproveitar nas outras páginas.
- **Evidência do usuário:** seis screenshots nesta rodada: cards da página 4 mostrando títulos em peso insuficiente, `Nightingale Arsen` duplicado e texto padrão de carta ausente; página 13 com headings não bold e parágrafo de `Story Disciplines and Items` encostando/entrando no aviso `IMPORTANT`; página 15 com `BOMBING THE SICKLES` e outros rótulos sobreimpressos, mais a imagem de referência limpa.
- **Escopo:** comparar o PDF base local, screenshots, JSON e código de extração/render; procurar auditorias/extrações anteriores da página 15. Não iniciar tradução nem substituir imagens até determinar se texto é parte raster da figura ou camada separada. Não ler/implementar o glossário ainda; o usuário pediu para retomar isso depois da rodada de fidelidade.
- **Critérios:** headings em peso igual ao PDF; conteúdo padrão das cartas preservado exatamente uma vez; ghosts só ocultados quando há prova por pintura/camada e comparação visual; paragraph/callout sem colisão; figura da página 15 categorizada com decisão documentada de tradução; screenshots app↔PDF em escala comparável; build/lint e registro atualizados antes de commit.

## Método

1. Relacionar cada reclamação aos screenshots e localizações no PDF/DOM.
2. Conferir o histórico em `docs/project-progress/`, o arquivo icebox e scripts de extração anteriores antes de refazer qualquer ingestão.
3. Para texto sobre imagens, consultar `.agents/rules/07-fantasmas-e-artefatos-duplicados.md` e medir a ordem de pintura real por `get_bboxlog()`/`get_texttrace()`, sem tratar a ordem do `get_text("dict")` como z-index confiável.
4. Separar origem da discrepância: dado extraído, flag de ghost, asset de fundo, fonte/peso, bboxes/framing, ou regra de renderização.
5. Corrigir apenas o menor caminho confirmado; registrar contraexemplos para a rule reutilizável e pedir validação visual somente para a mudança que não possa ser comparada sem o app.

## Observações e decisões do usuário registradas

- A página em inglês continua sendo a referência que deve ficar fiel ao PDF antes de avançar tradução.
- Os headings de tópico devem preservar o bold de origem, como já se exigiu para rótulos na página 2.
- Um texto marcado como `suspectedGhost` não pode deixar um nome espúrio aparente nem remover conteúdo padrão verdadeiro que pertence à carta.
- Na página 15, a pessoa usuária pergunta se “Bombing the Sickles” e sua diagramação são uma imagem reproduzida de uma página do Adventure Book ou uma simulação de peças; pede para encontrar extrações/trabalho antigo antes de refazer. A proposta de limpar a imagem e recompor textos é uma hipótese de workflow, não decisão aprovada para substituir a arte.
- Dúvidas, achados e correções/contracases devem entrar no log da tarefa e, se repetíveis, na rule/skill de fidelidade para melhorar a metodologia.

## Registro de execução

### Evidência técnica antes da implementação

- **Página 4 — títulos:** o PDF e o DOM mostram `Rulebook`, `Adventure Book`, `Diagram Book`, `Combatant Cards` etc. como `Cinzel-Regular`, 12 pt, sem flag de negrito. A aparência de small caps vem da estilização/glyphs do PDF, não de peso `Bold`. O histórico contém uma tentativa anterior de forçar Cinzel a 700 e depois sua remoção por artefatos de alinhamento. Decisão: não reaplicar negrito global; testar a forma small caps no renderer mantendo peso 400.
- **Página 4 — cards Combatant:** o recorte de `background.webp` mostra os três cards frontais com áreas textuais em branco; o render original do PDF mostra nomes, habilidades e atributos. A extração contém esses trechos (p.ex. blocos 316–323, 361–367 e 407) com fontes entre 0,9 e 2,25 pt. Vários herdaram `suspectedGhost: true` por estarem sobre imagens, e o `PageRenderer` ainda descarta spans menores que 4 pt. As operações do PDF colocam texto sobre os cards; o rótulo `suspectedGhost` não é prova de que esses trechos estejam embutidos no artwork. Decisão pré-código: restaurar só as linhas dentro do retângulo dos três cards de Combatant, com exceção explícita para texto pequeno; não remover o limite global.
- **Página 4 — Nightingale Arsen:** o nome está visível no próprio `background.webp` da carta e no PDF. A flag não consegue apagar pixels da arte. Tratar a ocorrência rasterizada como parte legítima da imagem; evitar renderizar uma cópia HTML em cima dela. Isso não autoriza limpar ou traduzir a imagem da carta.
- **Página 13 — suposto estouro:** no PDF, o último texto da seção termina em x≈406,7 pt e a caixa `IMPORTANT` começa em x≈421,5 pt; há cerca de 14,8 pt de espaço. A fonte é `OptimaLTStd` 10 pt e a geometria extraída não cruza a caixa. O risco está na métrica/fallback ou no desenho HTML, não em uma sobreposição presente na referência. Não estreitar o bloco nem truncar o texto sem reproduzir o app atualizado contra a imagem do usuário.
- **Página 13 — títulos:** `Story Disciplines and Items` e `Bounties` são `Cinzel-Regular`, 12 pt, sem flag de bold, como os headings da página 4. A correção candidata é small caps preservando o peso.
- **Página 15 — figura:** “Bombing the Sickles” é um diagrama explicativo composto: mini layout de encontro, mapa/peças e legenda A–G. Não é apenas uma fotografia de componentes nem há prova local de que seja uma página inteira copiada do Adventure Book. `background.webp` contém texto de Form XObjects/imagens, enquanto a página também expõe spans vetoriais; por isso a extração atual sobrepõe algumas palavras. Um teste de remoção recursiva do texto dos Forms apagou também rótulos legítimos do mapa e do layout; foi descartado antes de tocar em assets. Nenhum sidecar/extração antiga da área foi encontrado nas pastas pesquisadas. A tradução futura deve tratar a figura como composite image: limpar somente as regiões textuais e reconstruir em separado quando forem legíveis; manter como imagem traduzida quando a densidade inviabilizar uma reconstrução fiel.

### Correções planejadas após a leitura das regras

1. Aplicar small caps somente ao mapeamento de Cinzel sem forçar bold e verificar o build.
2. Tornar legível, na página 4, o texto extraído dos três Combatant cards cujo fundo está sem texto: exceção explícita de ghost e de tamanho na região do card, sem alterar a heurística global.
3. Não mexer na largura da página 13 nem reconstruir a figura da página 15 até validar screenshot final do app; corrigir o método de extração/mascaramento antes de tentar generalizar a remoção de texto de Forms.

Essas conclusões registram tanto as dúvidas do usuário quanto o que a evidência local resolve e o que ainda depende de comparação app↔PDF. A regra 07 será atualizada para evitar que tamanho pequeno ou contenção em imagem sejam tratados como decisão automática.

## Implementação e validação nesta retomada

- **Página 4 — títulos:** `mapPdfFont()` mantém Cinzel-Regular em peso 400 e aplica `font-variant-caps: small-caps`, tanto no texto extraído quanto em segmentos de override. Isso é uma tentativa delimitada que segue o nome da fonte/estilo observado no PDF; ainda precisa de captura atual do app para aprovação visual.
- **Página 4 — três cards Combatant:** 101 blocos dentro da região dos cards foram conferidos contra o PDF e o `background.webp`. Onde o texto vetorial existe no PDF mas o fundo está sem a impressão correspondente, os JSONs agora removem a classificação `suspectedGhost` e marcam as linhas `renderTinyText`; a regra geral de ghosts e o limiar global de 4 pt não foram alterados. A exceção inclui microspans auxiliares da mesma região, então a captura precisa confirmar que não reintroduziu artefatos.
- **Página 4 — Nightingale Arsen:** o overlay HTML foi classificado como cópia de um rótulo que já está rasterizado na carta. O motivo ficou explícito em `ghostOverrideReason`; isso esconde só a cópia na visualização normal e deixa a linha extraída nos dados para seleção/admin.
- **Página 13:** sem mudança geométrica. Os bboxes do PDF medem cerca de 14,8 pt entre o fim do texto da coluna esquerda e o início do callout relevante, então reduzir texto ou estreitar a coluna sem comparar o app atual arriscaria piorar o layout. A captura nova é o teste decisivo para distinguir um problema de métricas/fallback no browser de um problema de JSON.
- **Página 15:** o primeiro teste marcou nove overlays duplicados (título/introdução e itens A–G da legenda). A conferência visual no app mostrou uma regressão: a legenda rasterizada tem baixo contraste e o vetor claro do PDF é necessário; desmarquei somente os sete itens A–G. Permanecem ocultos na visualização normal em inglês o título/introdução (`block_103`, `block_104`), que agora aparecem sem a sobreimpressão observada. Um override localizado ainda pode revelar simultaneamente o texto inglês embutido na arte. Antes de traduzir esta figura composta, será preciso limpar/recompor regiões ou gerar uma imagem localizada, sem remover indiscriminadamente o texto dos Form XObjects.
- **Verificação:** `npm run build -w apps/web` concluiu com sucesso (TypeScript + Vite). `npm run lint -w apps/web` concluiu com código 0 e sete warnings de regras React/Fast Refresh, sem erro. `git diff --check` passou; houve apenas avisos CRLF de arquivos existentes.
- **Correção de processo:** uma primeira compilação falhou em `vite:prepare-out-dir` (`ENOTEMPTY` ao limpar `dist/pages/page_004`) após duas tentativas de build terem sido iniciadas sobre a mesma saída. Conferi processos: não havia outro build ativo, apenas os servidores normais. Rodei uma compilação única depois, que passou. A falha inicial não indica erro TypeScript nem foi ocultada; não alterei nem removi manualmente `dist`.
- **Correção após inspeção visual:** escondi por engano os overlays da legenda A–G porque as palavras também existem no fundo. O app mostrou que a camada de fundo está escura/quase ilegível; o vetor claro precisa ficar ativo. Reverti a supressão desses sete blocos. Nova regra prática: presença textual no fundo não basta — comparar contraste, cor, nitidez e estilo; preservar o overlay quando ele é o tratamento legível da referência.

## Resultado ainda em aberto / próxima ação

As mudanças de código e dados foram feitas e a interface local foi inspecionada depois do build. Na página 4, os três cards exibem texto, o rótulo Nightingale aparece uma vez como parte da arte, e os headings aparecem em small caps sem mudança observável de baseline. Na página 13, a tela atual não mostra interseção: o fim da coluna esquerda chega perto do callout, mas mantém espaço visível coerente com os ~14,8 pt medidos no PDF. Na página 15, depois do hot reload, o título não duplica e a legenda A–G está clara após restaurar os overlays vetoriais. Isso encerra o piloto dessas três reclamações; não equivale a declarar o livro inteiro aprovado.

Manter o gate de generalização: não aplicar mudanças a outras páginas somente por semelhança de nome/família. A triagem automática das 102 páginas continua sendo triagem de dados, não aprovação visual. Próxima etapa book-wide: usar a matriz para auditar páginas em inglês por layout/fontes/arte, atualizando cada status individual; páginas 6 e 101 continuam na fila visual; página 15 exige asset localizado antes de qualquer tradução do diagrama. O glossário segue adiado, conforme pedido do usuário.
