# Erros Evidenciados e Guia de Resolução — Middara Rulebook App

Este documento cataloga comportamentos inesperados, armadilhas arquiteturais e erros de renderização identificados durante a revisão e localização do Livro de Regras do Middara, documentando a causa raiz e o passo a passo exato para diagnóstico e solução.

---

## 1. Bloco / Unidade em Branco no Visualizador (`Diagnostic Blank Trapping`)

### Sintomas Observados
- A proposta aparece normalmente com o texto preenchido no painel lateral de revisão (**Revisão PT-BR > Propostas**).
- No renderizador da página (livro aberto à esquerda), o local correspondente ao texto fica **completamente em branco** (um "buraco" vazio na coluna).
- Ao clicar no item do painel de revisão, nenhum elemento no livro recebe o contorno de seleção (`data-translation-review-highlight`).

### Caso Real Evidenciado
- **Página:** Página 13.
- **Unidade:** `page_13_unit_p13-story-round-2-step-3__pt-BR` (`block_24`, Passo 3 de Rodadas de História).
- **Texto original (EN):** `VENTURE FORTH: During this Phase, the players continue the Adventure. Once players Venture Forth, they will no longer be able to return to the current Story Round.` (3 linhas visuais no PDF).
- **Texto preliminar (PT-BR):** `3. AVENTURAR-SE: Nesta Fase, os jogadores continuam a Aventura. Depois de Aventurarem-se, não poderão retornar à Rodada de História atual.` (2 linhas visuais no renderizador).
- **Problema:** Abaixo de *Nota: Recompensa...*, a seção do Passo 3 ficava totalmente vazia e em branco antes do título *Disciplinas e Itens de História*.

---

### Causa Raiz Arquitetural
O visualizador possui uma trava de proteção estética e de conformidade no frontend para não poluir a visualização com textos que falharam na validação técnica de Copyfit sem justificativa formal:

1. **A Trava em `apps/web/src/translationReview.ts` (`candidateRequiresDiagnosticBlank`):**
   ```typescript
   export function candidateRequiresDiagnosticBlank(candidate: Pick<TranslationReviewCandidate,
     'diagnosticBlank' | 'technicalStatus' | 'copyfitClassification' | 'underCompositionJustification'>): boolean {
     const technicalStatus = String(candidate.technicalStatus ?? '');
     return Boolean(candidate.diagnosticBlank)
       || candidate.copyfitClassification === 'OVER'
       || /changed[_-]since[_-]technical[_-]validation/iu.test(technicalStatus)
       || /^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open/iu.test(technicalStatus)
       || ((candidate.copyfitClassification === 'UNDER'
         || /pending-under-composition-justification/iu.test(technicalStatus))
         && !String(candidate.underCompositionJustification ?? '').trim());
   }
   ```
2. **A Inclusão no Conjunto de Chaves em Branco em `apps/web/src/App.tsx`:**
   Se uma unidade for classificada como `UNDER` e o campo `underCompositionJustification` estiver vazio (`""`), ela é adicionada a `diagnosticBlankKeys`.
3. **A Supressão no JSX em `apps/web/src/components/PageRenderer.tsx`:**
   - **Em unidades tipográficas (`TypographicUnitBlock` / `CreditField`):**
     ```typescript
     if (language === 'pt-BR' && proposalReviewDiagnosticBlankKeys?.has(spanKey)) return null;
     ```
     O React simplesmente retorna `null`, fazendo com que a unidade **não seja renderizada** na árvore DOM.
   - **Em blocos convencionais inteiros (`BlockRenderer`):**
     O bloco renderiza um container vazio com a classe `.translation-review-diagnostic-blank`.

---

### Como Resolver (Passo a Passo)

#### Solução Recomendada: Elevar a Unidade a `EXACT`
Ao atingir a mesma quantidade de linhas visuais do original em inglês (`targetLines === visualLines`), a classificação passa de `UNDER` para `EXACT`, desativando automaticamente o `diagnosticBlank`:

1. **Inspecione a contagem de linhas original:**
   Verifique em `catalog.json` ou no JSON da proposta os valores de `sourcePdfVisualLineCount` e `pageRendererVisualLineCount`.
