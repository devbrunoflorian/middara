# Grill Me: tradução estruturada das 102 páginas

- **Status:** decisões fechadas; transcripts PDF gerados para 102/102 páginas; minutas semânticas PT em andamento para páginas aprovadas no gate inglês. P. 3–7 e 13 têm EN/PT em Markdown; todas aguardam preview PT.
- **Data:** 2026-10-02.
- **Objetivo:** preparar um fluxo repetível de extração inglesa + tradução PT-BR em Markdown por página, alinhado ao glossário oficial e às regras de copyfitting/DTP fornecidas pelo usuário.
- **Escopo:** criar uma skill local de tradução/copyfitting com referências focadas e organizar rascunhos Markdown por página; fonte textual primária é o PDF oficial, não os JSONs do app. JSON e renderer servem como evidência auxiliar para estilo/geometria.
- **Decisões do Grill-Me:** (1) incluir texto visivelmente impresso; texto duvidoso em arte/cartas vai a uma seção de revisão, sem tradução automática; (2) 20% é gatilho de alerta/copyfit, não prova de encaixe; decidir encaixe pela caixa renderizada; preservar a hierarquia dos títulos e sinalizar exceções de DTP; (3) extrair EN, corrigir fidelidade por página contra o PDF e traduzir somente depois que o EN da página estiver aprovado.
- **Referências de tradução:** usar o glossário oficial do projeto Middara 1.2, a tradução da página 2 como referência de voz, e preservar estilos inline/limites semânticos conforme regras do projeto. A unidade natural de tradução é bloco/parágrafo, não linha ou span.
- **Limite:** não gravar rascunhos no Payload nem alterar a tradução aprovada da página 2. Markdown permanece rascunho versionável separado do banco; conferir leitura do banco apenas em modo read-only.

## Método e aceitação

Usar tracer bullets: validar uma fatia pequena contra o PDF antes de criar automação/lote. Não inferir que a página 3, uma página de sumário, valida os 102 layouts. Cada página mantém seu próprio Markdown com texto inglês, versão PT-BR após o gate EN, hierarquia/formatação e flags/notas DTP; texto embutido em imagens fica em seção separada de revisão/localização de arte.

Fontes externas consultadas para copyfitting/localization: W3C, Microsoft localization resource exchange/testing e Adobe InDesign text frames. O limite percentual é heurística de atenção, pois expansão por caracteres não garante medidas visuais; o documento renderizado continua sendo o teste final.

## Implementação e evidência desta etapa

