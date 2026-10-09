# Tradução manual EN → PT-BR no Admin

**Fluxo ativo de produção.** O texto PT-BR é escrito manualmente no Admin, no RichSpanEditor, e salvo como override da unidade editorial selecionada. Este guia reflete o comportamento atual do app; não inicia tradução automática, importação, auditoria global nem export integral.

## Fonte e apoio

Use estas fontes nesta ordem:

1. **PDF oficial em inglês:** `C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`. É a autoridade para texto, ordem, pontuação, ênfases e conteúdo impresso.
2. **Glossário oficial:** [`glossary.md`](glossary.md). `glossary-candidates.md` é provisório e não substitui as entradas aprovadas. No editor PT-BR, “Contexto para tradução” mostra o EN e correspondências literais desse glossário. Flexões e variantes não são inferidas.
3. **Voz:** [`references/page-2-voice-reference.md`](references/page-2-voice-reference.md) é uma amostra curta aprovada para tom e escolhas já feitas. Não é modelo de estrutura nem prova de cobertura da página.
4. **Copyfit/DTP:** [`../../.agents/skills/middara-translation-copyfit/SKILL.md`](../../.agents/skills/middara-translation-copyfit/SKILL.md) e sua referência de [copyfitting e DTP](../../.agents/skills/middara-translation-copyfit/references/copyfitting-and-dtp.md).
5. **Editor e símbolos:** a unidade e o key atuais vêm da página carregada; os símbolos inline usam identidade semântica estável. A paleta ou atalhos como `[[melee]]`, `[[lightning]]` e `[[black-die]]` inserem objetos reconhecidos pelo editor. O token visível é uma forma de edição, não o ID persistido.

Regras de referência do próprio projeto: [persistência/IDs](../../.agents/rules/02-schema-e-modelagem-de-dados.md), [renderer e locale](../../.agents/rules/03-motor-de-renderizacao.md), [QA](../../.agents/rules/05-processo-de-validacao-qa.md), [comportamento da IA](../../.agents/rules/06-comportamento-esperado-da-ia.md) e [semântica inline](../../.agents/rules/14-inline-semantic-elements.md). Elas descrevem contratos gerais; para uma família de componente, aplique somente as decisões já documentadas para aquela estrutura.

Sidecars, JSON de página, capturas e dados existentes ajudam a localizar unidades e estilos, mas não substituem a conferência do PDF. A transcrição em [`source-pages/`](source-pages/) é uma extração física linha a linha, não uma divisão editorial aprovada.

## Mapa do caminho atual

| Estágio | Arquivo/entrada → saída | Identidade, fonte de verdade e edição permitida |
| --- | --- | --- |
| Fonte | PDF oficial → texto, estilos, geometria e desenhos impressos. | PDF é a verdade do conteúdo EN. Não “corrija” texto-fonte nem mude geometria EN para acomodar PT. |
| Extração auxiliar | `scripts/extract_dom.py` lê o PDF via PyMuPDF e, por padrão, grava extração em `tmp/extraction-output`; `scripts/extract_translation_markdown.py` grava transcrições brutas em `source-pages/page-NNN.md`. | São insumos técnicos. Transcrição linha a linha e ordem do extractor não são identidade editorial. Não executar rebuild por cima de `apps/web/public/pages` durante tradução. |
| Estrutura publicada | `apps/web/public/pages/page_NNN/page_NNN_dom.json` contém visual blocks, spans e, quando disponíveis, `typographicUnits`; `layout_frames.json`, `inline_elements.json`, `compound_elements.json` e `fidelity_overlays.json` complementam a página. | O `editorialUnitId`/ID da unidade no JSON relaciona texto editável à fonte. Sidecars podem guardar frame, placements e natureza de artwork. Não editar line IDs, IDs de unidade ou JSON manualmente. |
| Aplicação/viewer | [`App.tsx`](../../apps/web/src/App.tsx) carrega a página/locale; [`PageRenderer.tsx`](../../apps/web/src/components/PageRenderer.tsx) combina JSON, sidecars, fonte EN, locale e overrides. | O renderer constrói visual blocks e unidades selecionáveis. A unidade editorial, não cada linha física, é a identidade EN ↔ PT. |
| Símbolos inline | [`semanticSymbols.ts`](../../apps/web/src/symbols/semanticSymbols.ts) registra `symbolId`, aliases e restrições; [`RichSpanEditor.tsx`](../../apps/web/src/components/RichSpanEditor.tsx) mantém símbolos como segments ricos. | Persistir/manter o `symbolId` existente. `[[alias]]` e a paleta são formas de edição; não substituir por PUA, emoji, descrição ou desenho manual. |
| Locale e edição | PageRenderer lê EN ou PT-BR e, se não houver override PT, a página herda o EN. RichSpanEditor altera o draft da unidade selecionada. | O usuário pode alterar o conteúdo PT-BR no RichSpanEditor. A identidade existente não deve ser renomeada; o draft pode reflowar dentro das estruturas editáveis. |
| Estado local e Payload | `/api/translations` e localStorage `middara-lines-v2-en` / `middara-lines-v2-pt-BR` são combinados. [`Translations.ts`](../../apps/admin/src/collections/Translations.ts) define registros por `spanKey`, idioma e dados JSON. | Key novo usual: `page_<p>_unit_<id>__pt-BR`; há chaves legadas `page_N_block_N`. Save pode ficar só local ou sincronizar com Payload. O app mostra qual ocorreu. |
| Moldura | [`LayoutFrames.ts`](../../apps/admin/src/collections/LayoutFrames.ts) e sidecar `layout_frames.json` guardam layout separadamente do texto. | PT herda o frame EN até haver personalização explícita. Não altere moldura/fonte automaticamente durante copyfit. |
| Export | `scripts/export_page_pdf.mjs` → PDF de página; `scripts/export_full_book_ptbr.mjs` → PDF PT-BR completo. | Export lê o viewer/locale solicitado. O export completo é futuro QA/entrega, não requisito por unidade. `scripts/export-translations.ts` é export legado de dados, não PDF. |

