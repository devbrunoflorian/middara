---
name: visual-fidelity-qa
description: Cheatsheet iterativo de problemas comuns e soluções para a Fidelidade Visual do Middara.
---

# Visual Fidelity QA & Common Problems

Este documento serve como um log evolutivo de problemas de renderização encontrados no motor do Middara (PDF -> React) e qual foi a **Solução Ideal** encontrada, para poupar tempo de debugging no futuro.

## 1. O Texto Está "Vazando" do Limite da BBox (Direita)
**Problema:** O texto extraído (`page_dom.json`) tem uma largura X no Adobe PDF, mas no navegador as letras ficam pouca coisa mais "gordinhas", fazendo a linha acumular pixels extras e extrapolar a margem/box pela direita.
**Causa:** Os motores de renderização web lidam de maneira sutilmente diferente com o Tracking ("kerning" e espaço natural entre os caracteres) comparado ao Adobe PDF, especialmente em fontes Serif como a *Adobe Garamond Pro*. O uso indevido de Ligatures padrão pelo browser também afeta a largura total da palavra.
**Solução Ideal:**
- **Sempre desative as Ligatures do browser** aplicando CSS forçado na raiz da tag (`font-variant-ligatures: none; font-feature-settings: 'liga' 0, 'clig' 0;`).
- Aplique uma leve correção global no `letter-spacing` (ex: `-0.015em`) para comprimir fisicamente o texto e simular o Tracking real que existia no PDF.
*(Implementado no `PageRenderer.tsx` no `spanStyle`).*

## 2. Peso visual de headings (confirmado na página 4)
**Problema:** Os 14 headings de tópico da página 4 pareciam regulares no app, embora o render PDF os mostre com peso mais forte.
**Causa:** Os spans usam `Cinzel-Regular`, 12 pt e flags 4; o renderer mapeava isso corretamente para peso 400 com base nos metadados, mas o resultado visual ainda ficava mais leve que a referência. Nome de fonte e flags não substituem a comparação visual.
**Correção confirmada:** os 14 spans daquela página usam `renderWeightOverride: 700`, mantendo `font: Cinzel-Regular` intacto como proveniência. A página inteira foi comparada após a mudança. Esse campo é opt-in por span: não aplicar peso 700 a toda Cinzel, a toda small caps, nem a outras páginas sem confirmar o PDF.

## 3. Barras de Ferramentas / Controles Sobrepondo o Render
**Problema:** Botões fixos do layout (Header, Setas de navegação grandes) atrapalhando a leitura limpa da página (O clássico TOC do "cortando o single view").
**Solução Ideal:** 
- Evitar Headers horizontais absolutos num cenário de PDF view. Use layouts Flexbox robustos onde o PDF container ocupe a viewport descontando o menu lateral (Sidebar Vertical) ou crie overlays ocultáveis.

## 4. Altura dos Títulos (Desalinhamento Vertical / "Mais Alto")
**Problema:** Títulos em fontes decorativas (especialmente `Esmeralda`) ficam renderizados mais altos que no PDF original, muitas vezes não centralizando perfeitamente nas faixas/ribbons de fundo.
**Causa confirmada no caminho de dados:** O PDF disponibiliza bbox e baseline (`origin`) para o span. No exemplo “Introduction” da página 2, a bbox é `[328.37, 56.13, 492.23, 96.99]` e o baseline Y é `88.14`. `extract_dom.py` guarda a bbox, mas descarta `origin`; `LineRenderer` usa a bbox como `top/height`, enquanto o navegador posiciona o glifo pelas métricas internas da fonte. Em fontes decorativas como Esmeralda, essa diferença entre a caixa da fonte e o baseline extraído aparece como deslocamento vertical. Não descreva a bbox como pixels tintados; ela é a caixa tipográfica retornada pelo PyMuPDF. Cinzel requer validação independente e não deve herdar o ajuste Esmeralda por suposição.
**Solução Ideal:**
- Para fontes de título problemáticas (`Esmeralda`), aplicar um deslocamento vertical direto no span usando `transform: translateY(X%)` (ex: `12%` a `15%`). Isso força a em-box do navegador a descer, alinhando os pixels tintados de volta ao centro da BBox original sem quebrar o layout das outras fontes do corpo do texto (como `Optima`) e sem desalinhar a fonte `Cinzel`. Note que usar `transform` exige `display: inline-block`, o que não deve ser vazado para fontes normais, ou você quebrará o engine de ligatures e colapso de linha!
**Estado atual:** a regra de `translateY(12%)` está aplicada aos spans de origem e, quando a unidade vira override de bloco, aos segmentos traduzidos que continuam em Esmeralda, incluindo `EsmeraldaPro-PUA`. Um bug de caminho fazia o override traduzido do título ignorar o ajuste aplicado à renderização original; esse caminho foi corrigido em 2026-09-30. A extração ainda não exporta `origin`/baseline, então continua sendo compensação visual candidata, não reconstrução tipográfica exata. Precisa de comparação visual no app contra o PDF; exclui fontes `Identity-H` e não se estende a `Cinzel` sem evidência específica.