2. **Ajuste o texto em português no JSON da proposta:**
   Ajuste a formulação para preencher a mancha gráfica necessária com naturalidade, recuperando conectivos e especificidade procedimental do inglês sem inventar regras:
   *Exemplo na p. 13:*
   ```json
   "text": "3. AVENTURAR-SE: Durante esta Fase, os jogadores prosseguem com a Aventura. Uma vez que os jogadores decidam Aventurar-se, eles não poderão mais retornar à Rodada de História atual em andamento."
   ```
3. **Preencha `underCompositionJustification` por precaução:**
   Mesmo calibrando para `EXACT`, preencha uma breve justificativa editorial no campo `underCompositionJustification` do candidato.

#### Solução Alternativa: Manter `UNDER` com Justificativa Editorial
Se o texto em português não puder ou não dever ser expandido para bater as linhas do inglês:
1. No JSON da proposta correspondente, localize o candidato com o `spanKey`.
2. Preencha o campo `underCompositionJustification` com o motivo técnico/editorial (ex.: `"Unidade concisa por natureza em português; diagramação preservada sem estourar blocos adjacentes."`).
3. Com o campo preenchido, `candidateRequiresDiagnosticBlank` retornará `false` e o texto em português voltará a ser renderizado imediatamente.

#### Finalização Obrigatória: Reconstruir e Medir
Após salvar o arquivo da proposta, sempre execute:
```bash
# 1. Atualizar o catálogo de revisão
node scripts/build_translation_review_catalog.mjs

# 2. Medir a página e validar conformidade no visualizador
node scripts/measure_copyfit_all.mjs --page <N> --force
```
Verifique se a saída informa `EXACT pdf= X viewer= X` e confirme que a unidade aparece renderizada e destacada no navegador.

---

## 2. Divisão Acidental de Blocos por Símbolos Rasterizados e Remoção / Fusão de Blocos (`Inline Symbol Split & Block Hiding/Merging`)

### Sintomas Observados
- Uma frase contínua ou parágrafo fica fragmentado em blocos separados na mesma linha ou em linhas adjacentes.
- Um bloco termina abruptamente antes de um ícone (ex.: `"o nível de dificuldade indicado por um"`), e o bloco seguinte inicia com o ícone e pontuação (ex.: `"[caveira] símbolo. Não se pode tentar uma"`).
- A divisão artificial quebra a hierarquia textual (o bloco era continuação sintática direta do bloco anterior).
- No idioma de destino (PT-BR), a ordem gramatical exige posicionar o símbolo em outro ponto da oração ou a linha quebra em larguras diferentes, mas as coordenadas rígidas de `bbox` (X e Largura) do bloco fragmentado espremem o texto ou criam "degraus" e buracos visuais.

### Caso Real Evidenciado
- **Página:** Página 13.
- **Seção:** Recompensas (*Bounties*), Parágrafo 2.
- **Blocos originais:**
  - `block_45` (`page_13_block_24`): `"Story Rounds will specify the Bounties that can be attempted based on"`
  - `block_46` (`page_13_block_25`): `"the difficulty rating listed as a "` (largura fixa de 128.83 pt, antes da caveira).
  - `block_48` (`page_13_block_26`): `" symbol. Players may not attempt a "` (início rígido em x=558.52 pt com largura de 152.6 pt, após a caveira).
  - `block_49` (`page_13_block_27`): `"Bounty with a higher difficulty rating..."`
- **Problema:** A caveira vermelha de recompensa (`combat.skull` / `source-symbol-bounty-skull.png`) era impressa no background raster do PDF original. Ao ser recortada para símbolo inline, ela foi ancorada exclusivamente ao `block_48` (`page_13_block_26`). Isso impediu que a tradução em português unificasse a linha, forçando o tradutor a tentar encaixar metade da frase em 128 pt e a outra metade em 152 pt.

### Causa Raiz Arquitetural
1. **Extração de OCR / PDF dividida por glifos não-vetoriais:** Quando um elemento gráfico (como uma caveira desenhada) está inline no texto do PDF original sem ser um caractere tipográfico de fonte, o extrator particiona a linha em múltiplos blocos: o texto à esquerda do glifo (`block_46`) e o texto à direita (`block_48`).
2. **Âncora em Bloco Secundário:** O extrator amarrou o elemento inline ao segundo bloco (`block_48`), perpetuando a divisão em 2 blocos independentes no DOM da página.
3. **Falta de Ferramenta Nativa de Ocultação/Remoção de Blocos:** Antes desta implementação, não havia um botão no visualizador Admin para desativar ou ocultar um bloco excedente sem ter que manipular schemas JSON complexos manualmente.

