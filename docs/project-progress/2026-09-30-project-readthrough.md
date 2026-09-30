# Tarefa: leitura geral e entendimento do Rulebook App

- **Status:** concluída; revisão de repositório somente leitura, mais correção documental do handoff.
- **Data:** 2026-09-30.
- **Branch observada:** `fix/pixel-render/overflow` em `a57f2de`, acompanhando `origin/fix/pixel-render/overflow`.
- **Esclarecimento do usuário:** a branch de trabalho estar à frente de `master` é intencional; os commits recentes foram feitos pelo próprio usuário. Nenhuma sincronização/alteração de branch foi necessária.

## Objetivo

Entender o produto e distinguir a implementação atual das arquiteturas antigas/aspiracionais, para responder com base no repositório e deixar um handoff confiável para próximos agentes.

## Método

- Li primeiro `docs/project-progress/CONTINUE-HERE.md`, as regras relevantes, índices de progresso, decisões de layout, resultados das auditorias, manifests, extrator e caminhos centrais de React/Payload.
- Conferi estrutura atual, contagem de JSONs de página, estado Git e fórmulas de edição/salvamento diretamente no código.
- Não li/exportei `localStorage`, não consultei nem alterei banco nesta tarefa, não rodei o extrator e não editei código ou JSON de produção.
- Atualizei este registro, o índice de progresso e o handoff porque os ponteiros Git e parte da descrição estrutural no handoff antigo já não correspondiam ao estado observado. A versão substituída do handoff foi preservada no `icebox`, com justificativa.

## Entendimento do produto

O objetivo prático é traduzir o rulebook do Middara dentro de um leitor visual, preservando a hierarquia do PDF e tornando cada unidade razoável de editar. Não é necessário reconstruir automaticamente e perfeitamente as 102 páginas antes de começar a tradução. O desafio é separar quatro conceitos que hoje às vezes se confundem:

1. **Geometria da tinta original** (onde os glifos aparecem no PDF).
2. **Região/moldura disponível para o texto traduzido** (onde uma tradução pode refluir).
3. **Unidade semântica editável** (parágrafo, categoria de crédito, entrada do índice).
4. **Runs originais de estilo** (fonte, tamanho, peso, itálico e cor dentro dessa unidade).

Uma unidade pode conter vários estilos; uma região visual pode conter várias unidades. Coordenadas de tinta não definem automaticamente a moldura da tradução.

## Arquitetura realmente ativa

- `apps/web`: viewer SPA em React/TypeScript/Vite; consome os JSONs estáticos em `apps/web/public/pages/page_NNN/`, desenha o artwork de fundo e posiciona o texto extraído. O repositório contém 102 arquivos `*_dom.json`.
- `apps/admin`: Payload CMS + Next.js, SQLite e endpoints de tradução; em desenvolvimento é iniciado separadamente na porta 3000. `apps/web` roda em Vite, porta 8080.
- `scripts/extract_dom.py`: extrator PyMuPDF atual. `packages/ingest` contém ingester TypeScript para Payload, não o extrator PDF atual. `packages/schema` é um schema Zod compartilhado/alvo, não a origem direta dos DOMs carregados pelo viewer. `apps/api` tem schema Drizzle legado e não é o backend ativo do fluxo observado.
- `ARCHITECTURE.md` se descreve como visão-alvo. `docs/PROJECT_STRUCTURE.md` está defasado: menciona `packages/ingest/extract_pdf.py`/`build_dom.ts`, fluxo de ingestão e só 10 páginas, incompatíveis com os arquivos/código atuais.

## Fluxo atual dos dados

1. O PDF é fonte de referência visual. O `scripts/extract_dom.py` lê os blocos do PyMuPDF e escreve JSON de página.
2. `App.tsx` carrega o JSON e a arte de fundo; a página 2 também carrega `layout_frames.json`. As imagens extraídas no JSON não são passadas no fluxo atual do viewer (`images: []`).
3. `PageRenderer.tsx` posiciona as linhas originais de forma absoluta. A chave de edição é `page_${pageNumber}_block_${blockIdx}`, portanto depende do índice do bloco no array. Se houver tradução, substitui o bloco por uma `.realbox` fluida usando moldura lateral se disponível, senão largura derivada da linha/caixa atual.
4. O editor de texto rico permite estilo por seleção, mas o comando “Edit Text” substitui todos os segmentos por um segmento com o estilo da ferramenta atual. Logo, edição textual direta de um crédito misto pode perder negrito/regular.
5. O override local é separado por idioma em `middara-lines-v2-${lang}`. O servidor é carregado e mesclado sobre os valores locais para chaves duplicadas. Salvamento atualiza a cópia local antes de tentar Payload; falha de servidor mantém o rascunho local. Payload hoje declara `spanKey` globalmente único apesar de armazenar `language` em campo separado.
6. O código atual de hyperlink do sumário da página 3 emparelha linhas numéricas e demais linhas pelo centro Y com tolerância `<5pt`; o relatório de amostra mais recente propõe emparelhar entradas pelo baseline com evidência melhor. O app não consome ainda as unidades de auditoria propostas.

