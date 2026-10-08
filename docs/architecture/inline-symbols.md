# Símbolos inline: modelo atual

> Este documento explica o modelo e suas evidências. Os requisitos obrigatórios de renderer e semântica ficam nas [rules 03](../../.agents/rules/03-motor-de-renderizacao.md) e [14](../../.agents/rules/14-inline-semantic-elements.md); se houver divergência, use as rules `ACTIVE`.

## Identidade versus ocorrência

`symbolId` identifica o significado reutilizável (`attack.melee`, `dice.black` etc.). O vector/path/asset, `renderVariant`, cor, dimensões, avanço e âncora descrevem a aparência e a colocação de uma ocorrência. Mesmo nome de fonte, glyph code ou silhueta parecida não bastam para fundir identidades.

## Métricas tipográficas

Cada ocorrência deve manter conceitualmente:

- tinta/bbox do desenho;
- avanço horizontal reservado;
- âncora de baseline e offset vertical;
- métricas da linha de texto, independentes da altura de tinta.

A medida vertical do SVG não deve crescer o `line-height` automaticamente. O avanço fonte medido é a referência horizontal. Na p. 40, os dez marcadores A–D medem 9,991–10,000 pt de avanço; suas caixas de 9,996 pt ocupam esse mesmo espaço. O deslocamento sistemático observado no export está no registro [da auditoria](../project-progress/2026-10-07-source-structure-audit-and-doc-consolidation.md).

## Source e tradução

- Em SOURCE/EN intacto, desenhar pela bbox/origin/variante exata da ocorrência quando os dados estão disponíveis; preservar glifo-fonte ou advance que ainda seja necessário ao fluxo.
- Em texto editado, o objeto semântico deve ocupar um token no `Segment[]`; o renderer usa os metadados ricos e a métrica da ocorrência ou do registry.
- A âncora pode referenciar texto original sem repintar o glifo duas vezes. Não apague caracteres fonte nem mude largura sem provar o advance subsequente.
- Máscara/overlay de origem e adoção da tradução são estados explícitos; a ausência de `symbolId` em override legado não significa que o tradutor apagou o símbolo.
- Adapters exigem contexto e comparação com a fonte. Vetores próximos a prosa podem pertencer a uma carta, diagrama, ornamentação ou glifo do texto.

## Persistência atual

O conteúdo usa segmentos ricos em envelope compatível schema v2; símbolo inline é U+FFFC + `symbolId`, com `symbolMetrics` opcional e metadados como `renderVariant`/`managedSourceSymbols` onde aplicável. A chave por idioma permanece no modelo atual do Payload. Não persistir SVG/path como identidade e não migrar chaves existentes para ampliar uma família.

## Limite conhecido

O componente normal `SemanticSymbol` separa altura da arte do slot vertical. `SourceGeometryBlock`, `LineRenderer`, `.realbox`, texto raster e símbolos compostos têm caminhos distintos. Uma prova de um ramo não certifica os outros.

O documento detalhado antigo [elementos semânticos inline](inline-semantic-elements.md) e o [catálogo de lessons/playbooks](inline-semantic-lessons-and-playbooks.md) são registros de implementação e evidência datados; sempre use os limites acima e o status no handoff quando instruções antigas divergirem.