---

### Como Resolver (Passo a Passo)

#### Método 1: Pelo Editor Visual (Admin Layout Frame Editor)
Agora você pode ocultar ou deletar qualquer bloco excedente diretamente pela interface web:
1. Abra o visualizador no navegador (em `http://127.0.0.1:8080/`).
2. Ative o modo **Admin** e clique no botão de **Moldura / Layout** (ícone de moldura de seleção).
3. Clique sobre o bloco excedente que deseja remover.
4. No painel flutuante de moldura (**Moldura de tradução**), clique no botão **"🗑️ Ocultar"**:
   - O frame ganha o status `hidden: true` em `layout_frames.json`.
   - Na visualização normal de leitura e no modo tradução, o bloco fica **completamente oculto** (não renderiza e não ocupa espaço).
   - No modo Layout do Admin, ele passa a exibir um contorno vermelho pontilhado com a etiqueta `🗑️ Oculto`.
   - Se precisar restaurá-lo a qualquer momento, basta clicar nele em modo Layout e clicar no botão **"👁️ Reexibir"**.
5. Clique em **Salvar**.
6. Selecione o bloco principal adjacente e ajuste sua **Largura (width)** para cobrir a coluna inteira (ex.: 305.69 pt na pág. 13).

#### Método 2: Por Configuração Estrutural de Arquivos (Schema & Fusão Limpa)
Quando for necessário fundir dois blocos de texto e manter o símbolo como vetor nativo:
1. **Ocultar o bloco secundário no DOM da página:**
   No arquivo `apps/web/public/pages/page_XXX/page_XXX_dom.json`, localize o bloco redundante (ex.: `block_48`) e adicione:
   ```json
   "hiddenFromPage": true
   ```
2. **Símbolo estritamente vetorial (NÃO reancorar raster em `inline_elements.json`):**
   O símbolo inline deve ser puramente um glifo vetorial (`combat.skull` do catálogo de símbolos SVG). Ele **não deve** existir em `inline_elements.json` como variante raster (PNG/máscara).
3. **Limpar a caveira impressa no background via `fidelity_overlays.json`:**
   Como a caveira original estava desenhada na imagem de fundo do PDF (`background.webp`), ao desvencilhá-la da âncora rígida ela continuará visível no papel a menos que seja coberta. Adicione uma sobreposição de limpeza com a textura de pergaminho em `fidelity_overlays.json`:
   ```json
   {
     "url": "/pages/page_013/inline-element-mask-004.png",
     "bbox": [543.75, 559.75, 559.5, 582.0],
     "widthPx": 63,
     "heightPx": 89,
     "language": "en",
     "languageInvariant": true,
     "zIndex": 2,
     "category": "fixed-artwork-cleanup"
   }
   ```
   Dessa forma, o fundo fica 100% limpo e sem a caveira fantasma, permitindo ao tradutor usar o símbolo `[[skull]]` com total liberdade posicional no texto.
4. **Expandir a moldura do bloco principal:**
   No arquivo `apps/web/public/pages/page_XXX/layout_frames.json`, defina a largura da coluna para o bloco principal:
   ```json
   "block_46": {
     "x": 415.8424987792969,
     "width": 305.69049072265625,
     "textAlign": "left"
   }
   ```
5. **Fundir a proposta de tradução:**
   No arquivo de propostas (`docs/translations/proposals/page-XXX-...json`):
   - Atualize a proposta do bloco principal (`page_13_block_25__pt-BR`) para conter a linha completa com o token do símbolo (`￼` associado ao `symbolId: "combat.skull"`):
     ```json
     "proposalText": "nível de dificuldade indicado pelo símbolo ￼. Não se pode tentar uma"
     ```
   - Nos `segments`, configure o símbolo com suas métricas vetoriais nativas e cor desejada (ex.: `"color": "#b91d23"` para vermelho) e **sem `renderVariant`**.
   - Declare `"managedSourceSymbols": ["combat.skull"]` no candidato do bloco principal.
   - Remova o candidato do bloco secundário (`page_13_block_26__pt-BR`) do array `candidates` da proposta.
5. **Reconstruir o catálogo e validar:**
   ```bash
   node scripts/build_translation_review_catalog.mjs
   ```
   O catálogo será gerado sem erros e a linha fluirá perfeitamente como uma unidade contínua na mancha gráfica, renderizando o símbolo como vetor SVG limpo.

