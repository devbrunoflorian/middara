# Problemas comuns de layout e correções aprovadas

Este guia reúne padrões recorrentes que já foram comparados ao PDF-fonte e corrigidos no Viewer e no PDF. Aplique uma solução quando a estrutura da página atual confirmar o mesmo caso; a semelhança visual, sozinha, não prova que a unidade tenha a mesma hierarquia.

## `[[symbol]]` encosta no texto, fica longe demais ou muda de tamanho

**Sintoma:** um símbolo semântico parece colado à palavra, separado por um vão excessivo ou com tamanho diferente do símbolo do PDF original. O mesmo ID semântico pode ter dimensões e afastamentos diferentes entre ocorrências.

**Regra fixa de análise:** não há um espaço automático único aplicado a todo `[[symbol]]`. O renderer reserva o avanço do símbolo e só adiciona margens quando `gapEm` ou `trailingGapEm` foram medidos; o espaçamento tipográfico continua vindo dos espaços reais nas unidades rich-text. Para cada lado, meça a distância entre a tinta da letra e a tinta do símbolo e separe:

- o avanço do espaço presente no texto (dependente da fonte, do tamanho e do tracking);
- a margem medida daquela ocorrência (`gapEm × tamanho` antes do símbolo; `trailingGapEm × tamanho` depois dele);
- qualquer diferença entre a caixa reservada (`advanceEm`) e a tinta efetivamente desenhada.

Compare esquerda e direita separadamente com a mesma ocorrência no PDF-fonte. Não some um espaço literal quando a fonte não o tem, não retire o que a fonte tem e não replique `gapEm` como espaço textual: isso duplica o vão. Símbolos adjacentes podem ter somente uma margem medida entre si, sem espaço textual.

**Como confirmar:**

1. Consulte o PDF oficial e o sidecar `inline_elements.json` da página. Registre a caixa de tinta, a fonte/tamanho do texto vizinho e o `gapPt`/`trailingGapPt` da âncora; normalize cada medida pela escala tipográfica da ocorrência.
2. Leia os segmentos rich-text antes e depois de `[[symbol]]`; confirme se há os espaços que aparecem na fonte. Inspecione também `widthEm`, `heightEm`, `verticalAlignEm` e `sourceAssetUrl`: o ID semântico sozinho não garante geometria igual entre ocorrências.
3. No Viewer e no PDF exportado, meça as caixas de texto e a tinta do símbolo. Um espaçamento que parece correto no Viewer pode divergir no print se um caminho semântico ou uma moldura local não tiver sido aplicado.

**Correção aprovada:** preserve os espaços textuais da fonte e os valores medidos por ocorrência. Se o sidecar já tem a âncora correta mas a unidade de tradução não recebe as métricas por estar separada em uma unidade editorial menor, grave as métricas de ocorrência nessa unidade; não invente uma regra CSS global. Faça copyfit de novo após alterar tamanho, avanço, margem ou texto. Confira quebra de linha, clipping, colisão e paridade Viewer/PDF.

**Caso verificado:** na p.33, a linha de texto 9 pt usa 0,6316 pt de margem medida antes do dado roxo, além do espaço tipográfico; entre os dois dados da linha “Convicção” a margem medida é 3,5 pt, sem espaço textual. `Convicção:` e `Conjuração:` no PT estavam sem o espaço textual que existe antes do primeiro dado na fonte; cada ocorrência mantém sua margem de 0,5 pt. O dado roxo do parágrafo principal também precisava das dimensões-fonte próprias (1,2764 × 1,4732 em); no box lateral, a ocorrência usa 1,1488 × 1,3259 em e 0,6318 pt de margem depois. Depois do ajuste, esses blocos mantiveram as 4/4 e 3/3 linhas fonte/PT, sem excesso horizontal no Viewer/print; o nome `Magic Staff` continua junto na mesma linha.

**Caso verificado:** na p.37, duas ocorrências de `action.exhaust` em texto Optima 9 pt têm `trailingGapEm≈0,1272` (≈1,145 pt), enquanto `marker.arrow` no mesmo tamanho usa `trailingGapEm=0,1` (0,9 pt). Esses valores descrevem somente as ocorrências medidas; não são uma margem natural comum a todos os símbolos. O espaço aparente inclui também o espaço real do rich-text e a diferença entre o avanço reservado e a tinta do SVG/arte. As ocorrências foram comparadas ao PDF-fonte, e a página final manteve Viewer/print sem overflow. Na mesma página, um parser geométrico do PDF separava o rótulo pequeno `STATUS` da cápsula e contava 3 baselines para um parágrafo que visualmente tem 2 linhas; a caixa de texto do Viewer, o PDF rasterizado e o print confirmam as 2 linhas. Ao auditar símbolos, identifique primeiro a unidade e o tamanho tipográfico, meça a tinta e a margem de cada lado e então confira o copyfit; não transforme leitura automática de baseline em evidência de quebra visual.

**Caso verificado:** na p.38, três ocorrências de `dice.black` em texto Optima 10 pt preservam o espaço textual real após `PRETO` (avanço de cerca de 2,502 pt) e a margem residual medida de aproximadamente 0,284 pt (`gapEm≈0,0284`). Os blocos 30, 33 e 35 ficaram em 2/2, 2/2 e 3/3 linhas. A margem é específica de cada ocorrência; não substitui nem duplica o espaço textual. Viewer e PDF exportado foram conferidos.

**Caso verificado:** na p.39, `terrain.red-border` em Optima 10 pt tem avanço semântico de 2,0575 em; a distância entre a tinta do texto e a tinta da linha vermelha é 5,8427 pt à esquerda e 4,1623 pt à direita. O rich-text conserva espaços reais nos dois lados. Nos três callouts `IMPORTANT`, o símbolo começa sem vão adicional até o rótulo; o texto do corpo conserva o espaço literal que a fonte mostra, com 2,4097 pt ou 2,7796 pt entre a tinta do rótulo e a primeira letra, conforme a ocorrência. Esses valores descrevem somente as unidades medidas na p.39.

