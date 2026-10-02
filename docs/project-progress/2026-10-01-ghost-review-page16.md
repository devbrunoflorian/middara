# Ghost text review: page 16

- **Status:** 202 linhas confirmadas como duplicatas no inset foram suprimidas da leitura normal e continuam acessíveis/identificadas no Admin; duas linhas de número coincidentes permanecem sem decisão. Viewer e build conferidos.
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
- As áreas vermelhas embaralhadas em “hidden text” aparecem também no render do PDF original e são arte-fonte a preservar. Porém, 48 linhas legíveis extraídas (recompensas e narrativas de Loot/Totem) reapareciam em verde sobre essas áreas no viewer, embora não existam legíveis no PDF final; são fantasmas confirmados e devem ficar ocultos no viewer.
- `line_197_0` e `line_197_1` (`55`) têm exatamente o mesmo bbox e texto. O PDF exibe um único número; como podem ser dois passes de estilo, foram mantidos fora da supressão até revisão específica.
- A linha `Adventure Mode Continued` da p. 13 não tem atualmente o sinal `suspectedGhost` no JSON. Ela foi usada como controle visual presente, sem atribuir a presença ao novo caminho de renderização.

## Correção aplicada

Manter a allowlist localizada da mini página (x=80–490, y=98–660 pt), com os 154 overlays anteriormente confirmados e mais 48 linhas dos painéis de texto oculto confirmadas por IDs exatos. As quatro letras de chamada C/D/E/G continuam preservadas. A execução por `--page 16` deixa p. 56/74 intocadas.

## Resultado e critério do usuário

- Viewer em aba limpa: na p. 16, os blocos vermelhos de texto oculto continuam como na referência e o texto HTML legível não aparece mais sobre eles; o título do inset aparece uma vez, e os rótulos de chamada continuam preservados. Na p. 13, `Adventure Mode Continued` permanece no DOM e visível no normal viewer.
- A confirmação das 48 linhas resultou da comparação direta da renderização oficial (painéis vermelhos sem texto legível) com o viewer antes da supressão (texto legível sobreposto). Os dois spans `55` ficaram pendentes como contraexemplo coincidente; nenhum sinal de duplicidade foi promovido sem decisão.
- No Admin, os 202 spans com `rasterizedDuplicate` são renderizados para inspeção/seleção e recebem contorno tracejado vermelho e descrição/tooltip; fora do Admin, só as linhas explicitamente confirmadas são ocultadas.
- `python -m py_compile scripts/apply_audited_artwork_text_suppressions.py` passou. O script por página `--page 16` é idempotente: reexecução manteve hash do JSON; existem 48 linhas com evidência `page16-hidden-text-panels-v1`, 154 linhas do manifesto anterior e os dois spans `55` sem marca. `npm run build -w apps/web` e `git diff --check` passaram. Vite mantém o aviso conhecido de `/texture.png` não resolvido.
- Estado: concluída a classe de duplicação sobre a mini página da p. 16; a página ainda não está certificada em todos os critérios tipográficos/geometria do livro. Sete regiões do scanner continuam sendo sinais de triagem, não sete defeitos confirmados.

## Método

1. Ler a captura/referência do usuário se disponível no contexto e navegar a p. 16 inglesa no browser em escala adequada.
2. Comparar a página completa e exemplos críticos contra o PDF original, além dos crops PDF/background existentes; registrar alinhamento, cor, fonte, tamanho e sequência dos spans coincidentes.
3. Distinguir linhas HTML que o app efetivamente desenha de spans menores que 4 pt ou glifos já filtrados. Inspecionar se a duplicação percebida vem de uma camada HTML, de dois passes do mesmo glifo ou do próprio fundo.
4. Só aplicar um override/supressão a linhas exatas cujo efeito visual esteja provado no PDF e no app. Passes coincidentes de estilo continuam pendentes até comparação independente.
5. Recarregar o app após correções e comparar de novo; deixar qualquer ambiguidade registrada e não certificar a página se não for resolvida.

## Limites

- Não editar arte, fundo, PDF original, traduções, drafts, `localStorage` nem banco.
- Não ocultar os 56 grupos com base no scanner; não generalizar para as outras páginas sem validação.
- Manter `suspectedGhost`, diferença de pixels e ordem de pintura como sinais, não como decisão automática.
