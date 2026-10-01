# Hierarquia tipográfica e unidades editáveis nas 102 páginas

- **Status:** em andamento; scanners, manifests e lotes tipográficos já aplicados aos JSONs de produção e ao renderer. A fidelidade visual das 102 páginas ainda não foi aprovada página a página.
- **Data/base:** 2026-10-01, branch `codex/book-visual-batch-audit`.
- **Objetivo:** transformar as lições das páginas 1–4 e 13 em um processo reproduzível para identificar unidades editáveis e fidelidade tipográfica no livro inteiro.

## Direção confirmada pelo usuário

O usuário priorizou descobrir e aplicar, em todas as 102 páginas, os limites de bbox/unidade editorial, tamanhos, pesos/negritos e demais estilos; só então expandir a verificação geométrica e a fidelidade visual. Regra confirmada: texto com tamanho de fonte diferente deve pertencer a uma caixa de edição diferente. Igualdade de tamanho não autoriza juntar conteúdos. A página 2 fornece lições para segmentação por categorias e eixo de colunas `x₀`, sem presumir que todo layout seja igual.

### Novo feedback visual (01/10/2026)

O usuário identificou que `ADVENTURE BOOK` na p. 4 ainda está visualmente leve em relação ao PDF e que headings das p. 5/6 também perderam o peso. O título decorativo também não aplica os alternates nos caracteres correspondentes. Isso invalida qualquer conclusão de que o inventário de flags/fontes, sozinho, garanta fidelidade de bold ou alternate. A investigação agora deve cruzar candidatos tipográficos com a forma visual no PDF fonte, atualizar somente alvos confirmados e percorrer o livro inteiro por classes verificáveis, sem promover o peso de toda uma fonte globalmente.

Os renders oficiais das p. 4–6 mostram esses títulos de seção em peso forte apesar de o metadado ser `Cinzel-Regular`, 12 pt, flags 4. No JSON atual, a p. 4 tem 13 dos 14 headings com override 700; `Adventure Book` ficou de fora. As p. 5 e 6 não têm overrides de heading. Vou confirmar todos os alvos curtos/isolados com a mesma assinatura contra o PDF antes de aplicar uma regra de estilo ou overrides page-local.

### Execução do lote confirmado p. 4–6 (01/10/2026)

O usuário identificou a ausência do peso em `ADVENTURE BOOK` (p. 4), nos headings das p. 5–6 e, especificamente, em `ADVENTURE MODE` (p. 8, a verificar no próximo lote). Reabri os renders do PDF fonte das p. 4–6: todos os headings curtos isolados nessas páginas são visualmente fortes; nos JSONs, todos têm assinatura `Cinzel-Regular`, 12 pt, flags 4. A alteração segura é somente adicionar `renderWeightOverride: 700` aos spans textuais confirmados, mantendo texto, bbox, fonte, linhas, blocks e IDs intactos. Antes da alteração, criarei uma allowlist por texto/página com validação de família/tamanho/flags e relatório de dry run; isso evita espalhar bold para prosa, entradas de tabela ou headings de outro nível.

O inventário do detector amplo encontrou 240 linhas candidatas na mesma assinatura em 59 páginas, mas assinatura tipográfica sozinha não é prova: inclui números/rodapés e contextos especiais. A triagem será feita por lotes e por contexto contra o PDF, sem promoção indiscriminada. O usuário delimitou alternates apenas a títulos Esmeralda Pro de 30 pt; esse eixo será auditado separadamente e não é condição para corrigir estes headings Cinzel.

O usuário delimitou os alternates: investigar apenas os títulos decorativos grandes de 30 pt em Esmeralda Pro. Não buscar alternates em texto de corpo, labels pequenos ou fontes Cinzel.

### Lote visual de headings Cinzel 12 pt — revisão antes da aplicação

Foi montada uma folha de contato com recortes do PDF fonte para cada span visível `Cinzel-Regular`, 12 pt, flags 4, sem override prévio e sem ghost/duplicate marcado. A revisão visual confirmou 177 spans distribuídos em 55 páginas; todos aparecem como headings/labels tipográficos fortes, incluindo `Crawl Mode` e `Adventure Mode` (p. 8), fases da p. 37 e cabeçalhos de tabelas das p. 95–100. Manifesto com página, índices de bloco/linha/span, texto, família, tamanho e flags: `docs/project-progress/cinzel-heading-weight-manifest.csv`. O script de aplicação valida cada coordenada e assinatura e é dry-run por padrão.

Uma primeira folha de contato baseada em “a linha contém qualquer span de 12 pt” incluiu falsos alvos: em p. 19, o span de 12 pt era apenas uma quebra de linha depois do heading visível de 11 pt. O método foi corrigido para exigir letras no próprio span e o PDF p. 19 foi inspecionado. Novo critério: não inferir estilo/tamanho de uma linha a partir de spans vazios de avanço ou newline; usar bbox e tamanho do span com tinta/caracteres e preservar runs de tamanhos distintos. A allowlist visível exclui esse falso candidato. Os headings de 11 pt e 18 pt permanecem em classes separadas para auditoria, sem receber o patch deste lote.

Uma segunda folha de contato, agora limitada a glifos visíveis `Cinzel-Regular`, 18 pt, flags 4, identificou 51 headings em 48 páginas. Cada recorte (incluindo `Credits` p. 2 e títulos de breakdown/tabelas) aparece em peso forte no PDF fonte. Foram adicionados ao mesmo manifesto estático e validados por page/block/line/span; a regra de aplicação lê o tamanho documentado por linha e não toca em spans de 11 pt `Continued`, newline, ou texto fantasma. Com 18 pt aprovado, o manifesto tem 228 spans visuais em duas classes (12 e 18 pt), antes de contar os 23 overrides locais já existentes em p. 4–6.

Uma terceira folha isolou os 32 candidatos Cinzel visíveis com tamanhos fora de 12/18 pt. 24 são títulos/labels confirmados no PDF (incluindo `Rulebook` 17,85 pt, `Bombing the Sickles` 17,91 pt, `Continued` 11 pt e headings entre 10,59–18,14 pt); serão adicionados com o tamanho exato no manifesto, sem criar uma regra global de arredondamento. Foram excluídos da aplicação seis fragmentos `E`/`IT` dentro de arte de tokens na p. 16, o `Z` sobre ilustração na p. 12 e o label vertical `False Idol` na p. 48. Esses ficam como alvos de auditoria de artwork/rotação, pois o peso isolado não corrige a camada nem a orientação.