## Tamanho ou cor de uma fonte diverge do PDF OG

**Sintoma:** um rich-text parece visualmente próximo, mas usa outro tamanho, peso, itálico ou cor em relação ao span correspondente no PDF oficial.

**Como confirmar:** compare os spans reais do PDF (família, tamanho em pontos, cor, peso/itálico e contorno, quando houver) com cada segmento rich-text da unidade. Mantenha separados o preenchimento da letra, os traços e os elementos decorativos; não use uma captura ampliada como medida de tamanho nem classifique uma reconstrução semântica como divergência sem conferir sua aparência final.

**Correção aprovada:** ajuste somente os segmentos divergentes para as medidas da fonte e repita o copyfit. Confira o resultado no Viewer e no PDF exportado, incluindo caixas, símbolos, clipping e colisões. Uma conferência local não certifica conversão global de perfis CMYK/sRGB nem outras páginas.

**Caso verificado:** na p.38, as 35 unidades editoriais foram comparadas ao PDF OG. Três runs de `SP` em `page_38_block_9__pt-BR` estavam em Optima Bold 10 pt, enquanto a fonte usa 9 pt; o tamanho foi corrigido e o bloco manteve 7/7 linhas. As cores e demais estilos de texto coincidem com a fonte. Os únicos conjuntos de estilo diferentes são os dois callouts `IMPORTANTE`: o original usa glifo decorativo branco e letras com tratamento de contorno; o Viewer reconstrói o raio como símbolo semântico e aplica preenchimento vermelho com contorno branco, preservando o desenho visível.

**Caso verificado:** na p.39, 22 unidades e 124 spans de texto do PDF foram comparados por família, tamanho, cor, peso e itálico; não houve falhas de associação geométrica nem divergência de estilo no rich-text final. Um draft deixava `Derrotaria` em Optima Bold 10 pt, embora o OG use Optima regular 10 pt em `#231f20`; o peso foi restaurado. O título `Espaços Adjacentes` mantém Cinzel-Regular 18 pt, branco, peso 700, igual ao cabeçalho OG. A comparação local não certifica a conversão global CMYK/sRGB.


**Diferença de renderização observada na p.49 (ainda sem causa isolada):** runs regulares do OG e do Viewer usam OptimaLTStd 10 pt; os segmentos medidos no Viewer declaram peso 400, mas o raster do Viewer aparenta corpo mais pesado que o raster do PDF OG, tanto em EN quanto em PT-BR. A tradução mantém tamanho, peso e cor registrados na fonte; não compense localmente com peso menor. Mantenha a fidelidade de peso em aberto até comparar o programa de fonte usado no PDF, os arquivos locais e a rasterização do renderer.
## Cabeçalho traduzido excede a largura do texto original

**Sintoma:** um título localizado corretamente ocupa mais largura que o texto inglês e quebra, encosta nos ornamentos ou parece desalinhado quando reutiliza apenas a caixa estreita dos glifos da fonte.

**Como confirmar:** compare o termo com o glossário e a decisão humana; meça o centro óptico do título em relação ao cabeçalho e aos ornamentos no PDF oficial. Confira no editor se a unidade aceita uma moldura PT-BR própria. Não trate o limite da tinta inglesa como largura máxima do cabeçalho.

**Correção aprovada:** preserve o termo canônico e a cor. Primeiro amplie e alinhe a moldura local ao centro do cabeçalho, mantendo o tamanho da fonte quando houver espaço real. Se o texto ainda encostar nos ornamentos dentro da largura disponível, compare o raster com um ajuste tipográfico mínimo; não deixe o texto cruzar o ornamento só para manter o mesmo número de pontos. Meça novamente em Copyfit e confira Viewer, PDF exportado e o PDF OG.

**Caso verificado:** na p.39, `Adjacent Spaces` foi traduzido como **Espaços Adjacentes**. O proprietário ampliou e centralizou a moldura PT-BR `page_39_block_34` para X=457,631 pt e largura=235,190 pt, conservando Cinzel-Regular 18 pt branca. O título mede 1/1 linha em 100% e 200%; a moldura salva no Payload é a de id 65. Viewer e PDF impresso foram comparados com o OG, sem clipping nem colisão.

**Caso verificado:** na p.40, `Push, Pull, and Command` virou **Empurrar, Puxar e Comandar**. A moldura inglesa de 249,966 pt era estreita demais; ampliar somente a moldura PT-BR até 300 pt e centralizá-la abriu o corredor entre os ornamentos. Cinzel-Regular 18 pt e 17 pt ainda tocavam as volutas no raster; 16 pt mantém respiro equilibrado, branco/peso 700, e o título mede 1/1 linha no Viewer e no PDF. A moldura `page_40_block_15::pt-BR` está salva no Payload como id 66. O tamanho reduzido é uma adaptação local confirmada visualmente, não uma regra global.

**Também verificado na p.53:** o cabeçalho inferior original `Spells vs Spell-Like Abilities` usa Cinzel-Regular 14 pt branco. A frase inicial `Feitiços vs. Habilidades Semelhantes` mantinha uma linha, mas encostava nos arabescos internos. Como o cabeçalho da coluna já explicita **Habilidades Semelhantes a Feitiços**, a forma contextual `Feitiços vs. Habilidades Similares` preserva a comparação em uma linha, Cinzel-Regular 12,5 pt, centralizada e livre dos arabescos no print. A moldura PT-BR é local; a abreviação não altera o termo editorial usado na prosa.

## Moldura de revisão aparece na prévia, mas não no Viewer/PDF persistido

**Sintoma:** a prévia da revisão mostra uma unidade no quadro proposto, mas o Viewer normal ou o PDF exportado volta à posição e largura inglesas.

