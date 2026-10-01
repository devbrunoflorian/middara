# Tarefa: preparar prova visual piloto das páginas 4 e 13

- **Status:** screenshots do app recebidos; o caso `U+F07E` foi confirmado visualmente na página 13 e os recortes da página 4 foram checados para fantasmas em componentes. Aprovação completa das páginas continua pendente.
- **Data:** 2026-09-30.
- **Objetivo:** transformar os sinais da triagem em critérios concretos para as páginas 4 e 13 sem presumir que sejam defeitos; identificar mudanças sistêmicas apenas após comparação da saída inglesa do app com o PDF.
- **Save point:** os commits `310bd82` e `d5c3820` estão locais na `fix/pixel-render/overflow`. A integração local de fontes posterior está documentada em [`2026-09-30-local-font-assets.md`](2026-09-30-local-font-assets.md) e ainda não foi commitada.
- **Escopo inicial:** somente leitura do PDF oficial, dos DOM JSONs de páginas 4/13 e dos caminhos de renderização. Nenhum JSON, banco, Payload, tradução ou código de produção será alterado nesta etapa de preparação.
- **Critério de conclusão do piloto:** comparar PDF e app em escala equivalente; conferir geometria/alinhamento, família/peso, símbolos, texto vizinho e sobreposição. Não declarar aprovação com base só em JSON ou screenshot do PDF.
- **Mudança concreta desta etapa:** renderizar `Webdings U+F07E` com o asset local, fill vermelho `#b91d23` e stroke branco de `2pt` antes do fill. Permanecem suprimidos Webdings fora desse caso, Wingdings/Wingdings3 e ZapfDingbats até evidência/asset exato.

## Método

1. Localizar os JSONs e imagens de referência das páginas 4 e 13 e conferir os sinais citados na matriz.
2. Verificar no renderer como texto, peso/família, imagens e PUA são tratados nas duas páginas, sem confundir o DOM JSON com pixels do browser.
3. Gerar/reutilizar renders da referência PDF e anotar trechos precisos a comparar na saída inglesa do app.
4. Registrar qualquer discrepância que a evidência permita provar; classificar como renderer, dados/extrator, fonte ausente ou exceção local.
5. Se a discrepância for compartilhada e verificável, corrigir em escopo pequeno e reconstruir; manter aprovação visual pendente até comparar o app.
6. Se faltar a imagem do app, encerrar a parte independente, deixar o item visual em aberto e pedir apenas a evidência indispensável.

## Registro e resultado

