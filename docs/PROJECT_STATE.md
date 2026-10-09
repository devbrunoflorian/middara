# Estado atual do projeto

**Atualizado:** 2026-10-09.

## Estado oficial

- **EDITOR READY WITH KNOWN NON-BLOCKING ISSUES.** O editor passou pelos testes e fluxos manuais registrados; limitações conhecidas estão abaixo.
- **MANUAL TRANSLATION WORKFLOW = COMPLETE.** A tradução manual está em andamento pelo usuário no Admin/RichSpanEditor.
- **TRANSLATION-FIRST / MAINTENANCE MODE.** Trabalhar em problemas concretos encontrados durante a tradução; não iniciar auditorias preventivas, tradução automática ou mudanças de conteúdo sem pedido.
- **GLOBAL EN AUDIT 49–102 = COMPLETE WITH DOCUMENTED INCONCLUSIVE HOLDOUTS.** P. 84 e Note raster/tabela p. 100 continuam inconclusivas e preservadas; não são defeitos confirmados.
- Nenhuma auditoria global preventiva está aberta. O export PT-BR integral não é o próximo gate atual.
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
- **Export final:** existem scripts de exportação de página e de livro completo, mas o PDF PT-BR completo não foi aceito como entrega final. O piloto de impressão também não equivale a PDF de gráfica. Retomar a validação quando houver um objetivo concreto de entrega; não é o gate atual da tradução.
- O salvamento confirmado no Payload é a cópia sincronizada. O navegador mantém fallback local de traduções e molduras se a sincronização falhar; drafts ainda não salvos são estado de sessão. Consultar o toast do editor e o guia de workflow.

## Próximo passo seguro

Continuar a tradução manual. Quando surgir um problema reproduzível, investigar a unidade afetada, corrigir a causa compartilhada quando cabível, validar uma ocorrência equivalente e retornar ao trabalho de tradução. Não reabrir mapper, auditorias globais ou holdouts sem evidência concreta e autorização.

## Invariantes

- O PDF original é a referência de conteúdo EN e geometria fonte.
- Não alterar páginas 1–12, traduções existentes, Payload, sidecars ou geometria SOURCE sem escopo explícito.
- IDs persistentes representam unidades editoriais, não linhas físicas.
- Candidatos geométricos são evidência, não bugs nem correções automáticas.
- Viewer, persistência e export são verificações distintas; não declarar o livro inteiro aprovado a partir de uma amostra.