**Diagnóstico:** `reviewLayoutFrame` pode alimentar a prévia isolada. O PageRenderer normal usa o registro persistido em `layout-frames`, identificado por unidade e idioma. Aprovar o texto não grava automaticamente esse registro.

**Correção aprovada:** salve a geometria no editor de molduras para o idioma PT-BR. Confira o `unitKey`, a página e a largura física (`total`); depois recarregue a página e exporte pelo Viewer real, sem snapshot imutável. Só certifique a moldura depois de o PDF exportado confirmar a mesma geometria e o copyfit esperado.

**Caso verificado:** na p.40, a prévia de revisão do título usava 300 pt, mas o primeiro PDF real reutilizou a caixa inglesa de 249,966 pt e quebrou em duas linhas. O registro local não existia. Após salvar `page_40_block_15::pt-BR` (id 66; X=408,339 pt, largura=300 pt, Y=434,874 pt), a exportação real passou a medir 1/1 linha, Viewer e print com 17 unidades estruturais e `pdfVerification=true`.

**Também verificado na p.42:** a prévia isolada do título mostrava o `reviewLayoutFrame` centralizado, mas o Viewer/exportação normais ainda usavam a moldura herdada. Após persistir a moldura PT-BR `page_42_block_8::pt-BR` (id 68; X=122,5 pt, largura=575,346 pt, centralizada), o título ficou 1/1 linha e visualmente centrado no Viewer e no PDF exportado. A captura de revisão, sozinha, não certificava a página.

**Também verificado na p.48:** o título `Habilidades que Encerram Ações e Habilidades` quebrava em duas linhas porque a caixa PT-BR tinha 263,41 pt, embora a coluna oferecesse 321,112 pt. A moldura de revisão não estava persistida. Após salvar `page_48_block_0::pt-BR` (id 76; X=415,842 pt; largura total=321,112 pt), o título ficou 1/1 linha e separado da regra horizontal no Viewer e no PDF exportado.

**Também verificado na p.53:** a moldura localizada de `page_53_block_32::pt-BR` foi persistida no Payload (id 77; X=460 pt; largura=250 pt). A medição isolada inicial usava a geometria inglesa; o caminho de prévia foi atualizado para aplicar a moldura candidata PT-BR antes de medir. Com a moldura salva, título OG e PT-BR medem 1/1 linha; a exportação real confirmou a geometria no Viewer e no print.

## Parágrafo de exemplo perde o recuo da lista

**Sintoma:** um parágrafo explicativo, como `Exemplo:`, aparece alinhado à margem dos bullets, embora no PDF-fonte continue alinhado ao corpo dos itens da lista. A quebra de linha seguinte também volta para a margem errada.

**Como confirmar:**

1. Abra a mesma página no PDF oficial e no Viewer.
2. Compare o X do marcador da lista com o X do corpo do item e do exemplo. Confirme visualmente que o exemplo pertence à hierarquia da lista antes de classificá-lo como recuado.
3. Observe também as linhas de continuação: elas devem começar no mesmo X do texto do exemplo, sem acompanhar o marcador do bullet.

**Correção aprovada:**

- Se o bloco mistura unidades que têm alinhamentos distintos e o exemplo pode ser editado separadamente, separe-o numa unidade com a moldura medida no PDF. Foi o caso da p.19: os bullets começam em X=86,173 pt e o exemplo em X=104,173 pt.
- Se a lista e os exemplos precisam permanecer num único bloco traduzido, registre os recuos fonte por índice de parágrafo em `flowParagraphIndentsPt` no sidecar da página. O renderer aplica esse recuo e reduz a largura de linha pela mesma medida. Foi o caso da p.22: os exemplos 1 e 2 usam 18 pt de recuo (`{ "3": 18, "8": 18 }`); o início dos bullets está em X=86,528 pt e o dos exemplos em X=104,528 pt.

**Copyfit obrigatório após o recuo:** repetir a medição da unidade no PageRenderer. O recuo reduz a largura útil e pode criar novas quebras. Compare o número e a posição das linhas com a fonte; se a tradução estourar ou produzir quebras ruins, revise a redação sem mudar o sentido e meça novamente. Não reduza fonte ou entrelinha automaticamente.

**Conferência de aceite:** após salvar/recarregar, conferir o PT-BR no Viewer e no PDF exportado contra o PDF inglês: posição do marcador, X do corpo e das continuações, quebras do exemplo, clipping, colisões e símbolos próximos. Resolver o caso somente quando Viewer e PDF coincidirem.

**Casos verificados:** na p.19, o exemplo ganhou sua própria moldura e o texto “Surgimento” mediu 6 linhas na fonte e 6 em PT-BR. Na p.22, os dois exemplos mantiveram os 18 pt de recuo e o bloco mediu 32 linhas na fonte e 32 em PT-BR; o PDF exportado foi conferido visualmente.

**Também conferido na p.53:** o marcador de cada bullet é desenhado numa coluna de recuo separada; por isso, o `textContent` do DOM pode expor `•Itens` sem um espaço literal, embora a distância visual do corpo esteja correta. Normalize o separador somente na comparação de texto da validação de exportação; não insira um espaço no conteúdo PT-BR sem que ele exista na fonte. Viewer e print mantiveram os bullets e as continuações alinhados.

## Item de lista traduzido invade o item seguinte

**Sintoma:** um item que ocupa uma linha no PDF passa para duas em PT-BR, mas a moldura continua com a altura fonte e o próximo item conserva a posição original. O texto pode invadir a linha seguinte mesmo que não ultrapasse a página.

**Correção aprovada:** meça as linhas reais e aumente apenas a moldura PT-BR até cobrir o conteúdo. Reposicione os itens seguintes e o parágrafo livre usando as caixas medidas; mantenha a arte e os callouts na posição fonte. Preserve a redação e o tamanho tipográfico quando couberem com esse reflow. Repita o copyfit e confira a área disponível antes do próximo box.

