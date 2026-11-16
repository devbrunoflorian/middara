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

**Caso verificado:** na p.61, o `tag.passive.icon` da legenda é uma ocorrência semântica inline em texto de 9 pt. A comparação da tinta com o PDF OG mediu cerca de 1,58 pt de espaço à direita (aprox. 0,175 em); dimensões e baseline também foram preservadas. Esse valor pertence à ocorrência p.61 e não deve ser aplicado aos outros usos de `tag.passive`.

## Tamanho ou cor de uma fonte diverge do PDF OG

**Sintoma:** um rich-text parece visualmente próximo, mas usa outro tamanho, peso, itálico ou cor em relação ao span correspondente no PDF oficial.

**Como confirmar:** compare os spans reais do PDF (família, tamanho em pontos, cor, peso/itálico e contorno, quando houver) com cada segmento rich-text da unidade. Mantenha separados o preenchimento da letra, os traços e os elementos decorativos; não use uma captura ampliada como medida de tamanho nem classifique uma reconstrução semântica como divergência sem conferir sua aparência final.

**Verificação obrigatória durante a tradução:** ao redigir ou revisar cada unidade, associe cada trecho em negrito ou itálico do OG à frase correspondente em PT-BR. A redação pode mudar, mas a ênfase não deve sumir nem se espalhar para palavras vizinhas. Confira segmentos rich-text, raster OG, Viewer e PDF; não deixe essa checagem para uma auditoria posterior. Para títulos, valide também tamanho, cor, família e a âncora de alinhamento.

**Checklist obrigatório por página:** enquanto avança unidade a unidade e novamente antes de encerrar a página, compare os runs de negrito/itálico com o OG e confira cada título pelo eixo correspondente ao alinhamento-fonte: início X para títulos à esquerda, centro da tinta/eixo para títulos centralizados e borda final para títulos à direita. Não use um X fixo como padrão universal nem confira apenas a largura da moldura; meça a âncora real do OG (em alguns títulos, perto de X=112 pt). Registre família, peso, tamanho e cor. Se texto, frame, recuo ou estilo mudar, repita Copyfit e confira Viewer/PDF. Uma tradução aprovada antes não dispensa comparar a página visivelmente com o OG.

**Autoridade visual:** metadados extraídos do PDF (nome de fonte, flags ou pesos dos spans) não bastam quando divergem da aparência renderizada. Compare o raster do PDF OG diretamente ao Viewer e ao PDF PT-BR final; consulte também `renderWeightOverride`/estilos-fonte do PageRenderer. Quando a extração diz regular, mas o OG renderizado está visivelmente em negrito, preserve o negrito visual e registre a divergência da extração. Não declare fidelidade com base apenas na família nominal ou num screenshot ampliado.

**Auditoria técnica na p.56 (página ainda não certificada):** no exemplo `page_56_block_11`, a formulação PT-BR ocupava 3 linhas contra 2 no OG. O texto foi encurtado sem reduzir a fonte e passou a 2/2 linhas em 100% e 200%; `Exemplo:` e os números 2 e 4 mantêm o negrito do OG. Os 21 candidatos da página estão EXACT no Copyfit V3 em ambos os zooms. O título `Combatentes` mantém Cinzel 30 pt, cor `#231f20` e o centro do eixo OG (diferença medida inferior a 0,15 pt). Esta medição é do PageRenderer de proposta; a conferência da página inteira e do PDF exportado continua pendente.

**Também verificado na p.55:** a auditoria das 14 unidades encontrou `Spell-Like Ability's` em negrito itálico no OG, mas `Habilidade Semelhante a Feitiços` estava em peso regular e sem itálico. O estilo foi restaurado no rich-text; o bloco permaneceu em 2/2 linhas em 100% e 200%. Os runs de ênfase restantes foram conferidos contra a fonte, inclusive valores numéricos e o itálico de `Great Hammer`/`Paralyze`; Viewer e PDF final confirmam a correção. A prosa editável ficou localizada, enquanto o texto impresso da carta continua em inglês por decisão do usuário.

**Correção aprovada:** ajuste somente os segmentos divergentes para as medidas da fonte e repita o copyfit. Confira o resultado no Viewer e no PDF exportado, incluindo caixas, símbolos, clipping e colisões. Uma conferência local não certifica conversão global de perfis CMYK/sRGB nem outras páginas.

