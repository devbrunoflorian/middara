# Próxima auditoria visual inglesa: página 7

- **Status:** concluída em 2026-10-01; dois defeitos locais corrigidos e comparados visualmente com a página física 7 do PDF.
- **Data:** 2026-09-30 a 2026-10-01.
- **Ponto de partida:** auditoria visual da página 5 concluída sem defeito confirmado; save point anterior permanece `b91c6fe`, sem push.
- **Seleção pela matriz:** página 7 tem 21 spans sinalizados para fonte, 21 blocos com estilos mistos, sete imagens e zero PUA. São indicadores para amostra, não prova de erro.

## Objetivo

Comparar a página 7 em inglês no app com a página física 7 do PDF original, identificar somente diferenças comprovadas e registrar lições que sirvam para páginas com texto corrido/estilos mistos. Não traduzir nem executar correções em lote.

## Método planejado

1. Reler este handoff, as rules 00/06/13, a referência visual, a regra de fantasmas e as skills de QA visual/layout.
2. Renderizar a página física 7 do PDF original e localizar a mesma página no app em EN/Admin desligado.
3. Comparar página inteira em Fit-to-Screen e áreas em escala de leitura, verificando headings, pesos/itálicos dentro do parágrafo, alinhamento, gutters, imagens, tokens e rodapé.
4. Cruzar suspeitas com os spans de origem/JSON e os assets de fundo. Distinguir texto dentro de composição gráfica de texto HTML; não inferir bug apenas de fontes sinalizadas.
5. Se houver diferença, determinar a causa no caminho de dados/render antes de mudar código. Registrar plano antes de qualquer implementação e testar só esta página.

## Critério de encerramento

Atualizar o registro e a linha 7 da matriz apenas com evidência da comparação. Manter `needs-visual` até completar a revisão suficiente; se não houver diferença, registrar `visual-reviewed` e não mexer no app. Caso haja fix, validar PDF/app lado a lado, vizinhos, build/lint e limitações antes de marcar a revisão.

## Achado confirmado e plano de correção (registrado antes da edição)

- A página física 7 e o JSON têm uma única linha `block_32 / line_32_1`: glifo `❇` da fonte `ZapfDingbatsStd` seguido por “Hidden Decks included in the itemized lists.”
- O recorte do PDF e o recorte do `background.webp` na bbox do rodapé (aprox. x=530–760 pt, y=742–779 pt) mostram que a mesma linha inteira já está rasterizada no fundo, com aparência legível. O print do app em 225% mostra o fundo e a linha HTML sobrepostos, repetindo e borrando o texto.
- Portanto, a causa não é duplicação no JSON nem tradução/agrupamento de colunas: a extração de fundo não retirou esse texto rasterizado, e o viewer o desenha outra vez como HTML. A filtragem global de `ZapfDingbatsStd` já suprime somente o glifo HTML; o texto Optima continua sendo sobreposto.
- **Correção planejada:** marcar apenas `line_32_1` como `rasterizedDuplicate: true`, usando o mecanismo já existente em `LineRenderer` para não pintar a cópia HTML quando o fundo é a fonte visível. Isso deixa intactos os demais itens do bloco, a linha rasterizada e todas as outras páginas. O wrapper do bloco continua editável; um override de tradução substitui a fonte. Nenhuma regra global de fonte/ghost será alterada.
- **Aceitação:** comparar página 7 inteira e o rodapé em zoom de leitura; a linha precisa aparecer exatamente uma vez, o símbolo permanecer visível do background, e os vizinhos/rodapé não mudarem. Não abrir o editor nem ler rascunhos salvos; a acessibilidade de edição será avaliada pelo caminho de render existente e registrada como limitação de QA.

## Segundo achado confirmado e plano de correção (registrado antes da edição)

