# Tarefa: transformar a auditoria da página 2 em processo para o livro inteiro

- **Status:** iniciado antes do commit da entrega de página 2; fase de descoberta e verificação automatizada por planejar/executar em lotes.
- **Data:** 2026-09-30.
- **Objetivo do usuário:** antes de ampliar a tradução, tornar o texto-base em inglês fiel ao PDF nas 102 páginas (página 2 + as outras 101), sem projetar defeitos de uma página para todas.

## Fechamento da página 2 antes da generalização

O usuário aprovou visualmente a página 2 como impecável após os ajustes de granularidade de créditos, frame de tradução, overflow, título com PUA e hyperlink do Discord. Esta aprovação cobre a página 2 e sua UX traduzida; não prova por si só que a extração inglesa das outras páginas está fiel. O usuário levantou famílias de problemas do original inglês a serem testadas página a página: glifos/alternates PUA, alinhamento/centralização, peso bold, frames e composição.

## O que a página 2 ensinou (hipóteses generalizáveis, não regras universais)

1. **Bloco extraído não é unidade semântica nem frame de layout.** Um raw block pode conter vários créditos; uma unidade editável deve manter labels, corpo, estilos mistos, linhas fonte e frame como dados distintos.
2. **Geometria de origem e caixa de edição são conceitos distintos.** A bbox do texto impresso não define automaticamente a largura, o alinhamento nem o orçamento vertical da tradução.
3. **Uma correção deve cobrir todos os caminhos de renderização.** Texto original por span, preview por linha, override por bloco e unidade de crédito eram caminhos diferentes. A correção tipográfica inicial não chegava ao caminho de override do título.
4. **Diagnóstico de overflow pertence ao Admin.** A métrica pode existir em qualquer estado, mas a marca visual de debug não deve vazar para leitura pública.
5. **Formatação e alternates são dados, não apenas aparência local.** PUA/fonte/peso devem permanecer em segmentos serializados e sobreviver a Payload/localStorage. Confirmamos a API com um registro de teste removido; ainda é necessário separar essa prova de uma validação real do fluxo no browser.
6. **Sidecar por página é útil quando nomeia semântica real.** Em páginas com rótulo/corpo e chave legada ambígua, os metadados resolvem unidades editáveis sem obrigar a todos os demais documentos a adotarem esse modelo.
7. **Links podem ser semânticos sem impor estilo do navegador.** O texto mantém os spans originais e o alvo de link pertence à unidade; no Admin, clique continua sendo affordance de edição.

Esses itens sugerem testes que podem ser reutilizados. Nenhum deles afirma que todas as páginas precisam de sidecars, frames especiais, PUA ou correções de centralização.

## Processo de auditoria proposto

### 1. Inventariar e conferir o corpus

- Confirmar a contagem e a associação de cada uma das 102 páginas do PDF aos JSONs/backgrounds do app.
- Criar matriz por página com contagens de blocos/linhas/spans, fontes e pesos observados, ocorrências de CID/Identity-H/PUA, fontes sem `@font-face`, flags bold/italic, cores, bboxes fora dos limites e artefatos suspeitos.
- Registrar cada métrica como **sinal para revisão**, nunca como prova de fidelidade visual.

### 2. Comparar PDF e extração

- Normalizar apenas o necessário para comparar texto; preservar e contar glyph IDs/PUA separadamente para não esconder perdas por normalização Unicode.
- Confrontar texto, bbox, baseline disponível no PDF, tamanho, fonte, flags, cor e ordem de leitura do PyMuPDF com JSON publicado.
- Identificar spans/baselines omitidos ou fundidos, chaves que fan-out para várias unidades, unidades sem linhas-fonte, colisões de chave e dados fora de página.
- Checar mapeamento de cada fonte/peso para arquivo de fonte e CSS. Tratar `flags` e nome de fonte como evidências independentes até provar a precedência.

### 3. Classificar tipos de página sem aplicar um molde universal

Marcar features observadas por página: prosa, títulos decorativos, tabela/créditos, colunas, índice/TOC, líderes vetoriais, links, imagens intercaladas, caixas coloridas, símbolos/PUA, texto rotacionado, texto rasterizado e mistura de estilos. Uma página pode ter várias classes; regras só incidem quando a feature foi confirmada.

### 4. Fazer comparação visual em lotes curtos

- Gerar render de referência do PDF na mesma escala das páginas do app.
- Validar primeiro uma amostra heterogênea de cinco páginas (2, 3, 4, 101 e uma página selecionada pelos sinais automatizados); a página 2 já é a calibração inicial, as páginas 3/101 têm análises de estrutura e a página 4 tem relato prévio sobre bold.
- Só então expandir o scanner de dados em lotes maiores. Usar uma fila de revisão visual página a página; não marcar uma página `approved` só porque passou nos contadores.
- Para cada alteração compartilhada do renderer, rever a amostra original e uma página de cada classe afetada. Para alteração de sidecar/extração, comparar as páginas alteradas.

### 5. Registrar achados e decidir o escopo da correção

Cada achado recebe uma categoria: (a) renderer comum, (b) extração comum, (c) metadado/layout específico da página, (d) fonte/asset ausente, (e) dúvida semântica para revisão manual. Anotar evidência, páginas afetadas, contraexemplos, reparo, regressão verificada e status. Não aplicar mudanças automáticas em lote apenas porque uma página tem o mesmo nome de fonte ou composição parecida.

## Definição de estados por página

- `not-audited`: nenhuma verificação feita.
- `machine-screened`: só inventário/comparação de dados terminou; não significa fiel.
- `needs-visual`: automação encontrou um candidato ou página requer leitura visual.
- `fix-in-progress`: reparo local/global em curso.
- `visually-approved`: PDF e inglês do app foram comparados, conteúdo/estilos/composição aprovados e defeitos residuais documentados.
- `blocked-source`: fonte, arte, texto rasterizado ou evidência insuficiente impede aprovação.

Manter uma matriz versionada em `docs/project-progress/` com status atual por página e apontar para relatórios de lotes/achados. Nenhuma página é considerada pronta para tradução PT sem estado `visually-approved` ou exceção explícita do usuário documentada.

## Fase imediata

1. Commitar a entrega já aprovada da página 2 e este plano antes de iniciar a auditoria geral, conforme solicitação.
2. Fazer a primeira rodada em cinco páginas, aproveitando as análises existentes de 2/3/101 e incluindo 4 e uma página escolhida por sinais estruturais. Produzir inventário, não alterações em lote.
3. Validar os sinais e o formato da matriz. Só depois executar o scanner read-only nas 102 páginas.
4. Classificar anomalias e preparar a fila visual/por classe; corrigir o inglês por página ou por regra comprovadamente comum.

## Limitações atuais

- O acesso automatizado do agente ao browser local está bloqueado por preferência salva; não contornar por CDP, Playwright nem outra superfície. O usuário pode inspecionar os renders no app e aprovar visualmente.
- Contagem/estrutura de JSON não substituem render do app ao lado do PDF. O processo precisa distinguir cobertura automatizada de aprovação visual.
- As descobertas de página 2 são uma amostra, não evidência de prevalência no livro.
