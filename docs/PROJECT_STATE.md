# Estado do projeto — 27/11/2026

Este é um projeto comunitário feito por fã para consultar e traduzir o Rulebook de Middara. O app tem Viewer, comparação com a página original, edição de texto PT-BR e exportação de páginas para PDF.

O trabalho de tradução e revisão visual continua página por página. O livro inteiro ainda não foi certificado. A cobertura atual por página está em [`translations/page-status.csv`](translations/page-status.csv); propostas isoladas ou correções de layout não fecham uma página por si só.

## PDF completo em revisão

O relatório estrutural da revisão anterior (24/11) registrou 2.441 traduções PT-BR persistidas, zero unidades diagnósticas em branco, zero propostas provisórias usadas e três páginas sem registro PT-BR (31, 88 e 99), verificadas como arte/fólio sem prosa editável. Também registrou as caixas físicas das 102 páginas coincidentes com o OG dentro de 0,001 pt, 325.278 caracteres selecionáveis e zero U+FFFD. Esses números são evidência estrutural daquele relatório, não certificam a fidelidade visual integral nem foram recalculados depois das alterações recentes.

O PDF digital local `output/pdf/middara-rulebook-pt-BR.pdf` tem 102 páginas e está atualizado em 27/11 às 09:46 (504.004.016 bytes). O job `e373dc13-053f-4473-9252-e85e7bcf735a` renderizou/verificou 102/102 páginas, confirmou texto selecionável em todas e 40 bookmarks. Depois, a limpeza de fundo da p.61 foi incorporada ao PDF por substituição incremental da imagem de fundo, sem reexportar as outras 101 páginas. A rechecagem posterior confirmou 102 páginas não vazias, 325.059 caracteres selecionáveis conforme a métrica do verificador (espaço final de cada página removido), zero `U+FFFD`, 40 bookmarks e todas as caixas Media/Crop/Bleed/Trim/Art coincidentes com o OG dentro de 0,01 pt. Na p.61, 2.436 pixels mudaram apenas na região limpa `[395,1449,508,1475]` (raster de 1710 px); zero pixels fora dela mudaram e o texto permaneceu idêntico. Evidência complementar: `output/pdf/jobs/e373dc13-053f-4473-9252-e85e7bcf735a/post-export-localized-patch-verification.json`. Isso valida a exportação tecnicamente e a correção raster local, não certifica a revisão visual integral das 102 páginas.

**O arquivo acima está desatualizado em relação ao Payload atual e não é o PDF final de entrega.** Em 27/11, o usuário escolheu `Stamina Points` → **Pontos de Vigor** para prosa de regras, preservando `SP` e nomes/rótulos impressos de componentes. As traduções aprovadas das pp.38 e 100 já usam “Pontos de Vigor”, mas o PDF atual ainda contém “Pontos de Stamina” nessas duas unidades. A p.100 foi reconciliada pelo Reviewer oficial e mede EXACT 1/1 em 100% e 200%; a publicação anterior foi preservada no histórico. Restam 21 traduções salvas com a forma antiga em 19 páginas (14 com revisão ativa aprovada; 7 sem revisão correspondente). Reconciliar esses registros com histórico e copyfit antes de gerar a única substituição integral do PDF.

A falha recente `ENOENT` veio de um caminho antigo do PDF-fonte em `Downloads`. `apps/admin/.env` local agora aponta ao PDF OG existente em `C:/Users/bruno/Middara/Rulebook 1.2/`; o job completo posterior terminou e o endpoint de download respondeu HTTP 200 com o tamanho final. Um job interrompido mais antigo também registrou fechamento do Chromium na p.34; isso é uma falha distinta. O PDF continua sendo uma saída digital RGB, não um arquivo pronto para gráfica; o fluxo CMYK/PDF/X segue separado em [`roadmap/final-output-print-and-app.md`](roadmap/final-output-print-and-app.md).

O snapshot de recuperação mais recente disponível (27/11, 06:28Z) registra quatro divergências locais, todas na p.64. O PDF foi exportado do Payload salvo; sua extração contém as versões do Payload de `page_64_block_4`, `_5` e `_7`, incluindo BRANCO/ROXO e DANO FÍSICO. Os rascunhos locais antigos desses blocos não foram importados nem usados no PDF. O bloco 8 tem o mesmo texto, mas referências de asset do símbolo diferentes; o bloco 6 está confirmado. O app ainda pode pedir resolução manual dessas quatro divergências antes de uma nova exportação.

A varredura do Viewer marcou elementos com excesso geométrico nas pp. 2, 13, 32, 40, 44, 62, 77, 78, 79, 82, 89, 90, 95, 96, 100 e 102. Muitos avisos são controles de crédito; os demais precisam ser classificados com a tinta real do PDF e do OG antes de fechar a revisão. A p.64 ainda tem uma diferença aparente de densidade tipográfica; a regra compartilhada de tracking/leading é uma possível causa em investigação no item 09 do ROADMAP.

O foco desta rodada é comparar cada ajuste ao PDF de referência e corrigir problemas concretos de recuo, listas, continuação de parágrafos, copyfit, símbolos e hierarquia tipográfica. As soluções recorrentes já confirmadas estão em [`translations/common-layout-issues.md`](translations/common-layout-issues.md).

O status detalhado por página está em [`translations/page-status.csv`](translations/page-status.csv). A revisão integral OG × PDF continua aberta; não declarar o livro final até classificar os alertas do export e concluir as páginas que ainda não têm certificação visual integral.

O roadmap já inclui uma melhoria de desempenho para preparar em cache as dez páginas seguintes no idioma ativo e usar skeleton loaders durante a espera.

As traduções salvas no Payload ficam no SQLite local. O Git não publica esse banco.