Uma quarta revisão dos 40 spans Cinzel restantes (10 pt e fragmentos de artwork) isolou nove labels fora das classes anteriores que têm tinta e peso forte evidente no PDF: `Loot` p. 17; os seis nomes de tipo na p. 27; `Conviction:` e `Casting:` p. 33. Eles serão aplicados como exceções por span. Rótulos dentro das cartas/figuras nas p. 16, 48, 59, 61, 64, 66, 73 e 83 não entram neste lote: precisam ser comparados com a camada de fundo para distinguir texto editorial, texto impresso na arte e duplicatas antes de qualquer alteração.

Comparei os fundos extraídos das p. 59, 61, 64, 66 e 73 com os recortes do PDF. As caixas dos 21 nomes/labels editoriais correspondentes estão vazias no fundo e os spans aparecem fortes no PDF; portanto, são texto HTML editável que precisa do peso 700, não duplicatas rasterizadas. O nome `Padric` dentro da carta inclinada da p. 59 continua presente no próprio fundo e fica fora da allowlist. Os outros nove itens restantes (fragmentos EXIT, `Z`, `False Idol` vertical e `Loot` sobre artwork) permanecem no relatório de exceções, sem patch de peso.

O usuário reforçou que o objetivo é concluir a correção tipográfica/styling das outras 101 páginas; não encerrar o esforço depois de entregar somente inventário ou algumas amostras. O trabalho deve avançar em lotes verificáveis, mantendo esta tarefa como ativa até haver cobertura e evidência page-by-page/classe-by-classe registradas.

#### Recuperação de headings válidos classificados como texto fantasma — antes da alteração (01/10/2026)

Ao conferir os candidatos Cinzel que ainda não recebiam peso, cruzei cada ocorrência marcada `suspectedGhost` com a página renderizada do PDF e com o `background.webp` que o app realmente usa. O título aparece no PDF e sua caixa está vazia no fundo do app em 52 linhas, distribuídas por 42 páginas (70 spans; páginas 9–87). Como o renderer oculta linhas com essa marca, essas marcações retiravam títulos editoriais reais da página. A evidência visual está nas folhas `tmp/typography-source-review/ghost-heading-pdf-vs-bg-01.jpg` a `-03.jpg`; o allowlist auditável está em `tmp/typography-source-review/verified-ghost-heading-spans.csv`.

Antes de editar os JSONs, esta decisão e a lista exata foram registradas. A aplicação será restrita às 52 linhas identificadas: limpar `suspectedGhost` no objeto da linha (sem mudar a marca do bloco) e aplicar peso 700 apenas aos spans do título que aparecem no PDF. Nos títulos `... Continued`, manter os runs de 18 pt e 11 pt separados e aplicar o peso individualmente. O caso p. 88 `Variants Continued` fica de fora porque os pixels coloridos do artwork permanecem no fundo sob o bbox; isso não satisfaz o critério de título editorial removido da camada-base. Nenhum conteúdo/bbox/ID será reextraído.

Esta é evidência direta para atualizar a regra de ghosts: `suspectedGhost` é hipótese de duplicata, não comando de ocultação permanente; a ausência do texto no fundo precisa ser combinada com a presença legível no PDF antes da recuperação. Os alvos serão promovidos a manifesto versionado e aplicados por script com dry run padrão. Depois da aplicação, scanner, build e diff confirmarão o escopo real.

Na validação do scanner pós-lote, o título `Bombing the Sickles` da p. 15 ainda aparecia como candidato óptico, apesar de o fundo mostrar o título branco completo e o respectivo overlay estar explicitamente marcado `rasterizedDuplicate`. A evidência anterior da auditoria p. 15 continua válida: o composite é arte localizada, e reconstruir apenas o peso do overlay criaria duplicação. Antes de regenerar o scanner, registrei este contraexemplo e vou ajustar o gerador de candidatos para excluir duplicatas confirmadas, mantendo ghosts incertos no relatório para revisão visual.

#### Aplicação e validação da recuperação (01/10/2026)

- A allowlist versionada contém 70 spans em 52 linhas distribuídas por 42 páginas; antes de cada gravação o script valida texto integral da linha, posição, fonte, tamanho, flags e ausência de duplicata raster confirmada. Aplicação feita em `page_009` a `page_087` nos alvos registrados: 52 `line.suspectedGhost` definidos explicitamente como `false` e 70 `renderWeightOverride: 700`. Flags de bloco, bboxes, textos, IDs e separação por tamanho foram preservados.
- O manifesto consolidado `cinzel-heading-weight-manifest.csv` agora tem 352 alvos visualmente confirmados; somado aos 23 alvos exatos das p. 4–6, o script de headings validou 375 spans sem drift.
- A p. 88 `Variants Continued` continua marcada como ghost e invisível: o confronto PDF↔fundo mostra arte ocupando a região, então não foi classificada como título editorial removido. Na p. 15, a linha `Bombing the Sickles` também continua excluída por `rasterizedDuplicate`; o texto branco já está no diagrama. O scanner foi corrigido para não listar duplicatas raster confirmadas como candidato óptico.
- Após regeneração do inventário 102/102: continuam 4.484 blocos, 14.059 linhas e 23.584 spans; 1.295 blocos têm tamanhos mistos (91 páginas). O scanner mantém nove candidatos Cinzel sem override (letra `Z`, seis fragmentos `E`/`IT` em arte p. 16 e duas runs `Variants Continued` p. 88), todos explicitamente fora do lote tipográfico por serem arte, fragmento ou região sem título editorial comprovado.
- O scanner de unidades editáveis continua lendo 102/102: 11.220 unidades candidatas e 2.052 blocos requerendo revisão de chaves; isto ainda não é autorização para redividir keys na interface.
- `py_compile`, `git diff --check` e `npm run build -w apps/web` passaram. O build reportou somente que `/texture.png` será resolvido em runtime. Diretórios de relatório permanecem sob `tmp/` ignorado.

#### Evidência de alternate nos headings Esmeralda Pro 30 pt — antes da aplicação (01/10/2026)

O usuário delimitou a busca de alternates a spans de 30 pt em `EsmeraldaPro`. Para identificar o caractere exato sem aplicar variantes à palavra inteira, extraí do PDF base os `gid` usados por `get_texttrace()` e cruzei esses IDs com a ordem de glyphs do CFF `EsmeraldaPro` embutido no próprio PDF. Os nomes de alternates resultantes foram então pareados com os codepoints do `pua_mapping.json` e da fonte local `EsmeraldaPro-PUA.ttf`.

