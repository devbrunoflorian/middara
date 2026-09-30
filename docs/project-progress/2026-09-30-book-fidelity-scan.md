# Auditoria inicial de fidelidade inglesa — livro inteiro

- **Data:** 2026-09-30.
- **Status:** primeira triagem automatizada concluída nas 102 páginas; revisão visual do app ainda aberta.
- **Save point anterior:** `310bd82` (`feat: finalize page 2 translation fidelity pilot`), na branch `fix/pixel-render/overflow`; commit local, sem push.
- **Escopo desta tarefa:** leitura do PDF oficial e dos JSONs publicados; nenhuma alteração nos JSONs de produção, no Payload ou nos rascunhos.
- **PDF de referência:** caminho documentado em [references/README.md](../../.agents/rules/references/README.md).
- **Ferramenta reproduzível:** [`scripts/audit_book_fidelity.py`](../../scripts/audit_book_fidelity.py).
- **Matriz gerada:** [`book-fidelity-page-matrix.csv`](book-fidelity-page-matrix.csv).

## Método

O scanner abriu cada página do PDF com PyMuPDF e comparou seus spans aos spans do `page_NNN_dom.json`: texto, fonte, tamanho, flags, cor e bbox. Também classificou caracteres Private Use Area (PUA), fontes Identity-H/CID, famílias encaminhadas a fontes remotas ou do sistema, nomes de peso forte em desacordo com flags, candidatos geométricos a centralização, entradas de imagem e coordenadas fora da página. A matriz mantém uma linha por página.

O scanner é somente leitura. Para usá-lo em outro checkout ou máquina:

```powershell
py -3 scripts/audit_book_fidelity.py --pdf "C:\caminho\para\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
```

A execução de referência levou alguns minutos devido à complexidade do PDF. Os artefatos transitórios ficam em `tmp/book-fidelity-audit/`; só a matriz resumida por página foi copiada para este diretório de progresso.

### Correções feitas durante a tarefa

- O script de amostra anterior usava um caminho do PDF que não existe neste ambiente. A auditoria nova recebe o caminho oficial explicitamente e usa o caminho de Downloads registrado na regra visual como default.
- O primeiro detector de bold tratou “Black/ExtraBlack” como erro porque comparava literalmente o bit bold com o nome da fonte. A leitura do código confirmou que `mapPdfFont()` já mapeia `OptimaLTStd-ExtraBlack` para peso 950 e há asset local correspondente. O detector foi corrigido para separar “flag bold sem nome de peso forte” de “nome de peso forte sem flag”; os números iniciais foram descartados e a triagem completa foi repetida. A matriz representa a execução corrigida.
- A primeira geração da matriz ficou apenas em `tmp/`. Após validar cobertura e contagens, a versão corrigida foi copiada para `docs/project-progress/` e ligada a este relatório.

## Resultado da primeira triagem

- PDF: **102 páginas**. JSONs correspondentes: **102/102**.
- Spans extraídos do PDF versus JSON: **0 divergências de texto/estilo** e **0 divergências de bbox** na comparação com tolerância de 0,05 pt.
- Spans fora dos limites da página: **0**.
- Caracteres PUA no texto extraído: **63 ocorrências em 32 páginas**, todas em fontes de símbolos; 62 são `U+F07E` e uma é `U+F075`.
- Fonte `Identity-H`: **7 spans na página 6**, todos extraídos como `?`; o render da referência mostra interrogações nas cartas da própria arte. Isto é evidência de que o texto extraído provavelmente descreve os símbolos visíveis, não prova de falha CID.
- Fontes que dependem de Google Fonts ou de fontes do sistema: **455 spans de texto em 61 páginas**. Incluem `CinzelDecorative` (Google Fonts), `AristelleSans-Regular` mapeada para Inter, e `ZapfDingbatsStd`/`Webdings`/`Wingdings` encaminhadas pelo renderer para `Webdings`. A família Webdings não está em `apps/web/public/fonts`; portanto o resultado pode depender da máquina. A página 13 mostra o `U+F07E` como ícone de bandeira no PDF, e a página 15 mostra o `U+F075` após “CONTINUED”. São glifos legítimos na referência, mas a equivalência no renderer ainda precisa de comparação.
- Peso da fonte: **334 spans `OptimaLTStd-ExtraBlack` não têm o bit bold ligado**, embora o nome da fonte declare o peso. O renderer já mapeia `ExtraBlack` para peso 950 e o asset local existe. Isto é uma inconsistência de metadados a preservar no diagnóstico, não 334 negritos comprovadamente ausentes.
- Linhas com centros estáveis compatíveis com centralização: **34 páginas**. É um sinal geométrico informativo; não é classificado como erro.
- Diferenças de complexidade de imagem: a página 4 tem **24.887 entradas** de imagem no array do DOM e JSON de **6,27 MB**; a página 11 tem **11.737 entradas** e JSON de **2,61 MB**. O renderer atual não consome `PageData.images`, e essas entradas têm URL vazia. São candidatos a ruído de ingestão/custo de carregamento, não discrepâncias do texto. Confirmar seu uso antes de removê-las.

