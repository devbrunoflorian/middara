# Middara Rulebook — projeto comunitário

Um app feito por fã para deixar o Rulebook 1.2 mais fácil de consultar, comparar com o original e traduzir para PT-BR. É um projeto independente, sem vínculo oficial com a editora.

O livro tem 102 páginas e a revisão segue em andamento. O status de cada página fica em [`docs/translations/page-status.csv`](docs/translations/page-status.csv); uma página marcada como parcial ainda precisa de revisão.

## Rodar o app

Na raiz do projeto:

```powershell
npm run dev
```

O comando inicia o Viewer em `http://127.0.0.1:8080/` e o Admin em `http://localhost:3000/admin`. Para iniciar só um deles, use `npm run dev:web` ou `npm run dev:api`.

## Comparação e tradução

O Viewer permite comparar a arte original (OG), o inglês e o PT-BR. A tradução é conferida junto ao PDF de referência, prestando atenção ao sentido, recuos, listas, símbolos, fontes, cores e copyfit. O guia [`docs/translations/common-layout-issues.md`](docs/translations/common-layout-issues.md) reúne correções já confirmadas para problemas recorrentes.

## Onde encontrar as coisas

- [`docs/README.md`](docs/README.md): mapa da documentação.
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md): resumo do estado atual.
- [`ROADMAP/README.md`](ROADMAP/README.md): próximos passos do app.
- [`docs/translations/README.md`](docs/translations/README.md): glossário, fluxo de tradução e materiais por página.

As traduções salvas no Payload ficam no banco SQLite local. Um push do Git atualiza o código e os documentos, mas não envia esse banco.