Dos 16 spans editoriais candidatos de 30 pt no JSON, 13 têm pelo menos um glyph alternativo explicitamente escolhido no PDF; três têm apenas glyphs base. As sequências exatas e o mapa char→glyph→PUA serão registradas em manifesto por span. Exemplos: `Introduction` p. 2 usa `I.swsh`, `n.alt`, `r.alt`, `n.alt`; `Contents` p. 3 usa `n.alt` nos dois `n`; `Padrıc` p. 59 usa `P.swsh`, `a.alt2`, `d.alt2`, `r.alt`. A consulta fica restrita a fonte/tamanho exatos: não procurar PUA no corpo nem generalizar para fontes decorativas diferentes.

Nos fundos das p. 59 e 73, os campos correspondentes estão sem texto raster e servem como texto editorial editável; a palavra `PADRIC` na carta inclinada da p. 59 é parte da imagem e não é o alvo. A aplicação manterá `span.text`, bbox, linha e IDs originais, usando o campo renderizado `displayOverride` para os codepoints de glifo exatos. O script/manifesto exigirão a referência PDF como parâmetro e funcionarão em dry run por padrão.

## Escopo e método

1. Auditar os 102 JSONs e o PDF fonte, medindo tamanho exato/normalizado, família, peso/flags, itálico, cor, bbox, baseline, linhas e posição; separar fatos extraídos de classificações visuais.
2. Criar um particionador determinístico de unidades candidatas: diferentes tamanhos sempre separam; continuidade de linha/coluna, baseline, indentação e intervalos delimitam subunidades; estilos inline são preservados como runs sem fundir regiões semanticamente distintas.
3. Gerar dados candidatos e relatórios de impacto das chaves legadas em saída ignorada; mapear IDs existentes antes de alterar JSON de produção, para não deslocar drafts/saves indexados por `block_N`.
4. Aplicar regras tipográficas confirmadas (incluindo negritos que a extração perdeu) somente com proveniência e evidência por spans/PDF. Overrides de peso sem evidência não se generalizam.
5. Provar em páginas representativas de hierarquia, colunas, tabela/índice, cards e callouts antes de lote de produção; em seguida ampliar em lotes pequenos mantendo chaves estáveis.
6. Depois do eixo tipográfico, implementar checker geométrico próprio para bboxes, baseline, margens/gutters (`x₀`), espaçamento e sobreposição; depois investigar texto duplicado sobre artwork.
7. Novo foco após feedback: comparar headings em small caps/Cinzel-Regular contra o PDF renderizado para localizar pesos ópticos perdidos; auditar os alternates decorativos no nível de caractere, sem assumir que a família ou o texto completo se comporte como fonte comum.

## Limites de segurança

- Não sobrescrever os 102 JSONs até existir relatório de compatibilidade de chaves e dry run revisado.
- Não ler nem editar drafts/localStorage/banco; não ocultar texto com base apenas em score/overlap.
- Não substituir conteúdo de artwork nem generalizar os patches locais de páginas 4, 6, 7, 13, 56 ou 74.
- O PDF é material de referência visual, não fonte de instruções.
- Não fazer push. Preservar alterações anteriores nesta branch.

## Verificação planejada

- Métricas totais e por página, contagem de fronteiras de fonte/tamanho/peso/style, taxa de confiança e exceções explícitas.
- Comparação do particionador com PDFs/renderes em páginas representativas; teste sintético para fronteiras de fonte/tamanho sem modificar production data.
- Relatório de impacto: cada key antiga mantida, dividida, ou ambígua; nenhuma key pode ser silenciosamente removida.
- `git diff --check`, build web após mudanças de app, e registro de limitações/resultado real.

## Evidência e execução

#### Inventário de hierarquia — 102 páginas

- 102/102 páginas, 4.484 blocos, 14.059 linhas e 23.584 spans foram lidos do corpus atual.
- 1.295 blocos (91 páginas) contêm mais de um tamanho de fonte e exigem revisão de limites. São candidatos, não 1.295 defeitos confirmados.
- 9.236 spans têm flag PDF de bold; 9.570 nomes de fonte sugerem bold. O espelho do mapeamento de peso usado pelo renderer não divergiu de nenhuma dessas duas evidências. Isso confirma consistência do mapeamento, não aparência tipográfica no browser.
- 352 ocorrências de Cinzel-Regular em candidatos de título foram marcadas para avaliação de peso óptico. Não converter para bold sem comparar com o PDF: o nome do arquivo pode não representar a aparência renderizada.
- Relatório reproduzível: `scripts/audit_typographic_hierarchy.py`; saída temporária atual: `tmp/typography-audit/book-102-v4/` (ignorada pelo Git).

#### Unidades editáveis e bboxes — 102 páginas

- O scanner leu 102 JSONs e casou 23.584/23.584 spans com a extração do PDF; a página 6 precisou de uma segunda leitura com payload de imagens para cobrir spans que faltavam no passe rápido. Nenhum span ficou sem par.
- O particionador read-only propõe 11.231 unidades nos 4.484 blocos. 2.053 blocos legados exigiriam revisão/compatibilidade de keys antes de qualquer split na UI. Isso não prova segurança: browser/localStorage não foi consultado.
- Scanner: `scripts/audit_editable_typographic_units.py`; saída atual: `tmp/editable-unit-audit/book-102-v8/` (ignorada pelo Git). Preserva size, family, flags, bbox, baseline e lineage.
- No PDF da p. 101, o índice tabulado é armazenado como fragments separados no mesmo baseline e inclui spans vazios de tab. A extração anterior criava caixas sem conteúdo e linhas longas. A regra produz 197 entradas (74/74/49), cada unidade com linhas internas separadas para rótulo e número e seus bboxes horizontais originais. A varredura encontrou também uma lista com marcadores na p. 63; o gatilho foi estreitado para exigir referências numéricas de índice, não somente linhas e tabs.
- Extração candidata da p. 101: `tmp/extraction-pilot-page-101-rowunits-v4/`. O resultado foi conferido nos dados extraídos do PDF; ainda falta a comparação visual no app antes de usar em produção.
- Regressão de extração nas p. 1/3/4/13 ficou em `tmp/extraction-pilot-regression-001-003-004-013/`. Página 1 separa `Rulebook` (17,85 pt) de `VERSION 1.2 - MAY 2023` (7 pt). A análise UTF-8 encontrou zero blocos de tamanhos mistos nas saídas candidatas das quatro páginas. Isso verifica fronteiras de tamanho, não prova bboxes/estilos visualmente perfeitos.