**Caso verificado:** na p.24, “1 ARMADURA + 1 Aprimoramento de Armadura” ocupa duas linhas, como pede o português. A moldura PT cresceu para 22,92 pt; os itens seguintes e o parágrafo abaixo foram deslocados para evitar colisão. A redação e a arte dos quadros foram preservadas. Viewer e PDF exportado ficaram sem sobreposição; a unidade mede duas linhas nos dois.

**Também verificado na p.27:** medir cada linha da lista separadamente. Os seis itens ficaram em 3/3, 3/3, 1/1, 2/2, 1/1 e 1/1 linhas fonte/PT. O primeiro item mantinha 3 linhas, mas excedia o frame em 2,62 pt; uma revisão curta preservou a regra e a paridade. A maior linha final mede 286,86 pt num frame de 292,38 pt, sem escape horizontal ou colisão no Viewer/print.

## Parágrafo traduzido invade uma referência ou unidade seguinte

**Sintoma:** o PT-BR ocupa mais linhas que a fonte e cobre uma remissão ou parágrafo independente, cuja posição permanece fixa. O bloco ainda pode parecer caber na página, apesar de sobrepor a unidade seguinte.

**Como confirmar:** compare a quebra de linha e a distância vertical no PDF oficial, Viewer e print/PDF. Meça o texto real contra o frame e confira se a remissão seguinte é uma unidade separada. Não una nem reposicione conteúdo editorial para esconder uma tradução longa.

**Correção aprovada:** primeiro faça copyfit mantendo termos, sentido e rich text. Se o texto ficar em mais linhas que a fonte e exceder a moldura, ajuste somente o frame local PT-BR e confirme espaço até a próxima unidade. Depois exporte de novo e confira clipping, colisão e paridade Viewer/PDF.

**Caso verificado:** na p.30, o corpo de “Condições” crescia de 4 linhas na fonte para 6 no PT-BR e invadia “Veja Tags de Condição, pág. 90.”. A redação foi condensada sem alterar a hierarquia e passou a 4 linhas de corpo; a moldura local PT-BR ganhou 2 pt de altura. O título e a remissão continuaram unidades separadas, sem clipping nem colisão no Viewer/print v6. A linha de referência manteve sua posição original.

## Medição de linhas da fonte separa trechos ricos da mesma linha visual

**Sintoma:** o relatório de copyfit marca uma unidade como `EXACT`, mas a rasterização mostra PT-BR ocupando uma linha extra e invadindo a referência ou o box seguinte. Isso pode ocorrer quando trechos rich-text dentro do mesmo objeto de linha do PDF têm baselines diferentes; agrupar somente por baseline conta um desses trechos como uma segunda linha da fonte.

**Como confirmar:** inspecione a página oficial em raster e os objetos de texto do PyMuPDF. Se os trechos têm o mesmo par `(bloco, linha)` no PDF, mas origens verticais diferentes, some primeiro os trechos pelo objeto de linha-fonte; só depois agrupe objetos distintos pela baseline representativa (tolerância de 1 pt). Confira o número de linhas visualmente no PDF e no Viewer/print. Não trate uma contagem automática como prova quando ela contradiz a página rasterizada.

**Correção aprovada:** em `scripts/measure_copyfit_page.mjs`, preservar a identidade do objeto de linha-fonte, agregar os baselines de seus trechos rich-text e agrupar linhas-fonte distintas pela baseline representativa. Depois, medir novamente a tradução no PageRenderer e conferir o export final. O ajuste corrige a medição; não muda a geometria do PDF nem autoriza remover ênfase rich-text. Se o texto traduzido realmente ocupar uma linha a mais e colidir com conteúdo independente, revise o copyfit e preserve a hierarquia.

**Caso verificado:** na p.41, o parágrafo `page_41_unit_p41-block-44-paragraph-3__pt-BR` foi medido como 4/4 porque dois trechos da primeira linha inglesa tinham baselines separados por 5 pt no mesmo objeto de linha. O PDF visual tem 3 linhas; a tradução antiga tinha 4 e cobria a referência seguinte. Com a medição corrigida, o texto foi condensado preservando o sentido e o `FU` em negrito 9 pt, ficando em 3/3. O box `page_41_block_16__pt-BR` também foi reescrito com `FU` em negrito 9 pt e passou de 7/6 para 6/6 linhas. As 35 unidades da página foram medidas novamente; todas ficaram `EXACT`. PDF, Viewer e print finais foram comparados sem colisões visíveis.

## Texto traduzido ultrapassa horizontalmente a moldura

**Sintoma:** a tradução parece caber, mas a última linha passa da largura da moldura, ou o fim do texto entra na área gráfica vizinha. O aviso vertical do Viewer pode não detectar esse excesso.

**Como confirmar:** compare o PDF-fonte, Viewer e print/PDF exportado. Meça os limites das linhas de texto contra a moldura em ambas as renderizações; não use apenas o estado do alerta vertical.

**Correção aprovada:** revise a redação sem retirar informação nem alterar a hierarquia dos termos; preserve estilos rich text e tamanho da fonte. Gere novamente Viewer e PDF, conferindo largura, clipping e número/posição das linhas contra a fonte. Redimensione a moldura somente quando houver espaço real na página e a estrutura original justificar a mudança.

**Caso verificado:** na p.25, a explicação da barra de vigor excedia a moldura de 292,16 pt em cerca de 2,38 pt. A frase foi condensada mantendo as duas ocorrências de `SP` em negrito e a mesma composição de três linhas. A linha mais larga passou a medir 282,95 pt no Viewer e 282,89 pt no print; ambos ficaram dentro da moldura e `pdfVerification=true`.

