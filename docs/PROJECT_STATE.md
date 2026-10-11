# Estado atual do projeto

**Atualizado:** 2026-10-11.

## Estado oficial

- **EDITOR READY WITH KNOWN NON-BLOCKING ISSUES.** O editor passou pelos testes e fluxos manuais registrados; limitações conhecidas estão abaixo.
- **MANUAL TRANSLATION WORKFLOW = COMPLETE.** O fluxo continua disponível no Admin/RichSpanEditor; 13 registros locais ainda não sincronizados foram preservados, sem alteração nesta tarefa.
- **TRANSLATION-FIRST / MAINTENANCE MODE.** Trabalhar em problemas concretos encontrados durante a tradução; não iniciar auditorias preventivas, tradução automática ou mudanças de conteúdo sem pedido.
- **GLOBAL EN AUDIT 49–102 = COMPLETE WITH DOCUMENTED INCONCLUSIVE HOLDOUTS.** P. 84 e Note raster/tabela p. 100 continuam inconclusivas e preservadas; não são defeitos confirmados.
- **FULL PT-BR VISUAL PDF EXPORT = COMPLETE AND TECHNICALLY VERIFIED.** O job `8fa1a1f8-777a-4846-b9bc-321eae2133a9` gerou e verificou 102/102 páginas. O PDF e suas evidências permanecem preservados para revisão do usuário. Isso não certifica fidelidade visual integral contra a fonte, editabilidade no Acrobat ou prontidão para gráfica.
- Nenhuma auditoria global preventiva está aberta; não refazer o export integral sem regressão concreta ou pedido.
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

## Limitações conhecidas, sem bloqueio para traduzir agora

- **P. 97:** algumas células agrupam vários parágrafos/list items num campo editável; continuam editáveis e salváveis como célula. Avaliar segmentação somente quando o trabalho real nessa página mostrar necessidade. Ver [auditoria de confiabilidade](project-progress/2026-10-09-editor-reliability-audit.md).
- **P. 84 e Note de tabela/raster p. 100:** `INCONCLUSIVE / PRESERVED`; não forçar classificação sem evidência nova. A ocorrência independente `action.exhaust` da p. 100 foi corrigida.
- **Páginas 1–48:** há revisões de escopos diferentes, não uma certificação global uniforme. Isso não impede a tradução manual atual.
- **Export:** o serviço assíncrono visual e o job 1–102 estão tecnicamente validados. A revisão visual final do usuário continua pendente. O piloto de impressão não equivale a PDF de gráfica, e Acrobat Pro ainda não foi usado para comprovar edição/salvamento/reabertura.
- O salvamento confirmado no Payload é a cópia sincronizada. O navegador mantém fallback local de traduções e molduras se a sincronização falhar; drafts ainda não salvos são estado de sessão. Consultar o toast do editor e o guia de workflow.

## Próximo passo seguro

Próximo gate: aguardar/recolher a revisão do PDF integral pelo usuário. Enquanto isso, trabalhar apenas em regressões concretas solicitadas; não reabrir mapper, auditorias globais, export integral ou holdouts sem evidência e autorização.

## Invariantes

- O PDF original é a referência de conteúdo EN e geometria fonte.
- Não alterar páginas 1–12, traduções existentes, Payload, sidecars ou geometria SOURCE sem escopo explícito.
- IDs persistentes representam unidades editoriais, não linhas físicas.
- Candidatos geométricos são evidência, não bugs nem correções automáticas.
- Viewer, persistência e export são verificações distintas; não declarar o livro inteiro aprovado a partir de uma amostra.