#### Validação e limites

- `python scripts/extract_dom.py --pages 101 ...` passou e reconstruiu as 197 entradas em saída temporária. Os IDs candidatos mudariam a indexação e exigem compatibilidade.
- `python scripts/audit_editable_typographic_units.py` e `python scripts/audit_typographic_hierarchy.py` passaram em todas as 102 páginas. O scanner de unidades terminou com 11.220 candidatos e 2.052 blocos para revisão de key.
- A validação de alcance da regra tabulada encontrou p. 63 e p. 101; a lista com marcadores da p. 63 foi preservada sem os 197 splits do índice. A p. 101 manteve os 197 itens (74/74/49).
- `npm run build -w apps/web` passou após extensão dos tipos de span/linha. Vite e Payload/Admin responderam HTTP 200 em `127.0.0.1:8080` e `127.0.0.1:3000/admin`.
- `py_compile` e `git diff --check` passaram na checagem anterior; repetir `git diff --check` após esta documentação.
- Uma chamada incorreta do inventário com `--pages all` foi recusada pelo CLI (a opção espera inteiros); a chamada correta sem `--pages` passou em 1,3 s. Nenhum JSON de produção, draft, localStorage, banco ou tradução foi alterado por esta tarefa. As mudanças de production JSON preexistentes na branch foram preservadas.
- Feedback do usuário: bbox e hierarquia tipográfica primeiro; tamanhos diferentes implicam caixas de edição separadas; aplicar aprendizados da p. 2 sem presumir que todas as páginas são iguais. É necessário fazer trabalho concreto nas 102 páginas e manter fidelidade antes de expandir traduções.
- Novo aprendizado: uma entrada editorial pode estar em objetos `line` distintos do PDF. Para p. 101, agrupar pelo baseline dentro da coluna e preservar cada bbox interno reproduz a unidade sem remover o alinhamento do número. Não generalizar essa regra para outras tabelas sem evidência.

## Próxima ação

Continuar a fidelidade tipográfica além das classes já confirmadas. O lote atual cobre os títulos Cinzel visualmente fortes por allowlist e os alternates que o próprio PDF usa nos spans EsmeraldaPro de 30 pt; isso não aprova automaticamente toda fonte/página nem conclui a auditoria completa. Próxima frente: conferir bold inline fora de headings, separar e reconciliar hierarquia de tamanhos no scanner com os bboxes/fonte do PDF e continuar a investigação de overlays/ghosts com os critérios novos. Não alterar bboxes ou keys de edição até o relatório de compatibilidade provar que drafts existentes continuam alcançáveis.

#### Execução dos alternates Esmeralda 30 pt (01/10/2026)

- O scanner percorreu 102 páginas e encontrou 16 spans editoriais `EsmeraldaPro`, exatamente 30 pt. Confrontando os IDs dos glyphs do PDF com o CFF Esmeralda embutido e o mapa PUA local, confirmou alternates específicos em 13 spans de 13 páginas: 2, 3, 4, 7, 8, 24, 36, 56, 59, 61, 73, 85 e 101. Os outros três mantêm glifos base.
- `scripts/apply_verified_esmeralda_title_alternates.py` valida a assinatura e glyph sequence do PDF de referência; `docs/project-progress/esmeralda-title-alternate-manifest.csv` registra o texto preservado, output visível, mapa nome do glyph→PUA, bbox e xref.
- Aplicados 13 `displayOverride` aos spans exatos. `span.text`, bbox, linhas, fonte e IDs não mudaram. A renderização usa o glyph PUA em uma substituição visual acessível via `aria-label`; glyphs base permanecem como texto normal dentro do mesmo span.
- Conferi p. 2 em aba QA isolada, a 100% Fit to Screen. `Introduction` exibe o swash no `I` e as variantes nos caracteres corretos, alinhado dentro da faixa do título; a página inteira manteve a geometria esperada. A aba de trabalho ativa do usuário (p. 3 em Admin) não foi alterada.
- O inventário de hierarquia reexecutado após overrides manteve 102 páginas, 4.484 blocos, 14.059 linhas e 23.584 spans; somente 13 campos de representação visual foram adicionados.

#### Hierarquia documentada e cobertura das famílias de fonte (01/10/2026)

- Consolidei a hierarquia recorrente em [`docs/architecture/book-typographic-hierarchy.md`](../architecture/book-typographic-hierarchy.md) e registrei a regra durável no skill visual: título Esmeralda 30 pt com alternates somente por glyph; heading grande Cinzel por runs separados (ex.: 18 pt + `Continued` 11 pt); tópicos Cinzel 12 pt com peso óptico por allowlist; subtítulos do sumário Optima Bold 9 pt; corpo frequentemente Optima 10 pt com runs inline. Está explicitamente documentado que são classes recorrentes, não um template global.
- Fechei a revisão pontual dos feedbacks recentes: na p. 3, headings Cinzel de 12 pt estão com override 700 por span; na p. 5, a renderização da página inteira exibe os rótulos de seção em peso forte; na p. 13, `Story Disciplines and Items` tem peso 700 e permanece no fim da coluna esquerda, separada da box da direita; `Adventure Mode` (18 pt) e `Continued` (11 pt) estão visíveis como runs/tamanhos distintos. QA visual isolado do app foi feito em p. 2, 5 e 13 a Fit-to-Screen 100%, sem mudar a aba ativa do usuário nem abrir/editar tradução.
- O código de preservação do alternate no preview de estilo do editor foi simplificado para consumir a sequência visual por codepoint sem alterar a ordem/fallback. A lógica só entra quando o texto agregado da edição continua exatamente igual ao original; uma tradução nova não herda caracteres decorativos do inglês.
- Build de produção `npm run build -w apps/web` passou após a mudança; o único aviso é `/texture.png` permanecer resolvido em runtime. Os scanners de hierarquia e unidades rodaram em 102/102: 4.484 blocos, 14.059 linhas, 23.584 spans; 1.295 blocos com tamanhos mistos e 11.220 unidades candidatas, com 2.052 blocos que ainda exigem revisão de compatibilidade de key.
- Novo scanner read-only `scripts/audit_font_asset_coverage.py` comparou as 23 famílias do PDF com `@font-face` do viewer. 21 mapeiam para faces locais; duas não têm face local declarada: `ZapfDingbatsStd` (204 spans, 34 páginas) e `Wingdings3` (1 span, p. 15). O renderer atualmente suprime as famílias Wingdings/Zapf e suprime Webdings com uma exceção reconstruída para `U+F07E`; a família Webdings ainda precisa de revisão página a página. Isso é uma lacuna pictográfica verificada, não razão para importar um fallback ou reexibir tudo globalmente.
- Saídas read-only estão em `tmp/typography-audit/book-102-final/` e `tmp/font-asset-audit/book-102/`; nada desse relatório temporário altera os drafts. `py_compile`, `git diff --check`, `audit_typographic_hierarchy.py`, `audit_editable_typographic_units.py` e `npm run build -w apps/web` passaram. O `git diff --check` só reporta avisos de conversão LF→CRLF.