**Também verificado na p.28:** a primeira linha do parágrafo sobre custo de Aprimoramentos ultrapassava o frame de 305,19 pt em 2,14 pt, embora continuasse em quatro linhas. “Varia conforme” passou a “depende do”; o texto manteve quatro linhas e a maior mede 299,48 pt, sem excesso no Viewer/print. `Tier` e `LVL` permaneceram conforme o glossário.

**Também verificado na p.35:** o corpo do Baralho de Saque excedia o frame de 293,956 pt em 1,264 pt, apesar de manter 3 linhas. A revisão “Quando um oponente é Derrotado, os jogadores compram cartas do baralho” preservou o sentido e reduziu a maior linha a 288,851 pt no Viewer e 288,789 pt no print; ambos ficaram dentro do frame, sem colisão visível. O PDF exportado preservou as 3 linhas da fonte.

**Também verificado na p.36:** sete unidades mantinham a contagem de linhas da fonte, mas ultrapassavam horizontalmente seus frames entre 0,49 e 2,62 pt. Revisamos a redação sem mudar os frames nem remover informação: parágrafos 2–3, itens 2–4 e exemplos 1–2. As contagens finais fonte/PT-BR são 5/5, 3/3, 5/5, 5/5, 4/4, 2/2 e 3/3, confirmadas a 100% e 200%. Viewer e print não mostram excesso à direita; a unidade mais apertada termina em 299,03 pt num frame de 301,50 pt. Export final verificado com `pdfVerification=true`.

**Também verificado na p.46:** o bloco `page_46_block_1__pt-BR` tinha uma linha 2,54 pt maior que a moldura, apesar de manter 3/3 linhas. Como havia espaço real dentro da coluna marrom e a redação aprovada estava semanticamente correta, ampliei apenas o frame PT-BR de 285,109 para 290 pt (Payload id 74). O texto continuou em 3/3 linhas; a linha mais larga mede 288,55 pt no Viewer e 288,50 pt no print, sem excesso. A moldura termina antes da arte e não altera a unidade seguinte.

## Texto curto deixa uma lacuna antes do próximo bloco fixo

**Sintoma:** a tradução cabe na moldura, mas ocupa menos linhas que o texto correspondente no PDF OG e deixa um vão perceptível antes do próximo exemplo, parágrafo ou box. Um status `EXACT` de largura e clipping não detecta esse desequilíbrio vertical.

**Como confirmar:** compare a mesma unidade no OG, Viewer e print/PDF. Conte linhas visuais reais, confira a posição da tinta e da unidade seguinte e meça a maior linha contra a largura da moldura. Confirme que os dois blocos são unidades distintas e que o vão vem de uma linha que a tradução deixou de ocupar; não confunda espaço deliberado do design com copyfit curto.

**Correção aprovada:** reescreva o texto com fluidez, preservando sentido, termos, rich text e posição das demais unidades, para recuperar a quantidade de linhas da fonte quando isso for necessário ao equilíbrio da composição. Não acrescente conteúdo, quebras manuais ou palavras redundantes só para preencher espaço. Depois meça novamente linhas e largura, e confira Viewer, print/PDF, clipping e distância até o bloco seguinte.

**Caso verificado:** na p.50, o Exemplo 4 ocupava 5 linhas em PT-BR contra 6 no OG, deixando um vão antes do Exemplo 5; a última linha também ultrapassava a moldura em 0,498 pt. A redação foi ajustada sem alterar as quatro partes de rich text. O resultado ocupa 6/6 linhas, a maior linha mede 611,020 pt numa moldura de 611,647 pt e não há excesso horizontal. Viewer e print/PDF exportados confirmam a composição.

## Captura do Viewer feita antes da moldura local carregar

**Sintoma:** a captura automatizada do Viewer mostra uma unidade traduzida no frame inglês, enquanto a mesma página aparece ajustada no print/PDF.

**Diagnóstico:** traduções e molduras são carregadas por chamadas separadas. Uma captura feita assim que o texto PT aparece pode registrar o frame inicial antes de o pedido de `layout-frames` terminar.

**Correção aprovada:** no exportador de uma página, aguarde as respostas de moldura da página/idioma solicitados e dois ciclos de renderização antes de medir ou capturar o Viewer. A p.21 confirmou a corrida: a captura prematura quebrou `Tipos de Terreno` em duas linhas; depois de a moldura PT carregar, Viewer e PDF exibiram o título em uma linha.

**Conferência de aceite:** compare a geometria medida e a imagem do Viewer com a imagem do print/PDF. Se a diferença continuar depois da carga confirmada, trate como divergência real de renderer e investigue-a antes de aprovar a página.

## Rótulo confundido com texto impresso dentro da arte

**Sintoma:** títulos curtos continuam em inglês ao lado ou acima de componentes que foram preservados como imagens, e a revisão os classifica automaticamente como parte da arte.

**Como confirmar:** compare o PDF oficial com o recorte exato do overlay/imagem e com os limites das caixas de texto extraídas. Um rótulo que está fora do recorte da arte e tem geometria de texto própria é texto da página, mesmo quando visualmente parece pertencer ao componente.

**Correção aprovada:** mantenha intacta a imagem do componente e crie uma unidade editável local para cada rótulo externo. Meça a posição a partir da caixa do componente correspondente e preserve alinhamento, tipografia, cor e centralização. Mantenha em inglês o texto realmente impresso dentro da arte, conforme a decisão editorial para cartas e tabelas.

**Copyfit obrigatório:** conferir cada unidade no Viewer e no PDF. Rótulos curtos também podem ficar desalinhados ou colidir quando são centralizados em relação à coluna inteira em vez do componente individual.