- O quadro de componentes tem 20 glifos `❏` (U+274F, “LOWER RIGHT DROP-SHADOWED WHITE SQUARE”) antes dos itens em negrito. A comparação mostra as caixas no PDF e sua ausência no fundo; o app também não as desenha.
- `LineRenderer` suprime todos os spans `ZapfDingbatsStd`, causa já conhecida para não mostrar glifos de fonte inadequada. Aqui a supressão deixa de ser fiel porque essas 20 caixas não estão rasterizadas em `background.webp`; os 20 bboxes confirmados estão nos spans da página 7. Os outros labels internos de componentes, por sua vez, já estão na arte e não devem ser refeitos.
- **Correção planejada:** criar uma sobreposição SVG transparente, limitada à área da lista e apenas aos 20 bboxes das caixas da página 7. Desenhar os quadrados com o contorno/sombra do símbolo-fonte, mantendo os spans existentes como linhagem/editorial e sem trocar o mapeamento global de Zapf. Carregar a mesma sobreposição decorativa em EN e PT; mantê-la visível também em Admin com `pointer-events: none`, para que não impeça selecionar o bloco nem desapareça ao traduzir o texto. Reutilizar o contrato `PageFidelityOverlay` já presente; nenhum texto será rasterizado nesta camada.
- **Aceitação:** PDF, fundo e app devem mostrar 20 caixas em posições e proporções correspondentes, sem caixa duplicada, sem cobrir letras e sem deslocar a lista. Conferir topo/rodapé e as três colunas depois da correção; confirmar que a nota segue em linha única. Não abrir editor nem inspecionar rascunhos.

## Execução, correções e resultado

- A primeira edição marcou por engano a linha vazia `line_32_0` como duplicada. A validação do JSON antes da captura visual detectou o erro; o marcador foi movido para a linha correta `line_32_1`. Esse desvio foi corrigido antes de qualquer conclusão de QA.
- `line_32_1` agora usa `rasterizedDuplicate: true`. O bloco pai permanece no DOM e o mecanismo existente continua permitindo selecionar a unidade no modo Admin; a QA não abriu o editor nem inspecionou rascunhos. A nota rasterizada aparece uma vez no fundo.
- As 20 caixas da lista estavam ausentes porque o renderer suprime spans `ZapfDingbatsStd` globalmente e o background não contém esses glifos. Foi criado `scripts/build_page_007_checkbox_overlay.py`, que exige exatamente 20 spans `U+274F` e gera um SVG transparente limitado à região auditada. A mesma camada decorativa é declarada para EN e PT; `pointer-events: none` vem do contrato existente de `PageFidelityOverlay`, preservando os cliques nos textos.
- A primeira versão do SVG desenhava a sombra como um retângulo cheio. Ao comparar o app ampliado com `page-007-checkbox-source.png`, isso ficou pesado; a forma foi corrigida para um contorno vazado com sombra inferior/direita em “L”. O `.gitignore` recebeu exceções somente para os dois artefatos versionados da página 7.
- **QA visual:** em EN/Admin desligado, comparados o quadro completo em 100% e as três colunas/lista em 225%, além dos recortes do PDF e do background. As 20 caixas estão presentes, vazadas e alinhadas antes dos respectivos itens; a nota permanece em uma linha e sem sobreposição; título, arte superior, listas, margens e fólio 7 permanecem no lugar. A pequena camada não encobre caracteres. A página foi deixada em Fit to Screen (100%).
- **Verificação técnica:** `npm run build -w apps/web` passou. `npm run lint -w apps/web` terminou sem erros, com sete warnings preexistentes de regras React em `FontEditor.tsx`, `App.tsx`, `PageRenderer.tsx` e `RichSpanEditor.tsx`. `git diff --check` passou; Git apenas avisou sobre conversão LF→CRLF.
- **Limites:** nenhuma edição de conteúdo/tradução e nenhum rascunho foram lidos. O SVG recompõe a aparência do glifo para este caso e não é uma fonte Zapf geral; a interação em Admin foi preservada pelo caminho de clique existente e pelo `pointer-events: none`, mas não se abriu o editor nesta QA.
- **Conclusão para a matriz:** página 7 passa a `visual-reviewed`, sem propagar correção de fonte/PUA às demais páginas. Aprendizado geral: comparar cada símbolo suprimido com pixels do background e PDF; restaurar apenas os glifos confirmados por página. Para texto rasterizado já presente no background, esconder somente a linha HTML duplicada, mantendo a unidade/override disponíveis.
