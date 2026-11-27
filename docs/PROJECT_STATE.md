# Estado do projeto — 27/11/2026

Este é um projeto comunitário feito por fã para consultar e traduzir o Rulebook de Middara. O app tem Viewer, comparação com a página original, edição de texto PT-BR e exportação de páginas para PDF.

O trabalho de tradução e revisão visual continua página por página. O livro inteiro ainda não foi certificado. A cobertura atual por página está em [`translations/page-status.csv`](translations/page-status.csv); propostas isoladas ou correções de layout não fecham uma página por si só.

## PDF completo em revisão

O relatório estrutural da revisão anterior (24/11) registrou 2.441 traduções PT-BR persistidas, zero unidades diagnósticas em branco, zero propostas provisórias usadas e três páginas sem registro PT-BR (31, 88 e 99), verificadas como arte/fólio sem prosa editável. Também registrou as caixas físicas das 102 páginas coincidentes com o OG dentro de 0,001 pt, 325.278 caracteres selecionáveis e zero U+FFFD. Esses números são evidência estrutural daquele relatório, não certificam a fidelidade visual integral nem foram recalculados depois das alterações recentes.

O arquivo local `output/pdf/middara-rulebook-pt-BR.pdf` tem 102 páginas e foi gravado em 27/11 às 01:07. Ele ainda contém o ajuste anterior de gap inline na p.83, mas antecede as correções desta rodada: remoção do ghost overlay da p.83 e ajuste de peso do título da p.84. A exportação de uma página da p.84 percorreu preparação, renderização e verificação com sucesso (1/1); o livro completo ainda não foi reexportado nem revalidado após essas correções.

A varredura do Viewer marcou elementos com excesso geométrico nas pp. 2, 13, 32, 40, 44, 62, 77, 78, 79, 82, 89, 90, 95, 96, 100 e 102. Muitos avisos são controles de crédito; os demais precisam ser classificados com a tinta real do PDF e do OG antes de fechar a revisão. A p.64 ainda tem uma diferença aparente de densidade tipográfica; a regra compartilhada de tracking/leading é uma possível causa em investigação no item 09 do ROADMAP.

O foco desta rodada é comparar cada ajuste ao PDF de referência e corrigir problemas concretos de recuo, listas, continuação de parágrafos, copyfit, símbolos e hierarquia tipográfica. As soluções recorrentes já confirmadas estão em [`translations/common-layout-issues.md`](translations/common-layout-issues.md).

O status detalhado por página está em [`translations/page-status.csv`](translations/page-status.csv). A revisão integral OG × PDF continua aberta; não declarar o livro final até classificar os alertas do export e concluir as páginas que ainda não têm certificação visual integral.

O roadmap já inclui uma melhoria de desempenho para preparar em cache as dez páginas seguintes no idioma ativo e usar skeleton loaders durante a espera.

As traduções salvas no Payload ficam no SQLite local. O Git não publica esse banco.