O `extract_dom.py --all-pages` não faz parte do procedimento de tradução; não o direcione ao diretório de produção durante uma sessão editorial.

## O que é uma unidade traduzível

Traduza a unidade editorial selecionada no viewer — normalmente um parágrafo, heading, item, label ou corpo — e deixe o app manter sua identidade EN ↔ PT-BR. Uma linha física do PDF não é uma unidade de tradução. Não edite IDs, line IDs, FlowBlocks ou JSON para traduzir.

Unidades relacionadas continuam simples para o tradutor: por exemplo, na p. 78 o Body e `Example` são dois parágrafos editáveis independentes, com o bullet associado ao item visual pai. Edite cada parágrafo clicando na própria caixa. Se a unidade não estiver separada no editor, não tente compensar digitando linhas físicas nem mudando a chave; registre a página/unidade para uma correção estrutural concreta.

Quebras de linha digitadas no campo pertencem ao mesmo override. Elas não criam automaticamente uma nova identidade editorial. O significado de `Enter`/`Shift+Enter` não é um contrato universal para dividir unidades; prefira as unidades já apresentadas pelo editor.

## Procedimento por unidade

1. **Abra a página impressa definida para a sessão.** A fila de conteúdo novo começa após a p. 12, cujas traduções existentes estão aprovadas e devem permanecer intactas. Use a fila combinada com o usuário; `page-status.csv` não determina sozinho qual é a próxima página.
2. **Confira EN no viewer e no PDF.** Confirme que selecionou a caixa certa e entenda headings, parágrafos, listas, Notes/Examples, hierarquia, arte e símbolos inline antes de traduzir.
3. **Mude para PT-BR e abra a unidade no Admin.** O editor mantém o key da unidade. O painel recolhível **Contexto para tradução** mostra o texto EN da fonte e os termos do glossário encontrados literalmente.
4. **Escreva a tradução manualmente.** Preserve sentido de regra, agente, negação, condições, quantidade, ordem, referência cruzada, bold/italic e lugar de cada símbolo. Use a paleta ou atalhos `[[alias]]` para símbolos; não digite PUA, emoji ou desenhos para imitar ícones. O app não traduz o conteúdo automaticamente.
5. **Revise o reflow vivo.** Leia o PT dentro da página inteira: quebras naturais, estilos, símbolos, listas/hierarquia, clipping, colisões e interferência com arte ou boxes vizinhos. Não imite o número de linhas do EN com quebras manuais. Não reduza fonte, altere entrelinha ou redimensione molduras apenas para forçar texto a caber; se copyfit fiel exigir DTP, registre a unidade e a ação necessária.
6. **Salve e espere a confirmação.** O estado pode incluir um rascunho local. Considere sincronizado com o servidor somente quando o app confirmar o save no Payload; avisos de rascunho local ou falha indicam que ainda é preciso resolver a persistência.
7. **Recarregue e confira.** Confirme que o PT continua presente, que o EN permanece intacto, que estilos e símbolos sobreviveram e que a unidade certa continua associada à tradução. Volte ao EN e ao PT uma vez para conferir o isolamento entre idiomas.
8. **Anote apenas trabalho real.** Guarde questões linguísticas/termos como revisão e problemas concretos de copyfit como DTP. `page-status.csv` e os drafts Markdown são acompanhamento/editorial legado; não são um espelho confiável do estado atual de cada override no Payload.

### Sinais e limites do preview

