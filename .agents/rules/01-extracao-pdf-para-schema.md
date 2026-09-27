# Skill: Extração de PDF → Schema de Dados

## Objetivo
Converter o PDF original (`Rulebook 1.2`) em dados estruturados (JSON) fiéis ao layout, sem perder fidelidade nem gerar lixo de dados. Esta skill define o processo obrigatório e os erros já conhecidos que **vão** acontecer se pulado algum passo.

## Regra 0 — Nunca extrair sem diagnosticar antes
Antes de escrever qualquer código de extração, rode:
```bash
pdfinfo arquivo.pdf       # páginas, tamanho, versão
pdffonts arquivo.pdf       # fontes presentes e se estão embutidas (coluna "emb")
```
Se `pdffonts` mostrar fontes com `emb: no`, a extração de texto pode sair com caracteres errados — nesse caso rasterizar e usar visão, não confiar no texto extraído.

## Regra 1 — Fontes: extrair o arquivo original, nunca aproximar
Se `pdffonts` mostra `emb: yes`, o arquivo de fonte real (`.otf`/`.ttf`) está dentro do PDF e **deve** ser extraído literalmente (via `pikepdf`, lendo `/FontDescriptor` → `/FontFile`, `/FontFile2` ou `/FontFile3`). Nunca substituir por uma fonte "parecida" do Google Fonts — o objetivo é fidelidade pixel-a-pixel, e fontes parecidas nunca são idênticas em métricas (largura, kerning, altura de x).

**Deduplicar por hash MD5 do conteúdo binário**, não por nome — o mesmo nome de fonte aparece dezenas de vezes (uma instância por subset gerado pelo InDesign).

**Limitação permanente a documentar, não a esconder:** as fontes extraídas são *subsets* (só contêm os glifos usados nas páginas de origem). Se o CMS permitir digitar texto novo, caracteres/acentos ausentes no subset vão quebrar. Antes de liberar edição de texto livre no admin, é preciso conseguir a fonte completa original (com o designer/licenciante) ou implementar fallback de fonte visível para o editor.

## Regra 2 — Cor: CMYK → RGB é aproximação, documentar como tal
PDFs de impressão guardam cor em CMYK. Conversão padrão:
```
R = 255 × (1−C) × (1−K)
G = 255 × (1−M) × (1−K)
B = 255 × (1−Y) × (1−K)
```
Isso é suficiente para preto, branco e a maioria das cores de UI sólidas. **Não é color-managed** (ignora perfil ICC do documento) — para tons intermediários pode haver diferença perceptível. Se a fidelidade de cor for questionada visualmente numa página específica, a correção é extrair o perfil ICC embutido e converter com ele, não ajustar a fórmula manualmente "no olho".

## Regra 3 — Nunca aceitar um número de blocos sem investigar
Se uma página gerar uma quantidade de blocos muito fora do padrão das outras (ex: uma página de texto simples com 600 blocos vs. outra com 17.000), **isso é sinal de bug ou de um caso real que exige tratamento especial — nunca ignorar e seguir em frente.** Os dois casos reais que já apareceram neste projeto:

1. **Fotos de produto viram milhares de fragmentos de imagem.** InDesign/Illustrator às vezes exportam gradientes complexos (still-life 3D, malha de gradiente) como milhares de imagens minúsculas (< 1pt) coladas lado a lado. Solução: detectar clusters espaciais de fragmentos minúsculos e contíguos (grade + union-find, tolerância de ~1pt) e mesclar cada cluster num único asset recortado de um render em alta resolução (300dpi) — nunca guardar um bloco por fragmento.
2. **Texto vira um bloco por letra.** `extract_words` (pdfplumber) pode fragmentar em caracteres individuais se a tolerância de espaçamento horizontal (`x_tolerance`) for menor que o kerning real da fonte usada. **Sempre validar**: se a contagem de "palavras" extraídas for da ordem de grandeza da contagem de caracteres visíveis na página, a tolerância está errada — ajustar `x_tolerance`/`x_tolerance_ratio` e testar de novo antes de aceitar.

**Checklist obrigatório por página extraída, antes de aceitar o resultado:**
- [ ] Contagem de blocos de texto é compatível com a quantidade de texto visível na página (não 5-10x maior)
- [ ] Contagem de blocos de imagem é compatível com a quantidade de figuras visíveis (não centenas/milhares numa página com poucas fotos)
- [ ] Fontes usadas nos blocos batem com o que `pdffonts` reportou para o documento
- [ ] O render de referência da página (gerado à parte, ver Regra 5) foi olhado visualmente e comparado com o JSON gerado

## Regra 4 — Vetores: só formas simples viram geometria, o resto vira asset
Retângulos e linhas simples (molduras, barras de título, divisores) podem ser extraídos como forma vetorial (fill/stroke). Curvas complexas, floreios ornamentais e ilustrações desenhadas em Bézier **não** devem ser reconstruídas como geometria — tratar como imagem/SVG exportado da região.

## Regra 5 — Sempre gerar um render de referência
Toda extração de página deve gerar também uma imagem raster da página inteira (via `pdftoppm`, não via bibliotecas Python de rasterização lentas — ver Skill 06 sobre performance) para conferência visual humana lado a lado com o JSON. Sem isso, erros silenciosos de extração só aparecem quando já é tarde.

## Regra 6 — `readingOrder` é heurística, não verdade absoluta
A ordem de leitura (usada no modo reflow mobile) é inferida por posição (banda de linha + X), não lida de metadado nenhum do PDF. **Isso falha em layout multi-coluna** (título e corpo lado a lado na mesma altura vertical podem intercalar). Toda página com colunas visíveis deve ter o `readingOrder` revisado manualmente antes de considerar a extração "pronta" — nunca assumir que a heurística acertou.

## Regra 7 — Processar em lotes pequenos, nunca as 102 páginas de uma vez
Rodar em 5-10 páginas, revisar os resultados contra as regras acima, ajustar a heurística que falhar, só then aumentar o lote. Extração em massa sem essa validação incremental **vai** propagar o mesmo erro pelas 102 páginas antes de alguém perceber.