**Caso verificado:** na p.26, `WEAPON / ARMOR / CORE / ACCESSORY / RELIC / CONSUMABLE` e `FRONT / BACK` estavam fora dos recortes das cartas. Viraram unidades PT-BR centralizadas acima de cada carta (`ARMA / ARMADURA / NÚCLEO / ACESSÓRIO / RELÍQUIA / CONSUMÍVEL`, `FRENTE / VERSO`). O conteúdo impresso nas cartas foi preservado em inglês.

**Também verificado na p.51:** o overlay amplo dos dez diagramas havia achatado junto as legendas editáveis `Example 5–10`; por isso essas seis legendas continuavam aparecendo em inglês apesar de serem unidades de texto. A comparação dos bboxes extraídos do PDF OG com o recorte comprovou que as legendas ficam sobre a arte, mas não são parte dela. Uma máscara alfa local foi aplicada somente às seis caixas de tinta medidas e a supressão de duplicata foi removida apenas desses seis spans. As legendas voltaram à camada de texto como `Exemplo 5–10`, mantendo moldura e tipografia fonte. `FLANKING`, `NOT FLANKING` e os demais textos realmente impressos nas setas permaneceram intactos. OG e Viewer EN conferem; Viewer e print PT-BR mostram as dez legendas em uma linha, sem clipping. O export PT-BR passou `pdfVerification=true`.

## Corpo de texto incompleto por fragmentação tipográfica

**Sintoma:** o título de uma seção está traduzido, mas o parágrafo seguinte permanece em inglês, aparece vazio ou não pode ser selecionado como unidade completa no editor. A fonte pode dividir o parágrafo em vários spans tipográficos que não representam unidades editoriais independentes.

**Como confirmar:** compare o fluxo de texto do PDF-fonte com os IDs/unidades expostos ao editor. Verifique se os fragmentos são consecutivos no mesmo parágrafo e se cobrem toda a largura/altura da coluna. Não classifique prosa comum como arte só porque ela compartilha o bloco-fonte com um título ou está dividida por tamanho/negrito.

**Correção aprovada:** exponha o parágrafo contínuo como uma unidade editável própria e mantenha separada a unidade do título. Preserve negrito/itálico e mudanças tipográficas como rich text dentro do corpo; não una conteúdo independente nem altere a arte-fonte. Grave a tradução completa e faça nova medição após o reparo estrutural.

**Copyfit obrigatório:** compare a quantidade e posição das linhas, largura máxima e limites verticais no Viewer e no PDF. O reparo do ID pode mudar qual moldura é aplicada e, portanto, mudar quebras mesmo quando o texto não muda.

**Caso verificado:** na p.26, o corpo abaixo de `HABILIDADES DE SÍMBOLO` foi exposto como unidade contínua própria, mantendo o título independente e a ênfase inline. O texto PT-BR ocupou 6 linhas; a linha mais larga mediu 295,45 pt no Viewer e 295,35 pt no print, dentro da moldura de aproximadamente 296,89 pt. Viewer e PDF exportado foram conferidos sem clipping ou colisão.

## Faixas coloridas não acompanham a largura dos rótulos localizados

**Sintoma:** rótulos editáveis sobre faixas coloridas ocupam uma largura diferente em PT-BR. Parte das letras pode sair da cor, faixas podem ficar visualmente desequilibradas e uma descrição que quebra pode avançar sobre a faixa seguinte.

**Como confirmar:** compare o PDF oficial, a caixa do rótulo, a faixa de cor e todas as linhas do texto descritivo. Separe a geometria do rótulo editável da pintura de fundo; não trate a faixa como parte do texto nem estique uma captura do idioma original.

**Correção aprovada:** preserve fonte, altura, cor e alinhamento dos rótulos. Ajuste a largura da faixa localmente à extensão real do nome traduzido, sem absorver a pontuação se a fonte a deixa fora da caixa. Preserve também o espaço medido entre o nome e os sinais seguintes. Reconstrua a faixa com pixels/artefatos retirados do fundo-fonte, mantendo bordas e padrão. Encurte uma descrição somente quando o copyfit produzir uma quebra que colida com a faixa ou desalinha a sequência. Meça de novo a altura total da seção e confira todos os rótulos e descrições no Viewer e no PDF.

**Caso verificado:** na p.27, as seis faixas de tipos foram ajustadas por overlay PT-BR local a partir da página-fonte. As palavras ficaram dentro das faixas; os dois-pontos pretos permanecem fora, com o espaço de cerca de 2,78 pt medido no PDF. A seção ocupou 11 linhas, sem colisão; os desenhos das cartas permaneceram intactos.

## Texto em box perde a cor da fonte

**Sintoma:** prosa ou legenda colocada sobre um box/cabeçalho escuro aparece com a cor padrão do corpo, embora no PDF oficial use branco ou outra cor específica. O contraste errado pode passar despercebido ao revisar só o conteúdo traduzido.

**Como confirmar:** compare os atributos dos rich spans fonte e destino, além do raster do PDF. Verifique se o fundo é arte de página ou box renderizado e se a cor do texto está explícita em cada unidade PT.

**Correção aprovada:** restaure localmente a cor e os pesos inline da fonte; não pinte uma área ampla por cima da arte nem altere o box inteiro. Reconfira as quebras, o contraste, os limites do frame e a paridade Viewer/PDF.

**Caso verificado:** na p.27, as duas legendas abaixo das cartas precisavam de texto branco, conforme o PDF-fonte. Os rich spans foram restaurados e as unidades medem 6 e 7 linhas, sem clipping no Viewer nem no PDF exportado.

**Também verificado na p.42:** o corpo do box `IMPORTANTE` usa Optima 10 pt na cor `#231f20` no PDF OG; uma revisão havia deixado esse corpo branco. A cor foi restaurada por span, mantendo o rótulo vermelho e a hierarquia em negrito. A unidade mede 2/2 linhas; Viewer e export final foram inspecionados contra a fonte, sem clipping ou colisão.


