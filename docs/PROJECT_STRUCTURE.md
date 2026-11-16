# Estrutura do projeto

| Caminho | O que tem ali |
|---|---|
| `apps/web/` | Viewer, editor e renderer do livro. |
| `apps/web/public/pages/page_NNN/` | Extração de texto e sidecars de geometria, símbolos e overlays por página. |
| `apps/admin/` | Payload CMS, API e banco SQLite local. |
| `scripts/` | Ferramentas para extração, revisão de layout e exportação de PDF. |
| `docs/architecture/` | Como os dados, as páginas e os símbolos se conectam. |
| `docs/translations/` | Glossário, fluxo manual, materiais por página e status de revisão. |
| `docs/QA/` | Critérios para comparar o Viewer e o PDF ao original. |
| `ROADMAP/` | Ideias e melhorias futuras para o app. |

## Rodar localmente

Use `npm run dev` na raiz. O banco Payload fica no SQLite local e não é publicado pelo Git; preserve esse arquivo ao reinstalar dependências ou trocar de branch.

O documento [`../README.md`](../README.md) mostra os comandos de início. O mapa da documentação fica em [`README.md`](README.md).
