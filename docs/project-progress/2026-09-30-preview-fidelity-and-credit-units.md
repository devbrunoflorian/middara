# Tarefa: investigar fidelidade do live preview e unidades dos créditos

- **Status:** concluída; diagnóstico e plano registrados, sem mudanças no app.
- **Data:** 2026-09-30.
- **Branch observada:** `fix/pixel-render/overflow`; a posição à frente de `master` é intencional, segundo o usuário.

## Objetivo e limites

Investigar por que a edição muda a aparência do texto e por que “Playtesters:” e os nomes ficam numa seleção só. Distinguir o que os prints e o repositório provam do que ainda precisa de uma reprodução controlada. Nenhum código, JSON de produção, banco, localStorage ou saída do extrator foi alterado.

## Fontes e método

- Li as instruções de handoff, regras 06/09/13, skills locais de PDF/layout/fidelidade e relatórios de amostra e compatibilidade.
- Inspecionei `PageRenderer.tsx`, `RichSpanEditor.tsx` e CSS, `page_002_dom.json`, o sidecar `layout_frames.json` e o modelo audit-only dos créditos.
- Renderizei e comparei visualmente a página 2 do PDF original com os prints fornecidos; li no JSON a geometria e os runs fonte de blocos representativos.
- Não usei o browser, não abri nem exportei drafts do usuário. Não fiz comparação pixel a pixel com uma captura nova do app, nem sei o texto exato antes/depois salvo.

## Conclusão curta

O plano anterior continua válido como direção, mas **os quatro passos não estão concluídos**. Houve auditoria de amostra e um piloto aprovado de moldura para o diálogo da página 2; os candidatos de créditos/sumário/índice ainda não alimentam o app. A fidelidade do preview atual tem uma regressão confirmável no código. A granularidade dos créditos precisa de um refinamento em relação ao plano anterior: para cumprir o que o usuário está pedindo agora, a categoria deve manter a relação semântica entre rótulo e corpo, mas expor **dois alvos/campos editáveis distintos** (rótulo e nomes/corpo), em vez de apenas uma caixa de categoria com runs mistos.

## Evidência: perda visual no clique/live preview

A cadeia atual em `apps/web/src/components/PageRenderer.tsx` e `RichSpanEditor.tsx` explica por que a página muda assim que o editor inicia:

1. `extractBlockInfo()` concatena os textos de todas as linhas do bloco, apaga quebras (`\n` vira espaço), escolhe apenas o estilo do primeiro span e usa `left` como alinhamento quando não há `layoutFrame`.
2. O `RichSpanEditor` inicializa seu estado como um segmento com esse texto e um único estilo. Seu efeito de `onDraftChange` publica esse rascunho ao canvas mesmo sem o usuário mudar o texto.
3. O `SpanBlock` vê `draftOverride` e substitui as linhas originais do PDF por uma `.realbox` de fluxo natural. Assim, um clique já troca linhas posicionadas individualmente por um parágrafo CSS refluído.
4. Esse novo parágrafo usa alinhamento da moldura ou `left`; o original preservava a composição por posições X individuais. A maioria dos blocos ainda não tem moldura/alinhamento explícitos: o único sidecar atual é para `block_21`, o diálogo.
5. `.realbox` usa `line-height: 1`, enquanto as linhas impressas da primeira unidade narrativa na página 2 estão espaçadas em aproximadamente 14.755 pt para fonte de 13 pt. O modo fluido não mantém essas posições/entrelinhas originais.
6. Ao confirmar “Edit Text”, `handleConfirmEditText()` substitui todos os segmentos por um único run com as opções atuais da toolbar. Ao digitar, o próprio preview temporário também é emitido como um único run. Portanto, texto com estilos mistos perde os runs diferenciados.

### Reproduções estruturais no PDF/JSON da página 2

