# Auditoria visual integral inglesa: página 13

- **Status:** concluída e validada visualmente; página inglesa marcada `visual-reviewed`.
- **Data:** 2026-10-01.
- **Ponto de partida:** commit `20439b1` (`fix: restore page 4 fidelity and card text`), branch `fix/pixel-render/overflow`, dez commits à frente do remoto, sem push. Páginas 4, 5, 6, 7 e 101 estão `visual-reviewed`.
- **Feedback do usuário:** `docs/project-progress/2026-09-30-feedback-audit-pages-4-13-15.md` e captura da página 13: texto de `Story Disciplines and Items` parece invadir a caixa `IMPORTANT`; headings como `Story Disciplines and Items` e `Bounties` parecem estar sem peso suficiente.
- **Evidência anterior a revalidar:** a medição estática do PDF encontrou fim do texto em x≈406,7 pt e início do callout em x≈421,5 pt, distância aproximada 14,8 pt. Uma inspeção anterior no app anotou espaço visível, mas o status global da página permaneceu pendente. Não usar essa medida isolada para descartar a reclamação sem rever a captura atual.

## Objetivo

Comparar a página 13 inglesa completa com o PDF original e distinguir: (a) colisão real do texto da coluna esquerda com o callout da direita; (b) diferença de fallback/métrica entre o PDF e o browser; (c) peso/forma dos headings e demais diferenças locais. Não alterar traduções nem generalizar o override de peso da página 4.

## Método planejado

1. Reler este registro, o handoff, as regras 05/07/08/13 e o feedback p. 13; reutilizar ou gerar render do PDF físico 13 em escala suficiente.
2. Abrir app inglês, Admin desligado, comparar página inteira em Fit e percorrer as duas colunas em escala de leitura equivalente.
3. Examinar `Story Disciplines and Items`, a última baseline da coluna esquerda, margens, reticências/quebras e os quatro lados da caixa `IMPORTANT`; fazer a mesma comparação em `Bounties` e outros headings relevantes.
4. Para headings, registrar aparência do PDF e do app e metadados (fonte/flags) separadamente. Um `Cinzel-Regular` sem flag bold não decide o estilo visível; se houver diferença, aplicar apenas override(s) nos spans confirmados e validar largura/baseline.
5. Corrigir somente discrepância reproduzida no app; documentar tentativa/correção, atualizar matriz só se a página inteira passar. Executar build/lint se código mudar; registrar warnings existentes. Não abrir Admin/editor nem storage durante QA visual.

## Achados antes da implementação

- A página física 13 foi renderizada novamente a 2× a partir do PDF de referência. A captura de alta resolução confirma que os headings `FLAGS`, `ENDINGS`, `BUILDING A STORE`, `STORY ROUNDS`, `STORY DISCIPLINES AND ITEMS` e `BOUNTIES` usam peso visual bold, embora seus spans no JSON sejam `Cinzel-Regular`, 12 pt, flags 4. No app, os seis aparecem com peso regular. A causa é a mesma classe de discrepância de proveniência vs. aparência que foi confirmada na p. 4: os metadados extraídos não descrevem o peso visual aplicado no PDF.
- O texto de `Story Disciplines and Items` e as caixas `IMPORTANT` ocupam colunas diferentes. No PDF, o bloco termina em x≈406,7 pt e a caixa começa em x≈421,5 pt: há um gutter de ~14,8 pt mesmo nas baselines que coincidem verticalmente. A captura atual do app, em EN e Admin desligado a 225%, também mostra folga visível entre as colunas. A suspeita de sobreposição **não se reproduziu nesta versão**; não ampliar/refluir o bloco apenas para criar uma folga diferente da referência.
- Inspeção foi somente visual e de JSON estático versionado. Admin permaneceu desligado; nenhum rascunho/storage foi aberto.

### Implementação planejada (antes de editar dados)