---

## 3. Listas Numeradas com Marcadores Fixos e Recuo Francês (*Hanging Indent*) em Unidades Tipográficas

### Sintomas Observados
- Números duplicados ou com "fantasma" sobreposto (`1. `, `2. `, `3. `) na visualização PT-BR.
- As linhas seguintes do parágrafo (linhas 2, 3, etc.) quebram rente à margem esquerda da coluna (embaixo do número), em vez de ficarem alinhadas ao início do texto do passo.
- O bloco estoura a contagem de linhas visuais (`OVER`, gerando 7 linhas em vez de 6, ou 4 em vez de 3) ou cai em `diagnosticBlank` (ficando com uma moldura vazia em branco no visualizador).

### Caso Real Evidenciado
- **Página:** Página 13.
- **Bloco:** `block_24` (Passos 1, 2, Nota de Recompensa e Passo 3 de *Rodadas de História*).
- **Unidades tipográficas envolvidas:**
  - `page_13_unit_p13-story-round-2-step-1__pt-BR` (Payload id: `387`) — Meta: **EXACT 6 linhas**.
  - `page_13_unit_p13-story-round-2-step-2-body__pt-BR` (Payload id: `388`) — Meta: **EXACT 6 linhas**.
  - `page_13_unit_p13-story-round-2-bounty-note__pt-BR` (Payload id: `215`) — Meta: **EXACT 2 linhas**.
  - `page_13_unit_p13-story-round-2-step-3__pt-BR` (Payload id: `389`) — Meta: **EXACT 3 linhas**.
- **Problema:** A tradução incluía `"1. "`, `"2. "` e `"3. "` digitados nos segmentos de texto e as molduras (`frame.x`) estavam em `86.173 pt` (margem esquerda geral) com largura total (`318.97 pt`), fazendo o texto wrapar debaixo do número e sobrepor o número estático.

---

### Causa Raiz Arquitetural
1. **Marcadores Fixos Automáticos no Renderer:**
   Em `PageRenderer.tsx`, a função `listMarkerLineIndexes(block)` detecta automaticamente linhas de marcadores (`1.\t`, `2.\t`, `3.\t` presentes em `line_24_0`, `line_24_7`, `line_24_16`) posicionadas na margem esquerda original (`x = 86.1732 pt`).
   O componente `TypographicUnitBlock` renderiza essas linhas estáticas através de `fixedSourceLines` (`LineRenderer`), mantendo os números no lugar de forma fixa e independente da tradução.
2. **Duplicação de Numerais nos Segmentos:**
   Se o tradutor ou o script de proposta inserir `"1. "`, `"2. "` ou `"3. "` dentro do array `segments` da tradução, o número é pintado uma segunda vez, diretamente sobreposto ao número fixo.
3. **Frame da Unidade sem Recuo Francês (Coordenada X Errada):**
   No arquivo `page_XXX_dom.json`, se `field.frame.x` for copiado da margem geral do bloco (`86.1732 pt`) em vez da coordenada do corpo do texto (`104.173 pt`), o container da unidade (`CreditField`) começa na mesma posição dos números. Ao quebrar linhas, o texto volta para `x = 86.1732 pt`, eliminando o recuo francês (*hanging indent*) e destruindo a mancha tipográfica original.

---

### Regras Invariantes (Nunca Mais Violar)

1. **NUNCA incluir marcadores fixos (`1.`, `2.`, `3.`) no texto da tradução:**
   O primeiro segmento de texto da unidade deve começar diretamente no título ou corpo do item (ex.: `"COMPRAR E TREINAR:"`, `"EXPLORAR (MISSÕES SECUNDÁRIAS):"`, `"AVENTURAR-SE:"`). O número já é desenhado pelo motor.
2. **O Frame da Unidade Tipográfica DEVE começar no X recuado do corpo:**
   Na página 13, o recuo do corpo em relação ao número é de exatamente `18 pt` (`104.173 pt - 86.173 pt`).
   Portanto, `frame.x` **deve ser obrigatoriamente `104.173 pt`**.
3. **A Largura da Moldura DEVE ser a largura útil a partir do recuo:**
   Com o limite direito da coluna em `405.1438 pt`, a largura útil é:
   $$\text{width} = 405.1438 - 104.173 = 300.97\text{ pt}$$
   Com `x: 104.173` e `width: 300.97`, as 4 unidades encaixam com **100% EXACT Copyfit** e recuo francês perfeito:
   - Passo 1: **EXACT 6 linhas** (igual ao inglês)
   - Passo 2: **EXACT 6 linhas** (igual ao inglês)
   - Nota de Recompensa: **EXACT 2 linhas** (igual ao inglês)
   - Passo 3: **EXACT 3 linhas** (igual ao inglês)

