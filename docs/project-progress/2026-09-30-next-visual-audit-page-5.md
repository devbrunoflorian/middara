# Próxima auditoria visual inglesa: página 5

- **Status:** concluída; comparação do quadro completo e de regiões ampliadas não encontrou divergência visual confirmável; nenhuma correção de app/dados foi justificada.
- **Data:** 2026-09-30.
- **Ponto de partida:** tarefa de amostra 6/101 registrada em [`2026-09-30-next-visual-sample-pages-6-101.md`](2026-09-30-next-visual-sample-pages-6-101.md); save point confirmado em `b91c6fe` (`fix: restore page 6 English card artwork`), árvore limpa, quatro commits locais à frente do remoto, sem push.
- **Seleção:** a linha da página 5 em `book-fidelity-page-matrix.csv` tem 489 spans, 42 blocos com estilos mistos, 131 imagens (126 marcadas como conteúdo), 48 spans em risco de mapeamento de fonte e 6 candidatos de centralização. São sinais para escolher a amostra, não defeitos confirmados.

## Objetivo

Comparar a página 5 inglesa do app com a página física 5 do PDF, identificar diferenças reais de tipo, arte, colunas, imagens e sobreposições, e registrar se algum achado pode alimentar critérios para as demais páginas. Não expandir tradução.

## Método planejado

1. Confirmar a fila e regras no `CONTINUE-HERE.md`, revisar `visual-fidelity-qa` e `07-fantasmas-e-artefatos-duplicados.md`, e ler a linha 5 da matriz.
2. Renderizar o PDF-fonte original e abrir página 5 em EN no app; comparar na mesma escala e conferir o quadro inteiro antes de aproximar regiões.
3. Inspecionar candidatos de fonte no JSON contra o nome/estilo no PDF, inclusive Aristelle, Cinzel Decorative, pesos e alinhamentos; distinguir textos visíveis na imagem de overlays vetoriais e verificar se há duplicação.
4. Se houver defeito, identificar o caminho de pintura/dados antes da correção; não aplicar o patch/mascara da página 6, regra de crédito da página 2 ou ajustes de headings das páginas 4/13 sem evidência local.
5. Implementar apenas correção reversível e delimitada à página/amostra, repetir comparação antes/depois, atualizar matriz e registrar falhas/limitações. Build/lint após alteração de código.

## Critério de encerramento

## Execução e achados

- Fonte confirmada: página física 5 do PDF tem 820,35 × 820,35 pt; renderizada em 2× e numa versão de 800 × 800 para comparação. O app foi observado em EN, Admin desligado, primeiro em 100% para o quadro todo e depois em 175–225% para trechos superiores, centrais e inferiores, com escala visual comparável ao render-fonte.
- Os 489 spans de origem e do JSON continuam idênticos em texto, fonte, tamanho, flags, cor e bbox conforme a triagem existente. A página não contém PUA; os candidatos automáticos desta linha (fontes, estilos mistos e centramentos) não indicaram por si só uma falha.
- Conferidas as duas colunas de texto, as zonas de arte, os intervalos e baselines, bold/itálico inline, headings, gutter, margem decorativa, fio de rodapé e fólio 5. Não foi observada colisão, corte, duplicação ou deslocamento que justifique correção.
- Os headings — `Initiative Cards`, `Story Cards`, `Terrain Tokens`, entre outros — são `Cinzel-Regular`, 12 pt, flags 4 no PDF e no JSON. O renderer usa `CinzelLocal` em 400 com small caps; a comparação visual bate com o PDF. Não aplicar negrito automaticamente por analogia com os headings das páginas 4/13.
- Os rótulos impressos nas mini-cartas/fichas, inclusive as cartas Hidden Card pretas com interrogações brancas e `Large Hidden Card`, fazem parte do background da página e aparecem uma vez; o DOM contém apenas o uso textual legítimo de `Hidden Card` no parágrafo. Assim, a falha de composição corrigida na página 6 não está presente aqui.
- **Sem correção de produção:** esta tarefa não alterou código, JSON de página nem rascunhos. Status da linha 5 na matriz passou a `visual-reviewed`, com os sinais automáticos preservados nas colunas respectivas.
- Desvio observado durante QA: `Page_Down` com foco no controle de zoom avançou o viewer da página 5 para 6. Isso não interferiu na auditoria (retornamos pelo campo de página); foi registrado como comportamento de navegação por teclado para retomar no fluxo UX/editor, fora do escopo visual da página 5.
- Pequenas correções de execução, registradas para reprodutibilidade: a primeira leitura de `get_fonts(full=True)` presumiu tuplas com 4 itens; PyMuPDF devolveu 7 e a extração foi ajustada a índices documentados. A primeira chamada de scroll do CUA usou forma de argumento incorreta; após ler a documentação do browser, usamos `tab.scroll([x,y], "down", 1)` e verificamos topo/rodapé. Nenhuma tentativa alterou dados.

## Verificação, limite e próxima ação

- Inspeção visual do PDF-fonte em duas escalas e do app em 100%, 175%, 200% e 225%, incluindo capturas sobrepostas em regiões de leitura e página inteira. Página 5 classificada como `visual-reviewed`; nenhuma divergência confirmada nesta auditoria.
- Status de visualização não substitui auditoria de tradução/live-preview. A página permanece inglesa sem expansão de tradução; uma próxima correção de engine pode requerer revisão de regressão.
- Quando este registro da página 5 foi fechado, a próxima página selecionada pela matriz era a 7 (21 spans em risco de fonte, 21 blocos com estilos mistos, sete imagens, nenhum PUA). A auditoria separada da página 7 agora está concluída em `2026-09-30-next-visual-audit-page-7.md`; suas correções continuam locais e não se propagam globalmente. A próxima tarefa visual em aberto é completar a revisão de página inteira da página 6, além da região das cartas já corrigida.