- A matriz da triagem indica que a página 4 tem layout denso em colunas/imagens e 24.887 entradas de imagem no JSON, enquanto a página 13 contém PUA `U+F07E` nos avisos `IMPORTANT`.
- A fonte PDF dessas duas páginas já foi inspecionada na auditoria anterior; isso não valida a renderização atual do app.
- Conferência pontual dos DOMs: página 4 tem 398 blocos/1.038 spans, duas colunas e 24 spans `ZapfDingbatsStd` entre 1,42–1,52 pt sobre miniaturas. O fundo local já rasteriza cartas/ícones; esses spans microscópicos são filtrados pelo renderer e não são texto de coluna. O array `PageData.images` não tem consumidores no frontend atual; a contagem alta permanece um sinal de ingestão/payload, não causa visual comprovada.
- Página 13 tem dois spans `Webdings U+F07E`, ambos em títulos de caixas `IMPORTANT`. O `background.webp` local tem as caixas, mas os crops nas coordenadas `[421.5, 390.7]` e `[421.5, 748.4]` não têm o raio vermelho. O PDF rasterizado mostra o ícone vermelho com contorno branco nesses locais.
- Leitura de `Page.get_texttrace()` em todas as 102 páginas: as 62 ocorrências `U+F07E` são cada uma pintadas duas vezes no mesmo bbox — fill vermelho `#b91d23` e stroke branco de 2 pt. O DOM publicado preserva uma só ocorrência branca por glyph; o frontend descarta spans Webdings/Wingdings/Zapf antes do render. O asset Webdings local cobre `U+F07E` como glyph `lightningbolt`.
- Confirmado no código atual: `LineRenderer` retornava `null` para todo span Webdings, Wingdings e ZapfDingbats. Nas páginas 13 e 4, os fundos locais não contêm as marcas/badges minúsculas nos bboxes correspondentes. A família Webdings fornecida tem U+F07E como `lightningbolt`.
- **Correção candidata implementada:** liberar somente span Webdings cujo conteúdo seja exatamente `U+F07E`, usar a fonte local e reproduzir fill vermelho `#b91d23` com stroke branco `2 * scale` CSS px (`2pt` na geometria PDF), em `paint-order: stroke fill`. Mantém os demais símbolos filtrados, inclusive Zapf minúsculos. O CSS `paint-order` e o stroke de texto são suportados em navegadores atuais; ver [MDN: paint-order](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/paint-order) e [MDN: -webkit-text-stroke](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-text-stroke).
- **Correção da interpretação inicial:** o primeiro comentário chamou `U+F07E` de bandeira. O nome do glyph e o crop do PDF confirmam que é um raio vermelho antes de `IMPORTANT`; as pequenas bandeiras laranja visíveis em outros lugares da página são elementos diferentes já presentes na arte de fundo.
- Build `npm run build -w apps/web` passou com 1892 módulos. `npm run lint -w apps/web` não reportou erros; listou sete avisos existentes, incluindo o warning já associado à exportação de `mapPdfFont`. `git diff --check` passou. Fontes e mudanças de código/docs seguem no working tree sem commit/push.
- A correção não está visualmente aprovada: é necessário inspecionar no app se o glyph local tem métricas equivalentes e se o contorno reproduz o traço do PDF sem afetar espaçamento/“IMPORTANT”. A página 4 também aguarda comparação do layout completo de duas colunas e miniaturas.
- Acesso automatizado ao browser local está explicitamente vedado pelo handoff devido à preferência salva; não usar CDP, Playwright ou outra superfície para contornar.
- Screenshots do app fornecidos nesta rodada mostram a página 13 inteira e em crop: os dois raios dos avisos `IMPORTANT` estão vermelhos com stroke branco como na referência. Também mostram crops da página 4; os nomes impressos nos cards são parte da arte raster do PDF e a extração sobreposta continua com `suspectedGhost`, portanto o renderer não os revive. Isso confirma apenas esses sinais, não a página toda.
- O registro detalhado desta verificação e do zoom inicial está em [`2026-09-30-page4-13-visual-review-and-initial-zoom.md`](2026-09-30-page4-13-visual-review-and-initial-zoom.md). Próxima amostra read-only: páginas 3, 6, 15, 24 e 101, em [`2026-09-30-extended-fidelity-sample.md`](2026-09-30-extended-fidelity-sample.md).

## Estado de alterações

- Alterado o renderer somente no caso de U+F07E; nenhum JSON, tradução, Payload ou banco alterado.
- Atualizar a matriz/relatório se a confirmação visual demonstrar aprovação ou exigir ajustes; registrar contraexemplos antes de generalizar além das 62 ocorrências com o mesmo padrão de paint trace.
- O usuário pediu para iniciar o projeto para fornecer screenshots. Na checagem inicial, as portas 8080 (Vite) e 3000 (Payload) estavam fechadas. Ambos iniciaram; Payload respondeu HTTP 200 em `/admin`. O Vite inicialmente vinculou só `::1`, então `localhost:8080` respondia, mas `127.0.0.1:8080` era recusado. Uma tentativa de passar `--host` pelo script raiz abriu a porta padrão 5173 por erro de encaminhamento; parei esse processo e iniciei diretamente `apps/web` com `npm run dev -- --host 127.0.0.1`. Estado final: Vite em 127.0.0.1:8080 e Payload em :3000. Verificação HTTP 200 para frontend `/`, fonte `/fonts/Webdings-Regular.ttf`, JSON da página 13 e Payload `/admin`. Ambos os serviços estão rodando para a captura visual.
