# PdfCraft inspired — ideias úteis para o Middara

Esta pasta guarda apenas adaptações que podem melhorar o Middara Rulebook App. Ela não contém código, assets ou cópias do PdfCraft. A pesquisa foi feita por leitura pública do repositório e de sua documentação, sem clonar ou baixar o projeto.

## Resultado da pesquisa

O PdfCraft é uma implementação *clean-room* orientada pelo padrão PDF, documentação pública e observação de comportamento. O próprio projeto informa que ainda usa o `hayro` para desenhar páginas enquanto desenvolve um renderer próprio e que ainda não fez uma comparação visual lado a lado com o Acrobat. Portanto, a parte que nos serve é o método de validação e de engenharia de evidências, não uma troca imediata de renderer.

Fontes primárias consultadas:

- [README do PdfCraft](https://github.com/storytold/pdfcraft/blob/main/README.md)
- [Avaliação de paridade com Acrobat Pro](https://github.com/storytold/pdfcraft/blob/main/docs/target-app-parity.md)
- [Gaps priorizados](https://github.com/storytold/pdfcraft/blob/main/docs/gaps.md)
- [Roadmap](https://github.com/storytold/pdfcraft/blob/main/docs/roadmap.md)
- [Regras públicas de contribuição e clean-room](https://github.com/storytold/pdfcraft/blob/main/AGENTS.md)

## Arquivos

- [`01-pesquisa-aplicada.md`](01-pesquisa-aplicada.md): o que foi observado e como isso se traduz para os problemas atuais do Middara.
- [`02-harness-de-fidelidade.md`](02-harness-de-fidelidade.md): desenho de um harness pequeno, baseado nos scripts e evidências que já existem.
- [`03-backlog-priorizado.md`](03-backlog-priorizado.md): ações ordenadas por utilidade, custo e risco, incluindo o que não deve ser perseguido agora.
- [`caso-de-fidelidade-template.md`](caso-de-fidelidade-template.md): template para registrar um caso fonte → viewer → export.

## Limite de uso

As propostas desta pasta não mudam regras ativas do projeto. Continuam valendo o PDF oficial como verdade geométrica e visual, a distinção entre texto fonte e texto traduzido, a classificação conservadora de ghosts e a exigência de validar viewer e export separadamente.