#### Próxima frente após este lote de styling

Não declarar a fidelidade tipográfica visual de todas as páginas completa: o inventário prova os sinais do PDF e os pesos aplicados, mas não é uma comparação visual de cada glyph. Próximas frentes: validar bold/italic inline nos contextos ainda não comparados; inspecionar pictogramas restantes por comparação PDF↔background; medir a geometria em lotes (tinta/bbox, eixo de coluna `x₀`, baseline e espaçamento); e resolver compatibilidade antes de qualquer resegmentação de keys. Depois de concluir a fidelidade inglesa das 102 páginas, auditar e adaptar rules/skills às práticas e resultados reais; então organizar o glossário compartilhado e os drafts por página antes de expandir tradução.

#### Matriz tipográfica por página e fechamento desta rodada (01/10/2026)

- Ampliei `scripts/audit_typographic_hierarchy.py` para contabilizar bold/italic do PDF, overrides visuais, PUA, candidatos ópticos e blocos mistos em cada página. A tabela produzida por essa execução está versionada em [`book-typographic-style-status-2026-10-01.csv`](book-typographic-style-status-2026-10-01.csv); o CSV é o estado observado nesta revisão, e pode ser reproduzido em `tmp/` pelo script.
- Dos 380 candidatos com texto em Cinzel-Regular, sem sinal de bold nos metadados, sem duplicata raster e com tamanho ≥11 pt, 373 têm peso óptico 700 confirmado; sete ficam explicitamente pendentes/excluídos: `Z` e seis fragmentos `E`/`IT` de artwork. O título `Bombing the Sickles` da p. 15 é duplicata já no raster, não entra no conjunto. `Variants Continued` da p. 88 é uma hipótese ghost sobre região com tinta no fundo e também não recebe peso no app. Isso refina a contagem provisória anterior de nove para sete candidatos genuínos ao excluir os dois runs p. 88.
- No total, 407 spans recebem `renderWeightOverride` local em 94 páginas; os 34 além dos 373 do filtro de candidato amplo são exceções de tamanhos menores confirmadas individualmente. 13 spans em 13 páginas usam alternates exatos no título Esmeralda 30 pt. As seis páginas sem peso/alterna visual override na matriz (31, 51, 65, 67, 88 e 99) não contêm candidato do filtro; p. 88 mantém a exceção documentada.
- O scanner encontrou zero conflito entre flags de bold e peso CSS, e zero conflito entre nome de fonte com bold e peso CSS. Isso fecha o mapeamento estrutural desses sinais em 102/102, mas não afirma comparação visual span a span; é por isso que o filtro Cinzel visual, a matriz por página e as amostras de browser são etapas distintas.
- O build da aplicação passou e o app em preview isolado foi conferido nas páginas 2, 5 e 13. A área ativa do usuário permaneceu intacta. O diff check não encontrou erro whitespace; apenas informou conversão de finais de linha no Windows.

#### Nova fatia verificável: preservar glyphs já rasterizados no fundo (01/10/2026)

- Direção recebida: trabalhar em fatias verticais pequenas (scanner → evidência PDF/fundo → regra/renderer → QA) e explorar código/dados antes de formular perguntas. Não construir um remapeamento global de pictogramas antes de provar um exemplo ponta a ponta.
- Fatia inicial: `Wingdings3 U+F075` da p. 15, hoje filtrado pelo renderer. O crop, à escala igual, mostra o triângulo de continuação dentro de “CONTINUED” tanto no PDF quanto no `background.webp` em posição/forma coincidentes. A supressão HTML deste glyph preserva a página; não há patch de produção a aplicar para este caso.
- Próximo passo da fatia: implementar um scanner read-only que identifique spans de Zapf/Wingdings/Webdings e compare seus recortes do PDF com o fundo final realmente servido pelo app, classificando `in-background`, `missing-from-background`, `different/uncertain` ou `no-local-background`. Validar saída em 1 página (p. 15) e exemplos já conhecidos p. 4/7/13 antes de executar o corpus inteiro. O scanner não deve alterar fontes, JSONs, fundos nem flags.
- Não assumir que imagem idêntica em PDF/fundo prova que todo span da mesma família esteja duplicado: validar assinatura de glyph + região por span e conservar exceções documentadas. Resultado, limitações e hashes/escala da amostra serão registrados aqui após execução.

#### Varredura de pictogramas e caso candidato da página 63 (01/10/2026)

