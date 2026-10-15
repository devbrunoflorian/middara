# Estado atual do projeto

**Atualizado:** 2026-10-15.

## Atualização corrente — ativações técnicas e propostas (15/10/2026)

- **p.83:** `p083-i3` e `p083-v93` estão ativos no sidecar canônico. O sidecar contém exatamente esses dois placements e tem SHA-256 `23b0e8537465c849da8a9740e6a22b7050165a4b31acbf8e68311c6d41221284`; os quatro assets correspondem aos hashes do receipt. Viewer normal, Editor Admin e PDF EN isolado foram conferidos. A diferença preexistente de cor nos dígitos 3–6 de `FINAL SPAWNS` permanece separada; rollback exato continua disponível. Ver [relatório do piloto p.83](project-progress/2026-10-15-p83-pilot-browser-verification.md).
- **p.45:** 11 placements já existentes no inventário v22 foram ativados em um lote canônico restrito; os cinco elementos preexistentes do sidecar foram preservados. O sidecar resultante tem SHA-256 `55fb18cab2dbaac597918903001b32c5ee139b61c964d9322bc6c76cc84b08fc`; 22 assets correspondem ao receipt, o dry-run repetido foi idempotente e rollback exato está disponível. O lote está no commit `a24223f`. A página continua estruturalmente parcial, com o caso `p045-v126-129-n4`, texto de card em EN e colisões de `Defense Value` separados. Ver [closeout p.45](project-progress/2026-10-15-p045-symbol-activation-closeout.md).
- **p.47:** seis unidades propostas (`page_47_block_0`, `_1`, `_10`, `_11`, `_20` e `_21`) foram verificadas em snapshots/PDFs isolados; os dois títulos, o parágrafo introdutório, o bloco de custo de SP e o callout TIP cabem nos frames fonte. `Stamina Point → Ponto de Vigor` e outros termos mecânicos aguardam revisão humana. A página continua parcial: listas, regras em bullets e textos de componentes permanecem em EN. Ver [propostas](translations/proposals/page-047-basic-rules-and-stamina-proposal-2026-10-15.md) e [relatório de copyfit](project-progress/2026-10-15-page47-basic-rules-and-stamina-copyfit.md).
- Dos 111 placements preparados no v22, os dois da p.83 e os 11 da p.45 são os lotes descritos acima; não houve outra ativação canônica nesta atualização. Nenhum Payload ou tradução humana foi escrito. O rollback dos dois lotes permanece disponível.
- Não liberar outro lote de símbolos antes da avaliação humana do piloto p.83. Propostas de tradução em unidades estruturalmente elegíveis podem continuar isoladas, sem escrita no Payload.

## Checkpoint v22 — estado histórico de 2026-10-14

### Resumo do checkpoint v22

- O fechamento v22 conclui somente os dois dados p.96 existentes no inventário; não roda nova varredura nem inicia sequência automática de provas. Permanecem 111 placements preparados: **88 READY** (86 individuais e 2 dependentes do mesmo frame EN `page_96_block_11`), **3 aguardando aceite estético humano** na p.92, **2 pendentes técnicos** (`p049-v159-162-n4`, `p076-v335-338-n4`) e **18 bloqueados**. Há 91 identidades/slots confirmados. Os IDs p.96 que passam a READY são `p096-v230-233-n4` (com frame) e `p096-v239-242-n4` (individual); `p096-v237-238-n2` também requer o mesmo frame.
- Contagens reconciliadas: 116 detecções de glifos-fonte sem associação não equivalem a placements; 80 candidatos iniciais + 37 reconciliados = 117 possibilidades; seis casos de composição especial foram excluídos, restando 111 patches preparados. Os 111 foram aplicados apenas em dry-run isolado e revertidos; zero aplicação canônica. As cinco candidatas experimentais p.85/p.92 já estão dentro dos 111.
- Prontidão estrutural está separada de prontidão de símbolos. Defeitos confirmados permanecem em p.53, 64, 65, 67, 68, 74 e 76. P.97 tem agrupamento editável sem defeito confirmado; p.100 mantém Note raster/tabela inconclusiva; p.102 aguarda auditoria de página apesar de placements e unidades já revisados. O scanner 277 é uma fila de revisão por classe, não 277 erros.
- A seleção recomendada para primeira ativação controlada é `p083-i3` + `p083-v93`. Há seleção, diff exato da entrada p.83 do dry-run existente e precondições atuais em [recommended-first-activation-v22](../output/proofs/translation-readiness-2026-10-14/recommended-first-activation-v22.json). Ainda é necessário rodar dry-run atualizado dos dois IDs e obter autorização expressa antes de qualquer gravação canônica.
- Consulte [ledger v22](../output/proofs/translation-readiness-2026-10-14/readiness-ledger-v22.md), [relatório v22](../output/proofs/translation-readiness-2026-10-14/v22-report.md), [recibo de hashes](../output/proofs/translation-readiness-2026-10-14/hash-verification-v22.json), [revisão final](../output/proofs/translation-readiness-2026-10-14/final-review-v22.json) e [validação v22](../output/proofs/translation-readiness-2026-10-14/validation-v22.json). O v22 não alterou código do aplicativo e não repetiu a suíte: permanecem os resultados v21 (50/50 focados; Web 208 passou, 2 ignorados, zero falhas; p.41 passou; build/TypeScript e Oxlint passaram com avisos). Admin E2E segue sem execução por fixtures que escrevem no Payload; ESLint Admin mantém erro circular; a suíte inteira não está aprovada.
- Nenhum Payload, sidecar canônico, tradução humana ou PDF fonte foi alterado. Não houve commit nem push.

## Estado anterior documentado

## Estado oficial

