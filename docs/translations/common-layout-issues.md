# Problemas comuns de layout e correções aprovadas

Este guia reúne padrões recorrentes que já foram comparados ao PDF-fonte e corrigidos no Viewer e no PDF. Aplique uma solução quando a estrutura da página atual confirmar o mesmo caso; a semelhança visual, sozinha, não prova que a unidade tenha a mesma hierarquia.

## Escolher o alcance da correção: unidade, fluxo de revisão ou renderer

| Evidência encontrada | Onde corrigir | Regra de alcance |
| --- | --- | --- |
| Peso, itálico, tamanho, cor, família ou símbolo divergente em uma unidade rica | Segmento da unidade publicada | Corrija só os segmentos que divergem do OG; mantenha o restante da formatação e o histórico da publicação. |
| Moldura, recuo, quebra de linha, distância até a coluna ou avanço de um símbolo específico | Frame/unidade/página | Ajuste a geometria daquela ocorrência e repita Copyfit e exportação. Não transforme a medida local em CSS global. |
| A mesma divergência aparece em unidades diferentes pela mesma rota do renderer, inclusive em uma página contraexemplo | Código compartilhado do renderer | Só então considere uma regra geral. Registre a rota, as páginas, a métrica de origem e a exceção, e valide OG, Viewer e PDF. |
| O estilo correto varia por página, mas várias propostas deixam de copiá-lo | Checklist/geração de rich text | Generalize a conferência editorial, não um peso ou tamanho fixo para a família inteira. |
| O efeito visual pode ser arte original, rasterização ou texto-fantasma | Nenhuma correção até comparar a fonte | Alinhe o recorte ao OG antes de mascarar, redesenhar ou mudar estilo. |

**Candidatos gerais em investigação:** o PageRenderer usa `-0.015em` em diversos caminhos de texto traduzido e tem caminhos com fallback de `line-height: 1`; esses são comportamentos compartilhados, mas não estão autorizados a mudar por causa de um recorte isolado. A auditoria de tracking/leading e de rasterização de fontes continua em [ROADMAP 09](../../ROADMAP/pendentes/09-auditoria-de-metricas-tipograficas-e-fidelidade-de-cores.md). Até haver uma amostra representativa e um contraexemplo medidos, preserve essas regras e faça correções locais confirmadas.

**Triagem visual da p.47 (2026-11-22):** as formas roxas atrás do exemplo são parte da ilustração impressa no OG; o mesmo desenho aparece no Viewer/PT-BR. Não é texto-fantasma nem exige máscara.

## Contagem de linhas exata, mas parágrafos ainda avançam sobre o bloco seguinte

**Sintoma:** a tradução tem o mesmo número de linhas visíveis do OG, mas um parágrafo final invade ou encosta no próximo título. Quebras vazias (`\n\n`) podem acrescentar espaço vertical sem criar linhas de texto, então a igualdade de linhas não detecta o problema.

**Como confirmar:** no DOM da fonte, confira se título, parágrafos, bullets e exemplos subordinados têm unidades tipográficas e caixas próprias. Compare as baselines e o fim real da tinta PT-BR com a posição da próxima unidade; não use somente `sourcePdfVisualLineCount` contra `pageRendererVisualLineCount`.

**Correção:** quando o DOM confirmar essa divisão, use uma unidade editável para cada unidade tipográfica da fonte e retire separadores de parágrafo artificiais da caixa única. Preserve as caixas e os espaços reais entre unidades. Se houver um override de bloco inteiro aprovado, mantenha-o como fallback recuperável; o Viewer pode passar às unidades filhas quando todas estiverem salvas. Depois meça cada unidade em 100% e 200% e exporte Viewer/PDF para conferir o intervalo até o próximo título. Não aplique a divisão a blocos cuja fonte realmente seja uma unidade contínua.

**Caso verificado na p.87 (2026-11-19):** a antiga caixa única do `block_9` tinha 9 linhas de texto como a fonte, mas `\n\n` entre título e parágrafos acrescentava espaço e fazia o segundo parágrafo avançar até cerca de y=215,8 pt, sobre o título seguinte que começa em y≈213,8 pt. O DOM já definia título e dois parágrafos separados. Três unidades PT-BR foram publicadas nas caixas da fonte (1/1, 6/6 e 2/2); o override antigo (translation 564/review 578) foi mantido como fallback. As 26 unidades ativas da página ficaram EXACT em 100% e 200%. Viewer e PDF final têm 27 alvos textuais incluindo a unidade aprovada anteriormente, sem colisões entre caixas; a comparação visual com o OG confirmou que o segundo parágrafo termina antes do próximo título.

**Também verificado na p.89 (2026-11-19):** a legenda tinha texto de Ícones de Escala repartido entre um glifo asterisco e uma continuação, além de 1 Mão e seu callout IMPORTANTE agrupados como bloco maior. As unidades tipográficas PT-BR foram separadas conforme a estrutura visível do OG; o frame da continuação ficou abaixo do asterisco e os frames do callout e do título foram persistidos. Copyfit V3 confirmou 22/22 unidades EXACT em 100% e 200%; a exportação Viewer/PDF confirmou paridade e não mostrou clipping ou colisões. O antigo frame administrativo do callout ficou oculto como fallback recuperável, sem apagar sua tradução.

**Também corrigido na p.85 (2026-11-19):** a etapa 2 tinha título e parágrafo separados no OG, mas ambos estavam na mesma tradução aprovada (`block_24`, translation 1555/review 546), então a fronteira editorial não era editável. Foram publicadas duas unidades-filhas: título (review 2023/translation 2390, 1/1 linha) e introdução (review 2024/translation 2391, 2/2 linhas). Texto, rich text, X/Y e molduras aprovadas foram preservados; a tradução-pai continua como fallback e não renderiza junto das filhas. As 28 unidades ativas da p.85 ficaram EXACT em 100% e 200%; Viewer/print/PDF foram comparados com o OG. O caso reforça que copyfit igual não substitui a conferência da estrutura do DOM: título, parágrafo, exemplo e lista são caixas próprias quando o OG os separa.

**Metadados de copyfit corrigidos na p.85 (2026-11-19):** as revisões aprovadas dos blocos 4, 20 e 18 guardavam contagens antigas de 1/1; as medições atuais no PageRenderer eram 4/4, 5/5 e 2/2. O texto e as traduções não mudaram; as três revisões foram reconciliadas com medições EXACT atuais em 100% e 200%, e a leitura do Payload confirmou os mesmos IDs e dados publicados.

**Caso verificado na p.98 (2026-11-20):** as regras de Poppet e Tentacle estavam concentradas em dois blocos grandes. O cabeçalho “Combatant Token rule exceptions” e cada bullet tinham âncoras próprias no OG, mas os bullets separados continuavam nos Y antigos quando o parágrafo em PT-BR refluía; isso criava um vão grande sob o cabeçalho. Foram definidas unidades-filhas para cada parágrafo, título e bullet, com o marcador e o texto de cada bullet na mesma unidade. As 14 candidatas da proposta v4 e as cinco unidades das propostas ativas restantes ficaram EXACT em 100% e 200%; a exportação imutável verificou os 19 alvos, e Viewer/print/PDF raster não mostram o vão, clipping ou colisões. A tradução-pai aprovada continua preservada como fallback no Payload; as unidades novas aguardam revisão editorial.

## Linha vazia fonte desloca prosa ou faz células de tabela invadirem a coluna vizinha

**Sintoma:** texto PT-BR começa embaixo do marcador de custo ou invade outra célula, embora a linha visível do OG comece em outra coluna. Em tabelas, duas unidades podem até compartilhar o mesmo `lineId` de origem.

**Como confirmar:** confira `field.lineIds`, o X da tinta visível no PDF e o corredor real de cada célula. Uma linha fonte vazia pode ter bbox no espaço do símbolo e deslocar a moldura; não use esse X como início da prosa. Abra o Viewer normal e o PDF persistido, pois uma proposta isolada pode esconder o problema.

**Correção verificada na p.96:** as células das Tabelas 6–8 foram separadas por linha/coluna; cada linha da Tabela 8 agora pertence a três unidades sem sobreposição. Molduras PT-BR locais iniciam as descrições após os símbolos de custo e ampliam a linha curta ESPECIAL até o limite da coluna. Os seis alvos ajustados foram reavaliados em 100% e 200% (EXACT), e o Viewer/PDF persistidos foram comparados ao OG. No renderer atual, moldura local salva em `layout-frames` é necessária: editar somente `data.bbox` ou a proposta não garante a geometria do Viewer/export. O fundo da p.96 está limpo; não se deve mascarar nem reconstruir texto da tabela como overlay.

**Caso verificado na p.7 (2026-11-21):** a nota do rodapé ainda aparecia em inglês porque estava embutida no `background.webp`, enquanto a unidade-fonte correspondente estava oculta e marcada como duplicata raster. Além disso, o bloco começava com uma linha que continha apenas espaço em y=748,94 pt; a linha visível começa em y=759,94 pt. Desocultar o bloco sem corrigir a âncora deslocava a tradução 11 pt para cima. Uma renderização temporária do PDF-fonte sem texto forneceu o underlay limpo; apenas a faixa da nota foi substituída e os pixels fora dela permaneceram idênticos. Removemos a linha vazia e a supressão de duplicata, mantendo a unidade editável na posição real. `Baralhos Secretos constam das listas detalhadas.` ficou em uma linha, em 10 pt, com moldura local de 220 pt; Viewer, print e PDF exportado foram comparados ao OG sem clipping ou colisão.

## Capturar rapidamente uma página sem o texto editável

Para inspecionar o fundo e a arte da página sem as unidades de texto do Payload, use:

```powershell
npm run capture:textless -- --page 74 --language pt-BR
```

O comando abre o Viewer, ajusta o zoom para caber a página, oculta texto editorial e símbolos inline soltos e salva `tmp/page-074-textless-pt-BR.png`. Para outra página ou idioma, troque os argumentos; `--output` define outro destino. A captura preserva o fundo servido, ilustrações e cartas completas, inclusive texto impresso nelas. Portanto, é uma verificação diagnóstica do fundo atual: não limpa arte hardprinted, não altera o Payload e não substitui a comparação com o PDF OG. O processo leva poucos segundos com Viewer e API em execução.

## Marcador ou símbolo inline continua preso à posição do PDF OG

**Sintoma:** um marcador alfabético, dado ou ícone aparece na posição original enquanto a prosa PT-BR muda de linha, ou o símbolo fica duplicado após a tradução. A proximidade de um desenho à prosa é apenas um candidato: cartas, diagramas e decoração também contêm vetores pequenos.

**Como confirmar:** compare o recorte do PDF OG com o DOM da página, o `inline_elements.json` e a unidade PT-BR correspondente. Confirme que o desenho pertence àquela frase e identifique o span/letra exatos que funcionam como âncora. Para recuperar o fundo sob um marcador vetorial, pode-se renderizar uma cópia temporária da página sem a camada de texto, preservando imagens e demais desenhos; remova também somente o vetor do candidato e compare o recorte resultante com o fundo servido. Essa imagem sem texto é diagnóstico, nunca fonte de produto. Classifique cada ocorrência como confirmada, arte preservada, falso positivo ou inconclusiva antes de editar.

**Correção aprovada:** represente o símbolo como um objeto inline semântico ancorado ao span correto; para fichas alfabéticas, trate a ficha e o glifo-fonte como um único símbolo composto. Prefira publicar um fundo de página limpo quando os vetores puderem ser removidos com segurança e fidelidade; use patch local de underlay como fallback quando a reconstrução completa não passar a comparação. Insira o mesmo ID semântico na unidade PT-BR no ponto correspondente, mantendo pontuação e espaços ricos existentes. Não reconstrua texto impresso em cartas ou componentes preservados como arte. Depois de alterar símbolo, avanço, margem ou tradução, repita copyfit e confira a posição, quebras, clipping, colisões e paridade Viewer/PDF contra o OG.

## A rasterização expõe a cor que fica sob um vetor-fonte ausente

**Sintoma:** uma região de arte fica com a cor errada no Viewer/PDF, embora o fundo raster seja igual ao OG. A cor inesperada pode ser a tinta que está sob uma forma vetorial do PDF-fonte.

**Como confirmar:** compare o PDF OG, `background.webp` e Viewer/export. Inspecione os desenhos vetoriais e a ordem de pintura na região; confirme se o raster já contém a cor de base e se a fonte desenha por cima uma forma opaca. Não classifique o fundo como defeituoso só pela cor visível no OG.

**Correção:** preserve o `background.webp` quando ele estiver correto e restaure os vetores-fonte ausentes como overlay transparente local, mantendo caminhos, recortes ativos e ordem de pintura. Use `languageInvariant` para arte que deve permanecer igual em EN e PT-BR. Texto de regra e tokens semânticos continuam em suas unidades; uma ilustração do dado não vira texto `[[symbol]]`.

**Caso verificado na p.65 (2026-11-23):** o fundo já continha vermelho em `(207, 650)`, mas o OG cobre essa área com a face branca do dado e seus símbolos pretos. Os nove desenhos-fonte 136–144 (sequências 271–279) foram preservados em um SVG transparente, bbox `[198.597, 642.875, 241.851, 686.130]` pt. A face voltou a medir RGB `(255,255,255)` no Viewer/print PDF; o dado roxo adjacente permaneceu intacto. A página inteira foi comparada ao OG, sem clipping ou colisões visíveis; a exportação passou `verifiedTranslationRecords=true` e `pdfVerification=true`.

**Caso verificado na p.98 (2026-11-20; borda de limpeza):** a ficha-fonte `dice.green` já estava mapeada como símbolo semântico inline após `GREEN`, mas o underlay local terminava a apenas 0,12 pt da área pintada. Viewer e PDF mostravam duas linhas verticais finas nas bordas do patch. O script `scripts/add_page098_root_green_die_inline.py` agora usa uma margem de 0,75 pt; a comparação de Viewer, print e PDF raster confirmou que as linhas sumiram, o dado semântico permaneceu alinhado ao texto e ainda há 5,188 pt até a divisória inferior da linha. Esses valores são locais à ficha da p.98: em outras máscaras, medir tinta e bordas e conferir o espaço livre antes de ampliar o recorte.

**Símbolo inline não carrega a formatação do termo ao lado (p.21):** ao substituir um vetor impresso por objeto semântico, compare também o estilo do rótulo ou termo adjacente no PDF. O avanço/tamanho do símbolo não define o tamanho nem o peso da palavra seguinte. Na p.21, `MOVEMENT` era Optima Bold 9 pt, mas `Movimento` estava regular 10 pt; `DODGE` → `ESQUIVAR` estava bold 10 pt em vez de bold 9 pt. Também faltava transferir o negrito de `TO THE ATK ROLL` para as duas ocorrências de `na rolagem de Ataque`, e a segunda ocorrência havia sido encurtada sem essa especificação. Corrigimos somente as unidades afetadas, mantivemos `[[resource.movement]]` inline, medimos novamente (5/5, 4/4, 3/3 e 1/1), e a comparação OG/Viewer/print confirmou estilos, quebra e espaçamento. **Regra prática:** medir fonte/peso/tamanho dos runs adjacentes separadamente do símbolo; depois refazer copyfit e exportar para confirmar o resultado persistido.

**Fluxo recorrente:** use as skills locais `alphabet-marker-layout` e `layout-debugging` para mapear e provar a ocorrência; use `middara-translation-copyfit` para recolocar o ID na tradução e recalcular a quebra; feche com `visual-fidelity-qa` no Viewer e no PDF exportado. O inventário amplo é uma lista de candidatos, não uma autorização para aplicar um lote sem revisão visual.

**Inventário automatizado de glifos (2026-11-23):** contagens de desenhos, glifos sem mapeamento e placements ausentes servem para triagem, não provam hardprint ausente. Na p.63, 114 candidatos Wingdings são caixas de seleção do diagrama e aparecem preservados no OG e no PT-BR; não devem virar `[[symbol]]` nem ser recriados como texto. Para cada alerta, classifique o objeto com comparação visual OG↔PT-BR: símbolo semântico de prosa, arte/componente preservado, falso positivo ou inconclusivo. Só corrija os confirmados; não acrescente símbolos apenas para zerar a contagem automática.

**Inventário em acompanhamento (2026-11-16):** a varredura de fichas brancas encontrou 34 marcadores sem placement nas pp.40, 67, 68 e 74. A remoção temporária do texto e das fichas confirmou 34 recortes, com zero pixels alterados fora dos bboxes; os placements foram aplicados. As 22 referências PT-BR das pp.67 e 74 foram vinculadas a símbolos semânticos, e a p.40 já continha esses IDs. Na p.68, os marcadores A/B e os símbolos inline foram confirmados na fonte, integrados à camada semântica e conferidos em Viewer e PDF exportado. As demais páginas do inventário ainda precisam de verificação visual antes de certificar a família inteira.

