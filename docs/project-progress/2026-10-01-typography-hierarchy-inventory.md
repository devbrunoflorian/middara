# Inventário tipográfico e hierarquia textual do livro

- **Status:** inventário read-only de 102 páginas concluído; revisão visual e resegmentação dos candidatos permanece aberta.
- **Data/base:** 2026-10-01, `master` atualizada em `33ee49f`; branch `codex/book-visual-batch-audit`.
- **Escopo:** leitura sistemática dos 102 JSONs de página; não corrigir automaticamente tipografia ou geometria.

## Pedido e critérios do usuário

O rulebook contém vários níveis tipográficos e relações de espaçamento que devem ser identificados e convertidos em critérios reproduzíveis. Primeiro medir separadamente família, tamanho, peso, itálico, caps, overrides e alinhamento; só depois conferir baselines, margens e distribuição espacial com um verificador geométrico próprio. Não presumir que títulos/callouts/listas em todas as páginas têm o mesmo desenho.

Regra categórica: fontes de tamanhos diferentes não pertencem ao mesmo bloco editável. Tamanhos iguais, por si só, não provam que os textos devem ser unidos. A correção p. 1 demonstrou o limite; p. 3 demonstrou que font metadata pode omitir peso visual, exigindo verificação contra PDF.

## Método

1. Varredura read-only de cada span/linha/bloco em `apps/web/public/pages/page_NNN/page_NNN_dom.json`.
2. Registrar fonte declarada, tamanho, `flags` bold/italic, caps, cor, overrides renderizados, PUA, bbox e texto associado; medir perfis de tamanho por bloco para encontrar unidades potencialmente mistas.
3. Comparar distribuições/famílias recorrentes por função provável (heading, corpo, callout, legenda, carta), mas publicar como candidatos, não regras globais.
4. Amostrar PDF e app em representantes: p. 1 (títulos com tamanhos diferentes), p. 2 (créditos/runs), p. 3 (headings e leaders), páginas com cartas/colunas/índice e callouts.
5. Gerar CSVs em `tmp/typography-audit/`: inventário por span, blocos com múltiplos tamanhos e resumo por página/estilo. Nenhuma alteração aos 102 JSONs nessa tarefa.
6. Com os padrões verificados, ajustar separadamente o extrator/renderer. Geometria, espaçamento e ghost-text continuam verificadores próprios.

## Segurança e verificação

- Sem escrita em JSON de produção, banco, drafts ou `localStorage` durante o inventário.
- O extrator agora impede juntar blocos de tamanhos distintos e particiona linhas/runs mistos por tamanho; validar os resultados em saída temporária. Isso ainda não é aprovação visual das unidades existentes nas 102 páginas.
- Reexecutar `git diff --check` e revisar o CSV/resumo. Não push.

## Próxima ação

Revisar os candidatos maiores primeiro contra o PDF/app, agrupados por função provável. Prioridade inicial: p. 4 (73 blocos mistos), p. 3 (7 headings/entradas combinados), p. 13 (5 blocos, incluindo `Adventure Mode Continued`) e p. 74 (31 blocos com ícones/cópias de cartas). Antes de resegmentar produção, mapear chaves legadas e marcar sobrescritos/runs inline que não são unidades semânticas separáveis.

## Resultado do inventário

- `scripts/audit_typographic_hierarchy.py` examinou 102 JSONs: 4.484 blocos, 14.059 linhas e 23.584 spans. Produziu `spans.csv`, `mixed-size-blocks.csv`, `pages.csv` e `summary.json` somente em `tmp/typography-audit/` (ignorado).
- 1.295 blocos em 91 páginas contêm dois ou mais tamanhos arredondados a 0,01 pt. É um inventário de candidatos, não uma contagem de erros confirmados; spans inline, sobrescritos, símbolos e ícones podem compor casos mistos legítimos no PDF.
- Exemplos que confirmam valor da triagem: p. 4 combina heading 12 pt e descrição 10 pt em blocos — precisamente a granularidade de edição que o usuário espera; p. 3 combina headings 12 pt e entradas 9 pt; p. 13 identifica headings/corpo em alguns blocos. p. 1 e 2 aparecem sem blocos mistos após as correções existentes.
- Família mais comum: OptimaLTStd (11.507 spans) e OptimaLTStd-Bold (7.316), seguidas por Cinzel-Regular (1.122); tamanho mais comum 10 pt (11.596 spans), depois 9 pt (2.126) e 8 pt (1.454). Os dados de flags, família e nome divergem em alguns casos; confirmar visualmente antes de ajustar mapping.
- 9.236 spans têm flag bold e 1.341 italic; 9.570 nomes de fonte contêm sinal de bold. 32 spans já têm override de peso. Esses valores são sinais cumulativos/possivelmente sobrepostos e não uma contagem simples de defeitos.
- `npm run build -w apps/web`, `python -m py_compile` dos quatro scripts e `git diff --check` passaram. Vite reportou o aviso conhecido de `/texture.png` não resolvido no build, mantido para runtime. Nenhum JSON de produção foi regenerado pelo inventário.