- O scanner read-only `scripts/audit_pictogram_backgrounds.py` foi ampliado para produzir faixas comparativas pequenas e legíveis por página, sem tocar nos dados do livro. A execução completa encontrou 381 spans de pictograma em 58 páginas; o CSV guarda bboxes, fonte, codepoints, MAE do recorte e estado `visual-review-required`. Os PNGs/CSV ficam em `tmp/font-asset-audit/book-102-glyph-backgrounds/` (ignorados pelo Git).
- Calibração visual: p. 15 `Wingdings3 U+F075` está presente no fundo e a supressão do HTML evita duplicata; p. 7 `ZapfDingbats U+274F` falta no fundo em 20 ocorrências e já é restaurado pelo overlay SVG local; p. 13 `Webdings U+F07E` falta no fundo e é reconstruído pelo tratamento local do callout. P. 4 mistura glyphs de texto e arte, confirmando que família não basta para decidir.
- Candidato novo: p. 63 contém 114 marcadores `Wingdings-Regular U+0088` e marcadores de nível Zapf junto a listas de cartas/itens. As regiões correspondentes do PDF mostram símbolos; o fundo do app é vazio ali.
- A primeira hipótese de converter `U+0088` para `U+F088` na fonte local foi rejeitada pelo tracer: o `U+F088` da fonte local é `eightsans` (um 8 circulado), enquanto o PDF mostra um quadrado vazado. Um span de protótipo foi temporariamente exibido no browser e o resultado divergiu; não expandir nem manter essa conversão.
- Evidência de origem mais precisa: `get_texttrace()` do PDF identifica o marcador Wingdings como glyph ID 136 na fonte Type0 incorporada `ZBBORF+Wingdings-Regular`, sem cmap Unicode. A fonte completa local usa outro contorno em `U+F088`, portanto não serve como fallback desse glyph. A seta Zapf é independente.
- A hipótese corrigida foi validada: a subset-font Wingdings do PDF mapeia todos os 114 spans da p. 63 ao `gid 136`; ao expor esse contorno incorporado em `U+F088`, o marcador aparece como quadrado vazado, igual ao PDF. Os 114 spans agora usam `pictogramDisplayOverride` + `pictogramFontOverride` sem alterar texto/base/bbox/IDs; build passou e a página inteira foi conferida em 100%. Ainda faltam os 15 marcadores Zapf ➤ da mesma página.
- Os 15 marcadores Zapf da p. 63 usam todos o mesmo glyph `U+27A4`/`gid 3`, cuja subset CFF incorpora um contorno poligonal simples. O contorno foi aplicado como SVG inline apenas nesses spans. Browser QA isolado em fit-to-screen 100% e zoom 125% confirmou as setas junto aos cabeçalhos LVL e quadrados vazados junto às entradas. Texto, bboxes e IDs permanecem inalterados; nenhum outro glyph/família foi remapeado.
- Nota do usuário para etapa posterior: depois de concluir a fidelidade inglesa, auditar as regras e skills do projeto contra metodologia e resultados reais; preservar conteúdo útil e adaptar instruções obsoletas/incompatíveis, documentando o que mudou e por quê. Não descartar regras como um bloco.

#### Skills de execução salvas no projeto (01/10/2026)

- A pedido do usuário, criei `.agents/skills/tracer-bullets/SKILL.md` e `.agents/skills/grill-me/SKILL.md`, com índice em `.agents/skills/README.md`. A primeira orienta fatias pequenas verificadas ponta a ponta; a segunda, explorar o repositório antes de perguntar e recomendar respostas quando a pergunta ao usuário for necessária. O comportamento de exploração-first não anula a autorização explícita para execução autônoma.

#### Tracer de unidades tipográficas da página 3 — concluído

- O browser isolado confirmou que p. 1 já possui containers distintos para `Rulebook` (17,85 pt) e `VERSION 1.2 - MAY 2023` (7 pt), com `™` em terceiro container; o JSON atual também os separa. Nenhuma correção foi necessária nessa página.
- Em `block_13`, `ADVENTURE MODE` (OptimaLTStd-Bold 9 pt) e `Playing Encounters` (Cinzel-Regular 12 pt com peso 700 confirmado) agora são dois `typographicUnits` locais, derivados das bboxes/lineIds existentes. Nenhum texto, span, posição, bbox ou ID-fonte foi refeito. O script `scripts/apply_page3_typographic_units.py` valida assinatura, tamanho e lineIds exatos antes de escrever, e pode ser executado novamente sem duplicar unidades.
- `PageRenderer` renderiza esses campos com keys novas `page_3_unit_p3-adventure-mode__en` e `page_3_unit_p3-playing-encounters__en`. Se a key antiga do bloco (`page_3_block_3`) existir, a tela continua no caminho legado inteiro; o fallback não apaga nem converte essa tradução. Nenhum draft, DB ou localStorage foi inspecionado diretamente.
- Browser Admin isolado: selecionei ambas as linhas, confirmei IDs separados, size 9/12, famílias Optima/Cinzel e peso 700; depois fiz a seleção reversa para confirmar que os controles não ficam com valores antigos. Nenhum botão Save foi acionado. A falha inicial mostrou toolbar Optima/9 na unidade Cinzel/12; `RichSpanEditor` agora reinicializa família, peso, estilo, cor, tamanho, ligatures, seleção e estado de edição quando muda `spanKey`.
- `npm run build -w apps/web`, `py_compile` e `git diff --check` passaram. O scanner cobre 102/102 páginas e 23.584 spans, 1.295 blocos mistos; a matriz agora lista 2 `typographicUnits` na p. 3 e 129 `pictogramOverrides` na p. 63.
- Próximo lote: agrupar candidatos por assinaturas de linhas/tamanhos/famílias e semântica verificáveis; começar por blocos com heading separado na primeira linha e corpo de tamanho uniforme, mantendo mistura de estilos inline dentro do corpo. Revisar classes mais complexas, multi-coluna, títulos compostos e fragmentos de arte antes de habilitar. A matriz agora registra unidades existentes, mas nenhum dos 1.295 blocos mistos deve ser dividido só por regra automática.

#### Tracer de unidade tipográfica da página 4 — concluído

- A p. 4 tem 14 entradas editoriais claras, de `Rulebook` a `Monster Loot Cards`: heading em Cinzel 12 pt na linha inicial e corpo em Optima 10 pt nas linhas seguintes, com ênfases inline preservadas. Os IDs do lado direito não são contíguos: depois de `block_15`, elementos de arte ocupam os IDs `block_16`/`block_17`; o próximo texto é `block_18`. O script usa IDs + texto exatos, não índices supostamente contíguos.
- `scripts/apply_page4_typographic_units.py` adiciona 28 alvos (heading e corpo por entrada), preservando todos os spans, conteúdos, line IDs, bboxes e o agrupamento legado. Uma primeira execução detectou o salto de IDs e abortou antes de escrever; a assinatura foi corrigida para a lista observada e validada. Segunda execução confirmou idempotência.
- Admin no browser isolado: `Rulebook` seleciona `page_4_unit_p4-rulebook-heading__en`, Cinzel 12 pt, peso 700; o corpo seleciona `page_4_unit_p4-rulebook-body__en`, Optima 10 pt, peso 400. Screenshot da página inteira em 100% não mostrou deslocamento; nenhum draft foi salvo e a aba ativa do usuário não foi alterada.
- `npm run build -w apps/web` passou. `audit_typographic_hierarchy.py` reexecutado em 102/102 reporta 2 unidades na p. 3 e 28 na p. 4; a matriz versionada foi sincronizada da saída do scanner. O aviso existente de `/texture.png` continua sendo resolvido em runtime.
- Feedback metodológico consolidado: entregar uma regra por fatia ponta a ponta e aprender com o scanner real. Tamanhos distintos são uma fronteira de edição; blocos mistos não são necessariamente heading/body simples, então a expansão em lote depende de assinaturas de linha e verificação geométrica, mantendo chaves antigas como fallback.