- Criada a skill `.agents/skills/middara-translation-copyfit/` com o fluxo de origem PDF → unidade semântica → glossário → copyfit → validação contextual. A skill é indexada em `.agents/rules/00-README.md`.
- Criado `docs/translations/` com guia, cópia do glossário oficial, referência limitada da voz da p. 2, matriz `page-status.csv` (102 linhas) e Markdown da p. 3 EN/PT.
- SHA-256 do glossário copiado bate com `C:\Users\bruno\Middara\Rulebook 1.2\.agents\rules\glossary.md`.
- PDF oficial confirmado por `pdfinfo`: 102 páginas, sem criptografia, 820.346 × 820.346 pt. `pdffonts` não está instalado neste host; PyMuPDF 1.28.2 localizou as fontes da p. 3 e `extract_font` retornou os dados binários subsetados para cada referência consultada.
- A p. 3 foi extraída diretamente do PDF. O render completo foi inspecionado: 40 entradas do sumário, 10 de primeiro nível em Cinzel-Regular 12 pt com peso visual local 700, 30 de segundo nível em OptimaLTStd-Bold 9 pt e o título `Contents` em EsmeraldaPro 30 pt. Referências de páginas foram associadas aos títulos por baseline visual, não pela ordem textual dos blocos. A comparação visual anterior PDF↔app, feita após corrigir os headings p. 3, está documentada em `2026-10-01-book-wide-typographic-units.md` e nos screenshots `tmp/page3-app-after.png`, `tmp/page3-pdf-after.png` e `tmp/page3-headings-compare.png`.
- A p. 3 já passou pelo gate de fidelidade EN documentado. Seu Markdown agora contém EN + PT em unidades separadas, glossário, níveis, fonte/peso, referências e expansão de caracteres. Seis frases ultrapassam 20%; por haver leaders pontilhados e espaço negativo, isso é sinal para medir no preview, não seis exceções DTP confirmadas. O preview PT segue pendente, sobretudo alternates Esmeralda e linhas longas.
- O banco ativo `apps/admin/apps-admin.db` foi consultado read-only: há 18 unidades PT na p. 2 (17 labels de créditos e o corpo de “Special Thanks”), suficientes como referência curta de voz, mas não como amostra de prosa. O banco também tem 2 entradas esparsas na p. 1 (“Rulebook” e a linha da versão), não uma página inteira traduzida. Não houve alteração no banco. `apps/admin/middara.db` é legado e contém 2 linhas antigas.
- A pasta irmã `C:\Users\bruno\Middara\Rulebook 1.2\_page_extraction\` já contém extrações/rascunhos traduzidos para p. 1–10; não contém p. 15. São artefatos históricos: não foram copiados porque agrupam algumas hierarquias diferentes e aplicam 20% como limite rígido. Podem servir de rascunho auxiliar depois de conferidos contra o PDF e o glossário.
- Criada matriz de estado com 102 páginas únicas. Só p. 2 tem referência PT no DB; p. 3 tem extração EN com fidelidade do app pendente; as outras traduções estão bloqueadas até a aprovação do EN correspondente.
- Sem mudanças no banco, sem tradução em massa, sem commit e sem push.

## Validação e limites

- `git diff --check` passou (Git avisou apenas a conversão LF→CRLF de dois documentos já existentes). A matriz tem 102 páginas únicas; p. 3 registra EN visual verificado e PT em rascunho/preview pendente.
- O `quick_validate.py` da skill-creator não executou porque `PyYAML` não está instalado. O frontmatter foi inspecionado manualmente e não há placeholders TODO; não instalamos uma dependência de ambiente só para esta verificação.
- A p. 3 valida um sumário com leaders e dois níveis tipográficos, não a segmentação de parágrafos, prosa densa, colunas de largura variável, imagens compostas, ghosts, ícones ou texto oblíquo. Naquela etapa ainda não havia extrator genérico; o transcript linha a linha foi adicionado depois e continua sem resolver semântica. A tentativa de screenshot Playwright isolado não pôde iniciar porque falta o binário Chromium; em vez de instalar um browser ou usar o Chrome do usuário, foram reaproveitados screenshots app↔PDF já existentes e registrados no projeto.

## Continuação executada — 2026-10-02

### Próximo lote iniciado: páginas 6 e 7

- O handoff existente registra revisão visual EN nas páginas 6 e 7. Vou transformar primeiro esses casos em drafts semânticos usando o PDF, mantendo o conteúdo impresso dentro de cartas/componentes ilustrados como localização de arte separada. A p. 7 é uma lista de inventário com três colunas; preservar grupos, quantidades e subtotais, sem achatá-los em parágrafos.
- Critério de aceite do lote: reconferir a fonte PDF renderizada e os blocos de texto, marcar origem/status na matriz, traduzir todas as unidades editoriais e deixar qualquer nome próprio/termo não aprovado anotado; sem gravar no DB.

### Resultado do lote: páginas 6 e 7

- P. 6: oito descrições editoriais foram transcritas e traduzidas. Preservei dois desvios da fonte (`Adventurer Mode` e `Red Reveal Recoder`) nas notas, e apliquei `Standup → Miniatura de Papel`, qualificando o suporte de papelão. Textos dentro das cartas, fichas e baralhos ilustrados continuam fora da tradução.
- P. 7: o inventário completo foi traduzido como 3 colunas, com checkboxes, quantidades, subtotais e nota de rodapé. Os rótulos curtos com expansão >20% estão anotados como alertas de largura; o título mantém a hierarquia e usa espaço do banner se necessário.
- As páginas 6 e 7 já tinham a revisão visual EN registrada nos relatórios anteriores/handoff. A matriz agora reflete `semantic_markdown_curated_from_pdf`, EN visual documentado e PT draft pendente de preview.
- P. 3–7 agora têm arquivos semânticos EN/PT (p. 3 com 40 entradas de sumário mais título; p. 4 com título + 14 blocos; p. 5 com 12 blocos; p. 6 com 8 blocos; p. 7 com a lista de componentes). As cinco páginas ainda aguardam preview PT. A p. 13 também recebeu o próprio draft no tracer seguinte.

### Próximo tracer iniciado: página 13

- A auditoria anterior registra a p. 13 como visualmente revisada, com o heading `Story Disciplines and Items` mantido no fim da coluna esquerda e separado do callout `IMPORTANT`, além das linhas distintas `Adventure Mode` (18 pt) e `Continued` (11 pt). Usei essa página para exercitar parágrafos longos, colunas, ícone de caveira e caixas IMPORTANT.
- O texto raster da faixa `DIFFICULTY` ficou separado para localização de arte; a minuta cobre os blocos editoriais e o texto real dos callouts.

### Resultado do tracer: página 13

- `page-013.md` contém **25 pares EN/PT** de parágrafos, listas e callouts, além de títulos/headings localizados e as duas partes do título em inglês com tamanhos distintos. O ícone de bandeira, lápis, raio e caveira permanecem placeholders; as palavras e caveiras da faixa `DIFFICULTY` ficam em arte.
- Evidência de geometria: o texto da coluna esquerda termina em x≈406,7 pt e a coluna direita começa em x≈415,8 pt, preservando um gutter de ~9,1 pt. Registrei também as bboxes das duas molduras IMPORTANT como referência de PDF; elas não aprovam um frame PT.
- Expansão por caracteres: `Continued → Continuação` (+22,2%) e o rótulo curto `ALL MUNDANE AND COMMON ITEMS` (+21,4%) cruzam o alerta de 20% entre os 25 pares de texto/lista. Headings acima do alerta: `Flags → Marcadores` (+100%), `Story Rounds → Rodadas de História` (+58,3%), `Explore (Side Quests) → Explorar (Missões Secundárias)` (+37,5%) e `Bounties → Recompensas` (+37,5%). São sinais para medir; manter a hierarquia e testar espaço negativo antes de reduzir títulos.
- A matriz registra a p. 13 com EN visual aprovado anteriormente e PT draft pendente de preview.

### Scanner de copyfit — validação inicial

- Criado `scripts/audit_translation_copyfit.py`, somente leitura, com CSV opcional. Ele reconhece pares EN/PT e headings localizados nos seis drafts existentes; não calcula largura de glifos, quebras ou colisões.
- Execução nos drafts p. 3–7 e 13: **184 unidades** (p. 3: 41; p. 4: 29; p. 5: 24; p. 6: 16; p. 7: 40; p. 13: 34). **66** unidades passam o alerta de 20%; muitos são rótulos/headings curtos, então esse número não significa 66 falhas de encaixe.
- Na p. 13, o relatório destaca `Continued` (+22,2%), `ALL MUNDANE AND COMMON ITEMS` (+21,4%) e quatro headings localizados (`Flags`, `Story Rounds`, `Explore (Side Quests)`, `Bounties`). As decisões continuam dependentes de preview: o título não perde hierarquia; a lista e os headings serão medidos na moldura real.
- Documentei a chamada do scanner no README e na skill `middara-translation-copyfit`. O CSV de execução fica em `tmp/` ignorado; não é artefato de produção.
- A validação do modo CSV no stdout encontrou incompatibilidade da página de código padrão do PowerShell/Windows com setas Unicode. Ajustei o scanner para reconfigurar stdout em UTF-8; `--threshold 15` passou a reportar 184 unidades/84 alertas sem erro. A gravação UTF-8 em arquivo também gerou 184 linhas de unidade.

### Próxima automação curta

- Os drafts usam pares EN/PT e rótulos de heading/callout com alguns formatos diferentes. Vou adicionar um scanner read-only que reconhece esses formatos, mede expansão por unidade e lista sinais acima de 20%, sem declarar encaixe e sem reescrever drafts. Validar a saída manualmente contra páginas 4, 5, 6, 7 e 13 antes de usar na escala maior.

- Criado `scripts/extract_translation_markdown.py` e gerados transcripts `.md` das **102/102 páginas** em `docs/translations/source-pages/` (cerca de 5,55 MB). Cada linha registra texto extraído, font face, tamanho, flags PDF e bbox. Isso automatiza a coleta rastreável sem declarar ordem semântica, leitura correta de colunas, distinção de texto editorial/arte ou fidelidade do app. O campo PT de cada linha permanece explicitamente pendente do gate EN.
- A execução levou dezenas de segundos e concluiu sem erro. As 102 páginas são arquivos distintos; a matriz continua com 102 identificadores únicos. As páginas 4–6 mostram por que o transcript bruto deve permanecer separado: o PDF contém texto editorial junto de muitos rótulos/regras rasterizados em cartas e componentes.
- Fechado um tracer de tradução da p. 5: a página-fonte renderizada foi revisada, e os **12 blocos editoriais das duas colunas** foram reagrupados em unidades semânticas com EN/PT, hierarquia e ênfases inline em `docs/translations/pages/page-005.md`. Texto de carta/ficha dentro das ilustrações está fora desta minuta e fica para localização de arte. A fidelidade inglesa da p. 5 já estava marcada como visualmente revista no handoff anterior; nenhum patch do app foi necessário.
- Em seguida, redigida a p. 4 em `docs/translations/pages/page-004.md`: título e **14 descrições editoriais** nas duas colunas, com peso dos headings, números/ênfases e referências mantidos. A fidelidade inglesa já estava marcada como revista no handoff e no audit tipográfico. Nomes e regras impressos dentro das cartas da ilustração permanecem na fila de localização de arte.
- A p. 4 teve cálculo por unidade: título +5%; corpos −11,9% a +19,5%. Nenhuma unidade supera 20%, mas `Monster Loot Cards` está perto do alerta e precisa ser avaliado pelo tamanho real no preview. Nenhum bloco dos drafts foi verificado em preview português ainda.
- Todos os 12 blocos da p. 5 ficam abaixo do sinal de expansão de 20% (intervalo medido: −11% a +17%). Isso não garante encaixe; o preview PT continua pendente. Termos novos ou decisões locais foram sinalizados para harmonização, sem alteração do glossário oficial.
- Atualizada `docs/translations/page-status.csv`: as páginas sem extração curada agora distinguem `raw_pdf_transcript_generated_unreviewed` de fonte revisada; EN fidelity continua não certificado sem evidência visual. P. 3–7 e 13 mantêm rascunho PT com preview pendente.
- A skill foi validada pelo parser YAML já instalado no Node.js. A checagem própria do skill-creator continua indisponível porque PyYAML não está instalado. Não houve gravação no Payload, commit ou push.

## Próximo passo

Manter o gate inglês. Transformar os próximos transcripts em unidades editoriais somente após conferir página/render/app; em seguida traduzir páginas EN aprovadas. Priorizar páginas claras em prosa e representar qualquer texto de arte/cartas em fila própria, sem traduzir os rasterizados por engano. O alvo imediato é fechar previews PT das p. 3–7 e 13; então continuar pela próxima página cujo inglês tenha evidência suficiente, sem promover transcripts crus a tradução. Não integrar drafts ao Payload sem tarefa separada.