- O primeiro parágrafo narrativo (array index 1) tem 7 linhas `AGaramondPro-Italic`, 13 pt, cor `#231f20`. As caixas X mudam por linha (primeira linha ~158.53 pt, linhas cheias ~110 pt, última ~217.33 pt), o que preserva visualmente a composição centralizada ao renderizar linha a linha. O texto é homogêneo em estilo, mas sua geometria não é uma caixa uniforme.
- O diálogo `block_21` é a exceção com `layout_frames.json`: `x≈118.99`, `width≈585.63`, `center`. Esse piloto aprovado **não** corrige automaticamente os demais blocos.
- `Playtesters:` é o bloco `block_40` / array index 17: 11 linhas, 12 spans; o primeiro run é `OptimaLTStd-Bold` 10 pt, e os nomes são `OptimaLTStd` regular 10 pt. O rótulo está na primeira linha e os nomes continuam nas dez linhas seguintes, tudo dentro do mesmo block/click handler. Por isso uma caixa de seleção/click seleciona ambos. O texto extraído já contém a distinção estilística, mas o editor a reduz a um bloco/range geral.
- O middle credit block `block_39` / array index 16 junta seis categorias. Isso é um problema adicional ao de Playtesters; o usuário não deve precisar selecionar/traduzir uma coluna inteira.

Assim, há duas quebras separadas: **(a)** o canvas muda a representação original ao abrir o editor, e **(b)** o rewrite/save pode colapsar runs ou persistir texto/estilo alterado. O comportamento visual no clique já está explicado; o estado persistido específico dos screenshots ainda não está completamente diagnosticado.

## Mudança de idioma vs perda de conteúdo

O print do app durante a edição mostra o seletor `EN`. Outro print mostra texto português, e o último estado mostrado está em inglês. O app separa overrides em `middara-lines-v2-en` e `middara-lines-v2-pt-BR`; salvar usa o idioma selecionado naquele momento. Portanto, essa diferença visual **pode ser** uma comparação entre idiomas diferentes, e não prova por si só que o save apagou conteúdo português. A caixa de texto do quarto print está rolada para o meio do conteúdo, o que também não prova truncamento do início.

Não dá para certificar só pelos screenshots se houve troca de idioma, edição intencional, reset ou perda de valor. Uma reprodução futura deve registrar idioma ativo, texto completo carregado, texto completo confirmado e valor reaberto após salvar, todos sob a mesma chave/idioma. A fonte do problema de fidelidade visual, por outro lado, está provada estaticamente acima.

## O que o plano original já resolveu e o que falta

| Passo | Estado real | Ajuste necessário |
|---|---|---|
| 1. Separar geometria, unidade e estilos | Parcial: o contrato foi proposto em documentos e há um sidecar de moldura para um diálogo. Não é o schema de produção. | Acrescentar a hierarquia `região → categoria/crédito → campo label/body → runs de estilo`; fonte/ink bbox, frame de tradução e linhas continuam dados separados. |
| 2. Auditar amostra pequena | Parcial: há análise reproduzível das 17 categorias da página 2, 39 entradas da página 3 e 197 linhas da página 101. | Integração e inspeção no app não foram feitas. Para a próxima entrega, priorizar dois alvos na página 2: parágrafo homogêneo para preview e uma categoria de crédito com label/body independentes. Páginas 3/101 ficam auditadas, mas sem ativação agora. |
| 3. Preservar estilos no editor | Não resolvido; o rewrite reduz os segmentos a um único estilo. | Não achatar runs. Campos de crédito separados devem carregar o estilo próprio original e ter hit targets independentes; parágrafo homogêneo continua campo único. |
| 4. Provar antes de processar 102 páginas | Parcial: amostras e piloto visual de moldura foram feitos; não houve validação do preview sem alteração nem edição/save independente de créditos. | Fazer QA focado e só generalizar após aprovação visual. Não rodar lote de extração nesta etapa. |

## Plano de implementação proposto

### Etapa 1 — Contrato de dados e compatibilidade, sem renderizar nada ainda

- Modelar a caixa/coluna como **região**, a categoria como entidade pai e o `label` e `body` como dois campos editáveis independentes. O vínculo categoria → campos mantém o contexto; cada campo recebe ID estável.
- Para cada campo, manter texto de origem, linhas/spans de linhagem, ink bbox e estilo/run original. Frames de layout são separados e só entram quando sustentados pelo design visível/PDF.
- Representar `Playtesters:` como campo label (uma linha em bold) e a lista como campo body (multilinha regular). Aplicar a mesma regra às outras categorias quando o padrão de fonte/linha comprovar essa estrutura. Não usar índice de array como ID.
- Antes de ativar novos IDs, elaborar dry run: o legado `page_2_block_17` pode conter a categoria inteira e o legado `page_2_block_16` contém seis categorias. Se um override legado existir, mantê-lo como render ativo/fallback e nunca desenhar as novas caixas sobre o mesmo conteúdo.
- Resolver explicitamente a colisão do Payload: a coleção atual marca `spanKey` como globalmente único enquanto o idioma é separado. O novo contrato deve garantir unicidade entre idiomas ou propor migração composta/reversível.