**Correção rápida na p.40 (2026-11-21):** retângulos marrons voltavam a aparecer nas dez referências A–D da prosa. A camada de papel limpo estava correta, mas `sourceOverlayMask` abria um recorte para cada máscara inline; as pequenas imagens locais antigas, com underlay errado, ficavam visíveis por baixo. Em overlays cujo propósito é limpar a posição-fonte, defina `maskInlineElements: false` para manter o remendo limpo inteiro sobre a área e o símbolo semântico acima dele. A opção fica `true` por padrão para overlays de arte que precisam preservar os símbolos. OG, Viewer e print/PDF confirmaram dez símbolos, 17 linhas estruturais e nenhum retângulo marrom após a correção. A regra é local à finalidade do overlay: não desligue o recorte de outros overlays sem conferir sua camada e ordem de pintura.

**Caso verificado (2026-11-16; p.68):** o fundo raster continha um dado preto e as fichas A/B da legenda, mas o sidecar não posicionava o dado preto; as fichas tinham posições-fonte fixas e máscaras brancas que deixavam caixas quando a legenda PT-BR refluía. O dado roxo e a caveira também estavam ausentes da unidade PT-BR. O fundo do produto foi substituído por um único raster de página retocado nas áreas confirmadas; não há máscaras de runtime nesses cinco placements. O dado preto foi recuperado dos vetores exatos 109–112 do PDF. Dado preto/roxo, caveira e marcadores A/B agora são objetos semânticos inline tanto no OG quanto no PT-BR. O espaço tipográfico de 10,7436 pt presente no PDF foi preservado antes de ambos os dados, com margens residuais específicas da ocorrência (preto: cerca de 0,309 pt; roxo: cerca de 0,632 pt de cada lado). Viewer e PDF exportado mantêm a legenda A/B junto ao texto, sem caixas antigas, duplicação ou clipping; os rótulos A/B do diagrama continuam intactos.

### Parágrafo perde o corredor de texto ao contornar uma carta ou ilustração (p.67)

**Sintoma:** uma tradução aplicada ao bloco inteiro ocupa a largura do parágrafo desde a primeira linha. No PDF OG, as primeiras linhas usam a largura toda; as linhas seguintes começam mais à direita para contornar uma carta ou imagem. O PT-BR então invade a arte, perde o recuo visual e pode colidir com a unidade seguinte.

**Como confirmar:** no PDF oficial, anote X, Y e largura útil de cada linha antes e depois da borda da arte. Confira os `lineIds`, bboxes e spans no DOM da página; não deduza a hierarquia só pela proximidade visual. Compare também o corpo da tradução e o limite da imagem no Viewer e no PDF exportado.

**Correção aprovada:** quando a fonte comprovar corredores diferentes dentro do mesmo parágrafo, divida a unidade editorial por corredor e dê a cada unidade seu próprio `frame.x`, largura e Y de origem. Preserve a ordem e a continuidade gramatical entre as unidades, os rich spans e os símbolos semânticos; mantenha o bloco-pai apenas como fallback. Faça copyfit de cada parte e mova o bloco seguinte somente se a página oferecer espaço real. Não deixe o renderer refazer o contorno por uma moldura única. Para símbolos presos ao fundo, substitua o `background.webp` por um fundo de página limpo quando for possível preservar a arte vizinha; use máscara local só se a limpeza do fundo não passar a comparação.

**Caso verificado:** na p.67, `block_13` alterna de largura total para o corredor à direita de uma carta embutida. O override monolítico PT-BR atravessava a carta. Três unidades com molduras correspondentes ao PDF produziram 2/2, 3/3 e 2/2 linhas. `block_91`, legenda externa da carta, foi centralizado na largura real da carta e cabe em uma linha. O fundo raster limpo remove as fichas vetoriais hardcoded; o mapa, a carta em inglês, o rodapé e o fólio foram preservados. Viewer PT-BR/OG e PDF exportado mantêm 38 símbolos PT-BR sem duplicação e sem colisão nos blocos ajustados.

**Caso adicional (2026-11-17):** no bloco 11, o PDF OG mostrava uma caveira dentro da frase “If the [skull] is rolled”; o Viewer EN não a listava como ID semântico. O texto PT-BR antigo dizia “o símbolo” e também inseria `combat.skull`, duplicando o conceito. A forma corrigida mantém o token no ponto da frase: “Se o `[[combat.skull]]` sair em um dos dois espaços saltados…”. Confirme o vetor no PDF antes de criar o ID e retire-o do fundo antigo quando ele permanecer preso à geometria-fonte. No bloco 13, o token do resultado 7 foi mantido junto ao número e uma moldura PT-BR própria foi salva para a unidade `page_67_block_13` (bloco-fonte de índice 13): +2,5 pt para conter o avanço observado de 1,36 pt, dentro da faixa livre da coluna. A geometria fica em `/api/layout-frames`; editar `data.bbox` da tradução não alterou o frame de render e foi restaurado. Após copyfit, os 18 alvos renderizados mantêm a paridade de linhas com o OG; Viewer/print têm 17 retângulos estruturais, 38 símbolos e 28 imagens, sem overflow medido.

**Caso verificado (2026-11-17; p.72, largura local e copyfit):** depois de completar a informação de `page_72_block_15`, a tinta passou 0,90 pt do frame; `page_72_block_17` passava 1,75 pt. O frame do bloco 15 avançou somente até X=409,5 pt, preservando 25,47 pt antes do início da coluna direita em X=434,97 pt. O bloco 17 foi ampliado até X=408 pt (largura total 321,193 pt), o corredor medido no bloco-fonte vizinho. Não use esses valores em outras páginas. Uma redação longa para `page_72_block_21` criou uma quarta linha que colidia com o bloco 22; copyfit conciso preservou, em três linhas, a condição da Habilidade, seu exemplo e a condição independente da Regra Especial de Encontro. Após reload, Viewer e print ficaram em 67 linhas, com zero excesso horizontal/vertical nos alvos; as demais peças da carta/diagrama continuaram como arte original.

**Fluxo recorrente:** `layout-debugging` para provar corredores e medir molduras; `middara-translation-copyfit` para adaptar texto e rich spans por unidade; `pdf-image-region-overlays` para decidir entre fundo limpo e máscara local; `visual-fidelity-qa` para fechar Viewer, PDF e OG.

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

**Caso verificado na p.21 (2026-11-21; rótulos da legenda de terreno):** os cinco rótulos com ícone tinham o ID semântico, mas os segmentos publicados guardavam as métricas da ocorrência como `sourceSymbolMetrics`; o rich text traduzido espera `symbolMetrics`. O avanço do ícone então não reservava o respiro medido, e o glifo ficava apertado contra o nome. A publicação do review também estava divergente da tradução viva. Os gaps medidos no OG, em texto de 9 pt, são específicos por ícone: Hindering 2,79672 pt; Water 1,4642 pt; Muck 1,38055 pt; Dangerous 2,43784 pt; Special 2,55551 pt. Cada rótulo agora tem o símbolo semântico e a métrica correta no mesmo grupo centralizado, com `advanceEm` preservando largura da tinta mais o gap-fonte; `managedSourceSymbols` evita duplicar o glifo-fonte em PT-BR. Reviews #608–612 e traduções #691, #592, #693, #593 e #692 foram reconciliadas pelo endpoint oficial, preservando uma publicação anterior no histórico de cada review. O Copyfit V3 registrado para esses dados é EXACT 1/1 em 100% e 200%; a exportação fresca Viewer/print/PDF confirmou os cinco ícones inline, 7 símbolos semânticos e 9 imagens. A exportação EN também foi verificada, e a arte impressa das fichas permanece em inglês. Não aplicar um gap CSS uniforme: usar a métrica da ocorrência.

### O próprio patch de limpeza repinta o símbolo antigo (p.93)

**Sintoma:** a tradução contém o símbolo semântico no lugar certo, mas ainda aparece um contorno ou uma sobra do mesmo símbolo na posição impressa original. A imagem de limpeza pode estar desenhando o glifo antigo de novo; também pode deixar pixels antialiasados se a área coberta terminar exatamente no bbox nominal do vetor.

**Como confirmar:** abra o PNG de limpeza em pixels nativos e compare-o com o recorte alinhado do PDF OG. Não infira que o patch está limpo só porque ele tem aparência de textura ou porque o DOM já não mostra o vetor. Confira a extensão real da tinta e do antialias de cada caminho-fonte, o bbox aplicado no sidecar e outras ocorrências próximas da mesma família.

**Correção:** quando a página tiver uma fonte raster limpa e reutilizável, faça um underlay opaco de textura dessa mesma página, sem o glifo, em vez de recortar ou reutilizar o próprio símbolo como máscara. Expanda somente a caixa local o bastante para cobrir a tinta antialiasada, preserve os desenhos e o conteúdo ao redor e mantenha o símbolo semântico inline no texto. Reabra o Viewer e o PDF exportado e confira tanto a posição antiga quanto a posição inline.

**Caso verificado (2026-11-20; p.93):** o `dice.purple` dos desenhos 127–130, no bloco `block_22`, continuava visível atrás de “IRREDUTÍVEL” porque o PNG `audit-mask-p093-v127-130-n4.png` continha o contorno branco do dado. A segunda ocorrência próxima (desenhos 102–105, `block_7`) ainda deixava um filete antialiasado. Os dois PNGs foram substituídos por patches opacos de textura limpa da própria página; as caixas foram ampliadas localmente para `[448.25, 452.25, 463, 468.75]` e `[245.5, 520, 260.25, 536.5]` pt, respectivamente. O dado semântico permanece no texto. Viewer e export de impressão/PDF não mostram o glifo antigo nem o filete, e os 28 alvos traduzidos continuam EXACT em 100% e 200%.

**Caso verificado:** na p.33, a linha de texto 9 pt usa 0,6316 pt de margem medida antes do dado roxo, além do espaço tipográfico; entre os dois dados da linha “Convicção” a margem medida é 3,5 pt, sem espaço textual. `Convicção:` e `Conjuração:` no PT estavam sem o espaço textual que existe antes do primeiro dado na fonte; cada ocorrência mantém sua margem de 0,5 pt. O dado roxo do parágrafo principal também precisava das dimensões-fonte próprias (1,2764 × 1,4732 em); no box lateral, a ocorrência usa 1,1488 × 1,3259 em e 0,6318 pt de margem depois. Depois do ajuste, esses blocos mantiveram as 4/4 e 3/3 linhas fonte/PT, sem excesso horizontal no Viewer/print; o nome `Magic Staff` continua junto na mesma linha.

**Caso verificado:** na p.37, duas ocorrências de `action.exhaust` em texto Optima 9 pt têm `trailingGapEm≈0,1272` (≈1,145 pt), enquanto `marker.arrow` no mesmo tamanho usa `trailingGapEm=0,1` (0,9 pt). Esses valores descrevem somente as ocorrências medidas; não são uma margem natural comum a todos os símbolos. O espaço aparente inclui também o espaço real do rich-text e a diferença entre o avanço reservado e a tinta do SVG/arte. As ocorrências foram comparadas ao PDF-fonte, e a página final manteve Viewer/print sem overflow. Na mesma página, um parser geométrico do PDF separava o rótulo pequeno `STATUS` da cápsula e contava 3 baselines para um parágrafo que visualmente tem 2 linhas; a caixa de texto do Viewer, o PDF rasterizado e o print confirmam as 2 linhas. Ao auditar símbolos, identifique primeiro a unidade e o tamanho tipográfico, meça a tinta e a margem de cada lado e então confira o copyfit; não transforme leitura automática de baseline em evidência de quebra visual.

**Caso verificado:** na p.38, três ocorrências de `dice.black` em texto Optima 10 pt preservam o espaço textual real após `PRETO` (avanço de cerca de 2,502 pt) e a margem residual medida de aproximadamente 0,284 pt (`gapEm≈0,0284`). Os blocos 30, 33 e 35 ficaram em 2/2, 2/2 e 3/3 linhas. A margem é específica de cada ocorrência; não substitui nem duplica o espaço textual. Viewer e PDF exportado foram conferidos.

**Também verificado na p.66:** ao mover `dice.purple` para depois de `ROXOS`/`ROXO` na prosa PT-BR, a primeira revisão levou apenas a margem residual de ~0,63 pt e deixou o desenho encostado na palavra. O PDF-fonte mostra também um espaço tipográfico real antes do dado; as traduções agora preservam esse espaço no rich-text e a margem medida por ocorrência (`gapEm≈0,06317` no dado de 10 pt; `≈0,07015` nos dados de 9 pt). O parágrafo do resultado continua em 4/4 linhas. Viewer e print mostram a folga junto ao dado sem alterar o avanço, tamanho ou aparência do símbolo. Regra prática: ao reposicionar um símbolo, transfira a separação textual e a margem residual como coisas distintas; o `gapEm` isolado não substitui um espaço que existe na fonte.

**Caso verificado:** na p.39, `terrain.red-border` em Optima 10 pt tem avanço semântico de 2,0575 em; a distância entre a tinta do texto e a tinta da linha vermelha é 5,8427 pt à esquerda e 4,1623 pt à direita. O rich-text conserva espaços reais nos dois lados. Nos três callouts `IMPORTANT`, o símbolo começa sem vão adicional até o rótulo; o texto do corpo conserva o espaço literal que a fonte mostra, com 2,4097 pt ou 2,7796 pt entre a tinta do rótulo e a primeira letra, conforme a ocorrência. Esses valores descrevem somente as unidades medidas na p.39.

**Caso verificado:** na p.61, o `tag.passive.icon` da legenda é uma ocorrência semântica inline em texto de 9 pt. A comparação da tinta com o PDF OG mediu cerca de 1,58 pt de espaço à direita (aprox. 0,175 em); dimensões e baseline também foram preservadas. Esse valor pertence à ocorrência p.61 e não deve ser aplicado aos outros usos de `tag.passive`.

## Símbolo inline some porque o asset local não existe ou não foi publicado

**Sintoma:** a página mostra um espaço vazio, um símbolo fallback ou uma imagem quebrada, embora o rich-text e `inline_elements.json` contenham o `symbolId` correto. Um `sourceAssetUrl` pode apontar para um nome temporário de auditoria, para a página errada ou para um arquivo que o Git ignora.

**Como confirmar:** para cada ocorrência, compare o PDF OG, `inline_elements.json` e os segmentos salvos na tradução. Confira `symbolMetrics.sourceAssetUrl` no rich-text além de `metrics.sourceAssetUrl` no sidecar; valide também `mask.url`. Resolva cada URL para a pasta da página, confirme que o arquivo existe e que o servidor do Viewer o entrega. A soma dos desenhos-fonte, o `symbolId` e a geometria devem pertencer à ocorrência correta.

**Correção aprovada:** aponte sidecar e rich-text para o SVG-fonte correspondente à página e à ocorrência, preservando dimensões, avanço, recuo, `gapEm` e identidade visual medidos. Renomeie SVGs e máscaras temporários para nomes duráveis de asset de página; mantenha os nomes de auditoria e evidências privados. Confirme que os arquivos de produto não estão ignorados pelo Git e que todos os destinos referenciados existem antes de salvar ou publicar. Reabra Viewer e PDF exportado para conferir o símbolo no fluxo e a paridade com o OG.

**Caso verificado em 2026-11-16:** a p.64 tinha cinco referências SVG quebradas: dois símbolos `combat.shield` apontavam para um arquivo de auditoria da p.45, e três `stat.armor` apontavam para outro arquivo da p.45. As URLs foram corrigidas no sidecar e nas três traduções salvas correspondentes; o readback confirmou os caminhos da p.64. Na p.65, onze SVGs/máscaras de auditoria foram renomeados para assets duráveis e todos os 14 placements do sidecar agora apontam para arquivos existentes. A rechecagem visual Viewer/PDF dessas páginas continua pendente.

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