**Também verificado na p.49:** os dois boxes `IMPORTANTE` usam corpo Optima 10 pt `#231f20`, rótulo vermelho `#b91d23` com contorno branco e o símbolo semântico `tag.important.icon`. Uma primeira prévia havia herdado branco da coluna e perdeu contraste; a comparação com o OG detectou a diferença. A cor foi corrigida nos segmentos do corpo, sem alterar o box ou o ícone. Copyfit final: 6/6 e 2/2 linhas; Viewer e PDF exportado foram conferidos.
## Símbolo inline do PDF não aparece na camada de texto

**Sintoma:** uma regra menciona um ícone, mas o texto extraído não contém símbolo semântico e o Viewer omite o desenho, embora o PDF oficial mostre o ícone entre palavras.

**Como confirmar:** compare o raster e os objetos de desenho do PDF OG com as linhas e spans de `page_NNN_dom.json`, o sidecar `inline_elements.json` e as capturas EN/PT-BR. Inspecione também as caixas antes/depois do símbolo; ausência de `[[symbol]]` no texto extraído não prova que a fonte não tenha um ícone.

**Correção aprovada:** associe o desenho-fonte a um `symbolId` semântico em `inline_elements.json`, ancore-o ao span/linha fonte, registre a caixa, os objetos do PDF e o hash da fonte, e use uma máscara local derivada do próprio PDF. Não reconstrua a página inteira nem altere a arte de cartas. Confirme EN e PT-BR contra o OG e verifique que o símbolo aparece uma vez, sem clipping ou deslocamento.

**Espaçamento:** não há uma margem fixa universal entre texto e `[[symbol]]`. Na p.43, a caixa do ícone começa exatamente no fim do span que contém o espaço final (`having both the `); o span seguinte começa no fim do ícone e conserva o espaço inicial (` Icon and `). O segundo ícone segue o mesmo padrão. Portanto, preserve os espaços literais e a âncora do texto-fonte; não acrescente margem automática sem medir o caso no PDF.

**Caso verificado:** na p.43, dois ícones (`attack.ranged` e `attack.melee`) estavam desenhados no OG entre “having both the” e “Icon and”, mas não eram renderizados pelo EN. Foram recuperados com máscaras locais e âncoras nos spans fonte. Viewer EN e exportação EN passaram `pdfVerification`; a PT publicada e a exportação final também mostram os ícones nos lugares correspondentes.

**Também verificado na p.45:** os dois ícones `stat.defense` começam no fim do espaço literal antes do rótulo; a fonte registra `gapPt: 0`, avanço de 1,0651 em e o segmento seguinte conserva um espaço literal. A tradução mantém esse espaço antes e depois dos objetos inline; não acrescentamos margem automática. Os ícones acompanham “Valor de Defesa” no fluxo e a unidade continua EXACT 5/5 linhas.

**Também verificado na p.52:** nove ocorrências de `dice.black` vinham sem o espaço tipográfico literal que a fonte mantém entre `PRETO` e o ícone. O PDF separa esse espaço em um run Optima regular de 9 pt; os `gapPt` residuais de aproximadamente 0,361 pt (Esquiva) e 0,524 pt (Fortalecer) não substituem esse run. A correção inseriu um segmento de espaço local antes de cada ícone, sem margem CSS global. As cinco unidades afetadas ficaram em 3/3, 3/3, 5/5, 3/3 e 4/4 linhas no Viewer e no print; os dois `combat.page` da regra de Feitiço mantiveram seus espaços textuais originais. EN, OG, PT-BR e export final foram conferidos.

## Copyfit EXACT não garante semântica nem cobertura da página

**Sintoma:** uma unidade pode ter a mesma quantidade de linhas da fonte e ainda repetir ou contradizer uma regra; um parágrafo inteiro também pode ficar fora do conjunto de revisão sem que as unidades existentes mostrem erro de copyfit.

**Como confirmar:** compare o inventário de unidades editoriais do PDF/DOM com as chaves da proposta e as traduções persistidas no Payload. Depois compare a sequência de ações e condições entre EN e PT-BR, incluindo rich text e símbolos. `EXACT` classifica somente a contagem de linhas medida; não prova tradução correta nem cobertura completa.

**Correção aprovada:** resolva a redação contra o texto-fonte e o glossário, crie a unidade editável que estiver faltando, preserve versões anteriores no histórico oficial e só então repita o copyfit e a exportação Viewer/PDF. A cobertura deve usar todas as unidades relevantes da fonte como denominador.

**Caso verificado:** na p.52, a proposta inicial tinha 15 unidades e omitia o parágrafo que ensina a Fortalecer um Feitiço. A regra de Armas havia sido aprovada como EXACT apesar de repetir cláusulas de forma contraditória. A revisão passou a 16 unidades; o parágrafo faltante foi traduzido com os dois `combat.page`, e a regra de Armas foi reescrita. As 16 unidades estão aprovadas no Payload como EXACT, com linhas do PDF-fonte iguais às do Viewer e do print; os exports EN/PT-BR passaram `pdfVerification`.

## Ornamento vetorial do cabeçalho some ou troca de cor

**Sintoma:** um arabesco aparece com a cor errada ou desaparece no Viewer/PDF, embora o título e a linha do cabeçalho estejam presentes. Isso pode ocorrer quando o fundo raster contém uma variação colorida do ornamento, enquanto o PDF OG pinta um vetor claro por cima.

**Como confirmar:** compare o recorte do PDF OG com o fundo servido e com `get_drawings()` da mesma página-fonte. Associe cada vetor ao seu bbox e cor; verifique se título e linha são objetos separados e não devem ser cobertos pelo recorte.

**Correção aprovada:** restaure somente os caminhos vetoriais confirmados como SVG/arte transparente local, com bbox exato em `fidelity_overlays.json`, `sourcePdfPage`, `auditId` e `languageInvariant` quando o ornamento for compartilhado entre idiomas. Não aplique uma troca global de cor nem um recorte opaco que esconda o título ou conteúdo editável. Confira EN, PT-BR e PDF exportado contra o OG.