- Aplicar `renderWeightOverride: 700` apenas nos spans dos seis headings enumerados acima, mantendo `font: Cinzel-Regular`, bboxes, alinhamento, caixa e texto originais. O override p. 4 é precedente técnico, não uma regra global.
- Recarregar a página 13 no browser, conferir os seis headings em escala de leitura e o quadro inteiro em Fit. Reavaliar o gutter com as baselines coincidentes e atualizar a matriz somente se o conjunto da página continuar fiel.

## Evidência adicional do usuário e causa da invasão visual

- O usuário esclareceu com uma captura em escala de leitura que a última linha realmente chega à divisão vertical da página e quase toca o aviso. A diferença entre a análise anterior de bboxes e o que se vê no app vem do texto pintado, não da geometria declarada: medições do DOM encontraram o fim visual da linha `line_29_8` 10,17 px além do seu limite de linha; o aviso começa 13,85 px depois do limite declarado, restando apenas ~3,7 px reais. A minha conclusão anterior de que a folga estava adequada considerou somente bboxes do JSON — foi insuficiente e fica corrigida por esta evidência visual/DOM.
- No PDF, o mesmo texto termina no limite do bloco, deixando o gutter de ~14,8 pt. O problema local é a largura efetiva das fontes/span no browser, que passa a caixa linha embora o JSON esteja dentro do limite. Correção planejada para esta linha inglesa apenas: um fator horizontal calculado `limite_de_linha / largura_pintada` (~0,967), ancorado à esquerda, mantendo altura, tamanho nominal, conteúdo e bboxes. A regra só se aplica à linha-fonte em inglês; um override de tradução deve manter seu próprio layout.
- A inspeção integral também achou `Adventure Mode Continued` no PDF e no JSON, mas o bloco/linha estão marcados `suspectedGhost: true`; o renderer os oculta. O recorte correspondente do `background.webp` está branco, sem cópia rasterizada, então essa marca está incorreta e suprime um título legítimo. A linha será revelada e comparada após renderizar, preservando posição/estilo e aplicando peso 700 confirmado visualmente no PDF.
- Esses achados ampliam o diagnóstico sem invalidar a correção planejada dos seis headings. Vou manter cada alteração local, validar título + gutter no browser antes de fechar a página.

## Critério de encerramento

Marcar `visual-reviewed` apenas depois de comparar a página inteira e as regiões críticas em escala de leitura, confirmar que o texto conserva a folga do original, verificar headings/estilos e não afetar conteúdo vizinho. Caso haja limitação ou reclamação não reproduzida, registrar evidência e manter o status adequado.


## Resultado final — 2026-10-01

Este resultado substitui as seções anteriores que ainda descreviam correções como planejadas.

- Aplicados `renderWeightOverride: 700` aos seis headings confirmados visualmente no PDF.
- `Adventure Mode Continued` foi retirado de `suspectedGhost` após confirmar que não existe no fundo raster; título restaurado e peso alinhado ao PDF.
- A última linha inglesa da coluna esquerda usa `renderScaleX: 0.9671`, aplicada somente ao texto-fonte. Antes, as caixas pintadas excediam a linha declarada 10,17 px; após a mudança, o gutter com `IMPORTANT` volta a 14,8 pt equivalentes na escala medida. Overrides de tradução não herdam o fator.
- O usuário ensinou a leitura do eixo `x₀`: cada coluna tem um limite lateral e o conteúdo precisa respeitar o lado correspondente. A skill `visual-fidelity-qa` agora registra a comparação de glifos pintados contra o gutter, além das bboxes.
- Browser recarregado em EN/Admin desligado; título e headings conferidos a 200%, quadro completo em Fit, dimensões efetivas medidas com DOM. `npm run build -w apps/web` passou. Não foram abertos rascunhos, storage nem banco.
- Sem mais correções pendentes nesta página. Próxima tarefa: lote de capturas/diffs pareados e triagem por classes, sem propagar overrides de p. 2/4/13 cegamente.
