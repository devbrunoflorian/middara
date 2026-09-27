# Skills do Projeto Middara Rulebook App

Conjunto de diretrizes obrigatórias para qualquer IA (Gemini, Claude, etc.) trabalhando neste projeto. Cada uma nasceu de um problema real encontrado durante o desenvolvimento — não são recomendações genéricas de mercado.

Cole o conteúdo relevante no início da sessão com a IA, ou referencie o arquivo específico conforme a tarefa:

| Arquivo | Quando usar |
|---|---|
| `01-extracao-pdf-para-schema.md` | Qualquer tarefa de extrair dados do PDF original (`packages/ingest`) |
| `02-schema-e-modelagem-de-dados.md` | Definir ou alterar o schema TypeScript / Collections do CMS |
| `03-motor-de-renderizacao.md` | Trabalhar no `PageRenderer` ou componentes de bloco |
| `04-arquitetura-e-estrutura.md` | Decisões de monorepo, backend, storage, ordem de execução |
| `05-processo-de-validacao-qa.md` | Antes de aceitar qualquer lote de páginas como "pronto" |
| `06-comportamento-esperado-da-ia.md` | Sempre — regras de conduta gerais da IA no projeto |

## Origem
Estas skills foram extraídas de uma sessão real de prova de conceito de extração (páginas 1-10 do documento), onde apareceram e foram resolvidos: fontes subset embutidas, conversão CMYK→RGB, explosão de blocos por malha de gradiente de imagem, fragmentação de texto por tolerância de kerning, e limitação de heurística de ordem de leitura em multi-coluna. Cada skill referencia o problema real que a originou.
