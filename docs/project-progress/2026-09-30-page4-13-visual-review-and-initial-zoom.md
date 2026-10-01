# Auditoria visual das páginas 4 e 13 e zoom inicial

- **Status:** concluída para os sinais específicos auditados; páginas 4/13 ainda não estão aprovadas como páginas completas.
- **Data:** 2026-09-30.
- **Objetivo:** revisar os screenshots ingleses enviados pelo usuário, investigar possíveis textos fantasmas sobre miniaturas na página 4 usando a rule 07, confirmar os raios Webdings da página 13 e iniciar o viewer em 200%, mantendo “Fit to Screen” em 100%.
- **Escopo:** investigação local do PDF oficial, screenshots e DOMs das páginas 4/13; mudança pequena no zoom do frontend; sem reextração em lote, alteração de JSON, banco, traduções ou conteúdo do PDF.
- **Critério de verificação:** comparar cada candidato à extração com o PDF fonte; confirmar em código que o estado inicial é 2 e Fit to Screen continua em 1; build, lint e `git diff --check` sem novos erros.

## Evidência inicial e método

- Os quatro screenshots do app enviados nesta rodada mostram a página 13 inteira e em detalhe, a página 4 em detalhe e a área “Summary of Components”. Os dois raios vermelhos contornados de branco aparecem nos avisos `IMPORTANT` da página 13.
- O usuário chamou atenção para possíveis rótulos fantasmas em componentes/cartas. A rule `.agents/rules/07-fantasmas-e-artefatos-duplicados.md` exige tratar sobreposição com assets de conteúdo como **candidato**, distinguir arte de fundo e nunca apagar automaticamente sem prova.
- Conferir os candidatos nas coordenadas dos spans, comparar com raster/crop do PDF oficial e verificar `suspectedGhost` no DOM. Depois ajustar qualquer falha comprovada em escopo mínimo.
- Inspecionar o ciclo de zoom em `App.tsx`: estado inicial `zoomLevel` deve ser 2; o controle Fit to Screen continua chamando `setZoomLevel(1)`; limites e passos dos botões permanecem intactos.

## Registro da execução

- O PDF oficial foi renderizado localmente nas páginas físicas 4 e 13 para referência. A comparação dos screenshots enviados mostra os raios antes de `IMPORTANT` na página 13 em vermelho com borda branca, correspondentes à aparência do PDF. Considero o candidato `U+F07E` visualmente confirmado neste piloto.
- Na página 4, os rótulos “Cave Sickle”, “Earth Log” e “Water Log”, além dos nomes sobre cards de personagem, aparecem impressos dentro das miniaturas no PDF. O texto extraído sobre essas imagens está marcado como `suspectedGhost` (por exemplo, blocos 226–227 e múltiplos fragmentos legíveis dos cards à esquerda); as linhas herdaram a marca, e o renderer descarta linhas `suspectedGhost` por padrão. O screenshot do app mostra a arte/rotulagem rasterizada uma vez, sem prova de cópia extra ressurgida. Resultado: não alterar a heurística da rule 07 nem ocultar os rótulos rasterizados.
- Uma inspeção por script inicialmente tentou imprimir um caractere decorativo PUA no terminal Windows CP1252 e falhou por codificação. Repeti a extração limitando os resultados a texto codificável e confirmei os bboxes/textos fantasmas relevantes; nenhum arquivo de dados foi alterado.
- `apps/web/src/App.tsx`: o multiplicador inicial agora é `2`, com comentário que esclarece a relação com a escala “fit”. O botão existente Fit to Screen permanece `setZoomLevel(1)`, portanto restaura 100%; limites e incremento dos controles não mudaram.
- A busca da skill `modern-web-guidance` não encontrou uma orientação específica para um estado escalar estático de zoom; os resultados foram guias gerais de transições/layout, não aplicáveis. Implementação usa o controle simples que já existe.
- `npm run build -w apps/web`: sucesso (`tsc -b` e Vite; 1.892 módulos). O aviso existente de `/texture.png` permanece resolvido em runtime e inalterado.
- `npm run lint -w apps/web`: sem erros; sete warnings já existentes em `FontEditor.tsx`, `App.tsx`, `PageRenderer.tsx` e `RichSpanEditor.tsx`; nenhum arquivo recém-alterado introduziu warning novo.
- `git diff --check`: sucesso. Frontend local continua respondendo HTTP 200.
- A observação visual é limitada aos screenshots enviados (crops da página 4, página 13 inteira e crop de detalhes) e à comparação com as páginas 4/13 renderizadas do PDF. O screenshot antecede o ajuste de zoom; o novo valor está verificado no código e no build, mas não por captura posterior a refresh.

## Resultado e estado

- As duas ocorrências visíveis de `U+F07E` na página 13 correspondem ao PDF: ícones vermelhos com contorno branco. O ajuste estreito existente cumpre o caso observado; a família não foi ampliada para outros pictogramas.
- Os rótulos/nomezinhos sobre componentes da página 4 são tinta rasterizada da própria arte de cartas no PDF. As cópias textuais extraídas que se sobrepõem às cartas têm `suspectedGhost: true` e o renderer as esconde. Nenhum duplicado adicional ficou comprovado nos recortes recebidos; preservar regra 07 e o artwork.
- A escala de zoom inicial foi alterada de 100% para 200% do multiplicador da escala medida de ajuste. Fit to Screen continua em 100%; não muda sua implementação nem os passos do zoom.
- Nenhum JSON, imagem de fundo, tradução, banco ou Payload foi alterado. Mudança de código: somente estado inicial de zoom em `apps/web/src/App.tsx`.
- Não há commit nem push nesta rodada. O workspace contém outros itens não commitados de integração de fontes/renderer, já listados no handoff; não os incluí nem os limpei.

## Próximo passo

Prosseguir com a triagem por amostragem das páginas 3, 6, 15, 24 e 101 registrada em [`2026-09-30-extended-fidelity-sample.md`](2026-09-30-extended-fidelity-sample.md). No próximo uso do app, o usuário pode confirmar visualmente o zoom de 200% após refresh; essa captura não bloqueia a investigação read-only nem aprova as páginas inteiras.
