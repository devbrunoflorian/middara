# Estado do projeto — 23/11/2026

Este é um projeto comunitário feito por fã para consultar e traduzir o Rulebook de Middara. O app tem Viewer, comparação com a página original, edição de texto PT-BR e exportação de páginas para PDF.

O trabalho de tradução e revisão visual continua página por página. O livro inteiro ainda não foi certificado. A cobertura atual por página está em [`translations/page-status.csv`](translations/page-status.csv); propostas isoladas ou correções de layout não fecham uma página por si só.

O foco desta rodada é comparar cada ajuste ao PDF de referência e corrigir problemas concretos de recuo, listas, continuação de parágrafos, copyfit, símbolos e hierarquia tipográfica. As soluções recorrentes já confirmadas estão em [`translations/common-layout-issues.md`](translations/common-layout-issues.md).

A revisão atual está na p.64. Ela tem 14 traduções no Payload, mas só três revisões ativas aprovadas; a comparação recente com o OG e o export foi parcial, e o peso da fonte regular continua em investigação. A p.65 foi fechada em 23/11: 8/8 traduções publicadas e aprovadas, Copyfit EXACT em 100% e 200%, 14 símbolos semânticos e o dado branco restaurado com os vetores originais 136–144. OG, Viewer e export PT-BR foram comparados na página inteira, sem clipping ou colisões visíveis. O status detalhado está em [`translations/page-status.csv`](translations/page-status.csv).

O roadmap já inclui uma melhoria de desempenho para preparar em cache as dez páginas seguintes no idioma ativo e usar skeleton loaders durante a espera.

As traduções salvas no Payload ficam no SQLite local. O Git não publica esse banco.