## 5. Textos "Fantasmas" e Distorcidos Sobre Imagens (Microscopic Vector Artifacts)
**Problema:** Textos começam a "aparecer" grosseiramente e quebrando em cima das imagens das cartas e capas de livros (ex: "Adventure Book" brotando em cima da capa).
**Causa:** O PDF original (gerado no InDesign/Illustrator) muitas vezes deixa um "texto vetorial invisível" ou microscópico (ex: `size: 2.9px`) jogado para trás das imagens ou como metadado para Leitores de Tela. O PyMuPDF é impiedoso e extrai esse texto fantasma. Se o navegador renderiza isso num `span`, dependendo da sua regra global de CSS (como vazar um `display: inline-block` ou aplicar um weight bruto), o navegador tenta forçar um `font-size` mínimo humano (10px~12px) dentro de uma bounding box minúscula (`bbox`), o que espalha o texto violentamente na tela.
**Regra operacional atual:** o renderer ainda filtra spans menores que 4 pt por padrão, mas tamanho pequeno é só um sinal, não prova de lixo. A página 4 tem texto legítimo de 1,58–2,25 pt em três cartas inclinadas. Como o extrator remove esse texto do fundo e o renderer não preserva direção/matriz das linhas, a versão inglesa usa pixels originais mascarados pelos polígonos transformados dos cards; as 210 linhas permanecem nos dados com `rasterizedDuplicate` e podem ser inspecionadas em Admin. Antes de suprimir ou reconstruir conteúdo menor que 4 pt, compare fonte, fundo final, direção/ordem de pintura e screenshot do app.

## 6. Arte composta de cartas e texto sobre artwork (Ex: Página 6)
**Problema confirmado:** cartas ocultas são desenhadas no PDF com múltiplas imagens/máscaras e labels por cima. O viewer atual ignora `page.images`; as caixas ficam brancas e o glifo `?` é refeito com a fonte web, divergindo das interrogações brancas e dos textos impressos.
**Correção de amostra:** `scripts/build_page_006_card_overlay.py` recorta pixels do PDF somente dentro das colocações transformadas de imagem e das bboxes textuais auditadas, e o `PageRenderer` usa o patch na página 6 somente em EN/não-Admin. Os recortes retangular e por componentes foram rejeitados: um comeu parágrafo vizinho e outro perdeu rótulos pequenos.
**Limite:** texto rasterizado nesse patch não é editável nem traduzível; o overlay some em Admin. Para qualquer nova composição, inspecionar assets/máscaras, ordem e texto ao redor; testar o recorte em contexto; não propagar filtros de fantasma, thresholds ou retângulos sem prova.

## 7. Duplicação raster/HTML e glifos suprimidos (Ex: Página 7)
Um texto que sobrevive dentro de um Form XObject pode aparecer no background e no HTML ao mesmo tempo. Confirme os mesmos pixels na bbox antes de marcar somente a linha HTML com `rasterizedDuplicate`; preserve o bloco/override para edição. Para pictogramas suprimidos pelo renderer, confira se o background os contém. A página 7 precisou restaurar 20 caixas `U+274F` com um SVG transparente baseado nos bboxes auditados; a camada é page-local, não recebe eventos e não autoriza mudar o mapeamento global Zapf. Compare forma, posição e vizinhança ampliadas e depois a página inteira.

### Revisão de overlay mascarado: artefatos fora dos placements de imagem (Ex: página 6)
Uma máscara baseada apenas em `get_image_rects()` pode restaurar as imagens e ainda deixar paths/backings do PDF visíveis ao redor delas. Se o fundo mostrar formas que não existem no PDF final, compare `get_drawings()`/sequência de pintura além da lista de imagens; acrescente somente as geometrias e estilos confirmados ao overlay local. Confira texto vizinho para evitar cobri-lo e recarregue a página/asset antes da aprovação para excluir cache antigo.

## Fluxo Base de Revisão (QA Diário)
Sempre que resolvermos um bug visual específico:
1. Identificar se é uma anomalia isolada de 1 página, ou uma quebra sistêmica (regra de fonte/layout).
2. Se for sistêmica, atualizar **este documento** com o padrão.
3. Arrumar não apenas o componente, mas revisar as páginas adjacentes para garantir que a correção não gerou *Regressões Visuais* (Efeito borboleta do CSS).