## O que está provado, aprovado e pendente

### Aprovado visualmente pelo usuário

- O piloto de moldura da caixa de diálogo na página 2: o texto traduzido usa largura mais ampla de aproximadamente `585.63 pt`, e o contorno azul continua marcando a tinta original enquanto o editor está ativo.
- O ajuste de scroll horizontal do viewer em zoom.
- O usuário esclareceu nesta tarefa que a branch de trabalho estar à frente de `master` é intencional.

### Evidência de auditoria, ainda sem ativação no app

- `scripts/audit_layout_sample.py` e `scripts/audit_translation_key_impact.py` produzem resultados read-only de amostra; não reescrevem os DOMs de produção nem ativam unidades novas.
- Página 2: 17 categorias potenciais de créditos em três colunas, reconhecidas por rótulos em negrito terminados em `:`; os runs originais foram preservados no modelo de auditoria.
- Página 3: 39 rótulos e referências pareados por baseline; “Summary of Components” aponta para 4 e “Choosing a Game Mode” para 8; líderes são arte vetorial.
- Página 101: 197 linhas em 3 colunas (74/74/49), 192 referências numéricas identificadas e um caso `Values`/`Back` para revisão manual.
- As 253 unidades candidatas mapeiam a 46 chaves atuais; 11 chaves têm fanout. Um snapshot local de DB tinha zero correspondências entre as chaves amostradas, mas isso não diz nada sobre rascunhos no navegador nem outros ambientes.

### Ainda não provado

- Os candidatos semânticos não são a extração/serialização de produção nem foram visualmente validados no app.
- A página 2 ainda precisa de prova integrada de uma categoria de crédito com label em negrito e corpo regular, sem alterar vizinhas e sem encobrir uma tradução legada combinada.
- Rascunhos reais no navegador permanecem desconhecidos; a falha anterior de acesso do browser não justifica inferir que estejam ausentes.
- IDs estáveis e esquema de chave que respeite idiomas/Payload ainda precisam ser definidos antes de ativar novas unidades ou migrar conteúdo.
- A heurística do extrator atual é inadequada para lote sem nova auditoria: usa o índice de enumeração dos blocos do `dict` como proxy de z-order, não `get_bboxlog()`; associa `availableX/availableWidth` à união das caixas de tinta; faz merge por gap vertical e sobreposição X, sem critérios semânticos suficientes; e o script contém caminhos absolutos para PDF e saída.

## Estado Git observado

Na inspeção, `fix/pixel-render/overflow` e `origin/fix/pixel-render/overflow` estavam em `a57f2de`; `master` e `origin/master`, em `f7e89ab`. O usuário esclareceu que a branch de trabalho na frente é intencional. Registrei os ponteiros para o próximo agente, mas não alterei branch, commit ou push.

## Arquivos/documentos alterados nesta tarefa

- `docs/project-progress/2026-09-30-project-readthrough.md` — este relatório de entendimento.
- `docs/project-progress/README.md` — entrada do relatório.
- `docs/project-progress/CONTINUE-HERE.md` — corrigido para descrever implementação e refs observadas, com avisos contra documentação estrutural defasada.
- `icebox/2026-09-30-stale-handoff-before-project-readthrough/CONTINUE-HERE.md` e `README.md` — cópia anterior e razão para arquivamento.
- `icebox/README.md` — índice do item arquivado.

Nenhum arquivo de código, JSON de produção, saída de extração, banco de dados ou rascunho foi modificado.

## Verificação e limitações

- Confirmada contagem de 102 arquivos `*_dom.json`.
- Confirmados via Git os commits de branch/refs indicados acima.
- Revisadas as rotas-chave em `PageRenderer.tsx`, `RichSpanEditor.tsx`, `App.tsx`, config/collection Payload e `scripts/extract_dom.py`.
- `git diff --check` foi executado e passou; nenhum build ou teste foi executado porque não houve mudança de app e o pedido foi leitura/entendimento.
- A inspeção não substitui QA visual, leitura de todos os 102 JSONs, auditoria de traduções no navegador ou revisão completa de cada regra antiga.

## Próxima ação recomendada

Fazer prova integrada de **uma** categoria de crédito da página 2. Primeiro tratar a compatibilidade com a chave legada combinada e definir chave que inclua idioma ou outra estratégia compatível com a unicidade do Payload. Preservar runs de estilo e valor legado; se houver override legado, manter esse caminho visível até decisão explícita. Depois construir/abrir a unidade piloto no app e validar a categoria e suas vizinhas contra o PDF antes de ampliar para sumário, índice ou lote de páginas.
