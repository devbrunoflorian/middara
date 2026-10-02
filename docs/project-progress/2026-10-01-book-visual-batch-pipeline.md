# Plano de verificadores para fidelidade visual do livro

- **Status:** análise executada em pilotos p. 3/p. 1/p. 56/p. 74 e triagens tipográfica/ghost nas 102 páginas; automação especializada ativa, sem aprovação visual em lote.
- **Data/base:** 2026-10-01, commit `33ee49f` (merge das correções da página 13).
- **Branch:** `codex/book-visual-batch-audit`, criada de `main`/`master` depois de `git fetch`, `git checkout master`, `git pull --ff-only origin master` e `git checkout -b codex/book-visual-batch-audit`.

## Por que abandonamos o comparador universal

A hipótese inicial era capturar o viewer e o PDF, medir diferença de pixels e revisar os piores. A implementação provisória travou ao tentar exigir uma escala fixa; não houve screenshot nem diff confiável. Mais importante, o feedback do usuário identificou três classes diferentes: estilo tipográfico, diagramação geométrica e texto HTML duplicado sobre artwork. Um número global de diferença mistura essas causas e pode priorizar ruído em vez de defeito. Os scripts provisórios não calibrados serão removidos; artefatos ficariam em `tmp/` e nenhum dado do livro foi alterado.

## Estado confirmado

- `main` local/remota foi fast-forward até `33ee49f`; as correções visuais da página 13 já estão incorporadas.
- Viewer está em `http://127.0.0.1:8080/`; Payload/SQLite em `http://127.0.0.1:3000/admin`. Ambos responderam HTTP 200. Não li valores de tradução no banco.
- A referência oficial existe em Downloads. São 102 páginas de 820,35 × 820,35 pt. O viewer usa dimensões de 820,35 × 820,35 e backgrounds locais de 1710 × 1710 px. PyMuPDF, Pillow, NumPy, Playwright e Chrome estão disponíveis.
- Correção no lançamento: Vite iniciou apenas no loopback IPv6. Passei a iniciar o entrypoint local Vite 8.3.1 com `--host 127.0.0.1 --port 8080 --strictPort`; este é o endereço aberto pelo usuário.
- Não houve screenshot comparável, mudança no app/PDF, alteração persistida ou aprovação de página nesta tarefa.

## Feedback de produto/metodologia do usuário

- Corrigir primeiro os títulos principais sem negrito da página 3.
- A hierarquia do livro contém muitos níveis e estilos. Espaçamento também pode obedecer a relações repetidas que deveríamos descobrir e codificar como critérios. São hipóteses a inventariar no PDF, não regras globais já aceitas.
- Regra estrutural confirmada: diferença de tamanho de fonte é um limite categórico — textos em tamanhos diferentes não pertencem ao mesmo bloco/unidade. Mesmo tamanho não prova agrupamento: ainda precisa corresponder a uma unidade semântica/layout.
- Separar as ferramentas: tipografia (font family, peso, itálico, alinhamento/estilos); geometria (altura, baseline, margens, gutter e colisões); ghosts/duplicação (texto vetorial do PDF extraído para HTML em cima de texto já rasterizado em imagem/cartas).
- O detector de texto duplicado é a principal prioridade sistêmica. Os screenshots apontam exemplos nas páginas 56 e 74. Calibrar com casos positivos e falsos positivos existentes; `suspectedGhost` não basta para apagar texto (regra 7).
- Na v1 não retocar, gerar ou substituir imagens/artwork. Depois de provar duplicação, pode-se suprimir somente a camada HTML indevida no viewer e preservar a imagem original; manter o texto-fonte acessível para auditoria/Admin segundo o caminho já existente.

## Plano ordenado

1. **Página 3:** concluído: peso 700 page-local nos dez headings verificados contra PDF; vizinhos e ornamentos preservados.
2. **Cabeçalho da página 1:** concluído: título `Rulebook` e versão são alvos independentes; tamanho de fonte diferente é limite de unidade e a key legada foi preservada.
3. **Duplicação sobre artwork:** piloto corrigiu regiões comprovadas nas p. 56/74. Scanner rodou nas 102 páginas e retornou 5.088 candidatos em 78 páginas; a precisão ainda é baixa por colisão com painéis compostos. Próximo trabalho: agregar por imagem/região e melhorar precisão antes de expandir as correções. Nunca editar artwork na v1 nem ocultar só por `suspectedGhost`/sobreposição.
4. **Hierarquia tipográfica e spacing (agora):** executar inventário especializado para família, tamanho, peso, itálico, caps, alinhamento e blocos de tamanhos mistos. Emitir candidatos por página/linha/span; não aplicar regra global automaticamente.
5. **Geometria:** outro relatório/script para tinta pintada, baselines, altura, margens e gutters por coluna. Reutilizar `x₀` sem confundir bbox de extração com tinta pintada.
6. Expandir por famílias/layouts somente depois de medir falsos positivos/negativos de cada detector. Processamento em lote descobre candidatos; revisão amostral e itens de alto risco continuam explícitos.

## Próxima ação

As correções focadas das páginas 3 e 1 e o piloto anti-duplicação nas páginas 56/74 estão registrados. Iniciar o inventário de estilos sob [`2026-10-01-typography-hierarchy-inventory.md`](2026-10-01-typography-hierarchy-inventory.md); em paralelo, manter o scanner de ghosts como triagem em melhoria, não como regra automática. Geometria/spacing terá verificador específico posterior.
