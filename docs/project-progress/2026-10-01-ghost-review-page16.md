# Ghost text review: page 16

- **Status:** correção localizada implementada e conferida visualmente em aba limpa do viewer a 200%; sem discrepância confirmada restante no inset revisado.
- **Data:** 2026-10-01.
- **Branch:** `codex/book-visual-batch-audit`.
- **Motivo da prioridade:** o usuário reportou vários “fantasminhas” na página 16. A triagem estática book-wide também encontrou 56 grupos de spans em bboxes coincidentes nesta página.

## Objetivo

Determinar quais diferenças visuais percebidas na página 16 são texto duplicado no viewer, quais são camadas de cor intencionais (por exemplo, sobreposição preta/branca para contorno) e quais são arte/texto rasterizado já presente no fundo. Corrigir somente casos que a comparação PDF ↔ app confirmar, preservando estilos e rótulos legítimos.

## Evidência preliminar

- `scripts/audit_coincident_text_passes.py` varreu 102 arquivos JSON e encontrou 514 grupos com bboxes coincidentes em 94 páginas. Na p. 16 há 56 grupos; exemplos incluem as letras `BLUE LOOT` repetidas em spans preto/branco dentro de letras individuais e headings Cinzel/Cinzel branco no mesmo bbox.
- A triagem é read-only e não dá classificação: dois textos no mesmo bbox podem ser passes intencionais de cor/contorno, duplicatas em blocos distintos ou conteúdo extraído sobre artwork.
- A matriz de ghosts tem p. 16 com 7 regiões pendentes. Os sinais não substituem conferência em escala de leitura.

## Comparação visual e achado confirmado

- Renderizei a p. 16 do PDF na mesma resolução de `background.webp` (1710 × 1710) e comparei a página toda, o cabeçalho “Bombing the Sickles continued”, o inset de “TIP: Multiple Exits”, a coluna de regras e o número de página da mini página.
- A mini página está embutida no fundo do viewer. No crop do título, PDF e `background.webp` já contêm o mesmo texto raster; a camada HTML da linha `line_196_0` desenha o título mais uma vez. A captura do viewer em 225% mostra as letras duplas; o PDF em escala igual tem um só título limpo.
- O mesmo comportamento atinge outros textos vetoriais extraídos dentro da mini página, inclusive títulos de seção, explicações, rótulos de Loot/Totem/Objective, palavras de Exit e número impresso. Ex.: `Special Encounter Rules` (`line_34_0`), `BLUE LOOT:` (`line_63_0`), `EXIT` (`line_180_0` e `line_183_0`) e corpo dos blocos 190–195. A região medida para a página ilustrada é x=80–490 pt, y=98–660 pt; a legenda explicativa viva à direita começa em x≈551 pt e fica fora.
- As áreas vermelhas embaralhadas em “hidden text” aparecem também no render do PDF original. Elas fazem parte do original e não devem ser limpas nem classificadas como fantasmas.
- As linhas já marcadas `suspectedGhost` permanecem com a regra atual. A correção proposta é marcar as demais linhas dentro do retângulo da mini página como `rasterizedDuplicate`, preservando sua disponibilidade no Admin e para override/tradução conforme o comportamento já usado no viewer.

## Correção aplicada

Estender a allowlist de supressões de artwork auditadas com somente a mini página p. 16 (x=80–490, y=98–660 pt), ignorando linhas já `suspectedGhost`. A contagem marcada foi 154 linhas; 50 linhas suspeitas foram preservadas pelo gate e quatro letras de chamada dentro da figura foram mantidas como overlay editável.

## Resultado e critério do usuário

- Viewer reaberto em aba limpa em escala de leitura de 200% após atualizar o JSON: o título “Bombing the Sickles continued” aparece uma vez; o layout e os rótulos C/D/E/G conferidos permanecem visíveis. A primeira aba antiga ainda mostrava estado em cache; a verificação final usou uma navegação nova.
- O usuário informou que a página 16 já lhe parecia correta. A comparação independente identificou a duplicação do título/cópia da mini página no viewer, e a atualização removeu essa duplicação. Não há outra diferença visual confirmada no trecho revisto.
- A arte vermelha embaralhada das caixas de texto oculto consta também no PDF oficial. Foi mantida. Linhas extraídas marcadas `suspectedGhost` fora da supressão da mini página não foram reclassificadas nem apagadas neste tracer.
- O script de supressão é idempotente para os registros da p. 16; as regiões antigas p. 56/74 mantêm seu manifesto e comportamento anteriores.
- Verificações: `python -m py_compile` nos dois scripts; `python scripts/apply_audited_artwork_text_suppressions.py` executou duas vezes com as mesmas contagens (p. 16: 154; p. 56: 4; p. 74: 95); `npm run build -w apps/web` passou; `git diff --check` passou. Vite ainda mostra o aviso pré-existente de `/texture.png` não resolvido no build.
- Estado: p. 16 não está certificada em todos os critérios tipográficos/geometria do livro; este tracer resolve apenas a duplicação raster/vector da mini página. As sete regiões do scanner continuam como evidência de triagem, não como sete defeitos confirmados.

## Método

1. Ler a captura/referência do usuário se disponível no contexto e navegar a p. 16 inglesa no browser em escala adequada.
2. Comparar a página completa e exemplos críticos contra o PDF original, além dos crops PDF/background existentes; registrar alinhamento, cor, fonte, tamanho e sequência dos spans coincidentes.
3. Distinguir linhas HTML que o app efetivamente desenha de spans menores que 4 pt ou glifos já filtrados. Inspecionar se a duplicação percebida vem de uma camada HTML, de dois passes do mesmo glifo ou do próprio fundo.
4. Só aplicar um override/supressão a linhas exatas cujo efeito visual esteja provado no PDF e no app. Se os dois passes são tratamento intencional de contorno, preservar a aparência com uma implementação que posicione os passes coincidentes no mesmo bbox, sem alterar outros estilos.
5. Recarregar o app após correções e comparar de novo; deixar qualquer ambiguidade registrada e não certificar a página se não for resolvida.

## Limites

- Não editar arte, fundo, PDF original, traduções, drafts, `localStorage` nem banco.
- Não ocultar os 56 grupos com base no scanner; não generalizar para as outras páginas sem validação.
- Manter `suspectedGhost`, diferença de pixels e ordem de pintura como sinais, não como decisão automática.

## Resultado

Pendente — atualizar após inspeção visual, eventual correção localizada e validação antes/depois.
