# Triagem estendida por amostragem: páginas 3, 6, 15, 24 e 101

- **Status:** em andamento; preparar evidência independente antes de pedir novos screenshots.
- **Data:** 2026-09-30.
- **Objetivo:** ampliar o método de fidelidade inglesa para amostras que cobrem índice de conteúdo, página textual, pictogramas/fontes, layout ilustrado e índice multi-coluna sem presumir que os defeitos da página 2 ou 4 se repetem.
- **Método:** comparar PDF original, DOM JSON e renderização/filtros existentes apenas nas cinco páginas indicadas; levantar candidatos específicos (bbox, família, peso, PUA, sobreposição e presença na arte de fundo). Fazer alterações somente após evidência de defeito e registrar o menor escopo. Não rodar o extrator em lote.
- **Critério de conclusão:** entregar tabela por página com evidência/referência e decisão `confirmado`, `descartado` ou `aguarda captura`; solicitar screenshots de app só para casos que não possam ser resolvidos por comparação estática e prova da imagem de fundo.
- **Limites:** screenshot parcial não aprova uma página inteira. JSON/span compatível não prova fidelidade final do browser. Sem alterações ao banco, conteúdo traduzido ou migração nesta etapa.

## Registro

Iniciado após comparação dos screenshots do usuário nas páginas 4 e 13. Os detalhes do piloto anterior estão em [`2026-09-30-page4-13-visual-review-and-initial-zoom.md`](2026-09-30-page4-13-visual-review-and-initial-zoom.md).

### Triagem estática inicial

| Página | Evidência | Decisão / pendência |
|---|---|---|
| 3 | PDF/JSON: 82 spans, sem divergência; página de Contents, líderes são desenho/linhas do PDF; bloco de texto das entradas continua separado do título. | Sem defeito de extração confirmado. Ainda não há captura do app, então a fidelidade final da página não está aprovada. |
| 6 | PDF/JSON: 322 spans, sem divergência; sete `EsmeraldaPro-Identity-H` foram extraídos como `?` em cartas pretas. O crop do PDF mostra pontos de interrogação brancos. O crop do `background.webp` mostra os mesmos cartões pretos, mas sem os `?`, portanto esses spans são conteúdo legítimo necessário, não ghosts. | Manter os spans. A forma tipográfica do `?` no browser precisa de captura do app; a arte do fundo não duplica o glifo. |
| 15 | PDF/JSON: 132 spans, sem divergência; o span `Wingdings3 U+F075` após `CONTINUED` está em linha/bloco marcados `suspectedGhost`. A referência mostra um triângulo preto sólido após a palavra; o recorte de `background.webp` não contém esse marcador. O renderer também filtra Wingdings3. | Defeito provável e concreto: candidato legítimo ocultado pelo sinal de ghost e pela falta de Wingdings3 local. Não corrigir por aproximação antes de capturar o app/confirmar a posição; investigar um render fiel específico. |
| 24 | PDF/JSON: 222 spans, sem divergência; os quatro PUA são `Webdings U+F07E`, o mesmo glyph com trace vermelho/branco confirmado pela página 13. | A regra estreita já validada em 13 cobre a classe do glyph; sem indício novo para ampliar. |
| 101 | PDF/JSON: 995 spans, sem divergência; três grandes blocos correspondem às colunas x≈86–297, 306–517 e 526–736; a imagem de referência mantém as três colunas e os alinhamentos de termos/números. | Nenhuma fusão entre colunas foi observada nos dados. Tabulação e alinhamento do browser ainda exigem captura do app em Fit to Screen. |

### Alteração de zoom e verificações

- `apps/web/src/App.tsx` inicia `zoomLevel` em 2 (200% relativo à escala calculada para caber) e mantém o botão `Fit to Screen` em 1 (100%).
- Build passou; lint terminou sem erros e com sete warnings preexistentes; `git diff --check` passou antes das últimas atualizações exclusivamente documentais. Frontend respondeu HTTP 200.
- As imagens de referência intermediárias estão em `tmp/extended-fidelity-source/` e os crops do estudo de página 6 em `tmp/`; são artefatos transitórios ignorados, não dados de produção.
- A skill de fantasmas .agents/rules/07 foi consultada. A regra não deve esconder um span só por estar dentro de arte ilustrada: o `?` da página 6 é legítimo, e o `U+F075` da página 15 é visível no PDF apesar do flag. Registrar a página 15 como falso positivo é apropriado; nenhuma heurística/extrator foi editado.

### Próxima evidência necessária

Solicitar capturas do app em inglês das páginas 6 e 15 e do índice 101, depois de atualizar o frontend. Uma captura inicial da página 15 com o controle de zoom visível deve confirmar 200%; para comparar página inteira nas páginas 6 e 101, usar Fit to Screen (100%). Página 15 pode mostrar o triângulo ausente; essa é a correção potencialmente compartilhada mais relevante encontrada nesta amostra.

## Próximo passo

Concluir o piloto visual limitado com as capturas indicadas acima. Não aprovar páginas inteiras nem expandir substituição de glifos até registrar o resultado.