#### Planejamento do próximo lote de unidades (01/10/2026)

- Varredura read-only de todos os blocos mistos: 234 têm uma primeira linha com uma única fonte/tamanho e todas as linhas restantes com um tamanho uniforme distinto, em 59 páginas. Isso é um padrão mais específico que “qualquer bloco com tamanhos mistos”; outros 977 blocos não se encaixam nessa assinatura simples.
- Excluindo linhas ghost/duplicadas, assinaturas abaixo de 6 pt (concentradas em arte/cartas) e títulos sem letras (pictogramas), restam 196 candidatos em 53 páginas; 15 já estão cobertos pelos tracers p. 3/4, sobrando até 181 alvos de bloco para expansão. O valor 6 pt é um corte de triagem para não converter fragmentos microscópicos em edição; os itens excluídos continuam visíveis no inventário para revisão futura.
- Próxima etapa planejada: salvar um manifest dos alvos e aplicar com validação estrita de IDs, texto, linhas, fonte/tamanho e flags; conservar estilos inline no corpo; comparar amostras de classes representativas no PDF/app; abortar o lote se qualquer assinatura mudar. O lote ampliado segue a regra de tamanho do usuário, mas mantém excepcões/contraexemplos filtrados em vez de normalizar as 1.295 ocorrências.

#### Lote manifestado de fronteiras de tamanho — 181 blocos (01/10/2026)

- `scripts/batch_typographic_units.py` produziu o manifesto versionado [`typographic-unit-batch-2026-10-01.csv`](typographic-unit-batch-2026-10-01.csv): 181 blocos em 52 páginas, cada um com uma linha inicial de tamanho único ≥6 pt e demais linhas em outro tamanho uniforme. O aplicador confere texto exato, fontes, tamanhos, IDs das linhas e flags ghost/duplicata; títulos sem letras, linhas <6 pt, ghosts e duplicatas não entram.
- Foram adicionadas 362 unidades (duas por bloco) além dos tracers anteriores; total atual = 392 unidades. Texto/span/bbox/source line IDs e chaves antigas são preservados. Os IDs não supõem semântica heading/corpo: na p. 81 `BURROWING VARIATION` aparece depois e em posição espacial distinta de `Cave Sickle`, e a separação respeita as caixas de cada linha.
- QA no app isolado: p. 5 `Terrain tokens` e corpo viram keys distintas com toolbar Cinzel/12/700 e Optima/10/400; p. 15 `ENCOUNTER NAME AND TYPE:` e descrição viram keys 9/10 pt independentes. P. 3/4 também permanecem selecionáveis. P. 81 manteve o fallback da key antiga existente, sem inspeção nem migração de armazenamento; até revisar as 2.052 chaves, um override legado pode continuar representando o bloco inteiro.
- Build após lote passou; auditoria continua em 102/102 com 4.484 blocos, 14.059 linhas e 23.584 spans. A matriz foi regenerada: p. 3 = 12 unidades, p. 4 = 28, p. 5 = 24 e p. 15 = 14; 129 overrides pictográficos na p. 63. `git diff --check` sem erros, apenas avisos LF→CRLF. Nenhum botão Save/draft foi usado; sem commit/push.
- Feedback do usuário sobre a abordagem em lote confirmado: descobrir/registrar padrões e expandir por classes verificáveis, sem auditoria manual como único mecanismo. Próxima classe a investigar: spans de tamanhos diferentes na mesma linha/baseline e os 1.099 blocos mistos que não cabem na assinatura simples. Exigir que o agrupamento preserve sequência de texto, avanço horizontal, eixo `x₀`/coluna e compatibilidade de keys; separar casos de overlay/arte.

#### Próxima classe: runs de tamanhos diferentes na mesma linha (planejada)

- O levantamento atualizado encontrou 1.501 linhas com mais de um tamanho em 85 páginas; 1.061 têm todos os tamanhos acima de 6 pt. O par 9/10 pt aparece em 810 linhas, frequentemente como termos e labels destacados inseridos em frases; outras classes incluem heading/subheading 18/11 pt.
- Não aplicar a regra “primeira linha/corpo uniforme” a estes casos: a unidade atual referencia linhas completas e não consegue editar um span/run sem incluir vizinhos. Splits cegos podem separar palavras de uma frase e, ao traduzir, não recalcular o avanço dos runs seguintes.
- Tracer proposto: `Adventure Mode` 18 pt + `Continued` 11 pt na mesma baseline (p. 13 e 81). Projetar unidades por run dentro do renderer de linha, integradas na sequência inline para conservar baseline, alternates e fluxo; manter override legado do bloco como fallback. Validar somente o tracer antes de ampliar; tratar frases corridas 9/10 pt como classe independente.

#### Tracer de runs independentes na mesma linha — página 13 (concluído)

- `scripts/apply_page13_inline_title_units.py` confirma a linha `line_53_0` do título como dois runs Cinzel na mesma baseline: `Adventure Mode ` 18 pt e `Continued` 11 pt. Foram adicionadas duas refs (`line_53_0:0` e `line_53_0:1`) sob keys por idioma, sem alterar texto, fontes, `renderWeightOverride`, bboxes ou ordem.
- `PageRenderer` agora pode selecionar/substituir um run referenciado por `lineId:spanIndex` dentro do próprio fluxo inline. Assim, o run substituído ocupa a posição na sequência da linha e os runs posteriores acompanham seu avanço, em vez de desenhar texto sobreposto numa caixa independente. A sequência de `displayOverride` decorativo é preservada somente quando o texto não mudou e a contagem de codepoints coincide.
- Admin isolado: `Continued` seleciona `page_13_unit_p13-adventure-mode-continued__en` com Cinzel 11/700; `Adventure Mode` seleciona `page_13_unit_p13-adventure-mode-title__en` com Cinzel 18/700. Render de página inteira em 100% manteve o heading visualmente junto e alinhado; janela de reescrita foi aberta e cancelada sem alteração. Nenhum Save/draft/database/localStorage foi usado.
- A matriz `audit_typographic_hierarchy.py` agora conta unidades por linha e `typographicSpanUnits` em coluna própria (2 na p. 13). A cobertura permanece inventário de fontes: 102 páginas, 4.484 blocos, 14.059 linhas, 23.584 spans. A build passou antes da última simplificação de preservação de alternate; repetir build e QA de diff antes de encerrar.
- O scan de linhas mistas dá 1.501 em 85 páginas; 1.061 linhas têm pelo menos 6 pt. 810 são 9/10 pt (majoritariamente Optima regular/bold em labels e palavras inline), e 24 são 11/18 pt Cinzel. Não aplicar o padrão 18/11 dos títulos aos 9/10 sem outra prova; o método exige classes estruturais separadas.

