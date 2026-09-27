# Middara Rulebook – Visual Fidelity & QA Process

Este documento estabelece o processo oficial de "Double Check" para garantir a fidelidade de 100% (Pixel-Perfect) do projeto web em relação ao PDF original (*Rulebook 1p2 Final Version 05-19-23 Optimized.pdf*). 

Aqui documentaremos as regras de tipografia, cores, quebras e espaçamento, servindo como checklist para as 10 primeiras páginas.

---

## 1. O Problema das Fontes Extraídas de PDFs
As fontes extraídas por ferramentas que olham para o PDF (como extrações `.ttf`, `.cff` ou `.pfa` direto do PyMuPDF) quase sempre estão **quebradas de propósito**. Quando o software (como o Adobe InDesign) exporta um PDF, ele **não embute a fonte inteira**. Ele cria um "Subset" contendo apenas as letras usadas naquele documento, e frequentemente embaralha o mapeamento dos caracteres. É por isso que não conseguimos instalá-las no Windows nem usá-las na web.

Felizmente, **nós já possuímos os arquivos originais** (os `.otf` e `.ttf` que copiamos da sua pasta `_fonts`). Elas já estão mapeadas no nosso CSS e sendo usadas perfeitamente pelo navegador!

---

## 2. Padrões de Tipografia Documentados

O nosso motor de extração (Python) lê 21 variações de nomes internos de fontes do PDF. O `PageRenderer.tsx` converte esses nomes internos para as famílias CSS originais instaladas no projeto:

### Família **Optima LT Std** (A Fonte Principal)
Usada para quase todo o texto de regras, narrativas e descrições.
* **Regular (Roman):** `weight: 400`, `style: normal`
* **Italic:** `weight: 400`, `style: italic` (Muito usada em narrativas e Lore)
* **Medium:** `weight: 500`
* **Medium Italic:** `weight: 500`, `style: italic`
* **DemiBold / Demi:** `weight: 600`
* **Bold:** `weight: 700`, `style: normal` (Títulos menores, keywords)
* **Bold Italic:** `weight: 700`, `style: italic`
* **Black:** `weight: 900`
* **Black Italic:** `weight: 900`, `style: italic`
* **Extra Black:** `weight: 950`

### Família **Adobe Garamond Pro** (Apoio e Serifas finas)
* **Regular:** `weight: 400`
* **Italic:** `weight: 400`, `style: italic`
* **Bold:** `weight: 700`
* **Bold Italic:** `weight: 700`, `style: italic`

### Família **Cinzel & Cinzel Decorative** (Títulos Épicos)
Usada pesadamente nos grandes cabeçalhos. A "Decorative" tem floreios em letras como A, C, N e R.
* **Regular:** `weight: 400`
* **Bold:** `weight: 700`
* **Black:** `weight: 900`

### Família **Esmeralda Pro** (Decorativa / Assinaturas / Lore)
* **Regular:** `weight: 400`

> ⚠️ **Glyphs & Dingbats:** Fontes como `Webdings`, `Wingdings` e `ZapfDingbats` foram identificadas no PDF, mas são usadas para pequenos ícones gráficos (bullets). No renderizador React, **ocultamos** essas fontes pois elas viram "lixo visual" (letras aleatórias) no navegador. Futuramente, os ícones serão tratados com SVGs ou sprites.

---

## 3. Checklist de Fidelidade (QA) - Páginas 1 a 10

Ao auditar as 10 primeiras páginas, procure estritamente pelas seguintes falhas. Se encontrar alguma, reporte e ajustaremos sistemicamente.

### 📋 O que verificar em cada página:

- [ ] **Alinhamento e Bounding Boxes (A Caixa):** 
  - As quebras de linha estão ocorrendo exatamente na mesma palavra que no PDF original?
  - Alguma frase está "vazando" para fora da arte de fundo, cobrindo ilustrações que não deveria cobrir?
- [ ] **Fidelidade de Fontes e Pesos (O Texto):**
  - O texto que deveria ser **Bold** está realmente mais grosso que o texto normal?
  - O texto narrativo em *Italic* está com a inclinação bonita original (itálico real do Optima) ou o navegador está forçando uma inclinação feia (faux-italic)?
  - Os grandes títulos estão usando a **Cinzel Decorative** corretamente (repare nas pontas elaboradas das letras)?
- [ ] **Cores e Contraste:**
  - O PDF não usa preto puro na maioria dos lugares. O texto normal é frequentemente um cinza escuro/marrom escuro (`#231f20`). O motor atual pega exatamente a cor do PDF, verifique se alguma está estranhamente preta ou clara demais.
- [ ] **Tamanhos e Espaçamento Vertical (Line-height):**
  - As linhas estão se sobrepondo (encostando umas nas outras verticalmente)? Atualmente o `line-height` é gerido manualmente com base no posicionamento absoluto em pixels. 
- [ ] **Hyperlinks e Interatividade:**
  - Hyperlinks invisíveis (como a página de Conteúdo) não devem afetar a tipografia da página original.

---

## 4. O Fluxo de Correção

1. **Você aponta a falha:** Ex: *"Na página 5, no bloco 'Crawl Mode', o texto está sobrepondo a imagem da espada e a fonte parece maior que no PDF."*
2. **Nós investigamos a Extração (Python):** Conferimos se o `extract_dom.py` extraiu o dado errado, cortou a cor, ou se perdeu o estilo.
3. **Nós ajustamos o Renderizador (React):** O `PageRenderer.tsx` será ajustado para interpretar a imperfeição de forma sistêmica, resolvendo de vez aquele padrão para todas as outras 100 páginas.
