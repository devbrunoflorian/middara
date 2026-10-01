# Auditoria de unidades do cabeçalho da página 1

- **Status:** concluído para a separação e seleção independente das duas unidades; sem alteração de drafts ou persistência.
- **Data/base:** 2026-10-01, commit `33ee49f`.
- **Branch:** `codex/book-visual-batch-audit`.

## Feedback do usuário

No cabeçalho da página 1, `RULEBOOK` (título grande) e `Version 1.2 – May 2023` (linha pequena) são unidades editáveis separadas, mesmo estando visualmente juntas. O usuário relatou que na última vez que viu pareciam estar agrupadas; é preciso confirmar o estado atual no app/dados e corrigir a granularidade se necessário.

Essa evidência ilustra um requisito do modelo: proximidade geométrica, alinhamento ou pertença ao mesmo cabeçalho não bastam para agrupar texto em uma única unidade editável. Usar hierarquia visual (tamanho/peso/família), bbox, baseline e intenção semântica em conjunto.

Regra explícita informada pelo usuário: se o tamanho da fonte é diferente, os textos não pertencem ao mesmo bloco. Font size diferente será tratado como limite categórico para segmentar unidades editoriais; textos do mesmo tamanho não serão agrupados automaticamente sem validar semântica/geometria.

## Método planejado

1. Comparar página 1 no PDF com blocos/spans do `page_001_dom.json` e com o fluxo de seleção/edição no app.
2. Confirmar se as duas peças são alvos/keys independentes ou duas linhas no mesmo bloco.
3. Se estiverem agrupadas, separar a unidade editável preservando posições, tamanhos, estilos e chaves/drafts existentes; executar dry run de impacto de keys antes de qualquer migração.
4. Comparar lado a lado no estado fonte e assegurar que editar um campo não altere o outro.

## Critério de encerramento

O título e a linha de versão têm alvos editorais independentes, aparência e geometrias preservadas, e qualquer chave legada/draft tem compatibilidade documentada antes de mudança.

## Evidência e implementação em andamento

- O JSON de produção antes da correção agrupava `Rulebook` (Cinzel-Regular, 17,8476 pt) e `VERSION 1.2 - MAY 2023` (OptimaLTStd-Bold, 7 pt) como duas linhas de `block_3`/índice 0. A extração de página dedicada manteve-as independentes. Em ambos os casos, tamanhos diferentes impedem o mesmo bloco editável.
- O bloco tem somente essas duas linhas e é o índice 0. Uma consulta SQLite em modo read-only contou zero chaves `page_1_block_*`; nenhum conteúdo de tradução foi selecionado/lido. Assim, manter a key legada do `Rulebook` é compatível com estado salvo observado e não há chave page 1 existente a migrar.
- A alteração planejada preserva `page_1_block_0` para `Rulebook`, move a linha de versão para um bloco independente no fim do array (para não deslocar índices legados de blocos posteriores), e dá a esse bloco a chave semântica `page_1_header_version__<idioma>`. O bbox e os estilos das linhas permanecem iguais.

Implementei o split: `block_3` mantém só `line_3_0`; `line_3_1` foi movida intacta para `block_3_version`, append no índice 2, com `editorKey: page_1_header_version`. O renderer preserva a chave indexada dos blocos antigos e qualifica a nova key semântica com o idioma. Isso não altera dados no Payload/localStorage.

Correção de QA: o primeiro teste procurou `.span-editable`, que não é a classe de seleção atual; o `SpanBlock` delega cliques ao wrapper `.block-editable`. O teste parou antes de clicar/alterar qualquer dado. Ajustei-o para validar `.block-selected`; nenhuma correção no produto veio desse engano de seletor.

### Verificação final

- `npm run build -w apps/web` passou após a mudança.
- Captura headless da página 1 foi comparada ao PDF na mesma escala; enquadramento, posições e aparência das duas linhas mantiveram-se alinhados.
- No Admin, clique em `Rulebook` selecionou somente o título; clique na linha `VERSION 1.2 - MAY 2023` selecionou somente a versão. Bboxes locais: título `[394.8125, 711.96875, 95.6875, 24.015625]`; versão `[404.140625, 734.0625, 79.484375, 8.328125]` (x, y, largura, altura).
- Nenhum save, alteração de draft nem escrita no banco foi feita. Sem push; branch ainda não commitada.
- Resultado: critério confirmado para a p. 1. Tamanhos diferentes separam unidades de edição; tamanho igual não autoriza agrupamento automático.
- Generalizei o limite no `scripts/extract_dom.py`: blocos fonte com tamanhos distintos são particionados por tamanho preservando runs do mesmo tamanho, e a junção semântica entre blocos exige perfil de tamanho idêntico. Teste sintético confirmou que dois runs 18 pt ficam juntos, enquanto a linha 7 pt vira unidade separada. Uma extração read-only da p. 1 para `tmp/font-size-extraction/` também entregou `Rulebook` e `VERSION 1.2 - MAY 2023` em blocos distintos; nenhum JSON de produção foi regenerado.