- **EDITOR READY WITH KNOWN NON-BLOCKING ISSUES.** O editor passou pelos testes e fluxos manuais registrados; limitações conhecidas estão abaixo.
- **MANUAL TRANSLATION WORKFLOW = COMPLETE.** O fluxo continua disponível no Admin/RichSpanEditor; 13 registros locais ainda não sincronizados foram preservados, sem alteração nesta tarefa.
- **TRANSLATION-FIRST / MAINTENANCE MODE, COM PILOTO p.83 VERIFICADO.** Os dois placements autorizados passaram pelo Viewer, Editor e PDF isolado. Aguardamos avaliação humana antes de ativar outro lote; os bloqueios estruturais permanecem em fila separada.
- **GLOBAL EN AUDIT 49–102 = COMPLETE WITH DOCUMENTED INCONCLUSIVE HOLDOUTS.** Esse fechamento é distinto da prontidão de tradução v22. O ledger de símbolos atual tem 88 READY (dois dependem do frame p.96), 3 aceites estéticos, 2 pendentes técnicos e 18 bloqueados. Sete páginas têm defeitos estruturais confirmados ainda abertos (53, 64, 65, 67, 68, 74 e 76); p.97, p.100 e p.102 ficam claramente identificadas como revisão/escopo pendente sem inventar correção.
- **FULL PT-BR VISUAL PDF EXPORT = COMPLETE AND TECHNICALLY VERIFIED.** O job `8fa1a1f8-777a-4846-b9bc-321eae2133a9` gerou e verificou 102/102 páginas. O PDF e suas evidências permanecem preservados para revisão do usuário. Isso não certifica fidelidade visual integral contra a fonte, editabilidade no Acrobat ou prontidão para gráfica.
- A revisão v22 separa propostas editoriais permitidas em unidades de famílias validadas dos bloqueios de página. O piloto canônico p.83 foi concluído para os dois IDs autorizados; não avançar para outro lote antes da avaliação humana.
- Conteúdo e traduções aprovados das páginas 1–12 permanecem intocados.

## O que está implementado e aceito

- Viewer React/Vite, Admin/Payload/SQLite, edição rica e overrides por locale.
- Separação entre geometria SOURCE para texto EN intacto e fluxo refluído para texto editado/traduzido.
- Identidade estável EN ↔ PT-BR por unidade editorial; famílias aceitas incluem parágrafos, Examples, Notes, heading/body, labels, bullets e hierarquias nos escopos documentados.
- Estado do editor para `HERDANDO EN`, `PT-BR OVERRIDE SALVO`, `PT-BR ALTERADO NA SESSÃO / NÃO SALVO` e `CARREGANDO ESTADO…`.
- Contexto read-only de tradução com texto EN e correspondências literais do glossário aprovado.
- Paleta Admin de símbolos, régua e editor de molduras; a seleção de frames para unidades tipográficas da p. 13 foi corrigida. O antigo incidente de Reset foi esclarecido como confirmação aguardando resposta, sem bug reproduzido.
- Correção da ordem de Hooks da p. 40 e correções de geometria/símbolos descritas no fechamento da auditoria EN.

Os detalhes e limites das validações permanecem nos [registros de progresso](project-progress/README.md), nos [ADRs](architecture/decisions/README.md) e no [guia do workflow manual](translations/manual-editor-workflow.md).

## Limitações conhecidas e limites da prontidão integral

- **P. 97:** algumas células agrupam vários parágrafos/list items num campo editável; continuam editáveis e salváveis como célula. Avaliar segmentação somente quando o trabalho real nessa página mostrar necessidade. Ver [auditoria de confiabilidade](project-progress/2026-10-09-editor-reliability-audit.md).
- **P. 84 e Note de tabela/raster p. 100:** o holdout global `INCONCLUSIVE / PRESERVED` segue distinto. O placement `p084-v185` está READY técnico após prova v9 em posição original, export isolado, vazio/movido e Cancel. O relatório mantém a limitação de que dois IDs de image XObject não relacionados mudaram para imagens inline apenas na experiência descartável em memória; a comparação raster fora da máscara foi zero e o PDF fonte não foi escrito. A ocorrência independente `action.exhaust` da p. 100 foi corrigida.
- **Páginas 1–48:** há revisões de escopos diferentes, não uma certificação global uniforme. Isso não impede a tradução manual atual.
- **Export:** o serviço assíncrono visual e o job 1–102 estão tecnicamente validados. A revisão visual final do usuário continua pendente. O piloto de impressão não equivale a PDF de gráfica, e Acrobat Pro ainda não foi usado para comprovar edição/salvamento/reabertura.
- O salvamento confirmado no Payload é a cópia sincronizada. O navegador mantém fallback local de traduções e molduras se a sincronização falhar; drafts ainda não salvos são estado de sessão. Consultar o toast do editor e o guia de workflow.

## Próximo passo seguro

Aguardar tua avaliação do piloto p.83 antes de ativar outros placements. Em paralelo, continuar preparando propostas de tradução para famílias editorialmente estruturadas, sem escrever no Payload nem substituir traduções humanas. Manter os 109 placements restantes, os seis casos especiais e os bloqueios estruturais nas filas próprias; não declarar prontidão integral do PDF enquanto os holdouts não forem resolvidos.

## Invariantes

- O PDF original é a referência de conteúdo EN e geometria fonte.
- Não alterar páginas 1–12, traduções existentes, Payload, sidecars ou geometria SOURCE sem escopo explícito.
- IDs persistentes representam unidades editoriais, não linhas físicas.
- Candidatos geométricos são evidência, não bugs nem correções automáticas.
- Viewer, persistência e export são verificações distintas; não declarar o livro inteiro aprovado a partir de uma amostra.
