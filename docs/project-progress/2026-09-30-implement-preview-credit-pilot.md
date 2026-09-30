# Tarefa: corrigir preview sem alteração e pilotar campos de crédito

- **Status:** piloto implementado e conferido no frontend da página 2; gravação no Payload e persistência após reload ainda não verificadas (API não estava em execução).
- **Data:** 2026-09-30.
- **Branch:** `fix/pixel-render/overflow` (o usuário confirmou que estar à frente de `master` é intencional).
- **Escopo aprovado:** corrigir a mudança visual ao abrir/cancelar o editor; adicionar piloto com label e body de “Playtesters” como alvos separados; preservar o renderer legado quando já existir override antigo; validar sem alterar a extração das 102 páginas nem apagar rascunhos.

## Método

1. Reconfirmar instruções de fidelidade/granularidade, o diagnóstico anterior e arquivos afetados; consultar guidance moderna de React conforme `.agents/skills/modern-web-guidance`.
2. Implementar o primeiro passo isolado, testar build e comportamento de no-op.
3. Implementar a amostra de crédito em sidecar/additivo, sem reescrever `page_002_dom.json` ou executar `extract_dom.py`.
4. Testar localmente: página 2, idioma explícito, hit targets independentes, fallback de chave antiga, digitação/cancelar/salvar/recarregar; comparar com PDF quando ferramenta permitida.
5. Conferir a implementação no browser do projeto, comparando página e unidades com o PDF. Documentar correções e parar antes de generalizar para outras categorias/páginas.

## Segurança e preservação

- Não ler/exportar conteúdo de drafts do navegador nem migrar/deletar dados.
- IDs novos devem ser estáveis e seguros entre idiomas sob a unicidade global atual de Payload.
- Chave legada da categoria permanece intacta e ativa se já tiver override.
- Só modificar arquivos que realmente precisam; se substituir material ativo, arquivar versão anterior no `icebox/` com razão.

## Critérios de aceite

- Abrir e cancelar o primeiro parágrafo sem modificar seu visual original.
- O preview só troca para reflow após edição real, mantendo estilo, alinhamento e entrelinha do piloto.
- Clicar no rótulo `Playtesters:` abre só label; clicar nos nomes abre só body.
- O legado não sobrepõe as novas unidades; salvar é por idioma, conserva metadados de layout e sobrevive ao reload.
- Build/lint/checks relevantes passam; comparação visual reporta limites claramente.

## Progresso

## Implementação entregue

- O editor agora mantém as linhas/spans originais no canvas até ocorrer uma mudança real de conteúdo/formatação/alinhamento. Abrir e fechar sem editar não cria `.realbox`; confirmar texto idêntico não achata os runs existentes.
- Para o primeiro parágrafo narrativo (`block_12`), o sidecar `layout_frames.json` agora registra frame centralizado baseado nos `availableX/availableWidth` existentes e `lineHeight: 1.135`, consistente com 14.755 pt de distância entre linhas e fonte de 13 pt. A moldura anterior do diálogo (`block_21`) foi preservada e sua versão anterior foi arquivada no icebox.
- Adicionado `credit_units.json` para pilotar só `Playtesters` (`block_40`), com caixas-filha `label` e `body` mantendo a linhagem de `line_40_0` e `line_40_1..10` respectivamente. Têm chaves novas estáveis e separadas por idioma (`page_2_credit_playtesters_label__en`, `...body__en`, equivalentes PT). Se houver o override combinado legado `page_2_block_17`, o renderer antigo segue ativo e o split não é exibido.
- `data` do Payload agora pode ser lido tanto no formato legado (array de segmentos) quanto no envelope versão 2 (`segments` e `textAlign`). O `textAlign` é persistido; nenhum registro de tradução foi criado, atualizado, apagado ou migrado nesta tarefa.
- A página 2 carrega o sidecar opcional de créditos. O PDF foi registrado como referência visual obrigatória em `.agents/rules/references/README.md`. O PDF original, de 117 MB, não foi duplicado no repositório; sua localização canônica está documentada.

## Verificação e correções

