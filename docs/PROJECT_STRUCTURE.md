# Estrutura do repositório

**Status:** índice curto; os contratos atuais estão em [`docs/README.md`](README.md) e [`docs/architecture/overview.md`](architecture/overview.md).

| Caminho | Papel atual |
|---|---|
| `apps/web/` | Viewer/editor React + Vite e renderer do livro. |
| `apps/web/public/pages/page_NNN/` | DOM JSON, imagens e sidecars de geometria, símbolos, estruturas e overlays por página. |
| `apps/admin/` | Payload CMS/Next.js, API e SQLite local para traduções. O `apps/admin/AGENTS.md` contém instruções geradas do Next.js. |
| `scripts/` | Extração PyMuPDF, preparação de assets, auditoria e export. Confirme cada script antes de executá-lo em lote. |
| `docs/architecture/` | Contratos atuais, ADRs e modelo de dados. |
| `docs/project-progress/` | Registros datados e evidências de aceitação; status é limitado ao escopo de cada registro. |
| `.agents/rules/`, `.agents/skills/` | Regras e workflows ativos; a tabela de status nos respectivos READMEs é normativa. |
| `icebox/` | Snapshots/histórico preservado; não é a arquitetura de produção. |

## Fluxo local

`npm run dev` usa `scripts/dev.mjs` para iniciar viewer e Payload. O Vite normalmente usa `localhost:8080` e Payload `localhost:3000`, mas confira o badge/saída da sessão em vez de presumir porta, API ou locale. Preserve `apps/admin/apps-admin.db` e arquivos locais de dados.

## História de arquitetura

Documentos antigos referem `packages/ingest`, um schema Zod e `docs/architecture_v3_constraints.md`. Esses caminhos não descrevem a árvore atual; o link v3 não existe. Consulte [`documentation-dispositions.md`](history/documentation-dispositions.md) antes de usar qualquer procedimento antigo.
