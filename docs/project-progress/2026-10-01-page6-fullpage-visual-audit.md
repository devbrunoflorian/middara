# Auditoria visual integral inglesa: página 6

- **Status:** concluída em 2026-10-01; a página inteira e o patch de cartas foram comparados com o PDF em zoom de leitura.
- **Data:** 2026-10-01.
- **Ponto de partida:** checkpoint local `134c37d` (`fix: restore page 7 component list fidelity`), branch `fix/pixel-render/overflow`, cinco commits à frente do remoto; sem push. Páginas 5 e 7 estão marcadas `visual-reviewed`.
- **Registro anterior relacionado:** [`2026-09-30-next-visual-sample-pages-6-101.md`](2026-09-30-next-visual-sample-pages-6-101.md), que documenta a falha das cartas Hidden Card, as tentativas descartadas e a camada de reparo page-local.
- **Seleção:** página 6 tem 322 spans, sete ocorrências Identity-H, 40 candidatos `ZapfDingbatsStd`, 149 imagens/placements (144 conteúdos) e 30 blocos de estilo misto. Sinais automáticos para revisão, não defeitos presumidos.

## Objetivo

Completar a fidelidade da página física 6 em inglês no app, observando a página inteira e escala de leitura; verificar a região corrigida, as áreas adjacentes, tipografia, alinhamentos, imagens, folio e margens. Não traduzir, não alterar drafts e não presumir que o patch da página 6 se aplique a outras composições.

## Método planejado

1. Reconsultar `CONTINUE-HERE.md`, as rules 00/06/07/13, a referência PDF do projeto e as skills de fidelidade/layout; ler o registro amostral 6/101.
2. Renderizar/reutilizar o render da página física 6 do PDF original e abrir a página 6 em EN com Admin desligado no browser local autorizado.
3. Comparar primeiro a página inteira em Fit-to-Screen e depois regiões em zoom de leitura, mantendo escalas comparáveis.
4. Conferir o overlay Hidden Card em contexto, textos e headings fora do overlay, os spans Identity-H/PUA e caixas/símbolos filtrados, quebras, colunas, margens e fólio.
5. Cruzar toda suspeita com o PDF rasterizado, background final e JSON/span; distinguir erro visual do que está corretamente impresso ou rasterizado.
6. Se um defeito novo for comprovado, registrar causa e plano antes da alteração; corrigir só a página/região confirmada e repetir a comparação. Atualizar matriz apenas após QA suficiente.

## Critério de encerramento

Classificar a página como `visual-reviewed` somente após comparação de página inteira e regiões relevantes contra o PDF. Se permanecer limitação (p.ex. conteúdo textual intrínseco em arte não traduzível), registrá-la claramente e deixar o status/ponto de expansão de tradução apropriado. Build/lint se houver alteração de código; sem abrir editor ou storage de rascunhos.

## Achado visual confirmado — artefatos de contorno no grupo de cartas

- O primeiro passe em EN, Admin desligado e escala de 100–175% mostra as composições das Hidden Cards majoritariamente restauradas, mas também deixa visíveis retângulos/cartas brancos contornados sob/ao redor dos cards pretos. Esses contornos extras não aparecem no render-fonte `tmp/book-fidelity-audit/source-renders/page-006.png` nem no recorte `source-page-006-card-region.png`.
- O recorte `previous-background-page-006-card-region.png` confirma os contornos na própria `background.webp`: eles são remanescentes do processo de extração do fundo e não imagens corretas da página. O overlay de produção (`fidelity-overlay-hidden-cards.png`) restaura pixels do PDF sobre 19 placements de imagem e bboxes de texto confirmadas, mas sua máscara transparente deixa partes dos contornos do background aparecerem. Portanto, a correção anterior foi incompleta mesmo que os pixels dos cards tenham sido restaurados.
- **Causa ainda em investigação:** determinar se os contornos vieram de paths vetoriais, máscaras/imagens ou da remoção parcial de Forms XObject. Não assumir o tipo só pela aparência; cruzar o crop, `get_bboxlog()`/`get_drawings()` e o código de extração de fundo.
- `Page.get_drawings()` identificou dois paths brancos (bboxes `[586.34,253.64,630.42,313.20]` e `[607.79,360.89,649.12,414.64]`) alinhados com as sobras de moldura. Eles estão além do limite direito do bloco de prosa `block_108` (x=567.5 pt), nas silhuetas das cartas. Isso aponta para paths de backing/máscara que o extrator mantém no background, e não um problema de tipografia.
- **Plano antes da implementação:** acrescentar somente esses dois bboxes vetoriais à máscara que já restaura imagens/textos dos cards, usando os pixels do render-fonte nas mesmas coordenadas. O patch fica limitado à área, e o render original naquela região contém composição correta; as bboxes não cobrem o parágrafo. Validar que as linhas/card labels HTML associados já são substituídos pela mesma camada e não aparecem duplicados. Não mudar renderer global, filtros Zapf/Identity-H, fontes nem dados de tradução. Conferir screenshot em contexto e reverter se afetar vizinhos.
- **Aceitação:** nenhum retângulo/contorno branco extra comparado ao PDF; todos os cards, seus rótulos/versos e interrogações corretos; texto “Hidden Card Decks” e parágrafo vizinho legíveis uma vez; demais itens e margens sem deslocamento/corte; comparação de página inteira e zoom de leitura.