---

### Como Corrigir (Procedimento Completo)

#### 1. Atualizar o Banco de Dados (Payload CMS)
Enviar requisição `PATCH` para a API do Payload (`http://localhost:3000/api/translations/:id`) para cada unidade da lista:
- Remover o segmento que contém o numeral (`"1. "`, `"2. "`, `"3. "`).
- O primeiro segmento passa a ser o título estilizado (ex.: `"COMPRAR E TREINAR:"`).
- Atualizar `data.bbox` para iniciar em `104.173` e terminar em `405.1438`.

#### 2. Atualizar a Moldura em `layout_frames.json`
Em `apps/web/public/pages/page_XXX/layout_frames.json`, registrar explicitamente as coordenadas com o recuo francês:
```json
"page_13_unit_p13-story-round-2-step-1": { "x": 104.173, "width": 300.97, "textAlign": "left", "lineHeight": 1.1 },
"page_13_unit_p13-story-round-2-step-2-body": { "x": 104.173, "width": 300.97, "textAlign": "left", "lineHeight": 1.1 },
"page_13_unit_p13-story-round-2-bounty-note": { "x": 104.173, "width": 300.97, "textAlign": "left", "lineHeight": 1.0 },
"page_13_unit_p13-story-round-2-step-3": { "x": 104.173, "width": 300.97, "textAlign": "left", "lineHeight": 1.1 }
```

#### 3. Atualizar o DOM Estrutural (`page_XXX_dom.json`)
Em `apps/web/public/pages/page_XXX/page_XXX_dom.json`, atualizar `field.frame.x` para `104.173` e `field.frame.width` para `300.97` em cada uma das `typographicUnits` do bloco.

#### 4. Atualizar o Arquivo de Propostas e Reconstruir o Catálogo
No JSON da proposta (`docs/translations/proposals/page-XXX-...json`), remover os numerais de `proposalText`, `proposalMarkup` e `candidate.data.segments`.
Executar a reconstrução do catálogo:
```bash
node scripts/build_translation_review_catalog.mjs
```

#### 5. Validar Visualmente no Visualizador
Medir a renderização real no navegador e certificar-se de que os números estáticos aparecem limpos à esquerda e todas as linhas do texto mantêm o recuo à direita dos números, atingindo `EXACT` em todas as unidades.

---

## 4. Falso Bloqueio de Aprovação no Painel de Revisão (`STALE_MEASUREMENT` e Falso `UNMEASURED`)

### Sintomas Observados
- Todas ou a grande maioria das propostas de tradução no painel de revisão (**Revisão PT-BR > Propostas**) aparecem com o botão de aprovação bloqueado exibindo a mensagem de alerta vermelho:
  > *"A proposta, o texto ou a geometria mudou depois da medição. A contagem anterior não vale para esta versão; valide novamente antes de aprovar."* (`STALE_MEASUREMENT`)
- Outras propostas (mesmo já tendo passado por medição e possuindo contagem de linhas e fingerprint no catálogo) exibem:
  > *"Copyfit V3 ainda não mediu as linhas visuais do PDF-fonte e do PageRenderer para esta unidade. A aprovação permanece bloqueada."* (`UNMEASURED`)
- O usuário fica impossibilitado de aprovar propostas legítimas, mesmo quando nenhum caractere ou moldura foi alterado.

---

### Causa Raiz Arquitetural

O painel de revisão possui um portão de segurança rigoroso (`copyfitCanonicalEvidenceBlockReason` em `apps/web/src/translationReview.ts`) que compara a fotografia dos dados medidos no servidor (`measuredData`) contra os dados ativos em memória no visualizador (`currentData`):

