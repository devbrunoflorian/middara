# Modelo editorial

> Este documento explica como as unidades de tradução se relacionam com parágrafos, listas, chamadas e exemplos. Para a implementação e os critérios de revisão, veja a [visão geral da arquitetura](overview.md), o [fluxo de edição](../translations/manual-editor-workflow.md) e os [critérios de QA](../QA/acceptance.md).

## Unidade de tradução

O tradutor deve selecionar uma unidade editorial natural — principalmente um parágrafo — sem editar linhas físicas, IDs internos ou `FlowBlock`s. A identidade EN ↔ PT-BR é estável na chave editorial existente; a tradução pode reflowar dentro dos limites visuais autorizados.

O modelo aprovado é híbrido: unidades traduzíveis independentes e containers somente quando representam uma relação real. Um container de lista preserva associação bullet → item; não força body e Example a serem um único campo nem exige que cada linha fonte vire um registro.

## Contratos confirmados

| Estrutura | Contrato | Evidência/limite |
|---|---|---|
| Body + `Example:` p. 78 | Dois parágrafos editáveis; o item pai mantém o bullet. Gap editorial separa os parágrafos e continua válido após reflow. | Piloto/round-trip p. 78; não cria regra por frase. |
| Examples numerados | Cada Example é uma unidade tradutível independente quando a fonte apresenta essa separação. | Lote p. 50 e follow-ups registrados. |
| Heading → body | Heading e corpo permanecem unidades independentes; a posição do corpo considera o tamanho refluído anterior. | p. 24/28/62 nos escopos aceitos. |
| Label/callout → body | Label e corpo mantêm estilo e vínculo sem colapsar a chamada em prosa indiferenciada. | p. 13/57 e família aceita conforme registros. |
| Note editorial | Unidade própria associada ao container/parent apropriado. | Note comum; a Note p. 100 dentro de tabela/raster fica fora deste contrato. |
| Steps/substeps | Preservam parent/child numerado e o texto interno traduzível. | P. 37/41 conforme contratos registrados; não inferir por distância apenas. |
| Tabela | A célula fornece o container visual; parágrafos dentro dela seguem identidade editorial quando disponíveis. | P. 97 requer classificação contextual; não assumir família universal. |

## Reflow e comandos

Linhas de PDF são evidência de layout, não identidade persistente. O renderer pode conservar origem exata em EN e recompor a tradução. Uma separação física só vira unidade editorial quando a semântica e o contexto confirmam parágrafo/label/step etc.

`Enter = nova unidade editorial` e `Shift+Enter = quebra dentro da unidade` ainda não são uma regra universal documentada pelo editor. Não prometer essa UX nem alterar o armazenamento com base nessa convenção sem verificar o componente e sua persistência.

## Migração e compatibilidade

O modelo híbrido foi escolhido porque metadata/sidecars podem expor unidades editoriais sem substituir automaticamente as chaves Payload já aprovadas. O contrato de identidade, envelope e compatibilidade está na rule 02; resultados por família ficam nos registros de progresso.

## Não inferir estrutura por geometria isolada

Gap, baseline e recuo ajudam a localizar candidatos, mas não explicam sozinhos se a relação é `Example`, bullet, parágrafo, heading ou cell. Essa limitação motiva a classificação por contexto descrita nas rules 01, 05 e 07; casos sem evidência suficiente permanecem com status explícito nos relatórios.