- O indicador vermelho de overflow acusa excesso vertical no frame; não certifica sozinho clipping horizontal, colisões, qualidade linguística, ausência/duplicação de símbolos ou fidelidade completa.
- O painel de contexto mostra **correspondências literais exatas** com o glossário. Uma flexão que não aparece na lista não prova que o termo esteja ausente do glossário; confira a entrada manualmente.
- Após salvar, o texto pode ter estado local e estado sincronizado no Payload. Use a confirmação visível do save e depois reload; não deduza sincronização só porque a prévia mudou.
- Fonte EN preserva a geometria original. PT-BR reflowa nas estruturas editáveis correspondentes. Espaçamentos e quebras fonte não devem ser copiados como linhas físicas para o PT.

## Persistência, viewer e export

- O texto salvo fica como override da unidade selecionada, com uma chave estável derivada da página/unidade e do locale. As traduções existentes e seus keys não devem ser renomeados ou migrados durante a tradução manual.
- Para salvar uma cópia dos registros confirmados no Payload, consulte [backup portátil](translation-backup.md). A CLI não inclui localStorage-only saves nem drafts de sessão.
- O viewer mostra o draft ao vivo. Salvar atualiza o estado local e tenta sincronizar com Payload; reload é a verificação prática de persistência.
- Preview visual não equivale a export. Quando for necessário um PDF de página, o caminho atual é `scripts/export_page_pdf.mjs`; para um Rulebook completo, existe `scripts/export_full_book_ptbr.mjs`. O export integral não é um gate para começar ou continuar a tradução manual. `scripts/export-translations.ts` é um export legado de dados e não gera o PDF do livro.
- Não há hoje um pacote genérico de tradução Markdown/CSV para importação pelo Admin. Não presuma que colar um draft ou `{{symbol:id}}` grave dados no editor. `{{symbol:id}}` é notação documental antiga; a edição atual usa a paleta e aliases `[[...]]`.

## Acompanhamento disponível e ausente

**Disponível por unidade (quando aquela estrutura fornece o dado):** ID editorial, página, visual block de origem, EN source text, PT override ou herança EN, tipo/contexto, bbox source, frame, spans/estilos e IDs de símbolos inline. O vínculo pai/filho é muitas vezes implícito no visual block; não presuma um `parentId` explícito. Preview PT ao vivo, save/reload, isolamento de locale, estado carregado do override, herança de moldura e confirmação de save também existem.

**Ainda não existe:** status persistido por unidade como “rascunho / revisado / copyfit aprovado”; checklist de página sincronizado automaticamente com Payload; visor lado a lado EN/PT; estimativa automática de colisão, clipping horizontal, excesso de linhas, ocupação relativa ou resize recomendado; importador geral; mapa de relações semânticas do glossário. O aviso vermelho atual indica overflow vertical do frame; os outros itens exigem revisão visual/contextual.

O painel novo mostra EN somente leitura, se um override estava carregado ao abrir a unidade e correspondências literais com o glossário canônico. A busca ignora caixa para encontrar o termo, mas exibe a capitalização oficial cadastrada; ela não reaplica capitalização automaticamente na tradução. Termos relacionados e decisões contextuais como “Saque/Saques” continuam decisão humana. `glossary-candidates.md` é provisório, não um grafo de relações nem uma autoridade. Regras especiais de símbolos/estruturas ficam nos contratos de projeto e registros por família; o painel não tenta adivinhá-las.

## Melhorias futuras documentadas

- Rastrear revisão/termos/copyfit por unidade em metadados editoriais leves, sem misturar status de revisão ao JSON da tradução até haver necessidade concreta.
- Mostrar contexto EN/PT e metadados de frame/tipo/parent lado a lado quando isso reduzir troca de painel durante a tradução.
- Evoluir matches literais para sugestões de flexões/termos relacionados somente com aprovação linguística e regras explícitas; não inferir traduções automaticamente.
- Projetar um pacote de locale que transporte keys estáveis, segments rich text, `symbolId`s e validação de compatibilidade para import/export, revisão e colaboração. Hoje não há esse importador genérico.

Essas ideias não bloqueiam a tradução manual atual.

### Exceção conhecida da p. 97

A estrutura atual representa a maior parte da p. 97 por caixas visuais que correspondem aproximadamente às células/colunas. Algumas células têm granularidade suficiente; outras agrupam vários itens em um único campo. Isso ainda permite editar, formatar e salvar a célula, mas não cada parágrafo/list item separadamente. Não é bloqueio preventivo: quando a tradução chegar à p. 97, avalie a necessidade a partir do uso real e solicite separação estrutural se ela impedir a edição natural.

## Próxima sessão — roteiro curto

Quando Bruno abrir a próxima página para traduzir: confirmar o número impresso e a origem PDF; selecionar a primeira unidade PT-BR; abrir “Contexto para tradução”; redigir manualmente respeitando glossário, estilos e símbolos; revisar o preview e a página completa; salvar, aguardar confirmação Payload e recarregar. Se surgir um defeito real, reproduzir nessa unidade, corrigir a causa compartilhada quando aplicável, validar uma ocorrência equivalente e voltar à tradução. Não reabrir auditorias preventivas aceitas.
