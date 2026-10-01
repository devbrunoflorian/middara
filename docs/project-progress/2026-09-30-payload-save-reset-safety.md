# Tarefa: destravar salvamento e proteger rascunhos PT

- **Status:** persistência corrigida e exercitada via API; confirmação PT implementada; falta QA visual do editor no browser.
- **Data:** 2026-09-30.
- **Branch:** `fix/pixel-render/overflow`.
- **Objetivo:** retomar tradução funcional com persistência Payload e reduzir risco de descarte acidental no editor PT.

## Método e limites

1. Confirmar regras/handoff e inspecionar `.env`, configuração Payload e SQLite sem exibir credenciais nem conteúdo traduzido.
2. Distinguir o banco legado do banco com schema atual. Preservar ambos; não executar migração de traduções sem mapeamento semântico exato.
3. Fazer o Payload usar o arquivo SQLite compatível já existente, validar API e ciclo criar/ler/atualizar/remover somente com uma chave de teste nova.
4. Adicionar confirmação no Reset em PT e ao fechar o RichSpanEditor PT com alterações não salvas. EN e fechamento sem alterações devem manter o comportamento atual.
5. Rodar verificações dirigidas e documentar evidências/correções; manter a documentação de handoff coerente.

## Evidência inicial

- `payload.config.ts` lê `DATABASE_URL`; o `.env` local declara `DATABASE_URI=file:./middara.db`.
- `middara.db` é o arquivo legado, rastreado, com schema `translations_runs/unit_id` e dois registros `pt-BR` de página 2 (IDs antigos baseados em bbox). Ele não será alterado nem apontado ao Payload atual.
- `apps-admin.db` é ignorado pelo Git e tem schema atual do Payload (`span_key/language/data`) e sete registros `en`. As chaves foram inspecionadas sem ler o texto dos segmentos.
- Os dois registros legados podem representar segmentos de uma mesma unidade maior; não serão achatados nem descartados automaticamente. Continuam recuperáveis no SQLite original.
- O editor atualmente chama `onSave(null)` imediatamente no Reset e fecha diretamente pelo botão X/backdrop; não há confirmação específica para PT.

## Progresso

- [x] Ler o handoff, regras 06/13, relatório do piloto e checkpoint de recuperação do Payload.
- [x] Identificar a incompatibilidade do `.env` com o adaptador e confirmar schemas/contagens dos dois DBs em modo somente leitura.
- [x] Selecionar o DB atual, conectar Payload e validar persistência com chave temporária nova.
- [x] Adicionar confirmação de reset, fechamento e troca de bloco com alterações pendentes em PT.
- [ ] Fazer QA visual do prompt de confirmação no editor.
- [x] Verificar, documentar limites e atualizar handoff/índice.

## Verificação

A API será consultada sem solicitar conteúdo textual dos registros. A chave temporária será nova e removida após o ciclo; a confirmação de remoção será feita por chave+idioma. O teste do editor deve demonstrar que cancelar a confirmação mantém o rascunho visível e confirmar o reset executa a remoção esperada. Build/lint dirigidos serão executados nos arquivos alterados.

## Próximo passo

Pedir ao usuário que confira o prompt nativo no próprio browser (acesso automatizado à origem local está bloqueado por preferência salva). Depois, seguir para separar semanticamente as outras categorias dos créditos da página 2.

## Resultado / correção de rumo

- `.env` local agora configura `DATABASE_URL=file:./apps-admin.db`, que é o banco existente com o schema corrente. As credenciais foram preservadas e nunca foram impressas. O `DATABASE_URI` antigo apontava para `middara.db`, cujo schema é legado; o Payload não foi apontado para ele.
- O `middara.db` contém dois registros `pt-BR` antigos, em `pg002_x139y184_w549h16_dc683396` e `pg002_x175y199_w477h16_f68fffcb`. As bboxes caem nas linhas 4 e 5 do bloco narrativo 12. Mantive o arquivo original e não tentei converter dois trechos de linha numa tradução de bloco; esse é o risco de rascunho que o usuário aceita reconstruir se precisar.
- Payload iniciou via `npm run dev -w apps/admin`; `GET /api/translations?limit=1` retornou HTTP 200 tanto por `127.0.0.1` quanto pelo hostname `localhost` que o frontend usa.
- Teste API isolado: `POST` criou chave temporária PT (ID 8); `GET` encontrou-a; `PATCH` atualizou segmento/alinhamento; `DELETE` removeu; verificação final encontrou zero linhas para a chave temporária. Não foi lido nem alterado conteúdo dos sete registros EN existentes.
- `RichSpanEditor` agora pede confirmação antes de Reset PT; também pergunta ao fechar por X/backdrop com mudanças não salvas. `PageRenderer` pergunta se o usuário troca para outro bloco com um rascunho PT não salvo. EN e PT sem mudanças não são interrompidos.
- Havia um `pnpm install` automático inesperado ao iniciar via PNPM 11. Ele criou entradas placeholder de `allowBuilds` e um lockfile, depois falhou porque os scripts nativos não estavam aprovados. Preservei esses artefatos em `icebox/2026-09-30-pnpm-install-prompt-artifacts/` e restaurei `pnpm-workspace.yaml`; `npm run build -w apps/web` passou após os pacotes declarados ficarem disponíveis.
- `npm run lint -w apps/web` terminou sem erros. Permanecem avisos `set-state-in-effect` existentes e o warning de export do `PageRenderer`; nenhum é novo da confirmação ou da compensação de título.
- A tentativa de CUA no app em `127.0.0.1:8080` foi recusada por preferência de site salva. A instrução explícita do browser proíbe contornar por CDP/Playwright/outra superfície. Por isso, não alego QA visual do prompt nem do title fix.