1. **Assimetria de Chave de Renderização (`rendererKeyForReviewCandidate`):**
   - Para blocos de texto convencionais sem `editorKey` própria, a chave do bloco no DOM do visualizador é do tipo `page_13_block_0` (sem o sufixo `__pt-BR`).
   - A função `rendererKeyForReviewCandidate` resolvia essa chave para `page_13_block_0` para permitir que o visualizador localizasse o override.
   - No entanto, o construtor do catálogo (`build_translation_review_catalog.mjs`) armazena a chave canônica sempre com sufixo idiomático: `page_13_block_0__pt-BR`.
   - A função `copyfitMeasurementSnapshot` incluía o campo `spanKey` textualmente na comparação estrita:
     ```typescript
     function copyfitMeasurementSnapshot(data: unknown) {
       return {
         spanKey: data.spanKey, // 'page_13_block_0__pt-BR' vs 'page_13_block_0'
         bbox: data.bbox,
         ...
       };
     }
     ```
   - Ao serializar com `canonicalCopyfitValue`, `'page_13_block_0__pt-BR'` $\neq$ `'page_13_block_0'`, fazendo a comparação falhar e marcando **606 candidatos de 1010 como `STALE_MEASUREMENT`**.

2. **Comparação Estrita de Sufixo no Portão de Medição:**
   - Na guarda de validação:
     ```typescript
     if (candidate.copyfitCanonicalSpanKey !== candidate.spanKey) return 'UNMEASURED';
     ```
   - Diversas propostas históricas (como nas páginas 24 a 30) foram salvas no JSON original com `spanKey: "page_24_block_27"` (sem `__pt-BR`). Ao serem carregadas, o catálogo normalizou `copyfitCanonicalSpanKey` para `"page_24_block_27__pt-BR"`.
   - A comparação estrita de strings identificava uma divergência nominal e rotulava falsamente **147 propostas válidas como `UNMEASURED`**.

---

### Regra Arquitetural Invariante

> **A validação de integridade do Copyfit avalia se o texto (segmentos), entrelinha (lineHeight), alinhamento (textAlign) e geometria (bbox) foram alterados.** 
> As chaves identificadoras de unidade (`spanKey`) devem ser **sempre normalizadas** (desconsiderando sufixos transitórios de idioma como `__pt-BR`) antes de verificar a igualdade do snapshot.

---

### Solução Aplicada em `apps/web/src/translationReview.ts`

1. **Função Utilitária de Normalização:**
   ```typescript
   function normalizeSpanKeyForComparison(key: unknown): string {
     return String(key ?? '').replace(/__pt-BR$/u, '');
   }
   ```

2. **Snapshot Canônico com Chave Normalizada:**
   ```typescript
   function copyfitMeasurementSnapshot(data: unknown): Record<string, unknown> | null {
     if (!isRecord(data) || !Array.isArray(data.segments)) return null;
     return {
       spanKey: normalizeSpanKeyForComparison(data.spanKey),
       bbox: data.bbox,
       textAlign: data.textAlign,
       lineHeight: data.lineHeight,
       lineHeightMode: data.lineHeightMode,
       managedSourceSymbols: data.managedSourceSymbols ?? [],
       segments: data.segments,
     };
   }
   ```

3. **Guarda de Canonical Span Key com Normalização:**
   ```typescript
   if (!candidate.copyfitMeasurementFingerprint?.trim()
     || !candidate.copyfitCanonicalSpanKey
     || normalizeSpanKeyForComparison(candidate.copyfitCanonicalSpanKey) !== normalizeSpanKeyForComparison(candidate.spanKey)
     || !hasCanonicalBbox
     || !isRecord(candidate.data)
     || !Array.isArray(candidate.data.segments)) return 'UNMEASURED';
   ```

4. **Resultado Verificado:**
   - Propostas antes marcadas como `STALE_MEASUREMENT`: **de 606 reduzidas para 0**.
   - Propostas falsamente `UNMEASURED`: **de 215 reduzidas para 77** (restando apenas páginas/rascunhos que genuinamente ainda não foram medidos com contagem visual de linhas).
   - Propostas imediatamente liberadas para aprovação: **1001 de 1078 (93% da base aprovável)**.

---

## 5. Distinção Arquitetural entre `[[skull]]` (Combate) e `[[skull2]]` (Bounty) & Fusão dos Blocos 24 e 25 (Página 13)