**Diferença recorrente de renderização de Optima (pp.49 e 65–67; ainda sem causa isolada):** no OG, o corpo usa OptimaLTStd regular, 10 pt e branco. Na p.66, 55 runs PT-BR de corpo estão salvos como OptimaLTStd 10 pt, peso 400 e `#ffffff`; os spans do OG usam OptimaLTStd 10 pt. Na p.65, a maioria dos runs de corpo também mantém peso 400 e cor branca. Na p.67, os registros vivos mantêm runs regulares de 10 pt entrelaçados com os negritos mecânicos que também aparecem no PDF-fonte. Ainda assim, os rasters Viewer/print PT-BR das pp.65–67 parecem mais pesados que o OG, repetindo a diferença anotada na p.49 em EN e PT-BR. Os arquivos Roman e Bold estão presentes e a declaração `@font-face` associa peso 400 ao Roman. Isso afasta um erro de peso nos dados dessas unidades, mas ainda não confirma qual fonte o navegador carregou nem a causa da rasterização/exportação. **Classificação:** candidato compartilhado de fonte/rasterização, não correção individual confirmada. Mantenha família, tamanho, peso e cor salvos iguais à fonte; não compense localmente reduzindo peso. Retome a inspeção do carregamento real da fonte e do pipeline de print após fechar as traduções.

**Reincidência confirmada na p.76 (2026-11-22):** quatro cabeçalhos Cinzel tinham `renderWeightOverride: 700` na origem, mas os segmentos ricos PT-BR estavam salvos com `weight: 400`: título da página e `Espers Oponentes`, `Familiars`, `Exalted Summoning`. Os quatro foram corrigidos para peso 700 individualmente, sem alterar família, tamanho, cor, texto ou moldura. Copyfit V3 confirmou 1/1 em 100% e 200%; a republicação preservou cada versão anterior no histórico do Reviewer. Viewer e PDF exportado da página foram conferidos contra o OG. **Regra geral de processo:** propagar o peso visual observado por segmento a partir do OG/`renderWeightOverride`; `Cinzel-Regular` não implica que todo título seja regular nem que todo título deva virar negrito.

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

**Casos verificados:** na p.19, o exemplo ganhou sua própria moldura e o texto “Surgimento” mediu 6 linhas na fonte e 6 em PT-BR. Na p.22, os dois exemplos mantiveram os 18 pt de recuo e os X medidos; após condensar a introdução para igualar as 2 linhas do OG, o bloco principal mediu 32 linhas na fonte e 31 em PT-BR (UNDER justificado), sem clipping ou colisões no export final.

**Rechecado na p.19 (2026-11-15):** o exemplo subordinado ao bullet está em X=104,165 pt no PT-BR e X=104,173 pt no OG (diferença de 0,008 pt). As continuações permanecem no mesmo X do texto do exemplo. O corpo dos bullets começa em X=104,173 pt; o marcador fica 18 pt à esquerda. Viewer e print atuais mantêm essa hierarquia.

**Revalidado na p.19 (2026-11-21):** a nova exportação persistida confirma que o parágrafo “Exemplo:” continua na hierarquia da lista e suas continuações mantêm o mesmo recuo do texto do item. As chamadas IMPORTANTE são unidades separadas dos parágrafos e mantêm os símbolos `[[tag.important.icon]]` inline. A comparação OG/Viewer/print não mostra clipping ou colisões; PDF verificado após publicação.

**Revalidado na p.18 (2026-11-21):** no item numerado 4, o marcador está em X=86,17 pt e o corpo/continuação em X=104,17 pt (avanço de 18 pt). A versão PT-BR ocupa 2 linhas, igual ao OG, em Copyfit V3 a 100% e 200%; “38.” permanece na segunda linha e o parágrafo seguinte não colide. A review #27 foi sincronizada pelo endpoint oficial com a tradução #331; a redação anterior foi preservada no histórico. O alerta de 3/2 linhas descrevia uma versão anterior. O export fresco confirmou Viewer/print e `pdfVerification=true`.

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

**Também corrigido na p.53 (2026-11-17):** nos itens 1 das duas colunas, o número e o título compartilham a primeira linha-fonte (`1. CHOOSE…`), então o detector que procura uma linha contendo somente o marcador não ativava o recuo suspenso. As continuações voltavam ao X do número. Os overrides PT-BR dos blocos 2 e 13 receberam `hangingIndentPt` locais medidos no PDF: 17,0056 pt (marcador X=86,173; corpo X=103,179) e 17,0116 pt (marcador X=415,842; corpo X=432,854). Após reload, o PDF PT-BR começa os corpos em X=103,172 e X=432,832; os itens mantêm 4/4 e 5/5 linhas. Viewer, print e export passaram `verifiedTranslationRecords=true` e `pdfVerification=true`. A alteração não muda o inglês nem as outras listas.

**Também corrigido na p.53 (2026-11-19):** Copyfit EXACT não revelou que cinco subpassos alfabéticos (`a/b/c` na coluna esquerda e `a/b` na direita) ainda deixavam continuações no X do marcador. No OG, o corpo e as linhas seguintes começam 11,3411/11,3404/11,3406 pt após o marcador à esquerda, e 10,7948/10,8347 pt à direita. O fluxo rico agora separa o marcador alfabético e o corpo somente quando há um `hangingIndentPt` medido salvo; `listMarkerIndentPt=0` conserva o marcador no X-fonte. Copyfit V3 permaneceu EXACT em 100% e 200%: 2/2, 3/3, 3/3, 5/5 e 2/2 linhas. Export persistido do Viewer e print/PDF comparados ao OG; `verifiedTranslationRecords=true` e `pdfVerification=true`. A rechecagem do PDF persistido em 19/11 confirmou os mesmos recuos: item 1, OG 17,008 pt e PT 16,999 pt; itens 2–4, OG 18,000 pt e PT 17,988 pt. Os X de início do texto coincidem com o OG dentro de 0,026 pt: item 1 em 103,181/103,172 pt; itens 2–4 em 104,173/104,156 pt; títulos a/b/c em 114,520/114,504 pt; item 3 da coluna direita em 433,842/433,816 pt. Preserve a diferença de 1 pt entre o item 1 e os demais, pois ela existe na fonte. Há também diferença vertical pequena: os baselines PT dos títulos medidos ficam 1,17–1,77 pt acima do OG, e o espaçamento de linha PT varia em torno de 10,5 pt diante dos 11 pt da fonte. Não mover X por causa disso; registrar para a calibração tipográfica/entrelinha global, sem compensação local às cegas. A p.53 continua aberta para reconciliação do glossário; o ajuste foi só de layout. Evidências privadas em `engineering-decisions/evidence/2026-11-19-p053-lettered-hanging-indent/`.

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

**Como confirmar:** siga as camadas separadamente: confira o desenho no PDF OG e os objetos vetoriais que o formam; veja se `background.webp` ainda contém a tinta; inspecione `inline_elements.json` e a âncora; depois confira se a tradução contém o mesmo `symbolId`. Conte as instâncias `svg[data-symbol-id]` e procure a cópia antiga no Viewer e no PDF exportado. O ícone pode estar repetido entre raster do fundo, fallback semântico na posição-fonte e segmento traduzido.

**Camada de limpeza preferida:** quando a origem comprova que o fundo da página é um raster separado do texto e o vetor pode ser removido sem tocar nos desenhos vizinhos, gere e sirva um `background.webp` limpo. Assim a limpeza já faz parte do único raster da página e o PDF não precisa sobrepor uma imagem local para cobrir o glifo antigo. A geração deve partir dos objetos medidos do PDF ou de um underlay comprovado, preservar a grade do fundo e provar que pixels fora da tinta e da franja antialias não mudaram. Não regenere a página inteira com scripts de extração que removem texto ou vetores por regex sem validar os XObjects e a arte incorporada. Use a máscara local de underlay como fallback quando não for seguro reconstruir o fundo completo; valide bordas, EN/PT-BR e PDF exportado.

**Posse do símbolo:** escolha uma única posição proprietária. Se o rótulo traduzido precisa mover junto com o ícone, a unidade PT-BR é dona do símbolo: inclua-o no rich-text, marque o `symbolId` como controlado pela tradução e suprima o fallback na posição-fonte. Se o sidecar continuar dono e mantiver a posição do OG, não repita o token no rich-text. Preserve a folga medida entre ícone e palavra; não acrescente margem automática.

**Copyfit e conferência de aceite:** verifique se cada ícone aparece uma vez, compare a lacuna entre símbolo e texto com a fonte, confirme linha e limites do rótulo, e inspecione Viewer e PDF exportado. Não ajuste `gap` global nem troque o fundo sem evidência geométrica e comparação do raster.

**Casos verificados em 2026-11-16:** as cinco legendas de terreno das pp.21 e 23 agora incluem seus `terrain.*.icon` junto ao texto PT-BR, preservando forma, tamanho, espaçamento-fonte e centralização do grupo. O primeiro Viewer mostrou a origem semântica também no ponto antigo; a causa foi uma condição do renderer que mantinha o fallback-fonte visível quando o override já continha o mesmo símbolo. Corrigido o renderer para deixar a posição traduzida como única dona nesses casos. Recontagem e export oficial confirmaram um ícone por ID e paridade Viewer/PDF nas duas páginas. As traduções e a correção de renderer já estão aplicadas; os fundos publicados ainda usam patches locais de underlay.

**Experimento de fundo limpo:** candidatos privados das pp.21 e 23 incorporam os dez patches no raster de página inteiro; os pixels fora das caixas dos patches permaneceram idênticos ao `background.webp` atual. Isso confirma a viabilidade visual de substituir os overlays locais por um fundo achatado, mas os candidatos ainda não passaram por Viewer EN/PT-BR e export oficial após a troca. Não os trate como assets aprovados até essa validação. Evidência privada: `engineering-decisions/evidence/2026-11-16-inline-marker-audit/background-clean-candidates/`.

**Caso verificado na p.64:** 22 símbolos semânticos de prosa (55 desenhos vetoriais no PDF) ainda estavam presos ao `background.webp`; em PT-BR, isso deixava ícones antigos flutuando depois que os tokens eram movidos junto ao texto. Removemos o texto apenas no PDF em memória, redigimos os 55 desenhos registrados e preservamos todos os outros 359 desenhos e os XObjects de imagem. O novo fundo usa recortes locais nas 22 caixas de limpeza, foi salvo em WebP lossless e muda zero pixels fora desses recortes; as 22 máscaras locais também passaram a conter somente o underlay. O token `attack.melee` ausente foi persistido no rich-text PT-BR antes de `ATK`, mantendo as métricas da ocorrência. Viewer e PDF exportado em EN e PT-BR mostram 22 símbolos por página, sem os vetores antigos soltos; a arte das cartas e dos dados foi preservada. A verificação é específica à p.64 e não certifica outras páginas.

