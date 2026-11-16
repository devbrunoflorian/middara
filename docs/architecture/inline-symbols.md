# Símbolos inline: modelo atual

> Este documento explica como os símbolos inline preservam identidade, aparência e espaço no texto. Para o fluxo de edição e os critérios de comparação, consulte o [manual do editor](../translations/manual-editor-workflow.md) e os [problemas comuns de layout](../translations/common-layout-issues.md).

## Identidade versus ocorrência

`symbolId` identifica o significado reutilizável (`attack.melee`, `dice.black` etc.). O vector/path/asset, `renderVariant`, cor, dimensões, avanço e âncora descrevem a aparência e a colocação de uma ocorrência. Mesmo nome de fonte, glyph code ou silhueta parecida não bastam para fundir identidades.

## Métricas tipográficas

Cada ocorrência deve manter conceitualmente:

- tinta/bbox do desenho;
- avanço horizontal reservado;
- âncora de baseline e offset vertical;
- métricas da linha de texto, independentes da altura de tinta.

A medida vertical do SVG não deve crescer o `line-height` automaticamente. O avanço fonte medido é a referência horizontal; cada ocorrência precisa ser comparada ao símbolo e ao espaçamento vistos no PDF original.

## Source e tradução

- Em SOURCE/EN intacto, desenhar pela bbox/origin/variante exata da ocorrência quando os dados estão disponíveis; preservar glifo-fonte ou advance que ainda seja necessário ao fluxo.
- Em texto editado, o objeto semântico deve ocupar um token no `Segment[]`; o renderer usa os metadados ricos e a métrica da ocorrência ou do registry.
- A âncora pode referenciar texto original sem repintar o glifo duas vezes. Não apague caracteres fonte nem mude largura sem provar o advance subsequente.
- No fluxo traduzido, o bbox extraído da prosa pode terminar ligeiramente antes do desenho de um símbolo fonte ancorado depois dela. Se o bbox do objeto ultrapassar a largura da linha, estenda o espaço disponível somente até a borda direita medida desse objeto; assim o rótulo não quebra antes do símbolo por um corte de extração. A regressão está em `apps/web/tests/sourceInlineElements.component.test.tsx`, e a prova p.102 em `output/proofs/translation-readiness-2026-10-14/source-position-reproof-v1/` registra a comparação fonte/PDF.
- Máscara/overlay de origem e adoção da tradução são estados explícitos; a ausência de `symbolId` em override legado não significa que o tradutor apagou o símbolo.
- Adapters exigem contexto e comparação com a fonte. Vetores próximos a prosa podem pertencer a uma carta, diagrama, ornamentação ou glifo do texto.

## Persistência atual

O conteúdo usa segmentos ricos em envelope compatível schema v2; símbolo inline é U+FFFC + `symbolId`, com `symbolMetrics` opcional e metadados como `renderVariant`/`managedSourceSymbols` onde aplicável. A chave por idioma permanece no modelo atual do Payload. Não persistir SVG/path como identidade e não migrar chaves existentes para ampliar uma família.

## Limite conhecido

O componente normal `SemanticSymbol` separa altura da arte do slot vertical. `SourceGeometryBlock`, `LineRenderer`, `.realbox`, texto raster e símbolos compostos têm caminhos distintos. Uma prova de um ramo não certifica os outros.

O documento detalhado antigo [elementos semânticos inline](inline-semantic-elements.md) e o [catálogo de lessons/playbooks](inline-semantic-lessons-and-playbooks.md) são registros de implementação e evidência datados; sempre use os limites acima e o status no handoff quando instruções antigas divergirem.