### Etapa 2 — Preview fiel sem edição e reflow somente quando o conteúdo mudar

- Ao abrir o editor, não substituir o texto de origem por uma `.realbox` normalizada. Enquanto não houver mudança, manter a renderização original linha/span a linha/span, ou provar equivalência exata.
- O preview de texto alterado deve preservar os estilos, alinhamento e indentação relevantes do campo; usar um frame de tradução explícito e entrelinha baseada em métrica/medição do PDF, não assumir `left` e `line-height: 1` para todos.
- Separar “campo não editado” de “rascunho realmente alterado”. Cancelar deve restaurar exatamente o original; confirmar sem mudança não pode criar um override refluído.
- Garantir que o que se vê durante digitação, depois de confirmar, depois de salvar e depois de recarregar seja o mesmo valor e aparência no mesmo idioma. Preview e render salvo devem compartilhar o mesmo contrato de renderização.

### Etapa 3 — Piloto isolado na página 2

- **Caso A:** abrir/cancelar o primeiro parágrafo narrativo sem digitar. O canvas deve permanecer visualmente idêntico ao PDF; comparar ao mesmo zoom.
- **Caso B:** abrir uma única categoria, primeiro “Playtesters”. Clicar no rótulo seleciona só `Playtesters:`; clicar nos nomes seleciona só a lista. Editar/formatar um campo não move, cobre ou reescreve o outro nem afeta `Community Contributors`.
- Digitar uma alteração controlada, confirmar, salvar e reabrir sob o mesmo idioma. Verificar o texto completo e os runs/estilos, além do layout; testar também Cancel/Reset.
- Comparar texto, fonte, peso, cor, alinhamento, entrelinha, margens e posição contra o PDF. Documentar falha e corrigir antes de ampliar.

### Etapa 4 — Expansão gradual, ainda sem lote de 102

- Depois da prova de página 2, integrar as unidades da página 3 (label e page reference da entrada, líderes como arte) e da 101 (primeiro coluna, depois linha/baseline), com seus próprios dry runs de IDs e compatibilidade.
- Só quando essas três formas de layout passarem em comparação real decidir se a nova extração generaliza. A expansão deve ser em pequenos lotes e com checkpoints; preservar cada DOM e draft antigo.

## Critérios de aceite

1. Abrir e cancelar editor sem alterar visualmente o texto de origem.
2. A prévia não perde família, peso, itálico, cor, alinhamento, indentação ou espaçamento sem uma decisão explícita do usuário.
3. Em créditos, label e body são caixas/edit fields independentes, relacionados como uma categoria.
4. Editar/salvar/recarregar mantém exatamente o texto escolhido no idioma correto; nenhum vizinho é alterado.
5. Override legado continua recuperável e nunca sobrepõe unidades novas.
6. Nada é processado em lote antes da comparação visual das amostras representativas.

## Arquivos consultados e verificação

- `apps/web/src/components/PageRenderer.tsx`, `RichSpanEditor.tsx` e `PageRenderer.css`.
- `apps/web/public/pages/page_002/page_002_dom.json` e `layout_frames.json`.
- `scripts/audit_layout_sample.py`, `docs/architecture/sample-layout-audit.md`, `sample-key-impact.md`, `text-layout-frames.md` e `2026-09-30-credit-draft-compatibility-audit.md`.
- PDF original: `C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`, página 2 renderizada para inspeção somente leitura.
- O handoff `CONTINUE-HERE.md` agora aponta para este diagnóstico e prioriza corrigir a regressão de abertura antes do piloto de créditos; sua versão anterior foi arquivada em `icebox/2026-09-30-handoff-before-preview-credit-plan/` com justificativa.
- `git diff --check` foi executado e passou. A imagem PNG temporária renderizada do PDF foi removida após inspeção. Sem build/testes nesta tarefa: nenhuma alteração de código foi pedida ou feita.