**Caso verificado na p.58 (2026-11-18):** seis símbolos inline (ataques corpo a corpo/à distância, dois `EXHAUST` e duas cápsulas `ATK`) ainda estavam pintados no raster-fonte, embora o Viewer os redesenhasse como objetos semânticos. As seis máscaras encobriam essas cópias, mas deixavam remendos visíveis; uma cápsula `STATUS` separada também permanecia na posição antiga enquanto a frase PT-BR refluía. Recriamos o fundo na grade raster original a partir do PDF oficial, retirando apenas os desenhos vetoriais identificados, e removemos as seis máscaras sem uso. Para a cápsula `STATUS`, o script `scripts/repair_page058_status_background.py` restaura a textura dentro do retângulo medido e confirma zero mudança fora dele. Exports EN/PT-BR frescos mostram os símbolos inline uma única vez, `STATUS` junto à frase e sem sobras na posição antiga; Viewer e PDF passaram as verificações de exportação. Evidência privada: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-18-quality-dip-pp56-58\`. A limpeza é específica à p.58: inventarie todas as cópias vetoriais no fundo, inclusive cápsulas compostas, antes de remover máscaras ou declarar o raster limpo.

**Filtro de falso positivo verificado na p.37:** `get_drawings()` apontou três candidatos `dice.purple` (desenhos 169–180) próximos ao exemplo de Barra de Recuperação. A inspeção com `get_drawings(extended=True)` mostrou que os caminhos estão dentro de um clip cuja scissor termina em Y=708,63 pt; os bboxes dos candidatos começam em Y=759,85 pt. O raster do PDF OG em 16× não contém tinta roxa/branca nessas caixas. Foram classificados como falso positivo: não adicionar tokens nem limpar o fundo. Um bbox vetorial isolado não comprova tinta visível; confirme clip ativo e raster do PDF antes de criar um placement.

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

## Um registro mistura cabeçalho, parágrafos e espaçamento editorial

**Sintoma:** um único registro editável contém um passo numerado ou rótulo, mais de um parágrafo e quebras como `\n\n`. O texto pode até manter a contagem total de linhas, mas o espaço entre parágrafos fica maior que no OG, cada parte não pode ser editada ou movida separadamente e o copyfit do bloco inteiro esconde onde surgiu o desvio.

**Como confirmar:** compare cada linha-fonte e baseline do PDF OG com as quebras armazenadas no `segments` e com a distância entre retângulos no Viewer. Confira se o DOM já contém linhas-fonte separadas para cabeçalho e parágrafos. Não use apenas a contagem total de linhas: um intervalo extra pode coexistir com `EXACT`.

**Correção:** quando a fonte e a estrutura editorial confirmarem campos independentes, modele cada cabeçalho numerado e parágrafo em um `typographicUnit` próprio, com `lineIds`, `bbox` e moldura no X/Y de origem. Preserve o texto aprovado, rich text, numeração e recuo. Remova do conteúdo as quebras em branco que apenas simulavam a separação, sem alterar o Y fonte do parágrafo seguinte. Mantenha a tradução-pai como fallback/histórico até que todos os filhos estejam persistidos; meça cada filho no Copyfit V3 a 100% e 200% e confira OG, Viewer e print/PDF, inclusive o espaço até o item vizinho.

**Caso verificado na p.53 (2026-11-18):** `block_25` guardava o cabeçalho do passo 3 e dois parágrafos na mesma tradução `page_53_block_8__pt-BR`. O `\n\n` produzia intervalo de 24,24 pt entre linhas PT-BR, enquanto o parágrafo seguinte começa no OG após aproximadamente uma linha-fonte. A unidade foi dividida em cabeçalho (`line_25_0–1`), parágrafo 1 (`line_25_2–5`) e parágrafo 2 (`line_25_6–11`). Os dois parágrafos preservam X=104,173 pt, recuo de 18 pt em relação ao número em X=86,173 pt e corredor de 299,154 pt. O texto e a ênfase de `2` não mudaram. Copyfit V3 ficou EXACT: 1/1, 4/4 e 6/6 linhas em 100% e 200%; reviews 1816–1818 publicaram translations 2222–2224. O registro-pai 1375 foi mantido como fallback. Export PT-BR final passou `verifiedTranslationRecords=true` e `pdfVerification=true`; Viewer, print e PDF OG foram comparados. A página segue não certificada por pendências terminológicas independentes; esta correção não canoniza `Combatant Card`, `Conviction Check`, `Force Value` nem `Spell-Like Ability`.

**Caso verificado na p.70 (2026-11-19):** `block_59` tinha um título e quatro parágrafos em cinco `typographicUnits`, mas o Payload os guardava juntos em `page_70_block_24__pt-BR` (translation 2119). Foram publicados cinco filhos nos X/Y originais, todos com corredor de 321,174 pt; texto, rich text, espaços e tipografia foram reaproveitados sem reescrita. Na primeira separação, o corte de quebras também removeu espaços finais de runs ricos; a inspeção visual detectou palavras coladas apesar do Copyfit EXACT. Os espaços foram restaurados diretamente do backup do pai 2119, preservando as fronteiras e ênfases dos runs, e os cinco filhos foram medidos e aprovados novamente. Linhas: 1/1, 6/6, 3/3, 7/7 e 5/5, EXACT a 100% e 200%. Reviews 2018–2022 publicaram translations 2385–2389; os históricos de duas unidades mantêm as versões anteriores. O pai 2119 continua intacto como fallback e não é renderizado quando os cinco filhos estão presentes. A exportação confirmou 24 unidades renderizadas no Viewer e no print, `verifiedTranslationRecords=true` e `pdfVerification=true`; o PDF tem página de 820,346 pt, 6.315 caracteres selecionáveis e zero caracteres de substituição ou de uso privado. OG, Viewer e print foram conferidos visualmente, inclusive os espaços entre trechos. Evidências privadas em `engineering-decisions/evidence/2026-11-19-p070-component-limits-structural-units/`.

## Runs tipográficos internos bloqueiam a edição do parágrafo completo

**Sintoma:** o clique abre só um run do parágrafo (por exemplo, texto regular separado de um número em negrito), embora o texto precise ser traduzido como uma frase contínua. O editor pode mostrar apenas parte da frase, e os demais runs continuam ocupando suas posições na origem.

**Como confirmar:** compare o parágrafo completo do PDF OG com `typographicSpanUnits` no DOM. Se os alvos de clique dos runs cobrem a área inteira, a edição da unidade isolada não é suficiente para comprovar a substituição completa.

**Correção aprovada:** selecione um run e use **Editar bloco inteiro** no editor. Reescreva o conteúdo integral do parágrafo nessa unidade, incluindo os termos e números que o formulário parcial não exibia; associe novamente negrito, itálico, cor e símbolos aos trechos equivalentes. Confira se não restaram fragmentos da origem, repita copyfit e compare OG, Viewer e PDF exportado antes de aplicar o mesmo caminho a outros blocos.


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

**Caso verificado:** na p.58, o fluxo de Combatentes COMMAND tem 43 linhas no OG, Viewer e print. No PDF, `lineHeight=1.03` e `paragraphSpacingPt=3.25` alinham os inícios dos bullets ao OG. No Viewer, `lineHeight=1.081` e `paragraphSpacingPt=4.25` compensam o acúmulo de aproximadamente 1,2 pt por transição entre parágrafos; o último topo medido fica em 719,45 pt contra 721,20 pt na fonte, e a próxima unidade fica em Y=735,82 pt contra 736,45 pt. A revisão integral da p.58 foi concluída em 2026-11-17: as 24 unidades estão aprovadas e EXACT em 100%/200%, com export EN/PT-BR verificado e sem clipping ou colisão observáveis. Rótulos de classe e texto impresso em componentes permanecem em inglês por decisão do usuário.

## Símbolos de Ataque desaparecem ou ficam presos à posição antiga na prosa

**Sintoma:** uma referência textual a um Ataque Padrão fica sem o ícone correspondente, ou o ícone permanece na posição antiga depois que a prosa é traduzida. Uma cápsula de Tag `ATK` também pode aparecer sem o marcador gráfico da fonte.

**Como confirmar:** compare PDF OG, Viewer EN, Viewer PT-BR e print. Inspecione os runs ricos, não apenas o texto visível: cada ocorrência precisa preservar o símbolo do tipo de ataque e, quando a prosa cita a Tag impressa, o objeto completo da Tag. Confirme se os objetos estão embutidos na sequência de texto, e não posicionados como vetores independentes que não acompanham a refluência.

**Correção para a estrutura confirmada:** escreva os marcadores semânticos inline no conteúdo (`[[attack.melee]]`, `[[attack.ranged]]`, `[[tag.atk.melee]]`, `[[tag.atk.ranged]]`), preservando o espaçamento e o negrito de `ATK` conforme o OG. O renderer deve materializar cada marcador como objeto de símbolo no fluxo rico. Não desenhe um vetor duplicado nem reutilize coordenadas antigas. Compare EN e PT-BR em Viewer e PDF para confirmar presença, sequência, avanço e ausência de lacunas.

**Verificado na p.58:** ambos os ataques — corpo a corpo e à distância — aparecem com os símbolos inline e as cápsulas `ATK` completas tanto no EN quanto no PT-BR. Os registros ricos guardam os objetos como `symbolId` (`attack.melee`, `attack.ranged`, `tag.atk.melee`, `tag.atk.ranged`); Viewer e print têm a mesma contagem de 6 símbolos semânticos nos dois idiomas. A página passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Evidência privada: `C:\Users\bruno\engineering-labs\planning\engineering-decisions\evidence\2026-11-17-quality-dip-pp56-60\`.

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

## Moldura de unidade tipográfica perde o recuo suspenso da lista

**Sintoma:** o marcador continua na margem-fonte, mas o corpo traduzido começa no mesmo X do marcador ou suas continuações não alinham com a primeira linha. Pode ocorrer quando cada item já é uma unidade tipográfica própria e o `field.frame.x` armazenado aponta para a margem da coluna, apesar de o texto-fonte começar depois do marcador.

**Como confirmar:** no PDF OG, compare o X da tinta do marcador com a origem/X da primeira tinta textual e confira `typographicUnits[].field.frame` no DOM. Meça também a borda direita do corredor. Não trate o X da moldura, sozinho, como prova do início do corpo, e não mova o marcador para compensar uma moldura errada.

**Correção aprovada para unidades com essa estrutura:** ajuste somente a moldura de cada unidade traduzida para o X-fonte do corpo e reduza a largura pelo mesmo deslocamento, preservando a borda direita original. Deixe o marcador e os títulos em suas posições-fonte. Derive `lineHeight` dos baselines do OG. Como recuperar o recuo reduz a largura disponível e pode mudar quebras, refaça copyfit das unidades afetadas; compare linhas, continuações, largura, clipping, colisões e distância até o próximo bloco no Viewer e no print/PDF. Não transforme os valores locais em defaults do renderer.

**Caso verificado na p.69:** nos três corpos de lista do `block_12` e seis do `block_13`, o marcador-fonte começa em X=86,173 pt e o texto em X=104,173 pt (18 pt de recuo). As molduras PT-BR tinham X=86,173 pt, então corpo e marcador coincidiam. As nove molduras foram movidas para X=104,173 pt; as larguras passaram de 317,590 para 299,590 pt no `block_12` e de 321,127 para 303,127 pt no `block_13`, mantendo as bordas direitas em 403,763 e 407,300 pt. O PDF usa avanço de 11 pt nos corpos Optima 10 pt; `lineHeight=1.1` foi aplicado apenas às unidades medidas. Os nove itens ficaram nas mesmas contagens da fonte: 4/1/3 e 6/2/4/7/2/4 linhas. A introdução da p.69 e o texto da coluna direita também foram copyfitados; o último item deixa 12,99 pt antes do próximo título. Viewer e print/PDF final foram conferidos contra o OG; export passou `verifiedTranslationRecords=true` e `pdfVerification=true`.

**Caso verificado na p.13 (2026-11-23):** os três itens da lista de venda (`page_13_block_17`–`19`) tinham molduras PT-BR iniciando no X do marcador-fonte (415,842 pt), embora o corpo começasse em X=433,842 pt. As molduras foram movidas para X=433,842 pt e reduzidas de 318,331 para 300,331 pt, preservando a borda direita X=734,173 pt. O marcador continua na âncora do OG e cada texto continua em uma linha. DOM/Viewer, print da página e PDF exportado confirmam a separação e ausência de clipping; export passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Aplicar apenas após confirmar que a moldura de texto realmente cobre o marcador; refazer copyfit depois de recuperar a indentação.

**Caso verificado na p.57 (2026-11-17):** quatro itens em `block_56`–`block_59` tinham marcador extraído como `U+FFFD` + tabulação, mas o DOM não declarava a linha como lista e as molduras PT-BR começavam na coluna do marcador (X=86,173 pt). O texto, portanto, ocupava o lugar do bullet. Foi restaurada a semântica da primeira linha (`listMarkerLineIndexes: [0]`, `listMarkerGlyphOverride: "•"`) e cada moldura PT-BR foi movida para o início real do corpo (X=104,173 pt; borda direita X=404,504 pt). Os bullets permanecem na âncora-fonte; o texto traduzido aprovado não recebeu bullets duplicados. Copyfit após a correção: 4/4 unidades EXACT em 100% e 200%. Viewer e PDF final coincidem em 48 linhas de texto, 4 símbolos semânticos e 12 imagens; export passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Aplique este procedimento somente quando a inspeção do PDF/DOM confirmar a mesma extração de marcador e a mesma geometria; não presuma recuo de 18 pt em outras listas.

**Caso técnico verificado na p.97 (2026-11-20; snapshot de proposta):** o bullet de exceção da Dynamite é a linha-fonte `line_11_14` (marcador em X=173,294 pt); o corpo editável, `line_11_15`, começa em X=191,294 pt. Embora o texto-fonte já tivesse esse recuo, `typographicUnits[].field.frame.x` usava X=173,294 pt e cobria o marcador quando substituído. A caixa `data.bbox` da proposta não altera a geometria usada pelo render; uma moldura PT-BR explícita em X=191,294 pt, com largura 578,100 pt até a borda original X=769,394 pt, preservou o bullet separado e alinhou o corpo. O recuo reduziu a largura útil: a redação foi condensada para continuar em uma linha, igual ao OG. Copyfit das 32 candidatas ficou EXACT em 100%/200%; Viewer, print e PDF do snapshot mostram o marcador e o corpo separados e sem colisão. A proposta continua não publicada e aguarda revisão editorial; não tratar a redação como decisão global.

## Copyfit deve ser comparado por parágrafo, não só pelo total da página

**Sintoma:** a página pode somar o mesmo número de linhas no total e ainda ter parágrafos traduzidos curtos demais. Uma linha ausente em um parágrafo deixa um vão antes do próximo bloco fixo; outra região mais longa pode esconder essa diferença na soma geral.

**Como confirmar:** compare, parágrafo por parágrafo, as quebras e as baselines no PDF OG, Viewer e PDF exportado. Separe texto editável de texto dentro da arte. Meça também o início do parágrafo seguinte e o espaço até o próximo elemento; a contagem total da página não basta.

**Correção:** complete a tradução com o sentido e as condições que aparecem na fonte; não acrescente palavras apenas para imitar uma quebra. Se uma redação correta naturalmente tiver outra quantidade de linhas, confira se o ritmo e a distância até os elementos vizinhos continuam intencionais. Quando a largura ou o recuo mudar, refaça o copyfit no frame local e nos parágrafos seguintes, mantendo fonte, tamanho e hierarquia sempre que couberem.

**Caso verificado na p.68 (2026-11-19):** a página parecia equilibrada no todo, mas a comparação unidade a unidade revelou quatro diferenças: o corpo de Testes de Perícia de Aventureiros estava 10/11 linhas, e os trechos de conclusão do Salto, IMPORTANT e Exemplo estavam 2/3, 3/4 e 4/5. As quatro redações foram corrigidas sem mudar fonte ou tamanho; ficaram em 10/10, 3/3, 4/4 e 5/5. As outras vinte unidades foram preservadas, e as quatro versões anteriores ficaram no histórico de publicação. A página inteira ficou 24/24 EXACT em 100% e 200%. O OG não tem bullets nem recuos franceses nesta página: parágrafos corridos são flush-left nas duas colunas. Viewer e PDF final EN/PT-BR foram comparados ao OG, sem clipping ou colisões; os exports passaram `pdfVerification=true`, e o PT-BR também passou `verifiedTranslationRecords=true`.

**Caso verificado na p.70:** a comparação encontrou diferenças locais mesmo com a página visualmente próxima: o texto de obtenção de itens tinha 3/4 linhas, a explicação de Habilidades Simultâneas 3/4, o primeiro parágrafo de Efeitos 2/3, a explicação do exemplo 4/5 e o segundo exemplo de Redirect 7/8. A revisão preservou o sentido completo, resolveu a ambiguidade de `drawing cards` sem aplicar uma mudança global ao glossário e alinhou essas contagens. O bloco “Limites de Componentes” ficou em 22/22 linhas; sua última baseline PT-BR está em Y=781,73 pt contra Y=780,73 pt no OG. A extração final conta 121 linhas de texto no OG e na saída PT-BR, incluindo texto-fonte preservado nas cartas. Viewer e PDF foram reexportados; `verifiedTranslationRecords=true` e `pdfVerification=true`.

## Título traduzido pode usar o corredor livre da coluna-fonte

**Sintoma:** um título traduzido quebra em duas linhas mesmo quando o texto cabe na região horizontal limpa da coluna, criando desalinhamento ou aproximando o título do conteúdo abaixo.

**Como confirmar:** confira no PDF OG o limite real da coluna e a distância até ilustrações, ornamentos e texto adjacente. Meça a caixa da tinta do título traduzido; não amplie o frame sobre arte só para evitar a quebra.

**Correção:** ajuste somente o frame PT-BR até o limite vazio comprovado pela fonte. Preserve o X, Y, fonte, corpo, cor e estilos do título; reexporte Viewer e PDF e confira largura, colisão, clipping e a unidade seguinte. Não altere a moldura EN nem transforme o valor medido em default global.

**Caso verificado na p.70:** “Effects, Special Effects, & Ability Limitations” e a tradução “Efeitos, efeitos especiais e limites de Habilidade” ocupam uma linha no OG e no PT-BR. O limite direito local PT-BR foi estendido até X=404,42 pt, dentro do corredor da coluna; a tinta final termina em X=389,32 pt, sem tocar a arte da coluna direita. A fonte Cinzel 12 pt e a geometria vertical foram mantidas.


## Copyfit de lista longa e fluxo de texto na p.71

**Sintoma:** a tradução de uma lista de regras fica muito mais alta que o OG e pode alcançar o próximo título; uma seção posterior também cresce uma linha e perde seu compasso vertical. Em lista longa, o recuo correto por si só não garante copyfit: cada bullet e cada transição entre parágrafos afetam a altura acumulada.

**Como confirmar:** compare item por item com o PDF OG, incluindo X da tinta do marcador e X do corpo, quebras, distância entre bullets e posição do próximo título. Conte linhas no Viewer e no print/PDF exportado e confira se os estilos de entrelinha e espaçamento são efetivamente aplicados nos dois.

**Correção aprovada para esta ocorrência:** preservar o marcador em X=86,173 pt e o corpo/continuações em X=104,173 pt (recuo suspenso de 18 pt); condensar a redação mantendo as regras; ajustar apenas o fluxo da unidade longa (`lineHeight=1.025`, `paragraphSpacingPt=2.8`) e a unidade local de repetição (`lineHeight=1.1`) depois de medir a cadência do OG. Não reduza a fonte nem transforme esses valores em padrões globais sem nova evidência.

**Caso verificado:** na p.71, a primeira tradução da lista de Miniaturas de Base Grande ocupava 36 linhas e avançava sobre “Redução de Valores”; após revisão, ficou em 28 linhas, igual ao OG. “Refazer Rolagens” passou de 8 para 7 linhas, e “Movimento Forçado” manteve 10. Os 14 alvos têm as mesmas contagens no Viewer e no PDF final, sem colisões visíveis. O restante da página e a arte-fonte foram preservados. Evidências privadas em `evidence/2026-11-16-inline-marker-audit/p071-translation-review/`. Os ajustes são locais à p.71.

## Um parágrafo da fonte atravessa mais de um bloco por causa de um marcador decorativo

**Sintoma:** o texto-fonte contínuo foi separado em blocos antes/depois de um marcador grande ou decorativo. A tradução colocada apenas no primeiro bloco pode deixar um fragmento em inglês por baixo, repetir texto, quebrar o enquadramento ou cortar a continuação.

**Como confirmar:** siga a frase pelo PDF OG, spans e blocos-fonte adjacentes; identifique onde a frase realmente termina e se o marcador é prosa, símbolo inline ou arte. Confira o fundo servido: não o cubra por suposição se o texto for uma camada separada e o papel da caixa já estiver limpo. Agrupe as linhas de todos os blocos que compõem o mesmo parágrafo para comparar copyfit.

**Correção para uma frase contínua:** atribua a tradução completa a um único bloco proprietário. Crie um override PT-BR vazio no bloco-companheiro para suprimir somente o fragmento-fonte repetido, sem apagar a unidade original nem alterar as publicações históricas. Se o fluxo exigir, dê ao proprietário uma moldura PT-BR local que cubra a região completa e ao companheiro uma moldura de supressão correspondente. Preserve o símbolo como parte do rich-text ou como símbolo semântico conforme sua função comprovada. Refaça o copyfit da frase inteira e confira estilo, clipping, colisões, Viewer e PDF exportado contra o OG.

**Casos verificados em 2026-11-17:** nas pp.72 e 73, frases contínuas eram divididas por um elemento inline/decorativo entre dois registros-fonte. Na p.73, o bloco 57 passou a possuir a nota completa em cinco linhas e o bloco 58 recebeu override vazio; a estrela foi inserida no rich text como `[[stat.scaling-star]]`, sem duplicar o fragmento em inglês. A caixa clara já estava limpa no `background.webp`, então nenhum patch de máscara foi necessário. O asset transparente da estrela veio do símbolo impresso na própria arte-fonte (`fidelity-overlay-component-inline-scaling-star-transparent.png`, SHA-256 `9579abea991e5e74f1c535d5d312c843a1337a3e6fe37d45db206403120563e4`). A métrica validada foi específica desta ocorrência: largura/avanço `0,85em`, altura `0,90em`, alinhamento vertical `0,22em`, espaço anterior `0,05em` e posterior `0,08em`; não transforme isso numa regra global sem comparar cada símbolo com o OG. A tag passiva do bloco 43 também permaneceu inline como `[[tag.passive]]`. Os cabeçalhos da página foram centralizados em molduras PT-BR largas. As 19 unidades tiveram contagens de linhas iguais à fonte no Viewer e no print, sem excesso medido à direita ou embaixo; a nota preservou cinco linhas. A carta embutida permaneceu em inglês e o PDF final passou a verificação de texto e geometria. Na p.72, a divisão equivalente foi fechada com ownership único e três molduras locais; os detalhes e limites estão no registro privado da revisão.

**Fluxo recorrente:** use `layout-debugging` para seguir a frase e medir os frames; `middara-translation-copyfit` para reescrever e medir o parágrafo inteiro; `visual-fidelity-qa` para verificar Viewer e export. Se o marcador for um vetor preso ao raster, use `alphabet-marker-layout` e só então a skill de overlay/fundo adequada. Um caso confirmado não autoriza alterar automaticamente blocos vizinhos.


## List-flow units ignore saved per-row layout frames

**Sintoma:** em blocos com bullets convertidos para fluxo editável, o recuo ou a largura PT-BR de uma linha parece não surtir efeito, embora exista uma moldura local salva. A linha pode quebrar antes do ponto esperado ou voltar a invadir a coluna vizinha.

**Causa confirmada na p.75:** o renderer criava um filho de fluxo para cada linha/unidade de lista, mas não encaminhava a moldura específica desse filho. A moldura do bloco pai não substitui a moldura local quando o item tem uma chave própria.

**Correção:** ao renderizar cada filho de fluxo, passe a moldura encontrada pela chave estável da unidade (rowUnitKey), com fallback para a moldura herdada PT-BR quando aplicável. Preserve a âncora do marcador e o recuo suspenso; ajuste somente a largura/X da unidade que precisa de copyfit. Se o bloco pai ainda agrupar prosa e bullets numa unidade tipográfica indivisível, divida-o em unidades próprias antes de aplicar molduras por item. Não altere o frame EN/fonte.

**Verificação:** compare cada item com as linhas do OG, confirme que a continuação mantém o recuo, confira colisões e excesso à direita/embaixo no Viewer e no PDF impresso. Na p.75, quatro molduras PT-BR locais tornaram-se efetivas após o renderer encaminhar `layoutFrameOverride` aos filhos de fluxo. As 20 unidades visuais mantêm as contagens de linhas do OG no Viewer e no print, sem excesso à direita ou embaixo. Em 2026-11-21, as 19 unidades v2 foram publicadas; a exportação fresca passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Os bullets de ambas as colunas aparecem no PDF e foram conferidos com o OG.

**Não inferir o eixo da continuação pelo marcador:** algumas fontes alinham as linhas seguintes ao início do item, outras ao início do texto depois do marcador. Meça cada linha no OG antes de escolher o recuo francês. Na p.100, os subpassos `a.`–`e.` das Tabelas 11 e 13 começam 11,34 pt depois dos passos numerados; as continuações voltam ao mesmo X do marcador, exatamente como no OG. Manter esse eixo preservou a hierarquia sem inventar um recuo adicional. As 44 unidades estruturadas de Ataque/Feitiço deram contagem de linhas EXACT no PageRenderer e no OG a 100% e 200% em 2026-11-19. A contagem não substitui a inspeção visual da página exportada.

## O frame compartilhado do bloco apaga o recuo dos bullets filhos

**Sintoma:** o bullet continua desenhado na posição-fonte, mas o texto PT-BR começa sobre ele ou no início da coluna; os marcadores parecem ausentes e a continuação perde o recuo francês. Molduras locais presentes nos filhos podem ser anuladas por um `layoutFrame` compartilhado do bloco.

**Como confirmar:** compare o X/largura do frame efetivamente exportado para cada unidade com o frame do bloco-pai e com o X das linhas-fonte que contêm os marcadores. Inspecione a página em raster; `frame.x` dentro dos dados da unidade não prova que o renderer o adotou. Confirme novamente a quebra e o fim da lista depois de corrigir o X, pois o recuo reduz a largura útil.

**Correção:** quando o render confirmado herdar o frame do bloco para os filhos tipográficos, alinhe o frame compartilhado ao início do corpo do texto e mantenha os marcadores nas posições-fonte independentes. Se o renderer aceitar overrides por unidade, prefira molduras locais explícitas. Preserve EN/fonte e recalcule o copyfit de todos os filhos afetados; não reposicione os marcadores junto com o corpo.

**Caso verificado (2026-11-18; p.77):** o frame herdado `block_199` começava em X=85,705 pt, no mesmo eixo dos marcadores-fonte, e anulava o recuo salvo nos filhos. O corpo PT-BR passou a começar em X=103,705 pt, com largura 315,795 pt; as onze linhas de marcador continuam em X=85,705 pt. Após reexportar, as onze unidades do bloco mantiveram o recuo suspenso nas continuações, sem colisão visível com o rodapé. Viewer e print conferidos contra o OG; a página ainda não está certificada integralmente. Evidências privadas em `engineering-decisions/evidence/2026-11-18-p077-repair/`.

## A medição de copyfit usa uma moldura que o render real não usa

**Sintoma:** a medição de uma tradução diz `EXACT`, mas no PDF exportado um título ou parágrafo quebra, cruza uma linha decorativa ou invade a unidade seguinte. Isso pode ocorrer quando a candidata contém um `data.bbox` maior, enquanto o PageRenderer ainda posiciona a unidade pela moldura-fonte ou por uma moldura salva em `layout_frames.json`.

**Como confirmar:** compare a moldura usada pela medição de Copyfit V3 com `frameRectPt` nos métricos do export real. Verifique a unidade e o idioma exatos; a bbox dentro da candidata não prova que o render a adotou. Reproduza no Viewer e no PDF exportado antes de alterar conteúdo, fonte ou tamanho.

**Correção para a estrutura confirmada:** salve uma moldura local para a unidade e idioma afetados por `/api/layout-frames`, mantendo a borda dentro do corredor livre e o eixo/alinhamento visual da fonte. Não reduza a fonte nem alargue a moldura EN. Depois, remeça a unidade no Copyfit V3 a 100% e 200%, reexporte a página e confirme no Viewer e no print que a contagem, clipping, colisões e distância até o próximo bloco estão corretos. Não transforme a largura medida em padrão global.

**Caso verificado na p.60 (2026-11-17):** “REGRAS DE OURO” media uma linha usando a largura de 170 pt da candidata, mas o export real ainda usava a moldura-fonte de 135,215 pt; o título quebrava e cruzava o divisor. Foi salva uma moldura somente para `page_60_block_1::pt-BR`, com 170 pt, centralizada no mesmo eixo da fonte (X=575,356 pt). A EN permaneceu na geometria original. Após a mudança, `frameRectPt` do export passou a aproximadamente 170 pt e o título ficou em 1/1 linha. A unidade foi remedida em 100%/200%; os exports PT-BR/EN passaram `verifiedTranslationRecords=true` e `pdfVerification=true`, e Viewer/print foram comparados ao OG sem clipping ou colisão visível. Evidências privadas em `evidence/2026-11-15-p060-review/`.

**Revisão integral da p.60 (2026-11-18):** a conferência dos runs contra o PDF OG encontrou quatro unidades com ênfase perdida em ocorrências de `IA`, `0`, `nenhuma` e `exijam`; elas foram restauradas localmente com os pesos e corpos da fonte. Três molduras PT-BR foram normalizadas para o frame efetivamente medido; o título principal precisou de 5,17 pt extras de largura para manter uma linha sem reduzir a fonte. As 16 unidades novas ficaram EXACT em 100%/200%, foram publicadas pelo endpoint oficial após reconciliar os recibos e o frame canônico, e a tradução aprovada anterior permaneceu intacta. A exportação final PT-BR confirmou `verifiedTranslationRecords=true` e `pdfVerification=true`; Viewer e print foram comparados com OG. Isso deixa uma verificação recorrente explícita: conferir cada run de estilo contra a fonte e fazer o copyfit de novo depois de qualquer ajuste de moldura. Evidência privada em `engineering-decisions/evidence/2026-11-18-p060-review/`.

## Título centralizado começa no floreio decorativo e fica cortado

**Sintoma:** o título do banner PT-BR aparece deslocado para a margem; letras iniciais ficam escondidas sob o floreio e só o fim do título permanece visível. O texto e o copyfit podem estar corretos enquanto a moldura PT-BR herdada ainda começa no x do enfeite.

**Como confirmar:** compare o centro do título no OG com o centro da moldura efetivamente usada pelo Viewer. Inspecione `layout_frames.json`, o `textAlign` do dado publicado e `frameRectPt` do export. O bbox-fonte apertado do título não substitui uma moldura larga com alinhamento central; confirme que a tinta do texto não passa por baixo dos floreios.

**Correção:** crie uma moldura somente para a unidade e idioma PT-BR, com largura livre no banner e centro no eixo x do título OG. Defina `textAlign: center` também nos dados ricos da tradução, publique pelo fluxo oficial e salve a moldura via `/api/layout-frames`. Preserve a moldura EN e os adornos. Refaça Copyfit V3 em 100% e 200% e confira o export Viewer/print.

**Casos verificados (2026-11-19):** p.92 `Tags` e p.93 `Tags (continuação)` herdavam uma moldura iniciada em x≈85 pt, sob o floreio esquerdo, deixando apenas “S” ou “S (continuação)” visível. Em ambas, a moldura PT-BR passou a x=102,5 pt, largura 615 pt e centro x=410 pt, alinhada ao OG. A p.93 também restaurou o peso 700 da fonte em Cinzel 18/11 pt. Os dois títulos mediram 1/1 linha em 100% e 200%; exports PT-BR confirmaram `verifiedTranslationRecords=true` e `pdfVerification=true`, e Viewer/print foram comparados ao OG.

## Cabeçalho editorial de continuidade ficou fora da fila de cobertura

**Sintoma:** o corpo da página está traduzido, mas o título principal acima da primeira seção continua em inglês. Isso pode passar se a revisão da página começa na primeira unidade do fluxo editorial e não confere o banner superior contra o PDF OG.

**Como confirmar:** percorra a página desde o topo físico, incluindo o título de continuidade, e verifique se ele possui uma unidade editável e uma tradução ativa. Compare fonte, tamanho, peso, alinhamento, bbox e número de linhas no OG, Viewer e print. Mantenha em inglês apenas termos citados de cartas/componentes conforme a decisão editorial.

**Correção:** traduza o cabeçalho como unidade própria, preservando estilos e geometria da fonte; inclua-o na cobertura da página, meça-o a 100%/200% e valide a publicação pelo fluxo oficial. Não una o título ao primeiro bloco de prosa.

**Caso verificado na p.62 (2026-11-18):** `Intelligent Combatants Continued` estava sem tradução embora o corpo da página estivesse em PT-BR. Foi incluído como `page_62_block_23__pt-BR`, traduzido para “Combatentes Inteligentes (continuação)” e mantido em Cinzel 18 pt/11 pt, negrito e alinhado à esquerda. Copyfit: 1/1 linha em 100% e 200%; review 1792 publicou a tradução 2221; export final confirmou `verifiedTranslationRecords=true` e `pdfVerification=true`. O restante da página continua sem certificação integral.

## Texto traduzido preso em overlay de fidelidade, apesar de existir unidade editável

**Sintoma:** uma inscrição traduzida aparece visualmente, mas não pode ser selecionada como texto; a página parece ter uma box não editável e a camada SVG pode substituir a unidade de tradução. O PDF de origem pode ter uma inscrição única, enquanto a extração contém passagens duplicadas e deslocadas.

**Como confirmar:** compare o raster do PDF OG, `page_<n>_dom.json`, os IDs de linha/bloco e `fidelity_overlays.json`. Confira qual overlay está ativo por idioma e se existe tradução Payload para uma unidade fonte estável. Não conclua que o texto é arte só porque há um SVG: o overlay pode ter sido criado para corrigir uma extração duplicada.

**Correção local quando há uma unidade fonte utilizável:** mantenha a imagem exata do título-fonte no idioma EN; preserve no DOM somente a passagem proprietária e oculte o passe duplicado da página sem apagar sua evidência do DOM/Admin. Renderize PT-BR pela tradução rica editável dessa passagem, com fonte, corpo, cor, peso e alinhamento medidos na fonte. Remova apenas a referência ao overlay PT-BR do sidecar ativo; mantenha o arquivo antigo sem referência até uma limpeza deliberada. Reexporte EN/PT-BR e compare OG, Viewer e print. Confirme seleção/edição da unidade, número de linhas, centralização e que o EN continua pixel-fiel. Não generalize para outros banners sem confirmar duplicidade e propriedade do texto.

**Caso p.50 (2026-11-17):** `block_12/line_12_0` e `block_16/line_16_0` eram dois passes deslocados para o mesmo cabeçalho. `block_16` é a unidade proprietária (`page_50_block_3__pt-BR`, Payload 2173); `block_12` foi ocultado da página e o EN continua usando a imagem-fonte do título. O overlay SVG PT-BR saiu do sidecar ativo; o arquivo não referenciado foi mantido. “Flanqueio e BACKSTAB” agora é texto PT-BR normal e ocupa 1 linha no Viewer a 200% e no print a 100%; exports EN/PT passaram `pdfVerification`, e o PT passou `verifiedTranslationRecords`. Proposta técnica em `proposals/page-050-title-editability-proposal-2026-11-17-v1.json`; evidências privadas em `engineering-decisions/evidence/2026-11-14-p050/p050-editable-title-2026-11-17/`. Não foi criada aprovação humana. A página segue não certificada porque o corpo regular em EN parece mais pesado que o OG; esse problema não foi alterado aqui.

## Peso aparente de OptimaLTStd diverge do PDF OG na renderização da página

**Sintoma:** texto de prosa regular parece mais pesado no Viewer/print que no PDF OG, embora o registro indique `OptimaLTStd` normal, 10 pt e peso 400. Pode ser confundido com tradução marcada em negrito ou com texto-fonte duplicado no fundo.

**Reprodução visual confirmada também na p.64 (2026-11-18):** no mesmo tamanho físico de página (820,346 pt) e em raster de 1094 × 1094 px, a prosa regular do OG parece mais leve que a do Viewer/print EN e PT-BR. Como a diferença também aparece no EN renderizado, não é apenas um estilo de tradução PT-BR. Na p.54, um trecho inglês regular foi comparado com o mesmo bbox do OG: o Viewer tinha 524 pixels claros (>215 por canal) no recorte; a rasterização do PDF exportado, 254; a do OG, 146. Esses totais são um indicador de diagnóstico, não uma medida isolada de peso tipográfico. O `background.webp` correspondente tinha zero pixels acima do limiar, descartando texto-fantasma naquele recorte. No DOM do Viewer da p.54, a família calculada era `OptimaLTStd`, peso 400, e `document.fonts.check` retornou verdadeiro. O PDF OG usa uma fonte CFF incorporada `OptimaLTStd`; o PDF Chromium exportado registra um Type3 sem nome. A p.64 confirma que o sintoma reaparece em outra página, mas não identifica por si só a causa.

**Diagnóstico adicional (2026-11-17):** o PDF OG da p.54 e o asset `Optima LT Std Roman.otf` têm contornos idênticos nos 91 glifos compartilhados da fonte CFF incorporada (zero divergências); a hipótese de asset Roman errado foi descartada para esse conjunto. O PDF OG usa CFF Type1; o PDF do Chromium usa um Type3 sem nome. O padrão observado aponta para hinting/rasterização/resampling, mas a causa exata ainda não está provada. **Próximo passo:** inspecionar os CharProcs Type3 e comparar renderizadores no mesmo tamanho/escala. Não reduzir peso/cor por unidade, não clarear o fundo nem aplicar máscara.

**Estado:** causa-raiz e correção ainda abertos; não usar esta observação para bloquear a tradução nem declarar as pp.50/54 certificadas. Evidência privada da comparação da p.54 em `engineering-decisions/evidence/2026-11-15-p054/p054-font-render-mismatch-2026-11-17/`.

## Um parágrafo contínuo é dividido em unidades tipográficas e deixa fragmentos na posição-fonte

**Sintoma:** uma única frase ou parágrafo aparece no editor como várias unidades por causa de diferenças de fonte, tamanho ou ênfase. Ao traduzir só uma delas, os demais trechos podem continuar ancorados nas linhas do OG; isso pode deixar uma sigla, parêntese ou palavra sozinha depois que o corpo reflowa. A unidade parcial também pode omitir termos que estavam em runs separados.

**Como confirmar:** no PDF OG e em `typographicSpanUnits`, confira se todos os trechos pertencem ao mesmo parágrafo editorial. Compare cada run de estilo, o texto completo e as posições no Viewer/PT-BR e no print. Não junte título, parágrafo seguinte, bullet ou texto de arte só porque estão perto.

**Correção quando a fonte confirma um parágrafo único:** atribua o parágrafo inteiro a um único override de bloco e construa runs ricos para preservar negrito, itálico, tamanho, cor e símbolos semânticos; deixe as unidades antigas intactas para manter o histórico, mas não use traduções parciais concorrentes no fluxo visível. Restaure todas as entidades e condições do inglês. Meça o parágrafo inteiro e exporte Viewer/PDF; aceite a contagem só após conferir que os fragmentos deixaram de ficar presos às âncoras antigas e que nada colide.

**Caso verificado na p.62 (2026-11-18):** o bloco-fonte `block_27` era um único parágrafo em cinco linhas, mas seu último trecho `SOI` estava separado como run em negrito de 9 pt. O override da primeira unidade também omitia “target”. Um override de bloco (`page_62_block_12__pt-BR`, Payload 2220) restaurou “alvo”, manteve Nearest/Farthest em itálico, os equivalentes “mais perto/mais longe” em itálico e `SOI` em negrito 9 pt. Copyfit no PageRenderer: 5/5 linhas, dentro do frame; `verifiedTranslationRecords=true` e `pdfVerification=true`; Viewer e print foram comparados com o PDF OG. Evidência privada em `engineering-decisions/evidence/2026-11-18-quality-dip-p062/`. A correção é local; a página completa segue sem certificação.

## Linha vazia inicial da fonte desloca o texto sobre arte

**Sintoma:** a unidade PT-BR começa dentro de uma ilustração ou componente que, no OG, fica separado da prosa. Copyfit pode continuar marcando a contagem de linhas como EXACT, pois a contagem não detecta uma colisão vertical com arte.

**Como confirmar:** inspecione as linhas do bloco-fonte, não apenas o `bbox` agregado. Identifique se a primeira linha é realmente vazia (por exemplo, texto `\n`) e compare seu Y com a primeira linha que contém tinta no PDF OG. Confira `frameRectPt`, o primeiro retângulo de texto PT-BR e a área da arte no Viewer e no PDF exportado. Não confunda essa linha estrutural vazia com uma quebra de parágrafo editorial que deve ser preservada.

**Correção:** quando a linha inicial vazia só cria espaçamento acima da prosa, salve uma moldura local para a unidade `pt-BR` começando no ink line confirmado pelo PDF. Preserve X, borda direita, largura, sequência de texto, rich text e espaçamento inline dos símbolos. Não altere o bloco-fonte EN ou o fundo; não remova quebras globais sem verificar a estrutura. Atualize o `reviewLayoutFrame`/geometria da proposta e a moldura efetiva em `/api/layout-frames`; depois refaça Copyfit V3 em 100% e 200%, publique a revisão medida e reexporte o PDF.

**Caso verificado na p.66 (2026-11-18):** `block_19` começava em Y=546,837 pt por uma linha-fonte vazia, mas sua primeira linha visível começava em Y=558,835 pt. A tradução `page_66_block_8__pt-BR` herdava o primeiro Y e colidia com o dado roxo impresso acima. A moldura PT-BR foi movida para Y=558,835 pt, manteve o mesmo X e a mesma borda direita e terminou em Y=583,735 pt. O texto permanece em duas linhas, com os dois símbolos semânticos inline. Copyfit V3 ficou EXACT 2/2 a 100% e 200%; o export final apresentou 52 linhas, 13 símbolos e 18 imagens, `verifiedTranslationRecords=true` e `pdfVerification=true`. Viewer e print foram comparados ao OG; a publicação anterior foi preservada no histórico. Evidências privadas em `engineering-decisions/evidence/2026-11-18-p066-review/`.

## Catálogo de revisão ainda aponta para bloco-pai substituído por unidades de fluxo

**Sintoma:** a exportação mostra os parágrafos atuais, mas o Copyfit tenta selecionar um `spanKey` antigo do bloco-pai e fica esperando um alvo que já não é renderizado. A proposta pode conter texto e IDs de símbolo antigos mesmo que o Payload e o Viewer já tenham sido corrigidos.

**Como confirmar:** compare três identidades separadamente: `spanKey` do candidato no catálogo, chave da tradução no Payload e `data-rendered-translation-key`/`translationTargets` do export atual. Confira o texto rico e os IDs semânticos do Payload; não use somente `proposalText` ou a presença de `EXACT` num catálogo antigo. Se o renderer dividir o pai em itens de fluxo, identifique todas as unidades filhas e preserve sua ordem.

**Correção:** rebaseie a proposta nos dados de tradução atuais, crie candidatos para as unidades-filhas que realmente renderizam e faça Copyfit de cada chave atual em 100% e 200%. Arquive o candidato-pai obsoleto depois de preservar seu histórico. Não ressuscite o texto-pai nem copie a lista de símbolos do candidato antigo para os filhos sem conferir o OG. Até a reconciliação, trate o export visual como verificado, mas mantenha a certificação de revisão/Copyfit pendente.

**Caso confirmado na p.67 (2026-11-18):** o bloco-pai `page_67_block_7__pt-BR` passou a renderizar por três unidades (`page_67_unit_p67-block-13-flow-01/02/03__pt-BR`, translations 2069–2071). A proposta antiga ainda aponta para o pai e não contém os símbolos semânticos atuais. A medição em lote esperou por uma chave-pai ausente e expirou; nenhum Payload foi alterado pela tentativa. O export atual continua mostrando os 18 alvos, 38 símbolos (incluindo `combat.skull`) e 28 imagens, sem excesso medido à direita ou embaixo. O recorte visual foi comparado ao OG e ao EN; a página permanece sem certificação porque 15 recibos estão `stale-review-version` e o catálogo ainda precisa ser rebased. Evidência privada em `engineering-decisions/evidence/2026-11-18-p067-recheck/`.

## Glifo inline grande do PDF cria uma linha falsa no Copyfit

**Sintoma:** Copyfit conta uma linha a mais na fonte quando um símbolo inline foi extraído do PDF como um glifo tipográfico grande, com baseline deslocada. O retângulo de tinta pode atravessar a linha de prosa correta, embora a coordenada de baseline do glifo pareça outra linha.

**Como confirmar:** confira o ID semântico da candidata e os spans brutos do PDF OG. Meça a sobreposição vertical dos retângulos de tinta do glifo e da prosa adjacente. A semelhança visual ou a proximidade de baseline, sozinhas, não justificam juntar linhas.

**Correção:** passe os IDs semânticos da candidata para a medição de fonte. Para cada exceção conhecida, associe o glifo grande à linha de prosa somente quando a candidata declarar aquele símbolo e a tinta do glifo realmente se sobrepuser à tinta da prosa. Se não houver sobreposição, conte o glifo como linha própria. Preserve o objeto semântico `[[symbol-id]]` no texto traduzido e não altere avanço, espaçamento ou geometria do símbolo para corrigir uma contagem do PDF.

**Caso verificado na p.72 (2026-11-18):** o PDF OG representa `stat.scaling-star` como `*` em OptimaLTStd-Bold 23 pt. Seu baseline está em Y=125,924 pt, contra Y=117,924 pt da prosa; porém, a tinta do glifo (Y=104,741–132,157 pt) se sobrepõe à tinta da linha (Y=108,734–120,634 pt). O catálogo expõe a identidade pela candidata em `data.managedSourceSymbols`, não por `semanticSymbols`; o medidor foi ajustado para aceitar as duas formas e os `symbolId` dos segmentos. Assim, o falso 7/6 passou a 6/6 sem alterar a tradução ou o objeto inline. As 17 candidatas atuais da p.72 ficaram EXACT em 100% e 200%; Payload não foi alterado e aprovação editorial permanece pendente. Evidência privada em `engineering-decisions/evidence/2026-11-18-p072-reconcile/`.

## Texto-fonte rasterizado faz a extração do PDF subcontar linhas

**Sintoma:** o texto traduzido ocupa mais linhas que os spans extraídos do PDF, embora o OG impresso mostre a mesma quantidade visual. Isso ocorre quando uma camada de fidelidade repõe o texto original como recorte de imagem e o DOM registra o texto selecionável apenas parcialmente como duplicata.

**Como confirmar:** confira `rasterizedDuplicate`/`rasterizedDuplicateEvidence` na unidade-fonte, compare os spans e baselines realmente extraídos com o recorte visual do PDF OG e conte as linhas visíveis no recorte. Depois confira Viewer e print na mesma unidade. Não trate a contagem textual incompleta como a referência visual e não use um override se o recorte completo não estiver disponível.

**Correção:** para a candidata afetada, registre `sourceVisualLineCountOverride` com a contagem observada no OG e inclua justificativa e caminho de evidência estável. O relatório conserva a contagem bruta extraída e identifica que a classificação usa a contagem visual. Mantenha o override local; não o propague a outras unidades ou páginas sem a mesma evidência.

**Caso verificado na p.73 (2026-11-18):** a nota inferior tem cinco linhas visíveis no OG e cinco no PT-BR Viewer/print, mas a fonte `block_126` está marcada no DOM como duplicata rasterizada e fornece apenas três linhas de texto selecionável. A candidata `page_73_block_57__pt-BR` agora registra contagem visual 5, mantendo as 3 linhas extraídas como evidência. Copyfit V3 ficou EXACT 5/5 em 100% e 200%; o texto e o layout não foram alterados. O recorte oficial foi preservado fora do repositório em `engineering-decisions/evidence/2026-11-18-p073-copyfit-visual-override/p073-og-note-source-crop.png`.

## Símbolo semântico substitui numeral impresso na prosa

**Sintoma:** a fonte representa uma quantidade ou classificação com um numeral desenhado junto de um ícone. Ao converter o desenho para `[[symbol-id]]`, a tradução pode repetir o numeral como quantidade e alterar o sentido — por exemplo, ler “ícone de 2 mãos” como “2 armas”.

**Como confirmar:** no PDF OG, compare o glifo, os vetores que compõem o símbolo e o texto explicativo que vem depois. Confira `coveredSourceText`, o span âncora e os espaços literais em `inline_elements.json`. Determine se o numeral foi coberto pelo símbolo ou se existe também uma quantidade independente no texto. Não deduza isso só pelo rótulo do token.

**Correção:** mantenha o objeto `[[symbol-id]]` inline no texto e não repita como quantidade o numeral-fonte que ele substitui. Preserve separadamente o rótulo explicativo que a fonte realmente imprime depois do ícone e mantenha os espaços medidos ao redor do objeto. Reorganize a frase em português se isso evitar ambiguidade; então refaça Copyfit V3 e compare Viewer e PDF com o OG.

**Caso verificado na p.78 (2026-11-18):** o ícone `weapon.hand.two` substitui o glifo-fonte “2”; o texto seguinte ainda traz “(2-Handed)”. A tradução antiga “`[[weapon.hand.two]]2 Armas de 2 Mãos`” parecia indicar duas armas. O texto foi reordenado para “Armas de `[[weapon.hand.two]]` 2 Mãos”, mantendo o rótulo em português e o espaço literal registrado na fonte. A unidade ficou 5/5 linhas em 100% e 200%, foi publicada como translation 1483/review 1024 e passou a exportação PDF por snapshot imutável (`verifiedTranslationRecords=true`, `pdfVerification=true`). A p.78 permanece não certificada no conjunto; esta correção local não aprova os demais blocos.

**Revalidado na p.78 (2026-11-23):** a unidade de Empunhadura Gigas (translation 1483/review 1024) agora mantém os quatro símbolos inline e alinhados às linhas do OG. `weapon.hand.two` fica na linha 3; `attack.melee`, `attack.melee-ranged` e `weapon.hand.one` ficam na linha 4, com `1 Mão` junto do último ícone. A ressalva “regras normais de equipamento” foi movida para o fim da frase; uma quebra explícita antes do primeiro tipo de Ataque e `lineHeight=1.2` alinham as baselines sem sobrepor o parágrafo seguinte. Copyfit V3: EXACT 5/5 em 100% e 200%. Diferença vertical medida entre Viewer e fonte: 1,34 pt para `weapon.hand.two`, 0,34 pt para `attack.melee`/`attack.melee-ranged` e 0,33 pt para `weapon.hand.one`. A aprovação foi reconciliada pelo endpoint oficial e a versão anterior ficou em `publication.history`. Export Viewer/print confirmou `verifiedTranslationRecords=true` e `pdfVerification=true`; a certificação do restante da p.78 continua aberta.

## Título centralizado exige frame e alinhamento do rich text

**Sintoma:** um título parece centrado depois de deslocar sua moldura, mas a caixa de edição continua assimétrica/estreita; ao centralizar somente o frame, o texto ainda aparece à esquerda.

**Causa e confirmação:** em `PageRenderer`, o `textAlign` explícito da tradução prevalece sobre `layoutFrame.textAlign`. Inspecione o retângulo salvo e os bounds de tinta no export; não conclua que a caixa está correta só porque o centro da tinta parece alinhado. Em sidecars legados, `width` sem `total` representa a largura física; nos registros canônicos, use `total` e `width = x + total`.

**Correção:** use um frame padrão centrado no corredor do ornamento, alinhe também `data.textAlign` da unidade e refaça Copyfit/export. Preserve o texto e a tipografia se a correção for somente geométrica; valide Viewer e print contra o eixo do OG.

**Caso verificado na p.64 (2026-11-18):** o título “TURNO DO COMBATENTE INTELIGENTE: PASSO A PASSO” usava um frame `left` deslocado manualmente, menor que a tinta do texto. Frame PT-BR `page_64_block_48` salvo como X=125 pt/largura=570 pt e alinhamento central; `data.textAlign` da tradução 2048 também passou para `center`. A tinta final ocupa uma linha e centra em X≈410 pt, contra X=409,973 pt no OG; export PT-BR passou `verifiedTranslationRecords` e `pdfVerification`. O resto da p.64 permanece aberto.

## Copyfit mostra uma moldura maior que o Viewer/PDF publicado

**Sintoma:** a proposta mede o mesmo número de linhas do OG, mas o texto publicado volta a quebrar dentro da moldura menor da fonte. Isso pode ocorrer quando o preview de revisão aplica `reviewLayoutFrame` temporariamente, enquanto a exportação normal só consulta `/api/layout-frames`; salvar `data.bbox` da tradução não persiste uma moldura.

**Como confirmar:** compare a largura usada em `pageRendererEvidence.frameWidthCssPx` com o registro atual de `/api/layout-frames` da página e do idioma. Depois confira uma exportação nova do Viewer e do PDF após aprovação. Não trate a medição do preview isolado como prova da geometria publicada.

**Correção:** quando a correção aprovada depender de uma moldura maior ou deslocada, grave-a em `layout-frames` com `frameKey` e `unitKey` corretos (por exemplo, `page_82_block_13::pt-BR`), leia o registro de volta, rode Copyfit V3 novamente e gere uma exportação nova. Preserve a decisão editorial do texto; só reescreva a frase se a moldura real não oferecer espaço suficiente. Confirme que Viewer e print/PDF usam a mesma moldura e que o conteúdo permanece dentro da caixa de arte.

**Caso verificado (2026-11-19; p.82):** a chamada IMPORTANTE media uma linha no preview usando 313,2 pt, mas a exportação sem frame salvo ainda herdava os 193,9 pt do texto-fonte e a quebrava em duas. A moldura foi persistida em `layout-frames` como `page_82_block_13::pt-BR` (Payload id 185), com largura total de 313,2 pt. A nova exportação Viewer/PDF voltou a uma linha, com `[[tag.important.icon]]` ao lado da chamada; as 17 unidades da página ficaram EXACT em 100% e 200%, e o export passou `verifiedTranslationRecords=true` e `pdfVerification=true`.

**Caso verificado (2026-11-20; p.91):** o preview usava uma moldura temporária de 460 pt, mas a rota normal do Viewer mantinha a moldura PT-BR salva de 320 pt para o título `Tags de Combatente`, que quebrava a 200%. Alterar apenas `reviewLayoutFrame`/`bbox` não mudou o Viewer publicado. A moldura foi persistida em `layout-frames` (registro 199; `page_91_block_0::pt-BR`), X=180 pt, largura total=460 pt e centro X=410 pt; a leitura de volta confirmou o registro. O título passou a uma linha em 100%/200%, e os exports Viewer/PDF foram refeitos depois da gravação. O restante do texto e a decisão editorial ficaram preservados.
**Caso verificado (2026-11-20; p.95):** na exportação real, cinco traduções ainda usavam frames menores ou diferentes dos reviewLayoutFrames medidos. As linhas de DODGE, HEAL e Intervention (Tabela 4) quebravam contra a linha seguinte; “Obtenha +1 SP” (Celeridade) e o descarte de Coragem também herdavam caixas da largura dos glifos ingleses. Os frames PT-BR dos blocos 19, 21, 39, 42 e 44 foram alinhados às bordas da célula de Efeito com recuo de 4 pt, preservando X, Y, altura, fonte, rich text e conteúdo. Os cinco registros foram lidos de volta do Payload; Copyfit V3 ficou EXACT em 100% e 200%. Nova exportação Viewer/print/PDF passou verifiedTranslationRecords=true e pdfVerification=true; raster em tmp/qa-p095-2026-11-20/p095-frame-fixed-verified-pdf.png confirma as cinco linhas sem colisões. A página continua parcial por outros motivos; não propagar essas larguras para outras células.

## Frame salvo move prosa traduzida para outra coluna

**Sintoma:** o copyfit continua EXACT, mas a prosa aparece em outra coluna ou sobre um badge. Uma moldura local de página pode deslocar o bloco inteiro sem mudar a contagem de linhas; verificar só largura e copyfit não detecta a colisão.

**Como confirmar:** confira a chave do frame em `layout_frames.json` contra o ID do bloco no DOM. Compare `x`, `width` e alinhamento salvos com o `bbox` do bloco-fonte no PDF OG e inspecione a exportação final. Não trate `data.bbox` de tradução como substituto do frame que o renderer realmente herda.

**Correção:** se o deslocamento não fizer parte de uma decisão de layout aprovada, restaure o frame à geometria da unidade-fonte e reexporte Viewer/PDF. Refaça Copyfit nas escalas usadas antes de aprovar texto ou layout; confirme também que cada badge e seu parágrafo continuam na coluna correta.

**Caso fechado (2026-11-19; p.90):** `layout_frames.json` aplicava a `block_13` um frame em X=86,17 pt/largura=140 pt, embora o bloco-fonte da tag PER ENCOUNTER pertença à coluna direita, em X=529,22 pt/largura=211,39 pt. O frame global foi restaurado à geometria do OG. O export persistido então revelou dois ajustes que o preview anterior não cobria: a cápsula EXHAUST sobrepunha a prosa PT-BR e a descrição de PER ENCOUNTER ocupava duas linhas, contra três na fonte. A unidade PT-BR de EXHAUST recebeu moldura própria (`page_90_block_2::pt-BR`, x=190 pt) e texto mais conciso; PER ENCOUNTER recuperou a explicação completa em três linhas. Copyfit final: 16/16 EXACT em 100% e 200%; PDF PT-BR fresco com `verifiedTranslationRecords=true` e `pdfVerification=true`; OG, Viewer e print comparados. Evidências em `tmp/qa-p090-2026-11-19/p090-final-*` e propostas v2–v4 da p.90.

## Rich text Cinzel traduzido perde small caps no render principal

**Sintoma:** um cabeçalho traduzido parece texto comum ou usa a caixa errada, embora a fonte e o peso do registro pareçam corretos. Copyfit pode continuar EXACT porque a contagem de linhas não detecta small caps ausente.

**Como confirmar:** compare o OG com `page_<n>_dom.json`. Para spans `Cinzel-Regular`, confira `renderWeightOverride` e `mapPdfFont(...).variantCaps`; inspecione também `fontVariantCaps` computado no segmento PT-BR do Viewer e do print. Não confunda essa divergência com o problema de rasterização de Optima.

**Correção:** no render de segmentos ricos, aplique `fontVariantCaps: mapPdfFont(segment.font).variantCaps`. Na tradução, preserve também família, tamanho, cor e peso da fonte OG. Meça novamente a unidade e compare OG, EN, Viewer e print; não centralize o título se o OG estiver alinhado à esquerda.

**Caso verificado na p.80 (2026-11-18):** três cabeçalhos (`The Alternate Tag`, `Prerequisite Types` e `Possible Spawns`) estavam salvos como Optima 10 pt regular, embora o OG use Cinzel-Regular 12 pt com peso 700 e small caps. Os dados das traduções foram corrigidos, e o render principal passou a aplicar a variante small caps já mapeada para Cinzel. Os cinco cabeçalhos Cinzel da página foram reexportados e medidos; 35/35 unidades ficaram EXACT em 100% e 200%. O export PT-BR passou `verifiedTranslationRecords=true` e `pdfVerification=true`; OG, EN, Viewer e print foram comparados. A p.80 está fechada localmente; isso não certifica o restante do livro.

**Também verificado na p.45 (2026-11-23):** `Making an Attack` usa `Cinzel-Regular` 18 pt branco com `renderWeightOverride: 700` no bloco-fonte `block_209`. A tradução ativa `Realizar um Ataque` já renderizava em 700, mas o recibo aprovado 775 estava em 400. Mantive o peso ativo, alinhei a proposta e os três registros de amostra do Copyfit ao override-fonte e reconciliei o recibo pelo endpoint oficial; o snapshot 400 anterior continua no histórico. A medição vigente é 1/1 linha em 100% e 200%; OG e Viewer atual foram comparados visualmente. Não generalize o peso pelo nome `Cinzel-Regular`: confira `renderWeightOverride` e a aparência da ocorrência. A exportação final da página continua pendente porque o PDF completo antecede uma revisão recente do texto da p.45.

## Texto minúsculo dentro de símbolo inline vira linha duplicada na extração do PDF

**Sintoma:** o Copyfit identifica uma linha extra na fonte quando um pequeno rótulo impresso dentro da arte de um símbolo semântico também é extraído como texto separado ou anexado a outro span.

**Como confirmar:** confira a captura do PDF OG e o ID semântico inline da unidade. Compare as baselines e as caixas de tinta extraídas com a posição do rótulo dentro do símbolo. Conte a linha que o leitor realmente vê; não replique o rótulo como prosa nem o use como uma sexta linha só porque existe um span extraído.

**Correção:** registre `sourceVisualLineCountOverride` somente para a candidata afetada, com justificativa visual e evidência estável. Preserve o símbolo `[[symbol-id]]`, mantenha o rótulo original dentro da arte e confirme a contagem no Viewer e no print. Não aplique o override a outros ícones sem conferir o OG.

**Caso verificado na p.83 (2026-11-19):** o `token.blue-totem` tem o rótulo impresso “BLUE” em 2,01 pt dentro do próprio token. O PDF extraía esse rótulo como spans separados e a contagem bruta subia para seis, embora o OG mostre quatro linhas de prosa. A candidata `page_83_block_1__pt-BR` usa override local 4/4; `[[marker.reference.a]]` e `[[token.blue-totem]]` continuam inline e não houve mudança de texto. Copyfit V3 ficou 4/4 em 100% e 200%; o export persistido passou `verifiedTranslationRecords` e `pdfVerification`. Evidência privada em `engineering-decisions/evidence/2026-11-19-p083-copyfit-symbol-row/`.

**Caso verificado na p.84 (2026-11-19):** o preview da proposta mostrava os títulos `EXEMPLO ALTERNATIVO`, `EXEMPLO DE VARIAÇÃO` e `SURGIMENTOS FINAIS` em frames temporários, mas a exportação publicada usava a caixa estreita do OG; dois títulos quebravam e um era cortado. O parágrafo de seleção de carta também precisava da moldura maior já registrada para o bloco 18. Os quatro frames foram gravados em `layout-frames`, conferidos por leitura de volta e usados em Copyfit V3 e export fresco. A p.84 ficou 23/23 EXACT em 100%/200%, sem clipping no Viewer/print; o PDF passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Evidência privada em `engineering-decisions/evidence/2026-11-19-p084-finalization/`.

## Marcador alfabético inline cria linha falsa na contagem de Copyfit

**Sintoma:** a contagem extraída do PDF-fonte fica uma linha acima do que o leitor vê porque o marcador A–Z de uma chamada é extraído como span separado, com baseline deslocada, embora a tinta do marcador esteja junto da prosa.

**Como confirmar:** confira texto, bbox de tinta e baseline no PDF OG e localize o `[[marker.reference.*]]` da unidade. Só trate o marcador como parte da linha de prosa quando as caixas de tinta provarem a sobreposição vertical; uma letra distante ou um rótulo dentro de arte não deve ser unido por semelhança.

**Correção:** rode `scripts/measure_copyfit_page.mjs` com o agrupamento por linha-fonte e a junção condicional de marcadores sobrepostos; meça de novo em 100% e 200%. Não compense a linha falsa alterando a tradução nem aplique override global a marcadores alfabéticos.

**Caso verificado na p.67 (2026-11-19):** os marcadores `E`, `J`, `C` e `G` nos blocos 9, 11, 12 e 13 eram spans separados do PDF, mas continuavam inline com a prosa no OG. A extração antiga inflava essas unidades em uma linha cada; a medição visual atualizada ficou 2/2, 5/5, 7/7 e 5/5, respectivamente. As 18 unidades ativas ficaram EXACT em 100% e 200%; o catálogo foi refeito e os recibos atuais aprovados. Evidência privada em `engineering-decisions/evidence/2026-11-19-p067-final-review/`.

## A revisão aprovada diverge da formatação salva na tradução

**Sintoma:** a publicação pelo fluxo de revisão é bloqueada porque a tradução atual não é idêntica à cópia da última aprovação. Isso pode acontecer quando a própria tradução recebeu ajustes de entrelinha ou espaços tipográficos antes de símbolos inline sem atualizar o registro de revisão.

**Como confirmar:** compare a tradução salva, `publication.data` da revisão e a candidata. Permita reconciliação somente quando o texto atual, os segmentos ricos e o estado de publicação antiga coincidirem após remover exclusivamente diferenças de formatação reconhecidas. Confira também família/peso/estilo de todos os runs, sequência/ID dos símbolos e as posições dos espaços. A candidata precisa preservar exatamente essas decisões, ter Copyfit V3 canônico e conter a alteração editorial a aprovar. Divergências desconhecidas continuam bloqueando a publicação.

**Correção:** ao aprovar, gravar na mesma operação a candidata medida e o formato reconhecido, mantendo a publicação anterior no histórico. Não editar a tradução diretamente nem apagar o conflito. Depois, reler tradução e revisão pelo Payload, refazer Viewer/print e confirmar `verifiedTranslationRecords=true` e `pdfVerification=true`.

**Caso verificado (2026-11-19; p.54, bloco 5):** o texto PT-BR tinha quatro linhas contra cinco no OG; a tradução salva ainda trazia entrelinha personalizada `1,18` e um espaço antes de cada dado, ausentes da publicação de revisão antiga. A nova redação restaurou “Força final”, a obrigação de fazer o Teste de Convicção e “total de 7”; preservou os runs ricos, `[[symbol:dice.white]]`, `[[symbol:dice.teal]]`, espaços e entrelinha. A reconciliação restrita foi publicada pelo endpoint oficial com uma entrada de histórico preservada. Copyfit V3: 5/5 em 100% e 200%; Viewer e PDF impresso têm cinco linhas e os dois dados inline. Export PT-BR passou `verifiedTranslationRecords=true` e `pdfVerification=true`; comparação OG/Viewer/print confirmou a região. Evidência em `tmp/qa-p054-2026-11-19/p054-block5-og-vs-pt-final.png` e `p054-block5-og-vs-pt-print.png`. A p.54 permanece aberta para auditoria visual da página inteira e reconciliação terminológica.

**Caso verificado na p.102 (2026-11-20):** 13 das 19 traduções ativas diferem do snapshot aprovado em conteúdo, runs ricos, símbolos ou quebras; não é deriva apenas de espaço ou entrelinha. A guarda do endpoint oficial bloqueia corretamente a republicação para proteger a tradução existente. Mantenha texto e histórico intactos, registre a divergência e não edite o snapshot aprovado diretamente. Uma reconciliação futura precisa apresentar o payload atual como nova revisão explícita, com Copyfit V3 canônico, vínculo à aprovação anterior e preservação do histórico. Até esse fluxo existir, mantenha a página parcial.

## Tabela em um único bloco-fonte precisa de unidades por célula

**Sintoma:** a extração do PDF agrupa caption, faixas de seção e vários cabeçalhos numa única unidade, fazendo uma tradução ampla herdar posição ou largura inadequada de uma célula específica.

**Como confirmar:** compare a grade e os limites de cada célula no PDF OG com os `lineIds`, bboxes e caixas dos blocos no DOM. Confirme que cada alvo é um campo editorial completo e que a moldura termina dentro da própria célula.

**Correção:** adicione `typographicUnits` separados para captions, faixas e cabeçalhos, usando a geometria medida no OG. Preserve hierarquia, fonte, cor, peso e alinhamento. Meça cada unidade em 100% e 200% e confira Viewer, print e PDF exportado; não reduza a fonte ou replique uma largura de outra coluna sem evidência.

**Caso verificado na p.95 (2026-11-20):** as três tabelas tinham captions, faixas de seção e cabeçalhos de coluna embutidos nos blocos-fonte. Foram criadas unidades pelas células medidas, além dos quatro rótulos Tier. As 61 candidatas ficaram EXACT em 100% e 200%; o Viewer e o raster do PDF mantiveram os cabeçalhos dentro das células e as linhas da nota abaixo da tabela, sem colisões. A exportação imutável passou `verifiedTranslationRecords=true` e `pdfVerification=true`; a proposta segue sem aprovação/publicação.

**Também verificado na p.96 (2026-11-20):** 11 cabeçalhos das Tabelas 6–8 e as 18 células da Tabela 8 foram separados pela grade medida no OG. Os rótulos longos das fichas de Habilidade/Efeito foram reorganizados em uma linha, sem reduzir fonte. As 58 candidatas da página ficaram EXACT em 100% e 200%; o snapshot imutável passou `verifiedTranslationRecords=true` e `pdfVerification=true`, e o Viewer/print foram comparados ao OG. É uma prévia de proposta, ainda sem publicação ou aprovação editorial.

## Caixa de tabela começa no X de um símbolo em outra coluna

**Sintoma:** o texto de uma linha começa sobre o ícone ou custo da coluna vizinha, embora a caixa pareça alinhada com o bloco-fonte.

**Como confirmar:** compare o X do primeiro span de prosa com o X do bloco completo. Um bloco-fonte pode incluir um placeholder, número ou símbolo em outra coluna e, por isso, começar antes do texto. Confira a grade do OG e os símbolos visíveis no Viewer/print; o bbox do bloco inteiro não representa necessariamente a origem da prosa.

**Correção:** use um frame local da tradução ancorado no primeiro span textual, com largura até a borda interna da coluna, medida no OG. Preserve o bloco e o símbolo-fonte; não mova conteúdo compartilhado nem copie a largura de outra coluna. Refaça Copyfit em 100%/200% e exporte um snapshot imutável para revisar a posição dos ícones e a quebra do texto.

**Caso verificado em proposta na p.96 (2026-11-20):** na Tabela 6, os blocos que incluem o custo SP começavam em X=137,74 pt, mas a prosa começa em X=162,19 pt. A mesma diferença afetava os dois parágrafos de Esquiva. Cinco frames locais foram alinhados ao início da prosa, usando a largura interna da coluna de Efeito; a exportação mostra as frases depois do símbolo SP, sem colisão, e as contagens de linha continuam EXACT. A proposta permanece pendente; não generalize estes X para outras tabelas.

## Marcador semântico de símbolo aparece como quadrado vazio ou branco

**Sintoma:** um símbolo aparece como quadrado vazio/branco no Viewer ou no PDF, embora a proposta tenha um segmento com `symbolId`.

**Como confirmar:** compare o marcador textual da proposta com os segmentos ricos. O `proposalText` deve usar `[[symbol:<id>]]`; `data.segments` representa o mesmo ponto com `text: "￼"` e `symbolId`. Para símbolos monocromáticos com `currentColor`, confirme também que o segmento recebeu a cor de tinta medida no PDF-fonte (normalmente `#231f20`). Não presuma que `symbolId` sozinho garanta aparência e cor corretas.