- `npm run build -w apps/web`: passou. Vite registrou aviso pré-existente de `/texture.png` não resolvido no build, mantido para resolução runtime.
- `npm run lint -w apps/web`: terminou com avisos, sem falhas. Há warnings existentes de `set-state-in-effect` em `App.tsx`, `FontEditor.tsx` e `RichSpanEditor.tsx`, além do warning de export em `PageRenderer.tsx`; não foram ampliados como objetivo desta tarefa.
- Browser QA no app: página 2 renderizada em modo admin; abrir o parágrafo sem editar manteve constante a contagem de `.realbox` (4 antes/depois), sem erros JS; abrir/fechar label e body apontou respectivamente para as duas chaves distintas; alteração temporária do texto mostrou a prévia no campo certo; rewrite e modal foram cancelados, sem salvar.
- Durante o QA, `localhost:8080` servia um transform antigo do `RichSpanEditor` com referência a `fullText` antes da declaração, causando erro ao abrir editor. Reiniciei Vite naquela porta e repeti o fluxo sem erro. O novo servidor `8081` usado para isolar o teste foi encerrado.
- O serviço Next/Payload já tinha um processo na porta 3000; não o encerrei. A API retorna HTTP 500 (`There was an error initializing Payload`), e o log do servidor aponta `DATABASE_URL` vazio para o adaptador SQLite. A tentativa de iniciar outro servidor foi recusada pelo Next por já existir um dev server. Não alterei `.env`, não escolhi um SQLite arbitrário e não escrevi no banco.
- A inspeção SQLite foi somente leitura: `apps-admin.db` contém a tabela CMS `translations` com colunas `span_key/language/data` e 7 registros; nenhuma das quatro chaves novas do piloto existe. `middara.db` contém outro modelo (`unit_id`, `translations_runs`) e não é a tabela usada pelo endpoint Payload atual. `apps-admin.db` é candidato provável, mas não alterei a configuração nem assumi que o processo deve usar esse arquivo.
- Por causa do erro de inicialização do Payload, não cliquei Save nem Reset para persistir teste, e não toquei no localStorage do usuário. O carregamento/salvamento após reload segue como pendência explícita.
- Visualmente, renderizei a página 2 do PDF original com PyMuPDF e comparei com o app no browser na mesma página: hierarquia, alinhamento central dos parágrafos e composição dos créditos coincidem visualmente no piloto. O browser bloqueou `file://`; a inspeção do PDF foi feita localmente pelo fluxo seguro do skill PDF. Não executei comparação pixel a pixel, e isso não prova equivalência em outras páginas nem ao traduzir conteúdo longo.
- O PNG temporário gerado para essa comparação ficou em `C:\Users\bruno\AppData\Local\Temp\middara-page-2-reference.png`. Tentei removê-lo ao encerrar; o comando de remoção foi rejeitado pela política do terminal, então o arquivo temporário ainda existe fora do repositório. Não tentei contornar a rejeição.

## Próximo passo

Antes de generalizar o modelo para outros créditos, confirmar se `apps-admin.db` é o destino pretendido pelo `.env` do servidor ativo; só então configurar `DATABASE_URL` com esse caminho conhecido e iniciar uma verificação de persistência isolada, sem sobrescrever qualquer rascunho existente. Não preencher a variável com um novo arquivo SQLite por palpite. Depois, comparar a tradução salva/recarregada no mesmo idioma. Nenhum lote do extrator foi executado.

## Correção posterior (2026-09-30)

O bloqueio de persistência foi posteriormente resolvido: o `.env` local apontava `DATABASE_URI` para o banco legado, enquanto o Payload espera `DATABASE_URL`. O app agora usa o banco existente compatível `apps-admin.db`; a API passou pelo ciclo CRUD com uma chave descartável, depois removida. Os dois registros PT de linha do banco legado foram preservados, sem migração. Veja [`2026-09-30-payload-save-reset-safety.md`](2026-09-30-payload-save-reset-safety.md). A leitura/escrita pelo browser real segue sem QA automatizado por causa de preferência local que bloqueia o acesso do agente.