**Caso verificado:** na p.38, as 35 unidades editoriais foram comparadas ao PDF OG. Três runs de `SP` em `page_38_block_9__pt-BR` estavam em Optima Bold 10 pt, enquanto a fonte usa 9 pt; o tamanho foi corrigido e o bloco manteve 7/7 linhas. As cores e demais estilos de texto coincidem com a fonte. Os únicos conjuntos de estilo diferentes são os dois callouts `IMPORTANTE`: o original usa glifo decorativo branco e letras com tratamento de contorno; o Viewer reconstrói o raio como símbolo semântico e aplica preenchimento vermelho com contorno branco, preservando o desenho visível.

**Caso verificado:** na p.39, 22 unidades e 124 spans de texto do PDF foram comparados por família, tamanho, cor, peso e itálico; não houve falhas de associação geométrica nem divergência de estilo no rich-text final. Um draft deixava `Derrotaria` em Optima Bold 10 pt, embora o OG use Optima regular 10 pt em `#231f20`; o peso foi restaurado. O título `Espaços Adjacentes` mantém Cinzel-Regular 18 pt, branco, peso 700, igual ao cabeçalho OG. A comparação local não certifica a conversão global CMYK/sRGB.

**Também verificado na p.46:** o rótulo `IMPORTANTE:` do box inferior estava em preto. O OG usa `#b91d23` com traço branco de 2 pt; o segmento foi corrigido sem mexer no corpo escuro, no símbolo nem na caixa. A unidade permaneceu em 2/2 linhas. A tradução (#669) e a publicação da revisão (#802) divergiam; a revisão foi sincronizada pelo endpoint canônico e a cor anterior ficou em `publication.history`. Viewer e PDF exportado atuais foram conferidos contra o OG, com `pdfVerification=true`.

**Também verificado na p.57:** a comparação direta dos rasters OG/PT revelou que os títulos `Saque Único:`, `Saque de Monstro:`, `Saque de Item:` e `Combatentes com o Mesmo Nome` estavam visualmente leves demais no PT-BR. A extração registra Cinzel-Regular 12 pt, mas a aparência do OG e o `renderWeightOverride: 700` confirmam o peso visual; restaurei `weight: 700`, sem alterar família, tamanho, cor, texto ou âncoras. As âncoras esquerdas PT coincidem com OG: X=421,842 pt, 416,173 pt, 416,173 pt e 86,173 pt. O X≈112 pt observado em outros títulos continua sendo apenas uma medida local, não uma regra global. Os quatro cabeçalhos ficaram EXACT 1/1 em 100% e 200%. No corpo de `Saque de Item`, `BRANCOS` (8,8477 pt) e `LVL` (9 pt) mantêm o negrito do OG; `LVL` permanece sigla conforme glossário, e `dice.white` foi preservado. Esse bloco ficou EXACT 4/4 nos dois zooms. Também foi traduzido o parágrafo de abertura dos Ícones Compartilhados; os rótulos `INTELLIGENT` e `COMMAND` ficaram em inglês com cores, contorno e peso do OG, e o parágrafo manteve 4/4 linhas. A primeira correção baseada apenas no nome de fonte foi rejeitada após o raster mostrar a diferença; a revisão visual corrigida foi publicada com históricos anteriores preservados. Viewer e PDF final foram conferidos. Na primeira passagem, a página ainda não estava certificada porque a seção Saque Único aguardava tradução; o status abaixo registra o fechamento dessa pendência.

**Fechamento verificado da p.57 (2026-11-15):** a prosa editável restante de Saque Único foi publicada nas traduções #1990–1995 / reviews #1680–1685; Copyfit V3 EXACT por unidade (3/3, 5/5, 3/3, 2/2, 7/7 e 2/2 linhas). A comparação completa OG/Viewer/print confirmou os quatro cabeçalhos com peso 700 e âncoras alinhadas, runs de ênfase correspondentes, símbolo semântico no callout, ausência de clipping/colisões visíveis e fólio 57. A exportação v4 tem 48 line rects no Viewer e no print, 4 símbolos e 12 imagens; verifiedTranslationRecords=true e pdfVerification=true. Payload: 31 traduções, 27 reviews ativas aprovadas EXACT e quatro supersedidas arquivadas EXACT; não há exceção aberta na fila para a p.57. Toda a prosa editável da página está em PT-BR. A arte de cartas e os rótulos impressos nela permanecem em inglês por decisão do usuário. Ver recibos em page-057-unique-loot-rules-2026-11-15-v1.json e o relatório de progresso.

**Também verificado na p.77:** os três parágrafos PT-BR no painel marrom tinham `#231f20`, mas os blocos-fonte correspondentes usam branco (`0xffffff`). Corrigi somente a cor dos segmentos nos registros 1480–1482 para `#FFFFFF`, preservando texto, runs, tamanho Optima 10 pt e frames. As unidades mantiveram 5/5, 8/8 e 7/7 linhas; a exportação final mostra contraste correspondente ao OG e passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Backup anterior: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-bullet-audit\p077-colors-before-fix.json`.


**Diferença de renderização observada na p.49 (ainda sem causa isolada):** runs regulares do OG e do Viewer usam OptimaLTStd 10 pt; os segmentos medidos no Viewer declaram peso 400, mas o raster do Viewer aparenta corpo mais pesado que o raster do PDF OG, tanto em EN quanto em PT-BR. A tradução mantém tamanho, peso e cor registrados na fonte; não compense localmente com peso menor. Mantenha a fidelidade de peso em aberto até comparar o programa de fonte usado no PDF, os arquivos locais e a rasterização do renderer.

## Título PT-BR fica à esquerda apesar de o título OG ser centralizado

**Sintoma:** o título traduzido começa no X esquerdo da moldura e perde o eixo central do cabeçalho, embora a moldura tenha sido ampliada para caber a tradução.

**Como confirmar:** use o ID do bloco-fonte para localizar o sidecar e o `textAlign` salvo na tradução. O ID de origem pode diferir do índice usado pelo `spanKey` do editor; confira qual campo o loader realmente usa. Compare o centro da tinta do título OG, o centro da moldura PT-BR e a regra de precedência entre `translation.textAlign` e `layoutFrame.textAlign`.

**Correção aprovada:** preserve uma moldura local PT-BR que caiba o título e mantenha seu centro no eixo do OG; grave também `textAlign: center` nos dados ricos quando um `textAlign: left` explícito da tradução sobrepuser a moldura. Não mude o alinhamento global nem a geometria-fonte EN. Meça novamente o copyfit, confira Viewer e PDF PT-BR e confirme que o título EN continua em geometria-fonte.

**Caso verificado:** na p.54, `Conjurar Feitiços` herdava `textAlign: left`, apesar de o OG centralizar `Casting Spells`. O `spanKey` PT-BR usa `block_42`, mas `layout_frames.json` associa o frame ao ID-fonte `block_158`; uma tentativa com a chave errada não chegou ao renderer e foi descartada. O frame PT-BR final vai de X=84,972 a 730,473 pt, centralizado no mesmo eixo do OG (X=407,722 pt); o centro medido do texto exportado ficou a 0,01 pt desse eixo. A tradução agora usa alinhamento central, mantém Cinzel 18 pt, peso 700 e branco, e mede 1/1 linha. EN/PT-BR foram exportados contra o PDF oficial e a página PT-BR passou `pdfVerification=true`.

**Também verificado na p.55:** o título `Usando Habilidades Semelhantes a Feitiços` está centralizado no eixo OG X=409,772 pt, com moldura PT-BR X=120 pt, largura=579,543 pt e `textAlign: center`. Cinzel 18 pt, peso 700 e branco foram preservados; Copyfit ficou em 1/1 linha em 100% e 200%. O export EN/PT-BR confirmou o mesmo eixo no Viewer e no PDF; ambos passaram `pdfVerification=true`.

**Também verificado na p.59:** o subtítulo `Ex. 1: Combatente de Comando` mantinha a fonte, o peso, o tamanho e a cor do OG, mas `textAlign: left` deixava a versão curta deslocada. A linha-fonte está centrada em X=410,173 pt. Aplicar `textAlign: center` dentro da mesma bbox centralizou o texto exportado em X=410,231 pt (diferença de 0,057 pt), sem mexer na geometria EN; Copyfit V3 ficou EXACT 1/1 em 100% e 200%.

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

**Rechecado na p.19 (2026-11-15):** o exemplo subordinado ao bullet está em X=104,165 pt no PT-BR e X=104,173 pt no OG (diferença de 0,008 pt). As continuações permanecem no mesmo X do texto do exemplo. O corpo dos bullets começa em X=104,173 pt; o marcador fica 18 pt à esquerda. Viewer e print atuais mantêm essa hierarquia.

**Revalidado na p.18 (2026-11-15):** no item numerado 4, o marcador está em X=86,17 pt e o corpo/continuação em X=104,17 pt (18 pt). A versão PT-BR atual ocupa 2 linhas, igual à fonte; “38.” permanece na segunda linha e o parágrafo seguinte não colide. Viewer e PDF exportado confirmam o recuo. O alerta antigo de 3/2 linhas descreve uma versão anterior; a review #27, embora aprovada, ainda não foi sincronizada com a tradução atual #331.

**Também conferido na p.53:** o marcador de cada bullet é desenhado numa coluna de recuo separada; por isso, o `textContent` do DOM pode expor `•Itens` sem um espaço literal, embora a distância visual do corpo esteja correta. Normalize o separador somente na comparação de texto da validação de exportação; não insira um espaço no conteúdo PT-BR sem que ele exista na fonte. Viewer e print mantiveram os bullets e as continuações alinhados.

## Continuação de item de lista após quebra de bloco-fonte perde recuo

**Sintoma:** um bloco-fonte termina no meio de um item de lista e o seguinte começa com texto sem marcador. No PT-BR, esse primeiro parágrafo pode voltar ao X da margem/marcador, mesmo que o restante dos bullets use o recuo suspenso corretamente.

**Como confirmar:** no PDF OG, verifique se o trecho inicial continua o item anterior e meça seu X em relação ao X do marcador e do corpo. Depois compare o primeiro parágrafo do bloco PT-BR e as linhas seguintes no Viewer/PDF. Não mova a moldura inteira se o mesmo bloco também contém novos bullets.

**Correção aprovada:** registre o recuo medido apenas para o índice do parágrafo de continuação em `flowParagraphIndentsPt` no sidecar da página. Deixe os marcadores e os parágrafos de novos itens no fluxo original. Refaça copyfit porque o recuo reduz a largura disponível; confira o texto e as continuações depois de salvar/recarregar e exportar.

**Caso verificado na p.77 (2026-11-15):** o primeiro parágrafo de `block_199` continua o item que começa em `block_198`. O corpo-fonte está em X=103,71 pt e a margem/marcador em X=85,71 pt. O PT-BR começava essa continuação em X=85,70 pt; `flowParagraphIndentsPt: { "0": 18 }` corrigiu somente o primeiro parágrafo. Ele continua em uma linha; os 11 bullets seguintes mantêm marcadores em X=85,70 pt e corpo/continuações em X=103,69 pt. A unidade preservou 32 linhas; Viewer e PDF exportado coincidem e passaram `verifiedTranslationRecords=true` e `pdfVerification=true`. Evidências privadas: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-bullet-audit\p077-indent-fix-*`.

## Corpo de item numerado perde o recuo suspenso

**Sintoma:** depois de traduzir ou aplicar uma moldura local, o primeiro trecho do corpo começa junto ao número/bullet, e as linhas seguintes voltam à margem do marcador. A lista parece desalinhada mesmo quando o texto cabe na página.

**Como confirmar:** no PDF OG, meça separadamente o X do marcador e o X do texto do item. Compare também o bbox do texto impresso com `field.frame`/moldura aplicado pelo renderer: o frame fonte pode começar na coluna do marcador, embora o corpo tenha um inset próprio. Confira no Viewer PT-BR e no PDF exportado se o marcador continua em sua camada e se cada continuação usa o X do corpo.

**Correção aprovada:** salve uma moldura PT-BR com o início do corpo no X real da fonte, mantendo a borda da coluna quando couber. Mova o marcador de modo independente usando `listMarkerIndentPt`; valores negativos são válidos quando o marcador deve ficar à esquerda da moldura, e valores positivos quando precisa avançar. Não mude a geometria EN nem aplique o deslocamento a outras listas sem comprovar a mesma estrutura.

Quando o número e o início do texto compartilham a primeira linha-fonte, mas as continuações começam em outro X, confira se a extração reconheceu o recuo. Se não reconheceu, salve `listMarkerIndentPt` e `hangingIndentPt` só nessa tradução, medidos a partir do X da moldura. Isso ativa o fluxo numerado e mantém o marcador separado do corpo; preserve a moldura e os runs ricos quando eles já correspondem à fonte. Não deduza 18 pt por padrão: meça a distância OG em cada caso.

**Copyfit obrigatório após o recuo:** a redução de largura pode criar quebras e colisões verticais. Refaça a medição, preserve os estilos e símbolos ricos e só então ajuste localmente o texto ou a largura disponível. Compare a quantidade/posição de linhas, excesso das bordas, distância até o item seguinte, Viewer e print em 100%/200%.

**Casos verificados:** na p.24, as molduras dos oito itens foram alinhadas ao corpo; os marcadores das duas colunas foram movidos separadamente. O primeiro item e Armadura ficaram em 2 linhas cada; os demais, em 1 linha. Na p.41, seis unidades tiveram o frame deslocado em 14,17 pt até o X do corpo-fonte; com o copyfit, ficaram em 2/2, 4/4, 3/3, 4/4, 3/3 e 4/4 linhas. Viewer e PDF final foram comparados ao OG sem colisões; a linha mais larga recebeu 1,5 pt de largura adicional para remover o excesso medido de 0,48 pt.

**Também verificado na p.56 (2026-11-15):** os blocos 12 e 13 imprimem `1.`/`2.` e texto na mesma primeira linha, mas têm continuações fonte 18 pt à direita. Como o marcador inline não fornecia indentação automática ao renderer, as traduções 796 e 1247 receberam `listMarkerIndentPt: 0` e `hangingIndentPt: 18`. Viewer e print mantêm 3/3 linhas; X do marcador = 86,17 pt e X das continuações = 104,17/104,16 pt, contra 86,17/104,17 pt no OG. A entrelinha print local foi calibrada para 1,13: o excesso inferior caiu de 2,31 pt para 0,15 pt, sem colisão com o texto seguinte. `verifiedTranslationRecords` e `pdfVerification` passaram. Evidências privadas: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-bullet-audit\`.

## Marcador se desloca quando a moldura PT-BR é salva

**Sintoma:** a prévia de revisão mostra o marcador no X do PDF e o texto no início do corpo, mas, depois de salvar a moldura, o marcador pula para junto do corpo ou fica sobre a primeira palavra. O caso aparece quando o PDF extrai o marcador e o corpo como linhas-fonte separadas na mesma linha visual.

**Como confirmar:** confira no PDF oficial o X da tinta do marcador, o X do primeiro glifo do corpo e o baseline. No Viewer, verifique separadamente a moldura PT-BR salva, a linha do marcador (`data-list-marker-line`) e o início real do texto. Uma prévia correta no Reviewer não prova que a moldura persistida use a mesma âncora. Não use o X da caixa total do bloco como X do corpo.

**Correção reutilizável:** salve a moldura traduzida com o corpo no X-fonte do texto e largura até a borda segura da coluna. A linha do marcador deve permanecer ancorada no X original do PDF; mudanças intencionais no X do marcador são feitas separadamente por `listMarkerIndentPt`. Depois do save/reload, confira primeira linha e continuações, recalcule copyfit e exporte Viewer e PDF. Valide também uma lista de outra coluna antes de tratar a regra como comum; não deslocar a moldura inteira para o X do bullet.

**Caso verificado nas pp.86–87 (2026-11-15):** na p.86, o PDF coloca marcadores em X=86,17 pt e o corpo em X=104,17 pt. Seis molduras persistidas haviam sido salvas no X do marcador; isso anulava a separação correta que a prévia de revisão mostrava. O renderer agora mantém o marcador na âncora fonte ao mover a moldura PT. As seis molduras usam X=104,17 pt, largura 302,83 pt e borda direita X=407,00 pt; bullets/continuações voltaram ao recuo de 18 pt. Os itens mantêm as linhas medidas no Copyfit V3 (o primeiro item 2/2; os outros alvos 1/1), sem colisão visível no Viewer nem no print. Reexportei a p.87 como contraexemplo de coluna direita: os marcadores permanecem no X da fonte (415,61 pt), os corpos no X=433,61 pt, e os 27 retângulos de linha continuam sem colisão. Evidências privadas: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-bullet-audit\p086-anchor-fix-*` e `p087-anchor-fix-*`.

## Item de lista traduzido invade o item seguinte

**Sintoma:** um item que ocupa uma linha no PDF passa para duas em PT-BR, mas a moldura continua com a altura fonte e o próximo item conserva a posição original. O texto pode invadir a linha seguinte mesmo que não ultrapasse a página.

**Correção aprovada:** meça as linhas reais e aumente apenas a moldura PT-BR até cobrir o conteúdo. Reposicione os itens seguintes e o parágrafo livre usando as caixas medidas; mantenha a arte e os callouts na posição fonte. Preserve a redação e o tamanho tipográfico quando couberem com esse reflow. Repita o copyfit e confira a área disponível antes do próximo box.

**Caso verificado:** na p.24, “1 ARMADURA + 1 Aprimoramento de Armadura” ocupa duas linhas, como pede o português. A moldura PT cresceu para 22,92 pt; os itens seguintes e o parágrafo abaixo foram deslocados para evitar colisão. A redação e a arte dos quadros foram preservadas. Viewer e PDF exportado ficaram sem sobreposição; a unidade mede duas linhas nos dois. Na mesma página, cada marcador foi ajustado independentemente do frame do corpo, para evitar sobreposição e manter o alinhamento das continuações.

**Também verificado na p.27:** medir cada linha da lista separadamente. Os seis itens ficaram em 3/3, 3/3, 1/1, 2/2, 1/1 e 1/1 linhas fonte/PT. O primeiro item mantinha 3 linhas, mas excedia o frame em 2,62 pt; uma revisão curta preservou a regra e a paridade. A maior linha final mede 286,86 pt num frame de 292,38 pt, sem escape horizontal ou colisão no Viewer/print.

**Também verificado na p.87:** as molduras fonte de uma coluna em duas colunas começam em X=415,61 pt, mas os rótulos da lista e os corpos começam em X=433,61 pt. As molduras PT-BR dos blocos 10–20 haviam usado o X da coluna do marcador, comprimindo o corredor e somando quebras. Corrigi as 11 molduras locais para X do corpo (433,61 pt), mantendo a borda direita-fonte X=736,45 pt. Comparei cada primeira linha e continuação com o OG e recoloquei o Y de cada frame para alinhar a primeira linha ao texto-fonte (diferença Viewer <0,02 pt; print <0,13 pt). Os itens agora medem 2, 3, 3, 4, 4, 5, 3, 2, 1, 8 e 2 linhas, igual ao OG. Os três antigos OVER (blocos 10/18/19) foram refraseados sem remover regra, condição ou rich text; Copyfit V3 passou EXACT a 100% e 200%. Reviews existentes 590/598/599 e traduções 1873/1874/1875 foram atualizadas pelo fluxo oficial; os textos anteriores estão em `publication.history`. Viewer e PDF exibem 27 retângulos de linha, sem colisão nem invasão do fólio; `verifiedTranslationRecords=true` e `pdfVerification=true`. A p.87 ainda não está certificada integralmente. Evidências privadas: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-bullet-audit\`.

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

**Também verificado na p.48:** três caixas PT-BR ultrapassavam a largura salva sem mudar o número de linhas. Ampliei somente as molduras locais: bloco 12 para 312,224 pt, bloco 24 para 294,321 pt e bloco 34 para 287,786 pt (Payload ids 103, 105 e 104). As unidades continuam em 7/7, 4/4 e 6/6 linhas; Viewer e print ficaram sem excesso horizontal. A ampliação do bloco 24 foi limitada ao espaço disponível dentro do box, sem alterar símbolos ou redação.

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

## Símbolo duplicado entre a arte-fonte e o token traduzido

**Sintoma:** um ícone aparece duas vezes lado a lado em uma legenda traduzida, embora o PDF OG mostre somente uma ocorrência.

**Como confirmar:** siga as camadas separadamente: confira a arte do PDF OG; veja se o `background.webp` ainda contém o ícone; inspecione `inline_elements.json` para confirmar um elemento semântico, sua máscara de limpeza e a âncora; depois procure `symbolId` correspondente nos segmentos da tradução PT-BR. Conte as instâncias `svg[data-symbol-id]` no Viewer e no print/PDF. Uma máscara pode apagar a tinta do fundo e o sidecar pode repor o símbolo original, enquanto um token adicional na tradução continua pintando uma segunda cópia.

**Correção aprovada:** escolha uma única camada proprietária do desenho. Quando o sidecar já repõe o símbolo semântico na coordenada e com a geometria do OG, mantenha a máscara e o sidecar e remova somente o token repetido dos segmentos PT-BR. Preserve o bbox do texto traduzido no bbox fonte do rótulo; isso mantém a distância real entre ícone e palavra. Deixe `managedSourceSymbols` vazio para que o overlay semântico da fonte continue ativo. Se a tradução precisar ser proprietária do símbolo, suprima explicitamente a instância semântica original e valide a nova âncora antes de aplicar essa alternativa.

**Copyfit e conferência de aceite:** verifique se cada ícone aparece uma vez, compare a lacuna entre símbolo e texto com a fonte, confirme a linha e os limites do rótulo, e inspecione Viewer e PDF exportado. Não ajuste `gap` global nem altere a máscara sem evidência geométrica.

**Caso verificado:** na p.21, cinco rótulos PT-BR continham um token de símbolo embora `inline_elements.json` já renderizasse os mesmos cinco símbolos. Removemos os tokens redundantes nos registros 691, 592, 693, 593 e 692, mantendo as palavras e seus bboxes. Cada `terrain.*.icon` aparece uma vez no Viewer e no print; os cinco rótulos ficaram em 1/1 linha, sem excesso de borda. As lacunas entre tinta do símbolo e começo do texto no OG são 2,797 pt (Difícil), 1,464 pt (Água), 1,381 pt (Lodo), 2,438 pt (Perigoso) e 2,556 pt (Especial); a âncora e o bbox-fonte preservam essas relações. A p.23 já usa o padrão de ícone semântico mais rótulo textual e serviu como comparação estrutural. Export final passou `pdfVerification=true`.

## Token semântico troca o idioma do rótulo impresso

**Sintoma:** o desenho e a tradução da prosa estão corretos, mas um token semântico reproduz o rótulo em PT-BR mesmo quando o PDF OG imprime esse rótulo em inglês. Recriar o glifo e a palavra como texto pode, por outro lado, perder a cápsula, a geometria ou o símbolo.

**Como confirmar:** compare o token visível completo (fundo, ícone, texto e orientação) com o PDF OG; confira `symbolId`, a variante da ocorrência em `compound_elements.json` e o idioma da aparência SVG. Não presuma que a variante tipográfica da fonte preserve automaticamente a língua impressa. Separe rótulo de arte/componente de prosa de regra editável.

**Correção aprovada:** use um único símbolo semântico com as métricas da ocorrência-fonte e selecione `renderLanguage` apenas nessa ocorrência quando a arte pedir inglês. Não substitua a cápsula por glifo literal nem aplique a escolha a toda a família. Valide texto acessível, contagem de instâncias, linhas, clipping e Viewer/PDF nos zooms de revisão; publique pela rota canônica e preserve o histórico existente.

**Caso verificado:** na p.59, a variante `tag.passive` `prose-8pt` renderizava `PASSIVO`, enquanto o PDF imprimia a cápsula `✤ PASSIVE`. A tradução passou a usar `renderLanguage: en` no único token da legenda E. A mesma review 1273 e translation 1416 foram atualizadas; o histórico antigo foi preservado. O Viewer e o PDF exportado exibem a cápsula, o ícone e `PASSIVE` uma vez, e a legenda manteve EXACT 3/3 linhas.

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

**Também verificado na p.47:** outras duas unidades inline excediam o limite do bloco-pai em 1,52 e 2,15 pt, embora cada uma tivesse um corredor medido até a coluna vizinha. Frames específicos de fluxo PT-BR (Payload ids 106 e 107) ampliaram essas unidades para 302,53 e 303,28 pt; a tinta ocupa 301,81 e 302,43 pt e mantém 3/3 linhas. A folga até a próxima coluna continua em 6,30 e 5,55 pt. O box `IMPORTANTE` recebeu moldura PT-BR de 309,22 pt (id 108), manteve 2/2 linhas e não invade a borda do box. Ao ler o diagnóstico, diferencie o `frameRectPt` do bloco-pai do flow frame aplicado à unidade inline.

## Fluxo de bullets muda o compasso entre Viewer e PDF

**Sintoma:** os bullets mantêm a hierarquia, mas o corpo traduzido termina muito antes/depois do OG ou colide com o próximo bloco, embora o número de linhas pareça correto. O avanço pode se acumular ao longo de uma lista longa; uma medida feita só no último bloco não mostra em qual parágrafo o desvio começou.

**Como confirmar:** compare no OG, Viewer e PDF exportado o topo de cada parágrafo, as quebras visuais, o avanço entre linhas e a coordenada do próximo bloco fixo. Meça `lineHeight` e `paragraphSpacingPt` por unidade e confira os estilos efetivamente aplicados em tela e em `@media print`. Preserve a fonte e o tamanho enquanto isola a geometria.

**Correção aprovada:** aplique espaçamento entre parágrafos à unidade de fluxo de lista e repita o copyfit. Se as métricas do Viewer e do PDF divergirem, use `printLineHeight` e/ou `printParagraphSpacingPt` somente com valores medidos contra a fonte; eles são ajustes da saída impressa, não defaults globais. Depois de mudar recuo, entrelinha ou espaçamento, confira novamente cada quebra, recuo suspenso, clipping, colisão e posição do bloco seguinte nos dois modos.

**Caso verificado:** na p.58, o fluxo de Combatentes COMMAND tem 43 linhas no OG, Viewer e print. No PDF, `lineHeight=1.03` e `paragraphSpacingPt=3.25` alinham os inícios dos bullets ao OG. No Viewer, `lineHeight=1.081` e `paragraphSpacingPt=4.25` compensam o acúmulo de aproximadamente 1,2 pt por transição entre parágrafos; o último topo medido fica em 719,45 pt contra 721,20 pt na fonte, e a próxima unidade fica em Y=735,82 pt contra 736,45 pt. Não há clipping ou colisão. A proposta ainda aguarda revisão terminológica/humana; essas medições não certificam a página inteira.

## Nova linha é deslocada por quebra de linha inicial no span-fonte

**Sintoma:** uma linha do Viewer/export fica alguns pontos abaixo do PDF OG, embora a origem geométrica da linha já esteja correta. O primeiro span tem `\n` antes do texto; isso faz o bloco falhar no caminho de geometria exata e cair na caixa mais alta do span.

**Como confirmar:** confronte a string do span, a bbox/origem da linha e a bbox do primeiro span no sidecar DOM. Confira se `renderTextOverride` é igual ao texto visível sem o LF. Exporte EN e PT-BR e meça a baseline em relação ao OG; confirme também que a remoção da quebra não muda conteúdo, runs, bbox, origem, recuo ou geometria das linhas vizinhas.

**Correção aprovada, com escopo local:** quando o LF inicial for artefato de extração e a linha já tiver geometria independente, remova somente esse LF no span-fonte; mantenha a quebra final, `renderTextOverride`, estilos, bbox e origem. Reexporte Viewer e print em EN/PT-BR. Não aplique `trimStart()` global, deslocamento Y fixo ou correção no recuo sem evidência: um LF pode ser estrutural em outro bloco.

**Casos verificados em 2026-11-15:** na p.60, `AI Steps` tinha `\n` antes do título e a baseline do PT ficava 11,35 pt abaixo da OG. Removido só o LF inicial, EN/PT exportados alinham a baseline em +0,56/−0,65 pt da OG; o título não cruza mais o divisor. Na p.41, `block_44` melhorou de +3,18 para +0,46 pt; na p.89, `block_21` de +3,42 para +0,62 pt. Em todos, Viewer e PDF exportados foram rechecados. A p.53 é contraexemplo: span e linha têm a mesma bbox, o desvio medido era 1,27 pt e não havia evidência de fallback; o LF foi preservado.

## Recuo suspenso de bullets usa a tinta do marcador, não a moldura que inclui o fólio

**Sintoma:** o marcador fica muito longe do corpo, ou uma continuação perde o alinhamento com o texto do item. Isso pode acontecer mesmo com `listMarkerLineIndexes` correto quando a linha-fonte contém um marcador extraído como `U+FFFD` + tabulação ou quando `availableX` da moldura inclui a largura de um fólio sobreposto.

**Como confirmar:** compare PDF OG, DOM da página e Viewer. Para cada item, meça o X da tinta do marcador e o X inicial do corpo; não infira o recuo a partir do início da moldura. Verifique se o renderer reconhece `listMarkerGlyphOverride` e se a coluna do marcador termina antes do texto. Confirme também se o número da página tem duas passagens de pintura (por exemplo, contorno e preenchimento) na mesma bbox.

**Correção aprovada para a estrutura confirmada:** restaure o glifo do marcador na camada de renderização sem alterar o conteúdo editorial, e calcule o recuo pelo bbox da tinta do marcador, não por `availableX` quando este incorpora o fólio. Se substituir um bloco que contém o fólio, preserve as linhas-fonte de ambas as passagens com `staticEditorLineIndexes`; não reconstitua um fólio duplicado sem confirmação no PDF. Como o recuo muda a largura do corpo e pode criar novas quebras, repita Copyfit depois do ajuste e confira continuidades, estilo, clipping, colisões, Viewer e PDF exportado contra o OG. Não aplique a outras listas sem confirmar a mesma origem do marcador e a mesma geometria.

**Verificado na p.60:** em `block_22` e `block_30`, a fonte guardava marcadores como `U+FFFD` + tabulação e precisava de `listMarkerGlyphOverride: "•"`. Em `block_30`, `availableX=49,34 pt` era influenciado pelo fólio; o X da tinta do marcador é 86,17 pt e o início do corpo 104,17 pt, portanto o recuo suspenso medido é 18 pt. O renderer passou a usar o bbox do marcador. As duas passagens do fólio 60 foram mantidas em `staticEditorLineIndexes: [19,20]`. O texto verificador normaliza somente a concatenação DOM `•Como` para `• Como`, pois marcador e corpo são colunas visuais separadas; a distância visual continua vindo do layout. As 16 unidades candidatas ficaram EXACT, e Viewer/print não mostram clipping ou colisões. Evidências privadas: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-15-p060-review\`.