**Correção:** sincronize cada `[[symbol:<id>]]` com o segmento rico correspondente, preserve espaçamento e métricas semânticas do símbolo e copie sua cor do trecho-fonte. Refaça Copyfit em 100%/200%, exporte Viewer e print e compare o glifo ampliado com o OG.

**Caso verificado em proposta na p.96 (2026-11-20):** 12 marcadores em `proposalText` estavam como U+FFFC e nove segmentos de símbolos monocromáticos não tinham cor explícita. Foram trocados pela sintaxe `[[symbol:<id>]]` e receberam `#231f20`; símbolos coloridos mantiveram a própria renderização. Os glifos voltaram a aparecer em preto no Viewer e no PDF exportado, sem mudança de contagem de linhas. A proposta continua pendente de revisão editorial.

**Também verificado na p.100 (2026-11-20):** seis unidades traziam em `proposalText` marcadores `⟦id⟧`, U+FFFC ou nenhum marcador, apesar de `data.segments` conter os símbolos corretos. Normalize `proposalText` para `[[symbol:<id>]]` sem alterar a ordem dos segmentos nem o `symbolId`. Os 75 alvos da proposta ficaram EXACT em 100% e 200%; o snapshot de página inteira manteve 9 símbolos, passou `verifiedTranslationRecords=true` e `pdfVerification=true`, e foi comparado em Viewer/print/PDF ao OG. A proposta continua não publicada; a regra de sincronizar as duas representações não equivale a aprovação editorial.