### O que essa prova cobre — e o que não cobre

O resultado prova que os dados de spans atualmente publicados espelham a extração de texto do PDF usado. Ele não prova que a fonte final carregada pelo browser é a certa, que o peso visual bate, que um alternate glyph está correto, que uma região editável tem o frame ideal ou que a composição completa no app coincide com o PDF. O scanner **não marca nenhuma página como visualmente aprovada**.

## Inspeção visual feita da fonte PDF

Foram renderizadas e inspecionadas páginas de referência 4, 6, 13, 15, 24 e 101. A página 4 confirma uma composição densa em duas colunas, imagens intercaladas e vários estilos. As páginas 13 e 15 mostram que os caracteres PUA identificados correspondem a marcas gráficas visíveis. Na página 6, as interrogações extraídas aparecem dentro das cartas ilustradas. A inspeção foi do PDF de referência; não foi uma comparação lado a lado com o app.

## Como converter os sinais em um processo para as 101 páginas restantes

1. **Separar dado correto de render correto.** Se PDF e JSON divergem, corrigir extração/dados. Se coincidem mas a aparência diverge, corrigir mapeamento de fontes, métricas/baseline ou o renderer. Não alterar JSONs quando a evidência aponta apenas para CSS/fonte.
2. **Agrupar apenas causas comprovadamente comuns.** Resolver e validar as famílias de fonte externa/sistema em páginas representativas; depois reavaliar as outras ocorrências que usam exatamente as mesmas famílias e glifos. Manter exceções por página quando composição ou semântica diferir.
3. **Usar regras de segmentação por tipo de conteúdo.** Parágrafos, títulos decorativos, rótulos/corpos de crédito, colunas de índice e chamadas laterais têm regras diferentes. Proximidade geométrica sozinha não cria uma unidade semântica.
4. **Manter uma fila de página, não um status global.** `needs-visual` significa que há um candidato específico na matriz. `machine-screened` significa apenas que os sinais listados foram calculados. `visually-approved` só depois de comparar PDF e inglês renderizado no app e conferir conteúdo, peso, alternates, alinhamento, frames e vizinhos.
5. **Expandir após um piloto heterogêneo.** Próximo lote recomendado: páginas 3, 4, 6, 13, 15, 24 e 101, com página 2 como controle aprovado pelo usuário. Página 3 e 101 cobrem entradas/índice; página 4 cobre layouts densos e imagens; páginas 6/13/15/24 cobrem fontes/símbolos incomuns. Depois do piloto, revisar as classes restantes em lotes, atualizando a matriz após cada decisão.
6. **Priorizar a confirmação visual do mapeamento de fonte.** O caminho local ao agente para o browser do app está bloqueado pela preferência salva, então não vou contornar via CDP, Playwright ou outra superfície. Para validar o piloto, é necessária uma comparação visual do app (por screenshot fornecido pelo usuário ou quando o acesso normal ao browser estiver disponível). As renderizações do PDF estão em `tmp/book-fidelity-audit/source-renders/` e são apenas referências.
7. **Investigar a ingestão de imagens separadamente.** Não remover as 24.887 entradas da página 4 por suposição: demonstrar primeiro se `images` é consumido por algum caminho de runtime, e se a geometria serve a filtros de oclusão. Se forem metadados mortos, corrigir o produtor e adicionar uma checagem de payload/tamanho sem alterar blocos de texto.

## Limites e próxima tarefa

- 61 páginas estão na fila visual porque contêm spans dependentes de fontes remotas/sistema. Não são 61 defeitos confirmados.
- As 41 páginas restantes seguem como `machine-screened`, não aprovadas. Ainda podem ter problemas de estrutura semântica, ordem de leitura, frame de edição, peso visual ou conteúdo rasterizado que o scanner não detecta.
- A página 2 foi aprovada pelo usuário para as alterações recentes. Essa aprovação é da página/UX desse piloto e não substitui uma verificação explícita da página em inglês renderizada contra a referência.
- Próxima etapa: validar o comportamento das fontes e os critérios do lote piloto no app. Só então registrar regras compartilhadas, corrigir componentes comuns e rever todas as páginas afetadas; não fazer correção cega em lote.