## Correção intermediária e refinamento da causa

- Depois de adicionar os dois paths brancos à máscara, o primeiro recarregamento ainda mostrou a moldura branca maior ao redor de dois cards. O navegador mantinha o PNG anterior em cache durante a navegação interna; foi necessário recarregar a página para confirmar o artefato restante. Isso foi registrado como correção insuficiente, não como QA aprovado.
- As bboxes remanescentes coincidem com três paths de backing escuros do PDF: `[609.00,191.10,728.90,298.00]`, `[636.20,245.30,756.10,352.20]` e `[666.40,298.00,786.30,404.90]`. A camada de extração deixa a orla/backing visível fora dos 19 retângulos transformados das imagens. Os três bboxes começam à direita do fim de `block_108` (x=567.5 pt) e não cobrem a coluna de prosa.
- **Plano revisado antes da segunda alteração:** incluir essas três geometrias exatas na mesma máscara local (além dos dois paths brancos já identificados), copiando os pixels do render-fonte para cada bbox. Fazer o gerador falhar se algum bbox ou estilo do path não corresponder, para não generalizar coordenadas inválidas. Recarregar a página após regenerar o asset e comparar de novo; se aparecer moldura, texto duplicado ou dano à vizinhança, não aprovar nem marcar a linha visualmente revisada.

## Execução final e resultado

- O gerador `scripts/build_page_006_card_overlay.py` agora valida e acrescenta à máscara os 19 placements de imagem, as 16 unidades textuais já confirmadas, dois paths de backing brancos e três paths escuros com bboxes/cores esperadas. A seleção de cada path falha explicitamente se a geometria ou fill não corresponder; a máscara continua específica da página 6.
- A primeira alteração (só dois paths brancos) não resolveu a moldura maior; isso foi detectado após uma recarga real do app e documentado antes do segundo ajuste. Com os três paths escuros incluídos e o PNG efetivamente recarregado, as molduras brancas extras desapareceram.
- **QA visual completa:** a página 6 em EN/Admin desligado foi comparada com o render físico completo `tmp/book-fidelity-audit/source-renders/page-006.png`, e com `source-page-006-card-region.png`, em 100% (página inteira), 175–225% (cartas e texto) e 200% (região inferior). Conferidos textos/headings/itálicos nas colunas, fichas e tokens, cards Hidden, “Red Reveal Decoder”, standups, personagem, margens e fólio 6. Não ficou divergência visual confirmada fora da limitação editorial intrínseca às labels rasterizadas dentro das cartas.
- As interrogações e rótulos impressos das cartas aparecem uma vez; não há backings brancos extras; o parágrafo `Hidden Card Decks` segue legível sem corte nem duplicação. O overlay continua EN/não-Admin; esta QA não valida tradução PT/Admin e não abriu o editor nem leu rascunhos.
- **Verificação:** `python scripts/build_page_006_card_overlay.py` concluiu com 19 placements, 2 backings brancos, 3 backings escuros e 16 blocos textuais. `git diff --check` passou (avisos normais de LF→CRLF). Não houve mudança de React/TypeScript neste ajuste, então build/lint do frontend não foram repetidos; o build/lint anterior da página 7 continua aprovado.
- **Conclusão para a matriz:** página 6 passa a `visual-reviewed`. Lição reutilizável: corrigir só placements de imagem pode deixar geometrias vetoriais que os cobrem/servem de backing; revisar `get_drawings()` e sequência de pintura, identificar paths pela geometria/estilo, e comparar após uma recarga que descarte cache. Isso é um critério de investigação, não autorização para copiar bboxes/patches às outras páginas.