**Caso verificado na p.64 (2026-11-18):** dados e ícones que ainda estavam desenhados em coordenadas fixas na prosa foram associados às ocorrências correspondentes como símbolos semânticos inline. O Viewer e o print mostram os símbolos junto ao texto refluído, sem duplicatas nas posições originais; as cartas ilustradas continuam intactas em inglês. São 22 objetos semânticos na página. Ver [revisão da p.64](pages/page-064.md) e a evidência privada.

## A moldura de proposta parece correta, mas o Viewer persistido a limita à largura-fonte

**Sintoma:** uma prévia de proposta mantém três cabeçalhos na mesma linha, mas, depois de salvar e abrir o Viewer, o último cabeçalho quebra porque o renderer limita o texto à largura disponível do bloco-fonte.

**Como confirmar:** compare no DOM/renderizador a largura da candidata com `availableWidth` do bloco persistido. Faça a checagem no Viewer salvo e no print/PDF; o snapshot imutável de proposta, sozinho, pode não reproduzir a limitação aplicada ao registro persistido.

**Correção:** ajuste a moldura PT-BR ao limite real da célula-fonte e recalcule o espaçamento interno até que cada rótulo caiba sem exceder essa largura. Depois salve pelo fluxo oficial, reabra o Viewer persistido e exporte print/PDF para confirmar a mesma quebra e alinhamento.