### O Problema
1. **Confusão de Símbolos:** A caveira padrão de combate (`combat.skull` / `[[skull]]` / `[[caveira]]`) é um ícone vetorial SVG preto/vermelho extraído da página 38. Na página 13, a caveira sob a seção *Bounties* ("DIFFICULTY:") é uma arte raster específica (com órbitas ovais, dentes serrilhados evidentes e tom bordô/marrom profundo em `/pages/page_013/source-symbol-bounty-skull.png`). Sobrescrever `combat.skull` com a caveira de bounty quebrava as dezenas de outros crânios de combate do rulebook.
2. **Fatiamento PyMuPDF (Blocos 24 e 25):** Na extração do PDF oficial, o parágrafo de Bounties foi quebrado em 2 blocos separados (`block_45` e `block_46`) devido à presença do raster no meio da frase. Isso impedia uma tradução coesa e natural em português.
3. **Crash em `replacedInlineElements` e `sourceOverlayMask`:** Elementos inline sem máscara (`element.mask == undefined`) causavam exceções fatais (`Cannot read properties of undefined (reading 'url')` e `(reading 'bbox')`) no renderizador ao alternar entre idiomas.
4. **Entrelinha com Símbolo Vertical:** Por ser um símbolo com altura maior (`2.04 em`), manter a entrelinha padrão `1.0` provocava sobreposição com o texto da linha adjacente.

### A Solução Implementada

1. **Separação de Entidades no Registro Semântico:**
   - **`combat.skull` (`[[skull]]` / `[[caveira]]`):** Preservado intacto como símbolo SVG vetorial padrão de combate do sistema.
   - **`combat.skull2` (`[[skull2]]` / `[[caveira2]]`):** Registrado como símbolo semântico próprio em `apps/web/src/symbols/semanticSymbols.ts` com o asset `/pages/page_013/source-symbol-bounty-skull.png`, largura `1.38518 em`, altura `2.04629 em` e alinhamento vertical `0.70001 em`.
2. **Fusão Estrutural no DOM (`page_013_dom.json`):**
   - `block_45` absorveu a linha 1 e a linha 2 como um bloco unificado de $w = 305.69\text{ pt}$ e $h = 27.92\text{ pt}$ ($x = 415.84\text{ pt}$).
   - `block_46` e `block_48` foram ocultados (`hiddenFromPage: true`).
   - `apps/web/public/pages/page_013/layout_frames.json` mantém a moldura única com largura $305.69\text{ pt}$.
3. **Tradução PT-BR com Copyfit EXACT (2 Linhas Exatas):**
   - Registro 409 criado no Payload CMS para `page_13_block_24__pt-BR` com redação concisa e fluida com `combat.skull2` e entrelinha `1.40`:
     - Linha 1: *As Rodadas de História definem as Recompensas possíveis pelo nível de*
     - Linha 2: *dificuldade indicado pelo símbolo [skull2]. Não se pode tentar uma*
     - Seguido pelo bloco 27: *Recompensa acima da dificuldade permitida pela Rodada de História (por exemplo, com mais caveiras).*
   - Registros órfãos 405 (`block_25`) e 404 (`block_26`) deletados do Payload CMS.
4. **Proteção de Código no Frontend:**
   - `PageRenderer.tsx`: `replacedInlineElements` agora filtra `element.mask?.url && element.mask?.bbox` antes de tentar renderizar tags `<img>`.
   - `sourceInlineElements.ts`: `sourceOverlayMask` valida `e.mask?.bbox` antes de calcular coordenadas.
   - `PageRenderer.tsx`: `sourceAsset` inclui fallback para `symbol.assetUrl` quando o símbolo usa imagem direta sem variant.

---

## 6. Erro 409 Conflict na Aprovação de Propostas (`POST /api/translation-review/approve`)

### O Problema
Ao tentar aprovar qualquer proposta de bloco no painel de revisão, o usuário recebia o erro:
> `Erro ao aprovar. A unidade continua em Propostas. Não existe uma medição Copyfit V3 canônica para estes dados e esta versão; nenhuma aprovação foi gravada.` (HTTP 409 Conflict).

O problema afetava **605 das 1077 unidades do catálogo**, impedindo a aprovação editorial e publicação no PT-BR.

### Causa Raiz
1. **Assimetria de Chave de Renderização vs Chave Canônica:**
   - O visualizador na tela (`PageRenderer`) mapeia blocos convencionais pela chave de elemento DOM local: `page_${pageNumber}_block_${blockIndex}` (sem o sufixo de idioma `__pt-BR`).
   - O catálogo canônico (`catalog.json`) e o armazenamento de traduções no Payload CMS registram sempre a chave idiomática canônica: `page_${pageNumber}_block_${blockIndex}__pt-BR`.
   - A função `persistTranslationReviewApproval` no frontend enviava no campo `data` o override contendo a chave local do visualizador (`rendererKey`, sem `__pt-BR`).