**Caso verificado:** na p.46, os arabescos laterais de `ENCOUNTER ACTIONS` eram dois desenhos brancos no PDF OG, mas a rasterização de fundo mostrava curvas verde-limão. Cada desenho contém 60 segmentos Bézier e foi reconstruído em um SVG transparente no bbox do próprio desenho; título e linha ficaram separados. As duas curvas agora correspondem ao OG no Viewer e nos PDFs EN/PT-BR.

## Contorno de texto some no número da página

**Sintoma:** o número aparece preenchido em uma cor escura, embora o PDF OG mostre um contorno dourado claro ao redor do preenchimento escuro.

**Como confirmar:** inspecione a sequência de pintura do PDF, não apenas a extração de texto. `get_texttrace()` pode expor uma passagem `stroke-text` e outra `fill-text` no mesmo bbox; registre a cor e a espessura do contorno. Se o DOM guardar as duas como texto preenchido, a passagem dourada será coberta pela escura.

**Correção aprovada:** marque a passagem dourada como `renderOnlyStrokePass` para não pintá-la como preenchimento e aplique sua cor/espessura ao span escuro (`renderTextStrokeColor`, `renderTextStrokeWidthPt`) com ordem `stroke fill`. Preserve passagens duplicadas somente quando a própria fonte confirmar múltiplas pinturas. Faça comparação local no Viewer e no PDF; não aplique a outros textos sem evidência de traço equivalente.

**Caso verificado:** números 44, 45 e 46 usam Optima ExtraBlack 10 pt, traço `#fff574` de 1,5 pt e preenchimento `#231f20`. A p.44 contém duas passagens sobrepostas confirmadas na fonte; as pp.45–46 contêm uma cada. A reconstrução local preserva cada empilhamento, e os números voltaram a exibir o contorno no Viewer e nos PDFs EN/PT-BR.

## Título e corpo compartilham um bloco com campos tipográficos diferentes

**Sintoma:** traduzir o bloco inteiro deixa fragmentos em inglês sobrepostos à tradução, ou traduzir um subspan isolado deixa partes do parágrafo sem substituição.

**Como confirmar:** compare a sequência completa do PDF OG com os campos editáveis do renderer. Quando título e corpo pertencem ao mesmo bloco mas usam tamanhos ou estilos diferentes, verifique a unidade tipográfica de cada campo; não suponha que cada fragmento visual seja uma unidade editorial independente.

**Correção aprovada:** substitua cada campo tipográfico completo como unidade separada (`typographicUnits` no caso abaixo), preservando rich text, tamanho e ênfase próprios. Evite substituir o bloco-pai ou apenas um fragmento que não cubra o campo inteiro. Depois de alterar os IDs de unidade, refaça o copyfit e inspecione a camada sobre o PDF.

**Caso verificado:** na p.43, “Sphere of Influence (SOI)” e “Line of Sight” compartilhavam blocos com seus parágrafos, em tamanhos diferentes. A primeira prévia deixou fragmentos-fonte visíveis; ao mapear os campos tipográficos completos separadamente, a sobreposição desapareceu. As quatro unidades finais mantêm a contagem de linhas da fonte e aparecem limpas no Viewer e no PDF exportado.


## Override inline encolhe entre trechos-fonte vizinhos

**Sintoma:** um parágrafo traduzido é desenhado a partir do primeiro span de uma linha, mas a fonte divide essa mesma linha em runs seguintes (por exemplo, um número em negrito e outro trecho regular). A tradução quebra perto da largura do primeiro run, apesar de a coluna oferecer um corredor maior; as linhas vazias da fonte podem deixar buracos ou empurrar o item seguinte.

**Como confirmar:** compare os `spanRefs` da unidade e a ordem dos runs da linha no DOM com o PDF OG. Meça a origem do primeiro span, o X do corpo do parágrafo, o limite da coluna e os avanços dos irmãos na mesma linha. No PageRenderer, confirme se o elemento traduzido está sendo reduzido por `flex-shrink`; uma linha visível curta, sozinha, não prova que a moldura seja estreita.

**Correção aprovada:** grave uma moldura `layout-frames` específica do idioma PT-BR, ancorada no X do corpo e limitada ao corredor livre até a coluna vizinha. Preserve marcador, recuo, Y, tipografia e hierarquia; a moldura deve impedir que o span traduzido encolha por causa dos runs-fonte seguintes. Para molduras canônicas, use `layoutFrameTotal(frame)` como largura física: `frame.width` pode ser X₂, não o tamanho. Não alargue a caixa em inglês nem altere a geometria-fonte.

**Copyfit obrigatório:** reescreva o texto para igualar as linhas visuais do PDF-fonte dentro do corredor aprovado. Compare linhas, continuações, distância até o próximo item, clipping, colisões e borda da coluna no Viewer e no print. Se o recuo ou a moldura criar uma quebra ruim, refraseie antes de reduzir a fonte. Aplique essa correção a outra ocorrência somente depois de confirmar a mesma estrutura.

**Caso verificado:** na p.47, o primeiro bullet de `IMPORTANT ABILITY RULES` tinha o corpo disponível em X=104,173 pt até X=404,453 pt (300,28 pt), mas o span ocupava o mesmo flex row que o `1` em negrito e o trecho seguinte. A moldura PT-BR id 75 usa o corredor de 300,28 pt; o PageRenderer passou a usar a largura física `total` da moldura canônica. O texto ficou em 3/3 linhas, mantendo o bullet e as continuações alinhados ao corpo; as outras seis unidades do bloco também igualaram as linhas fonte. Viewer e PDF EN/PT-BR foram comparados ao OG e não mostram clipping nem invasão da coluna vizinha.