**Caso verificado na p.97 (2026-11-21):** a candidata da coluna EFEITO cabia em um snapshot com moldura de 450 pt, mas o Viewer persistido aplicava `availableWidth=406,248 pt` e quebrava o rótulo. A moldura v7 passou a usar exatamente 406,248 pt; NOME/FICHA/EFEITO permaneceu na linha do OG no Viewer persistido, print e PDF final. A publicação foi relida do Payload e o export passou `verifiedTranslationRecords=true` e `pdfVerification=true`.

## Fila de revisão deve ficar inativa enquanto o painel está fechado

**Sintoma:** o Viewer chega a renderizar a página, mas o export do Chromium trava ao medir `.page-container`, sobretudo em páginas com muitas unidades PT-BR.

**Causa confirmada:** `TranslationReviewPanel` continua montado quando fechado. Seus `useMemo` ainda preparavam a fila inteira; para cada registro publicado, procuravam candidatos e voltavam a filtrar/ordenar todos os registros. Isso bloqueava o event loop mesmo sem o painel visível.

**Correção:** preserve o componente montado para manter filtros e rascunhos, mas faça as derivações pesadas retornarem listas vazias quando `open` for falso. Retorne `null` depois dos hooks, antes de calcular as listas derivadas usadas só no painel. Não resolva isso com timeout maior ou clicando em Fit repetidamente.