2. **Hash Estrito no Endpoint de Aprovação (`approveTranslationReview.ts`):**
   - O endpoint comparava o fingerprint criptográfico SHA-256 do catálogo (`catalogFingerprint`) contra o fingerprint dos dados enviados (`submittedFingerprint`).
   - A função `copyfitMeasurementFingerprint` incluía o `spanKey` sem normalização de idioma (`'page_13_block_24__pt-BR'` vs `'page_13_block_24'`).
   - Como os hashes divergiam, `resolveCanonicalCopyfitEvidence` retornava `null`, disparando o erro 409.
3. **Descompasso de Entrelinha na Página 13 Bloco 24:**
   - No rascunho de proposta original da p. 13, o bloco 24 continha `lineHeight: 1` (`source`), enquanto na tela e no banco a entrelinha havia sido ajustada para `1.4` para acomodar a altura de `2.04 em` da `combat.skull2`. Como o fingerprint do snapshot inclui `lineHeight`, a proposta era rejeitada por divergência de estilo.

### A Solução Implementada

1. **Normalização no Backend (`apps/admin/src/endpoints/approveTranslationReview.ts`):**
   - Implementada a função `normalizeSpanKeyForComparison` em `copyfitMeasurementFingerprint`, garantindo que a presença ou ausência de sufixos transitórios de idioma (`__pt-BR`) não invalide a igualdade do snapshot tipográfico.
   - Em `resolveCanonicalCopyfitEvidence`, `submittedData` é validado e normalizado para a chave canônica e geometria oficial (`canonicalSpanKey` e `canonicalBbox`).
   - Antes de persistir e buscar a tradução no Payload CMS (`findTranslation`), o endpoint agora força `targetSpanKey = canonicalEvidence.canonicalSpanKey`, garantindo que a coleção `translations` armazene sempre a chave canônica completa com `__pt-BR`.
   - Adicionada busca robusta em múltiplos caminhos de fallback em `readCanonicalReviewCatalog`.

2. **Paridade no Construtor do Catálogo (`scripts/build_translation_review_catalog.mjs`):**
   - Atualizado `copyfitMeasurementFingerprint` para utilizar a mesma normalização de `spanKey`, gerando hashes 100% determinísticos.

3. **Garantia de Chave Canônica no Envio Frontend (`apps/web/src/translationReview.ts`):**
   - `persistTranslationReviewApproval` agora envelopa `data` em `canonicalOverride` com `canonicalSpanKey` e `canonicalBbox` antes de enviar à API, alinhando a confirmação da publicação com o Payload CMS.

4. **Calibração de Estilo na Página 13 Bloco 24:**
   - Formalizado `lineHeight: 1.4` e `lineHeightMode: "custom"` tanto em `page-013-full-page-text-proposal-2026-10-16-v3.json` quanto em `layout_frames.json` (`block_45`).
   - Catálogo reconstruído e sincronizado com o banco de dados.

### Resultado Verificado
- **1009 de 1009 propostas com medição visual completa agora passam com 100% de sucesso (0 falhas).**
- O bloco 24 da página 13 com `[[skull2]]` foi aprovado com `HTTP 200 OK` e gravado com sucesso no Payload CMS.
- Testes automatizados em múltiplas páginas (p. 16, 20, 21, 26) confirmaram aprovações imediatas com status 200.



## UI-REVIEW-RULER-OVERLAY — régua cobre o painel de revisão (adiado)

- **Evidência:** captura do Viewer enviada em 2026-10-22; com “Propostas e exceções” aberto e a régua ativa, as guias horizontal e vertical aparecem por cima do cabeçalho e da lista de propostas.
- **Impacto:** ruído visual e possível obstrução da navegação/revisão; não altera os dados de tradução. Prioridade baixa enquanto o lote PT-BR avança.
- **Ajuste futuro:** restringir a régua à superfície do PDF ou suspendê-la enquanto o painel de revisão está aberto, preservando seu uso no Viewer/Editor.
- **Validação ao corrigir:** abrir/fechar Reviewer com régua ativa em zooms diferentes; confirmar que nenhuma guia cobre cabeçalho, lista ou botões e que medir/arrastar no canvas continua funcionando.
- **Estado:** pendente; registrado para execução após um ponto seguro do lote, conforme pedido do usuário. Sem mudança de código neste ciclo.