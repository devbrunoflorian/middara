# Próxima amostra de fidelidade inglesa: páginas 6 e 101

- **Status:** amostra implementada e comparada no browser; página 6 tem correção inglesa localizada. Página 101 passou pela triagem estrutural, ainda sem auditoria visual linha a linha.
- **Data:** 2026-09-30.
- **Ponto de partida:** commit `25d0862` inclui o piloto corrigido das páginas 4/13/15 e a documentação acumulada; working tree estava limpa.
- **Objetivo:** continuar a verificação inglesa antes de expandir tradução, escolhendo casos diferentes da amostra anterior e evitando propagar correções sem prova por página.
- **Páginas selecionadas:** 6 (interrogação/PUA ou Identity-H dentro de cartas/arte) e 101 (índice multicoluna, baselines e referências de página), seguindo a fila definida em `CONTINUE-HERE.md` e no scan estendido.

## Método executado

1. Consultar a matriz e o registro estendido para a hipótese específica de cada página.
2. Renderizar a página correspondente do PDF original local em PNG para inspeção, sem editar o PDF.
3. Abrir a mesma página no app em inglês com o browser local autorizado e comparar conteúdo, glyphs, alinhamento, espaçamento e limites de coluna.
4. Separar artefatos de extração, font fallback e dados estruturais; não corrigir um span automaticamente só por conter PUA/Identity-H ou por estar próximo de outra linha.
5. Nas cartas, uma primeira restauração por retângulo recortou o parágrafo; uma máscara por componentes perdeu rótulos pequenos. Essas duas tentativas foram rejeitadas antes de produção.
6. Inspecionar os objetos/imagens embutidos do PDF, experimentar máscara por polígonos de imagem e bboxes de texto conhecidas, integrar como overlay limitado à página 6/EN/não-Admin e comparar a página no browser.
7. Comparar a página 101 no ajuste à tela e procurar agrupamentos por coluna/baseline, ordem, líderes e referências. Nenhuma tradução foi expandida.

## Perguntas de auditoria

- Página 6: as interrogações/ícones sobre as cartas ocultas pertencem à arte e aparecem exatamente uma vez? O app está preservando glifos não-ASCII que o scanner não consegue classificar visualmente?
- Página 101: os itens do índice agrupam por coluna e baseline, com leaders e números posicionados conforme o PDF? Há mudança de linha/entrada, bold ou centralização que o scanner de spans não detecte?

## Achados antes da implementação

- **Página 6 — cartas Hidden Card:** comparação do PDF rasterizado com `background.webp` revelou que as faces pretas com interrogações brancas viram retângulos brancos com contornos/glyphs escuros no app. `block_10` contém dois spans `?`, fonte `EsmeraldaPro-Identity-H`, tamanho 44, cor extraída `#000000`; essa combinação não representa visualmente o desenho original. O PDF contém ainda textos de carta já rasterizados/visíveis e overlays extraídos na mesma região. Isso confirma que “marcar os ? como ghost” sozinho não restaura a imagem original.
- **Tentativa descartada 1 — recorte retangular:** a captura ampliada prova que x=550–790 pt atravessa a coluna e recorta palavras do parágrafo “Hidden Card Decks”; a afirmação anterior de que o limite ficava fora da coluna estava errada. Não usar este recorte.
- **Tentativa descartada 2 — componentes de diferença >1.000 px:** o candidato restaura as faces pretas e interrogações, mas omite textos menores impressos nas cartas (p.ex., `STOP`, `Medium Hidden Card`, `Large Hidden Card`). Não usar essa máscara por componente como correção final.
- **Hipótese intermediária substituída:** o recorte por polígono das colocações de imagens/textos foi testado e virou o patch documentado abaixo, após a comparação visual no app.
- **Página 101 — estrutura:** a fonte é a página física 101 do PDF (a última página física 102 é `Dice Breakdown`). A captura do app mostra três colunas, entradas e números em ordem compatível, sem colisão aparente. O par `Values / Back` da primeira coluna, que parece anômalo, também está impresso no PDF; não corrigir como erro do app. A escala das duas capturas ainda não é idêntica, então isto é aprovação estrutural inicial, não aprovação visual final.

## Próximo passo

### Correção de abordagem após os primeiros testes