**Caso verificado na p.101 (2026-11-21):** antes da guarda, o export oficial parava em `capturePageMetrics` após carregar 198 unidades aprovadas. Depois, Viewer e print foram medidos com 933 linhas de geometria e 198 imagens; o PDF de uma página foi normalizado ao MediaBox-fonte 820,346 × 820,346 pt e passou `verifiedTranslationRecords=true` e `pdfVerification=true`. O build TypeScript/Vite também passou.

## Título PT-BR quebra, mas há espaço livre antes da arte adjacente

**Sintoma:** um título traduzido quebra em duas linhas dentro de uma moldura estreita, embora o PDF OG mostre uma linha e exista um corredor de página livre antes da ilustração.

**Correção:** meça a largura de tinta do título e a borda real da arte. Amplie somente a moldura PT-BR até o limite seguro, mantendo uma folga visível; confira que o título voltou à contagem do OG e não encostou na arte nem no corpo seguinte. Se não houver espaço, refraseie antes de reduzir fonte. Refaça o copyfit e valide Viewer e PDF exportado.

**Caso verificado na p.4 (2026-11-21):** `Miniaturas de Plástico` precisava de aproximadamente 4,9 pt além da moldura herdada. A moldura PT-BR local passou a 153 pt, terminando em X=239,527 pt, com 5,473 pt até a arte em X=245 pt. O título voltou a uma linha; os 14 corpos mantiveram as contagens do OG no Viewer e no print/PDF. Exportação persistida: `verifiedTranslationRecords=true`, `pdfVerification=true`, MediaBox 820,346 × 820,346 pt.

## Último glifo de um texto fica oculto por uma camada opaca de preservação do fundo

**Sintoma:** a tradução e a moldura incluem o texto completo, mas a última letra (ou outro trecho) some no Viewer ou no PDF. A caixa pode medir sem overflow e o texto pode aparecer inteiro no DOM, enquanto uma faixa de imagem/fundo sobreposta cobre parte da tinta.

**Como confirmar:** compare OG, Viewer e PDF no mesmo zoom; confirme o texto e as dimensões da moldura e use hit-testing no ponto do glifo (`document.elementFromPoint`) para identificar a camada que o cobre. Inspecione a extensão real da imagem/patch e a arte adjacente. Não aumente a largura da caixa sem evidência de que o texto realmente excede o corredor disponível.

**Correção:** se a camada opaca preserva apenas textura de fundo e termina antes da arte/componentes, ajuste a ordem de empilhamento somente da unidade textual afetada para que ela fique acima do patch. Não eleve um bloco amplo que também cruze arte real; nesse caso, delimite a unidade/patch ou use uma solução local que preserve a ordem da composição. Reconfira a região inteira em Viewer e PDF, inclusive os elementos visuais imediatamente seguintes.

**Caso verificado na p.5 (2026-11-21):** a última letra de `Cartas de Consulta Rápida` estava coberta por uma imagem opaca de preservação do fundo com `zIndex=10000`, embora o título e a moldura estivessem corretos. O hit-test identificou a imagem no ponto da letra. A unidade do título foi elevada localmente acima do patch; o texto termina antes das cartas ilustradas e não encobre arte. O título completo aparece no Viewer e no PDF exportado, comparados com o OG; os 24 alvos ativos da página mantiveram a contagem de linhas da fonte, sem excesso ou colisões. **Status:** solução validada para esse caso; confirme a geometria antes de reaplicá-la.

## `bbox` da tradução atualizado, mas o Viewer ainda usa a moldura antiga

**Sintoma:** a proposta ou o registro da tradução mostra uma caixa ampliada e o Copyfit da candidata passa, mas o texto publicado continua quebrando na largura anterior. Em blocos de texto legados, `data.bbox` da tradução não substitui a moldura de fluxo que o `PageRenderer` lê de `layout-frames`.

**Como confirmar:** confira o retângulo efetivo do bloco no Viewer/export e compare-o com o registro `layout-frames` para a chave `page_N_block_M::pt-BR`. Não conclua que a moldura foi aplicada só porque o `bbox` da tradução ou `reviewLayoutFrame` mudou.

**Correção:** salve a moldura PT-BR pelo fluxo oficial de layout (chave da unidade e idioma), confirme a leitura de volta no Payload, rode Copyfit em 100% e 200% e faça uma exportação persistida nova. Preserve a moldura EN e reavalie line count, recuo, gutter e unidades vizinhas.

**Caso verificado na p.14 (2026-11-21):** `page_14_block_1__pt-BR` tinha `bbox` de 319,677 pt, mas não havia registro PT-BR correspondente em `layout-frames`; o Viewer continuava com os 316,086 pt do OG e a medição de intervalo apontava 2,289 pt para fora. Persistimos a moldura `page_14_block_1::pt-BR` com 319,677 pt, mantendo 7 linhas e o recuo. Depois disso, o excesso à direita do bloco caiu a zero; a exportação passou `verifiedTranslationRecords` e `pdfVerification`, e OG, Viewer e print foram comparados.

**Reincidência confirmada nas pp.15–16 (2026-11-21):** as molduras PT-BR das chamadas D também não existiam em `layout-frames`, apesar das candidatas terem copyfit aprovado. Na p.15, a chamada `A Zona Inicial` excedia em 1,254 pt; na p.16, `Totens` excedia em 2,587 pt. Molduras locais de 187,5 pt mantiveram 4/4 linhas em cada página e reduziram o excesso direito a zero. Em ambos os casos, as aprovações e o texto ficaram intactos; exportações persistidas passaram as verificações de PDF. **Status:** três casos confirmados do mesmo descompasso entre stores; continue comparando o retângulo efetivo do Viewer com o registro `layout-frames` da unidade em cada página, sem generalizar suas coordenadas.

**Reincidência na p.17 (2026-11-21):** os blocos PT-BR 35, 49, 50 e 55 também não tinham molduras próprias. Foram persistidas molduras locais com larguras de 306,928 / 319,5 / 322,94 / 302,569 pt; as quatro unidades mantiveram as contagens do OG em 100% e 200% (4/4, 5/5, 4/4, 3/3). Aumentar a moldura do bloco 49 para 320 pt faz o Viewer cair para quatro linhas, então a largura de 319,5 pt preserva as cinco linhas. O bbox textual extraído do PDF ainda ultrapassa a moldura em 1,694 pt à direita, sem recorte de tinta ou colisão visível no Viewer/print; a exceção está registrada, não mascarada como zero. **Status:** mitigação local verificada; não alargue esse bloco sem preservar o copyfit 5/5 e validar de novo.

**Reincidência na p.96 (2026-11-21):** o rótulo `ELEVAÇÃO: Veja Elevação, pág. 22.` herdava uma moldura do tamanho aproximado da linha inglesa, embora a célula da Tabela 7 tivesse espaço livre. Isso criava uma segunda linha desnecessária. Foi salva uma moldura PT-BR local de X=101,579 pt até a borda interna em X=759,88 pt, com a altura limitada à própria linha da tabela. O texto e a fonte aprovados foram mantidos; OG, Viewer, print e PDF confirmaram uma linha e nenhum avanço para a célula seguinte. **Regra:** antes de abreviar ou reduzir fonte, confira a largura livre dentro da célula; amplie apenas até a borda da própria célula e revalide a quebra.

## Parágrafo de exemplo após bullet pode voltar à margem da coluna

**Sintoma:** um exemplo após um bullet parece perder o recuo francês do item anterior.

**Como confirmar:** compare o início do exemplo no OG com o início do texto do bullet. Verifique também se o exemplo é um parágrafo/unidade independente, em vez de uma continuação daquele item.

**Correção:** preserve a hierarquia mostrada no OG. Aplique o recuo do bullet somente às linhas que pertencem a ele; se o exemplo recomeçar na margem da coluna na fonte, deixe-o numa unidade independente alinhada a essa margem. Não force o recuo por proximidade textual.

**Caso verificado na p.18 (2026-11-21):** “Exemplo: se uma Ficha de Saque...” aparece na margem da coluna no OG e no PT-BR, depois do bullet “Fichas de Encontro”. O exemplo é separado e não herda o recuo francês do bullet. A posição foi preservada após comparação visual; nenhuma alteração de layout era necessária.

## Quebra de parágrafo em unidade rica compartilhada

**Sintoma:** duas ou mais passagens de prosa permanecem numa unidade rica, sem as quebras de parágrafo/linha da fonte. A tradução pode parecer correta, mas ocupa menos linhas e deixa um vão antes da unidade seguinte.

**Correção:** compare os pontos de início/fim de cada parágrafo no OG e preserve essas quebras na unidade traduzida. Se o texto em PT-BR ainda comprimir uma frase que começa numa linha própria na fonte, use a quebra nessa fronteira de frase; não acrescente palavras só para preencher espaço. Meça as linhas de novo e confira a unidade seguinte, além do Viewer e do PDF.

**Caso verificado na p.62 (2026-11-22):** `Towards & Away` tinha três parágrafos no OG, mas o corpo PT-BR os juntava; a frase “Esse movimento...” também fluía junto da frase anterior. A moldura e os estilos ricos foram mantidos, restaurando as duas fronteiras de parágrafo e a quebra após “...na IA.”. O corpo passou a 12 linhas contra 12 linhas-fonte; a exportação confirmou `verifiedTranslationRecords=true` e `pdfVerification=true`. As 26 traduções legadas sem recibo atual mantêm a certificação da página em aberto.

## Texto de tabela invade a linha seguinte apesar de recibo Copyfit antigo

**Sintoma:** um bullet ou parágrafo ultrapassa a borda da própria célula e invade a linha seguinte, embora a revisão salva declare Copyfit `EXACT`.

**Como confirmar:** use o OG para localizar o limite inferior da célula e compare a moldura e os retângulos de tinta do alvo persistido no Viewer e no print/PDF, em 100% e 200%. Recalcule as linhas a partir do texto rico atual; não aceite uma contagem armazenada se ela divergir do que está renderizado. Quando existirem várias versões da mesma unidade, selecione a proposta pelo `proposalId` ao rodar `measure_copyfit_page.mjs` e confira se o `copyfitCanonicalSpanKey` ainda identifica a unidade filha correta.

**Correção:** primeiro tente uma redação mais concisa que preserve o sentido, os nomes impressos em inglês e os runs de ênfase. Se a contagem voltar à do OG, aprove uma nova revisão pelo fluxo oficial e mantenha a redação anterior no histórico; arquive apenas o recibo substituído. Se não couber, só então ajuste a moldura/altura daquela célula, respeitando as outras linhas da tabela. Reexporte e confira também o início da célula seguinte.

**Caso verificado na p.97 (2026-11-22):** o último bullet de Burrow deveria ocupar duas linhas, mas o Viewer/print atual mostrava três; a última linha terminava em Y=326,59 pt, cerca de 10,05 pt abaixo da moldura da unidade em Y=316,54 pt. O recibo #2092 ainda dizia 2/2. A tradução foi condensada sem alterar a geometria nem os termos de jogo; Copyfit V3 confirmou 2/2 no Viewer e no PDF-fonte em 100% e 200%. A revisão #2125 foi aprovada e o #2092 arquivado, com a redação anterior preservada no histórico. A exportação persistida mostrou os 32 alvos da página sem invasão entre células e passou `verifiedTranslationRecords=true` e `pdfVerification=true`. Durante a medição, versões históricas compartilhavam a mesma `spanKey`; foi acrescentado `--proposal-id` ao seletor de Copyfit para não misturar candidatos.

## Vários rótulos de categorias-fonte acabam centralizados como uma frase só

**Sintoma:** rótulos separados acima de cards, colunas ou opções aparecem em uma única unidade traduzida; palavras com comprimentos diferentes deixam de ficar centradas sobre seus próprios elementos.

**Como confirmar:** confira no PDF OG se cada rótulo tem sua própria posição horizontal e papel visual. No DOM, compare `lineIds`, caixas-fonte e centros com os limites dos cards. Uma extração que agrupou várias linhas não torna esses rótulos uma frase editorial única.

**Correção:** quando a fonte comprovar rótulos independentes, crie uma unidade-filha editável para cada rótulo, vinculada à linha e caixa-fonte correspondentes. Centralize cada moldura local no eixo do rótulo-fonte/card, preserve tipografia e cores, e mantenha a tradução-pai antiga como fallback recuperável até todas as filhas estarem salvas. Não aplique a separação quando o OG mostrar uma frase contínua ou quando as palavras pertencerem a uma única legenda. Meça cada filha e compare a página inteira no Viewer e no PDF.

**Caso verificado na p.29 (2026-11-23):** `WEAPON`, `ARMOR` e `CORE` estavam em três caixas-fonte acima de três cards, mas a tradução `ARMA / ARMADURA / NÚCLEO` era uma unidade única. Três unidades-filhas foram publicadas (`ARMA`, `ARMADURA`, `NÚCLEO`), mantendo OptimaLTStd-Bold 9 pt branca; `UNIVERSAL` permaneceu em sua unidade própria. Copyfit V3 mediu 1/1 linha por rótulo em 100% e 200%. A exportação persistida passou `pdfVerification=true`; OG, Viewer e PDF confirmaram centralização independente sem clipping ou colisão. A aprovação agrupada anterior permaneceu salva como fallback.