#### Plano ativo: classificar os runs inline 9/10 pt (01/10/2026)

- Objetivo: transformar o conjunto de 810 linhas 9/10 pt em classes estruturais reproduzíveis sem inferir que cada run menor ou maior é um campo independente.
- Método: gerar relatório determinístico por linha com texto, sequência de fontes/tamanhos/flags, coordenadas de span, distância horizontal, assinatura de baseline, coluna e sinais de ghost/duplicata/PUA; agrupar assinaturas e amostrar contextos contra o PDF antes de autorizar qualquer particionamento.
- Limites: não alterar o renderer ou sidecars neste estágio de inventário; preservar conteúdo em frases, overlays de cartas/arte e compatibilidade de chaves antigas. Um agrupamento estatístico é hipótese até conferência visual.
- Verificação: executar o scanner em 102 páginas, validar contagens/reexecução determinística e registrar as classes encontradas antes de escolher um tracer novo.

#### Resultado do mapa estrutural inline — 01/10/2026

- `scripts/classify_inline_typographic_runs.py` percorre os sidecars das 102 páginas sem alterá-los e registra bbox da linha e de cada span, sequência fonte/tamanho/flags, distância horizontal, dispersão de baseline, coluna, ghosts, duplicatas e PUA. O CSV por linha e o agrupamento reproduzem hashes idênticos em duas execuções.
- A definição explícita “linha com pelo menos dois tamanhos distintos, ignorando spans sem texto” encontra **1.811 linhas em 88 páginas**, agrupadas em 588 assinaturas. Destas, **1.263 têm todos os runs com pelo menos 6 pt** e 548 incluem ao menos um run menor. Isso substitui os números provisórios 1.501/1.061 do resumo anterior, que não foram reproduzidos com o filtro explícito; os novos números têm uma fonte de dados e regra determinística.
- Classe mais recorrente: 294 linhas, em 63 páginas, com Optima 10 pt regular + Optima 9 pt bold + Optima 10 pt regular; sem flags ghost, raster duplicate ou PUA. Exemplos incluem `XP`, `Gold` e termos de regra inseridos em sentenças. Isso confirma destaque inline consistente, mas não que o run de 9 pt seja um campo semântico traduzível independente; o renderer deve conservar o run e o avanço dentro da frase.
- Outra assinatura distinta: 74 linhas/35 páginas iniciam com Optima Bold 9 pt e continuam em Optima regular 10 pt, com exemplos como `SHOP AND TRAIN:` e `PREPARE PHASE:`; 63 linhas/9 páginas têm os dois runs bold (labels em contextos editoriais diferentes). Não fundir essas classes só pelo par de tamanhos.
- O par Cinzel 18/11 pt aparece em 24 linhas/24 páginas com texto no padrão `[heading] Continued`; inclui p. 13 e p. 81. Há um caso sinalizado como ghost na p. 88, mantido fora de qualquer expansão automática. Esse resultado indica uma classe que pode ser generalizada por assinatura + semântica de continuação + verificação de ghost, não apenas pelo tamanho.
- Próximo passo: auditar/adicionar um manifesto estrito dos heading runs 18/11 confirmados; depois projetar unidades inline para a classe Optima 9/10 conservando a linha original. Nenhum sidecar novo foi alterado por este scanner.

#### Expansão verificada dos headings de continuação — 01/10/2026

- O manifesto [`continued-heading-unit-batch-2026-10-01.csv`](continued-heading-unit-batch-2026-10-01.csv) congela 23 páginas com heading Cinzel 18 pt + `Continued` Cinzel 11 pt, bbox da linha, texto e assinatura. A página 88 foi a única ocorrência correspondente marcada `suspectedGhost` e foi excluída; o aplicador também falha se aparecer outro candidato não explicado.
- `scripts/apply_continued_heading_units.py` valida o conjunto global de candidatos, cada texto/família/tamanho/bbox, os índices de span e as unidades existentes na p. 13 antes de escrever. Aplicou 22 pares novos em 22 sidecars; a p. 13 mantém seu tracer original. Segunda execução dry-run reportou zero pares novos.
- Browser QA isolado na p. 16: selecionar `Continued` abriu `page_16_unit_p16-encounter-breakdown-continued-continued-heading__en`, Cinzel 11/700; selecionar `Encounter Breakdown` abriu a key irmã, Cinzel 18/700. Fechei o editor sem alterações e não salvei draft nem usei storage.
- `python scripts/audit_typographic_hierarchy.py --out-dir tmp/typography-audit/book-102-inline-final` confirmou 102 páginas, 4.484 blocos, 14.059 linhas e 23.584 spans; a matriz por página foi atualizada com a coluna de unidades inline. `npm run build -w apps/web` passou; permanece apenas o aviso preexistente de `/texture.png` resolvido em runtime. Os totais de cobertura continuam sem representar inspeção visual de cada página.

#### Plano de commits e publicação autorizado (01/10/2026)

- O usuário autorizou fazer commits separados e dar push. Antes desta autorização, o handoff dizia “sem push”; a branch já estava publicada em `origin/codex/book-visual-batch-audit` no commit `720f9f7`, então preservar esse ancestral e publicar somente os novos commits incrementais.
- Agrupar as mudanças pendentes em commits coerentes: (1) suporte do renderer/editor a unidades tipográficas e glyphs locais; (2) lotes de dados/manifests/scanners de tipografia e recuperação de marcadores da p. 63; (3) documentação/handoff final da rodada. Cada commit será precedido pelo estado de progresso atualizado aqui, validado com build, `py_compile` e `git diff --check`; depois enviar a branch normal sem force.
- Não declarar o objetivo de fidelidade concluído: estes commits são incrementos revisáveis; o trabalho continua depois do push na mesma branch.

#### Estado de commit antes do lote tipográfico final (01/10/2026)

- `ce21a8b feat: support source-aware typography editing` e `82907c2 fix: restore verified page 63 glyphs` foram criados localmente, separados por responsabilidade. Nenhum force/rebase foi feito; a branch ainda não foi empurrada depois desses commits.
- Próximo commit agrupará as unidades tipográficas/pictográficas já validadas, manifests, scanners e o registro consolidado. `git diff --cached --check` será exigido antes de cada commit; `npm run build -w apps/web`, os scanners e o `py_compile` já passaram após o conjunto completo de implementação.
