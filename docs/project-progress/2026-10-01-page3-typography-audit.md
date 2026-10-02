# Auditoria tipográfica da página 3

- **Status:** concluído para os títulos principais apontados pelo usuário; não é aprovação global do restante das 102 páginas.
- **Data/base:** 2026-10-01, `33ee49f`.
- **Branch:** `codex/book-visual-batch-audit`, criada da `main` atualizada.

## Feedback e objetivo

O usuário observou que os títulos maiores dos assuntos principais da página 3 estão sem negrito, embora tenham peso forte no PDF original. Corrigir esses estilos depois de conferir a referência, sem generalizar a correção para outras páginas ou famílias de fonte.


O usuário também apontou que o livro deve ter uma hierarquia tipográfica rica e regras consistentes de espaçamento que podem ser extraídas e transformadas em critérios verificáveis. Ainda não temos certeza de que as regras devem ser globais; primeiro inventariar estilos e relações de espaçamento, separar níveis de título/corpo/callout/arte, e validar representantes contra o PDF. Ideia registrada, ainda não tratada como regra aceita.

Nova referência do usuário para a auditoria de unidade/diagramação: na página 1, o heading “RULEBOOK” e a linha pequena “Version 1.2 – May 2023” são editáveis separadamente apesar de pertencerem ao mesmo cabeçalho visual. O usuário suspeita que atualmente estejam agrupados. Isso será verificado em uma tarefa separada, sem presumir que proximidade espacial signifique a mesma unidade de edição.

O usuário esclareceu um critério direto de agrupamento: **se o tamanho da fonte for diferente, os textos não pertencem ao mesmo bloco**. Tratar tamanhos diferentes como limite de unidade de edição, inclusive quando os textos estão alinhados e próximos. A observação é especialmente aplicável ao heading grande `RULEBOOK` e à versão pequena na p. 1. Isso não autoriza juntar automaticamente todos os textos de mesmo tamanho: semântica e geometria ainda precisam ser avaliadas.

Método geral definido pelo usuário: verificações independentes para (a) peso/itálico/família/alinhamento, (b) geometria/baselines/gutters e (c) texto duplicado sobre artwork. O detector de duplicação é a prioridade sistêmica seguinte, com exemplos visuais das páginas 56 e 74. Não regenerar nem retocar cartas/imagens na v1. Provar que uma linha HTML extraída já está pintada no background/PDF antes de ocultá-la. `suspectedGhost` sozinho não prova nada; a regra 7 registra um falso positivo na página 13.

## Método planejado

1. Ler as regras visuais e a referência oficial no PDF para identificar os headings principais da página 3.
2. Inspecionar apenas os blocos/spans correspondentes no `page_003_dom.json` (font name, size, flags, weight, bbox, `zIndex` e classificação atual) e comparar com extração visual/textual do PDF.
3. Separar causa de extração (JSON sem peso) de causa de renderização/mapeamento (JSON contém o sinal correto, CSS o perde) e de diferença visual confirmada sem sinal nos metadados.
4. Fazer override estreito em spans confirmados, reutilizando o padrão page-local já provado na página 4 quando aplicável; nunca aplicar bold a todos os headings de uma fonte.
5. Executar o build existente e captura headless apenas da página 3, confrontar com o render oficial e verificar que itens vizinhos não mudaram.
6. Registrar evidência. Depois da correção, abrir uma tarefa separada para inventário da hierarquia/espaçamento e manter duplicação/artwork e geometria como ferramentas próprias.

## Critério de encerramento

Os headings identificados pelo usuário correspondem à aparência e posição no PDF; não houve mudança nos vizinhos; a abordagem (metadados ou override) está documentada; build e captura comparativa foram verificados.

## Resultado

### Evidência encontrada antes da correção

- Comparei o PDF original, o `page_003_dom.json` e a captura EN/Admin desligado a 100% de escala. Os grandes headings `Summary of Components`, `Choosing a Game Mode`, `Playing Encounters`, `Adventurers and Items`, `An Adventurer's Turn`, `Combatants`, `Other Important Rules`, `Abraxis Battle Dice`, `Variants` e `Index` aparecem visivelmente mais pesados no PDF. Captura comparativa ampliada: `tmp/page3-headings-compare.png` (fonte à esquerda, app à direita); imagens regeneráveis em `tmp/page3-pdf.png` e `tmp/page3-app.png`.
- Os 10 spans estão extraídos como `Cinzel-Regular`, 12 pt, flags `4` (small caps); CSS mapeia a face regular a peso 400. Logo, o scanner de nome/flags não detecta a discrepância ótica. A p. 4 já provou a mesma classe de exceção visual e usa 14 overrides `renderWeightOverride: 700` page-local.
- Os alvos da p. 3 ocupam as linhas 0/1 do `block_11`, linha 1 de `block_13`, linha 1 de `block_15`, linha 1 do `block_23`, linha 1 do `block_33`, linha 1 do `block_35`, e linhas 1/2/3 do `block_41`. A composição PDF coloca cada título sobre líderes pontilhados; a largura/colisão com leaders deve ser revisada depois do peso.
- A primeira captura headless saiu em 820 × 820 px, com fundo local 1710 × 1710 px, zoom 100%, EN e Admin off. Corrigi a abordagem do comparador: não fixar width=820.35; layout efetivo medido é 820.25 × 820.25 CSS px por causa da janela/viewport, e captura CSS rasteriza a 820 × 820. O comparador geral foi retirado e não será o verificador tipográfico.

### Correção e verificação concluídas

Adicionei `renderWeightOverride: 700` somente aos 10 spans, preservando fonte/flags originais, texto e todas as bboxes. A comparação da página inteira e de um recorte ampliado confirma que os headings se aproximam do peso do PDF; os dotted leaders, números de página, linhas subordinadas e elementos vizinhos seguem íntegros. Build `npm run build -w apps/web` passou. Captura pós-ajuste: `tmp/page3-app-after.png`; comparação inteira: `tmp/page3-full-after-compare.png`; recorte ampliado: `tmp/page3-headings-after.png`. A viewport headless produziu caixa de 819 × 820 CSS px; o PDF foi renderizado no mesmo tamanho para comparação, sem deformação da geometria.

- **Limite do resultado:** títulos da página 3 corrigidos e revistos; isso não representa auditoria completa de todas as propriedades/páginas do livro. A fonte no PDF continua identificada como Cinzel-Regular/flags 4, então a diferença de peso é uma calibração ótica, não uma descoberta de semibold no metadado.
- **Estado Git:** mudanças locais na branch de tarefa; nenhum commit ou push nesta rodada.