- A extração do PDF lista 33 imagens na página 6, e o DOM possui 149 placements mas o loader do viewer substitui a coleção por `images: []`; o viewer não recompõe os assets de imagem extraídos. O JSON separa os cards ocultos em imagens/máscaras e o texto sobreposto. Isso explica por que filtrar o `?` não pode restaurar a arte.
- Novo candidato local em `tmp/book-fidelity-audit/next-sample/page-006-card-overlay-candidate.png`: máscara composta pelas 19 colocações de imagens do PDF cujos bboxes interceptam a área das cartas (limitados a assets pequenos, excluindo fundos) e pelas bboxes dos blocos de texto específicos. A composição isolada restaura faces pretas, interrogações brancas, bordas e textos impressos das cartas; o candidato por componentes não restaurava estes últimos.
- **Plano antes da implementação:** registrar esse PNG como correção visual somente da página 6, desenhá-lo sobre as linhas extraídas apenas em EN e fora do Admin, não mudar o filtro global de ghosts nem os spans/rascunhos. As caixas/palavras fora das cartas permanecem HTML editável; texto já rasterizado dentro das máscaras de carta é uma exceção que exigirá asset localizado próprio antes de traduzir o conteúdo das cartas. Conferir a screenshot inteira do app e vizinhança após implementação.
- **Achado adicional na conferência do app:** o bloco `block_115` contém `EXITIT` em spans Cinzel mistos (bbox `[316.1,190.1,330.9,212.6]`); no viewer só “IT” fica legível sobre uma ficha circular, enquanto o PDF mostra `EXIT`. O gerador inclui essa bbox exata na mesma camada de pixels-fonte. É mais um caso de texto curto sobre arte composta, não evidência para mapear globalmente essa fonte ou desligar o ghost filter.
- **Correção aplicada:** `scripts/build_page_006_card_overlay.py` rasteriza o PDF na largura nativa do background (1710 px), cria uma máscara apenas das 19 colocações de imagens pequenas da região e das 16 bboxes textuais confirmadas (as 15 linhas/grupos dos cards + `block_115`), e gera `apps/web/public/pages/page_006/fidelity-overlay-hidden-cards.png` (984×473) com `fidelity_overlays.json` (`bbox` em pt). `App.tsx` carrega esse sidecar só na página 6; `PageRenderer.tsx` posiciona o overlay em coordenadas da página, depois dos spans, somente em EN e quando Admin está desligado. `pointer-events:none`, dimensões intrínsecas explícitas, alt vazio e eager load evitam interação/acessibilidade indevidas e layout shift.
- **QA visual após implementação:** no Chrome local autorizado, EN/não-Admin mostrou backs pretos com interrogações brancas, texto pequeno `STOP`/nomes/destino impresso, e rótulo `EXIT` legível na ficha. A coluna `Hidden Card Decks` continua visível ao lado, sem recorte retangular. Ao entrar em Admin, o `<img>` da camada sai do DOM, deixando o texto-fonte acessível para edição; a tela Admin volta a ter as caixas brancas/overlays desalinhados do renderer atual. Ao sair do Admin, a correção volta. Isto é uma decisão de escopo documentada, não validação de preview PT.
- **Página 101:** no PDF e app EN em Fit to Screen aparecem três colunas independentes, leaders em linhas e números no fim das entradas. `Values / Back` também aparece dessa forma no PDF-fonte. Não achei colisão ou defeito estrutural evidente no primeiro passe. Como 197 entradas não foram verificadas individualmente em escala de leitura, a página segue sem aprovação visual final e permanece na fila.
- **Ajuste do ignore:** a primeira exceção do `.gitignore` abriu inadvertidamente sidecars de outra pasta (`page_002/credit_units.json`) para o status; restringi o unignore à pasta/asset/sidecar de `page_006`. O arquivo `page_002/credit_units.json` permanece ignorado e não será incluído.

## Verificação e limites

- `npm run build -w apps/web`: passou (Vite 8.3.1; build 31,84 s; aviso existente sobre `/texture.png` e callback `vite:prepare-out-dir` ocupando 30,4 s).
- `npm run lint -w apps/web`: exit code 0, 7 warnings já existentes (seis `react(set-state-in-effect)` e um `react(only-export-components)`; não houve erro de lint).
- `git diff --check`: passou após as alterações finais de código e documentação desta tarefa.
- Fonte consultada: original PDF local, render full-page e referências cropped em `tmp/book-fidelity-audit/next-sample/`. O app foi aberto pelo Chrome já autorizado; não foi lido localStorage, banco nem rascunho.
- O patch é amarrado ao PDF original e mantém texto rasterizado nas bboxes da máscara semântico-editorialmente indisponível. Por isso não se aplica ao PT nem ao Admin; ao traduzir cartas/fichas será necessário localizar esse artwork e recompor texto em campos próprios ou preparar uma imagem localizada. Não generalizar essa técnica a outras páginas sem inspecionar a composição delas.
- Status da matriz continua `needs-visual` para as páginas 6 e 101; a correção da 6 foi comparada em tela, mas as duas páginas ainda não tiveram auditoria tipográfica/linha-a-linha completa em escala de leitura.
- Registro pré-commit concluído; o commit local desta correção é o próximo passo. Não há push autorizado/solicitado.
- A página 101 passa apenas pela triagem estrutural inicial: três colunas e números aparecem em ordem, sem colisão evidente; `Values / Back` coincide com o impresso. A captura comparativa Fit to Screen não mostrou defeito estrutural, mas não permite conferir individualmente as 197 entradas em escala de leitura; a matriz permanece `needs-visual`.

Próxima ação depois do save point: abrir um registro separado antes de investigar a próxima página candidata à auditoria, priorizando uma composição com glyphs/font-risk; consultar a matriz e não propagar o tratamento específico da página 6.
